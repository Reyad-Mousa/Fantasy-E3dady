/**
 * usersService.ts — All user-related Firebase write operations.
 *
 * Extracted from MembersPage.tsx to centralise user Firestore writes.
 */

import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    increment,
    query,
    setDoc,
    updateDoc,
    where,
    writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

const BATCH_CHUNK_SIZE = 400;

// ── Types ──────────────────────────────────────────────────────────────────

export interface UserCreateData {
    uid: string;
    name: string;
    email: string;
    role: string;
    teamId: string | null;
}

export interface UserUpdateData {
    uid: string;
    updates: Record<string, unknown>;
}

export interface DeleteUserCascadeInput {
    uid: string;
    teamId?: string | null;
}

export interface CleanupOrphanMemberStatsInput {
    stageId?: string | null;
    existingUserIds?: string[];
}

export interface CleanupOrphanMemberStatsResult {
    candidateCount: number;
    deletedCount: number;
}

// ── User Operations ───────────────────────────────────────────────────────

export async function createOrUpdateUser(data: UserCreateData): Promise<void> {
    await setDoc(doc(db, 'users', data.uid), {
        name: data.name.trim(),
        email: data.email.trim(),
        role: data.role,
        teamId: data.teamId,
    }, { merge: true });
}

export async function updateUser(data: UserUpdateData): Promise<void> {
    await updateDoc(doc(db, 'users', data.uid), data.updates);
}

export async function deleteUser(uid: string): Promise<void> {
    await deleteDoc(doc(db, 'users', uid));
}

/**
 * Delete user doc and the linked member_stats document (`u:<uid>`).
 * Keeps team memberCount update behavior by decrementing when teamId exists.
 */
export async function deleteUserCascade(input: DeleteUserCascadeInput): Promise<void> {
    const { uid, teamId } = input;
    const batch = writeBatch(db);

    batch.delete(doc(db, 'users', uid));
    batch.delete(doc(db, 'member_stats', `u:${uid}`));
    if (teamId) {
        batch.update(doc(db, 'teams', teamId), {
            memberCount: increment(-1),
        });
    }

    await batch.commit();
}

/**
 * One-time cleanup for orphan member_stats documents keyed as `u:<uid>`.
 * Optional stageId narrows scope for non-super-admin usage.
 */
export async function cleanupOrphanMemberStats(
    input: CleanupOrphanMemberStatsInput = {}
): Promise<CleanupOrphanMemberStatsResult> {
    const stageId = input.stageId?.trim() || null;
    const existingUserIdsInput = input.existingUserIds || [];
    const existingUserIds = new Set(existingUserIdsInput.map((id) => id.trim()).filter(Boolean));

    if (existingUserIds.size === 0) {
        const usersSnap = await getDocs(collection(db, 'users'));
        usersSnap.docs.forEach((d) => {
            const id = d.id.trim();
            if (id) existingUserIds.add(id);
        });
    }

    const statsQuery = stageId
        ? query(collection(db, 'member_stats'), where('stageId', '==', stageId))
        : collection(db, 'member_stats');
    const statsSnap = await getDocs(statsQuery);

    const orphanRefs = statsSnap.docs
        .filter((d) => d.id.startsWith('u:'))
        .filter((d) => {
            const uid = d.id.slice(2).trim();
            return !!uid && !existingUserIds.has(uid);
        })
        .map((d) => d.ref);

    for (let i = 0; i < orphanRefs.length; i += BATCH_CHUNK_SIZE) {
        const batch = writeBatch(db);
        orphanRefs.slice(i, i + BATCH_CHUNK_SIZE).forEach((ref) => {
            batch.delete(ref);
        });
        await batch.commit();
    }

    return {
        candidateCount: statsSnap.docs.filter((d) => d.id.startsWith('u:')).length,
        deletedCount: orphanRefs.length,
    };
}

/**
 * Update the team's member count after adding/removing a user.
 */
export async function adjustTeamMemberCount(
    teamId: string,
    delta: number
): Promise<void> {
    await updateDoc(doc(db, 'teams', teamId), {
        memberCount: increment(delta),
    });
}
