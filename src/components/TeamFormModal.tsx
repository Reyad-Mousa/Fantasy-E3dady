import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { STAGES_LIST } from '@/config/stages';
import { type TeamData } from '@/hooks/useTeamsData';

interface TeamFormModalProps {
    editingTeam: TeamData | null;
    onClose: () => void;
    teamName: string;
    setTeamName: (name: string) => void;
    teamStageId: string;
    setTeamStageId: (id: string) => void;
    onSave: (e: React.FormEvent) => void;
    userRole?: string;
}

export default function TeamFormModal({
    editingTeam,
    onClose,
    teamName,
    setTeamName,
    teamStageId,
    setTeamStageId,
    onSave,
    userRole
}: TeamFormModalProps) {
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="glass-card p-6 max-w-md w-full"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-text-primary">
                        {editingTeam ? 'تعديل الفريق' : '🏆 فريق جديد'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-surface rounded-xl transition-colors">
                        <X className="w-5 h-5 text-text-muted" />
                    </button>
                </div>

                <form onSubmit={onSave} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-text-secondary">اسم الفريق</label>
                        <input
                            type="text"
                            required
                            value={teamName}
                            onChange={e => setTeamName(e.target.value)}
                            className="input-field"
                            placeholder="مثال: فريق النسور"
                            autoFocus
                        />
                    </div>

                    {userRole === 'super_admin' && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-secondary">اختر المرحلة</label>
                            <select
                                value={teamStageId}
                                onChange={e => setTeamStageId(e.target.value)}
                                className="select-field"
                                required
                            >
                                <option value="">حدد المرحلة الدراسية</option>
                                {STAGES_LIST.map(stage => (
                                    <option key={stage.id} value={stage.id}>{stage.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary w-full py-3">
                        {editingTeam ? 'حفظ التعديلات' : 'إنشاء الفريق'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
