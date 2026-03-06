import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, UserRound, X, ChevronLeft } from 'lucide-react';
import StageFilterBar, { FilterValue } from './StageFilterBar';
import MemberScoreDetailsModal, { type MemberDetailsTarget } from './MemberScoreDetailsModal';
import { SectionHeader } from './ui/SharedUI';
import { STAGES_LIST, StageId } from '@/config/stages';
import { Bar, BarChart, Cell, Tooltip, XAxis } from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { buildMemberKey } from '@/services/memberKeys';
import { aggregateMemberStatsTotalsFromDocs, mergeTeamMemberTotals } from '@/services/memberTotals';

interface Team {
    id: string;
    name: string;
    totalPoints: number;
    memberCount: number;
    stageId: string;
    members?: string[];
}

interface MemberStat {
    id: string;
    memberName: string;
    teamId: string;
    stageId: string;
    totalPoints: number;
    memberKey?: string | null;
    memberUserId?: string | null;
}

type BoardType = 'teams' | 'members';

const EMPTY_MEMBERS_BY_STAGE: Record<StageId, MemberStat[]> = {
    grade7: [],
    grade8: [],
    grade9: [],
};

function asStageId(value: unknown): StageId | null {
    return value === 'grade7' || value === 'grade8' || value === 'grade9'
        ? value
        : null;
}

export default function Leaderboard({ onBack }: { onBack?: () => void }) {
    const { user } = useAuth();
    const [filter, setFilter] = useState<FilterValue>('all');
    const [boardType, setBoardType] = useState<BoardType>('teams');
    const [isMounted, setIsMounted] = useState(false);
    const [teamsByStage, setTeamsByStage] = useState<Record<StageId, Team[]>>({
        grade7: [],
        grade8: [],
        grade9: [],
    });
    const [teamsById, setTeamsById] = useState<Record<string, Team>>({});
    const [membersByStage, setMembersByStage] = useState<Record<StageId, MemberStat[]>>({
        grade7: [],
        grade8: [],
        grade9: [],
    });
    const chartContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [chartSizes, setChartSizes] = useState<Record<string, { width: number; height: number }>>({});
    const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
    const [memberDetails, setMemberDetails] = useState<MemberDetailsTarget | null>(null);

    useEffect(() => {
        // Fetch all teams once and filter/sort in-memory to avoid index requirements
        const q = query(collection(db, 'teams'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const allTeams = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Team));

            const newTeamsByStage: Record<StageId, Team[]> = {
                grade7: [],
                grade8: [],
                grade9: [],
            };
            const newTeamsById: Record<string, Team> = {};

            allTeams.forEach(team => {
                newTeamsById[team.id] = team;
                const stageId = team.stageId as StageId;
                if (newTeamsByStage[stageId]) {
                    newTeamsByStage[stageId].push(team);
                }
            });

            // Sort each stage in-memory
            STAGES_LIST.forEach(stage => {
                newTeamsByStage[stage.id as StageId].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
            });

            setTeamsById(newTeamsById);
            setTeamsByStage(newTeamsByStage);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        // Fetch all member totals from member_stats so every role sees the same aggregated values.
        const q = query(collection(db, 'member_stats'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const aggregated = aggregateMemberStatsTotalsFromDocs(
                snap.docs,
                (teamId) => teamsById[teamId]?.stageId || null
            );

            const newMembersByStage: Record<StageId, MemberStat[]> = {
                grade7: [],
                grade8: [],
                grade9: [],
            };

            aggregated.forEach((member) => {
                const stageId = asStageId(member.stageId);
                if (!stageId) return;
                newMembersByStage[stageId].push({
                    id: member.id,
                    memberName: member.memberName,
                    teamId: member.teamId,
                    stageId,
                    totalPoints: member.totalPoints,
                    memberKey: member.memberKey || null,
                    memberUserId: member.memberUserId || null,
                });
            });

            STAGES_LIST.forEach(stage => {
                newMembersByStage[stage.id as StageId].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
            });

            setMembersByStage(newMembersByStage);
        }, () => {
            setMembersByStage(EMPTY_MEMBERS_BY_STAGE);
        });

        return () => unsubscribe();
    }, [teamsById]);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isMounted) {
            setChartSizes({});
            return;
        }

        const updateSize = (key: string, node: HTMLDivElement | null) => {
            if (!node) {
                setChartSizes((current) => {
                    if (!(key in current)) return current;
                    const next = { ...current };
                    delete next[key];
                    return next;
                });
                return;
            }

            const { width, height } = node.getBoundingClientRect();
            const nextWidth = width > 0 ? Math.floor(width) : 0;
            const nextHeight = height > 0 ? Math.floor(height) : 0;
            setChartSizes((current) => {
                const existing = current[key];
                if (existing && existing.width === nextWidth && existing.height === nextHeight) {
                    return current;
                }
                return {
                    ...current,
                    [key]: { width: nextWidth, height: nextHeight },
                };
            });
        };

        const resizeObserver = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                const node = entry.target as HTMLDivElement;
                const key = node.dataset.chartKey;
                if (!key) return;
                updateSize(key, node);
            });
        });

        Object.entries(chartContainerRefs.current).forEach(([key, node]) => {
            if (!node) return;
            updateSize(key, node);
            resizeObserver.observe(node);
        });

        return () => {
            resizeObserver.disconnect();
        };
    }, [isMounted, boardType, filter, teamsByStage, membersByStage]);

    const getTeamName = (teamId: string): string => {
        return teamsById[teamId]?.name || 'فريق غير معروف';
    };

    const renderStageCard = (stageId: StageId) => {
        const stage = STAGES_LIST.find((s) => s.id === stageId)!;
        const teams = teamsByStage[stageId] || [];
        const members = membersByStage[stageId] || [];
        const isTeams = boardType === 'teams';
        const list = isTeams ? teams : members;
        const totalStagePoints = Math.round(list.reduce((sum, item: any) => sum + (item.totalPoints || 0), 0));

        const top5 = (isTeams ? teams : members).slice(0, 5).map((item: any, i) => ({
            name: isTeams ? item.name : item.memberName,
            points: item.totalPoints,
            opacity: 1 - (i * 0.15),
        }));
        const chartKey = `${stage.id}-${boardType}`;
        const chartSize = chartSizes[chartKey];

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
                            ref={(node) => {
                                chartContainerRefs.current[chartKey] = node;
                            }}
                            data-chart-key={chartKey}
                            className="h-[220px] w-full min-w-0"
                        >
                            {isMounted && chartSize && chartSize.width > 0 && chartSize.height > 0 && (
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
                                            onClick={() => setMemberDetails({
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
                                            })}
                                            className="group text-right max-w-full"
                                            style={isRank1 ? { color: stage.color } : undefined}
                                        >
                                            <span className={`font-bold text-sm truncate block hover:text-primary-light transition-colors ${isRank1 ? '' : 'text-text-secondary'}`}>
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
    };

    const stagesToShow = filter === 'all' ? STAGES_LIST.map((s) => s.id) : [filter];

    return (
        <div dir="rtl" className="space-y-6">
            <SectionHeader
                title="لوحة المتصدرين"
                subtitle={boardType === 'teams' ? 'ترتيب الفرق وتحديث مباشر للنتائج' : 'ترتيب الأفراد وتحديث مباشر للنتائج'}
                onBack={onBack}
                action={
                    <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-2.5 rounded-xl shadow-lg glow-accent hidden sm:block">
                        {boardType === 'teams' ? <Trophy className="w-5 h-5 text-white" /> : <UserRound className="w-5 h-5 text-white" />}
                    </div>
                }
            />

            <div className="flex gap-2">
                <button
                    onClick={() => setBoardType('teams')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${boardType === 'teams' ? 'tab-active' : 'tab-inactive'}`}
                >
                    متصدرين الفرق
                </button>
                <button
                    onClick={() => setBoardType('members')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${boardType === 'members' ? 'tab-active' : 'tab-inactive'}`}
                >
                    متصدرين الأفراد
                </button>
            </div>

            <StageFilterBar active={filter} onChange={setFilter} showAll={true} />

            <div className={filter === 'all' ? 'grid lg:grid-cols-3 gap-6' : 'max-w-2xl mx-auto'}>
                {stagesToShow.map((id) => renderStageCard(id as StageId))}
            </div>

            {/* Team Members Modal */}
            <AnimatePresence>
                {selectedTeam && (
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
                                {(() => {
                                    const stageMembers = (membersByStage[selectedTeam.stageId as StageId] || [])
                                        .filter(member => member.teamId === selectedTeam.id);
                                    const teamMembers = mergeTeamMemberTotals({
                                        teamId: selectedTeam.id,
                                        teamMembers: selectedTeam.members || [],
                                        entries: stageMembers,
                                        resolveStageId: (teamId) => teamsById[teamId]?.stageId || null,
                                    });

                                    if (teamMembers.length === 0) {
                                        return (
                                            <div className="text-center p-6 bg-surface/30 rounded-xl border border-border/50">
                                                <p className="text-text-muted text-sm">لا يوجد أعضاء في هذا الفريق</p>
                                            </div>
                                        );
                                    }

                                    return (
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
                                    );
                                })()}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <MemberScoreDetailsModal
                member={memberDetails}
                onClose={() => setMemberDetails(null)}
                stageScope={user?.role === 'super_admin'
                    ? (filter === 'all' ? null : filter)
                    : (user?.stageId || memberDetails?.stageId || selectedTeam?.stageId || null)}
            />
        </div>
    );
}
