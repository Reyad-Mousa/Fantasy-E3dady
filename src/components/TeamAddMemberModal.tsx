import { motion } from 'motion/react';
import { X, UserPlus, ArrowLeftRight, Trash2 } from 'lucide-react';
import { type TeamData } from '@/hooks/useTeamsData';
import { buildMemberKey } from '@/services/memberKeys';
import { type MemberDetailsTarget } from './MemberScoreDetailsModal';

interface TeamAddMemberModalProps {
    team: TeamData;
    onClose: () => void;
    newMemberName: string;
    setNewMemberName: (name: string) => void;
    onAddMember: (e: React.FormEvent) => void;
    onViewMemberDetails: (details: MemberDetailsTarget) => void;
    onMoveMember: (team: TeamData, memberName: string) => void;
    onRemoveMember: (team: TeamData, memberName: string) => void;
}

export default function TeamAddMemberModal({
    team,
    onClose,
    newMemberName,
    setNewMemberName,
    onAddMember,
    onViewMemberDetails,
    onMoveMember,
    onRemoveMember
}: TeamAddMemberModalProps) {
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
                        👤 إضافة أعضاء — {team.name}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-surface rounded-xl transition-colors">
                        <X className="w-5 h-5 text-text-muted" />
                    </button>
                </div>

                {/* Add form */}
                <form onSubmit={onAddMember} className="flex gap-2 mb-4">
                    <input
                        type="text"
                        required
                        value={newMemberName}
                        onChange={e => setNewMemberName(e.target.value)}
                        className="input-field flex-1"
                        placeholder="اسم العضو"
                        autoFocus
                    />
                    <button type="submit" className="btn btn-primary shrink-0">
                        <UserPlus className="w-4 h-4" />
                        إضافة
                    </button>
                </form>

                {/* Current members */}
                <div className="border-t border-border/30 pt-3">
                    <h4 className="text-xs font-bold text-text-secondary mb-2">
                        الأعضاء الحاليين ({team.members?.length || 0})
                    </h4>
                    {team.members && team.members.length > 0 ? (
                        <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                            {team.members.map((member, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface/30"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                            {(member || '؟').charAt(0)}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => onViewMemberDetails({
                                                memberKey: buildMemberKey({ teamId: team.id, memberName: member }),
                                                memberName: member,
                                                name: member,
                                                teamId: team.id,
                                                teamName: team.name,
                                                stageId: team.stageId || null,
                                            })}
                                            className="text-sm text-text-primary font-bold hover:text-primary-light transition-colors"
                                        >
                                            {member}
                                        </button>
                                    </div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => onMoveMember(team, member)}
                                            className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"
                                            title="نقل إلى فريق آخر"
                                        >
                                            <ArrowLeftRight className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => onRemoveMember(team, member)}
                                            className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                            title="إزالة"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-text-muted text-center py-6">لم يتم إضافة أعضاء بعد</p>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
