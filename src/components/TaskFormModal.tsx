import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, CheckCircle2 } from 'lucide-react';
import StageBadge from './StageBadge';

interface TaskFormModalProps {
    showCreateModal: boolean;
    setShowCreateModal: (show: boolean) => void;
    newTitle: string;
    setNewTitle: (title: string) => void;
    newPoints: string;
    setNewPoints: (points: string) => void;
    newTeamPoints: string;
    setNewTeamPoints: (points: string) => void;
    selectedStage: string;
    setSelectedStage: (stage: string) => void;
    isSuperAdminOnly: boolean;
    setIsSuperAdminOnly: (val: boolean) => void;
    handleCreateTask: (e: React.FormEvent) => void;
    userRole?: string;
    userStageId?: string | null;
}

export default function TaskFormModal({
    showCreateModal,
    setShowCreateModal,
    newTitle,
    setNewTitle,
    newPoints,
    setNewPoints,
    newTeamPoints,
    setNewTeamPoints,
    selectedStage,
    setSelectedStage,
    isSuperAdminOnly,
    setIsSuperAdminOnly,
    handleCreateTask,
    userRole,
    userStageId
}: TaskFormModalProps) {
    if (!showCreateModal) return null;

    return (
        <AnimatePresence>
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

                        {userRole === 'super_admin' && (
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

                        {userRole === 'super_admin' && (
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

                        {(userRole === 'admin' || userRole === 'leader') && userStageId && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-secondary">المرحلة المخصصة</label>
                                <div className="bg-surface/50 border border-border/50 rounded-xl p-3 flex items-center justify-between gap-3">
                                    <span className="text-xs text-text-muted">سيتم ربط المهمة تلقائياً بمرحلتك الحالية</span>
                                    <StageBadge stageId={userStageId} size="sm" />
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
        </AnimatePresence>
    );
}
