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
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { logActivity } from "./activityLogger";
import { buildMemberKey, normalizeMemberName } from "./memberKeys";

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
  operation: "create" | "delete" | "update";
  entityType: "team" | "task" | "member";
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
    await addDoc(collection(db, "logs"), {
      kind: "audit",
      operation: params.operation,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName.trim() || "غير معروف",
      stageId: params.stageId || null,
      actorId: params.actorId,
      actorName: params.actorName || null,
      actorEmail: params.actorEmail || null,
      actorRole: params.actorRole || null,
      details: params.details || null,
      timestamp: serverTimestamp(),
      source: "client",
    });

    logActivity({
      kind: "audit",
      operation: params.operation,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName.trim() || "غير معروف",
      stageId: params.stageId || null,
      actorId: params.actorId,
      actorName: params.actorName || null,
      actorRole: params.actorRole || null,
      details: params.details || null,
    });
  } catch (err) {
    console.warn("Failed to write audit log:", err);
  }
}

// ── Team CRUD ─────────────────────────────────────────────────────────────

export async function createTeam(data: TeamCreateData): Promise<string> {
  const id = `team_${Date.now()}`;
  await setDoc(doc(db, "teams", id), {
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
  await updateDoc(doc(db, "teams", data.teamId), updatePayload);
}

export async function deleteTeam(teamId: string): Promise<void> {
  // Clear teamId on all users that belonged to this team
  const usersSnap = await getDocs(
    query(collection(db, "users"), where("teamId", "==", teamId)),
  );
  if (!usersSnap.empty) {
    const batch = writeBatch(db);
    usersSnap.docs.forEach((userDoc) => {
      batch.update(userDoc.ref, { teamId: null });
    });
    await batch.commit();
  }
  await deleteDoc(doc(db, "teams", teamId));
}

// ── Member Operations ─────────────────────────────────────────────────────

export async function addTeamMember(
  teamId: string,
  memberName: string,
  currentMemberCount: number,
): Promise<void> {
  await updateDoc(doc(db, "teams", teamId), {
    members: arrayUnion(memberName.trim()),
    memberCount: currentMemberCount + 1,
  });
}

export async function removeTeamMember(
  teamId: string,
  memberName: string,
  updatedMemberCount?: number,
): Promise<void> {
  // Update the team document
  // If we don't have an exact count, decrement by 1 to avoid desyncs.
  const updatePayload: Record<string, any> = {
    members: arrayRemove(memberName),
    memberCount:
      typeof updatedMemberCount === "number"
        ? updatedMemberCount
        : increment(-1),
  };
  await updateDoc(doc(db, "teams", teamId), updatePayload);

  // Clear teamId on any user doc that matches this team and member name
  const usersSnap = await getDocs(
    query(
      collection(db, "users"),
      where("teamId", "==", teamId),
      where("name", "==", memberName),
    ),
  );
  if (!usersSnap.empty) {
    const batch = writeBatch(db);
    usersSnap.docs.forEach((userDoc) => {
      batch.update(userDoc.ref, { teamId: null });
    });
    await batch.commit();
  }
}

// ── Move Member ───────────────────────────────────────────────────────────

export interface MoveMemberParams {
  memberName: string;
  fromTeam: { id: string; members: string[]; stageId?: string | null };
  toTeam: { id: string; members: string[]; stageId?: string | null };
  /** Optional: the user doc ID if this member has a linked account */
  memberUserId?: string | null;
}

/**
 * Moves a member from one team to another in one batch:
 * 1. Updates the `teams` documents (members arrays + memberCount).
 * 2. Updates the linked user doc's teamId (if any).
 * 3. Re-keys all `scores` referencing this member in the old team.
 * 4. Re-keys and re-teams all `member_stats` for this member.
 */
export async function moveTeamMember(params: MoveMemberParams): Promise<void> {
  const { memberName, fromTeam, toTeam, memberUserId } = params;

  const trimmedName = memberName.trim();
  if (!trimmedName) throw new Error("memberName is required");
  if (fromTeam.id === toTeam.id)
    throw new Error("Source and target team must be different");

  const oldMemberKey = buildMemberKey({
    teamId: fromTeam.id,
    memberName: trimmedName,
  });
  const newMemberKey = buildMemberKey({
    teamId: toTeam.id,
    memberName: trimmedName,
  });
  const normalizedName = normalizeMemberName(trimmedName);

  // ── 1. Fetch all data we need before starting the batch ──────────────
  const [scoresSnap, memberStatsSnap, usersSnap] = await Promise.all([
    // Scores referencing old team membership
    getDocs(
      query(collection(db, "scores"), where("teamId", "==", fromTeam.id)),
    ),
    // member_stats referencing old team
    getDocs(
      query(collection(db, "member_stats"), where("teamId", "==", fromTeam.id)),
    ),
    // User docs linked to old team by name (for name-only members)
    memberUserId
      ? getDocs(
          query(
            collection(db, "users"),
            where("teamId", "==", fromTeam.id),
            where("name", "==", trimmedName),
          ),
        )
      : Promise.resolve({ empty: true, docs: [] } as any),
  ]);

  // ── 2. Identify affected score docs ──────────────────────────────────
  const scoresToUpdate: { id: string; newData: Record<string, unknown> }[] = [];
  scoresSnap.forEach((entry) => {
    const d = entry.data();
    const docMemberKey = typeof d.memberKey === "string" ? d.memberKey : null;
    const docMemberUserId =
      typeof d.memberUserId === "string" ? d.memberUserId.trim() : null;
    const docMemberName =
      typeof d.memberName === "string" ? normalizeMemberName(d.memberName) : "";

    const matchesByKey =
      docMemberKey &&
      (docMemberKey === oldMemberKey ||
        docMemberKey === `n:${fromTeam.id}:${normalizedName}` ||
        docMemberKey ===
          `n:${fromTeam.id}:${normalizedName.replace(/\s+/g, "_")}`);
    const matchesByUserId = memberUserId && docMemberUserId === memberUserId;
    const matchesByName = !memberUserId && docMemberName === normalizedName;

    if (matchesByKey || matchesByUserId || matchesByName) {
      const update: Record<string, unknown> = { teamId: toTeam.id };
      if (newMemberKey)
        update.memberKey = memberUserId ? `u:${memberUserId}` : newMemberKey;
      if (toTeam.stageId) update.stageId = toTeam.stageId;
      scoresToUpdate.push({ id: entry.id, newData: update });
    }
  });

  // ── 3. Identify affected member_stats docs ────────────────────────────
  const statsToDelete: string[] = [];
  const statsToUpsert: { key: string; data: Record<string, unknown> }[] = [];

  memberStatsSnap.forEach((entry) => {
    const d = entry.data();
    const docKey = typeof d.memberKey === "string" ? d.memberKey : "";
    const docName =
      typeof d.memberName === "string" ? normalizeMemberName(d.memberName) : "";
    const docUserId =
      typeof d.memberUserId === "string" ? d.memberUserId.trim() : "";

    const matchesByKey =
      docKey === oldMemberKey ||
      docKey === `n:${fromTeam.id}:${normalizedName}` ||
      docKey === `n:${fromTeam.id}:${normalizedName.replace(/\s+/g, "_")}`;
    const matchesByUserId = memberUserId && docUserId === memberUserId;
    const matchesByName = !memberUserId && docName === normalizedName;

    if (matchesByKey || matchesByUserId || matchesByName) {
      statsToDelete.push(entry.id);
      const newKey = memberUserId
        ? `u:${memberUserId}`
        : newMemberKey || `n:${toTeam.id}:${normalizedName}`;
      statsToUpsert.push({
        key: newKey,
        data: {
          ...d,
          teamId: toTeam.id,
          stageId: toTeam.stageId || d.stageId || null,
          memberKey: newKey,
          memberName: trimmedName,
          memberUserId: memberUserId || d.memberUserId || null,
        },
      });
    }
  });

  // ── 4. Execute in chunks of 400 ───────────────────────────────────────
  const operations: Array<{
    type: "update" | "set" | "delete";
    ref: any;
    data?: Record<string, unknown>;
  }> = [];

  // Team updates
  const fromUpdatedMembers = fromTeam.members.filter((m) => m !== trimmedName);
  operations.push({
    type: "update",
    ref: doc(db, "teams", fromTeam.id),
    data: { members: arrayRemove(trimmedName), memberCount: increment(-1) },
  });
  operations.push({
    type: "update",
    ref: doc(db, "teams", toTeam.id),
    data: { members: arrayUnion(trimmedName), memberCount: increment(1) },
  });

  // User doc update
  if (memberUserId) {
    operations.push({
      type: "update",
      ref: doc(db, "users", memberUserId),
      data: { teamId: toTeam.id },
    });
  } else if (!usersSnap.empty) {
    (usersSnap as any).docs.forEach((userDoc: any) => {
      operations.push({
        type: "update",
        ref: userDoc.ref,
        data: { teamId: toTeam.id },
      });
    });
  }

  // Score updates
  scoresToUpdate.forEach(({ id, newData }) => {
    operations.push({
      type: "update",
      ref: doc(db, "scores", id),
      data: newData,
    });
  });

  // member_stats: delete old, set new
  statsToDelete.forEach((id) => {
    operations.push({ type: "delete", ref: doc(db, "member_stats", id) });
  });
  statsToUpsert.forEach(({ key, data }) => {
    operations.push({ type: "set", ref: doc(db, "member_stats", key), data });
  });

  // Write in batches of 400
  const CHUNK = 400;
  for (let i = 0; i < operations.length; i += CHUNK) {
    const batch = writeBatch(db);
    operations.slice(i, i + CHUNK).forEach((op) => {
      if (op.type === "update") batch.update(op.ref, op.data!);
      else if (op.type === "set") batch.set(op.ref, op.data!, { merge: false });
      else if (op.type === "delete") batch.delete(op.ref);
    });
    await batch.commit();
  }
}
