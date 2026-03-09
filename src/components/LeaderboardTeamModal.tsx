import { motion } from 'motion/react';
import { Trophy, UserRound, X, ChevronLeft } from 'lucide-react';
import { Team, MemberStat } from './Leaderboard';
import { StageId } from '@/config/stages';
import { mergeTeamMemberTotals } from '@/services/memberTotals';
import { buildMemberKey } from '@/services/memberKeys';
import { MemberDetailsTarget } from './MemberScoreDetailsModal';

interface LeaderboardTeamModalProps {
    selectedTeam: Team | null;
    setSelectedTeam: (team: Team | null) => void;
    membersByStage: Record<StageId, MemberStat[]>;
    setMemberDetails: (details: MemberDetailsTarget | null) => void;
    teamsById: Record<string, Team>;
}

export function LeaderboardTeamModal({
    selectedTeam,
    setSelectedTeam,
    membersByStage,
    setMemberDetails,
    teamsById,
}: LeaderboardTeamModalProps) {
    if (!selectedTeam) return null;

    const stageMembers = (membersByStage[selectedTeam.stageId as StageId] || [])
        .filter(member => member.teamId === selectedTeam.id);
    const teamMembers = mergeTeamMemberTotals({
        teamId: selectedTeam.id,
        teamMembers: selectedTeam.members || [],
        entries: stageMembers,
        resolveStageId: (teamId) => teamsById[teamId]?.stageId || null,
    });

    return (
        <div className="modal-backdrop" onClick={() => setSelectedTeam(null)}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="glass-card p-0 max-w-md w-full overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="gradient-primary p-6 text-center relative">
                    <button
                        onClick={() => setSelectedTeam(null)}
                        className="absolute top-4 left-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                    >
                        <X className="w-4 h-4 text-white" />
                    </button>
                    <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-3">
                        <span className="text-3xl font-black text-white">{(selectedTeam.name || '؟').charAt(0)}</span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-1">
                        {selectedTeam.name}
                    </h3>
                    <div className="flex items-center justify-center gap-4 text-white/80 text-sm">
                        <span className="flex items-center gap-1">
                            <Trophy className="w-4 h-4" />
                            {Math.round(selectedTeam.totalPoints)} نقطة
                        </span>
                        <span className="flex items-center gap-1">
                            <UserRound className="w-4 h-4" />
                            {selectedTeam.memberCount} عضو
                        </span>
                    </div>
                </div>

                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    <h4 className="font-bold text-text-primary mb-3 px-2">أعضاء الفريق</h4>
                    {teamMembers.length === 0 ? (
                        <div className="text-center p-6 bg-surface/30 rounded-xl border border-border/50">
                            <p className="text-text-muted text-sm">لا يوجد أعضاء في هذا الفريق</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {teamMembers.map((member, idx) => {
                                const rank = idx + 1;
                                return (
                                    <div
                                        key={member.id}
                                        className={`flex items-center justify-between p-3 rounded-xl border ${rank <= 3
                                            ? 'bg-gradient-to-l from-primary/10 to-transparent border-primary/20'
                                            : 'bg-surface/50 border-border/50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${rank === 1 ? 'bg-amber-500/20 text-amber-500' :
                                                rank === 2 ? 'bg-slate-400/20 text-slate-400' :
                                                    rank === 3 ? 'bg-amber-700/20 text-amber-700' :
                                                        'bg-white/5 text-text-muted'
                                                }`}>
                                                {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setMemberDetails({
                                                    memberKey: member.memberKey || buildMemberKey({
                                                        memberUserId: member.memberUserId || undefined,
                                                        teamId: selectedTeam.id,
                                                        memberName: member.memberName,
                                                    }),
                                                    memberUserId: member.memberUserId || null,
                                                    memberName: member.memberName,
                                                    name: member.memberName,
                                                    teamId: selectedTeam.id,
                                                    teamName: selectedTeam.name,
                                                    stageId: member.stageId || selectedTeam.stageId,
                                                    totalPoints: member.totalPoints,
                                                })}
                                                className="group text-right"
                                            >
                                                <span className="font-bold text-text-primary text-sm block group-hover:text-primary-light transition-colors">
                                                    {member.memberName}
                                                </span>
                                                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary-light/85 transition-colors group-hover:border-primary/40 group-hover:bg-primary/15">
                                                    اضغط لعرض البيانات
                                                    <ChevronLeft className="w-3 h-3" />
                                                </span>
                                            </button>
                                        </div>
                                        <div className="text-right flex flex-col items-end justify-center">
                                            <span className={`font-black ${rank === 1 ? 'text-amber-500' :
                                                rank === 2 ? 'text-slate-400' :
                                                    rank === 3 ? 'text-amber-700' :
                                                        'text-text-secondary'
                                                }`}>
                                                {Math.round(member.totalPoints)}
                                            </span>
                                            {selectedTeam.totalPoints > 0 && (
                                                <span className="text-[10px] text-text-muted/70 font-bold mt-0.5" dir="ltr">
                                                    {((member.totalPoints / selectedTeam.totalPoints) * 100).toFixed(1)}%
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
