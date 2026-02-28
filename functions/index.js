/**
 * Firebase Cloud Functions for Competition App
 * Deploy with: firebase deploy --only functions
 * 
 * Prerequisites:
 * 1. cd functions && npm install
 * 2. firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Auto-deduct points for uncompleted tasks
 * Called by Super Admin or on schedule
 * 
 * Deduction = 20 points × number of team members
 */
exports.deductUncompletedTask = functions.https.onCall(async (data, context) => {
    // Verify caller is super_admin
    if (!context.auth || context.auth.token.role !== 'super_admin') {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only Super Admin can trigger deductions'
        );
    }

    const { taskId, teamId } = data;

    if (!taskId || !teamId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'taskId and teamId are required'
        );
    }

    // Get team member count
    const teamDoc = await db.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Team not found');
    }

    const memberCount = teamDoc.data().memberCount || 0;
    const deductionPoints = 20 * memberCount;

    // Record score deduction
    await db.collection('scores').add({
        teamId,
        taskId,
        points: deductionPoints,
        type: 'deduct',
        registeredBy: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        pendingSync: false,
    });

    // Update team total points
    await db.collection('teams').doc(teamId).update({
        totalPoints: admin.firestore.FieldValue.increment(-deductionPoints),
    });

    // Log the action
    await db.collection('logs').add({
        action: 'auto_deduct',
        userId: context.auth.uid,
        teamId,
        details: `Deducted ${deductionPoints} points (${memberCount} members × 20)`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        deducted: deductionPoints,
        members: memberCount,
    };
});

/**
 * Set custom claims for user roles
 * Called by Super Admin to assign roles
 */
exports.setUserRole = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'super_admin') {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only Super Admin can set user roles'
        );
    }

    const { userId, role, teamId } = data;
    const validRoles = ['super_admin', 'admin', 'leader', 'member'];

    if (!validRoles.includes(role)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid role. Must be one of: ' + validRoles.join(', ')
        );
    }

    const claims = { role };
    if (teamId) claims.teamId = teamId;

    await admin.auth().setCustomUserClaims(userId, claims);

    // Update Firestore user doc
    await db.collection('users').doc(userId).update({
        role,
        teamId: teamId || null,
    });

    return { success: true, userId, role };
});
