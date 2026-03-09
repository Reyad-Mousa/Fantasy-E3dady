import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { Bar, BarChart, Cell, Tooltip, XAxis } from 'recharts';
import { StageId, STAGES_LIST } from '@/config/stages';
import { Team, MemberStat } from './Leaderboard';
import { MemberDetailsTarget } from './MemberScoreDetailsModal';
import { buildMemberKey } from '@/services/memberKeys';

interface StageLeaderboardCardProps {
    stageId: StageId;
    boardType: 'teams' | 'members';
    teams: Team[];
    members: MemberStat[];
    chartSize: { width: number; height: number } | undefined;
    onSetChartRef: (node: HTMLDivElement | null) => void;
    setSelectedTeam: (team: Team | null) => void;
    setMemberDetails: (details: MemberDetailsTarget | null) => void;
    getTeamName: (teamId: string) => string;
}

export function StageLeaderboardCard({
    stageId,
    boardType,
    teams,
    members,
    chartSize,
    onSetChartRef,
    setSelectedTeam,
    setMemberDetails,
    getTeamName,
}: StageLeaderboardCardProps) {
    const stage = STAGES_LIST.find((s) => s.id === stageId)!;
    const isTeams = boardType === 'teams';
    const list = isTeams ? teams : members;
    const totalStagePoints = Math.round(list.reduce((sum, item: any) => sum + (item.totalPoints || 0), 0));

    const top5 = list.slice(0, 5).map((item: any, i) => ({
        name: isTeams ? item.name : item.memberName,
        points: item.totalPoints,
        opacity: 1 - (i * 0.15),
    }));

    const chartKey = `${stage.id}-${boardType}`;

    return (
        <motion.div
            key={chartKey}
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ borderTopColor: stage.color, borderTopWidth: '4px' }}
            className="glass-card overflow-hidden flex flex-col min-h-[500px]"
        >
            <div className="p-4 flex items-center justify-between bg-surface/30 border-b border-border/50">
                <h3 className="font-black text-lg" style={{ color: stage.color }}>{stage.name}</h3>
                <span className="text-xs font-bold text-text-muted badge border border-border/50">
                    {list.length} {isTeams ? 'فرق' : 'أفراد'}
                </span>
            </div>

            {top5.length > 0 ? (
                <div className="p-4 border-b border-border/30" dir="ltr">
                    <div
                        ref={onSetChartRef}
                        data-chart-key={chartKey}
                        className="h-[220px] w-full min-w-0"
                    >
                        {chartSize && chartSize.width > 0 && chartSize.height > 0 && (
                            <BarChart
                                width={chartSize.width}
                                height={chartSize.height}
                                data={top5}
                                margin={{ top: 20, right: 0, left: 0, bottom: 0 }}
                            >
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                    contentStyle={{ backgroundColor: '#0a0a0f', borderColor: stage.color, borderRadius: '12px', color: '#fff' }}
                                    itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                                />
                                <Bar dataKey="points" radius={[6, 6, 0, 0]}>
                                    {top5.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={stage.color} fillOpacity={entry.opacity} />
                                    ))}
                                </Bar>
                                <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 11, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                            </BarChart>
                        )}
                    </div>
                </div>
            ) : (
                <div className="p-6 text-center text-text-muted text-sm border-b border-border/30 flex items-center justify-center flex-1 min-h-[220px]">
                    {isTeams ? 'لا توجد فرق بعد في هذه المرحلة' : 'لا توجد نقاط أفراد بعد في هذه المرحلة'}
                </div>
            )}

            <div className="flex-1 overflow-y-auto divide-y divide-border/20 p-2">
                {list.map((item: any, index: number) => {
                    const rank = index + 1;
                    const isRank1 = rank === 1;
                    return (
                        <div
                            key={item.id}
                            onClick={() => isTeams && setSelectedTeam(item as Team)}
                            className={`group flex items-center gap-3 p-3 hover:bg-surface/50 rounded-xl transition-colors ${isTeams ? 'cursor-pointer' : ''}`}
                        >
                            <span
                                className={
                                    rank === 1 ? 'text-2xl drop-shadow-md' :
                                        rank === 2 ? 'text-2xl drop-shadow-md' :
                                            rank === 3 ? 'text-2xl drop-shadow-md' :
                                                'text-text-muted font-black w-8 text-center text-sm'
                                }
                            >
                                {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                            </span>

                            <div className="flex-1 min-w-0">
                                {isTeams ? (
                                    <div className="min-w-0">
                                        <h4 className={`font-bold text-sm truncate ${isRank1 ? '' : 'text-text-secondary'}`} style={isRank1 ? { color: stage.color } : {}}>
                                            {item.name}
                                        </h4>
                                        <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-accent/15 bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent/90 transition-colors group-hover:border-accent/35 group-hover:bg-accent/15">
                                            اضغط لعرض الفريق
                                            <ChevronLeft className="w-3 h-3" />
                                        </span>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMemberDetails({
                                                memberKey: item.memberKey || buildMemberKey({
                                                    memberUserId: item.memberUserId || undefined,
                                                    teamId: item.teamId,
                                                    memberName: item.memberName,
                                                }),
                                                memberUserId: item.memberUserId || null,
                                                memberName: item.memberName,
                                                name: item.memberName,
                                                teamId: item.teamId,
                                                teamName: getTeamName(item.teamId),
                                                stageId,
                                                totalPoints: item.totalPoints,
                                            });
                                        }}
                                        className="group text-right max-w-full"
                                    >
                                        <span className={`font-bold text-sm truncate block hover:text-primary-light transition-colors ${isRank1 ? '' : 'text-text-secondary'}`} style={isRank1 ? { color: stage.color } : undefined}>
                                            {item.memberName}
                                        </span>
                                        <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary-light/85 transition-colors group-hover:border-primary/40 group-hover:bg-primary/15">
                                            اضغط لعرض البيانات
                                            <ChevronLeft className="w-3 h-3" />
                                        </span>
                                    </button>
                                )}
                                {isTeams ? (
                                    item.memberCount > 0 && (
                                        <p className="text-[10px] text-text-muted mt-0.5">👥 {item.memberCount} عضو</p>
                                    )
                                ) : (
                                    <p className="text-[10px] text-text-muted mt-0.5">🏷️ {getTeamName(item.teamId)}</p>
                                )}
                            </div>

                            <div className="text-right flex flex-col items-end justify-center">
                                <span className={`font-black ${isRank1 ? 'text-xl' : 'text-base text-text-primary'}`} style={isRank1 ? { color: stage.color } : {}}>
                                    {Math.round(item.totalPoints)}
                                </span>
                                {totalStagePoints > 0 && (
                                    <span className="text-[10px] text-text-muted font-bold mt-0.5" dir="ltr">
                                        {((item.totalPoints / totalStagePoints) * 100).toFixed(1)}%
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
}
