/**
 * usersService.ts — All user-related Firebase write operations.
 *
 * Extracted from MembersPage.tsx to centralise user Firestore writes.
 */

import {
    collection,
    deleteDoc,
    doc,
    increment,
    serverTimestamp,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

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
