/**
 * tasksService.ts — All task-related Firebase write operations.
 *
 * Extracted from TasksPage.tsx to centralise Firestore writes for tasks.
 */

import {
    addDoc,
    collection,
    doc,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TaskCreateData {
    title: string;
    points: number;
    teamPoints: number;
    type: 'team' | 'leader' | 'member' | string;
    stageId?: string | null;
    deadline?: string | null;
    createdBy: string;
    isSuperAdminOnly?: boolean;
}

// ── Task Operations ───────────────────────────────────────────────────────

export async function createTask(data: TaskCreateData): Promise<string> {
    const docRef = await addDoc(collection(db, 'tasks'), {
        title: data.title.trim(),
        points: data.points,
        teamPoints: data.teamPoints || 0,
        type: data.type,
        status: 'active',
        stageId: data.stageId || null,
        deadline: data.deadline || null,
        createdBy: data.createdBy,
        createdAt: serverTimestamp(),
        isSuperAdminOnly: data.isSuperAdminOnly || false,
    });
    return docRef.id;
}

export async function archiveTask(taskId: string): Promise<void> {
    await updateDoc(doc(db, 'tasks', taskId), {
        status: 'archived',
    });
}
