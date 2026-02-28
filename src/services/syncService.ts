import { collection, addDoc, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getUnsyncedScores, markScoreSynced, type PendingScore } from './offlineDb';

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
                stageId,
                memberKey: score.memberKey ?? null,
                memberUserId: score.memberUserId ?? null,
                memberName: score.memberName ?? null,
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

            if ((score.targetType ?? 'team') === 'member' && score.memberKey) {
                await setDoc(doc(db, 'member_stats', score.memberKey), {
                    memberKey: score.memberKey,
                    memberUserId: score.memberUserId ?? null,
                    memberName: score.memberName ?? 'غير معروف',
                    teamId: score.teamId,
                    stageId,
                    totalPoints: increment(pointChange),
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }

            if (score.id !== undefined) {
                await markScoreSynced(score.id);
            }
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
