import * as fs from 'fs';
import * as path from 'path';
import { getApps, initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

type ScopedRole = 'admin' | 'leader';
type StageId = 'grade7' | 'grade8' | 'grade9';

const STAGE_NAMES: Record<StageId, string> = {
  grade7: 'أولى إعدادي',
  grade8: 'تانية إعدادي',
  grade9: 'تالتة إعدادي',
};

type SyncAction =
  | 'updated'
  | 'unchanged'
  | 'missing_doc_stage'
  | 'missing_auth'
  | 'invalid_doc_role';

interface ScopedUser {
  uid: string;
  email: string;
  name: string;
  role: ScopedRole | null;
  stageId: StageId | null;
  stageName: string | null;
}

interface SyncRow {
  uid: string;
  email: string;
  name: string;
  role: string;
  docStageId: string;
  docStageName: string;
  claimRole: string;
  claimStageId: string;
  claimStageName: string;
  nextStageName: string;
  action: SyncAction;
  reason: string;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStageId(value: unknown): StageId | null {
  const stageId = asNonEmptyString(value);
  if (!stageId) return null;
  return stageId in STAGE_NAMES ? (stageId as StageId) : null;
}

function normalizeScopedRole(value: unknown): ScopedRole | null {
  return value === 'admin' || value === 'leader' ? value : null;
}

function resolveStageName(stageId: StageId | null, explicitName: unknown): string | null {
  const fromExplicit = asNonEmptyString(explicitName);
  if (fromExplicit) return fromExplicit;
  return stageId ? STAGE_NAMES[stageId] : null;
}

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function toCsv(rows: SyncRow[]): string {
  const headers: Array<keyof SyncRow> = [
    'uid',
    'email',
    'name',
    'role',
    'docStageId',
    'docStageName',
    'claimRole',
    'claimStageId',
    'claimStageName',
    'nextStageName',
    'action',
    'reason',
  ];
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
  initializeApp({ credential: cert(serviceAccount) });
}

async function loadScopedUsers(db: Firestore): Promise<ScopedUser[]> {
  const snap = await db.collection('users').where('role', 'in', ['admin', 'leader']).get();
  return snap.docs
    .map((docSnap) => {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        email: asNonEmptyString(data.email) ?? '',
        name: asNonEmptyString(data.name) ?? '',
        role: normalizeScopedRole(data.role),
        stageId: normalizeStageId(data.stageId),
        stageName: asNonEmptyString(data.stageName),
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email, 'en'));
}

async function loadAuthUser(auth: Auth, uid: string): Promise<UserRecord | null> {
  return auth.getUser(uid).catch((err: any) => {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  });
}

async function run() {
  const applyChanges = process.argv.includes('--apply');
  initFirebase();
  const db = getFirestore();
  const auth = getAuth();
  const outputDir = path.join(process.cwd(), 'scripts', 'output');

  console.log(`\n🚀 sync-user-stage-claims (${applyChanges ? 'APPLY' : 'DRY-RUN'})`);
  console.log('═'.repeat(60));

  const users = await loadScopedUsers(db);
  const rows: SyncRow[] = [];
  let updated = 0;
  let unchanged = 0;
  let missingDocStage = 0;
  let missingAuth = 0;
  let invalidDocRole = 0;

  for (const user of users) {
    if (!user.role) {
      invalidDocRole++;
      rows.push({
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: '',
        docStageId: user.stageId ?? '',
        docStageName: user.stageName ?? '',
        claimRole: '',
        claimStageId: '',
        claimStageName: '',
        nextStageName: '',
        action: 'invalid_doc_role',
        reason: 'Role is not admin/leader in users doc',
      });
      continue;
    }

    if (!user.stageId) {
      missingDocStage++;
      rows.push({
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
        docStageId: '',
        docStageName: user.stageName ?? '',
        claimRole: '',
        claimStageId: '',
        claimStageName: '',
        nextStageName: '',
        action: 'missing_doc_stage',
        reason: 'users/{uid}.stageId is missing',
      });
      continue;
    }

    const authUser = await loadAuthUser(auth, user.uid);
    if (!authUser) {
      missingAuth++;
      rows.push({
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
        docStageId: user.stageId,
        docStageName: user.stageName ?? '',
        claimRole: '',
        claimStageId: '',
        claimStageName: '',
        nextStageName: '',
        action: 'missing_auth',
        reason: 'Auth user not found',
      });
      continue;
    }

    const customClaims = authUser.customClaims || {};
    const claimRole = asNonEmptyString(customClaims.role);
    const claimStageId = asNonEmptyString(customClaims.stageId);
    const claimStageName = asNonEmptyString(customClaims.stageName);
    const nextStageName = resolveStageName(user.stageId, user.stageName);

    const needsUpdate =
      claimRole !== user.role ||
      claimStageId !== user.stageId ||
      claimStageName !== nextStageName;

    if (needsUpdate && applyChanges) {
      const nextClaims = { ...customClaims, role: user.role, stageId: user.stageId, stageName: nextStageName };
      await auth.setCustomUserClaims(user.uid, nextClaims);
      updated++;
    }

    if (!needsUpdate) {
      unchanged++;
    }

    rows.push({
      uid: user.uid,
      email: user.email,
      name: user.name,
      role: user.role,
      docStageId: user.stageId,
      docStageName: user.stageName ?? '',
      claimRole: claimRole ?? '',
      claimStageId: claimStageId ?? '',
      claimStageName: claimStageName ?? '',
      nextStageName: nextStageName ?? '',
      action: needsUpdate ? 'updated' : 'unchanged',
      reason: needsUpdate
        ? (applyChanges ? 'Claims updated' : 'Claims update required')
        : 'Already in sync',
    });
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportJsonPath = path.join(outputDir, `sync-user-stage-claims-report-${stamp}.json`);
  const reportCsvPath = path.join(outputDir, `sync-user-stage-claims-report-${stamp}.csv`);

  const summary = {
    totalScopedUsers: users.length,
    updatesNeeded: rows.filter((r) => r.action === 'updated').length,
    updated,
    unchanged,
    missingDocStage,
    missingAuth,
    invalidDocRole,
  };

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    mode: applyChanges ? 'apply' : 'dry-run',
    summary,
    rows,
    outputFiles: {
      reportJsonPath,
      reportCsvPath,
    },
  };

  fs.writeFileSync(reportJsonPath, JSON.stringify(reportPayload, null, 2), 'utf8');
  fs.writeFileSync(reportCsvPath, toCsv(rows), 'utf8');

  console.log(`Scoped users:       ${summary.totalScopedUsers}`);
  console.log(`Updates needed:     ${summary.updatesNeeded}`);
  console.log(`Updated now:        ${summary.updated}`);
  console.log(`Unchanged:          ${summary.unchanged}`);
  console.log(`Missing doc stage:  ${summary.missingDocStage}`);
  console.log(`Missing auth user:  ${summary.missingAuth}`);
  console.log(`Invalid doc role:   ${summary.invalidDocRole}`);
  console.log('─'.repeat(60));
  console.log(`Report JSON: ${reportJsonPath}`);
  console.log(`Report CSV:  ${reportCsvPath}`);
  console.log('═'.repeat(60));

  if (!applyChanges) {
    console.log('\nℹ️ Dry-run only. Use --apply to write claims.');
  } else {
    console.log('\n✅ Claims sync completed.');
  }
}

run().catch((err) => {
  console.error('❌ sync-user-stage-claims failed:', err);
  process.exit(1);
});
