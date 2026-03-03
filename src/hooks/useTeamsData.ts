import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';

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

    const saveTeam = async (
        teamName: string,
        teamStageId: string,
        editingTeam: TeamData | null,
        onSuccess: () => void
    ) => {
        if (!teamName.trim()) return;

        try {
            if (editingTeam) {
                await updateDoc(doc(db, 'teams', editingTeam.id), {
                    name: teamName.trim(),
                    ...(user?.role === 'super_admin' && teamStageId && { stageId: teamStageId }),
                });
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
                showToast('تم إنشاء الفريق بنجاح ✅');
            }
            onSuccess();
        } catch {
            showToast('فشل في حفظ الفريق', 'error');
        }
    };

    const deleteTeam = async (team: TeamData | null, onSuccess: () => void) => {
        if (!team) return;
        try {
            await deleteDoc(doc(db, 'teams', team.id));
            showToast('تم حذف الفريق');
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
            showToast(`تمت إضافة "${memberName.trim()}" للفريق`);

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
            showToast(`تمت إزالة "${memberName}"`);

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
