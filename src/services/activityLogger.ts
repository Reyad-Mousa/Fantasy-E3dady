/**
 * activityLogger.ts
 * Shared helper that writes a single, normalised document to the
 * `activities` Firestore collection every time a score or audit
 * event occurs anywhere in the app.
 *
 * Callers: ScoreRegistration, TasksPage, useTeamsData, syncService
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// ── Types ──────────────────────────────────────────────────────────────────

interface BaseActivity {
    /** Who triggered the action */
    actorId: string;
    actorName?: string | null;
    actorRole?: string | null;
    stageId?: string | null;
}

export interface ScoreActivity extends BaseActivity {
    kind: 'score';
    teamId: string;
    teamName?: string | null;
    taskId?: string | null;
    taskTitle?: string | null;
    points: number;
    scoreType: 'earn' | 'deduct';
    targetType: 'team' | 'member';
    memberKey?: string | null;
    memberName?: string | null;
    customNote?: string | null;
}

export interface AuditActivity extends BaseActivity {
    kind: 'audit';
    operation: 'create' | 'update' | 'delete';
    entityType: 'team' | 'task' | 'member' | string;
    entityId: string;
    entityName: string;
    details?: string | null;
}

export type ActivityPayload = ScoreActivity | AuditActivity;

// ── Writer ─────────────────────────────────────────────────────────────────

/**
 * Writes one document to the `activities` collection.
 * Errors are swallowed & logged to console — never let logging
 * break the core operation.
 */
export async function logActivity(payload: ActivityPayload): Promise<void> {
    try {
        await addDoc(collection(db, 'activities'), {
            ...payload,
            timestamp: serverTimestamp(),
        });
    } catch (err) {
        console.warn('[activityLogger] failed to write activity:', err);
    }
}
