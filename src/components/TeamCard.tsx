import { motion } from 'motion/react';
import { Edit3, Trash2, Users, Trophy, UserPlus, UserMinus, ArrowLeftRight } from 'lucide-react';
import StageBadge from './StageBadge';
import { type TeamData } from '@/hooks/useTeamsData';
import { buildMemberKey } from '@/services/memberKeys';
import { type MemberDetailsTarget } from './MemberScoreDetailsModal';

interface TeamCardProps {
    team: TeamData;
    canManageTeamDetails: boolean;
    onEditTeam: (team: TeamData) => void;
    onDeleteTeam: (team: TeamData) => void;
    onAddMember: (team: TeamData) => void;
    onViewMemberDetails: (details: MemberDetailsTarget) => void;
    onMoveMember: (team: TeamData, memberName: string) => void;
    onRemoveMember: (team: TeamData, memberName: string) => void;
}

export default function TeamCard({
    team,
    canManageTeamDetails,
    onEditTeam,
    onDeleteTeam,
    onAddMember,
    onViewMemberDetails,
    onMoveMember,
    onRemoveMember,
}: TeamCardProps) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card glass-card-hover p-5"
        >
            {/* Team Header */}
            <div className="flex items-start justify-between mb-4 gap-3">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white font-black text-xl shrink-0 shadow-sm border border-white/10">
                        {(team.name || '؟').charAt(0)}
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-text-primary text-base sm:text-lg truncate" title={team.name}>{team.name}</h3>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className="flex items-center gap-1 text-[11px] font-bold text-text-secondary bg-surface px-2 py-0.5 rounded-lg border border-border/50">
                                <Trophy className="w-3 h-3 text-accent" />
                                {team.totalPoints} نقطة
                            </span>
                            <span className="flex items-center gap-1 text-[11px] font-bold text-text-secondary bg-surface px-2 py-0.5 rounded-lg border border-border/50">
                                <Users className="w-3 h-3 text-primary" />
                                {team.members?.length || 0} عضو
                            </span>
                            {team.stageId && <StageBadge stageId={team.stageId} />}
                        </div>
                    </div>
                </div>
                {canManageTeamDetails && (
                    <div className="flex flex-col gap-1 shrink-0 bg-surface/50 p-1 rounded-xl border border-border/50">
                        <button
                            onClick={() => onEditTeam(team)}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"
                            title="تعديل"
                        >
                            <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onDeleteTeam(team)}
                            className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                            title="حذف"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            {/* Members List */}
            <div className="border-t border-border/30 pt-3 mt-3">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-text-secondary">الأعضاء</h4>
                    {canManageTeamDetails && (
                        <button
                            onClick={() => onAddMember(team)}
                            className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-light transition-colors"
                        >
                            <UserPlus className="w-3 h-3" />
                            إضافة
                        </button>
                    )}
                </div>

                {team.members && team.members.length > 0 ? (
                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                        {team.members.map((member, i) => (
                            <div
                                key={i}
                                className="flex items-center justify-between group py-1 px-2 rounded-lg hover:bg-surface/50 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
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
                                        className="text-sm text-text-primary hover:text-primary-light transition-colors"
                                    >
                                        {member}
                                    </button>
                                </div>
                                {canManageTeamDetails && (
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => onMoveMember(team, member)}
                                            className="p-1 rounded-md hover:bg-primary/10 text-text-muted hover:text-primary transition-all"
                                            title="نقل إلى فريق آخر"
                                        >
                                            <ArrowLeftRight className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => onRemoveMember(team, member)}
                                            className="p-1 rounded-md hover:bg-danger/10 text-text-muted hover:text-danger transition-all"
                                            title="إزالة"
                                        >
                                            <UserMinus className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-text-muted text-center py-3">لا يوجد أعضاء بعد</p>
                )}
            </div>
        </motion.div>
    );
}
