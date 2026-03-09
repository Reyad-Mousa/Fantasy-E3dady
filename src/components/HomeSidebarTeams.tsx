import { Award, Trophy, Users, ChevronLeft, ArrowLeft, Medal } from 'lucide-react';
import { STAGES_LIST } from '@/config/stages';
import { StatsCard } from './ui/SharedUI';

interface HomeSidebarTeamsProps {
    stageStats: any[];
    user: any;
    stats: any;
    navigate: (tab: string, taskId?: string) => void;
    setSelectedTeam: (team: any) => void;
}

export function HomeSidebarTeams({
    stageStats,
    user,
    stats,
    navigate,
    setSelectedTeam
}: HomeSidebarTeamsProps) {
    return (
        <div className="lg:col-span-4 space-y-6">
            {/* Top Team Per Stage Section - Redesigned */}
            <div className="bg-surface-card rounded-3xl p-6 border border-white/5 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-success opacity-50" />
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-black text-white flex items-center gap-2 text-sm uppercase tracking-tight">
                        <Award className="w-4 h-4 text-accent" />
                        أبطال المراحل
                    </h2>
                    <button onClick={() => navigate('leaderboard')} className="text-[10px] text-text-secondary font-black hover:text-accent transition-colors flex items-center gap-1">
                        المتصدرين
                        <ArrowLeft className="w-3 h-3" />
                    </button>
                </div>

                <div className="space-y-4">
                    {STAGES_LIST.map((stage: any) => {
                        const stageData = stageStats.find((s: any) => s.name === stage.name);
                        const topTeams = stageData?.topTeams || [];

                        return (
                            <div key={stage.id} className="relative bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
                                <div className="px-3 py-2 bg-white/[0.03] border-b border-white/5 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: stage.color, color: stage.color }} />
                                    <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: stage.color, filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.8)) brightness(1.2)' }}>{stage.name}</span>
                                </div>

                                <div className="divide-y divide-white/5">
                                    {topTeams.length > 0 ? (
                                        topTeams.map((team: any, idx: number) => (
                                            <div
                                                key={team.id || idx}
                                                onClick={() => setSelectedTeam(team)}
                                                className="flex items-center gap-3 p-3 hover:bg-white/[0.04] transition-all group cursor-pointer"
                                            >
                                                <div
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs transition-colors"
                                                    style={
                                                        idx === 0
                                                            ? { backgroundColor: `${stage.color}20`, color: stage.color, border: `1px solid ${stage.color}40` }
                                                            : idx === 1
                                                                ? { backgroundColor: 'rgba(203, 213, 225, 0.1)', color: '#cbd5e1', border: '1px solid rgba(203, 213, 225, 0.3)' }
                                                                : idx === 2
                                                                    ? { backgroundColor: 'rgba(217, 119, 6, 0.1)', color: '#d97706', border: '1px solid rgba(217, 119, 6, 0.3)' }
                                                                    : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }
                                                    }
                                                >
                                                    {idx === 0 ? <Trophy className="w-4 h-4" /> : idx === 1 || idx === 2 ? <Medal className="w-4 h-4" /> : idx + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-bold text-text-primary truncate transition-colors group-hover:text-white">{team.name}</h4>
                                                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-accent/15 bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent/90 transition-colors group-hover:border-accent/35 group-hover:bg-accent/15">
                                                        اضغط لعرض الفريق
                                                        <ChevronLeft className="w-3 h-3" />
                                                    </span>
                                                </div>
                                                <div className="text-right flex flex-col items-end justify-center">
                                                    <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                                        <div className="text-base font-black text-white">{team.computedPoints || 0}</div>
                                                        {(team.members && team.members.length > 0) && (
                                                            <div className="flex items-center gap-1 text-[10px] text-text-muted bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                                                <Users className="w-3 h-3 text-text-muted" />
                                                                {team.members.length}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {stageData && stageData.points > 0 && (
                                                        <div className="text-[10px] text-text-muted font-bold opacity-60 group-hover:opacity-100 transition-opacity mt-0.5" dir="ltr">
                                                            {(((team.computedPoints || 0) / stageData.points) * 100).toFixed(1)}%
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center text-xs text-text-muted font-bold">لم تضاف فرق بعد...</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* User Quick Stats in Sidebar on Desktop or as Cards on Mobile */}
            {user && (
                <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4">
                    <StatsCard icon="🏆" label="ترتيبك" value={stats.rank} color="accent" />
                    <StatsCard icon="⭐" label="نقاطك" value={stats.points} color="primary" />
                </div>
            )}
        </div>
    );
}
