import { useState, useEffect, useMemo } from 'react';
import {
    collection, onSnapshot, query, where, doc, updateDoc, addDoc,
    serverTimestamp, orderBy, increment, setDoc
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth, canCreateTasks, canRegisterScores } from '@/context/AuthContext';
import {
    addPendingScore,
    cacheTasks,
    cacheTeams,
    cacheUsers,
    getCachedTasks,
    getCachedTeams,
    getCachedUsers,
} from '@/services/offlineDb';
import { logActivity } from '@/services/activityLogger';
import {
    isMassTaskTitle,
    saveAttendedKeys,
} from '@/services/attendanceCache';
import {
    resolveTodayAttendance,
    subscribeTodayAttendance,
} from '@/services/attendanceResolver';
import { buildMemberKey, normalizeMemberName } from '@/services/memberKeys';
import { createAuditLog as createAuditLogService } from '@/services/teamsService';
import { isPermissionDeniedError } from '@/utils/helpers';
import { useOnlineStatus, useToast, EmptyState, SectionHeader } from './ui/SharedUI';
import StageBadge from './StageBadge';
import StageFilterBar, { type FilterValue } from './StageFilterBar';
import MemberScoreDetailsModal, { type MemberDetailsTarget } from './MemberScoreDetailsModal';
import { motion, AnimatePresence } from 'motion/react';
import {
    ListTodo, Plus, Clock, CheckCircle2, XCircle, Trophy, Target,
    X, Calendar, Users, ChurchIcon
} from 'lucide-react';

interface Task {
    id: string;
    title: string;
    points: number;
    teamPoints?: number;
    type: 'team' | 'leader' | string;
    status: 'active' | 'archived';
    createdBy: string;
    stageId?: string;
    deadline?: any;
    createdAt?: any;
    isSuperAdminOnly?: boolean;
}

interface Team {
    id: string;
    name: string;
    stageId?: string | null;
    members?: string[];
    totalPoints?: number;
}

interface MemberUser {
    id: string;
    name: string;
    role: string;
    teamId: string | null;
    stageId?: string | null;
}

interface AttendanceMember {
    key: string;
    userId: string | null;
    name: string;
    teamId: string;
    teamName: string;
    stageId: string | null;
}

// isPermissionDeniedError is imported from @/utils/helpers

export default function TasksPage({ onBack, initialTaskId }: { onBack?: () => void, initialTaskId?: string | null }) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const online = useOnlineStatus();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // New task form
    const [newTitle, setNewTitle] = useState('');
    const [newPoints, setNewPoints] = useState('');
    const [newTeamPoints, setNewTeamPoints] = useState('');
    const [selectedStage, setSelectedStage] = useState('');
    const [isSuperAdminOnly, setIsSuperAdminOnly] = useState(false);

    // Attendance modal
    const [attendanceTask, setAttendanceTask] = useState<Task | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [memberUsers, setMemberUsers] = useState<MemberUser[]>([]);
    const [addingKey, setAddingKey] = useState<string | null>(null);
    const [resolvedAddedKeys, setResolvedAddedKeys] = useState<Set<string>>(new Set());
    const [memberDetails, setMemberDetails] = useState<MemberDetailsTarget | null>(null);
    const [attendanceStageFilter, setAttendanceStageFilter] = useState<FilterValue>(
        user?.role === 'super_admin' ? 'all' : (user?.stageId as FilterValue) || 'all'
    );

    // Auto-open modal if initialTaskId is provided
    useEffect(() => {
        if (initialTaskId && tasks.length > 0) {
            const task = tasks.find(t => t.id === initialTaskId && t.status === 'active');
            if (task && isMassTaskTitle(task.title)) {
                setAttendanceTask(task);
            }
        }
    }, [initialTaskId, tasks]);

    useEffect(() => {
        if (user?.role === 'super_admin') {
            setAttendanceStageFilter('all');
            return;
        }
        setAttendanceStageFilter((user?.stageId as FilterValue) || 'all');
    }, [user?.role, user?.stageId]);

    // Fetch teams + members for attendance modal
    useEffect(() => {
        if (!user) return;
        const stageScopedRole = user.role === 'admin' || user.role === 'leader';
        if (!online) {
            Promise.all([getCachedTeams(), getCachedUsers()])
                .then(([cachedTeams, cachedUsers]) => {
                    const offlineTeams = cachedTeams
                        .map(team => ({
                            id: team.teamId,
                            name: team.name,
                            stageId: team.stageId || null,
                            members: team.members || [],
                            totalPoints: team.totalPoints || 0,
                        } as Team))
                        .filter(team => !stageScopedRole || !user.stageId || team.stageId === user.stageId);

                    const offlineMembers = cachedUsers
                        .map(member => ({
                            id: member.userId,
                            name: member.name,
                            role: member.role,
                            teamId: member.teamId,
                            stageId: member.stageId || null,
                        } as MemberUser))
                        .filter(member => member.role === 'member');

                    setTeams(offlineTeams);
                    setMemberUsers(offlineMembers);
                })
                .catch(err => {
                    console.error('Offline attendance cache:', err);
                    setTeams([]);
                    setMemberUsers([]);
                });

            return;
        }

        const stageFilter = stageScopedRole && user.stageId
            ? where('stageId', '==', user.stageId) : null;

        const teamsQ = stageFilter
            ? query(collection(db, 'teams'), stageFilter)
            : collection(db, 'teams');

        const u1 = onSnapshot(
            teamsQ,
            snap => {
                const nextTeams = snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
                setTeams(nextTeams);
                cacheTeams(nextTeams.map(team => ({
                    teamId: team.id,
                    name: team.name,
                    leaderId: '',
                    totalPoints: team.totalPoints || 0,
                    memberCount: team.members?.length || 0,
                    members: team.members || [],
                    stageId: team.stageId || null,
                    updatedAt: Date.now(),
                }))).catch(console.error);
            },
            err => console.error('Teams:', err)
        );

        const u2 = onSnapshot(
            collection(db, 'users'),
            snap => {
                const nextMembers = snap.docs
                    .map(d => ({ id: d.id, ...d.data() } as MemberUser))
                    .filter(u => u.role === 'member');
                setMemberUsers(nextMembers);
                cacheUsers(nextMembers.map(member => ({
                    userId: member.id,
                    name: member.name,
                    email: '',
                    role: member.role,
                    teamId: member.teamId,
                    stageId: member.stageId || null,
                }))).catch(console.error);
            },
            () => setMemberUsers([])
        );

        return () => { u1(); u2(); };
    }, [online, user]);

    // Build flat member list scoped to the logged-in user's stage
    const attendanceMembers = useMemo<AttendanceMember[]>(() => {
        const stageScopedRole = user?.role === 'admin' || user?.role === 'leader';
        const myStageId = user?.stageId || null;
        const activeStageFilter = user?.role === 'super_admin' ? attendanceStageFilter : myStageId;

        const scopedTeams = teams.filter(team => {
            if (stageScopedRole && myStageId) return team.stageId === myStageId;
            if (activeStageFilter && activeStageFilter !== 'all') return team.stageId === activeStageFilter;
            return true;
        });

        const teamMap = new Map(scopedTeams.map(t => [t.id, t]));
        const result: AttendanceMember[] = [];
        const seenKeys = new Set<string>();

        // Users with role=member belonging to scoped teams
        for (const m of memberUsers) {
            if (!m.teamId || !teamMap.has(m.teamId)) continue;
            const name = (m.name || '').trim();
            if (!name) continue;
            const team = teamMap.get(m.teamId)!;
            const key = buildMemberKey({
                memberUserId: m.id,
                teamId: m.teamId,
                memberName: name,
            });
            if (!key) continue;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            result.push({
                key,
                userId: m.id,
                name,
                teamId: m.teamId,
                teamName: team.name,
                stageId: m.stageId || team.stageId || null,
            });
        }

        // Also include names listed in team.members array (legacy)
        for (const team of scopedTeams) {
            for (const rawName of (team.members || [])) {
                const name = String(rawName || '').trim();
                if (!name) continue;
                const normName = normalizeMemberName(name);
                // skip if already added from users
                const alreadyUser = result.some(
                    r => r.teamId === team.id && normalizeMemberName(r.name) === normName
                );
                if (alreadyUser) continue;
                const key = buildMemberKey({ teamId: team.id, memberName: name });
                if (!key || seenKeys.has(key)) continue;
                seenKeys.add(key);
                result.push({
                    key,
                    userId: null,
                    name,
                    teamId: team.id,
                    teamName: team.name,
                    stageId: team.stageId || null,
                });
            }
        }

        // Sort alphabetically by member name
        return result.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }, [attendanceStageFilter, teams, memberUsers, user]);

    useEffect(() => {
        if (!attendanceTask) {
            setResolvedAddedKeys(new Set());
            return;
        }

        const selectedStageId = user?.role === 'super_admin'
            ? (attendanceStageFilter === 'all' ? null : attendanceStageFilter)
            : (user?.stageId || null);
        let cancelled = false;

        if (online) {
            const unsubscribe = subscribeTodayAttendance({
                taskId: attendanceTask.id,
                members: attendanceMembers,
                stageId: selectedStageId,
                onResolved: (keys) => {
                    if (!cancelled) setResolvedAddedKeys(keys);
                },
                onError: (err) => {
                    console.error('Subscribe attendance failed:', err);
                    if (!cancelled) setResolvedAddedKeys(new Set());
                },
            });

            return () => {
                cancelled = true;
                unsubscribe();
            };
        }

        resolveTodayAttendance({
            taskId: attendanceTask.id,
            members: attendanceMembers,
            online,
            stageId: selectedStageId,
        }).then((keys) => {
            if (!cancelled) setResolvedAddedKeys(keys);
        }).catch((err) => {
            console.error('Resolve attendance failed:', err);
            if (!cancelled) setResolvedAddedKeys(new Set());
        });

        return () => { cancelled = true; };
    }, [attendanceMembers, attendanceStageFilter, attendanceTask, online, user?.role, user?.stageId]);

    const visibleAddedCount = useMemo(
        () => attendanceMembers.filter(member => resolvedAddedKeys.has(member.key)).length,
        [attendanceMembers, resolvedAddedKeys]
    );

    // Give points to a member for the attendance task
    const handleGivePoints = async (member: AttendanceMember) => {
        if (!attendanceTask || !user || !canRegisterScores(user.role)) return;
        if (addingKey) return; // prevent double-click
        const points = attendanceTask.points;
        if (!points || points <= 0) {
            showToast('هذه المهمة لا تحتوي على نقاط فردية', 'warning');
            return;
        }

        setAddingKey(member.key);
        try {
            const stageId = member.stageId || user.stageId || null;
            const memberPayload = {
                teamId: member.teamId,
                taskId: attendanceTask.id,
                points,
                type: 'earn' as const,
                targetType: 'member' as const,
                source: 'team' as const,
                registeredBy: user.uid,
                registeredByName: user.name || null,
                stageId,
                memberKey: member.key,
                memberUserId: member.userId,
                memberName: member.name,
                applyToTeamTotal: true,
                customNote: null,
            };

            if (online) {
                // 1. Add score document (individual)
                await addDoc(collection(db, 'scores'), {
                    ...memberPayload,
                    pendingSync: false,
                    timestamp: serverTimestamp(),
                    syncedAt: serverTimestamp(),
                });
                // Log to activities
                logActivity({
                    kind: 'score',
                    teamId: member.teamId,
                    teamName: member.teamName,
                    taskId: attendanceTask.id,
                    taskTitle: attendanceTask.title,
                    points,
                    scoreType: 'earn',
                    targetType: 'member',
                    memberKey: member.key,
                    memberUserId: member.userId,
                    memberName: member.name,
                    stageId,
                    actorId: user.uid,
                    actorName: user.name,
                    actorRole: user.role,
                });

                // 2. Upsert member_stats
                try {
                    await setDoc(doc(db, 'member_stats', member.key), {
                        memberKey: member.key,
                        memberUserId: member.userId,
                        memberName: member.name,
                        teamId: member.teamId,
                        stageId,
                        totalPoints: increment(points),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                } catch (err) {
                    if (isPermissionDeniedError(err)) {
                        throw {
                            scope: 'member_stats',
                            code: 'permission-denied',
                            original: err,
                        };
                    }
                    throw err;
                }

                // 3. Update team total with individual points
                await updateDoc(doc(db, 'teams', member.teamId), {
                    totalPoints: increment(points),
                });
            } else {
                await addPendingScore({
                    ...memberPayload,
                    timestamp: Date.now(),
                });
            }

            // 4. Build the new attendance set, persist to localStorage
            const newAddedKeys = new Set(resolvedAddedKeys).add(member.key);
            setResolvedAddedKeys(newAddedKeys);
            saveAttendedKeys(attendanceTask.id, newAddedKeys);

            // 5. Check if ALL members of this team are now attended
            const teamBonus = attendanceTask.teamPoints ?? 0;
            if (teamBonus > 0) {
                const teamMembers = attendanceMembers.filter(m => m.teamId === member.teamId);
                const allTeamDone = teamMembers.length > 0 &&
                    teamMembers.every(m => newAddedKeys.has(m.key));

                if (allTeamDone) {
                    const bonusTeamName = teams.find(t => t.id === member.teamId)?.name || '';
                    if (online) {
                        // Add teamPoints bonus to the team
                        await updateDoc(doc(db, 'teams', member.teamId), {
                            totalPoints: increment(teamBonus),
                        });
                        // Log bonus score doc
                        await addDoc(collection(db, 'scores'), {
                            teamId: member.teamId,
                            taskId: attendanceTask.id,
                            points: teamBonus,
                            type: 'earn',
                            targetType: 'team',
                            source: 'team',
                            registeredBy: user.uid,
                            registeredByName: user.name,
                            stageId,
                            memberKey: null,
                            memberUserId: null,
                            memberName: null,
                            applyToTeamTotal: true,
                            customNote: 'مكافأة حضور كامل الفريق',
                            pendingSync: false,
                            timestamp: serverTimestamp(),
                            syncedAt: serverTimestamp(),
                        });
                        // Log bonus to activities
                        logActivity({
                            kind: 'score',
                            teamId: member.teamId,
                            teamName: bonusTeamName,
                            taskId: attendanceTask.id,
                            taskTitle: attendanceTask.title,
                            points: teamBonus,
                            scoreType: 'earn',
                            targetType: 'team',
                            customNote: 'مكافأة حضور كامل الفريق',
                            stageId,
                            actorId: user.uid,
                            actorName: user.name,
                            actorRole: user.role,
                        });
                        showToast(`🎉 كل فريق "${bonusTeamName}" حضر! +${teamBonus} نقطة للمجموعة`, 'success');
                    } else {
                        await addPendingScore({
                            teamId: member.teamId,
                            taskId: attendanceTask.id,
                            points: teamBonus,
                            type: 'earn',
                            targetType: 'team',
                            source: 'team',
                            registeredBy: user.uid,
                            registeredByName: user.name || null,
                            stageId,
                            memberKey: null,
                            memberUserId: null,
                            memberName: null,
                            customNote: 'مكافأة حضور كامل الفريق',
                            distributeToMembers: false,
                            applyToTeamTotal: true,
                            timestamp: Date.now(),
                        });
                        showToast(`✅ تم الحفظ محليًا: ${member.name} + مكافأة فريق "${bonusTeamName}". ستتم المزامنة عند عودة الإنترنت`, 'warning');
                    }
                    return; // toast already shown (attendance state and localStorage updated above)
                }
            }

            if (online) {
                showToast(`✅ تم إضافة ${points} نقطة لـ ${member.name}`);
            } else {
                showToast(`✅ تم حفظ ${member.name} محليًا وسيتم التزامن عند عودة الإنترنت`, 'warning');
            }
        } catch (err) {
            const scopedError = err as { scope?: string; code?: string; original?: unknown };
            if (scopedError.scope === 'member_stats' && scopedError.code === 'permission-denied') {
                console.error(scopedError.original ?? err);
                showToast('تعذّر تحديث نقاط الفرد بسبب صلاحيات/مرحلة member_stats. يُرجى إصلاح بيانات member_stats أولًا', 'error');
            } else {
                console.error(err);
                showToast('فشل في إضافة النقاط', 'error');
            }
        } finally {
            setAddingKey(null);
        }
    };

    useEffect(() => {
        if (online) {
            const q = query(collection(db, 'tasks'), orderBy('status'));
            const unsub = onSnapshot(q, (snap) => {
                let data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));

                if (user?.role !== 'super_admin') {
                    data = data.filter(t => !t.isSuperAdminOnly);
                    if (user?.stageId) {
                        data = data.filter(t => !t.stageId || t.stageId === user.stageId);
                    }
                }

                data = data.filter(t => t.type === 'team' || t.type === 'member');

                setTasks(data);
                setLoading(false);
                cacheTasks(data.map(t => ({
                    taskId: t.id,
                    title: t.title,
                    points: t.points,
                    teamPoints: t.teamPoints || 0,
                    type: t.type,
                    status: t.status,
                    stageId: t.stageId,
                    createdBy: t.createdBy,
                    isSuperAdminOnly: t.isSuperAdminOnly || false,
                }))).catch(console.error);
            });
            return () => unsub();
        }

        getCachedTasks().then(cached => {
            let data = cached.map(t => ({
                id: t.taskId,
                title: t.title,
                points: t.points,
                teamPoints: t.teamPoints || 0,
                type: t.type,
                status: t.status,
                stageId: t.stageId,
                createdBy: t.createdBy,
                isSuperAdminOnly: t.isSuperAdminOnly || false,
            } as Task));

            if (user?.role !== 'super_admin') {
                data = data.filter(t => !t.isSuperAdminOnly);
                if (user?.stageId) {
                    data = data.filter(t => !t.stageId || t.stageId === user.stageId);
                }
            }

            data = data.filter(t => t.type === 'team' || t.type === 'member');

            setTasks(data);
            setLoading(false);
        });
    }, [online, user?.role, user?.stageId]);

    const createAuditLog = async (
        operation: 'create' | 'delete' | 'update',
        entityId: string,
        entityName: string,
        stageId?: string | null,
        details?: string | null
    ) => {
        if (!user) return;
        await createAuditLogService({
            operation,
            entityType: 'task',
            entityId,
            entityName: entityName || 'غير معروف',
            stageId: stageId || user.stageId || null,
            details,
            actorId: user.uid,
            actorName: user.name || null,
            actorEmail: user.email || null,
            actorRole: user.role || null,
        });
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !canCreateTasks(user.role)) return;

        const title = newTitle.trim();
        const points = newPoints !== '' ? Number(newPoints) : 0;
        const teamPoints = newTeamPoints !== '' ? Number(newTeamPoints) : 0;

        if (!title) {
            showToast('أدخل عنوان المهمة', 'warning');
            return;
        }
        if (!Number.isFinite(points) || points < 0 || !Number.isFinite(teamPoints) || teamPoints < 0) {
            showToast('تحقق من قيم النقاط', 'warning');
            return;
        }
        if (points === 0 && teamPoints === 0) {
            showToast('يجب أن تحتوي المهمة على نقاط فردية أو جماعية على الأقل', 'warning');
            return;
        }

        const isStageScoped = user.role === 'admin' || user.role === 'leader';
        const stageIdForTask = isStageScoped ? (user.stageId || null) : (selectedStage || null);
        if (isStageScoped && !stageIdForTask) {
            showToast('لا يمكن إنشاء مهمة بدون مرحلة مرتبطة بحسابك', 'error');
            return;
        }

        try {
            const docRef = await addDoc(collection(db, 'tasks'), {
                title,
                points,
                teamPoints,
                type: 'team',
                status: 'active',
                stageId: stageIdForTask,
                isSuperAdminOnly,
                createdBy: user.uid,
                createdAt: serverTimestamp(),
            });
            await createAuditLog('create', docRef.id, title, stageIdForTask);
            showToast('تم إنشاء المهمة بنجاح');
            setShowCreateModal(false);
            setNewTitle('');
            setNewPoints('');
            setNewTeamPoints('');
            setSelectedStage('');
            setIsSuperAdminOnly(false);
        } catch {
            showToast('فشل في إنشاء المهمة', 'error');
        }
    };

    const handleArchiveTask = async (task: Task) => {
        if (!canArchiveTask(task)) return;
        try {
            await updateDoc(doc(db, 'tasks', task.id), { status: 'archived' });
            await createAuditLog('update', task.id, task.title, task.stageId, 'archived');
            showToast('تم أرشفة المهمة');
        } catch {
            showToast('فشل في أرشفة المهمة', 'error');
        }
    };

    const activeTasks = tasks.filter(t => t.status === 'active');
    const archivedTasks = tasks.filter(t => t.status === 'archived');
    const canArchiveTask = (task: Task) => {
        if (!user || !canCreateTasks(user.role)) return false;
        if (user.role === 'super_admin') return true;
        return task.createdBy === user.uid;
    };

    if (loading) {
        return (
            <div className="text-center py-16">
                <div className="spinner mx-auto mb-4" />
                <p className="text-text-secondary font-bold">جاري تحميل المهام...</p>
            </div>
        );
    }

    return (
        <div dir="rtl" className="space-y-6">
            {/* Header */}
            <SectionHeader
                title="المهام"
                subtitle="إدارة وتتبع مهام الفريق"
                onBack={onBack}
                action={
                    user && canCreateTasks(user.role) && (
                        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary text-sm">
                            <Plus className="w-4 h-4" />
                            مهمة جديدة
                        </button>
                    )
                }
            />

            {/* Active Tasks */}
            {activeTasks.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence>
                        {activeTasks.map((task, i) => {
                            const isMass = isMassTaskTitle(task.title);
                            return (
                                <motion.div
                                    key={task.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ delay: i * 0.05 }}
                                    className={`glass-card p-5 ${isMass && user ? 'cursor-pointer glass-card-hover ring-1 ring-purple-500/30' : 'glass-card-hover'}`}
                                    onClick={() => {
                                        if (isMass && user) {
                                            setAttendanceTask(task);
                                            setResolvedAddedKeys(new Set());
                                        }
                                    }}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`p-2 rounded-xl ${isMass ? 'bg-purple-500/15 text-purple-400' : 'bg-primary/15 text-primary-light'}`}>
                                            {isMass
                                                ? <span className="text-lg leading-none">⛪</span>
                                                : <Target className="w-5 h-5" />
                                            }
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isMass && (
                                                <span className="badge text-[10px] px-2 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                                    حضور قداس
                                                </span>
                                            )}
                                            <span className={`badge ${task.type === 'team' ? 'badge-sync' : 'badge-pending'}`}>
                                                {task.type === 'team' ? 'فريق' : 'فرد'}
                                            </span>
                                        </div>
                                    </div>

                                    <h3 className="font-bold text-text-primary mb-2">{task.title}</h3>

                                    {isMass && (
                                        <p className={`text-xs ${user ? 'text-purple-400/80' : 'text-text-muted'} mb-2 flex items-center gap-1`}>
                                            <Users className="w-3 h-3" />
                                            {user ? 'اضغط لتسجيل حضور الأعضاء' : 'سجل الدخول لتسجيل الحضور'}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-between mt-4">
                                        <div className="flex flex-col gap-1">
                                            {task.points > 0 && (
                                                <div className="flex items-center gap-1.5 text-accent font-black">
                                                    <span className="text-lg">+{task.points}</span>
                                                    <span className="text-xs text-text-muted">نقطة للفرد</span>
                                                </div>
                                            )}
                                            {task.type === 'team' && task.teamPoints !== undefined && task.teamPoints > 0 && (
                                                <div className="flex items-center gap-1.5 text-success font-black">
                                                    <span className="text-sm">+{task.teamPoints}</span>
                                                    <span className="text-xs text-text-muted">للمجموعة</span>
                                                </div>
                                            )}
                                        </div>

                                        {canArchiveTask(task) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleArchiveTask(task); }}
                                                className="text-text-muted hover:text-danger transition-colors text-xs font-bold flex items-center gap-1"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                                أرشفة
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            ) : (
                <EmptyState icon="📋" title="لا توجد مهام نشطة" description="سيتم عرض المهام هنا عند إنشائها" />
            )}

            {/* Archived Tasks */}
            {archivedTasks.length > 0 && (
                <div className="mt-8">
                    <h3 className="text-text-muted font-bold text-sm mb-4 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        المهام المؤرشفة ({archivedTasks.length})
                    </h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {archivedTasks.map(task => (
                            <div key={task.id} className="glass-card p-4 opacity-50">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="badge badge-failed text-xs">مؤرشفة</span>
                                    <span className="badge">{task.type === 'team' ? 'فريق' : 'فرد'}</span>
                                </div>
                                <h4 className="font-bold text-text-secondary text-sm">{task.title}</h4>
                                <p className="text-text-muted text-xs mt-1">+{task.points} نقطة</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════
                ATTENDANCE MODAL — حضور قداس
            ══════════════════════════════════════════ */}
            <AnimatePresence>
                {attendanceTask && (
                    <div
                        className="modal-backdrop"
                        onClick={() => setAttendanceTask(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="glass-card p-0 max-w-lg w-full overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-purple-500/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-xl">
                                        ⛪
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-text-primary">{attendanceTask.title}</h3>
                                        <p className="text-xs text-purple-400 font-bold">
                                            +{attendanceTask.points} نقطة لكل حاضر
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setAttendanceTask(null)}
                                    className="p-2 hover:bg-surface rounded-xl transition-colors"
                                >
                                    <X className="w-5 h-5 text-text-muted" />
                                </button>
                            </div>

                            {/* Stats bar */}
                            <div className="px-6 py-3 bg-surface/30 border-b border-border/30 flex items-center justify-between text-xs">
                                <span className="text-text-muted">
                                    إجمالي الأعضاء: <span className="font-bold text-text-primary">{attendanceMembers.length}</span>
                                </span>
                                <span className="text-purple-400 font-bold">
                                    تم تسجيل: {visibleAddedCount}
                                </span>
                            </div>

                            {user?.role === 'super_admin' && (
                                <div className="px-6 py-4 border-b border-border/20 bg-surface/10">
                                    <StageFilterBar
                                        active={attendanceStageFilter}
                                        onChange={setAttendanceStageFilter}
                                        showAll={true}
                                        className="mb-0"
                                    />
                                </div>
                            )}

                            {/* Members List */}
                            <div className="overflow-y-auto max-h-[60vh] divide-y divide-border/20">
                                {attendanceMembers.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="text-4xl mb-3">👥</div>
                                        <p className="text-text-secondary text-sm font-bold">
                                            {!online
                                                ? 'لا توجد بيانات أعضاء محفوظة محليًا لهذه المرحلة بعد'
                                                : user?.role === 'super_admin'
                                                    ? 'لا يوجد أعضاء في المرحلة المحددة'
                                                    : 'لا يوجد أعضاء في مرحلتك'}
                                        </p>
                                    </div>
                                ) : (
                                    attendanceMembers.map(member => {
                                        const isAdded = resolvedAddedKeys.has(member.key);
                                        const isLoading = addingKey === member.key;
                                        return (
                                            <motion.div
                                                key={member.key}
                                                layout
                                                className={`flex items-center gap-3 px-5 py-3 transition-all ${isAdded
                                                    ? 'bg-green-500/8'
                                                    : 'hover:bg-surface/50'
                                                    }`}
                                            >
                                                {/* Avatar */}
                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${isAdded
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : 'bg-primary/20 text-primary-light'
                                                    }`}>
                                                    {(member.name || '؟').charAt(0)}
                                                </div>

                                                {/* Info */}
                                                <button
                                                    type="button"
                                                    onClick={() => setMemberDetails({
                                                        memberKey: member.key,
                                                        memberUserId: member.userId,
                                                        memberName: member.name,
                                                        name: member.name,
                                                        teamId: member.teamId,
                                                        teamName: member.teamName,
                                                        stageId: member.stageId,
                                                    })}
                                                    className="flex-1 min-w-0 text-right"
                                                >
                                                    <p className="font-bold text-text-primary text-sm truncate hover:text-primary-light transition-colors">
                                                        {member.name}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                        <StageBadge stageId={member.stageId} size="sm" />
                                                        <span className="text-[11px] text-text-muted flex items-center gap-1">
                                                            <Users className="w-3 h-3" />
                                                            {member.teamName}
                                                        </span>
                                                    </div>
                                                </button>

                                                {/* Action button */}
                                                <button
                                                    disabled={isAdded || isLoading}
                                                    onClick={() => handleGivePoints(member)}
                                                    className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all font-bold text-sm ${isAdded
                                                        ? 'bg-green-500/20 text-green-400 cursor-default'
                                                        : isLoading
                                                            ? 'bg-surface opacity-60'
                                                            : 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 hover:border-purple-500/60'
                                                        }`}
                                                >
                                                    {isLoading ? (
                                                        <div className="spinner !w-4 !h-4" />
                                                    ) : isAdded ? (
                                                        <span>✓</span>
                                                    ) : (
                                                        <span>+{attendanceTask.points}</span>
                                                    )}
                                                </button>
                                            </motion.div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Footer */}
                            {!online && (
                                <div className="px-6 py-3 bg-warning/10 border-t border-warning/30">
                                    <p className="text-xs text-warning font-bold text-center">
                                        ⚠️ لا يوجد اتصال — التسجيل يعمل محليًا الآن وسيتم التزامن تلقائيًا عند عودة الإنترنت
                                    </p>
                                </div>
                            )}
                            {visibleAddedCount > 0 && online && (
                                <div className="px-6 py-3 bg-green-500/5 border-t border-green-500/20">
                                    <p className="text-xs text-green-400 font-bold text-center">
                                        ✅ تم تسجيل {visibleAddedCount} حاضر بنجاح
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <MemberScoreDetailsModal
                member={memberDetails}
                onClose={() => setMemberDetails(null)}
                stageScope={user?.role === 'super_admin'
                    ? (attendanceStageFilter === 'all' ? null : attendanceStageFilter)
                    : (user?.stageId || memberDetails?.stageId || null)}
            />

            {/* Create Task Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="glass-card p-6 max-w-md w-full"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                    <Plus className="w-5 h-5 text-primary" />
                                    مهمة جديدة
                                </h3>
                                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-surface rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-text-muted" />
                                </button>
                            </div>

                            <form onSubmit={handleCreateTask} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-secondary">عنوان المهمة</label>
                                    <input
                                        type="text"
                                        required
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        className="input-field"
                                        placeholder="أدخل عنوان المهمة"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-secondary">نقاط للفرد <span className="text-text-muted font-normal">(اختياري)</span></label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={newPoints}
                                        onChange={e => setNewPoints(e.target.value)}
                                        className="input-field"
                                        placeholder="عدد النقاط للفرد (0 إذا لا يوجد)"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-secondary">نقاط للمجموعة ككل <span className="text-text-muted font-normal">(اختياري)</span></label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={newTeamPoints}
                                        onChange={e => setNewTeamPoints(e.target.value)}
                                        className="input-field"
                                        placeholder="عدد النقاط للمجموعة (0 إذا لا يوجد)"
                                    />
                                </div>
                                {(newPoints !== '' || newTeamPoints !== '') && (
                                    <div className="bg-surface/50 border border-border/40 rounded-xl p-3 text-xs text-text-secondary space-y-1">
                                        <p className="font-bold text-text-primary">معاينة النقاط:</p>
                                        {Number(newPoints) > 0 && (
                                            <p>• <span className="text-accent font-bold">{newPoints} نقطة</span> لكل فرد في الفريق</p>
                                        )}
                                        {Number(newTeamPoints) > 0 && (
                                            <p>• <span className="text-success font-bold">{newTeamPoints} نقطة</span> إضافية للمجموعة ككل</p>
                                        )}
                                        {Number(newPoints) === 0 && Number(newTeamPoints) === 0 && (
                                            <p className="text-warning">⚠️ يجب تحديد نقاط على الأقل</p>
                                        )}
                                    </div>
                                )}

                                {user?.role === 'super_admin' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">المرحلة <span className="text-text-muted font-normal">(اختياري)</span></label>
                                        <select
                                            value={selectedStage}
                                            onChange={e => setSelectedStage(e.target.value)}
                                            className="select-field"
                                        >
                                            <option value="">متاحة لجميع المراحل</option>
                                            <option value="grade7">أولى إعدادي</option>
                                            <option value="grade8">تانية إعدادي</option>
                                            <option value="grade9">تالتة إعدادي</option>
                                        </select>
                                    </div>
                                )}

                                {user?.role === 'super_admin' && (
                                    <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                                        <input
                                            type="checkbox"
                                            id="superAdminOnly"
                                            checked={isSuperAdminOnly}
                                            onChange={e => setIsSuperAdminOnly(e.target.checked)}
                                            className="w-4 h-4 rounded border-border/40 text-primary focus:ring-primary/20"
                                        />
                                        <label htmlFor="superAdminOnly" className="text-sm font-bold text-text-primary cursor-pointer">
                                            مهمة تظهر للسوبر أدمن فقط
                                        </label>
                                    </div>
                                )}

                                {(user?.role === 'admin' || user?.role === 'leader') && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">المرحلة المخصصة</label>
                                        <div className="bg-surface/50 border border-border/50 rounded-xl p-3 flex items-center justify-between gap-3">
                                            <span className="text-xs text-text-muted">سيتم ربط المهمة تلقائياً بمرحلتك الحالية</span>
                                            <StageBadge stageId={user.stageId} size="sm" />
                                        </div>
                                    </div>
                                )}

                                <button type="submit" className="btn btn-primary w-full py-3">
                                    <CheckCircle2 className="w-5 h-5" />
                                    إنشاء المهمة
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
