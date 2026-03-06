/**
 * teamsService.ts — All team-related Firebase write operations.
 *
 * Extracted from useTeamsData.ts to separate service layer from hooks.
 * The hook (useTeamsData) still manages state + listeners and calls these
 * service functions for mutations.
 */

import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    serverTimestamp,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { logActivity } from './activityLogger';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TeamCreateData {
    name: string;
    stageId: string | null;
    createdBy: string;
    leaderId: string;
}

export interface TeamUpdateData {
    teamId: string;
    name: string;
    stageId?: string | null;
    isSuperAdmin?: boolean;
}

export interface AuditLogParams {
    operation: 'create' | 'delete' | 'update';
    entityType: 'team' | 'task' | 'member';
    entityId: string;
    entityName: string;
    stageId?: string | null;
    details?: string | null;
    actorId: string;
    actorName: string | null;
    actorEmail?: string | null;
    actorRole?: string | null;
}

// ── Audit Log (shared by teams, tasks, etc.) ──────────────────────────────

export async function createAuditLog(params: AuditLogParams): Promise<void> {
    try {
        await addDoc(collection(db, 'logs'), {
            kind: 'audit',
            operation: params.operation,
            entityType: params.entityType,
            entityId: params.entityId,
            entityName: params.entityName.trim() || 'غير معروف',
            stageId: params.stageId || null,
            actorId: params.actorId,
            actorName: params.actorName || null,
            actorEmail: params.actorEmail || null,
            actorRole: params.actorRole || null,
            details: params.details || null,
            timestamp: serverTimestamp(),
            source: 'client',
        });

        logActivity({
            kind: 'audit',
            operation: params.operation,
            entityType: params.entityType,
            entityId: params.entityId,
            entityName: params.entityName.trim() || 'غير معروف',
            stageId: params.stageId || null,
            actorId: params.actorId,
            actorName: params.actorName || null,
            actorRole: params.actorRole || null,
            details: params.details || null,
        });
    } catch (err) {
        console.warn('Failed to write audit log:', err);
    }
}

// ── Team CRUD ─────────────────────────────────────────────────────────────

export async function createTeam(data: TeamCreateData): Promise<string> {
    const id = `team_${Date.now()}`;
    await setDoc(doc(db, 'teams', id), {
        name: data.name.trim(),
        leaderId: data.leaderId,
        totalPoints: 0,
        memberCount: 0,
        members: [],
        createdBy: data.createdBy,
        createdAt: serverTimestamp(),
        stageId: data.stageId,
    });
    return id;
}

export async function updateTeam(data: TeamUpdateData): Promise<void> {
    const updatePayload: Record<string, unknown> = {
        name: data.name.trim(),
    };
    if (data.isSuperAdmin && data.stageId) {
        updatePayload.stageId = data.stageId;
    }
    await updateDoc(doc(db, 'teams', data.teamId), updatePayload);
}

export async function deleteTeam(teamId: string): Promise<void> {
    await deleteDoc(doc(db, 'teams', teamId));
}

// ── Member Operations ─────────────────────────────────────────────────────

export async function addTeamMember(
    teamId: string,
    memberName: string,
    currentMemberCount: number
): Promise<void> {
    await updateDoc(doc(db, 'teams', teamId), {
        members: arrayUnion(memberName.trim()),
        memberCount: currentMemberCount + 1,
    });
}

export async function removeTeamMember(
    teamId: string,
    memberName: string,
    updatedMemberCount: number
): Promise<void> {
    await updateDoc(doc(db, 'teams', teamId), {
        members: arrayRemove(memberName),
        memberCount: updatedMemberCount,
    });
}
