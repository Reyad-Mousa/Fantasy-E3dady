import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, UserRound, X } from 'lucide-react';
import StageFilterBar, { FilterValue } from './StageFilterBar';
import { SectionHeader } from './ui/SharedUI';
import { STAGES_LIST, StageId } from '@/config/stages';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

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
}

type BoardType = 'teams' | 'members';

export default function Leaderboard({ onBack }: { onBack?: () => void }) {
    const [filter, setFilter] = useState<FilterValue>('all');
    const [boardType, setBoardType] = useState<BoardType>('teams');
    const [teamsByStage, setTeamsByStage] = useState<Record<StageId, Team[]>>({
        grade7: [],
        grade8: [],
        grade9: [],
    });
    const [membersByStage, setMembersByStage] = useState<Record<StageId, MemberStat[]>>({
        grade7: [],
        grade8: [],
        grade9: [],
    });

    const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

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

            allTeams.forEach(team => {
                const stageId = team.stageId as StageId;
                if (newTeamsByStage[stageId]) {
                    newTeamsByStage[stageId].push(team);
                }
            });

            // Sort each stage in-memory
            STAGES_LIST.forEach(stage => {
                newTeamsByStage[stage.id as StageId].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
            });

            setTeamsByStage(newTeamsByStage);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        // Fetch all member_stats once and filter/sort in-memory
        const q = query(collection(db, 'member_stats'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const allMembers = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as MemberStat));

            const newMembersByStage: Record<StageId, MemberStat[]> = {
                grade7: [],
                grade8: [],
                grade9: [],
            };

            allMembers.forEach(member => {
                const stageId = member.stageId as StageId;
                if (newMembersByStage[stageId]) {
                    newMembersByStage[stageId].push(member);
                }
            });

            // Sort each stage in-memory
            STAGES_LIST.forEach(stage => {
                newMembersByStage[stage.id as StageId].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
            });

            setMembersByStage(newMembersByStage);
        }, () => {
            setMembersByStage({ grade7: [], grade8: [], grade9: [] });
        });

        return () => unsubscribe();
    }, []);

    const getTeamName = (teamId: string, stageId: StageId): string => {
        const team = teamsByStage[stageId].find((t) => t.id === teamId);
        return team?.name || 'فريق غير معروف';
    };

    const renderStageCard = (stageId: StageId) => {
        const stage = STAGES_LIST.find((s) => s.id === stageId)!;
        const teams = teamsByStage[stageId] || [];
        const members = membersByStage[stageId] || [];
        const isTeams = boardType === 'teams';
        const list = isTeams ? teams : members;
        const totalStagePoints = list.reduce((sum, item: any) => sum + (item.totalPoints || 0), 0);

        const top5 = (isTeams ? teams : members).slice(0, 5).map((item: any, i) => ({
            name: isTeams ? item.name : item.memberName,
            points: item.totalPoints,
            opacity: 1 - (i * 0.15),
        }));

        return (
            <motion.div
                key={`${stage.id}-${boardType}`}
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
                    <div className="p-4 border-b border-border/30" style={{ height: 220 }} dir="ltr">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                            <BarChart data={top5} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
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
                        </ResponsiveContainer>
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
                                className={`flex items-center gap-3 p-3 hover:bg-surface/50 rounded-xl transition-colors ${isTeams ? 'cursor-pointer' : ''}`}
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
                                    <h4 className={`font-bold text-sm truncate ${isRank1 ? '' : 'text-text-secondary'}`} style={isRank1 ? { color: stage.color } : {}}>
                                        {isTeams ? item.name : item.memberName}
                                    </h4>
                                    {isTeams ? (
                                        item.memberCount > 0 && (
                                            <p className="text-[10px] text-text-muted mt-0.5">👥 {item.memberCount} عضو</p>
                                        )
                                    ) : (
                                        <p className="text-[10px] text-text-muted mt-0.5">🏷️ {getTeamName(item.teamId, stageId)}</p>
                                    )}
                                </div>

                                <div className="text-right flex flex-col items-end justify-center">
                                    <span className={`font-black ${isRank1 ? 'text-xl' : 'text-base text-text-primary'}`} style={isRank1 ? { color: stage.color } : {}}>
                                        {item.totalPoints}
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
                                    <span className="text-3xl font-black text-white">{selectedTeam.name.charAt(0)}</span>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-1">
                                    {selectedTeam.name}
                                </h3>
                                <div className="flex items-center justify-center gap-4 text-white/80 text-sm">
                                    <span className="flex items-center gap-1">
                                        <Trophy className="w-4 h-4" />
                                        {selectedTeam.totalPoints} نقطة
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
                                    const teamMembers = (selectedTeam.members || []).map(memberName => {
                                        const stat = (membersByStage[selectedTeam.stageId as StageId] || [])
                                            .find(m => m.teamId === selectedTeam.id && m.memberName === memberName);
                                        return {
                                            id: stat?.id || `${selectedTeam.id}-${memberName}`,
                                            memberName,
                                            totalPoints: stat ? stat.totalPoints : 0
                                        };
                                    }).sort((a, b) => b.totalPoints - a.totalPoints);

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
                                                            <span className="font-bold text-text-primary text-sm">{member.memberName}</span>
                                                        </div>
                                                        <div className="text-right flex flex-col items-end justify-center">
                                                            <span className={`font-black ${rank === 1 ? 'text-amber-500' :
                                                                rank === 2 ? 'text-slate-400' :
                                                                    rank === 3 ? 'text-amber-700' :
                                                                        'text-text-secondary'
                                                                }`}>
                                                                {member.totalPoints}
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
        </div>
    );
}
