import { motion } from 'motion/react';
import { X, ArrowLeftRight } from 'lucide-react';
import StageBadge from './StageBadge';
import { type TeamData } from '@/hooks/useTeamsData';

interface TeamMoveMemberModalProps {
    moveMemberState: { team: TeamData; memberName: string };
    onClose: () => void;
    moveTargetTeamId: string;
    setMoveTargetTeamId: (id: string) => void;
    teams: TeamData[];
    isMoving: boolean;
    onMoveMemberSubmit: (e: React.FormEvent) => void;
}

export default function TeamMoveMemberModal({
    moveMemberState,
    onClose,
    moveTargetTeamId,
    setMoveTargetTeamId,
    teams,
    isMoving,
    onMoveMemberSubmit
}: TeamMoveMemberModalProps) {
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
                        <ArrowLeftRight className="inline w-5 h-5 ml-2 text-primary" />
                        نقل عضو — {moveMemberState.memberName}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-surface rounded-xl transition-colors"
                    >
                        <X className="w-5 h-5 text-text-muted" />
                    </button>
                </div>

                <div className="mb-4 p-3 rounded-xl bg-surface/50 border border-border/50 text-sm text-text-secondary">
                    <p>الفريق الحالي: <span className="font-bold text-text-primary">{moveMemberState.team.name}</span></p>
                    {moveMemberState.team.stageId && (
                        <p className="mt-1">المرحلة: <StageBadge stageId={moveMemberState.team.stageId} /></p>
                    )}
                </div>

                <form onSubmit={onMoveMemberSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-text-secondary">الفريق المستهدف (نفس المرحلة)</label>
                        <select
                            value={moveTargetTeamId}
                            onChange={e => setMoveTargetTeamId(e.target.value)}
                            className="select-field"
                            required
                            autoFocus
                        >
                            <option value="">اختر الفريق</option>
                            {teams
                                .filter(t =>
                                    t.id !== moveMemberState.team.id &&
                                    t.stageId === moveMemberState.team.stageId
                                )
                                .map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))
                            }
                        </select>
                    </div>

                    <p className="text-xs text-text-muted">
                        ⚠️ سيتم نقل جميع نقاط وسجلات العضو إلى الفريق الجديد تلقائياً.
                    </p>

                    <button
                        type="submit"
                        disabled={!moveTargetTeamId || isMoving}
                        className="btn btn-primary w-full py-3"
                    >
                        {isMoving ? <div className="spinner !w-4 !h-4" /> : <ArrowLeftRight className="w-4 h-4" />}
                        {isMoving ? 'جاري النقل...' : 'نقل العضو'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
