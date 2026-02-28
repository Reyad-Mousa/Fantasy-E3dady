import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast, SectionHeader, EmptyState, ConfirmModal } from './ui/SharedUI';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit3, Trash2, X, Users, Trophy, UserPlus, UserMinus } from 'lucide-react';
import StageBadge from './StageBadge';
import { STAGES_LIST } from '@/config/stages';

interface TeamData {
    id: string;
    name: string;
    leaderId: string;
    totalPoints: number;
    memberCount: number;
    members?: string[]; // أسماء الأعضاء
    stageId?: string | null;
}

export default function TeamsPage({ onBack }: { onBack?: () => void }) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [teams, setTeams] = useState<TeamData[]>([]);
    const [loading, setLoading] = useState(true);

    // Team form
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [teamName, setTeamName] = useState('');
    const [teamStageId, setTeamStageId] = useState('');
    const [editingTeam, setEditingTeam] = useState<TeamData | null>(null);
    const [deleteTeamConfirm, setDeleteTeamConfirm] = useState<TeamData | null>(null);

    // Member add form
    const [addingMemberTo, setAddingMemberTo] = useState<TeamData | null>(null);
    const [newMemberName, setNewMemberName] = useState('');

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

    // ──────────── Team CRUD ────────────
    const handleSaveTeam = async (e: React.FormEvent) => {
        e.preventDefault();
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

                // Determine stageId:
                // - Admin/Leader: implicitly set to their own stageId
                // - Super Admin: use the selected teamStageId or null
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
            resetTeamForm();
        } catch {
            showToast('فشل في حفظ الفريق', 'error');
        }
    };

    const handleDeleteTeam = async () => {
        if (!deleteTeamConfirm) return;
        try {
            await deleteDoc(doc(db, 'teams', deleteTeamConfirm.id));
            showToast('تم حذف الفريق');
            setDeleteTeamConfirm(null);
        } catch {
            showToast('فشل في حذف الفريق', 'error');
        }
    };

    const resetTeamForm = () => {
        setShowTeamModal(false);
        setEditingTeam(null);
        setTeamName('');
        setTeamStageId('');
    };

    // ──────────── Add/Remove Members ────────────
    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addingMemberTo || !newMemberName.trim()) return;

        try {
            await updateDoc(doc(db, 'teams', addingMemberTo.id), {
                members: arrayUnion(newMemberName.trim()),
                memberCount: (addingMemberTo.members?.length || 0) + 1,
            });
            showToast(`تمت إضافة "${newMemberName.trim()}" للفريق`);
            setNewMemberName('');
            // Update local state
            setAddingMemberTo(prev => prev ? {
                ...prev,
                members: [...(prev.members || []), newMemberName.trim()],
                memberCount: (prev.members?.length || 0) + 1,
            } : null);
        } catch {
            showToast('فشل في إضافة العضو', 'error');
        }
    };

    const handleRemoveMember = async (team: TeamData, memberName: string) => {
        try {
            const updatedMembers = (team.members || []).filter(m => m !== memberName);
            await updateDoc(doc(db, 'teams', team.id), {
                members: arrayRemove(memberName),
                memberCount: updatedMembers.length,
            });
            showToast(`تمت إزالة "${memberName}"`);
            // Update local state for the modal
            if (addingMemberTo?.id === team.id) {
                setAddingMemberTo(prev => prev ? {
                    ...prev,
                    members: updatedMembers,
                    memberCount: updatedMembers.length,
                } : null);
            }
        } catch {
            showToast('فشل في إزالة العضو', 'error');
        }
    };

    if (!user || !['super_admin', 'admin', 'leader'].includes(user.role)) {
        return (
            <div dir="rtl" className="glass-card p-12 text-center">
                <div className="text-5xl mb-4">🔐</div>
                <h3 className="text-xl font-bold text-text-primary mb-2">غير مسموح</h3>
                <p className="text-text-secondary text-sm">ليس لديك صلاحية الوصول</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="text-center py-16">
                <div className="spinner mx-auto mb-4" />
                <p className="text-text-secondary font-bold">جاري تحميل الفرق...</p>
            </div>
        );
    }

    return (
        <div dir="rtl" className="space-y-6">
            <SectionHeader
                title="إدارة الفرق"
                subtitle="أنشئ الفرق وأضِف الأعضاء يدوياً"
                onBack={onBack}
                action={(user?.role === 'admin' || user?.role === 'leader') && user?.stageId ? <StageBadge stageId={user.stageId} size="md" /> : undefined}
            />

            {/* Create Team Button */}
            <div className="flex justify-end">
                <button onClick={() => setShowTeamModal(true)} className="btn btn-primary text-sm">
                    <Plus className="w-4 h-4" />
                    فريق جديد
                </button>
            </div>

            {/* Teams Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map(team => (
                    <motion.div
                        key={team.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="glass-card glass-card-hover p-5"
                    >
                        {/* Team Header */}
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white font-black text-xl">
                                    {team.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-text-primary text-lg">{team.name}</h3>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="flex items-center gap-1 text-xs text-text-muted">
                                            <Trophy className="w-3 h-3 text-accent" />
                                            {team.totalPoints} نقطة
                                        </span>
                                        <span className="flex items-center gap-1 text-xs text-text-muted">
                                            <Users className="w-3 h-3" />
                                            {team.members?.length || 0} عضو
                                        </span>
                                        <StageBadge stageId={team.stageId} />
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => {
                                        setEditingTeam(team);
                                        setTeamName(team.name);
                                        setTeamStageId(team.stageId || '');
                                        setShowTeamModal(true);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"
                                    title="تعديل"
                                >
                                    <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setDeleteTeamConfirm(team)}
                                    className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                    title="حذف"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Members List */}
                        <div className="border-t border-border/30 pt-3 mt-3">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-bold text-text-secondary">الأعضاء</h4>
                                <button
                                    onClick={() => {
                                        setAddingMemberTo(team);
                                        setNewMemberName('');
                                    }}
                                    className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-light transition-colors"
                                >
                                    <UserPlus className="w-3 h-3" />
                                    إضافة
                                </button>
                            </div>

                            {team.members && team.members.length > 0 ? (
                                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                    {team.members.map((member, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between group py-1 px-2 rounded-lg hover:bg-surface/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                                    {member.charAt(0)}
                                                </div>
                                                <span className="text-sm text-text-primary">{member}</span>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveMember(team, member)}
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-danger/10 text-text-muted hover:text-danger transition-all"
                                                title="إزالة"
                                            >
                                                <UserMinus className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-text-muted text-center py-3">لا يوجد أعضاء بعد</p>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>

            {teams.length === 0 && (
                <EmptyState
                    icon="🏆"
                    title="لا توجد فرق"
                    description="أنشئ فريقاً جديداً وأضِف الأعضاء"
                />
            )}

            {/* ──────── Create/Edit Team Modal ──────── */}
            <AnimatePresence>
                {showTeamModal && (
                    <div className="modal-backdrop" onClick={resetTeamForm}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="glass-card p-6 max-w-md w-full"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-text-primary">
                                    {editingTeam ? 'تعديل الفريق' : '🏆 فريق جديد'}
                                </h3>
                                <button onClick={resetTeamForm} className="p-2 hover:bg-surface rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-text-muted" />
                                </button>
                            </div>

                            <form onSubmit={handleSaveTeam} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-secondary">اسم الفريق</label>
                                    <input
                                        type="text"
                                        required
                                        value={teamName}
                                        onChange={e => setTeamName(e.target.value)}
                                        className="input-field"
                                        placeholder="مثال: فريق النسور"
                                        autoFocus
                                    />
                                </div>

                                {user?.role === 'super_admin' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">اختر المرحلة</label>
                                        <select
                                            value={teamStageId}
                                            onChange={e => setTeamStageId(e.target.value)}
                                            className="select-field"
                                            required
                                        >
                                            <option value="">حدد المرحلة الدراسية</option>
                                            {STAGES_LIST.map(stage => (
                                                <option key={stage.id} value={stage.id}>{stage.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <button type="submit" className="btn btn-primary w-full py-3">
                                    {editingTeam ? 'حفظ التعديلات' : 'إنشاء الفريق'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ──────── Add Member Modal ──────── */}
            <AnimatePresence>
                {addingMemberTo && (
                    <div className="modal-backdrop" onClick={() => setAddingMemberTo(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="glass-card p-6 max-w-md w-full"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-text-primary">
                                    👤 إضافة أعضاء — {addingMemberTo.name}
                                </h3>
                                <button onClick={() => setAddingMemberTo(null)} className="p-2 hover:bg-surface rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-text-muted" />
                                </button>
                            </div>

                            {/* Add form */}
                            <form onSubmit={handleAddMember} className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    required
                                    value={newMemberName}
                                    onChange={e => setNewMemberName(e.target.value)}
                                    className="input-field flex-1"
                                    placeholder="اسم العضو"
                                    autoFocus
                                />
                                <button type="submit" className="btn btn-primary shrink-0">
                                    <UserPlus className="w-4 h-4" />
                                    إضافة
                                </button>
                            </form>

                            {/* Current members */}
                            <div className="border-t border-border/30 pt-3">
                                <h4 className="text-xs font-bold text-text-secondary mb-2">
                                    الأعضاء الحاليين ({addingMemberTo.members?.length || 0})
                                </h4>
                                {addingMemberTo.members && addingMemberTo.members.length > 0 ? (
                                    <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                                        {addingMemberTo.members.map((member, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface/30"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                                        {member.charAt(0)}
                                                    </div>
                                                    <span className="text-sm text-text-primary font-bold">{member}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveMember(addingMemberTo, member)}
                                                    className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                                    title="إزالة"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-text-muted text-center py-6">لم يتم إضافة أعضاء بعد</p>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete Team Confirm */}
            <ConfirmModal
                isOpen={!!deleteTeamConfirm}
                title="حذف الفريق"
                message={`هل أنت متأكد من حذف فريق "${deleteTeamConfirm?.name}"؟ سيتم حذف جميع الأعضاء.`}
                onConfirm={handleDeleteTeam}
                onCancel={() => setDeleteTeamConfirm(null)}
                confirmText="حذف"
                variant="danger"
            />
        </div>
    );
}
