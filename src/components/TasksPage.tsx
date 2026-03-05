import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, updateDoc, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth, canCreateTasks } from '@/context/AuthContext';
import { cacheTasks, getCachedTasks } from '@/services/offlineDb';
import { useOnlineStatus, useToast, EmptyState, SectionHeader } from './ui/SharedUI';
import StageBadge from './StageBadge';
import { motion, AnimatePresence } from 'motion/react';
import { ListTodo, Plus, Clock, CheckCircle2, XCircle, Trophy, Target, X, Calendar } from 'lucide-react';

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
}

interface TaskScore {
    id: string;
    teamId: string;
    taskId: string;
    status: 'pending' | 'completed' | 'failed';
}

export default function TasksPage({ onBack }: { onBack?: () => void }) {
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

    useEffect(() => {
        if (online) {
            const q = query(collection(db, 'tasks'), orderBy('status'));
            const unsub = onSnapshot(q, (snap) => {
                let data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));

                // Non-super admins see shared tasks + tasks for their stage only.
                if (user?.role !== 'super_admin' && user?.stageId) {
                    data = data.filter(t => !t.stageId || t.stageId === user.stageId);
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

            if (user?.role !== 'super_admin' && user?.stageId) {
                data = data.filter(t => !t.stageId || t.stageId === user.stageId);
            }

            data = data.filter(t => t.type === 'team' || t.type === 'member');

            setTasks(data);
            setLoading(false);
        });
    }, [online, user?.role, user?.stageId]);
    const createAuditLog = async (operation: 'create' | 'delete' | 'update', entityId: string, entityName: string, stageId?: string | null, details?: string | null) => {
        if (!user) return;
        try {
            await addDoc(collection(db, 'logs'), {
                kind: 'audit',
                operation,
                entityType: 'task',
                entityId,
                entityName: entityName || 'غير معروف',
                stageId: stageId || user.stageId || null,
                actorId: user.uid,
                actorName: user.name || null,
                actorEmail: user.email || null,
                actorRole: user.role || null,
                details: details || null,
                timestamp: serverTimestamp(),
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
        // Leaders and admins can only archive tasks they created themselves.
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
                        {activeTasks.map((task, i) => (
                            <motion.div
                                key={task.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ delay: i * 0.05 }}
                                className="glass-card glass-card-hover p-5"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="p-2 rounded-xl bg-primary/15 text-primary-light">
                                        <Target className="w-5 h-5" />
                                    </div>
                                    <span className={`badge ${task.type === 'team' ? 'badge-sync' : 'badge-pending'}`}>
                                        {task.type === 'team' ? 'فريق' : 'فرد'}
                                    </span>
                                </div>

                                <h3 className="font-bold text-text-primary mb-2">{task.title}</h3>

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
                                            onClick={() => handleArchiveTask(task)}
                                            className="text-text-muted hover:text-danger transition-colors text-xs font-bold flex items-center gap-1"
                                        >
                                            <XCircle className="w-3.5 h-3.5" />
                                            أرشفة
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        ))}
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
