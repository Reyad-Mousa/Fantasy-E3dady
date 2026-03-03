import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast, SectionHeader, EmptyState, ConfirmModal } from './ui/SharedUI';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit3, Trash2, X, Users, Trophy, UserPlus, UserMinus } from 'lucide-react';
import StageBadge from './StageBadge';
import StageFilterBar, { FilterValue } from './StageFilterBar';
import { STAGES_LIST } from '@/config/stages';
import { useTeamsData, type TeamData } from '@/hooks/useTeamsData';

export default function TeamsPage({ onBack }: { onBack?: () => void }) {
    const { user } = useAuth();
    const { showToast } = useToast();

    const { teams, loading, saveTeam, deleteTeam, addMember, removeMember } = useTeamsData(user, showToast);

    const [stageFilter, setStageFilter] = useState<FilterValue>('all');

    // Team form
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [teamName, setTeamName] = useState('');
    const [teamStageId, setTeamStageId] = useState('');
    const [editingTeam, setEditingTeam] = useState<TeamData | null>(null);
    const [deleteTeamConfirm, setDeleteTeamConfirm] = useState<TeamData | null>(null);

    // Member add form
    const [addingMemberTo, setAddingMemberTo] = useState<TeamData | null>(null);
    const [newMemberName, setNewMemberName] = useState('');
    const [removeMemberConfirm, setRemoveMemberConfirm] = useState<{ team: TeamData, memberName: string } | null>(null);

    // ──────────── Team CRUD ────────────
    const handleSaveTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        await saveTeam(teamName, teamStageId, editingTeam, () => {
            resetTeamForm();
        });
    };

    const handleDeleteTeam = async () => {
        await deleteTeam(deleteTeamConfirm, () => {
            setDeleteTeamConfirm(null);
        });
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
        await addMember(addingMemberTo, newMemberName, (updatedTeam) => {
            setNewMemberName('');
            setAddingMemberTo(updatedTeam);
        });
    };

    const handleRemoveMember = async () => {
        if (!removeMemberConfirm) return;
        const { team, memberName } = removeMemberConfirm;

        await removeMember(team, memberName, (updatedTeam) => {
            if (addingMemberTo?.id === team.id) {
                setAddingMemberTo(updatedTeam);
            }
            setRemoveMemberConfirm(null);
        });
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

    const filteredTeams = stageFilter === 'all'
        ? teams
        : teams.filter(t => t.stageId === stageFilter);

    return (
        <div dir="rtl" className="space-y-6">
            <SectionHeader
                title="إدارة الفرق"
                subtitle="أنشئ الفرق وأضِف الأعضاء يدوياً"
                onBack={onBack}
                action={(user?.role === 'admin' || user?.role === 'leader') && user?.stageId ? <StageBadge stageId={user.stageId} size="md" /> : undefined}
            />

            {/* Create Team Button & Filter Component */}
            <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full`}>
                <div className="flex flex-wrap items-center gap-4">
                    {user?.role === 'super_admin' && (
                        <StageFilterBar
                            active={stageFilter}
                            onChange={setStageFilter}
                            showAll={true}
                        />
                    )}
                </div>

                <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border/50 text-sm font-bold text-text-secondary w-full sm:w-auto justify-center">
                        <Users className="w-4 h-4 text-primary" />
                        <span>عدد الفرق:</span>
                        <span className="text-text-primary bg-primary/20 text-primary-light border-primary/50 flex items-center justify-center w-6 h-6 rounded-full">{filteredTeams.length}</span>
                    </div>
                    <button onClick={() => setShowTeamModal(true)} className="btn btn-primary text-sm w-full sm:w-auto">
                        <Plus className="w-4 h-4" />
                        فريق جديد
                    </button>
                </div>
            </div>

            {/* Teams Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTeams.map(team => (
                    <motion.div
                        key={team.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="glass-card glass-card-hover p-5"
                    >
                        {/* Team Header */}
                        <div className="flex items-start justify-between mb-4 gap-3">
                            <div className="flex items-start sm:items-center gap-3 min-w-0">
                                <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white font-black text-xl shrink-0 shadow-sm border border-white/10">
                                    {team.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-text-primary text-base sm:text-lg truncate" title={team.name}>{team.name}</h3>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                        <span className="flex items-center gap-1 text-[11px] font-bold text-text-secondary bg-surface px-2 py-0.5 rounded-lg border border-border/50">
                                            <Trophy className="w-3 h-3 text-accent" />
                                            {team.totalPoints} نقطة
                                        </span>
                                        <span className="flex items-center gap-1 text-[11px] font-bold text-text-secondary bg-surface px-2 py-0.5 rounded-lg border border-border/50">
                                            <Users className="w-3 h-3 text-primary" />
                                            {team.members?.length || 0} عضو
                                        </span>
                                        {team.stageId && <StageBadge stageId={team.stageId} />}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0 bg-surface/50 p-1 rounded-xl border border-border/50">
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
                                    <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setDeleteTeamConfirm(team)}
                                    className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                    title="حذف"
                                >
                                    <Trash2 className="w-4 h-4" />
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
                                                onClick={() => setRemoveMemberConfirm({ team, memberName: member })}
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

            {filteredTeams.length === 0 && (
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
                                                    onClick={() => setRemoveMemberConfirm({ team: addingMemberTo, memberName: member })}
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

            {/* Remove Member Confirm */}
            <ConfirmModal
                isOpen={!!removeMemberConfirm}
                title="إزالة العضو"
                message={`هل أنت متأكد من إزالة "${removeMemberConfirm?.memberName}" من فريق "${removeMemberConfirm?.team.name}"؟`}
                onConfirm={handleRemoveMember}
                onCancel={() => setRemoveMemberConfirm(null)}
                confirmText="إزالة"
                variant="danger"
            />
        </div>
    );
}
