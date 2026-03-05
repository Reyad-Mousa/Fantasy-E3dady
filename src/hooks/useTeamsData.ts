import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove, query, where, addDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { logActivity } from '@/services/activityLogger';

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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        const q = (user.role === 'admin' || user.role === 'leader') && user.stageId
            ? query(collection(db, 'teams'), where('stageId', '==', user.stageId))
            : collection(db, 'teams');

        const unsub = onSnapshot(q, snap => {
            setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamData)));
            setLoading(false);
        });
        return unsub;
    }, [user]);

    const createAuditLog = async ({
        operation,
        entityType,
        entityId,
        entityName,
        stageId,
        details,
    }: {
        operation: 'create' | 'delete' | 'update';
        entityType: 'team' | 'task' | 'member';
        entityId: string;
        entityName: string;
        stageId?: string | null;
        details?: string | null;
    }) => {
        if (!user) return;
        const normalizedStageId = (stageId && stageId.trim()) || (user.stageId && user.stageId.trim()) || null;

        try {
            await addDoc(collection(db, 'logs'), {
                kind: 'audit',
                operation,
                entityType,
                entityId,
                entityName: entityName.trim() || 'غير معروف',
                stageId: normalizedStageId,
                actorId: user.uid,
                actorName: user.name || null,
                actorEmail: user.email || null,
                actorRole: user.role || null,
                details: details || null,
                timestamp: serverTimestamp(),
                source: 'client',
            });
            // Mirror to dedicated activities collection
            logActivity({
                kind: 'audit',
                operation,
                entityType,
                entityId,
                entityName: entityName.trim() || 'غير معروف',
                stageId: normalizedStageId,
                actorId: user.uid,
                actorName: user.name || null,
                actorRole: user.role || null,
                details: details || null,
            });
        } catch (err) {
            console.warn('Failed to write audit log:', err);
        }
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

                await updateDoc(doc(db, 'teams', editingTeam.id), {
                    name: newName,
                    ...(user?.role === 'super_admin' && teamStageId && { stageId: teamStageId }),
                });

                if (oldName !== newName) {
                    await createAuditLog({
                        operation: 'update',
                        entityType: 'team',
                        entityId: editingTeam.id,
                        entityName: newName,
                        stageId: editingTeam.stageId || user?.stageId || null,
                        details: `الاسم السابق: ${oldName}`,
                    });
                }

                showToast('تم تحديث الفريق');
            } else {
                const id = `team_${Date.now()}`;
                let assignedStageId = user?.stageId || null;
                if (user?.role === 'super_admin') {
                    assignedStageId = teamStageId || null;
                }

                await setDoc(doc(db, 'teams', id), {
                    name: teamName.trim(),
                    leaderId: user?.uid || '',
                    totalPoints: 0,
                    memberCount: 0,
                    members: [],
                    createdBy: user?.uid || '',
                    createdAt: serverTimestamp(),
                    stageId: assignedStageId,
                });
                await createAuditLog({
                    operation: 'create',
                    entityType: 'team',
                    entityId: id,
                    entityName: teamName.trim(),
                    stageId: assignedStageId,
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
            await deleteDoc(doc(db, 'teams', team.id));
            await createAuditLog({
                operation: 'delete',
                entityType: 'team',
                entityId: team.id,
                entityName: team.name,
                stageId: team.stageId || user?.stageId || null,
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
            await updateDoc(doc(db, 'teams', team.id), {
                members: arrayUnion(memberName.trim()),
                memberCount: (team.members?.length || 0) + 1,
            });
            await createAuditLog({
                operation: 'create',
                entityType: 'member',
                entityId: `${team.id}:${memberName.trim()}`,
                entityName: memberName.trim(),
                stageId: team.stageId || user?.stageId || null,
                details: `داخل الفريق: ${team.name}`,
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
            await updateDoc(doc(db, 'teams', team.id), {
                members: arrayRemove(memberName),
                memberCount: updatedMembers.length,
            });
            await createAuditLog({
                operation: 'delete',
                entityType: 'member',
                entityId: `${team.id}:${memberName}`,
                entityName: memberName,
                stageId: team.stageId || user?.stageId || null,
                details: `من الفريق: ${team.name}`,
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

    return {
        teams,
        loading,
        saveTeam,
        deleteTeam,
        addMember,
        removeMember
    };
}
