import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, limit, where, getDocs, type QuerySnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { SectionHeader, EmptyState, useToast } from './ui/SharedUI';
import { Activity, Trophy, AlertTriangle, Shield, Star, Clock, Users, Plus, Trash2, FileText, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import StageBadge from './StageBadge';
import StageFilterBar, { FilterValue } from './StageFilterBar';
import MemberScoreDetailsModal, { type MemberDetailsTarget } from './MemberScoreDetailsModal';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import { buildMemberKey } from '@/services/memberKeys';
import { toEventDate } from '@/utils/helpers';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityDoc {
    id: string;
    kind: 'score' | 'audit';
    timestamp: any;
    stageId?: string | null;

    // score fields
    teamId?: string;
    teamName?: string | null;
    taskId?: string | null;
    taskTitle?: string | null;
    points?: number;
    scoreType?: 'earn' | 'deduct';
    targetType?: 'team' | 'member';
    memberKey?: string | null;
    memberUserId?: string | null;
    memberName?: string | null;
    customNote?: string | null;

    // audit fields
    operation?: 'create' | 'update' | 'delete';
    entityType?: string;
    entityId?: string;
    entityName?: string;
    details?: string | null;

    // actor
    actorId?: string;
    actorName?: string | null;
    actorRole?: string | null;
}

interface GlobalStats {
    earnCount: number;
    deductCount: number;
    earnTotal: number;
    deductTotal: number;
    createCount: number;
    deleteCount: number;
}

// toEventDate is imported from @/utils/helpers

// ── Component ─────────────────────────────────────────────────────────────────

export default function RecentActivitiesPage({ onBack }: { onBack?: () => void }) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [activities, setActivities] = useState<ActivityDoc[]>([]);
    const [teams, setTeams] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stageFilter, setStageFilter] = useState<FilterValue>(
        user?.role === 'super_admin' ? 'all' : (user?.stageId as FilterValue) || 'all'
    );
    const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
    const [calculating, setCalculating] = useState(false);
    const [memberDetails, setMemberDetails] = useState<MemberDetailsTarget | null>(null);

    useEffect(() => {
        if (user?.role !== 'super_admin') {
            setStageFilter((user?.stageId as FilterValue) || 'all');
        }
    }, [user?.role, user?.stageId]);

    // Fetch teams (for team name fallback lookup)
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'teams'), snap => {
            setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => setTeams([]));
        return unsub;
    }, []);

    // Fetch activities
    useEffect(() => {
        if (!user) { setLoading(false); setActivities([]); return; }

        setLoading(true);
        setError(null);

        let q: ReturnType<typeof query>;
        if (user.role === 'super_admin') {
            // super_admin: fetch all, or filter by stage if selected
            q = stageFilter !== 'all'
                ? query(collection(db, 'activities'), where('stageId', '==', stageFilter), orderBy('timestamp', 'desc'), limit(200))
                : query(collection(db, 'activities'), orderBy('timestamp', 'desc'), limit(200));
        } else if (user.stageId) {
            // admin/leader with a stageId: fetch all activities, then filter on client
            // to include both stage-specific AND global (stageId = null) activities.
            // We pull a broader set and filter client-side since Firestore doesn't support
            // OR queries on the same field easily.
            q = query(collection(db, 'activities'), orderBy('timestamp', 'desc'), limit(200));
        } else {
            // admin/leader without stageId — fall back to showing all and warn
            q = query(collection(db, 'activities'), orderBy('timestamp', 'desc'), limit(200));
        }

        const unsub = onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
            let docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityDoc));

            // Client-side filter for stage-scoped roles
            if (user.role !== 'super_admin' && user.stageId) {
                docs = docs.filter(a => a.stageId === user.stageId);
            }

            setActivities(docs);
            setLoading(false);
        }, (err: any) => {
            console.error('Activities fetch error:', err);
            setActivities([]);
            setError(err?.code === 'permission-denied'
                ? 'لا تملك صلاحية عرض النشاطات. تواصل مع المشرف العام.'
                : 'حدث خطأ أثناء تحميل النشاطات. حاول مرة أخرى.');
            setLoading(false);
        });

        return unsub;
    }, [user, stageFilter]);

    // Global stats calculation
    const handleCalculateGlobalStats = async () => {
        if (!user) return;
        setCalculating(true);
        try {
            let q: any = collection(db, 'activities');
            if (user.role !== 'super_admin' || stageFilter !== 'all') {
                const targetStage = user.role === 'super_admin' ? stageFilter : user.stageId;
                q = query(q, where('stageId', '==', targetStage));
            }
            const snap = await getDocs(q);
            const stats: GlobalStats = { earnCount: 0, deductCount: 0, earnTotal: 0, deductTotal: 0, createCount: 0, deleteCount: 0 };
            snap.forEach(d => {
                const a = d.data() as ActivityDoc;
                if (a.kind === 'score') {
                    if (a.scoreType === 'earn') { stats.earnCount++; stats.earnTotal += Math.abs(a.points || 0); }
                    else { stats.deductCount++; stats.deductTotal += Math.abs(a.points || 0); }
                } else if (a.kind === 'audit') {
                    if (a.operation === 'create') stats.createCount++;
                    else if (a.operation === 'delete') stats.deleteCount++;
                }
            });
            setGlobalStats(stats);
            showToast('تم تحديث الإحصائيات الشاملة بنجاح ✅');
        } catch (err) {
            console.error('Error calculating global stats:', err);
        } finally {
            setCalculating(false);
        }
    };

    // Group by date
    const groupedActivities = useMemo(() => {
        const grouped: { label: string; items: ActivityDoc[] }[] = [];
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const todayStr = today.toDateString();
        const yesterdayStr = yesterday.toDateString();

        activities.forEach(activity => {
            const eventDate = toEventDate(activity.timestamp);
            const dateStr = eventDate.toDateString();
            let label: string;
            if (dateStr === todayStr) label = 'اليوم';
            else if (dateStr === yesterdayStr) label = 'أمس';
            else label = eventDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

            const existing = grouped.find(g => g.label === label);
            if (existing) existing.items.push(activity);
            else grouped.push({ label, items: [activity] });
        });
        return grouped;
    }, [activities]);

    // Local stat counters (visible page only)
    const scoreActivities = useMemo(() => activities.filter(a => a.kind === 'score'), [activities]);
    const auditActivities = useMemo(() => activities.filter(a => a.kind === 'audit'), [activities]);

    if (!user) return (
        <div dir="rtl" className="glass-card p-12 text-center">
            <div className="text-5xl mb-4">🔐</div>
            <h3 className="text-xl font-bold text-text-primary mb-2">يتطلب تسجيل الدخول</h3>
            <p className="text-text-secondary text-sm">يرجى تسجيل الدخول لرؤية النشاطات</p>
        </div>
    );

    if (loading) return (
        <div className="text-center py-16">
            <div className="spinner mx-auto mb-4" />
            <p className="text-text-secondary font-bold">جاري تحميل النشاطات...</p>
        </div>
    );

    if (error) return (
        <div dir="rtl" className="space-y-6 pb-12">
            <SectionHeader title="سجل النشاطات" subtitle="متابعة فورية لجميع تحركات وأرصدة الفرق" onBack={onBack} />
            <div className="glass-card border border-danger/30 bg-danger/5 p-8 text-center">
                <div className="text-4xl mb-3">⚠️</div>
                <h3 className="text-lg font-bold text-text-primary mb-2">تعذر تحميل النشاطات</h3>
                <p className="text-text-secondary text-sm">{error}</p>
            </div>
        </div>
    );

    return (
        <div dir="rtl" className="space-y-6 pb-12">
            <SectionHeader
                title="سجل النشاطات"
                subtitle="متابعة فورية لجميع تحركات وأرصدة الفرق"
                onBack={onBack}
                action={
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleCalculateGlobalStats}
                            disabled={calculating}
                            className="btn btn-ghost bg-surface/50 text-xs sm:text-sm border border-border/50"
                            title="تحديث الإحصائيات لكامل التاريخ"
                        >
                            {calculating ? <div className="spinner !w-3.5 !h-3.5" /> : <RefreshCw className="w-4 h-4" />}
                            <span className="hidden xs:inline">{globalStats ? 'تحديث الإحصائيات' : 'حساب إجمالي التاريخ'}</span>
                        </button>
                        <div className="bg-gradient-to-br from-primary to-accent p-2.5 rounded-xl shadow-lg hidden sm:block">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                    </div>
                }
            />

            {user.role === 'super_admin' && (
                <StageFilterBar active={stageFilter} onChange={setStageFilter} showAll={true} />
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { value: globalStats ? globalStats.earnCount : scoreActivities.filter(a => a.scoreType === 'earn').length, label: 'عمليات إضافة', color: 'text-success' },
                    { value: globalStats ? globalStats.deductCount : scoreActivities.filter(a => a.scoreType === 'deduct').length, label: 'عمليات خصم', color: 'text-danger' },
                    { value: `+${globalStats ? globalStats.earnTotal : scoreActivities.filter(a => a.scoreType === 'earn').reduce((s, a) => s + (a.points || 0), 0)}`, label: 'إجمالي الإضافة', color: 'text-primary-light' },
                    { value: `-${globalStats ? globalStats.deductTotal : scoreActivities.filter(a => a.scoreType === 'deduct').reduce((s, a) => s + (a.points || 0), 0)}`, label: 'إجمالي الخصم', color: 'text-accent' },
                    { value: globalStats ? globalStats.createCount : auditActivities.filter(a => a.operation === 'create').length, label: 'عمليات إنشاء', color: 'text-success' },
                    { value: globalStats ? globalStats.deleteCount : auditActivities.filter(a => a.operation === 'delete').length, label: 'عمليات حذف', color: 'text-danger' },
                ].map((stat, i) => (
                    <div key={i} className="glass-card p-4 text-center">
                        <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
                        <div className="text-[10px] text-text-muted font-bold mt-1">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Activity List */}
            {groupedActivities.length === 0 ? (
                <div className="glass-card">
                    <EmptyState icon="📝" title="لا توجد نشاطات" description="لا توجد عمليات نقاط أو إنشاء/حذف بعد" />
                </div>
            ) : (
                groupedActivities.map((group, gi) => (
                    <div key={gi} className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                                <Clock className="w-3.5 h-3.5 text-accent" />
                                <span className="text-xs font-bold text-text-secondary">{group.label}</span>
                            </div>
                            <div className="flex-1 h-px bg-white/5" />
                            <span className="text-[10px] text-text-muted font-bold">{group.items.length} عملية</span>
                        </div>

                        <div className="glass-card overflow-hidden divide-y divide-white/5">
                            {group.items.map((activity, index) => {
                                const eventDate = toEventDate(activity.timestamp);
                                const timeAgo = formatDistanceToNow(eventDate, { addSuffix: true, locale: ar });
                                const teamName = activity.teamName || teams.find(t => t.id === activity.teamId)?.name || '؟';

                                if (activity.kind === 'score') {
                                    const isEarn = activity.scoreType === 'earn';
                                    return (
                                        <motion.div
                                            key={activity.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.03 }}
                                            className="p-4 sm:p-5 hover:bg-white/[0.02] transition-colors"
                                        >
                                            <div className="flex items-start gap-3 sm:gap-4">
                                                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-lg ${isEarn
                                                    ? 'bg-success/10 border-success/30 text-success shadow-success/10'
                                                    : 'bg-danger/10 border-danger/30 text-danger shadow-danger/10'}`}>
                                                    {isEarn ? <Trophy className="w-5 h-5 sm:w-6 sm:h-6" /> : <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="space-y-1.5">
                                                            <h4 className="font-bold text-white text-sm sm:text-base leading-tight">
                                                                {activity.targetType === 'member' && activity.memberName
                                                                    ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setMemberDetails({
                                                                                memberKey: activity.memberKey || buildMemberKey({ teamId: activity.teamId, memberName: activity.memberName }),
                                                                                memberName: activity.memberName,
                                                                                name: activity.memberName,
                                                                                memberUserId: activity.memberUserId || null,
                                                                                teamId: activity.teamId || '',
                                                                                teamName,
                                                                                stageId: activity.stageId || null,
                                                                            })}
                                                                            className="text-primary-light hover:text-primary transition-colors"
                                                                        >
                                                                            {activity.memberName}
                                                                        </button>
                                                                    )
                                                                    : teamName
                                                                }
                                                            </h4>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                {activity.targetType === 'member' && (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] text-text-muted bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                                                                        <Users className="w-3 h-3" />{teamName}
                                                                    </span>
                                                                )}
                                                                {activity.stageId && <StageBadge stageId={activity.stageId} size="sm" />}
                                                            </div>
                                                        </div>
                                                        <div className={`shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl font-black text-base sm:text-lg border flex items-center gap-1 ${isEarn
                                                            ? 'bg-success/10 text-success border-success/20'
                                                            : 'bg-danger/10 text-danger border-danger/20'}`}>
                                                            {isEarn ? '+' : '-'}{activity.points}
                                                            <span className="text-[10px] font-bold opacity-70">نقطة</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-xs text-text-secondary">
                                                        <span className="flex items-center gap-1">
                                                            <Star className="w-3.5 h-3.5 text-accent/60" />
                                                            {activity.taskTitle || activity.customNote || 'مهمة مخصصة'}
                                                        </span>
                                                        <span className="flex items-center gap-1 text-text-muted">
                                                            <Shield className="w-3.5 h-3.5" />
                                                            بواسطة: <span className="text-primary-light/80 font-bold">{activity.actorName || 'غير معروف'}</span>
                                                        </span>
                                                        <span className="text-text-muted/60 text-[10px]">{timeAgo}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                }

                                // audit
                                const isCreate = activity.operation === 'create';
                                const isUpdate = activity.operation === 'update';
                                const entityLabel: Record<string, string> = { team: 'فريق', task: 'مهمة', member: 'عضو' };
                                const eLabel = entityLabel[activity.entityType || ''] || 'عنصر';

                                return (
                                    <motion.div
                                        key={activity.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.03 }}
                                        className="p-4 sm:p-5 hover:bg-white/[0.02] transition-colors"
                                    >
                                        <div className="flex items-start gap-3 sm:gap-4">
                                            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-lg ${isCreate
                                                ? 'bg-success/10 border-success/30 text-success shadow-success/10'
                                                : isUpdate ? 'bg-accent/10 border-accent/30 text-accent shadow-accent/10'
                                                    : 'bg-danger/10 border-danger/30 text-danger shadow-danger/10'}`}>
                                                {isCreate ? <Plus className="w-5 h-5 sm:w-6 sm:h-6" /> : isUpdate ? <FileText className="w-5 h-5 sm:w-6 sm:h-6" /> : <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="space-y-1.5">
                                                        <h4 className="font-bold text-white text-sm sm:text-base leading-tight">
                                                            {isCreate ? 'تم إضافة' : (isUpdate && activity.details === 'archived') ? 'تم أرشفة' : isUpdate ? 'تم تعديل' : 'تم حذف'}{' '}
                                                            {eLabel} &quot;<span className={isCreate ? 'text-success' : (isUpdate && activity.details === 'archived') ? 'text-danger' : isUpdate ? 'text-accent' : 'text-danger'}>{activity.entityName || 'غير معروف'}</span>&quot;
                                                        </h4>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border ${isCreate ? 'text-success bg-success/10 border-success/20' : (isUpdate && activity.details === 'archived') ? 'text-danger bg-danger/10 border-danger/20' : isUpdate ? 'text-accent bg-accent/10 border-accent/20' : 'text-danger bg-danger/10 border-danger/20'}`}>
                                                                {isCreate ? 'إضافة' : (isUpdate && activity.details === 'archived') ? 'أرشفة' : isUpdate ? 'تعديل' : 'حذف'}
                                                            </span>
                                                            {activity.stageId && <StageBadge stageId={activity.stageId} size="sm" />}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-xs text-text-secondary">
                                                    <span className="flex items-center gap-1 text-text-muted">
                                                        <Shield className="w-3.5 h-3.5" />
                                                        بواسطة: <span className="text-primary-light/80 font-bold">{activity.actorName || 'غير معروف'}</span>
                                                    </span>
                                                    {activity.details && <span className="text-text-muted/80">{activity.details}</span>}
                                                    <span className="text-text-muted/60 text-[10px]">{timeAgo}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}

            <MemberScoreDetailsModal
                member={memberDetails}
                onClose={() => setMemberDetails(null)}
                stageScope={user.role === 'super_admin'
                    ? (stageFilter === 'all' ? null : stageFilter)
                    : (user.stageId || memberDetails?.stageId || null)}
            />
        </div>
    );
}
