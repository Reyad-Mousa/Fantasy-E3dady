import * as fs from 'fs';
import * as path from 'path';
import { getApps, initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

type StageId = 'grade7' | 'grade8' | 'grade9';

interface StageConfig {
  id: StageId;
  name: string;
}

interface LeaderRecord {
  uid: string;
  email: string;
  name: string;
  role: string;
  stageId?: string | null;
  stageName?: string | null;
  sortOrder: number;
}

const STAGES: StageConfig[] = [
  { id: 'grade7', name: 'أولى إعدادي' },
  { id: 'grade8', name: 'تانية إعدادي' },
  { id: 'grade9', name: 'تالتة إعدادي' },
];

const KEEP_PER_STAGE = 5;
const TOTAL_KEEP = STAGES.length * KEEP_PER_STAGE;

function parseSortOrder(email: string): number {
  const m = email.match(/leader(\d+)@/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]);
}

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function toCsv(rows: Array<Record<string, string | number | null | undefined>>, headers: string[]): string {
  const headerLine = headers.map(csvEscape).join(',');
  const lines = rows.map((row) => headers.map((h) => csvEscape(row[h])).join(','));
  return [headerLine, ...lines].join('\n');
}

function ensureServiceAccount(): ServiceAccount {
  const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
  if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ serviceAccountKey.json not found in project root');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
}

function initFirebase() {
  if (getApps().length > 0) return;
  const serviceAccount = ensureServiceAccount();
  initializeApp({
    credential: cert(serviceAccount),
  });
}

async function loadLeaders(db: Firestore): Promise<LeaderRecord[]> {
  const snap = await db.collection('users').where('role', '==', 'leader').get();
  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    const email = String(data.email || '');
    return {
      uid: docSnap.id,
      email,
      name: String(data.name || ''),
      role: String(data.role || ''),
      stageId: (data.stageId as string | null | undefined) ?? null,
      stageName: (data.stageName as string | null | undefined) ?? null,
      sortOrder: parseSortOrder(email),
    };
  }).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.email.localeCompare(b.email, 'en');
  });
}

function buildAssignments(leaders: LeaderRecord[]) {
  const kept = leaders.slice(0, TOTAL_KEEP);
  const deleted = leaders.slice(TOTAL_KEEP);
  const stageAssignments = new Map<string, StageConfig>();

  for (let i = 0; i < kept.length; i++) {
    const stageIndex = Math.floor(i / KEEP_PER_STAGE);
    const stage = STAGES[stageIndex];
    stageAssignments.set(kept[i].uid, stage);
  }

  return { kept, deleted, stageAssignments };
}

async function updateKeptLeaders(
  db: Firestore,
  auth: Auth,
  kept: LeaderRecord[],
  stageAssignments: Map<string, StageConfig>,
  applyChanges: boolean
) {
  const updated: string[] = [];

  for (const leader of kept) {
    const stage = stageAssignments.get(leader.uid);
    if (!stage) continue;

    if (!applyChanges) {
      updated.push(leader.uid);
      continue;
    }

    await db.collection('users').doc(leader.uid).update({
      role: 'leader',
      stageId: stage.id,
      stageName: stage.name,
    });

    const authUser = await auth.getUser(leader.uid).catch(() => null);
    if (authUser) {
      const claims = authUser.customClaims || {};
      await auth.setCustomUserClaims(leader.uid, {
        ...claims,
        role: 'leader',
        stageId: stage.id,
        stageName: stage.name,
      });
    }

    updated.push(leader.uid);
  }

  return updated;
}

async function deleteExtraLeaders(
  db: Firestore,
  auth: Auth,
  deleted: LeaderRecord[],
  applyChanges: boolean
) {
  const deletedUids: string[] = [];

  for (const leader of deleted) {
    if (!applyChanges) {
      deletedUids.push(leader.uid);
      continue;
    }

    await db.collection('users').doc(leader.uid).delete();
    await auth.deleteUser(leader.uid).catch((err: any) => {
      if (err?.code !== 'auth/user-not-found') throw err;
    });
    deletedUids.push(leader.uid);
  }

  return deletedUids;
}

async function unassignDeletedLeadersFromTeams(
  db: Firestore,
  deletedUids: string[],
  applyChanges: boolean
) {
  if (deletedUids.length === 0) return [] as string[];

  const teamsSnap = await db.collection('teams').get();
  const impacted = teamsSnap.docs.filter((d) => deletedUids.includes(String(d.data().leaderId || '')));
  const impactedIds = impacted.map((d) => d.id);

  if (applyChanges) {
    for (const teamDoc of impacted) {
      await teamDoc.ref.update({ leaderId: '' });
    }
  }

  return impactedIds;
}

function writeOutputFiles(
  outputDir: string,
  leaders: LeaderRecord[],
  kept: LeaderRecord[],
  deleted: LeaderRecord[],
  stageAssignments: Map<string, StageConfig>,
  teamsUnassigned: string[],
  applyChanges: boolean
) {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const backupJsonPath = path.join(outputDir, `leaders-backup-${stamp}.json`);
  const backupCsvPath = path.join(outputDir, `leaders-backup-${stamp}.csv`);
  const reportJsonPath = path.join(outputDir, `leaders-report-${stamp}.json`);

  const backupPayload = {
    generatedAt: new Date().toISOString(),
    mode: applyChanges ? 'apply' : 'dry-run',
    totalLeaders: leaders.length,
    leaders,
  };
  fs.writeFileSync(backupJsonPath, JSON.stringify(backupPayload, null, 2), 'utf8');

  const csvRows = leaders.map((l) => {
    const stage = stageAssignments.get(l.uid);
    return {
      uid: l.uid,
      email: l.email,
      name: l.name,
      currentStageId: l.stageId ?? '',
      currentStageName: l.stageName ?? '',
      action: kept.some((k) => k.uid === l.uid) ? 'keep' : 'delete',
      targetStageId: stage?.id ?? '',
      targetStageName: stage?.name ?? '',
    };
  });
  fs.writeFileSync(
    backupCsvPath,
    toCsv(csvRows, ['uid', 'email', 'name', 'currentStageId', 'currentStageName', 'action', 'targetStageId', 'targetStageName']),
    'utf8'
  );

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    mode: applyChanges ? 'apply' : 'dry-run',
    summary: {
      kept: kept.length,
      deleted: deleted.length,
      updated: kept.length,
      teams_unassigned: teamsUnassigned.length,
    },
    stageCounts: STAGES.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      kept: kept.filter((k) => stageAssignments.get(k.uid)?.id === stage.id).length,
    })),
    kept: kept.map((k) => ({
      uid: k.uid,
      email: k.email,
      targetStageId: stageAssignments.get(k.uid)?.id ?? '',
      targetStageName: stageAssignments.get(k.uid)?.name ?? '',
    })),
    deleted: deleted.map((d) => ({ uid: d.uid, email: d.email })),
    teamsUnassigned,
    outputFiles: {
      backupJsonPath,
      backupCsvPath,
      reportJsonPath,
    },
  };
  fs.writeFileSync(reportJsonPath, JSON.stringify(reportPayload, null, 2), 'utf8');

  return { backupJsonPath, backupCsvPath, reportJsonPath };
}

async function run() {
  const applyChanges = process.argv.includes('--apply');
  initFirebase();
  const db = getFirestore();
  const auth = getAuth();
  const outputDir = path.join(process.cwd(), 'scripts', 'output');

  console.log(`\n🚀 enforce-stage-leaders (${applyChanges ? 'APPLY' : 'DRY-RUN'})`);
  console.log('═'.repeat(60));

  const leaders = await loadLeaders(db);
  const { kept, deleted, stageAssignments } = buildAssignments(leaders);

  if (leaders.length < TOTAL_KEEP) {
    console.warn(`⚠️ Leaders found (${leaders.length}) أقل من المطلوب (${TOTAL_KEEP})`);
  }

  const updated = await updateKeptLeaders(db, auth, kept, stageAssignments, applyChanges);
  const deletedUids = await deleteExtraLeaders(db, auth, deleted, applyChanges);
  const teamsUnassigned = await unassignDeletedLeadersFromTeams(db, deletedUids, applyChanges);

  const files = writeOutputFiles(
    outputDir,
    leaders,
    kept,
    deleted,
    stageAssignments,
    teamsUnassigned,
    applyChanges
  );

  console.log(`Leaders total:     ${leaders.length}`);
  console.log(`Kept:              ${kept.length}`);
  console.log(`Deleted:           ${deleted.length}`);
  console.log(`Updated:           ${updated.length}`);
  console.log(`Teams unassigned:  ${teamsUnassigned.length}`);
  console.log('─'.repeat(60));
  for (const stage of STAGES) {
    const count = kept.filter((k) => stageAssignments.get(k.uid)?.id === stage.id).length;
    console.log(`${stage.id} (${stage.name}): ${count} قائد`);
  }
  console.log('─'.repeat(60));
  console.log(`Backup JSON: ${files.backupJsonPath}`);
  console.log(`Backup CSV:  ${files.backupCsvPath}`);
  console.log(`Report JSON: ${files.reportJsonPath}`);
  console.log('═'.repeat(60));

  if (!applyChanges) {
    console.log('\nℹ️ Dry-run only. Use --apply to execute changes.');
  } else {
    console.log('\n✅ Changes applied successfully.');
  }
}

run().catch((err) => {
  console.error('❌ enforce-stage-leaders failed:', err);
  process.exit(1);
});
