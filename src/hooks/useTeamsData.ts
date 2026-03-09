import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
    createTeam,
    updateTeam,
    deleteTeam as deleteTeamService,
    addTeamMember,
    removeTeamMember,
    createAuditLog,
    moveTeamMember,
} from '@/services/teamsService';

export interface TeamData {
    id: string;
    name: string;
    leaderId: string;
    totalPoints: number;
    memberCount: number;
    members?: string[];
    stageId?: string | null;
}

export function useTeamsData(user: any, showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void) {
    const [teams, setTeams] = useState<TeamData[]>([]);
    const [memberStats, setMemberStats] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        const teamsQuery = (user.role === 'admin' || user.role === 'leader') && user.stageId
            ? query(collection(db, 'teams'), where('stageId', '==', user.stageId))
            : collection(db, 'teams');

        const unsubTeams = onSnapshot(teamsQuery, snap => {
            setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamData)));
            setLoading(false);
        });

        const statsQuery = (user.role === 'admin' || user.role === 'leader') && user.stageId
            ? query(collection(db, 'member_stats'), where('stageId', '==', user.stageId))
            : collection(db, 'member_stats');

        const unsubStats = onSnapshot(statsQuery, snap => {
            const stats: Record<string, number> = {};
            snap.docs.forEach(d => {
                const data = d.data();
                if (data.memberKey) {
                    stats[data.memberKey] = data.totalPoints || 0;
                }
            });
            setMemberStats(stats);
        });

        return () => {
            unsubTeams();
            unsubStats();
        };
    }, [user]);

    const resolveStageId = (stageId?: string | null) => {
        return (stageId && stageId.trim()) || (user.stageId && user.stageId.trim()) || null;
    };

    const saveTeam = async (
        teamName: string,
        teamStageId: string,
        editingTeam: TeamData | null,
        onSuccess: () => void
    ) => {
        if (!teamName.trim()) return;
        if (!user) return;

        if (user.role !== 'super_admin' && !user.stageId) {
            showToast('لا يمكن حفظ الفريق قبل تعيين المرحلة', 'error');
            return;
        }

        try {
            if (editingTeam) {
                const oldName = editingTeam.name;
                const newName = teamName.trim();

                await updateTeam({
                    teamId: editingTeam.id,
                    name: newName,
                    stageId: teamStageId,
                    isSuperAdmin: user?.role === 'super_admin',
                });

                if (oldName !== newName) {
                    await createAuditLog({
                        operation: 'update',
                        entityType: 'team',
                        entityId: editingTeam.id,
                        entityName: newName,
                        stageId: resolveStageId(editingTeam.stageId),
                        details: `الاسم السابق: ${oldName}`,
                        actorId: user.uid,
                        actorName: user.name || null,
                        actorEmail: user.email || null,
                        actorRole: user.role || null,
                    });
                }

                showToast('تم تحديث الفريق');
            } else {
                let assignedStageId = user?.stageId || null;
                if (user?.role === 'super_admin') {
                    assignedStageId = teamStageId || null;
                }

                const id = await createTeam({
                    name: teamName,
                    stageId: assignedStageId,
                    createdBy: user?.uid || '',
                    leaderId: user?.uid || '',
                });

                await createAuditLog({
                    operation: 'create',
                    entityType: 'team',
                    entityId: id,
                    entityName: teamName.trim(),
                    stageId: assignedStageId,
                    actorId: user.uid,
                    actorName: user.name || null,
                    actorEmail: user.email || null,
                    actorRole: user.role || null,
                });
                showToast(`تم إنشاء الفريق "${teamName.trim()}" بنجاح ✅`);
            }
            onSuccess();
        } catch (err: any) {
            if (err?.code === 'permission-denied') {
                showToast('مرفوض: تأكد أن role/stageId موجودين لحساب القائد في claims أو users/{uid}', 'error');
                return;
            }
            showToast('فشل في حفظ الفريق', 'error');
        }
    };

    const deleteTeam = async (team: TeamData | null, onSuccess: () => void) => {
        if (!team) return;
        try {
            await deleteTeamService(team.id);
            await createAuditLog({
                operation: 'delete',
                entityType: 'team',
                entityId: team.id,
                entityName: team.name,
                stageId: resolveStageId(team.stageId),
                actorId: user.uid,
                actorName: user.name || null,
                actorEmail: user.email || null,
                actorRole: user.role || null,
            });
            showToast(`تم حذف الفريق "${team.name}"`);
            onSuccess();
        } catch {
            showToast('فشل في حذف الفريق', 'error');
        }
    };

    const addMember = async (
        team: TeamData | null,
        memberName: string,
        onSuccess: (updatedTeam: TeamData) => void
    ) => {
        if (!team || !memberName.trim()) return;
        try {
            await addTeamMember(team.id, memberName, team.members?.length || 0);
            await createAuditLog({
                operation: 'create',
                entityType: 'member',
                entityId: `${team.id}:${memberName.trim()}`,
                entityName: memberName.trim(),
                stageId: resolveStageId(team.stageId),
                details: `داخل الفريق: ${team.name}`,
                actorId: user.uid,
                actorName: user.name || null,
                actorEmail: user.email || null,
                actorRole: user.role || null,
            });
            showToast(`تمت إضافة "${memberName.trim()}" إلى فريق "${team.name}"`);

            const updatedTeam = {
                ...team,
                members: [...(team.members || []), memberName.trim()],
                memberCount: (team.members?.length || 0) + 1,
            };
            onSuccess(updatedTeam);
        } catch {
            showToast('فشل في إضافة العضو', 'error');
        }
    };

    const removeMember = async (
        team: TeamData,
        memberName: string,
        onSuccess: (updatedTeam: TeamData) => void
    ) => {
        try {
            const updatedMembers = (team.members || []).filter(m => m !== memberName);
            await removeTeamMember(team.id, memberName, updatedMembers.length);
            await createAuditLog({
                operation: 'delete',
                entityType: 'member',
                entityId: `${team.id}:${memberName}`,
                entityName: memberName,
                stageId: resolveStageId(team.stageId),
                details: `من الفريق: ${team.name}`,
                actorId: user.uid,
                actorName: user.name || null,
                actorEmail: user.email || null,
                actorRole: user.role || null,
            });
            showToast(`تم حذف العضو "${memberName}" من فريق "${team.name}"`);

            const updatedTeam = {
                ...team,
                members: updatedMembers,
                memberCount: updatedMembers.length,
            };
            onSuccess(updatedTeam);
        } catch {
            showToast('فشل في إزالة العضو', 'error');
        }
    };

    const moveMember = async (
        fromTeam: TeamData,
        toTeam: TeamData,
        memberName: string,
        memberUserId?: string | null,
        onSuccess?: () => void
    ) => {
        try {
            await moveTeamMember({
                memberName,
                fromTeam: { id: fromTeam.id, members: fromTeam.members || [], stageId: fromTeam.stageId },
                toTeam: { id: toTeam.id, members: toTeam.members || [], stageId: toTeam.stageId },
                memberUserId,
            });
            await createAuditLog({
                operation: 'update',
                entityType: 'member',
                entityId: `${toTeam.id}:${memberName.trim()}`,
                entityName: memberName.trim(),
                stageId: resolveStageId(toTeam.stageId),
                details: `نُقل من الفريق: "${fromTeam.name}" إلى الفريق: "${toTeam.name}"`,
                actorId: user.uid,
                actorName: user.name || null,
                actorEmail: user.email || null,
                actorRole: user.role || null,
            });
            showToast(`تم نقل "${memberName.trim()}" إلى فريق "${toTeam.name}" ✅`);
            onSuccess?.();
        } catch (err: any) {
            console.error('moveMember error:', err);
            showToast(`فشل في نقل العضو: ${err?.message || 'خطأ غير معروف'}`, 'error');
        }
    };

    return {
        teams,
        memberStats,
        loading,
        saveTeam,
        deleteTeam,
        addMember,
        removeMember,
        moveMember,
    };
}
