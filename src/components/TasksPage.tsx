import { useState, useEffect, useMemo } from 'react';
import {
    collection, onSnapshot, query, where, doc, updateDoc, addDoc,
    serverTimestamp, orderBy, increment, setDoc
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth, canCreateTasks, canRegisterScores } from '@/context/AuthContext';
import { addPendingScore, cacheTasks, getCachedTasks } from '@/services/offlineDb';
import { logActivity } from '@/services/activityLogger';
import { useOnlineStatus, useToast, EmptyState, SectionHeader } from './ui/SharedUI';
import StageBadge from './StageBadge';
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

// Helper to detect mass-attendance tasks
const isMassTask = (title: string) =>
    title.includes('قداس') || title.includes('قداسس');

// ── localStorage helpers for attendance persistence ────────────────────────
//  Key format:  attendance_<taskId>_<YYYY-MM-DD>
//  Auto-expires: a new day produces a different key, so old data is ignored.
const todayStr = () => new Date().toISOString().slice(0, 10);
const attendanceCacheKey = (taskId: string) =>
    `attendance_${taskId}_${todayStr()}`;

const loadAttendedKeys = (taskId: string): Set<string> => {
    try {
        const raw = localStorage.getItem(attendanceCacheKey(taskId));
        if (!raw) return new Set();
        return new Set(JSON.parse(raw) as string[]);
    } catch { return new Set(); }
};

const saveAttendedKeys = (taskId: string, keys: Set<string>) => {
    try {
        localStorage.setItem(attendanceCacheKey(taskId), JSON.stringify([...keys]));
    } catch { /* storage full — ignore */ }
};
// ──────────────────────────────────────────────────────────────────────────

function isPermissionDeniedError(error: unknown): boolean {
    return Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'permission-denied'
    );
}

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
    const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

    // Auto-open modal if initialTaskId is provided
    useEffect(() => {
        if (initialTaskId && tasks.length > 0) {
            const task = tasks.find(t => t.id === initialTaskId && t.status === 'active');
            if (task && isMassTask(task.title)) {
                setAttendanceTask(task);
            }
        }
    }, [initialTaskId, tasks]);

    // When a mass task modal opens, restore today's attendance from localStorage
    useEffect(() => {
        if (attendanceTask) {
            setAddedKeys(loadAttendedKeys(attendanceTask.id));
        }
    }, [attendanceTask?.id]);

    // Fetch teams + members for attendance modal
    useEffect(() => {
        if (!user) return;
        const stageScopedRole = user.role === 'admin' || user.role === 'leader';
        const stageFilter = stageScopedRole && user.stageId
            ? where('stageId', '==', user.stageId) : null;

        const teamsQ = stageFilter
            ? query(collection(db, 'teams'), stageFilter)
            : collection(db, 'teams');

        const u1 = onSnapshot(
            teamsQ,
            snap => setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team))),
            err => console.error('Teams:', err)
        );

        const u2 = onSnapshot(
            collection(db, 'users'),
            snap => setMemberUsers(
                snap.docs.map(d => ({ id: d.id, ...d.data() } as MemberUser))
                    .filter(u => u.role === 'member')
            ),
            () => setMemberUsers([])
        );

        return () => { u1(); u2(); };
    }, [user]);

    // Build flat member list scoped to the logged-in user's stage
    const attendanceMembers = useMemo<AttendanceMember[]>(() => {
        const stageScopedRole = user?.role === 'admin' || user?.role === 'leader';
        const myStageId = user?.stageId || null;

        // For stage-scoped roles, filter teams to their stage
        const scopedTeams = stageScopedRole && myStageId
            ? teams.filter(t => t.stageId === myStageId)
            : teams;

        const teamMap = new Map(scopedTeams.map(t => [t.id, t]));
        const result: AttendanceMember[] = [];
        const seenKeys = new Set<string>();

        // Users with role=member belonging to scoped teams
        for (const m of memberUsers) {
            if (!m.teamId || !teamMap.has(m.teamId)) continue;
            const name = (m.name || '').trim();
            if (!name) continue;
            const team = teamMap.get(m.teamId)!;
            const key = `u:${m.id}`;
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
                const normKey = `n:${team.id}:${name.toLowerCase().replace(/\s+/g, '_')}`;
                if (seenKeys.has(normKey)) continue;
                // skip if already added from users
                const alreadyUser = result.some(
                    r => r.teamId === team.id && r.name.toLowerCase().trim() === name.toLowerCase().trim()
                );
                if (alreadyUser) continue;
                seenKeys.add(normKey);
                result.push({
                    key: normKey,
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
    }, [teams, memberUsers, user]);

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

            // 4. Build the new addedKeys set, persist to localStorage
            const newAddedKeys = new Set(addedKeys).add(member.key);
            setAddedKeys(newAddedKeys);
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
                    return; // toast already shown (addedKeys & localStorage already updated above)
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
        const resolvedStageId = stageId || user.stageId || null;
        try {
            await addDoc(collection(db, 'logs'), {
                kind: 'audit',
                operation,
                entityType: 'task',
                entityId,
                entityName: entityName || 'غير معروف',
                stageId: resolvedStageId,
                actorId: user.uid,
                actorName: user.name || null,
                actorEmail: user.email || null,
                actorRole: user.role || null,
                details: details || null,
                timestamp: serverTimestamp(),
            });
            // Mirror to activities collection
            logActivity({
                kind: 'audit',
                operation,
                entityType: 'task',
                entityId,
                entityName: entityName || 'غير معروف',
                stageId: resolvedStageId,
                actorId: user.uid,
                actorName: user.name || null,
                actorRole: user.role || null,
                details: details || null,
            });
        } catch (err) {
            console.warn('Failed to log task activity:', err);
        }
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
                            const isMass = isMassTask(task.title);
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
                                            setAddedKeys(new Set());
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
                                    تم تسجيل: {addedKeys.size}
                                </span>
                            </div>

                            {/* Members List */}
                            <div className="overflow-y-auto max-h-[60vh] divide-y divide-border/20">
                                {attendanceMembers.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="text-4xl mb-3">👥</div>
                                        <p className="text-text-secondary text-sm font-bold">
                                            لا يوجد أعضاء في مرحلتك
                                        </p>
                                    </div>
                                ) : (
                                    attendanceMembers.map(member => {
                                        const isAdded = addedKeys.has(member.key);
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
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-text-primary text-sm truncate">
                                                        {member.name}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                        <StageBadge stageId={member.stageId} size="sm" />
                                                        <span className="text-[11px] text-text-muted flex items-center gap-1">
                                                            <Users className="w-3 h-3" />
                                                            {member.teamName}
                                                        </span>
                                                    </div>
                                                </div>

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
                            {addedKeys.size > 0 && online && (
                                <div className="px-6 py-3 bg-green-500/5 border-t border-green-500/20">
                                    <p className="text-xs text-green-400 font-bold text-center">
                                        ✅ تم تسجيل {addedKeys.size} حاضر بنجاح
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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
