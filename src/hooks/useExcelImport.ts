import { useState } from 'react';
import * as XLSX from 'xlsx';
import { db } from '@/services/firebase';
import { doc, writeBatch, collection, serverTimestamp, increment, arrayUnion } from 'firebase/firestore';
import { TeamData } from './useTeamsData';
import { buildMemberKey } from '@/services/memberKeys';
import { logActivity } from '@/services/activityLogger';

export interface ImportPreviewData {
    newTeams: { id: string; name: string; stageId: string; suggestedStageId?: string | null; }[];
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

    const commitOperations = async (operations: Array<(batch: ReturnType<typeof writeBatch>) => void>, chunkSize = 450) => {
        for (let i = 0; i < operations.length; i += chunkSize) {
            const batch = writeBatch(db);
            operations.slice(i, i + chunkSize).forEach(operation => operation(batch));
            await batch.commit();
        }
    };

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
                                const slug = teamName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40);
                                const newId = `team_${slug || 'new'}_${newTeams.length + 1}_${Date.now()}`;
                                const suggestedStageId = (currentStageFilter !== 'all' && currentStageFilter)
                                    ? currentStageFilter
                                    : (user?.stageId || '');

                                newTeamIdMap.set(teamName, newId);
                                newTeams.push({ id: newId, name: teamName, stageId: '', suggestedStageId });
                                currentParsedStageId = suggestedStageId;
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

    const updateNewTeamStage = (teamId: string, stageId: string) => {
        setPreviewData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                newTeams: prev.newTeams.map(t => t.id === teamId ? { ...t, stageId } : t),
                newMembers: prev.newMembers.map(m => m.teamId === teamId ? { ...m, stageId } : m),
                pointUpdates: prev.pointUpdates.map(p => p.teamId === teamId ? { ...p, stageId } : p),
            };
        });
    };

    const confirmImport = async () => {
        if (!previewData) return;
        const missingStage = previewData.newTeams.some(t => !t.stageId || !t.stageId.trim());
        if (missingStage) {
            showToast('يجب تحديد مرحلة لكل فريق جديد قبل المتابعة', 'warning');
            return;
        }
        if (user?.role === 'admin') {
            const invalidStage = previewData.newTeams.some(t => t.stageId !== user.stageId);
            if (invalidStage) {
                showToast('لا يمكن للمشرف اختيار مرحلة مختلفة عن مرحلته', 'error');
                return;
            }
        }
        setIsImporting(true);

        try {
            const teamCreationOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
            const memberAdditionOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
            const scoreOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

            // 1. Create new teams first so subsequent score writes pass Firestore rules.
            previewData.newTeams.forEach(team => {
                const teamId = team.id;
                const teamRef = doc(db, 'teams', teamId);
                const assignedMembers = previewData.newMembers.filter(m => m.teamId === teamId).map(m => m.memberName);

                teamCreationOps.push((batch) => {
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

            // 2. Update existing teams with new members.
            const newTeamIds = new Set(previewData.newTeams.map(t => t.id));
            const memberAdditionsByTeam = previewData.newMembers.reduce((acc, curr) => {
                if (!newTeamIds.has(curr.teamId)) {
                    if (!acc[curr.teamId]) acc[curr.teamId] = [];
                    acc[curr.teamId].push(curr.memberName);
                }
                return acc;
            }, {} as Record<string, string[]>);

            Object.entries(memberAdditionsByTeam).forEach(([teamId, membersToAdd]) => {
                const teamRef = doc(db, 'teams', teamId);
                memberAdditionOps.push((batch) => {
                    batch.update(teamRef, {
                        members: arrayUnion(...membersToAdd),
                        memberCount: increment(membersToAdd.length)
                    });
                });
            });

            // 3. Apply point deltas after all teams referenced by scores exist.
            previewData.pointUpdates.forEach(update => {
                const scoreRef = doc(collection(db, 'scores'));
                const statRef = doc(db, 'member_stats', update.memberKey);
                const teamRef = doc(db, 'teams', update.teamId);

                const scoreType = update.delta > 0 ? 'earn' : 'deduct';
                const absoluteDelta = Math.abs(update.delta);

                // Add Score Document
                scoreOps.push((batch) => {
                    batch.set(scoreRef, {
                        teamId: update.teamId,
                        taskId: 'import_adjust',
                        taskTitle: 'تعديل عبر الإكسيل',
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
                        customNote: 'تعديل عبر الإكسيل'
                    });
                });

                // Update member_stats
                scoreOps.push((batch) => {
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
                scoreOps.push((batch) => {
                    batch.update(teamRef, {
                        totalPoints: increment(update.delta)
                    });
                });
            });

            await commitOperations(teamCreationOps);
            await commitOperations(memberAdditionOps);
            await commitOperations(scoreOps);

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
        } catch (error: any) {
            console.error("Import error:", error);
            if (error?.code === 'permission-denied') {
                showToast('فشل الاستيراد بسبب صلاحيات Firestore أو مرحلة غير مطابقة', 'error');
            } else {
                showToast('فشل في حفظ التعديلات', 'error');
            }
        } finally {
            setIsImporting(false);
        }
    };

    return {
        previewData,
        isImporting,
        parseExcel,
        confirmImport,
        updateNewTeamStage,
        cancelImport: () => setPreviewData(null)
    };
}
