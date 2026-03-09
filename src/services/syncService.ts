import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    increment,
    query,
    serverTimestamp,
    updateDoc,
    where,
    writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { getUnsyncedScores, markScoreSynced, type PendingScore } from './offlineDb';
import { logActivity } from './activityLogger';
import { buildMemberKey, normalizeMemberName } from './memberKeys';

// ── Batch helper ───────────────────────────────────────────────────────────

const BATCH_CHUNK_SIZE = 400;

type BatchOp = (batch: ReturnType<typeof writeBatch>) => void;

async function commitInChunks(ops: BatchOp[]): Promise<void> {
    for (let i = 0; i < ops.length; i += BATCH_CHUNK_SIZE) {
        const chunk = ops.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const op of chunk) op(batch);
        await batch.commit();
    }
}

// ── Sync ───────────────────────────────────────────────────────────────────

export async function syncPendingScores(): Promise<number> {
    const pending = await getUnsyncedScores();
    let synced = 0;

    for (const score of pending) {
        try {
            let stageId = score.stageId ?? null;
            if (stageId == null) {
                const teamDoc = await getDoc(doc(db, 'teams', score.teamId));
                if (teamDoc.exists()) {
                    stageId = (teamDoc.data().stageId as string | null | undefined) ?? null;
                }
            }

            await addDoc(collection(db, 'scores'), {
                teamId: score.teamId,
                taskId: score.taskId,
                points: score.points,
                type: score.type,
                targetType: score.targetType ?? 'team',
                source: score.source ?? 'team',
                registeredBy: score.registeredBy,
                registeredByName: score.registeredByName ?? null,
                stageId,
                memberKey: score.memberKey ?? null,
                memberUserId: score.memberUserId ?? null,
                memberName: score.memberName ?? null,
                customNote: score.customNote ?? null,
                applyToTeamTotal: score.applyToTeamTotal ?? true,
                timestamp: serverTimestamp(),
                syncedAt: serverTimestamp(),
                pendingSync: false,
            });

            const pointChange = score.type === 'earn' ? Math.abs(score.points) : -Math.abs(score.points);
            if ((score.applyToTeamTotal ?? true) === true) {
                await updateDoc(doc(db, 'teams', score.teamId), {
                    totalPoints: increment(pointChange),
                });
            }

            // If it's a team score, distribute to members via batched writes
            if ((score.targetType ?? 'team') === 'team' && score.distributeToMembers !== false) {
                try {
                    // Fetch users belonging to the team
                    const usersSnap = await getDocs(query(collection(db, 'users'), where('teamId', '==', score.teamId)));
                    const userMembers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

                    // Fetch legacy string members from team doc
                    const teamDoc = await getDoc(doc(db, 'teams', score.teamId));
                    const teamData = teamDoc.data();

                    const seen = new Set<string>();
                    const availableMembers: { key: string; userId: string | null; name: string }[] = [];

                    for (const u of userMembers) {
                        const name = String(u.name || u.displayName || '').trim();
                        if (!name) continue;
                        const normalizedName = normalizeMemberName(name);
                        if (seen.has(normalizedName)) continue;
                        seen.add(normalizedName);
                        const key = buildMemberKey({ memberUserId: u.id, teamId: score.teamId, memberName: name });
                        if (!key) continue;
                        availableMembers.push({ key, userId: u.id, name });
                    }

                    if (teamData?.members && Array.isArray(teamData.members)) {
                        for (const rawName of teamData.members) {
                            const name = String(rawName || '').trim();
                            if (!name) continue;
                            const norm = normalizeMemberName(name);
                            if (seen.has(norm)) continue;
                            seen.add(norm);
                            const key = buildMemberKey({ teamId: score.teamId, memberName: name });
                            if (!key) continue;
                            availableMembers.push({ key, userId: null, name });
                        }
                    }

                    const memberCount = availableMembers.length;
                    if (memberCount > 0 && Math.abs(score.points) > 0) {
                        const perMemberShare = Math.abs(score.points) / memberCount;
                        const perMemberChange = score.type === 'earn' ? perMemberShare : -perMemberShare;

                        const ops: BatchOp[] = availableMembers.map(member => (batch) =>
                            batch.set(doc(db, 'member_stats', member.key), {
                                memberKey: member.key,
                                memberUserId: member.userId,
                                memberName: member.name,
                                teamId: score.teamId,
                                stageId,
                                totalPoints: increment(perMemberChange),
                                updatedAt: serverTimestamp(),
                            }, { merge: true })
                        );

                        await commitInChunks(ops);
                    }
                } catch (e) {
                    console.error('Failed to distribute team points during offline sync', e);
                }
            } else if ((score.targetType ?? 'team') === 'member' && score.memberKey) {
                // Individual member score
                const statRef = doc(db, 'member_stats', score.memberKey);
                const statBatch = writeBatch(db);
                statBatch.set(statRef, {
                    memberKey: score.memberKey,
                    memberUserId: score.memberUserId ?? null,
                    memberName: score.memberName ?? 'غير معروف',
                    teamId: score.teamId,
                    stageId,
                    totalPoints: increment(pointChange),
                    updatedAt: serverTimestamp(),
                }, { merge: true });
                await statBatch.commit();
            }

            if (score.id !== undefined) {
                await markScoreSynced(score.id);
            }

            // Log synced score to activities collection
            logActivity({
                kind: 'score',
                teamId: score.teamId,
                taskId: score.taskId ?? null,
                points: Math.abs(score.points),
                scoreType: score.type as 'earn' | 'deduct',
                targetType: (score.targetType ?? 'team') as 'team' | 'member',
                memberKey: score.memberKey ?? null,
                memberUserId: score.memberUserId ?? null,
                memberName: score.memberName ?? null,
                customNote: score.customNote ?? null,
                stageId: stageId,
                actorId: score.registeredBy,
                actorName: score.registeredByName ?? null,
            });

            synced++;
        } catch (err) {
            console.error('Failed to sync score:', err);
        }
    }

    return synced;
}

export function isOnline(): boolean {
    return navigator.onLine;
}

export function onConnectionChange(callback: (online: boolean) => void) {
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
}
