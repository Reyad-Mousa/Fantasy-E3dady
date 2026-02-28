import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth, canRegisterScores } from '@/context/AuthContext';
import { addPendingScore, getPendingSyncCount } from '@/services/offlineDb';
import { isOnline, syncPendingScores } from '@/services/syncService';
import { SectionHeader, SyncBadge, useOnlineStatus, useToast } from './ui/SharedUI';
import { motion } from 'motion/react';
import { Check, Clock, Plus, RefreshCw, TrendingDown, TrendingUp, UserRound, Users } from 'lucide-react';
import StageBadge from './StageBadge';

type TargetType = 'team' | 'member';

interface Score {
    id: string;
    teamId: string;
    taskId: string;
    points: number;
    type: 'earn' | 'deduct';
    source?: 'team' | 'leader';
    registeredBy: string;
    timestamp: any;
    pendingSync?: boolean;
    stageId?: string | null;
    targetType?: TargetType;
    memberKey?: string | null;
    memberUserId?: string | null;
    memberName?: string | null;
    applyToTeamTotal?: boolean;
}

interface Team {
    id: string;
    name: string;
    totalPoints: number;
    stageId?: string | null;
    members?: string[];
}

interface Task {
    id: string;
    title: string;
    points: number;
    type: 'team' | 'leader' | string;
}

interface MemberUser {
    id: string;
    name: string;
    role: string;
    teamId: string | null;
}

interface MemberOption {
    key: string;
    userId: string | null;
    name: string;
    teamId: string;
    source: 'user' | 'team_list';
}

function normalizeName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export default function ScoreRegistration({ onBack }: { onBack?: () => void }) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const online = useOnlineStatus();

    const [scores, setScores] = useState<Score[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [memberUsers, setMemberUsers] = useState<MemberUser[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [syncing, setSyncing] = useState(false);

    const [selectedTeam, setSelectedTeam] = useState('');
    const [selectedTask, setSelectedTask] = useState('');
    const [scoreType, setScoreType] = useState<'earn' | 'deduct'>('earn');
    const [scoreSource] = useState<'team'>('team');
    const [customPoints, setCustomPoints] = useState('');
    const [targetType, setTargetType] = useState<TargetType>('team');
    const [selectedMemberKey, setSelectedMemberKey] = useState('');

    useEffect(() => {
        if (!user) return;
        const stageFilter = (user.role === 'admin' || user.role === 'leader') && user.stageId
            ? where('stageId', '==', user.stageId)
            : null;

        const teamsQuery = stageFilter
            ? query(collection(db, 'teams'), stageFilter)
            : collection(db, 'teams');
        const unsub1 = onSnapshot(teamsQuery, (snap) => {
            setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Team)));
        }, (err) => {
            console.error('Teams fetch error:', err);
        });

        const unsub2 = onSnapshot(query(collection(db, 'tasks')), (snap) => {
            setTasks(snap.docs
                .map((d) => ({ id: d.id, ...d.data() } as Task))
                .filter((t) => (t as any).status === 'active' && t.type === 'team'));
        }, (err) => {
            console.error('Tasks fetch error:', err);
        });

        const scoresQuery = stageFilter
            ? query(collection(db, 'scores'), stageFilter, orderBy('timestamp', 'desc'))
            : query(collection(db, 'scores'), orderBy('timestamp', 'desc'));
        const unsub3 = onSnapshot(scoresQuery, (snap) => {
            setScores(snap.docs.slice(0, 20).map((d) => ({ id: d.id, ...d.data() } as Score)));
        }, (err) => {
            console.error('Scores fetch error:', err);
        });

        const unsub4 = onSnapshot(collection(db, 'users'), (snap) => {
            const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MemberUser));
            setMemberUsers(raw.filter((u) => u.role === 'member'));
        }, () => {
            // If users collection is not readable for this role, fallback to team member names only.
            setMemberUsers([]);
        });

        return () => {
            unsub1();
            unsub2();
            unsub3();
            unsub4();
        };
    }, [user]);

    useEffect(() => {
        const interval = setInterval(async () => {
            const count = await getPendingSyncCount();
            setPendingCount(count);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const membersByTeam = useMemo(() => {
        const teamIds = new Set(teams.map((t) => t.id));
        const map: Record<string, MemberOption[]> = {};

        for (const teamId of teamIds) map[teamId] = [];

        // 1) Members from users docs
        for (const member of memberUsers) {
            if (!member.teamId || !teamIds.has(member.teamId)) continue;
            const name = (member.name || '').trim();
            if (!name) continue;
            map[member.teamId].push({
                key: `u:${member.id}`,
                userId: member.id,
                name,
                teamId: member.teamId,
                source: 'user',
            });
        }

        // 2) Members from teams.members array (dedupe against users by normalized name)
        for (const team of teams) {
            const existing = new Set((map[team.id] || []).map((m) => normalizeName(m.name)));
            const names = team.members || [];
            for (const rawName of names) {
                const name = String(rawName || '').trim();
                if (!name) continue;
                const normalized = normalizeName(name);
                if (existing.has(normalized)) continue;
                existing.add(normalized);
                map[team.id].push({
                    key: `n:${team.id}:${normalized}`,
                    userId: null,
                    name,
                    teamId: team.id,
                    source: 'team_list',
                });
            }
        }

        for (const teamId of Object.keys(map)) {
            map[teamId].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        }

        return map;
    }, [teams, memberUsers]);

    const availableMembers = useMemo(() => {
        if (!selectedTeam) return [];
        return membersByTeam[selectedTeam] || [];
    }, [membersByTeam, selectedTeam]);

    const teamsForSelection = useMemo(() => {
        return [...teams].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    }, [teams]);

    const selectedMember = useMemo(() => {
        if (!selectedMemberKey) return null;
        return availableMembers.find((m) => m.key === selectedMemberKey) || null;
    }, [availableMembers, selectedMemberKey]);

    const getSelectedTask = () => tasks.find((t) => t.id === selectedTask);
    const getSelectedTeam = () => teams.find((t) => t.id === selectedTeam);

    const getPointsPreview = () => {
        if (customPoints) return Number(customPoints);
        const task = getSelectedTask();
        if (!task) return 0;
        return scoreType === 'earn' ? task.points : -task.points;
    };

    const resetForm = () => {
        setSelectedTeam('');
        setSelectedTask('');
        setCustomPoints('');
        setSelectedMemberKey('');
        setTargetType('team');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !canRegisterScores(user.role)) return;

        const points = getPointsPreview();
        if (points === 0) return;
        if (!selectedTeam) return;
        if (targetType === 'member' && !selectedMember) {
            showToast('اختر الفرد أولًا', 'error');
            return;
        }

        const scoreData = {
            teamId: selectedTeam,
            taskId: selectedTask || 'custom',
            points: Math.abs(points),
            type: scoreType,
            targetType,
            source: scoreSource,
            registeredBy: user.uid,
            registeredByName: user.name,
            stageId: getSelectedTeam()?.stageId || user.stageId || null,
            memberKey: targetType === 'member' ? selectedMember?.key || null : null,
            memberUserId: targetType === 'member' ? selectedMember?.userId || null : null,
            memberName: targetType === 'member' ? selectedMember?.name || null : null,
            applyToTeamTotal: true,
            timestamp: Date.now(),
        };

        const pointChange = scoreType === 'earn' ? Math.abs(points) : -Math.abs(points);

        try {
            if (isOnline()) {
                await addDoc(collection(db, 'scores'), {
                    ...scoreData,
                    timestamp: serverTimestamp(),
                    syncedAt: serverTimestamp(),
                    pendingSync: false,
                });

                await updateDoc(doc(db, 'teams', selectedTeam), {
                    totalPoints: increment(pointChange),
                });

                if (targetType === 'member' && selectedMember?.key) {
                    await setDoc(doc(db, 'member_stats', selectedMember.key), {
                        memberKey: selectedMember.key,
                        memberUserId: selectedMember.userId,
                        memberName: selectedMember.name,
                        teamId: selectedTeam,
                        stageId: user.stageId || null,
                        totalPoints: increment(pointChange),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                }

                showToast('✅ تم تسجيل النقاط بنجاح');
            } else {
                await addPendingScore(scoreData);
                showToast('⚠️ تم الحفظ محلياً — سيتم المزامنة عند الاتصال', 'warning');
            }

            resetForm();
        } catch (err) {
            console.error('Score registration error:', err);
            try {
                await addPendingScore(scoreData);
                showToast('تم الحفظ محلياً كاحتياط', 'warning');
                resetForm();
            } catch {
                showToast('فشل في تسجيل النقاط', 'error');
            }
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const synced = await syncPendingScores();
            showToast(`✅ تم مزامنة ${synced} سجل`, 'success');
        } catch {
            showToast('فشل في المزامنة', 'error');
        }
        setSyncing(false);
    };

    const hasVisibleTeams = teamsForSelection.length > 0;
    const stageScopedRole = user.role === 'admin' || user.role === 'leader';
    const missingStageScope = stageScopedRole && !user.stageId;
    const noMembersForSelectedTeam = targetType === 'member' && selectedTeam && availableMembers.length === 0;
    const canSubmit = Boolean(
        hasVisibleTeams &&
        selectedTeam &&
        (selectedTask || customPoints) &&
        (targetType === 'team' || selectedMember)
    );

    if (!user || !canRegisterScores(user.role)) {
        return (
            <div dir="rtl" className="glass-card p-12 text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h3 className="text-xl font-bold text-text-primary mb-2">غير مصرح</h3>
                <p className="text-text-secondary text-sm">ليس لديك صلاحية تسجيل النقاط</p>
            </div>
        );
    }

    return (
        <div dir="rtl" className="space-y-6">
            <SectionHeader
                title="تسجيل النقاط"
                subtitle={user?.role === 'leader'
                    ? 'تسجيل نقاط فردية أو للفرق داخل مرحلتك'
                    : 'تسجيل نقاط فردية أو للفرق (أونلاين/أوفلاين)'}
                onBack={onBack}
                action={
                    <div className="flex items-center gap-3">
                        <StageBadge stageId={user?.stageId} size="md" />
                        {pendingCount > 0 && (
                            <button
                                onClick={handleSync}
                                disabled={syncing || !online}
                                className="btn btn-accent text-sm"
                            >
                                {syncing ? <div className="spinner !w-4 !h-4" /> : <RefreshCw className="w-4 h-4" />}
                                مزامنة ({pendingCount})
                            </button>
                        )}
                    </div>
                }
            />

            <div className="grid lg:grid-cols-5 gap-6">
                <div className="lg:col-span-2">
                    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
                        <h3 className="font-bold text-text-primary flex items-center gap-2">
                            <Plus className="w-5 h-5 text-primary" />
                            تسجيل جديد
                        </h3>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-secondary">نوع التسجيل</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTargetType('team');
                                        setSelectedMemberKey('');
                                    }}
                                    className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${targetType === 'team' ? 'border-primary bg-primary/10 text-primary-light' : 'border-border text-text-secondary'}`}
                                >
                                    <Users className="w-4 h-4" />
                                    نقاط لفريق
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTargetType('member')}
                                    className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${targetType === 'member' ? 'border-accent bg-accent/10 text-accent-light' : 'border-border text-text-secondary'}`}
                                >
                                    <UserRound className="w-4 h-4" />
                                    نقاط لفرد
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-secondary">الفريق</label>
                            <select
                                required
                                value={selectedTeam}
                                onChange={(e) => {
                                    setSelectedTeam(e.target.value);
                                    setSelectedMemberKey('');
                                }}
                                className="select-field"
                            >
                                <option value="">اختر الفريق</option>
                                {teamsForSelection.map((team) => (
                                    <option key={team.id} value={team.id}>{team.name}</option>
                                ))}
                            </select>
                        </div>

                        {targetType === 'member' && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-secondary">الفرد</label>
                                <select
                                    required
                                    value={selectedMemberKey}
                                    onChange={(e) => setSelectedMemberKey(e.target.value)}
                                    className="select-field"
                                    disabled={!selectedTeam}
                                >
                                    <option value="">{selectedTeam ? 'اختر الفرد' : 'اختر الفريق أولًا'}</option>
                                    {availableMembers.map((member) => (
                                        <option key={member.key} value={member.key}>
                                            {member.name}{member.source === 'team_list' ? ' (من قائمة الفريق)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-secondary">المهمة (اختياري)</label>
                            <select
                                value={selectedTask}
                                onChange={(e) => setSelectedTask(e.target.value)}
                                className="select-field"
                            >
                                <option value="">بدون مهمة محددة</option>
                                {tasks.map((task) => (
                                    <option key={task.id} value={task.id}>
                                        [فريق] {task.title} (+{task.points})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-secondary">إضافة / خصم</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setScoreType('earn')}
                                    className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${scoreType === 'earn' ? 'border-success bg-success/10 text-success' : 'border-border text-text-secondary'}`}
                                >
                                    <TrendingUp className="w-4 h-4" />
                                    إضافة
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setScoreType('deduct')}
                                    className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${scoreType === 'deduct' ? 'border-danger bg-danger/10 text-danger' : 'border-border text-text-secondary'}`}
                                >
                                    <TrendingDown className="w-4 h-4" />
                                    خصم
                                </button>
                            </div>
                        </div>

                        {!selectedTask && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-secondary">عدد النقاط</label>
                                <input
                                    type="number"
                                    required={!selectedTask}
                                    min="1"
                                    value={customPoints}
                                    onChange={(e) => setCustomPoints(e.target.value)}
                                    className="input-field"
                                    placeholder="أدخل عدد النقاط"
                                />
                            </div>
                        )}

                        {(selectedTeam && (selectedTask || customPoints)) && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className={`p-4 rounded-xl border ${scoreType === 'earn' ? 'bg-success/5 border-success/20' : 'bg-danger/5 border-danger/20'}`}
                            >
                                <p className="text-xs text-text-secondary mb-1">معاينة:</p>
                                <p className="font-bold text-text-primary">
                                    {targetType === 'member'
                                        ? `${selectedMember?.name || 'فرد'} (${getSelectedTeam()?.name || ''})`
                                        : getSelectedTeam()?.name}
                                    {' ← '}
                                    <span className={scoreType === 'earn' ? 'text-success' : 'text-danger'}>
                                        {scoreType === 'earn' ? '+' : '-'}{Math.abs(getPointsPreview())} نقطة
                                    </span>
                                </p>
                            </motion.div>
                        )}

                        <button
                            type="submit"
                            className={`btn w-full py-3 ${scoreType === 'earn' ? 'btn-primary' : 'btn-danger'}`}
                        >
                            <Check className="w-5 h-5" />
                            تسجيل
                        </button>
                    </form>
                </div>

                <div className="lg:col-span-3">
                    <div className="glass-card overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center justify-between">
                            <h3 className="font-bold text-text-primary flex items-center gap-2">
                                <Clock className="w-4 h-4 text-text-muted" />
                                آخر التسجيلات
                            </h3>
                            <SyncBadge count={pendingCount} />
                        </div>

                        <div className="divide-y divide-border/30 max-h-[500px] overflow-y-auto">
                            {scores.length > 0 ? scores.map((score, i) => {
                                const team = teams.find((t) => t.id === score.teamId);
                                const task = tasks.find((t) => t.id === score.taskId);
                                const actualTarget = score.targetType || 'team';
                                return (
                                    <motion.div
                                        key={score.id}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        className="p-4 flex items-center gap-3 hover:bg-glass transition-colors"
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${score.type === 'earn' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                                            {score.type === 'earn' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-text-primary text-sm truncate flex items-center gap-2">
                                                {actualTarget === 'member'
                                                    ? `${score.memberName || 'فرد'} (${team?.name || 'فريق غير معروف'})`
                                                    : (team?.name || 'فريق غير معروف')}
                                                {actualTarget === 'member' ? (
                                                    <span className="badge badge-pending text-[10px] py-0 px-1.5">فرد</span>
                                                ) : (
                                                    <span className="badge badge-sync text-[10px] py-0 px-1.5">فريق</span>
                                                )}
                                                {score.source === 'team' ? (
                                                    <span className="badge badge-sync text-[10px] py-0 px-1.5">الفريق</span>
                                                ) : null}
                                            </p>
                                            <p className="text-text-muted text-xs truncate mt-0.5">
                                                {task?.title ? `[فريق] ${task.title}` : 'نقاط مخصصة'}
                                            </p>
                                        </div>
                                        <div className="text-left shrink-0">
                                            <span className={`font-black text-lg ${score.type === 'earn' ? 'text-success' : 'text-danger'}`}>
                                                {score.type === 'earn' ? '+' : '-'}{score.points}
                                            </span>
                                            {score.pendingSync && (
                                                <p className="text-[10px] text-accent font-bold">⚠️ قيد المزامنة</p>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            }) : (
                                <div className="p-12 text-center">
                                    <div className="text-4xl mb-3">📊</div>
                                    <p className="text-text-secondary text-sm font-bold">لا توجد تسجيلات بعد</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
