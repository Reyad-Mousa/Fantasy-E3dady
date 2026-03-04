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
const {
    onDocumentCreatedWithAuthContext,
    onDocumentDeletedWithAuthContext,
    onDocumentUpdatedWithAuthContext,
} = require('firebase-functions/v2/firestore');

admin.initializeApp();
const db = admin.firestore();

const VALID_ROLES = ['super_admin', 'admin', 'leader', 'member'];
const STAGE_NAMES = Object.freeze({
    grade7: 'أولى إعدادي',
    grade8: 'تانية إعدادي',
    grade9: 'تالتة إعدادي',
});

function asNonEmptyString(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function normalizeStageId(value) {
    const stageId = asNonEmptyString(value);
    if (!stageId) return null;
    return Object.prototype.hasOwnProperty.call(STAGE_NAMES, stageId) ? stageId : null;
}

function resolveStageName(stageId, explicitName) {
    const fromPayload = asNonEmptyString(explicitName);
    if (fromPayload) return fromPayload;
    if (!stageId) return null;
    return STAGE_NAMES[stageId] || null;
}

async function getTeamStage(teamId) {
    const normalizedTeamId = asNonEmptyString(teamId);
    if (!normalizedTeamId) return null;

    const teamSnap = await db.collection('teams').doc(normalizedTeamId).get();
    if (!teamSnap.exists) return null;

    return normalizeStageId(teamSnap.data()?.stageId);
}

async function resolveStageForUserDoc(userData) {
    const directStage = normalizeStageId(userData?.stageId);
    if (directStage) return directStage;

    const teamId = asNonEmptyString(userData?.teamId);
    if (!teamId) return null;

    return getTeamStage(teamId);
}

async function resolveActor(authId) {
    const normalizedAuthId = asNonEmptyString(authId);
    if (!normalizedAuthId) {
        return {
            actorId: null,
            actorName: 'System',
            actorEmail: null,
            actorRole: 'system',
        };
    }

    let actorName = null;
    let actorEmail = null;
    let actorRole = null;

    const actorDoc = await db.collection('users').doc(normalizedAuthId).get().catch(() => null);
    if (actorDoc?.exists) {
        const data = actorDoc.data() || {};
        actorName = asNonEmptyString(data.name);
        actorEmail = asNonEmptyString(data.email);
        actorRole = asNonEmptyString(data.role);
    }

    if (!actorName || !actorEmail) {
        const authUser = await admin.auth().getUser(normalizedAuthId).catch(() => null);
        if (authUser) {
            actorName = actorName || asNonEmptyString(authUser.displayName);
            actorEmail = actorEmail || asNonEmptyString(authUser.email);
        }
    }

    if (!actorName) {
        actorName = actorEmail || normalizedAuthId || 'غير معروف';
    }

    return {
        actorId: normalizedAuthId,
        actorName,
        actorEmail,
        actorRole,
    };
}

async function writeAuditLog({
    eventId,
    operation,
    entityType,
    entityId,
    entityName,
    stageId,
    authId,
    details,
}) {
    const actor = await resolveActor(authId);
    const normalizedStageId = normalizeStageId(stageId);
    const normalizedEntityName = asNonEmptyString(entityName) || 'غير معروف';
    const normalizedDetails = asNonEmptyString(details);

    const logId = asNonEmptyString(eventId)
        ? `audit_${eventId}_${entityType}_${operation}`
        : `audit_${Date.now()}_${entityType}_${operation}_${entityId}`;

    await db.collection('logs').doc(logId).set({
        kind: 'audit',
        operation,
        entityType,
        entityId,
        entityName: normalizedEntityName,
        stageId: normalizedStageId,
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorEmail: actor.actorEmail,
        actorRole: actor.actorRole,
        details: normalizedDetails || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

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

    const teamData = teamDoc.data() || {};
    const memberCount = Number(teamData.memberCount || 0);
    const stageId = normalizeStageId(teamData.stageId);
    const deductionPoints = 20 * memberCount;

    // Record score deduction
    await db.collection('scores').add({
        teamId,
        stageId,
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

    const actor = await resolveActor(context.auth.uid);

    // Log the action in unified structure
    await db.collection('logs').add({
        kind: 'system',
        operation: 'deduct',
        entityType: 'score',
        action: 'auto_deduct',
        entityId: `${teamId}:${taskId}`,
        entityName: asNonEmptyString(teamData.name) || 'فريق',
        stageId,
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorEmail: actor.actorEmail,
        actorRole: actor.actorRole,
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

    const payload = data || {};
    const userId = asNonEmptyString(payload.userId);
    const role = asNonEmptyString(payload.role);
    const requestedTeamId = asNonEmptyString(payload.teamId);
    const requestedStageId = normalizeStageId(payload.stageId);
    const requestedStageName = asNonEmptyString(payload.stageName);

    if (!userId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'userId is required'
        );
    }

    if (!role || !VALID_ROLES.includes(role)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid role. Must be one of: ' + VALID_ROLES.join(', ')
        );
    }

    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const currentUserData = userSnap.exists ? (userSnap.data() || {}) : {};

    let teamId = requestedTeamId ?? asNonEmptyString(currentUserData.teamId);
    let stageId = requestedStageId ?? normalizeStageId(currentUserData.stageId);
    let stageName = null;

    if (role === 'super_admin') {
        teamId = null;
        stageId = null;
        stageName = null;
    } else if (role === 'admin' || role === 'leader') {
        if (!stageId) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'stageId is required for admin/leader roles'
            );
        }
        if (role === 'admin') {
            teamId = null;
        }
        stageName = resolveStageName(stageId, requestedStageName || currentUserData.stageName);
    } else {
        stageName = stageId
            ? resolveStageName(stageId, requestedStageName || currentUserData.stageName)
            : null;
    }

    const authUser = await admin.auth().getUser(userId);
    const claims = { ...(authUser.customClaims || {}), role };
    if (teamId) claims.teamId = teamId;
    else delete claims.teamId;

    if (stageId) claims.stageId = stageId;
    else delete claims.stageId;

    if (stageName) claims.stageName = stageName;
    else delete claims.stageName;

    await admin.auth().setCustomUserClaims(userId, claims);

    const userDocPatch = {
        role,
        teamId: teamId || null,
        stageId: stageId || null,
        stageName: stageName || null,
    };

    if (userSnap.exists) {
        await userRef.update(userDocPatch);
    } else {
        await userRef.set(userDocPatch, { merge: true });
    }

    return {
        success: true,
        userId,
        role,
        teamId: teamId || null,
        stageId: stageId || null,
        stageName: stageName || null,
    };
});

exports.auditTeamCreated = onDocumentCreatedWithAuthContext('teams/{teamId}', async (event) => {
    const data = event.data?.data() || {};
    await writeAuditLog({
        eventId: event.id,
        operation: 'create',
        entityType: 'team',
        entityId: event.params.teamId,
        entityName: data.name,
        stageId: data.stageId,
        authId: event.authId,
    });
});

exports.auditTeamDeleted = onDocumentDeletedWithAuthContext('teams/{teamId}', async (event) => {
    const data = event.data?.data() || {};
    await writeAuditLog({
        eventId: event.id,
        operation: 'delete',
        entityType: 'team',
        entityId: event.params.teamId,
        entityName: data.name,
        stageId: data.stageId,
        authId: event.authId,
    });
});

exports.auditTaskCreated = onDocumentCreatedWithAuthContext('tasks/{taskId}', async (event) => {
    const data = event.data?.data() || {};
    await writeAuditLog({
        eventId: event.id,
        operation: 'create',
        entityType: 'task',
        entityId: event.params.taskId,
        entityName: data.title,
        stageId: data.stageId,
        authId: event.authId,
    });
});

exports.auditTaskArchivedAsDelete = onDocumentUpdatedWithAuthContext('tasks/{taskId}', async (event) => {
    const beforeData = event.data?.before?.data() || {};
    const afterData = event.data?.after?.data() || {};

    const beforeStatus = asNonEmptyString(beforeData.status) || 'active';
    const afterStatus = asNonEmptyString(afterData.status) || 'active';

    if (beforeStatus === 'archived' || afterStatus !== 'archived') return;

    await writeAuditLog({
        eventId: event.id,
        operation: 'delete',
        entityType: 'task',
        entityId: event.params.taskId,
        entityName: afterData.title || beforeData.title,
        stageId: afterData.stageId || beforeData.stageId,
        authId: event.authId,
        details: 'Task archived (logical delete)',
    });
});

exports.auditMemberCreated = onDocumentCreatedWithAuthContext('users/{userId}', async (event) => {
    const data = event.data?.data() || {};
    if (asNonEmptyString(data.role) !== 'member') return;

    const stageId = await resolveStageForUserDoc(data);
    const entityName = asNonEmptyString(data.name) || asNonEmptyString(data.email) || 'عضو';
    const teamId = asNonEmptyString(data.teamId);

    await writeAuditLog({
        eventId: event.id,
        operation: 'create',
        entityType: 'member',
        entityId: event.params.userId,
        entityName,
        stageId,
        authId: event.authId,
        details: teamId ? `teamId: ${teamId}` : null,
    });
});

exports.auditMemberDeleted = onDocumentDeletedWithAuthContext('users/{userId}', async (event) => {
    const data = event.data?.data() || {};
    if (asNonEmptyString(data.role) !== 'member') return;

    const stageId = await resolveStageForUserDoc(data);
    const entityName = asNonEmptyString(data.name) || asNonEmptyString(data.email) || 'عضو';
    const teamId = asNonEmptyString(data.teamId);

    await writeAuditLog({
        eventId: event.id,
        operation: 'delete',
        entityType: 'member',
        entityId: event.params.userId,
        entityName,
        stageId,
        authId: event.authId,
        details: teamId ? `teamId: ${teamId}` : null,
    });
});
