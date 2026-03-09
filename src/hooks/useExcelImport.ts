import { useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { db } from '@/services/firebase';
import { doc, writeBatch, collection, serverTimestamp, increment } from 'firebase/firestore';
import { TeamData } from './useTeamsData';
import { buildMemberKey } from '@/services/memberKeys';
import { logActivity } from '@/services/activityLogger';

export interface ImportPreviewData {
    newTeams: { name: string; stageId: string; }[];
    newMembers: { teamId: string; teamName: string; memberName: string; stageId: string }[];
    pointUpdates: {
        memberKey: string;
        memberName: string;
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
    showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void,
    onSuccess: () => void
) {
    const [previewData, setPreviewData] = useState<ImportPreviewData | null>(null);
    const [isImporting, setIsImporting] = useState(false);

    const parseExcel = async (file: File, currentStageFilter: string) => {
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);

            const newTeams: ImportPreviewData['newTeams'] = [];
            const newMembers: ImportPreviewData['newMembers'] = [];
            const pointUpdates: ImportPreviewData['pointUpdates'] = [];

            // A map to track team IDs for newly discovered teams within the file
            // to link their members without roundtripping to Firestore.
            const newTeamIdMap = new Map<string, string>();

            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json<any>(sheet);

                let currentParsedTeamName = '';
                let currentParsedTeamId = '';
                let currentParsedStageId = '';

                rows.forEach(row => {
                    // Try to read columns considering possible whitespace
                    const teamCol = Object.keys(row).find(k => k.trim() === 'الفريق');
                    const memberCol = Object.keys(row).find(k => k.trim() === 'اسم العضو');
                    const pointsCol = Object.keys(row).find(k => k.trim() === 'نقاط العضو');

                    const teamName = teamCol ? row[teamCol]?.toString().trim() : '';
                    const memberName = memberCol ? row[memberCol]?.toString().trim() : '';
                    const pointsRaw = pointsCol ? row[pointsCol] : undefined;

                    if (teamName) {
                        currentParsedTeamName = teamName;
                        // Find if team exists
                        let existingTeam = teams.find(t => t.name === teamName);

                        if (existingTeam) {
                            currentParsedTeamId = existingTeam.id;
                            currentParsedStageId = existingTeam.stageId || '';
                        } else {
                            // It's a new team
                            if (!newTeamIdMap.has(teamName)) {
                                const newId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                                // Assign to the current Stage Filter if valid, else fallback to user.stageId
                                const stageIdToAssign = (currentStageFilter !== 'all' && currentStageFilter)
                                    ? currentStageFilter
                                    : (user?.stageId || '');

                                newTeamIdMap.set(teamName, newId);
                                newTeams.push({ name: teamName, stageId: stageIdToAssign });
                                currentParsedStageId = stageIdToAssign;
                            }
                            currentParsedTeamId = newTeamIdMap.get(teamName)!;
                        }
                    }

                    if (memberName && memberName !== '---' && memberName !== 'لا يوجد أعضاء' && currentParsedTeamName) {
                        const existingTeam = teams.find(t => t.id === currentParsedTeamId);
                        const isNewMember = !existingTeam?.members?.includes(memberName);

                        if (isNewMember && !newMembers.find(m => m.teamId === currentParsedTeamId && m.memberName === memberName)) {
                            newMembers.push({
                                teamId: currentParsedTeamId,
                                teamName: currentParsedTeamName,
                                memberName,
                                stageId: currentParsedStageId
                            });
                        }

                        // Points logic
                        if (pointsRaw !== undefined && pointsRaw !== '---') {
                            const parsedPoints = parseInt(pointsRaw, 10);
                            if (!isNaN(parsedPoints)) {
                                const mKey = buildMemberKey({ teamId: currentParsedTeamId, memberName });
                                const currentPoints = memberStats[mKey] || 0;

                                if (parsedPoints !== currentPoints) {
                                    pointUpdates.push({
                                        memberKey: mKey,
                                        memberName,
                                        teamId: currentParsedTeamId,
                                        teamName: currentParsedTeamName,
                                        stageId: currentParsedStageId,
                                        oldPoints: currentPoints,
                                        newPoints: parsedPoints,
                                        delta: parsedPoints - currentPoints
                                    });
                                }
                            }
                        }
                    }
                });
            });

            if (newTeams.length === 0 && newMembers.length === 0 && pointUpdates.length === 0) {
                showToast('الملف لا يحتوي على تغييرات جديدة', 'info');
                return;
            }

            setPreviewData({ newTeams, newMembers, pointUpdates });

        } catch (error) {
            console.error("Error parsing excel:", error);
            showToast('خطأ في قراءة ملف الإكسيل', 'error');
        }
    };

    const confirmImport = async () => {
        if (!previewData) return;
        setIsImporting(true);

        try {
            // Firestore transactions limits batch writes to 500
            // We'll construct chunks if needed, but for now assuming typical file < 400 operations
            const BATCH_CHUNK = 400;
            const operations: ((batch: any) => void)[] = [];

            // 1. Create New Teams
            previewData.newTeams.forEach(team => {
                const teamId = previewData.newMembers.find(m => m.teamName === team.name)?.teamId
                    || `team_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

                const teamRef = doc(db, 'teams', teamId);
                const assignedMembers = previewData.newMembers.filter(m => m.teamId === teamId).map(m => m.memberName);

                operations.push((batch) => {
                    batch.set(teamRef, {
                        name: team.name,
                        stageId: team.stageId || null,
                        createdBy: user?.uid || '',
                        leaderId: user?.uid || '',
                        members: assignedMembers,
                        memberCount: assignedMembers.length,
                        totalPoints: 0,
                        createdAt: serverTimestamp()
                    });
                });
            });

            // 2. Add New Members to Existing Teams
            const memberAdditionsByTeam = previewData.newMembers.reduce((acc, curr) => {
                // Only process existing teams, new teams handled above
                if (!previewData.newTeams.find(t => t.name === curr.teamName)) {
                    if (!acc[curr.teamId]) acc[curr.teamId] = [];
                    acc[curr.teamId].push(curr.memberName);
                }
                return acc;
            }, {} as Record<string, string[]>);

            Object.entries(memberAdditionsByTeam).forEach(([teamId, membersToAdd]) => {
                const teamRef = doc(db, 'teams', teamId);
                const team = teams.find(t => t.id === teamId);
                if (team) {
                    operations.push((batch) => {
                        batch.update(teamRef, {
                            members: [...(team.members || []), ...membersToAdd],
                            memberCount: (team.members?.length || 0) + membersToAdd.length
                        });
                    });
                }
            });

            // 3. Process Point Updates
            previewData.pointUpdates.forEach(update => {
                const scoreRef = doc(collection(db, 'scores'));
                const statRef = doc(db, 'member_stats', update.memberKey);
                const teamRef = doc(db, 'teams', update.teamId);

                const scoreType = update.delta > 0 ? 'earn' : 'deduct';
                const absoluteDelta = Math.abs(update.delta);

                // Add Score Document
                operations.push((batch) => {
                    batch.set(scoreRef, {
                        teamId: update.teamId,
                        taskId: 'import_adjust',
                        points: absoluteDelta,
                        type: scoreType,
                        targetType: 'member',
                        source: 'leader',
                        registeredBy: user?.uid || 'import',
                        registeredByName: user?.name || 'مستورد',
                        stageId: update.stageId || null,
                        memberKey: update.memberKey,
                        memberUserId: null,
                        memberName: update.memberName,
                        applyToTeamTotal: true,
                        timestamp: serverTimestamp(),
                        syncedAt: serverTimestamp(),
                        pendingSync: false,
                        customNote: 'تعديل مجمع عبر ملف إكسيل'
                    });
                });

                // Update member_stats
                operations.push((batch) => {
                    batch.set(statRef, {
                        memberKey: update.memberKey,
                        memberName: update.memberName,
                        teamId: update.teamId,
                        stageId: update.stageId || null,
                        totalPoints: increment(update.delta),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                });

                // Update team totals
                operations.push((batch) => {
                    batch.update(teamRef, {
                        totalPoints: increment(update.delta)
                    });
                });
            });

            // Execute Batches
            for (let i = 0; i < operations.length; i += BATCH_CHUNK) {
                const chunk = operations.slice(i, i + BATCH_CHUNK);
                const batch = writeBatch(db);
                chunk.forEach(op => op(batch));
                await batch.commit();
            }

            // Log activity manually for the import
            if (previewData.pointUpdates.length > 0) {
                logActivity({
                    kind: 'score',
                    teamId: 'bulk',
                    teamName: 'متعدد',
                    taskId: 'import',
                    taskTitle: 'استيراد مجمع',
                    points: previewData.pointUpdates.length, // Count of updates
                    scoreType: 'earn', // dummy
                    targetType: 'team',
                    stageId: user?.stageId || null,
                    actorId: user?.uid || 'import',
                    actorName: user?.name || 'مستورد',
                    actorRole: user?.role || null,
                    customNote: `تم استيراد ${previewData.pointUpdates.length} تعديل نقاط`
                });
            }

            setPreviewData(null);
            showToast('تم تطبيق التعديلات بنجاح ✅', 'success');
            onSuccess();
        } catch (error) {
            console.error("Import error:", error);
            showToast('فشل في حفظ التعديلات', 'error');
        } finally {
            setIsImporting(false);
        }
    };

    return {
        previewData,
        isImporting,
        parseExcel,
        confirmImport,
        cancelImport: () => setPreviewData(null)
    };
}
