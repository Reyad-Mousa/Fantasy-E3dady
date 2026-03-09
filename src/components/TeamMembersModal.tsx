import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Users, X, ChevronLeft, Medal } from 'lucide-react';

interface TeamMembersModalProps {
    selectedTeamLive: any;
    setSelectedTeam: (team: any) => void;
    animationsEnabled: boolean;
    loadingMembers: boolean;
    teamMembersStats: any[];
    setMemberDetails: (details: any) => void;
    buildMemberKey: (params: any) => string;
}

export function TeamMembersModal({
    selectedTeamLive,
    setSelectedTeam,
    animationsEnabled,
    loadingMembers,
    teamMembersStats,
    setMemberDetails,
    buildMemberKey,
}: TeamMembersModalProps) {
    if (!selectedTeamLive) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTeam(null)}>
                <motion.div
                    initial={animationsEnabled ? { opacity: 0, scale: 0.95, y: 10 } : false}
                    animate={animationsEnabled ? { opacity: 1, scale: 1, y: 0 } : undefined}
                    exit={animationsEnabled ? { opacity: 0, scale: 0.95, y: 10 } : undefined}
                    className="bg-surface-card border border-white/10 rounded-3xl p-6 w-full max-w-sm sm:max-w-md shadow-2xl relative"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-success opacity-50" />

                    <div className="flex items-start justify-between mb-6 pt-2">
                        <div>
                            <h3 className="text-xl sm:text-2xl font-black text-white mb-2">{selectedTeamLive.name}</h3>
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-sm bg-accent/10 text-accent px-2 py-1 rounded-lg font-bold flex items-center gap-1.5 border border-accent/20">
                                    <Trophy className="w-3.5 h-3.5 fill-accent" />
                                    {Math.round(selectedTeamLive.totalPoints || 0)} نقطة
                                </span>
                                <span className="text-sm bg-white/5 text-text-primary px-2 py-1 rounded-lg font-bold flex items-center gap-1.5 border border-white/10">
                                    <Users className="w-3.5 h-3.5 text-text-muted" />
                                    {selectedTeamLive.members?.length || 0} أعضاء
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedTeam(null)}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors bg-white/5"
                        >
                            <X className="w-5 h-5 text-text-primary" />
                        </button>
                    </div>

                    <div className="border-t border-white/5 pt-4">
                        <h4 className="text-xs font-black text-text-muted tracking-wider uppercase mb-3">أعضاء الفريق (حسب النقاط)</h4>

                        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 hide-scrollbar" dir="rtl">
                            {loadingMembers ? (
                                <div className="flex justify-center py-6">
                                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : teamMembersStats.length > 0 ? (
                                teamMembersStats.map((member: any, i: number) => (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors cursor-default">
                                        <div
                                            className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shadow-inner shrink-0"
                                            style={
                                                i === 0
                                                    ? { backgroundColor: `rgba(245, 158, 11, 0.2)`, color: '#f59e0b', border: `1px solid rgba(245, 158, 11, 0.4)` }
                                                    : i === 1
                                                        ? { backgroundColor: 'rgba(203, 213, 225, 0.1)', color: '#cbd5e1', border: '1px solid rgba(203, 213, 225, 0.3)' }
                                                        : i === 2
                                                            ? { backgroundColor: 'rgba(217, 119, 6, 0.1)', color: '#d97706', border: '1px solid rgba(217, 119, 6, 0.3)' }
                                                            : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#94a3b8' }
                                            }
                                        >
                                            {i === 0 ? <Trophy className="w-4 h-4" /> : i === 1 || i === 2 ? <Medal className="w-4 h-4" /> : i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <button
                                                type="button"
                                                onClick={() => setMemberDetails({
                                                    memberKey: member.memberKey || buildMemberKey({
                                                        memberUserId: member.memberUserId || undefined,
                                                        teamId: selectedTeamLive.id,
                                                        memberName: member.name,
                                                    }),
                                                    memberUserId: member.memberUserId || null,
                                                    memberName: member.name,
                                                    name: member.name,
                                                    teamId: selectedTeamLive.id,
                                                    teamName: selectedTeamLive.name,
                                                    stageId: member.stageId || selectedTeamLive.stageId || null,
                                                    totalPoints: member.points,
                                                })}
                                                className="group text-right max-w-full"
                                            >
                                                <span className="font-bold text-text-primary text-sm truncate block group-hover:text-primary-light transition-colors">
                                                    {member.name}
                                                </span>
                                                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary-light/85 transition-colors group-hover:border-primary/40 group-hover:bg-primary/15">
                                                    اضغط لعرض البيانات
                                                    <ChevronLeft className="w-3 h-3" />
                                                </span>
                                            </button>
                                        </div>
                                        <div className="text-right shrink-0 flex flex-col items-end">
                                            <span className="text-sm font-black text-white flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded-md border border-white/5">
                                                {member.points}
                                                <span className="text-[10px] text-text-muted font-bold">نقطة</span>
                                            </span>
                                            {(() => {
                                                const teamTotal = selectedTeamLive.totalPoints || 0;
                                                return teamTotal > 0 ? (
                                                    <span className="text-[10px] text-text-muted/60 font-bold mt-1 pr-1" dir="ltr">
                                                        {((member.points / teamTotal) * 100).toFixed(1)}%
                                                    </span>
                                                ) : null;
                                            })()}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-10 bg-white/[0.01] rounded-2xl border border-white/5 border-dashed">
                                    <div className="bg-white/5 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Users className="w-5 h-5 text-text-muted/60" />
                                    </div>
                                    <p className="font-bold text-sm text-text-muted">لا يوجد أعضاء مضافين في هذا الفريق</p>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
