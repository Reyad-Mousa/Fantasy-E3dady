import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth, canRegisterScores } from '@/context/AuthContext';
import { addPendingScore, getPendingSyncCount } from '@/services/offlineDb';
import { isOnline, syncPendingScores } from '@/services/syncService';
import { logActivity } from '@/services/activityLogger';
import { SectionHeader, SyncBadge, useOnlineStatus, useToast } from './ui/SharedUI';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Clock, Plus, RefreshCw, TrendingDown, TrendingUp, UserRound, Users, X } from 'lucide-react';
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
    customNote?: string | null;
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
    teamPoints?: number;
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
    const [submitting, setSubmitting] = useState(false);

    const [selectedTeam, setSelectedTeam] = useState('');
    const [selectedTask, setSelectedTask] = useState('');
    const [scoreType, setScoreType] = useState<'earn' | 'deduct'>('earn');
    const [scoreSource] = useState<'team'>('team');
    const [targetType, setTargetType] = useState<TargetType>('team');
    // CHANGED: multi-select members
    const [selectedMemberKeys, setSelectedMemberKeys] = useState<string[]>([]);

    const stageScopedRole = user?.role === 'admin' || user?.role === 'leader';
    const missingStageScope = Boolean(stageScopedRole && !user?.stageId);

    useEffect(() => {
        if (!user) return;
        const currentStageScopedRole = user.role === 'admin' || user.role === 'leader';
        if (currentStageScopedRole && !user.stageId) {
            setTeams([]); setScores([]); setTasks([]); setMemberUsers([]);
            return;
        }
        const stageFilter = currentStageScopedRole && user.stageId
            ? where('stageId', '==', user.stageId) : null;

        const teamsQ = stageFilter
            ? query(collection(db, 'teams'), stageFilter)
            : collection(db, 'teams');
        const u1 = onSnapshot(teamsQ, snap =>
            setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team))),
            err => console.error('Teams:', err));

        const u2 = onSnapshot(query(collection(db, 'tasks')), snap =>
            setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task))
                .filter(t => (t as any).status === 'active' && (t.type === 'team' || t.type === 'member'))),
            err => console.error('Tasks:', err));

        const scoresQ = stageFilter
            ? query(collection(db, 'scores'), stageFilter, orderBy('timestamp', 'desc'))
            : query(collection(db, 'scores'), orderBy('timestamp', 'desc'));
        const u3 = onSnapshot(scoresQ, snap =>
            setScores(snap.docs.slice(0, 20).map(d => ({ id: d.id, ...d.data() } as Score))),
            err => console.error('Scores:', err));

        const u4 = onSnapshot(collection(db, 'users'), snap => {
            setMemberUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as MemberUser))
                .filter(u => u.role === 'member'));
        }, () => setMemberUsers([]));

        return () => { u1(); u2(); u3(); u4(); };
    }, [user]);

    useEffect(() => {
        const iv = setInterval(async () => setPendingCount(await getPendingSyncCount()), 2000);
        return () => clearInterval(iv);
    }, []);

    const membersByTeam = useMemo(() => {
        const teamIds = new Set(teams.map(t => t.id));
        const map: Record<string, MemberOption[]> = {};
        for (const id of teamIds) map[id] = [];

        for (const m of memberUsers) {
            if (!m.teamId || !teamIds.has(m.teamId)) continue;
            const name = (m.name || '').trim();
            if (!name) continue;
            map[m.teamId].push({ key: `u:${m.id}`, userId: m.id, name, teamId: m.teamId, source: 'user' });
        }

        for (const team of teams) {
            const existing = new Set((map[team.id] || []).map(m => normalizeName(m.name)));
            for (const rawName of (team.members || [])) {
                const name = String(rawName || '').trim();
                if (!name) continue;
                const norm = normalizeName(name);
                if (existing.has(norm)) continue;
                existing.add(norm);
                map[team.id].push({ key: `n:${team.id}:${norm}`, userId: null, name, teamId: team.id, source: 'team_list' });
            }
        }

        for (const id of Object.keys(map))
            map[id].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

        return map;
    }, [teams, memberUsers]);

    const availableMembers = useMemo(() =>
        selectedTeam ? (membersByTeam[selectedTeam] || []) : [],
        [membersByTeam, selectedTeam]);

    const selectedMembers = useMemo(() =>
        availableMembers.filter(m => selectedMemberKeys.includes(m.key)),
        [availableMembers, selectedMemberKeys]);

    const teamsForSelection = useMemo(() =>
        [...teams].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')),
        [teams]);

    const getSelectedTask = () => tasks.find(t => t.id === selectedTask);
    const getSelectedTeam = () => teams.find(t => t.id === selectedTeam);

    const getPoints = () => {
        return getSelectedTask()?.points || 0;
    };

    const getTeamPoints = () => {
        return getSelectedTask()?.teamPoints || 0;
    };

    const toggleMember = (key: string) => {
        setSelectedMemberKeys(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const selectAllMembers = () =>
        setSelectedMemberKeys(availableMembers.map(m => m.key));

    const clearMembers = () => setSelectedMemberKeys([]);

    const resetForm = () => {
        setSelectedTeam('');
        setSelectedTask('');
        setSelectedMemberKeys([]);
        setTargetType('team');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !canRegisterScores(user.role)) return;
        if (missingStageScope) { showToast('لا يمكن تسجيل النقاط قبل تعيين المرحلة', 'error'); return; }

        const points = getPoints();
        const teamPts = getTeamPoints();
        if (points === 0 && teamPts === 0) return;
        if (!selectedTeam) return;
        if (!selectedTask) return;

        if (targetType === 'member' && selectedMembers.length === 0) {
            showToast('اختر فرداً واحداً على الأقل', 'error');
            return;
        }

        setSubmitting(true);
        const pointChange = scoreType === 'earn' ? Math.abs(points) : -Math.abs(points);
        const teamDoc = getSelectedTeam();
        const resolvedStageId = teamDoc?.stageId || user.stageId || null;
        const teamMultiplier = availableMembers.length > 0 ? availableMembers.length : 1;

        try {
            if (targetType === 'team') {
                const basePoints = Math.abs(getPoints()) * teamMultiplier;
                const bonusPoints = Math.abs(getTeamPoints());
                const totalTeamPoints = basePoints + bonusPoints;
                const totalTeamPointChange = scoreType === 'earn' ? totalTeamPoints : -totalTeamPoints;

                const scoreData = {
                    teamId: selectedTeam,
                    taskId: selectedTask,
                    points: totalTeamPoints,
                    type: scoreType,
                    targetType: 'team' as TargetType,
                    source: scoreSource,
                    registeredBy: user.uid,
                    registeredByName: user.name,
                    stageId: resolvedStageId,
                    memberKey: null,
                    memberUserId: null,
                    memberName: null,
                    applyToTeamTotal: true,
                    timestamp: Date.now(),
                };

                if (isOnline()) {
                    await addDoc(collection(db, 'scores'), { ...scoreData, timestamp: serverTimestamp(), syncedAt: serverTimestamp(), pendingSync: false });
                    await updateDoc(doc(db, 'teams', selectedTeam), { totalPoints: increment(totalTeamPointChange) });
                    // Log to activities
                    logActivity({
                        kind: 'score',
                        teamId: selectedTeam,
                        teamName: teamDoc?.name,
                        taskId: selectedTask,
                        taskTitle: getSelectedTask()?.title,
                        points: totalTeamPoints,
                        scoreType,
                        targetType: 'team',
                        stageId: resolvedStageId,
                        actorId: user.uid,
                        actorName: user.name,
                        actorRole: user.role,
                    });

                    // Distribute points to each member's stats evenly
                    // each member gets exactly: totalTeamPoints / memberCount
                    const memberCount = availableMembers.length;
                    if (memberCount > 0 && totalTeamPoints > 0) {
                        const perMemberShare = totalTeamPoints / memberCount;
                        const perMemberChange = scoreType === 'earn' ? perMemberShare : -perMemberShare;
                        const roundedShare = Math.round(perMemberShare);
                        const stageId = resolvedStageId;

                        const memberResults = await Promise.allSettled(
                            availableMembers.map(async (member) => {
                                // 1. Save individual score record (audit log/recalculation source)
                                await addDoc(collection(db, 'scores'), {
                                    teamId: selectedTeam,
                                    taskId: selectedTask,
                                    points: perMemberShare,
                                    type: scoreType,
                                    targetType: 'member',
                                    source: scoreSource,
                                    registeredBy: user.uid,
                                    registeredByName: user.name,
                                    stageId,
                                    memberKey: member.key,
                                    memberUserId: member.userId,
                                    memberName: member.name,
                                    applyToTeamTotal: false, // Important: don't double count in team total
                                    timestamp: serverTimestamp(),
                                    syncedAt: serverTimestamp(),
                                    pendingSync: false,
                                });

                                // 2. Update member_stats
                                await setDoc(doc(db, 'member_stats', member.key), {
                                    memberKey: member.key,
                                    memberUserId: member.userId,
                                    memberName: member.name,
                                    teamId: selectedTeam,
                                    stageId,
                                    totalPoints: increment(perMemberChange),
                                    updatedAt: serverTimestamp(),
                                }, { merge: true });
                            })
                        );
                        const failedCount = memberResults.filter(r => r.status === 'rejected').length;
                        memberResults.forEach((r, i) => {
                            if (r.status === 'rejected') console.error(`member_stats failed [${availableMembers[i]?.key}]:`, r.reason);
                        });
                        if (failedCount > 0) {
                            showToast(`✅ نقاط الفريق سُجِّلت — ⚠️ فشل توزيع النقاط على ${failedCount} فرد`, 'warning');
                        } else {
                            showToast(`✅ تم تسجيل النقاط وتوزيعها على ${memberCount} أفراد (${roundedShare} للفرد)`);
                        }
                    } else if (memberCount === 0) {
                        showToast('✅ تم تسجيل نقاط الفريق — لا يوجد أعضاء مسجلون للتوزيع', 'warning');
                    } else {
                        showToast('✅ تم تسجيل النقاط بنجاح');
                    }
                } else {
                    await addPendingScore(scoreData);
                    showToast('⚠️ تم الحفظ محلياً — سيتم المزامنة عند الاتصال', 'warning');
                }

            } else {
                // Multi-member scores — one doc per member
                const results = await Promise.allSettled(
                    selectedMembers.map(async (member) => {
                        const scoreData = {
                            teamId: selectedTeam,
                            taskId: selectedTask,
                            points: Math.abs(points),
                            type: scoreType,
                            targetType: 'member' as TargetType,
                            source: scoreSource,
                            registeredBy: user.uid,
                            registeredByName: user.name,
                            stageId: resolvedStageId,
                            memberKey: member.key,
                            memberUserId: member.userId,
                            memberName: member.name,
                            applyToTeamTotal: true,
                            timestamp: Date.now(),
                        };

                        if (isOnline()) {
                            await addDoc(collection(db, 'scores'), { ...scoreData, timestamp: serverTimestamp(), syncedAt: serverTimestamp(), pendingSync: false });
                            await setDoc(doc(db, 'member_stats', member.key), {
                                memberKey: member.key,
                                memberUserId: member.userId,
                                memberName: member.name,
                                teamId: selectedTeam,
                                stageId: resolvedStageId,
                                totalPoints: increment(pointChange),
                                updatedAt: serverTimestamp(),
                            }, { merge: true });
                            // Log to activities
                            logActivity({
                                kind: 'score',
                                teamId: selectedTeam,
                                teamName: teamDoc?.name,
                                taskId: selectedTask,
                                taskTitle: getSelectedTask()?.title,
                                points: Math.abs(points),
                                scoreType,
                                targetType: 'member',
                                memberKey: member.key,
                                memberName: member.name,
                                stageId: resolvedStageId,
                                actorId: user.uid,
                                actorName: user.name,
                                actorRole: user.role,
                            });
                        } else {
                            await addPendingScore(scoreData);
                        }
                    })
                );

                // Update team total once (points × number of members)
                if (isOnline()) {
                    await updateDoc(doc(db, 'teams', selectedTeam), {
                        totalPoints: increment(pointChange * selectedMembers.length),
                    });
                    const failed = results.filter(r => r.status === 'rejected').length;
                    if (failed === 0) showToast(`✅ تم تسجيل النقاط لـ ${selectedMembers.length} فرد`);
                    else showToast(`تم ${selectedMembers.length - failed} من ${selectedMembers.length} — فشل ${failed}`, 'warning');
                } else {
                    showToast('⚠️ تم الحفظ محلياً للأفراد المختارين', 'warning');
                }
            }

            resetForm();
        } catch (err) {
            console.error(err);
            showToast('فشل في تسجيل النقاط', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const synced = await syncPendingScores();
            showToast(`✅ تم مزامنة ${synced} سجل`, 'success');
        } catch { showToast('فشل في المزامنة', 'error'); }
        setSyncing(false);
    };

    const canSubmit = Boolean(
        !missingStageScope &&
        teamsForSelection.length > 0 &&
        selectedTeam &&
        selectedTask &&
        (getPoints() > 0 || getTeamPoints() > 0) &&
        (targetType === 'team' || selectedMembers.length > 0)
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

    const points = getPoints();
    const pointChange = scoreType === 'earn' ? points : -points;

    // Team preview calculations
    const previewMemberCount = availableMembers.length > 0 ? availableMembers.length : 1;
    const previewIndivTotal = Math.abs(points) * previewMemberCount;
    const previewGrpTotal = Math.abs(getTeamPoints());
    const previewGrandTotal = previewIndivTotal + previewGrpTotal;

    return (
        <div dir="rtl" className="space-y-4 sm:space-y-6">
            <SectionHeader
                title="تسجيل النقاط"
                subtitle={user?.role === 'leader' ? 'تسجيل نقاط فردية أو للفرق' : 'تسجيل نقاط فردية أو للفرق (أونلاين/أوفلاين)'}
                onBack={onBack}
                action={
                    <div className="flex items-center gap-2 sm:gap-3">
                        <StageBadge stageId={user?.stageId} size="md" />
                        {pendingCount > 0 && (
                            <button onClick={handleSync} disabled={syncing || !online} className="btn btn-accent text-xs sm:text-sm">
                                {syncing ? <div className="spinner !w-4 !h-4" /> : <RefreshCw className="w-4 h-4" />}
                                <span className="hidden xs:inline">مزامنة</span> ({pendingCount})
                            </button>
                        )}
                    </div>
                }
            />

            {missingStageScope && (
                <div className="glass-card border border-danger/30 bg-danger/5 p-4">
                    <p className="text-sm font-bold text-text-primary mb-1">تعذر تفعيل تسجيل النقاط</p>
                    <p className="text-xs text-text-secondary">حسابك لا يحتوي على مرحلة. تواصل مع المشرف العام.</p>
                </div>
            )}

            <div className="grid lg:grid-cols-5 gap-4 sm:gap-6">

                {/* ── FORM ── */}
                <div className="lg:col-span-2">
                    <form onSubmit={handleSubmit} className="glass-card p-4 sm:p-6 space-y-4 sm:space-y-5">
                        <fieldset disabled={missingStageScope || submitting} className={missingStageScope ? 'opacity-60 pointer-events-none' : ''}>

                            <h3 className="font-bold text-text-primary flex items-center gap-2 mb-4">
                                <Plus className="w-5 h-5 text-primary" />
                                تسجيل جديد
                            </h3>

                            {/* Target type */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-secondary">نوع التسجيل</label>
                                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                    <button type="button"
                                        onClick={() => { setTargetType('team'); setSelectedMemberKeys([]); setSelectedTask(''); }}
                                        className={`p-2.5 sm:p-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${targetType === 'team' ? 'border-primary bg-primary/10 text-primary-light' : 'border-border text-text-secondary'}`}>
                                        <Users className="w-4 h-4 shrink-0" />نقاط لفريق
                                    </button>
                                    <button type="button"
                                        onClick={() => { setTargetType('member'); setSelectedTask(''); }}
                                        className={`p-2.5 sm:p-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${targetType === 'member' ? 'border-accent bg-accent/10 text-accent-light' : 'border-border text-text-secondary'}`}>
                                        <UserRound className="w-4 h-4 shrink-0" />نقاط لأفراد
                                    </button>
                                </div>
                            </div>

                            {/* Team select */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-text-secondary">الفريق</label>
                                <select required value={selectedTeam}
                                    onChange={e => { setSelectedTeam(e.target.value); setSelectedMemberKeys([]); }}
                                    className="select-field text-sm">
                                    <option value="">اختر الفريق</option>
                                    {teamsForSelection.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>

                            {/* Multi-member selector */}
                            <AnimatePresence>
                                {targetType === 'member' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-2 overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-text-secondary">
                                                الأفراد
                                                {selectedMembers.length > 0 && (
                                                    <span className="mr-1.5 bg-accent/20 text-accent px-1.5 py-0.5 rounded-full text-[10px]">
                                                        {selectedMembers.length} مختار
                                                    </span>
                                                )}
                                            </label>
                                            {availableMembers.length > 0 && (
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={selectAllMembers}
                                                        className="text-[11px] font-bold text-primary hover:text-primary-light transition-colors">
                                                        تحديد الكل
                                                    </button>
                                                    {selectedMembers.length > 0 && (
                                                        <button type="button" onClick={clearMembers}
                                                            className="text-[11px] font-bold text-danger hover:text-danger/80 transition-colors">
                                                            إلغاء الكل
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Member chips list */}
                                        {!selectedTeam ? (
                                            <p className="text-xs text-text-muted text-center py-3 bg-surface/40 rounded-xl border border-border/30">
                                                اختر الفريق أولاً
                                            </p>
                                        ) : availableMembers.length === 0 ? (
                                            <p className="text-xs text-text-muted text-center py-3 bg-surface/40 rounded-xl border border-border/30">
                                                لا يوجد أعضاء في هذا الفريق
                                            </p>
                                        ) : (
                                            <div className="max-h-40 overflow-y-auto overscroll-contain space-y-1 border border-border/40 rounded-xl p-2 bg-surface/30">
                                                {availableMembers.map(member => {
                                                    const isSelected = selectedMemberKeys.includes(member.key);
                                                    return (
                                                        <button
                                                            key={member.key}
                                                            type="button"
                                                            onClick={() => toggleMember(member.key)}
                                                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-right ${isSelected
                                                                ? 'bg-accent/15 border border-accent/40 text-accent-light'
                                                                : 'hover:bg-surface/60 border border-transparent text-text-secondary'
                                                                }`}
                                                        >
                                                            <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${isSelected ? 'bg-accent border-accent' : 'border-border'
                                                                }`}>
                                                                {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                                            </div>
                                                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                                                                {(member.name || '؟').charAt(0)}
                                                            </div>
                                                            <span className="text-xs font-bold flex-1 truncate">{member.name}</span>
                                                            {member.source === 'team_list' && (
                                                                <span className="text-[9px] text-text-muted shrink-0">قائمة</span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Selected chips */}
                                        {selectedMembers.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {selectedMembers.map(m => (
                                                    <span key={m.key}
                                                        className="flex items-center gap-1 text-[11px] font-bold bg-accent/15 text-accent border border-accent/30 px-2 py-0.5 rounded-full">
                                                        {m.name}
                                                        <button type="button" onClick={() => toggleMember(m.key)}
                                                            className="hover:text-danger transition-colors">
                                                            <X className="w-2.5 h-2.5" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Task select */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-text-secondary">المهمة <span className="text-danger">*</span></label>
                                <select required value={selectedTask} onChange={e => { setSelectedTask(e.target.value); }}
                                    className="select-field text-sm">
                                    <option value="">اختر المهمة</option>
                                    {tasks.filter(t =>
                                        targetType === 'team'
                                            ? (t.teamPoints ?? 0) > 0
                                            : t.points > 0
                                    ).map(t => (
                                        <option key={t.id} value={t.id}>
                                            {t.title}
                                            {t.points > 0 ? ` — ${t.points} للفرد` : ''}
                                            {(t.teamPoints ?? 0) > 0 ? ` + ${t.teamPoints} للمجموعة` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Earn / Deduct */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-text-secondary">إضافة / خصم</label>
                                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                    <button type="button" onClick={() => setScoreType('earn')}
                                        className={`p-2.5 sm:p-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${scoreType === 'earn' ? 'border-success bg-success/10 text-success' : 'border-border text-text-secondary'}`}>
                                        <TrendingUp className="w-4 h-4 shrink-0" />إضافة
                                    </button>
                                    <button type="button" onClick={() => setScoreType('deduct')}
                                        className={`p-2.5 sm:p-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${scoreType === 'deduct' ? 'border-danger bg-danger/10 text-danger' : 'border-border text-text-secondary'}`}>
                                        <TrendingDown className="w-4 h-4 shrink-0" />خصم
                                    </button>
                                </div>
                            </div>

                            {/* Preview */}
                            <AnimatePresence>
                                {selectedTeam && selectedTask && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className={`p-3 sm:p-4 rounded-xl border overflow-hidden ${scoreType === 'earn' ? 'bg-success/5 border-success/20' : 'bg-danger/5 border-danger/20'}`}
                                    >
                                        <p className="text-xs text-text-secondary mb-1.5">معاينة:</p>

                                        {targetType === 'team' ? (
                                            <div className="space-y-1">
                                                <p className="font-bold text-text-primary text-sm">
                                                    {getSelectedTeam()?.name}
                                                    {' ← '}
                                                    <span className={scoreType === 'earn' ? 'text-success' : 'text-danger'}>
                                                        {scoreType === 'earn' ? '+' : '-'}{previewGrandTotal} نقطة
                                                    </span>
                                                </p>
                                                <div className="text-xs text-text-secondary space-y-0.5">
                                                    {Math.abs(points) > 0 && availableMembers.length > 0 && (
                                                        <p>({availableMembers.length} أفراد × {Math.abs(points)} نقطة فردية = {previewIndivTotal})</p>
                                                    )}
                                                    {previewGrpTotal > 0 && (
                                                        <p>+ {previewGrpTotal} نقطة للمجموعة</p>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                            : selectedMembers.length > 0 ? (
                                                <div className="space-y-1">
                                                    {selectedMembers.map(m => (
                                                        <p key={m.key} className="font-bold text-text-primary text-xs flex items-center justify-between">
                                                            <span className="truncate">{m.name}</span>
                                                            <span className={`shrink-0 mr-2 ${scoreType === 'earn' ? 'text-success' : 'text-danger'}`}>
                                                                {scoreType === 'earn' ? '+' : '-'}{Math.abs(points)}
                                                            </span>
                                                        </p>
                                                    ))}
                                                    <div className="border-t border-border/30 pt-1.5 mt-1.5 flex justify-between text-xs font-black">
                                                        <span className="text-text-secondary">المجموع للفريق:</span>
                                                        <span className={scoreType === 'earn' ? 'text-success' : 'text-danger'}>
                                                            {scoreType === 'earn' ? '+' : '-'}{Math.abs(points) * selectedMembers.length}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : null}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <button type="submit" disabled={!canSubmit || submitting}
                                className={`btn pt-1.5 mt-1.5  w-full py-3 text-sm ${scoreType === 'earn' ? 'btn-primary' : 'btn-danger'} disabled:opacity-50`}>
                                {submitting
                                    ? <div className="spinner !w-4 !h-4" />
                                    : <Check className="w-5 h-5" />
                                }
                                {targetType === 'member' && selectedMembers.length > 1
                                    ? `تسجيل لـ ${selectedMembers.length} أفراد`
                                    : 'تسجيل'
                                }
                            </button>

                        </fieldset>
                    </form>
                </div>

                {/* ── RECENT SCORES ── */}
                <div className="lg:col-span-3">
                    <div className="glass-card overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center justify-between">
                            <h3 className="font-bold text-text-primary flex items-center gap-2 text-sm sm:text-base">
                                <Clock className="w-4 h-4 text-text-muted" />
                                آخر التسجيلات
                            </h3>
                            <SyncBadge count={pendingCount} />
                        </div>

                        <div className="divide-y divide-border/30 max-h-[460px] overflow-y-auto">
                            {missingStageScope ? (
                                <div className="p-12 text-center">
                                    <div className="text-4xl mb-3">⚠️</div>
                                    <p className="text-text-secondary text-sm font-bold">لا يمكن عرض التسجيلات قبل تعيين المرحلة</p>
                                </div>
                            ) : scores.length > 0 ? scores.map((score, i) => {
                                const team = teams.find(t => t.id === score.teamId);
                                const task = tasks.find(t => t.id === score.taskId);
                                const isDeduct = score.type === 'deduct';
                                const isMember = score.targetType === 'member';
                                return (
                                    <motion.div
                                        key={score.id}
                                        initial={{ opacity: 0, x: 16 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        className="p-3 sm:p-4 flex items-center gap-3 hover:bg-glass transition-colors"
                                    >
                                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${isDeduct ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'}`}>
                                            {isDeduct ? <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" /> : <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-text-primary text-xs sm:text-sm truncate flex items-center gap-1.5 flex-wrap">
                                                {isMember ? `${score.memberName || 'فرد'} (${team?.name || '؟'})` : (team?.name || '؟')}
                                                <span className={`badge text-[9px] py-0 px-1.5 ${isMember ? 'badge-pending' : 'badge-sync'}`}>
                                                    {isMember ? 'فرد' : 'فريق'}
                                                </span>
                                            </p>
                                            <p className="text-text-muted text-[11px] truncate mt-0.5">
                                                {task?.title ? `[${task.type === 'team' ? 'فريق' : 'فرد'}] ${task.title}` : 'غير معروف'}
                                            </p>
                                        </div>
                                        <div className="text-left shrink-0">
                                            <span className={`font-black text-base sm:text-lg ${isDeduct ? 'text-danger' : 'text-success'}`}>
                                                {isDeduct ? '-' : '+'}{score.points}
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
