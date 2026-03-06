/**
 * scoresService.ts — All score registration Firebase operations.
 *
 * Extracted from ScoreRegistration.tsx and TasksPage.tsx to centralise
 * Firestore writes for scores, team totals, and member_stats.
 */

import {
    addDoc,
    collection,
    doc,
    increment,
    serverTimestamp,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { addPendingScore } from './offlineDb';
import { isOnline } from './syncService';
import { logActivity } from './activityLogger';

// ── Types ──────────────────────────────────────────────────────────────────

type TargetType = 'team' | 'member';

export interface MemberTarget {
    key: string;
    userId: string | null;
    name: string;
}

export interface TeamScorePayload {
    teamId: string;
    taskId: string;
    points: number;
    teamPoints: number;
    scoreType: 'earn' | 'deduct';
    source: 'team' | 'leader';
    registeredBy: string;
    registeredByName: string;
    stageId: string | null;
    teamName?: string | null;
    taskTitle?: string | null;
    actorRole?: string | null;
    members: MemberTarget[];
}

export interface MemberScorePayload {
    teamId: string;
    taskId: string;
    points: number;
    scoreType: 'earn' | 'deduct';
    source: 'team' | 'leader';
    registeredBy: string;
    registeredByName: string;
    stageId: string | null;
    teamName?: string | null;
    taskTitle?: string | null;
    actorRole?: string | null;
    members: MemberTarget[];
}

export interface ScoreResult {
    successCount: number;
    failedCount: number;
    hasPermissionDenied: boolean;
    offline: boolean;
    perMemberShare?: number;
}

// ── Team Score Registration ────────────────────────────────────────────────

export async function registerTeamScore(payload: TeamScorePayload): Promise<ScoreResult> {
    const memberCount = payload.members.length;
    const multiplier = memberCount > 0 ? memberCount : 1;
    const basePoints = Math.abs(payload.points) * multiplier;
    const bonusPoints = Math.abs(payload.teamPoints);
    const totalTeamPoints = basePoints + bonusPoints;
    const totalTeamPointChange = payload.scoreType === 'earn' ? totalTeamPoints : -totalTeamPoints;

    const scoreData = {
        teamId: payload.teamId,
        taskId: payload.taskId,
        points: totalTeamPoints,
        type: payload.scoreType,
        targetType: 'team' as TargetType,
        source: payload.source,
        registeredBy: payload.registeredBy,
        registeredByName: payload.registeredByName,
        stageId: payload.stageId,
        memberKey: null,
        memberUserId: null,
        memberName: null,
        applyToTeamTotal: true,
        timestamp: Date.now(),
    };

    if (!isOnline()) {
        await addPendingScore(scoreData);
        return { successCount: 0, failedCount: 0, hasPermissionDenied: false, offline: true };
    }

    // 1. Write score document
    await addDoc(collection(db, 'scores'), {
        ...scoreData,
        timestamp: serverTimestamp(),
        syncedAt: serverTimestamp(),
        pendingSync: false,
    });

    // 2. Update team total
    await updateDoc(doc(db, 'teams', payload.teamId), {
        totalPoints: increment(totalTeamPointChange),
    });

    // 3. Log activity
    logActivity({
        kind: 'score',
        teamId: payload.teamId,
        teamName: payload.teamName,
        taskId: payload.taskId,
        taskTitle: payload.taskTitle,
        points: totalTeamPoints,
        scoreType: payload.scoreType,
        targetType: 'team',
        stageId: payload.stageId,
        actorId: payload.registeredBy,
        actorName: payload.registeredByName,
        actorRole: payload.actorRole,
    });

    // 4. Distribute to members
    if (memberCount > 0 && totalTeamPoints > 0) {
        const perMemberShare = totalTeamPoints / memberCount;
        const perMemberChange = payload.scoreType === 'earn' ? perMemberShare : -perMemberShare;

        const memberResults = await Promise.allSettled(
            payload.members.map(async (member) => {
                await addDoc(collection(db, 'scores'), {
                    teamId: payload.teamId,
                    taskId: payload.taskId,
                    points: perMemberShare,
                    type: payload.scoreType,
                    targetType: 'member',
                    source: payload.source,
                    registeredBy: payload.registeredBy,
                    registeredByName: payload.registeredByName,
                    stageId: payload.stageId,
                    memberKey: member.key,
                    memberUserId: member.userId,
                    memberName: member.name,
                    applyToTeamTotal: false,
                    timestamp: serverTimestamp(),
                    syncedAt: serverTimestamp(),
                    pendingSync: false,
                });

                await setDoc(doc(db, 'member_stats', member.key), {
                    memberKey: member.key,
                    memberUserId: member.userId,
                    memberName: member.name,
                    teamId: payload.teamId,
                    stageId: payload.stageId,
                    totalPoints: increment(perMemberChange),
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            })
        );

        const failedCount = memberResults.filter(r => r.status === 'rejected').length;
        memberResults.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.error(`member_stats failed [${payload.members[i]?.key}]:`, (r as PromiseRejectedResult).reason);
            }
        });

        return {
            successCount: memberCount - failedCount,
            failedCount,
            hasPermissionDenied: false,
            offline: false,
            perMemberShare: Math.round(perMemberShare),
        };
    }

    return { successCount: 0, failedCount: 0, hasPermissionDenied: false, offline: false };
}

// ── Multi-Member Score Registration ────────────────────────────────────────

export async function registerMemberScores(payload: MemberScorePayload): Promise<ScoreResult> {
    const pointChange = payload.scoreType === 'earn'
        ? Math.abs(payload.points)
        : -Math.abs(payload.points);

    if (!isOnline()) {
        for (const member of payload.members) {
            await addPendingScore({
                teamId: payload.teamId,
                taskId: payload.taskId,
                points: Math.abs(payload.points),
                type: payload.scoreType,
                targetType: 'member',
                source: payload.source,
                registeredBy: payload.registeredBy,
                registeredByName: payload.registeredByName,
                stageId: payload.stageId,
                memberKey: member.key,
                memberUserId: member.userId,
                memberName: member.name,
                applyToTeamTotal: true,
                timestamp: Date.now(),
            });
        }
        return { successCount: 0, failedCount: 0, hasPermissionDenied: false, offline: true };
    }

    const results = await Promise.allSettled(
        payload.members.map(async (member) => {
            await addDoc(collection(db, 'scores'), {
                teamId: payload.teamId,
                taskId: payload.taskId,
                points: Math.abs(payload.points),
                type: payload.scoreType,
                targetType: 'member',
                source: payload.source,
                registeredBy: payload.registeredBy,
                registeredByName: payload.registeredByName,
                stageId: payload.stageId,
                memberKey: member.key,
                memberUserId: member.userId,
                memberName: member.name,
                applyToTeamTotal: true,
                timestamp: serverTimestamp(),
                syncedAt: serverTimestamp(),
                pendingSync: false,
            });

            await setDoc(doc(db, 'member_stats', member.key), {
                memberKey: member.key,
                memberUserId: member.userId,
                memberName: member.name,
                teamId: payload.teamId,
                stageId: payload.stageId,
                totalPoints: increment(pointChange),
                updatedAt: serverTimestamp(),
            }, { merge: true });

            logActivity({
                kind: 'score',
                teamId: payload.teamId,
                teamName: payload.teamName,
                taskId: payload.taskId,
                taskTitle: payload.taskTitle,
                points: Math.abs(payload.points),
                scoreType: payload.scoreType,
                targetType: 'member',
                memberKey: member.key,
                memberUserId: member.userId,
                memberName: member.name,
                stageId: payload.stageId,
                actorId: payload.registeredBy,
                actorName: payload.registeredByName,
                actorRole: payload.actorRole,
            });
        })
    );

    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    const failedCount = failures.length;
    const successCount = payload.members.length - failedCount;

    // Update team total once for all successful member scores
    if (successCount > 0) {
        await updateDoc(doc(db, 'teams', payload.teamId), {
            totalPoints: increment(pointChange * successCount),
        });
    }

    const hasPermissionDenied = failures.some(r =>
        r.reason &&
        typeof r.reason === 'object' &&
        'code' in r.reason &&
        (r.reason as { code?: unknown }).code === 'permission-denied'
    );

    return {
        successCount,
        failedCount,
        hasPermissionDenied,
        offline: false,
    };
}

// ── Single Member Score (attendance) ───────────────────────────────────────

export interface SingleMemberScorePayload {
    teamId: string;
    taskId: string;
    points: number;
    scoreType: 'earn' | 'deduct';
    source: 'team' | 'leader';
    registeredBy: string;
    registeredByName: string;
    stageId: string | null;
    memberKey: string;
    memberUserId: string | null;
    memberName: string;
    customNote?: string | null;
    teamName?: string | null;
    taskTitle?: string | null;
    actorRole?: string | null;
    applyToTeamTotal?: boolean;
}

export async function registerSingleMemberScore(payload: SingleMemberScorePayload): Promise<void> {
    const pointChange = payload.scoreType === 'earn'
        ? Math.abs(payload.points)
        : -Math.abs(payload.points);
    const applyToTeamTotal = payload.applyToTeamTotal ?? true;

    const scoreData = {
        teamId: payload.teamId,
        taskId: payload.taskId,
        points: Math.abs(payload.points),
        type: payload.scoreType,
        targetType: 'member' as TargetType,
        source: payload.source,
        registeredBy: payload.registeredBy,
        registeredByName: payload.registeredByName,
        stageId: payload.stageId,
        memberKey: payload.memberKey,
        memberUserId: payload.memberUserId,
        memberName: payload.memberName,
        customNote: payload.customNote ?? null,
        applyToTeamTotal,
        timestamp: Date.now(),
    };

    if (!isOnline()) {
        await addPendingScore(scoreData);
        return;
    }

    await addDoc(collection(db, 'scores'), {
        ...scoreData,
        timestamp: serverTimestamp(),
        syncedAt: serverTimestamp(),
        pendingSync: false,
    });

    // Update member_stats
    await setDoc(doc(db, 'member_stats', payload.memberKey), {
        memberKey: payload.memberKey,
        memberUserId: payload.memberUserId,
        memberName: payload.memberName,
        teamId: payload.teamId,
        stageId: payload.stageId,
        totalPoints: increment(pointChange),
        updatedAt: serverTimestamp(),
    }, { merge: true });

    // Update team total if needed
    if (applyToTeamTotal) {
        await updateDoc(doc(db, 'teams', payload.teamId), {
            totalPoints: increment(pointChange),
        });
    }

    // Log activity
    logActivity({
        kind: 'score',
        teamId: payload.teamId,
        teamName: payload.teamName,
        taskId: payload.taskId,
        taskTitle: payload.taskTitle,
        points: Math.abs(payload.points),
        scoreType: payload.scoreType,
        targetType: 'member',
        memberKey: payload.memberKey,
        memberUserId: payload.memberUserId,
        memberName: payload.memberName,
        customNote: payload.customNote,
        stageId: payload.stageId,
        actorId: payload.registeredBy,
        actorName: payload.registeredByName,
        actorRole: payload.actorRole,
    });
}
