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
import { type FilterValue } from './StageFilterBar';
import { type MemberDetailsTarget } from './MemberScoreDetailsModal';
import { Plus, Clock } from 'lucide-react';

import { type Task } from './TaskCard';
import TaskAttendanceModal from './TaskAttendanceModal';
import TaskFormModal from './TaskFormModal';
import { useTasksAttendance } from '@/hooks/useTasksAttendance';
import { TasksActiveGrid } from './TasksActiveGrid';
import { TasksArchivedSection } from './TasksArchivedSection';

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

    const [memberDetails, setMemberDetails] = useState<MemberDetailsTarget | null>(null);
    const [attendanceStageFilter, setAttendanceStageFilter] = useState<FilterValue>(
        user?.role === 'super_admin' ? 'all' : (user?.stageId as FilterValue) || 'all'
    );

    const {
        attendanceTask,
        setAttendanceTask,
        addingKey,
        resolvedAddedKeys,
        setResolvedAddedKeys,
        attendanceMembers,
        visibleAddedCount,
        handleGivePoints
    } = useTasksAttendance({
        user,
        online,
        tasks,
        attendanceStageFilter,
        showToast
    });

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
            <TasksActiveGrid
                tasks={activeTasks}
                user={user}
                onTaskClick={(task) => {
                    const isMass = isMassTaskTitle(task.title);
                    if (isMass && user) {
                        setAttendanceTask(task);
                        setResolvedAddedKeys(new Set());
                    }
                }}
                onArchiveClick={(task, e) => handleArchiveTask(task)}
                canArchiveTask={canArchiveTask}
            />

            {/* Archived Tasks */}
            <TasksArchivedSection tasks={archivedTasks} />

            <TaskAttendanceModal
                attendanceTask={attendanceTask!} // Handled inside by AnimatePresence
                onClose={() => setAttendanceTask(null)}
                attendanceMembers={attendanceMembers}
                resolvedAddedKeys={resolvedAddedKeys}
                visibleAddedCount={visibleAddedCount}
                addingKey={addingKey}
                online={online}
                userRole={user?.role}
                attendanceStageFilter={attendanceStageFilter}
                setAttendanceStageFilter={setAttendanceStageFilter}
                setMemberDetails={setMemberDetails}
                handleGivePoints={handleGivePoints}
                memberDetails={memberDetails}
                stageScope={(user?.role === 'super_admin'
                    ? (attendanceStageFilter === 'all' ? null : attendanceStageFilter)
                    : (user?.stageId || memberDetails?.stageId || null)) as FilterValue | null}
            />

            <TaskFormModal
                showCreateModal={showCreateModal}
                setShowCreateModal={setShowCreateModal}
                newTitle={newTitle}
                setNewTitle={setNewTitle}
                newPoints={newPoints}
                setNewPoints={setNewPoints}
                newTeamPoints={newTeamPoints}
                setNewTeamPoints={setNewTeamPoints}
                selectedStage={selectedStage}
                setSelectedStage={setSelectedStage}
                isSuperAdminOnly={isSuperAdminOnly}
                setIsSuperAdminOnly={setIsSuperAdminOnly}
                handleCreateTask={handleCreateTask}
                userRole={user?.role}
                userStageId={user?.stageId}
            />
        </div>
    );
}
