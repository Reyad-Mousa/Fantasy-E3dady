/**
 * useMembers.ts — Real-time users listener (scoped to members).
 *
 * Provides a Firestore listener for the `users` collection,
 * optionally filtering by role.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';

export interface MemberUser {
    id: string;
    name: string;
    email?: string;
    role: string;
    teamId: string | null;
    stageId?: string | null;
}

interface UseMembersOptions {
    /** If provided, only return users with this role. */
    roleFilter?: string;
}

export function useMembers(options: UseMembersOptions = {}) {
    const [members, setMembers] = useState<MemberUser[]>([]);
    const [loading, setLoading] = useState(true);

    const { roleFilter } = options;

    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, 'users'),
            (snap) => {
                let result = snap.docs.map(d => ({
                    id: d.id,
                    ...d.data(),
                } as MemberUser));

                if (roleFilter) {
                    result = result.filter(u => u.role === roleFilter);
                }

                setMembers(result);
                setLoading(false);
            },
            () => {
                setMembers([]);
                setLoading(false);
            }
        );

        return unsub;
    }, [roleFilter]);

    return { members, loading };
}
