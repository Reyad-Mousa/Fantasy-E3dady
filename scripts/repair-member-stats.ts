import * as fs from 'fs';
import * as path from 'path';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

type StageId = 'grade7' | 'grade8' | 'grade9';

interface RepairRow {
  docId: string;
  action: 'repairable' | 'already_valid' | 'skipped_unrepairable';
  reason: string;
  before: {
    memberKey: string | null;
    teamId: string | null;
    memberName: string | null;
    stageId: StageId | null;
    totalPoints: number;
  };
  patch?: Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStageId(value: unknown): StageId | null {
  if (value === 'grade7' || value === 'grade8' || value === 'grade9') return value;
  return null;
}

function parseLegacyMemberStatId(docId: string): { teamId: string; memberName: string | null } | null {
  const match = /^m:(team_\d+)_(.+)$/.exec(docId);
  if (!match) return null;
  const memberName = match[2].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    teamId: match[1],
    memberName: memberName || null,
  };
}

function ensureServiceAccount(): ServiceAccount {
  const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error('serviceAccountKey.json not found in project root');
  }
  return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')) as ServiceAccount;
}

function initFirebaseAdmin() {
  if (getApps().length > 0) return;
  initializeApp({
    credential: cert(ensureServiceAccount()),
  });
}

async function run() {
  const apply = process.argv.includes('--apply');
  const mode = apply ? 'apply' : 'dry-run';

  initFirebaseAdmin();
  const db = getFirestore();

  const [statsSnap, teamsSnap] = await Promise.all([
    db.collection('member_stats').get(),
    db.collection('teams').get(),
  ]);

  const teamsById = new Map<string, { stageId: StageId | null }>();
  teamsSnap.forEach((teamDoc) => {
    const data = teamDoc.data() || {};
    teamsById.set(teamDoc.id, {
      stageId: normalizeStageId(data.stageId),
    });
  });

  const rows: RepairRow[] = [];
  const repairable: Array<{ docId: string; patch: Record<string, unknown> }> = [];

  for (const docSnap of statsSnap.docs) {
    const data = docSnap.data() || {};
    const docId = docSnap.id;
    const parsedLegacy = parseLegacyMemberStatId(docId);

    const existingMemberKey = asNonEmptyString(data.memberKey);
    const existingTeamId = asNonEmptyString(data.teamId);
    const existingMemberName = asNonEmptyString(data.memberName);
    const existingStageId = normalizeStageId(data.stageId);
    const totalPointsRaw = Number(data.totalPoints || 0);
    const totalPoints = Number.isFinite(totalPointsRaw) ? totalPointsRaw : 0;

    const resolvedTeamId = existingTeamId || parsedLegacy?.teamId || null;
    const resolvedMemberName = existingMemberName || parsedLegacy?.memberName || null;
    const resolvedStageId =
      existingStageId ||
      (resolvedTeamId ? (teamsById.get(resolvedTeamId)?.stageId ?? null) : null);

    const patch: Record<string, unknown> = {};
    if (!existingMemberKey) patch.memberKey = docId;
    if (!existingTeamId && resolvedTeamId) patch.teamId = resolvedTeamId;
    if (!existingMemberName && resolvedMemberName) patch.memberName = resolvedMemberName;
    if (!existingStageId && resolvedStageId) patch.stageId = resolvedStageId;

    const unresolvedFields: string[] = [];
    if (!resolvedTeamId) unresolvedFields.push('teamId');
    if (!resolvedMemberName) unresolvedFields.push('memberName');
    if (!resolvedStageId) unresolvedFields.push('stageId');

    const before = {
      memberKey: existingMemberKey,
      teamId: existingTeamId,
      memberName: existingMemberName,
      stageId: existingStageId,
      totalPoints,
    };

    if (unresolvedFields.length > 0) {
      rows.push({
        docId,
        action: 'skipped_unrepairable',
        reason: `missing: ${unresolvedFields.join(', ')}`,
        before,
        patch: Object.keys(patch).length > 0 ? patch : undefined,
      });
      continue;
    }

    if (Object.keys(patch).length === 0) {
      rows.push({
        docId,
        action: 'already_valid',
        reason: 'no missing fields',
        before,
      });
      continue;
    }

    repairable.push({ docId, patch });
    rows.push({
      docId,
      action: 'repairable',
      reason: 'will patch missing metadata',
      before,
      patch,
    });
  }

  let applied = 0;
  if (apply && repairable.length > 0) {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < repairable.length; i += CHUNK_SIZE) {
      const batch = db.batch();
      const chunk = repairable.slice(i, i + CHUNK_SIZE);
      chunk.forEach((item) => {
        batch.set(db.collection('member_stats').doc(item.docId), item.patch, { merge: true });
      });
      await batch.commit();
      applied += chunk.length;
    }
  }

  const report = {
    mode,
    generatedAt: new Date().toISOString(),
    totals: {
      scanned: rows.length,
      repairable: repairable.length,
      applied,
      alreadyValid: rows.filter((row) => row.action === 'already_valid').length,
      skippedUnrepairable: rows.filter((row) => row.action === 'skipped_unrepairable').length,
    },
    repairableRows: rows.filter((row) => row.action === 'repairable'),
    skippedRows: rows.filter((row) => row.action === 'skipped_unrepairable'),
  };

  const outputDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(outputDir, `repair-member-stats-report-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`repair-member-stats (${mode})`);
  console.log(`Scanned: ${report.totals.scanned}`);
  console.log(`Repairable: ${report.totals.repairable}`);
  console.log(`Applied: ${report.totals.applied}`);
  console.log(`Already valid: ${report.totals.alreadyValid}`);
  console.log(`Skipped (unrepairable): ${report.totals.skippedUnrepairable}`);
  console.log(`Report: ${reportPath}`);
}

run().catch((err) => {
  console.error('repair-member-stats failed:', err);
  process.exit(1);
});
