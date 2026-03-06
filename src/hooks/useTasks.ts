/**
 * useTasks.ts — Real-time task data listener.
 *
 * Provides a Firestore listener for the `tasks` collection.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/services/firebase';

export interface TaskSnapshot {
    id: string;
    title: string;
    points: number;
    teamPoints?: number;
    type: 'team' | 'leader' | 'member' | string;
    status: 'active' | 'archived';
    stageId?: string;
    createdBy: string;
    deadline?: unknown;
    createdAt?: unknown;
    isSuperAdminOnly?: boolean;
}

interface UseTasksOptions {
    /** If true, only return active tasks. Defaults to false. */
    activeOnly?: boolean;
    /** If provided, filter tasks by type(s). */
    types?: string[];
}

export function useTasks(options: UseTasksOptions = {}) {
    const [tasks, setTasks] = useState<TaskSnapshot[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'tasks'));

        const unsub = onSnapshot(q, (snap) => {
            let result = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskSnapshot));

            if (options.activeOnly) {
                result = result.filter(t => t.status === 'active');
            }

            if (options.types && options.types.length > 0) {
                result = result.filter(t => options.types!.includes(t.type));
            }

            setTasks(result);
            setLoading(false);
        }, (err) => {
            console.error('Tasks listener error:', err);
            setLoading(false);
        });

        return unsub;
    }, [options.activeOnly, options.types?.join(',')]);

    return { tasks, loading };
}
