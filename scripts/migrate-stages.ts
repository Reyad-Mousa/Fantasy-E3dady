import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// Initialize Firebase Admin
const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ serviceAccountKey.json not found!');
    console.error('   Please place it in the root folder before running this script.');
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// 1. Teams: Add stageId to teams without it
async function migrateTeams() {
    console.log('\n--- 🚀 Migrating Teams ---');
    let count = 0;
    const teamsSnapshot = await db.collection('teams').get();

    for (const doc of teamsSnapshot.docs) {
        const team = doc.data();
        if (!team.stageId) {
            await doc.ref.update({
                stageId: 'grade7',
                stageName: 'أولى إعدادي'
            });
            console.log(`✅ Updated team: ${team.name} (${doc.id}) -> grade7`);
            count++;
        }
    }
    console.log(`📦 Teams migrated: ${count}`);
}

// 2. Users: Add stageId to leaders/admins, null for super_admins
async function migrateUsers() {
    console.log('\n--- 🚀 Migrating Users ---');
    let count = 0;
    const usersSnapshot = await db.collection('users').get();

    for (const doc of usersSnapshot.docs) {
        const user = doc.data();
        const role = user.role;

        // Skip if they already have stageId properly assigned 
        // (unless it's super_admin, we explicitly want null)
        if (role === 'super_admin') {
            await doc.ref.update({
                stageId: null,
                stageName: null
            });

            const userAuth = await admin.auth().getUser(doc.id).catch(() => null);
            if (userAuth) {
                const claims: any = userAuth.customClaims || {};
                claims.stageId = null;
                claims.stageName = null;
                await admin.auth().setCustomUserClaims(doc.id, claims);
                console.log(`✅ Updated super_admin: ${user.email} -> stageId: null`);
            }
            count++;

        } else if (role === 'admin' || role === 'leader') {
            if (!user.stageId) {
                await doc.ref.update({
                    stageId: 'grade7',
                    stageName: 'أولى إعدادي'
                });

                const userAuth = await admin.auth().getUser(doc.id).catch(() => null);
                if (userAuth) {
                    const claims: any = userAuth.customClaims || {};
                    claims.stageId = 'grade7';
                    claims.stageName = 'أولى إعدادي';
                    await admin.auth().setCustomUserClaims(doc.id, claims);
                    console.log(`✅ Updated ${role}: ${user.email} -> grade7`);
                }
                count++;
            }
        }
    }
    console.log(`👤 Users migrated: ${count}`);
}

async function run() {
    try {
        await migrateTeams();
        await migrateUsers();

        console.log('\n=============================================');
        console.log('🎉 Migrations Completed Successfully!');
        console.log('⚠️  IMPORTANT: Please manually update any extra accounts using the Firebase Firestore Console if they belong to grade8 or grade9.');
        console.log('=============================================\n');
    } catch (err: any) {
        console.error('❌ Migration failed:', err.message);
    }
}

run();
