import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, limit, where, type Query, type DocumentData } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { SectionHeader, EmptyState } from './ui/SharedUI';
import { Activity, Trophy, AlertTriangle, Shield, Star, Clock, Users, Plus, Trash2, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import StageBadge from './StageBadge';
import StageFilterBar, { FilterValue } from './StageFilterBar';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';

interface ScoreData {
    id: string;
    teamId: string;
    taskId: string;
    points: number;
    type: 'earn' | 'deduct';
    registeredBy: string;
    registeredByName?: string;
    targetType?: 'team' | 'member';
    memberKey?: string;
    memberName?: string;
    stageId?: string;
    timestamp: any;
}

interface AuditLogData {
    id: string;
    kind?: string;
    operation?: 'create' | 'delete' | 'update' | string;
    entityType?: 'team' | 'task' | 'member' | string;
    entityId?: string;
    entityName?: string;
    stageId?: string;
    actorId?: string | null;
    actorName?: string | null;
    actorEmail?: string | null;
    actorRole?: string | null;
    details?: string | null;
    timestamp: any;
}

type ActivityEvent =
    | { kind: 'score'; id: string; timestamp: any; score: ScoreData }
    | { kind: 'audit'; id: string; timestamp: any; log: AuditLogData };

function toEventDate(value: any): Date {
    if (!value) return new Date(0);
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
    }
    return new Date(0);
}

export default function RecentActivitiesPage({ onBack }: { onBack?: () => void }) {
    const { user } = useAuth();
    const [scores, setScores] = useState<ScoreData[]>([]);
    const [logs, setLogs] = useState<AuditLogData[]>([]);
    const [teams, setTeams] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [scoresError, setScoresError] = useState<string | null>(null);
    const [stageFilter, setStageFilter] = useState<FilterValue>(
        user?.role === 'super_admin' ? 'all' : (user?.stageId as FilterValue) || 'all'
    );

    useEffect(() => {
        if (user?.role !== 'super_admin') {
            setStageFilter((user?.stageId as FilterValue) || 'all');
        }
    }, [user?.role, user?.stageId]);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            setScoresError(null);
            setScores([]);
            setLogs([]);
            return;
        }

        setLoading(true);
        setScoresError(null);

        const unsubscribers: Array<() => void> = [];
        let scoresReady = false;
        let logsReady = false;
        const markReady = () => {
            if (scoresReady && logsReady) setLoading(false);
        };

        // Fetch Teams
        const unsubTeams = onSnapshot(collection(db, 'teams'), snap => {
            setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => {
            setTeams([]);
        });
        unsubscribers.push(unsubTeams);

        // Fetch Users (for actor/registeredBy fallback lookup)
        const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => {
            setUsers([]);
        });
        unsubscribers.push(unsubUsers);

        // Fetch Tasks (for task names)
        const unsubTasks = onSnapshot(collection(db, 'tasks'), snap => {
            setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => {
            setTasks([]);
        });
        unsubscribers.push(unsubTasks);

        if (user.role !== 'super_admin' && !user.stageId) {
            setScores([]);
            setLogs([]);
            setLoading(false);
            setScoresError('تعذر تحميل النشاطات: لا يوجد stageId مرتبط بحسابك. تواصل مع المشرف العام لإعداد المرحلة.');
            return () => {
                unsubscribers.forEach((unsubscribe) => unsubscribe());
            };
        }

        let qScores: Query<DocumentData>;
        let qLogs: Query<DocumentData>;

        if (user.role === 'super_admin') {
            if (stageFilter !== 'all') {
                qScores = query(collection(db, 'scores'), where('stageId', '==', stageFilter), orderBy('timestamp', 'desc'), limit(80));
                qLogs = query(collection(db, 'logs'), where('stageId', '==', stageFilter), orderBy('timestamp', 'desc'), limit(80));
            } else {
                qScores = query(collection(db, 'scores'), orderBy('timestamp', 'desc'), limit(80));
                qLogs = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(80));
            }
        } else if (user.stageId) {
            qScores = query(collection(db, 'scores'), where('stageId', '==', user.stageId), orderBy('timestamp', 'desc'), limit(80));
            qLogs = query(collection(db, 'logs'), where('stageId', '==', user.stageId), orderBy('timestamp', 'desc'), limit(80));
        } else {
            setLoading(false);
            setScores([]);
            setLogs([]);
            setScoresError('تعذر تحميل النشاطات: لا توجد مرحلة مرتبطة بحسابك.');
            return () => {
                unsubscribers.forEach((unsubscribe) => unsubscribe());
            };
        }

        const unsubScores = onSnapshot(qScores, snap => {
            setScores(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScoreData)));
            setScoresError(null);
            scoresReady = true;
            markReady();
        }, (err: any) => {
            console.error('Scores fetch error:', err);
            const permissionMessage = 'لا تملك صلاحية عرض النشاطات لهذه المرحلة. تأكد من ضبط الصلاحيات والمرحلة في claims.';
            const genericMessage = 'حدث خطأ أثناء تحميل سجل النقاط. حاول مرة أخرى.';
            setScores([]);
            setScoresError(err?.code === 'permission-denied' ? permissionMessage : genericMessage);
            scoresReady = true;
            markReady();
        });
        unsubscribers.push(unsubScores);

        const unsubLogs = onSnapshot(qLogs, snap => {
            const auditRows = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as AuditLogData))
                .filter((row) => row.kind === 'audit' && (row.operation === 'create' || row.operation === 'delete' || row.operation === 'update'));
            setLogs(auditRows);
            logsReady = true;
            markReady();
        }, (err: any) => {
            console.error('Logs fetch error:', err);
            setLogs([]);
            logsReady = true;
            markReady();
        });
        unsubscribers.push(unsubLogs);

        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
        };
    }, [user, stageFilter]);

    const activityEvents = useMemo<ActivityEvent[]>(() => {
        const scoreEvents: ActivityEvent[] = scores.map((score) => ({
            kind: 'score',
            id: `score_${score.id}`,
            timestamp: score.timestamp,
            score,
        }));

        const auditEvents: ActivityEvent[] = logs.map((log) => ({
            kind: 'audit',
            id: `log_${log.id}`,
            timestamp: log.timestamp,
            log,
        }));

        return [...scoreEvents, ...auditEvents]
            .sort((a, b) => toEventDate(b.timestamp).getTime() - toEventDate(a.timestamp).getTime());
    }, [scores, logs]);

    const groupedEvents = useMemo(() => {
        const grouped: { label: string; items: ActivityEvent[] }[] = [];
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const todayStr = today.toDateString();
        const yesterdayStr = yesterday.toDateString();

        activityEvents.forEach((event) => {
            const eventDate = toEventDate(event.timestamp);
            const dateStr = eventDate.toDateString();
            let label: string;

            if (dateStr === todayStr) label = 'اليوم';
            else if (dateStr === yesterdayStr) label = 'أمس';
            else label = eventDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

            const existing = grouped.find(g => g.label === label);
            if (existing) {
                existing.items.push(event);
            } else {
                grouped.push({ label, items: [event] });
            }
        });

        return grouped;
    }, [activityEvents]);

    if (!user) {
        return (
            <div dir="rtl" className="glass-card p-12 text-center">
                <div className="text-5xl mb-4">🔐</div>
                <h3 className="text-xl font-bold text-text-primary mb-2">يتطلب تسجيل الدخول</h3>
                <p className="text-text-secondary text-sm">يرجى تسجيل الدخول لرؤية النشاطات</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="text-center py-16">
                <div className="spinner mx-auto mb-4" />
                <p className="text-text-secondary font-bold">جاري تحميل النشاطات...</p>
            </div>
        );
    }

    if (scoresError) {
        return (
            <div dir="rtl" className="space-y-6 pb-12">
                <SectionHeader
                    title="سجل النشاطات"
                    subtitle="متابعة فورية لجميع تحركات وأرصدة الفرق"
                    onBack={onBack}
                />
                <div className="glass-card border border-danger/30 bg-danger/5 p-8 text-center">
                    <div className="text-4xl mb-3">⚠️</div>
                    <h3 className="text-lg font-bold text-text-primary mb-2">تعذر تحميل النشاطات</h3>
                    <p className="text-text-secondary text-sm">{scoresError}</p>
                </div>
            </div>
        );
    }

    const createLogsCount = logs.filter((l) => l.operation === 'create').length;
    const deleteLogsCount = logs.filter((l) => l.operation === 'delete').length;

    return (
        <div dir="rtl" className="space-y-6 pb-12">
            <SectionHeader
                title="سجل النشاطات"
                subtitle="متابعة فورية لجميع تحركات وأرصدة الفرق"
                onBack={onBack}
                action={
                    <div className="bg-gradient-to-br from-primary to-accent p-2.5 rounded-xl shadow-lg hidden sm:block">
                        <Activity className="w-5 h-5 text-white" />
                    </div>
                }
            />

            {user.role === 'super_admin' && (
                <StageFilterBar active={stageFilter} onChange={setStageFilter} showAll={true} />
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-success">{scores.filter(s => s.type === 'earn').length}</div>
                    <div className="text-[10px] text-text-muted font-bold mt-1">عمليات إضافة</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-danger">{scores.filter(s => s.type === 'deduct').length}</div>
                    <div className="text-[10px] text-text-muted font-bold mt-1">عمليات خصم</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-primary-light">
                        +{scores.filter(s => s.type === 'earn').reduce((sum, s) => sum + s.points, 0)}
                    </div>
                    <div className="text-[10px] text-text-muted font-bold mt-1">إجمالي الإضافة</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-accent">
                        -{scores.filter(s => s.type === 'deduct').reduce((sum, s) => sum + s.points, 0)}
                    </div>
                    <div className="text-[10px] text-text-muted font-bold mt-1">إجمالي الخصم</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-success">{createLogsCount}</div>
                    <div className="text-[10px] text-text-muted font-bold mt-1">عمليات إنشاء</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-danger">{deleteLogsCount}</div>
                    <div className="text-[10px] text-text-muted font-bold mt-1">عمليات حذف</div>
                </div>
            </div>

            {groupedEvents.length === 0 ? (
                <div className="glass-card">
                    <EmptyState icon="📝" title="لا توجد نشاطات" description="لا توجد عمليات نقاط أو إنشاء/حذف بعد" />
                </div>
            ) : (
                groupedEvents.map((group, gi) => (
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
                            {group.items.map((event, index) => {
                                const eventDate = toEventDate(event.timestamp);
                                const timeAgo = formatDistanceToNow(eventDate, { addSuffix: true, locale: ar });

                                if (event.kind === 'score') {
                                    const score = event.score;
                                    const team = teams.find((t) => t.id === score.teamId);
                                    const registeredByUser = users.find((u) => u.id === score.registeredBy);
                                    const task = tasks.find((t) => t.id === score.taskId);
                                    const isEarn = score.type === 'earn';
                                    const stageId = score.stageId || team?.stageId;

                                    return (
                                        <motion.div
                                            key={event.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.03 }}
                                            className="p-4 sm:p-5 hover:bg-white/[0.02] transition-colors"
                                        >
                                            <div className="flex items-start gap-3 sm:gap-4">
                                                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-lg ${isEarn
                                                    ? 'bg-success/10 border-success/30 text-success shadow-success/10'
                                                    : 'bg-danger/10 border-danger/30 text-danger shadow-danger/10'
                                                    }`}>
                                                    {isEarn ? <Trophy className="w-5 h-5 sm:w-6 sm:h-6" /> : <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="space-y-1.5">
                                                            <h4 className="font-bold text-white text-sm sm:text-base leading-tight">
                                                                {score.targetType === 'member' && score.memberName
                                                                    ? <span className="text-primary-light">{score.memberName}</span>
                                                                    : team?.name || 'فريق محذوف'
                                                                }
                                                            </h4>

                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                {team?.name && score.targetType === 'member' && (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] text-text-muted bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                                                                        <Users className="w-3 h-3" />
                                                                        {team.name}
                                                                    </span>
                                                                )}

                                                                {stageId && <StageBadge stageId={stageId} size="sm" />}
                                                            </div>
                                                        </div>

                                                        <div className={`shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl font-black text-base sm:text-lg border flex items-center gap-1 ${isEarn
                                                            ? 'bg-success/10 text-success border-success/20'
                                                            : 'bg-danger/10 text-danger border-danger/20'
                                                            }`}>
                                                            {isEarn ? '+' : '-'}{score.points}
                                                            <span className="text-[10px] font-bold opacity-70">نقطة</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-xs text-text-secondary">
                                                        <span className="flex items-center gap-1">
                                                            <Star className="w-3.5 h-3.5 text-accent/60" />
                                                            {task?.title || 'مهمة مخصصة'}
                                                        </span>
                                                        <span className="flex items-center gap-1 text-text-muted">
                                                            <Shield className="w-3.5 h-3.5" />
                                                            بواسطة: <span className="text-primary-light/80 font-bold">{score.registeredByName || registeredByUser?.name || registeredByUser?.displayName || registeredByUser?.email?.split('@')[0] || score.registeredBy?.slice(0, 8) || 'غير معروف'}</span>
                                                        </span>
                                                        <span className="text-text-muted/60 text-[10px]">{timeAgo}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                }

                                const log = event.log;
                                const isCreate = log.operation === 'create';
                                const isUpdate = log.operation === 'update';
                                const stageId = log.stageId;
                                const entityTypeLabel: Record<string, string> = {
                                    team: 'فريق',
                                    task: 'مهمة',
                                    member: 'عضو',
                                };
                                const entityLabel = entityTypeLabel[log.entityType || ''] || 'عنصر';
                                const actorUser = users.find((u) => u.id === log.actorId);
                                const actorName = log.actorName || actorUser?.name || actorUser?.displayName || null;
                                const actorEmail = log.actorEmail || actorUser?.email || null;
                                const actorDisplay = actorName
                                    ? (actorEmail ? `${actorName} (${actorEmail})` : actorName)
                                    : (actorEmail || log.actorId || 'غير معروف');

                                return (
                                    <motion.div
                                        key={event.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.03 }}
                                        className="p-4 sm:p-5 hover:bg-white/[0.02] transition-colors"
                                    >
                                        <div className="flex items-start gap-3 sm:gap-4">
                                            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-lg ${isCreate
                                                ? 'bg-success/10 border-success/30 text-success shadow-success/10'
                                                : isUpdate
                                                    ? 'bg-accent/10 border-accent/30 text-accent shadow-accent/10'
                                                    : 'bg-danger/10 border-danger/30 text-danger shadow-danger/10'
                                                }`}>
                                                {isCreate ? <Plus className="w-5 h-5 sm:w-6 sm:h-6" /> : isUpdate ? <FileText className="w-5 h-5 sm:w-6 sm:h-6" /> : <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="space-y-1.5">
                                                        <h4 className="font-bold text-white text-sm sm:text-base leading-tight">
                                                            {isCreate ? 'تم إضافة' : isUpdate ? 'تم تعديل' : 'تم حذف'} {entityLabel} &quot;<span className={isCreate ? 'text-success' : isUpdate ? 'text-accent' : 'text-danger'}>{log.entityName || 'غير معروف'}</span>&quot;
                                                        </h4>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border ${isCreate
                                                                ? 'text-success bg-success/10 border-success/20'
                                                                : isUpdate
                                                                    ? 'text-accent bg-accent/10 border-accent/20'
                                                                    : 'text-danger bg-danger/10 border-danger/20'
                                                                }`}>
                                                                {isCreate ? 'إضافة' : isUpdate ? 'تعديل' : 'حذف'}
                                                            </span>
                                                            {stageId && <StageBadge stageId={stageId} size="sm" />}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-xs text-text-secondary">
                                                    <span className="flex items-center gap-1 text-text-muted">
                                                        <Shield className="w-3.5 h-3.5" />
                                                        بواسطة: <span className="text-primary-light/80 font-bold">{actorDisplay}</span>
                                                    </span>
                                                    {log.details && (
                                                        <span className="text-text-muted/80">{log.details}</span>
                                                    )}
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
        </div>
    );
}
