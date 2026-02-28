import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, limit, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { SectionHeader, EmptyState } from './ui/SharedUI';
import { Activity, Trophy, AlertTriangle, Shield, Star, Clock, Users } from 'lucide-react';
import { motion } from 'motion/react';
import StageBadge from './StageBadge';
import StageFilterBar, { FilterValue } from './StageFilterBar';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import { STAGES, StageId } from '@/config/stages';

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


export default function RecentActivitiesPage({ onBack }: { onBack?: () => void }) {
    const { user } = useAuth();
    const [scores, setScores] = useState<ScoreData[]>([]);
    const [teams, setTeams] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stageFilter, setStageFilter] = useState<FilterValue>(
        user?.role === 'super_admin' ? 'all' : (user?.stageId as FilterValue) || 'all'
    );

    useEffect(() => {
        // Fetch Teams
        const unsubTeams = onSnapshot(collection(db, 'teams'), snap => {
            setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Fetch Users (for registeredBy name lookup — may fail for non-super_admin due to rules)
        const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => {
            // Silently handle permission errors — names will come from score.registeredByName instead
            setUsers([]);
        });

        // Fetch Tasks (for task names)
        const unsubTasks = onSnapshot(collection(db, 'tasks'), snap => {
            setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Fetch Scores based on role and filter
        let qScores;
        if (user?.role === 'super_admin') {
            // Super admin can see all or filter by stage
            if (stageFilter !== 'all') {
                qScores = query(collection(db, 'scores'), where('stageId', '==', stageFilter), orderBy('timestamp', 'desc'), limit(50));
            } else {
                qScores = query(collection(db, 'scores'), orderBy('timestamp', 'desc'), limit(50));
            }
        } else if (user?.stageId) {
            // Admin/Leader/Member — always scoped to their stage
            qScores = query(collection(db, 'scores'), where('stageId', '==', user.stageId), orderBy('timestamp', 'desc'), limit(50));
        } else {
            qScores = query(collection(db, 'scores'), orderBy('timestamp', 'desc'), limit(50));
        }

        const unsubScores = onSnapshot(qScores, snap => {
            setScores(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScoreData)));
            setLoading(false);
        });

        return () => {
            unsubTeams();
            unsubUsers();
            unsubTasks();
            unsubScores();
        };
    }, [user, stageFilter]);

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

    // Group scores by date for a better display
    const groupedScores: { label: string; items: typeof scores }[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();

    scores.forEach(score => {
        const scoreDate = score.timestamp?.toDate ? score.timestamp.toDate() : new Date();
        const dateStr = scoreDate.toDateString();
        let label: string;

        if (dateStr === todayStr) label = 'اليوم';
        else if (dateStr === yesterdayStr) label = 'أمس';
        else label = scoreDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

        const existing = groupedScores.find(g => g.label === label);
        if (existing) {
            existing.items.push(score);
        } else {
            groupedScores.push({ label, items: [score] });
        }
    });

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

            {/* Stage Filter — only for super_admin */}
            {user.role === 'super_admin' && (
                <StageFilterBar active={stageFilter} onChange={setStageFilter} showAll={true} />
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            </div>

            {/* Activities Timeline */}
            {groupedScores.length === 0 ? (
                <div className="glass-card">
                    <EmptyState icon="📝" title="لا توجد نشاطات" description="لم يتم تسجيل أي نقاط بعد" />
                </div>
            ) : (
                groupedScores.map((group, gi) => (
                    <div key={gi} className="space-y-3">
                        {/* Date Header */}
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                                <Clock className="w-3.5 h-3.5 text-accent" />
                                <span className="text-xs font-bold text-text-secondary">{group.label}</span>
                            </div>
                            <div className="flex-1 h-px bg-white/5" />
                            <span className="text-[10px] text-text-muted font-bold">{group.items.length} عملية</span>
                        </div>

                        {/* Activity Cards */}
                        <div className="glass-card overflow-hidden divide-y divide-white/5">
                            {group.items.map((score, index) => {
                                const team = teams.find(t => t.id === score.teamId);
                                const registeredByUser = users.find(u => u.id === score.registeredBy);
                                const task = tasks.find(t => t.id === score.taskId);
                                const isEarn = score.type === 'earn';
                                const stageId = score.stageId || team?.stageId;

                                const timeAgo = score.timestamp?.toDate
                                    ? formatDistanceToNow(score.timestamp.toDate(), { addSuffix: true, locale: ar })
                                    : 'مؤخراً';

                                return (
                                    <motion.div
                                        key={score.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.03 }}
                                        className="p-4 sm:p-5 hover:bg-white/[0.02] transition-colors"
                                    >
                                        <div className="flex items-start gap-3 sm:gap-4">
                                            {/* Type Icon */}
                                            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-lg ${isEarn
                                                ? 'bg-success/10 border-success/30 text-success shadow-success/10'
                                                : 'bg-danger/10 border-danger/30 text-danger shadow-danger/10'
                                                }`}>
                                                {isEarn ? <Trophy className="w-5 h-5 sm:w-6 sm:h-6" /> : <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />}
                                            </div>

                                            {/* Main Content */}
                                            <div className="flex-1 min-w-0">
                                                {/* Top Row: Target + Points */}
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="space-y-1.5">
                                                        {/* Target Name */}
                                                        <h4 className="font-bold text-white text-sm sm:text-base leading-tight">
                                                            {score.targetType === 'member' && score.memberName
                                                                ? <span className="text-primary-light">{score.memberName}</span>
                                                                : team?.name || 'فريق محذوف'
                                                            }
                                                        </h4>

                                                        {/* Tags: Team + Stage */}
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {/* Team Name tag (show when target is a member) */}
                                                            {team?.name && score.targetType === 'member' && (
                                                                <span className="inline-flex items-center gap-1 text-[10px] text-text-muted bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                                                                    <Users className="w-3 h-3" />
                                                                    {team.name}
                                                                </span>
                                                            )}

                                                            {/* Stage Badge */}
                                                            {stageId && <StageBadge stageId={stageId} size="sm" />}
                                                        </div>
                                                    </div>

                                                    {/* Points Badge */}
                                                    <div className={`shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl font-black text-base sm:text-lg border flex items-center gap-1 ${isEarn
                                                        ? 'bg-success/10 text-success border-success/20'
                                                        : 'bg-danger/10 text-danger border-danger/20'
                                                        }`}>
                                                        {isEarn ? '+' : '-'}{score.points}
                                                        <span className="text-[10px] font-bold opacity-70">نقطة</span>
                                                    </div>
                                                </div>

                                                {/* Bottom Row: Task + RegisteredBy + Time */}
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
                            })}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
