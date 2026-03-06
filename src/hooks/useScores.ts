/**
 * useScores.ts — Real-time scores/activities listener.
 *
 * Provides a Firestore listener for the `activities` collection,
 * filtered by kind and optionally by stageId.
 */

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';
import { toEventDate } from '@/utils/helpers';

export interface ScoreActivity {
    id: string;
    kind: 'score' | 'audit';
    timestamp: unknown;
    stageId?: string | null;
    teamId?: string;
    teamName?: string | null;
    taskId?: string | null;
    taskTitle?: string | null;
    points?: number;
    scoreType?: 'earn' | 'deduct';
    targetType?: 'team' | 'member';
    memberKey?: string | null;
    memberUserId?: string | null;
    memberName?: string | null;
    customNote?: string | null;
    actorName?: string | null;
}

interface UseScoresOptions {
    /** Max items to fetch from Firestore. Defaults to 200. */
    fetchLimit?: number;
    /** Max items to return after filtering. Defaults to 20. */
    displayLimit?: number;
    /** Filter by activity kind. Defaults to 'score'. */
    kind?: 'score' | 'audit';
}

export function useScores(options: UseScoresOptions = {}) {
    const { user } = useAuth();
    const [activities, setActivities] = useState<ScoreActivity[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLimit = options.fetchLimit ?? 200;
    const displayLimit = options.displayLimit ?? 20;
    const kind = options.kind ?? 'score';

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, 'activities'),
            orderBy('timestamp', 'desc'),
            limit(fetchLimit)
        );

        const unsub = onSnapshot(q, (snap) => {
            let docs = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as ScoreActivity))
                .filter(a => a.kind === kind);

            // Stage scoping for non-super-admins
            if (user.role !== 'super_admin' && user.stageId) {
                docs = docs.filter(a => a.stageId === user.stageId);
            }

            docs.sort((a, b) =>
                toEventDate(b.timestamp).getTime() - toEventDate(a.timestamp).getTime()
            );

            setActivities(docs.slice(0, displayLimit));
            setLoading(false);
        }, (err) => {
            console.error('Activities listener error:', err);
            setActivities([]);
            setLoading(false);
        });

        return unsub;
    }, [user, fetchLimit, displayLimit, kind]);

    return { activities, loading };
}
