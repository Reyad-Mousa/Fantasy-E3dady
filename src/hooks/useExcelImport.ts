import { useState } from "react";
import { db } from "@/services/firebase";
import {
  doc,
  writeBatch,
  collection,
  serverTimestamp,
  increment,
  arrayUnion,
  getDoc,
} from "firebase/firestore";
import { TeamData } from "./useTeamsData";
import { buildMemberKey, normalizeMemberName } from "@/services/memberKeys";
import { logActivity } from "@/services/activityLogger";
import { moveTeamMember, removeTeamMember } from "@/services/teamsService";
import { STAGES_LIST, type StageId } from "@/config/stages";

// Normalize team names for matching (same as member names)
const normalizeTeamName = (name: string): string =>
  name.toLowerCase().trim().replace(/\s+/g, " ");

const normalizeHeaderKey = (value: string): string =>
  value.toLowerCase().trim().replace(/\s+/g, " ");

const normalizeStageLabel = (value: string): string =>
  value.toLowerCase().trim().replace(/\s+/g, " ");

const asTrimmedString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const getColumnKey = (
  row: Record<string, any>,
  candidates: string[],
): string | undefined => {
  const candidateSet = new Set(candidates.map(normalizeHeaderKey));
  return Object.keys(row).find((k) => candidateSet.has(normalizeHeaderKey(k)));
};

const resolveStageIdFromCell = (value: unknown): StageId | "" => {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const normalized = normalizeStageLabel(raw);
  if (
    normalized === "grade7" ||
    normalized === "grade8" ||
    normalized === "grade9"
  ) {
    return normalized as StageId;
  }
  const matched = STAGES_LIST.find(
    (stage) => normalizeStageLabel(stage.name) === normalized,
  );
  return matched?.id || "";
};

export interface ImportPreviewData {
  newTeams: {
    id: string;
    name: string;
    stageId: string;
    suggestedStageId?: string | null;
  }[];
  newMembers: {
    teamId: string;
    teamName: string;
    memberName: string;
    stageId: string;
  }[];
  memberMoves: {
    memberName: string;
    memberUserId?: string | null;
    fromTeamId: string;
    fromTeamName: string;
    toTeamId: string;
    toTeamName: string;
  }[];
  memberRemovals: {
    memberName: string;
    fromTeamId: string;
    fromTeamName: string;
  }[];
  pointUpdates: {
    memberKey: string;
    memberName: string;
    memberUserId?: string | null;
    teamId: string;
    teamName: string;
    stageId: string;
    oldPoints: number;
    newPoints: number;
    delta: number;
  }[];
}

export function useExcelImport(
  user: any,
  teams: TeamData[],
  memberStats: Record<string, number>,
  showToast: (
    msg: string,
    type?: "success" | "error" | "warning" | "info",
  ) => void,
  onSuccess: () => void,
) {
  const [previewData, setPreviewData] = useState<ImportPreviewData | null>(
    null,
  );
  const [isImporting, setIsImporting] = useState(false);
  const [removeMissingMembers, setRemoveMissingMembers] = useState(true);

  const commitOperations = async (
    operations: Array<(batch: ReturnType<typeof writeBatch>) => void>,
    chunkSize = 450,
  ) => {
    for (let i = 0; i < operations.length; i += chunkSize) {
      const batch = writeBatch(db);
      operations
        .slice(i, i + chunkSize)
        .forEach((operation) => operation(batch));
      await batch.commit();
    }
  };

  const parseExcel = async (file: File, currentStageFilter: string) => {
    try {
      const data = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(data);

      const newTeams: ImportPreviewData["newTeams"] = [];
      const newMembers: ImportPreviewData["newMembers"] = [];
      const memberMoves: ImportPreviewData["memberMoves"] = [];
      const memberRemovals: ImportPreviewData["memberRemovals"] = [];
      const pointUpdates: ImportPreviewData["pointUpdates"] = [];

      // A map to track team IDs for newly discovered teams within the file
      // to link their members without roundtripping to Firestore.
      const newTeamIdMap = new Map<string, string>();
      const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

      // Track where each existing member currently belongs (teamId + teamName)
      // Only keep unique names to avoid incorrect moves when duplicates exist across teams.
      const nameCounts = new Map<string, number>();
      teams.forEach((team) => {
        (team.members || []).forEach((member) => {
          const normalized = normalizeMemberName(member);
          nameCounts.set(normalized, (nameCounts.get(normalized) || 0) + 1);
        });
      });
      const existingMemberTeamMap = new Map<
        string,
        { teamId: string; teamName: string }
      >();
      teams.forEach((team) => {
        (team.members || []).forEach((member) => {
          const normalized = normalizeMemberName(member);
          if ((nameCounts.get(normalized) || 0) === 1) {
            existingMemberTeamMap.set(normalized, {
              teamId: team.id,
              teamName: team.name,
            });
          }
        });
      });

      const memberIdHeaders = [
        "معرّف العضو",
        "معرف العضو",
        "ID العضو",
        "member id",
        "member_id",
        "user id",
        "user_id",
        "معرّف المستخدم",
        "معرف المستخدم",
      ];
      const teamIdHeaders = [
        "معرّف الفريق",
        "معرف الفريق",
        "ID الفريق",
        "team id",
        "team_id",
      ];
      const stageHeaders = ["المرحلة", "مرحلة الفريق"];

      const memberIds = new Set<string>();
      const teamNameToIds = new Map<string, string[]>();
      teams.forEach((team) => {
        const normalized = normalizeTeamName(team.name);
        const list = teamNameToIds.get(normalized) || [];
        list.push(team.id);
        teamNameToIds.set(normalized, list);
      });
      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any>(sheet);
        rows.forEach((row) => {
          const memberIdCol = getColumnKey(row, memberIdHeaders);
          const memberId = asTrimmedString(memberIdCol ? row[memberIdCol] : "");
          if (memberId) memberIds.add(memberId);
        });
      });

      const existingMemberIdMap = new Map<
        string,
        { teamId: string; teamName: string }
      >();
      if (memberIds.size > 0) {
        await Promise.all(
          [...memberIds].map(async (uid) => {
            try {
              const snap = await getDoc(doc(db, "users", uid));
              if (!snap.exists()) return;
              const data = snap.data() as any;
              const teamId = typeof data.teamId === "string" ? data.teamId : "";
              if (!teamId) return;
              existingMemberIdMap.set(uid, {
                teamId,
                teamName: teamNameById.get(teamId) || teamId,
              });
            } catch {
              // Ignore lookup failures to keep import usable with name-based matching.
            }
          }),
        );
      }

      // Track what members appear in the file per team (for later removals)
      const parsedMembersByTeam = new Map<string, Set<string>>();

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any>(sheet);

        let currentParsedTeamName = "";
        let currentParsedTeamId = "";
        let currentParsedStageId = "";

        rows.forEach((row) => {
          // Try to read columns considering possible whitespace
          const teamCol = getColumnKey(row, ["الفريق"]);
          const teamIdCol = getColumnKey(row, teamIdHeaders);
          const sourceTeamCol = getColumnKey(row, [
            "الفريق الحالي",
            "الفريق السابق",
            "الفريق القديم",
          ]);
          const sourceTeamIdCol = getColumnKey(row, [
            "معرّف الفريق الحالي",
            "معرف الفريق الحالي",
            "معرّف الفريق السابق",
            "معرف الفريق السابق",
            "معرّف الفريق القديم",
            "معرف الفريق القديم",
            "ID الفريق الحالي",
            "ID الفريق السابق",
          ]);
          const stageCol = getColumnKey(row, stageHeaders);
          const memberCol = getColumnKey(row, ["اسم العضو"]);
          const memberIdCol = getColumnKey(row, memberIdHeaders);
          const pointsCol = getColumnKey(row, ["نقاط العضو"]);

          const teamName = teamCol ? row[teamCol]?.toString().trim() : "";
          const teamIdFromRow = asTrimmedString(
            teamIdCol ? row[teamIdCol] : "",
          );
          const sourceTeamNameFromRow = asTrimmedString(
            sourceTeamCol ? row[sourceTeamCol] : "",
          );
          const sourceTeamIdFromRow = asTrimmedString(
            sourceTeamIdCol ? row[sourceTeamIdCol] : "",
          );
          const stageRaw = stageCol ? row[stageCol] : undefined;
          const stageIdFromRow = resolveStageIdFromCell(stageRaw);
          const memberName = memberCol ? row[memberCol]?.toString().trim() : "";
          const memberUserId = asTrimmedString(
            memberIdCol ? row[memberIdCol] : "",
          );
          const resolvedMemberUserId =
            memberUserId && existingMemberIdMap.has(memberUserId)
              ? memberUserId
              : "";
          const pointsRaw = pointsCol ? row[pointsCol] : undefined;

          if (!teamName && stageIdFromRow && currentParsedTeamName) {
            currentParsedStageId = stageIdFromRow;
          }

          if (teamName) {
            currentParsedTeamName = teamName;
            // Find if team exists (match by ID first, then name + stage)
            let existingTeam = teamIdFromRow
              ? teams.find((t) => t.id === teamIdFromRow)
              : stageIdFromRow
                ? teams.find(
                    (t) =>
                      normalizeTeamName(t.name) ===
                        normalizeTeamName(teamName) &&
                      (t.stageId || "") === stageIdFromRow,
                  )
                : teams.find(
                    (t) =>
                      normalizeTeamName(t.name) === normalizeTeamName(teamName),
                  );

            if (existingTeam) {
              currentParsedTeamId = existingTeam.id;
              currentParsedStageId =
                existingTeam.stageId || stageIdFromRow || "";
            } else {
              // It's a new team
              const normalizedTeamName = normalizeTeamName(teamName);
              const stageKey = stageIdFromRow || "nostage";
              const newTeamKey = teamIdFromRow
                ? `id:${teamIdFromRow}`
                : `${normalizedTeamName}::${stageKey}`;
              if (!newTeamIdMap.has(newTeamKey)) {
                const slug = teamName
                  .trim()
                  .toLowerCase()
                  .replace(/\s+/g, "_")
                  .replace(/[^a-z0-9_]/g, "")
                  .slice(0, 40);
                const newId =
                  teamIdFromRow ||
                  `team_${slug || "new"}_${newTeams.length + 1}_${Date.now()}`;
                const suggestedStageId = stageIdFromRow
                  ? stageIdFromRow
                  : currentStageFilter !== "all" && currentStageFilter
                    ? currentStageFilter
                    : user?.stageId || "";

                newTeamIdMap.set(newTeamKey, newId);
                newTeams.push({
                  id: newId,
                  name: teamName,
                  stageId: stageIdFromRow || "",
                  suggestedStageId,
                });
                currentParsedStageId = stageIdFromRow || suggestedStageId || "";
              }
              currentParsedTeamId = newTeamIdMap.get(newTeamKey)!;
            }
          }

          if (
            memberName &&
            memberName !== "---" &&
            memberName !== "لا يوجد أعضاء" &&
            currentParsedTeamName
          ) {
            const normalizedMember = normalizeMemberName(memberName);
            if (!parsedMembersByTeam.has(currentParsedTeamId)) {
              parsedMembersByTeam.set(currentParsedTeamId, new Set());
            }
            parsedMembersByTeam.get(currentParsedTeamId)!.add(normalizedMember);

            const destinationTeam = teams.find(
              (t) => t.id === currentParsedTeamId,
            );
            const destinationHasMember = !!destinationTeam?.members?.some(
              (m) => normalizeMemberName(m) === normalizedMember,
            );
            let explicitSourceTeamId = sourceTeamIdFromRow;
            if (!explicitSourceTeamId && sourceTeamNameFromRow) {
              const normalizedSourceName = normalizeTeamName(
                sourceTeamNameFromRow,
              );
              const matches = teamNameToIds.get(normalizedSourceName) || [];
              if (matches.length === 1) explicitSourceTeamId = matches[0];
            }
            const explicitSourceTeam = explicitSourceTeamId
              ? {
                  teamId: explicitSourceTeamId,
                  teamName:
                    teamNameById.get(explicitSourceTeamId) ||
                    sourceTeamNameFromRow ||
                    explicitSourceTeamId,
                }
              : null;

            const existingMember = explicitSourceTeam
              ? {
                  teamId: explicitSourceTeam.teamId,
                  teamName: explicitSourceTeam.teamName,
                }
              : resolvedMemberUserId
                ? destinationHasMember
                  ? {
                      teamId: currentParsedTeamId,
                      teamName: currentParsedTeamName,
                    }
                  : existingMemberIdMap.get(resolvedMemberUserId)
                : existingMemberTeamMap.get(normalizedMember);
            const isMoved =
              !!existingMember && existingMember.teamId !== currentParsedTeamId;

            if (isMoved) {
              if (
                !memberMoves.find(
                  (m) =>
                    m.memberName === memberName &&
                    m.fromTeamId === existingMember!.teamId &&
                    m.toTeamId === currentParsedTeamId,
                )
              ) {
                memberMoves.push({
                  memberName,
                  memberUserId: resolvedMemberUserId || null,
                  fromTeamId: existingMember!.teamId,
                  fromTeamName: existingMember!.teamName,
                  toTeamId: currentParsedTeamId,
                  toTeamName: currentParsedTeamName,
                });
              }
            }

            const existingTeam = teams.find(
              (t) => t.id === currentParsedTeamId,
            );
            const isNewMember =
              !explicitSourceTeam &&
              (resolvedMemberUserId
                ? !existingMemberIdMap.has(resolvedMemberUserId) && !isMoved
                : !existingTeam?.members?.includes(memberName) && !isMoved);

            if (
              isNewMember &&
              !newMembers.find(
                (m) =>
                  m.teamId === currentParsedTeamId &&
                  m.memberName === memberName,
              )
            ) {
              newMembers.push({
                teamId: currentParsedTeamId,
                teamName: currentParsedTeamName,
                memberName,
                stageId: currentParsedStageId,
              });
            }

            // Points logic
            if (pointsRaw !== undefined && pointsRaw !== "---") {
              const parsedPoints = parseInt(pointsRaw, 10);
              if (!isNaN(parsedPoints)) {
                const mKey = buildMemberKey({
                  memberUserId: resolvedMemberUserId || null,
                  teamId: currentParsedTeamId,
                  memberName,
                });
                const currentPoints = memberStats[mKey] || 0;

                if (parsedPoints !== currentPoints) {
                  pointUpdates.push({
                    memberKey: mKey,
                    memberName,
                    memberUserId: resolvedMemberUserId || null,
                    teamId: currentParsedTeamId,
                    teamName: currentParsedTeamName,
                    stageId: currentParsedStageId,
                    oldPoints: currentPoints,
                    newPoints: parsedPoints,
                    delta: parsedPoints - currentPoints,
                  });
                }
              }
            }
          }
        });
      });

      // Determine members that exist in DB but are not present anymore in the file (for teams that are being tracked in the file)
      teams.forEach((team) => {
        const parsedMembers = parsedMembersByTeam.get(team.id);
        if (!parsedMembers) return;

        const movedOutMembers = new Set(
          memberMoves
            .filter((m) => m.fromTeamId === team.id)
            .map((m) => normalizeMemberName(m.memberName)),
        );

        (team.members || []).forEach((memberName) => {
          const normalized = normalizeMemberName(memberName);
          if (
            !parsedMembers.has(normalized) &&
            !movedOutMembers.has(normalized)
          ) {
            memberRemovals.push({
              memberName,
              fromTeamId: team.id,
              fromTeamName: team.name,
            });
          }
        });
      });

      if (
        newTeams.length === 0 &&
        newMembers.length === 0 &&
        memberMoves.length === 0 &&
        memberRemovals.length === 0 &&
        pointUpdates.length === 0
      ) {
        showToast("الملف لا يحتوي على تغييرات جديدة", "info");
        return;
      }

      setPreviewData({
        newTeams,
        newMembers,
        memberMoves,
        memberRemovals,
        pointUpdates,
      });
    } catch (error) {
      console.error("Error parsing excel:", error);
      showToast("خطأ في قراءة ملف الإكسيل", "error");
    }
  };

  const updateNewTeamStage = (teamId: string, stageId: string) => {
    setPreviewData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        newTeams: prev.newTeams.map((t) =>
          t.id === teamId ? { ...t, stageId } : t,
        ),
        newMembers: prev.newMembers.map((m) =>
          m.teamId === teamId ? { ...m, stageId } : m,
        ),
        pointUpdates: prev.pointUpdates.map((p) =>
          p.teamId === teamId ? { ...p, stageId } : p,
        ),
      };
    });
  };

  const confirmImport = async () => {
    if (!previewData) return;
    const missingStage = previewData.newTeams.some(
      (t) => !t.stageId || !t.stageId.trim(),
    );
    if (missingStage) {
      showToast("يجب تحديد مرحلة لكل فريق جديد قبل المتابعة", "warning");
      return;
    }
    if (user?.role === "admin") {
      const invalidStage = previewData.newTeams.some(
        (t) => t.stageId !== user.stageId,
      );
      if (invalidStage) {
        showToast("لا يمكن للمشرف اختيار مرحلة مختلفة عن مرحلته", "error");
        return;
      }
    }
    setIsImporting(true);

    try {
      const teamCreationOps: Array<
        (batch: ReturnType<typeof writeBatch>) => void
      > = [];
      const memberAdditionOps: Array<
        (batch: ReturnType<typeof writeBatch>) => void
      > = [];
      const scoreOps: Array<(batch: ReturnType<typeof writeBatch>) => void> =
        [];

      // 1. Create new teams first so subsequent score writes pass Firestore rules.
      previewData.newTeams.forEach((team) => {
        const teamId = team.id;
        const teamRef = doc(db, "teams", teamId);
        const assignedMembers = previewData.newMembers
          .filter((m) => m.teamId === teamId)
          .map((m) => m.memberName);

        teamCreationOps.push((batch) => {
          batch.set(teamRef, {
            name: team.name,
            stageId: team.stageId || null,
            createdBy: user?.uid || "",
            leaderId: user?.uid || "",
            members: assignedMembers,
            memberCount: assignedMembers.length,
            totalPoints: 0,
            createdAt: serverTimestamp(),
          });
        });
      });

      // 2. Prepare moves and removals (based on the parsed Excel data).
      const movedIntoTeam = new Set(
        previewData.memberMoves.map(
          (m) => `${m.toTeamId}:::${normalizeMemberName(m.memberName)}`,
        ),
      );
      const movedOutOfTeam = new Set(
        previewData.memberMoves.map(
          (m) => `${m.fromTeamId}:::${normalizeMemberName(m.memberName)}`,
        ),
      );

      // 3. Update existing teams with new members (excluding those that are being moved).
      const newTeamIds = new Set(previewData.newTeams.map((t) => t.id));
      const memberAdditionsByTeam = previewData.newMembers.reduce(
        (acc, curr) => {
          const normalizedName = normalizeMemberName(curr.memberName);
          const isMoved = movedIntoTeam.has(
            `${curr.teamId}:::${normalizedName}`,
          );
          if (!newTeamIds.has(curr.teamId) && !isMoved) {
            if (!acc[curr.teamId]) acc[curr.teamId] = [];
            acc[curr.teamId].push(curr.memberName);
          }
          return acc;
        },
        {} as Record<string, string[]>,
      );

      Object.entries(memberAdditionsByTeam).forEach(
        ([teamId, membersToAdd]) => {
          const teamRef = doc(db, "teams", teamId);
          memberAdditionOps.push((batch) => {
            batch.update(teamRef, {
              members: arrayUnion(...membersToAdd),
              memberCount: increment(membersToAdd.length),
            });
          });
        },
      );

      // 3. Apply point deltas after all teams referenced by scores exist.
      previewData.pointUpdates.forEach((update) => {
        const scoreRef = doc(collection(db, "scores"));
        const statRef = doc(db, "member_stats", update.memberKey);
        const teamRef = doc(db, "teams", update.teamId);

        const scoreType = update.delta > 0 ? "earn" : "deduct";
        const absoluteDelta = Math.abs(update.delta);

        // Add Score Document
        scoreOps.push((batch) => {
          batch.set(scoreRef, {
            teamId: update.teamId,
            taskId: "import_adjust",
            taskTitle: "تعديل عبر الإكسيل",
            points: absoluteDelta,
            type: scoreType,
            targetType: "member",
            source: "leader",
            registeredBy: user?.uid || "import",
            registeredByName: user?.name || "مستورد",
            stageId: update.stageId || null,
            memberKey: update.memberKey,
            memberUserId: update.memberUserId || null,
            memberName: update.memberName,
            applyToTeamTotal: true,
            timestamp: serverTimestamp(),
            syncedAt: serverTimestamp(),
            pendingSync: false,
            customNote: "تعديل عبر الإكسيل",
          });
        });

        // Update member_stats
        scoreOps.push((batch) => {
          batch.set(
            statRef,
            {
              memberKey: update.memberKey,
              memberName: update.memberName,
              memberUserId: update.memberUserId || null,
              teamId: update.teamId,
              stageId: update.stageId || null,
              totalPoints: increment(update.delta),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        });

        // Update team totals
        scoreOps.push((batch) => {
          batch.update(teamRef, {
            totalPoints: increment(update.delta),
          });
        });
      });

      await commitOperations(teamCreationOps);

      // 4. Execute member moves (if any) to keep old team membership in sync with the Excel file.
      for (const move of previewData.memberMoves) {
        const fromTeam = teams.find((t) => t.id === move.fromTeamId);
        const toTeam = teams.find((t) => t.id === move.toTeamId);

        // If the destination team is newly created in this import, use the preview data
        // to build a best-effort representation of its members.
        const toTeamMembers =
          toTeam?.members ||
          previewData.newMembers
            .filter((m) => m.teamId === move.toTeamId)
            .map((m) => m.memberName);

        await moveTeamMember({
          memberName: move.memberName,
          memberUserId: move.memberUserId || null,
          fromTeam: {
            id: move.fromTeamId,
            members: fromTeam?.members || [],
            stageId: fromTeam?.stageId || null,
          },
          toTeam: {
            id: move.toTeamId,
            members: toTeamMembers,
            stageId:
              (toTeam?.stageId ??
                previewData.newTeams.find((t) => t.id === move.toTeamId)
                  ?.stageId) ||
              null,
          },
        });
      }

      if (removeMissingMembers) {
        // 5. Remove members that were deleted from the Excel sheet (excluding those already moved).
        const teamMemberCountMap = new Map<string, number>();
        teams.forEach((team) => {
          teamMemberCountMap.set(team.id, team.members?.length || 0);
        });
        // Account for moved members that have already been removed from their source team.
        previewData.memberMoves.forEach((move) => {
          teamMemberCountMap.set(
            move.fromTeamId,
            Math.max(0, (teamMemberCountMap.get(move.fromTeamId) || 0) - 1),
          );
        });

        const removalsByTeam = previewData.memberRemovals.reduce(
          (acc, curr) => {
            if (!acc[curr.fromTeamId]) acc[curr.fromTeamId] = [];
            acc[curr.fromTeamId].push(curr.memberName);
            return acc;
          },
          {} as Record<string, string[]>,
        );

        for (const [teamId, memberNames] of Object.entries(removalsByTeam)) {
          let currentCount = teamMemberCountMap.get(teamId) ?? 0;
          for (const memberName of memberNames) {
            currentCount = Math.max(0, currentCount - 1);
            await removeTeamMember(teamId, memberName, currentCount);
          }
        }
      }

      await commitOperations(memberAdditionOps);
      await commitOperations(scoreOps);

      // Log activity manually for the import
      if (previewData.pointUpdates.length > 0) {
        logActivity({
          kind: "score",
          teamId: "bulk",
          teamName: "متعدد",
          taskId: "import",
          taskTitle: "استيراد مجمع",
          points: previewData.pointUpdates.length, // Count of updates
          scoreType: "earn", // dummy
          targetType: "team",
          stageId: user?.stageId || null,
          actorId: user?.uid || "import",
          actorName: user?.name || "مستورد",
          actorRole: user?.role || null,
          customNote: `تم استيراد ${previewData.pointUpdates.length} تعديل نقاط`,
        });
      }

      setPreviewData(null);
      showToast("تم تطبيق التعديلات بنجاح ✅", "success");
      onSuccess();
    } catch (error: any) {
      console.error("Import error:", error);
      if (error?.code === "permission-denied") {
        showToast(
          "فشل الاستيراد بسبب صلاحيات Firestore أو مرحلة غير مطابقة",
          "error",
        );
      } else {
        showToast("فشل في حفظ التعديلات", "error");
      }
    } finally {
      setIsImporting(false);
    }
  };

  return {
    previewData,
    isImporting,
    removeMissingMembers,
    setRemoveMissingMembers,
    parseExcel,
    confirmImport,
    updateNewTeamStage,
    cancelImport: () => setPreviewData(null),
  };
}
