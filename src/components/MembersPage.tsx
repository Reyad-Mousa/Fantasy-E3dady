import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth, canManageMembers, canManageAllTeams } from '@/context/AuthContext';
import { useToast, SectionHeader, EmptyState, ConfirmModal } from './ui/SharedUI';
import MemberScoreDetailsModal, { type MemberDetailsTarget } from './MemberScoreDetailsModal';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Edit3, Trash2, X, Search, UserPlus, Mail, Shield } from 'lucide-react';
import { buildMemberKey } from '@/services/memberKeys';
import { cleanupOrphanMemberStats, deleteUserCascade } from '@/services/usersService';

interface Member {
    id: string;
    name: string;
    email: string;
    role: string;
    teamId: string | null;
}

interface Team {
    id: string;
    name: string;
    leaderId: string;
    memberCount: number;
    stageId?: string | null;
}

export default function MembersPage({ onBack }: { onBack?: () => void }) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [members, setMembers] = useState<Member[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTeamFilter, setSelectedTeamFilter] = useState('all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<Member | null>(null);
    const [memberDetails, setMemberDetails] = useState<MemberDetailsTarget | null>(null);
    const [cleaningOrphans, setCleaningOrphans] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formTeam, setFormTeam] = useState('');

    useEffect(() => {
        const unsub1 = onSnapshot(collection(db, 'users'), (snap) => {
            setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
            setLoading(false);
        });

        const unsub2 = onSnapshot(collection(db, 'teams'), (snap) => {
            setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
        });

        return () => { unsub1(); unsub2(); };
    }, []);

    const filteredMembers = members.filter(m => {
        // Leader can only see their team
        if (user?.role === 'leader' && m.teamId !== user.teamId) return false;

        const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTeam = selectedTeamFilter === 'all' || m.teamId === selectedTeamFilter;
        return matchesSearch && matchesTeam;
    });

    const handleSaveMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !canManageMembers(user.role)) return;

        const teamId = user.role === 'leader' ? user.teamId : formTeam;

        try {
            if (editingMember) {
                await updateDoc(doc(db, 'users', editingMember.id), {
                    name: formName,
                    teamId: teamId || null,
                });
                showToast('تم تحديث بيانات العضو');
            } else {
                // For creating new member doc in Firestore (auth account creation handled by import script)
                const newId = `member_${Date.now()}`;
                await setDoc(doc(db, 'users', newId), {
                    name: formName,
                    email: formEmail,
                    role: 'member',
                    teamId: teamId || null,
                    createdAt: serverTimestamp(),
                });

                // Update team member count
                if (teamId) {
                    await updateDoc(doc(db, 'teams', teamId), {
                        memberCount: increment(1),
                    });
                }
                showToast('تم إضافة العضو بنجاح');
            }

            resetForm();
        } catch (err) {
            console.error(err);
            showToast('فشل في حفظ البيانات', 'error');
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm || !user) return;
        try {
            await deleteUserCascade({
                uid: deleteConfirm.id,
                teamId: deleteConfirm.teamId,
            });
            showToast('تم حذف العضو');
            setDeleteConfirm(null);
        } catch {
            showToast('فشل في حذف العضو', 'error');
        }
    };

    const handleCleanupOrphans = async () => {
        if (!user) return;
        try {
            setCleaningOrphans(true);
            const stageId = user.role === 'super_admin' ? null : (user.stageId || null);
            const { candidateCount, deletedCount } = await cleanupOrphanMemberStats({
                stageId,
                existingUserIds: members.map((m) => m.id),
            });
            showToast(
                deletedCount > 0
                    ? `تم تنظيف ${deletedCount} سجل يتيم من أصل ${candidateCount}`
                    : `لا توجد سجلات يتيمة للتنظيف (تم فحص ${candidateCount})`,
                'success'
            );
        } catch (err) {
            console.error(err);
            showToast('فشل تنظيف السجلات اليتيمة', 'error');
        } finally {
            setCleaningOrphans(false);
        }
    };

    const resetForm = () => {
        setShowAddModal(false);
        setEditingMember(null);
        setFormName('');
        setFormEmail('');
        setFormTeam('');
    };

    const openEditModal = (member: Member) => {
        setEditingMember(member);
        setFormName(member.name);
        setFormEmail(member.email);
        setFormTeam(member.teamId || '');
        setShowAddModal(true);
    };

    const getTeamName = (teamId: string | null) => {
        if (!teamId) return 'بدون فريق';
        return teams.find(t => t.id === teamId)?.name || 'غير معروف';
    };

    const getTeamStageId = (teamId: string | null) => {
        if (!teamId) return null;
        return teams.find(t => t.id === teamId)?.stageId || null;
    };

    const getRoleBadge = (role: string) => {
        const map: Record<string, { label: string; class: string }> = {
            super_admin: { label: 'مشرف عام', class: 'badge-pending' },
            admin: { label: 'مشرف', class: 'badge-sync' },
            leader: { label: 'قائد', class: 'badge-completed' },
            member: { label: 'عضو', class: '' },
        };
        return map[role] || { label: role, class: '' };
    };

    if (!user || !canManageMembers(user.role)) {
        return (
            <div dir="rtl" className="glass-card p-12 text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h3 className="text-xl font-bold text-text-primary mb-2">غير مصرح</h3>
                <p className="text-text-secondary text-sm">ليس لديك صلاحية إدارة الأعضاء</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="text-center py-16">
                <div className="spinner mx-auto mb-4" />
                <p className="text-text-secondary font-bold">جاري تحميل الأعضاء...</p>
            </div>
        );
    }

    return (
        <div dir="rtl" className="space-y-6">
            <SectionHeader
                title="إدارة الأعضاء"
                subtitle="أضف أعضاء وقم بتعيينهم في فرق"
                onBack={onBack}
                action={
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCleanupOrphans}
                            disabled={cleaningOrphans}
                            className="btn btn-ghost text-sm"
                        >
                            <Shield className={`w-4 h-4 ${cleaningOrphans ? 'animate-pulse' : ''}`} />
                            {cleaningOrphans ? 'جاري التنظيف...' : 'تنظيف السجلات اليتيمة'}
                        </button>
                        <button onClick={() => setShowAddModal(true)} className="btn btn-primary text-sm">
                            <UserPlus className="w-4 h-4" />
                            إضافة عضو
                        </button>
                    </div>
                }
            />

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input-field pr-10"
                        placeholder="بحث بالاسم أو البريد..."
                    />
                </div>
                {canManageAllTeams(user.role) && (
                    <select
                        value={selectedTeamFilter}
                        onChange={e => setSelectedTeamFilter(e.target.value)}
                        className="select-field sm:w-48"
                    >
                        <option value="all">جميع الفرق</option>
                        {teams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Members List */}
            <div className="glass-card overflow-hidden">
                {filteredMembers.length > 0 ? (
                    <div className="divide-y divide-border/30">
                        {filteredMembers.map((member, i) => {
                            const roleBadge = getRoleBadge(member.role);
                            return (
                                <motion.div
                                    key={member.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                    className="p-4 flex items-center gap-4 hover:bg-glass transition-colors"
                                >
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center text-white font-bold shrink-0">
                                        {member.name.charAt(0)}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            {member.role === 'member' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setMemberDetails({
                                                        memberKey: buildMemberKey({ memberUserId: member.id, teamId: member.teamId || undefined, memberName: member.name }),
                                                        memberUserId: member.id,
                                                        memberName: member.name,
                                                        name: member.name,
                                                        teamId: member.teamId || '',
                                                        teamName: getTeamName(member.teamId),
                                                        stageId: getTeamStageId(member.teamId),
                                                    })}
                                                    className="font-bold text-text-primary text-sm truncate hover:text-primary-light transition-colors"
                                                >
                                                    {member.name}
                                                </button>
                                            ) : (
                                                <h4 className="font-bold text-text-primary text-sm truncate">{member.name}</h4>
                                            )}
                                            <span className={`badge text-[10px] ${roleBadge.class}`}>{roleBadge.label}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-text-muted text-xs">
                                            <span className="flex items-center gap-1">
                                                <Mail className="w-3 h-3" />
                                                {member.email}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {getTeamName(member.teamId)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => openEditModal(member)}
                                            className="p-2 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirm(member)}
                                            className="p-2 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState icon="👥" title="لا يوجد أعضاء" description="أضف أعضاء للفريق" />
                )}
            </div>

            {/* Add/Edit Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="modal-backdrop" onClick={resetForm}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="glass-card p-6 max-w-md w-full"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-text-primary">
                                    {editingMember ? 'تعديل عضو' : 'إضافة عضو جديد'}
                                </h3>
                                <button onClick={resetForm} className="p-2 hover:bg-surface rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-text-muted" />
                                </button>
                            </div>

                            <form onSubmit={handleSaveMember} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-secondary">الاسم</label>
                                    <input
                                        type="text"
                                        required
                                        value={formName}
                                        onChange={e => setFormName(e.target.value)}
                                        className="input-field"
                                        placeholder="اسم العضو"
                                    />
                                </div>

                                {!editingMember && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">البريد الإلكتروني</label>
                                        <input
                                            type="email"
                                            required
                                            value={formEmail}
                                            onChange={e => setFormEmail(e.target.value)}
                                            className="input-field"
                                            placeholder="email@example.com"
                                            dir="ltr"
                                        />
                                    </div>
                                )}

                                {canManageAllTeams(user.role) && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">الفريق</label>
                                        <select
                                            value={formTeam}
                                            onChange={e => setFormTeam(e.target.value)}
                                            className="select-field"
                                        >
                                            <option value="">بدون فريق</option>
                                            {teams.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <button type="submit" className="btn btn-primary w-full py-3">
                                    {editingMember ? 'حفظ التعديلات' : 'إضافة العضو'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation */}
            <ConfirmModal
                isOpen={!!deleteConfirm}
                title="حذف العضو"
                message={`هل أنت متأكد من حذف العضو "${deleteConfirm?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
                onConfirm={handleDelete}
                onCancel={() => setDeleteConfirm(null)}
                confirmText="حذف"
                variant="danger"
            />

            <MemberScoreDetailsModal
                member={memberDetails}
                onClose={() => setMemberDetails(null)}
                stageScope={user.role === 'super_admin'
                    ? null
                    : (user.stageId || memberDetails?.stageId || null)}
            />
        </div>
    );
}
