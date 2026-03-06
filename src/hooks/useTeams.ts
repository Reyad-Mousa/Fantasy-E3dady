/**
 * useTeams.ts — Real-time team data listener.
 *
 * Provides a stage-scoped Firestore listener for the `teams` collection.
 * Used by components that need to display team data without mutation logic.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';

export interface TeamSnapshot {
    id: string;
    name: string;
    leaderId?: string;
    totalPoints: number;
    memberCount: number;
    members?: string[];
    stageId?: string | null;
}

export function useTeams() {
    const { user } = useAuth();
    const [teams, setTeams] = useState<TeamSnapshot[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const stageScopedRole = user.role === 'admin' || user.role === 'leader';
        const q = stageScopedRole && user.stageId
            ? query(collection(db, 'teams'), where('stageId', '==', user.stageId))
            : collection(db, 'teams');

        const unsub = onSnapshot(q, (snap) => {
            setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamSnapshot)));
            setLoading(false);
        });
        return unsub;
    }, [user]);

    return { teams, loading };
}
