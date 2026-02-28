import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { motion } from 'motion/react';
import { ArrowRight, Trophy, UserRound } from 'lucide-react';
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

    useEffect(() => {
        const unsubs = STAGES_LIST.map((stage) => {
            const q = query(
                collection(db, 'teams'),
                where('stageId', '==', stage.id),
                orderBy('totalPoints', 'desc'),
            );
            return onSnapshot(q, (snap) => {
                const teams = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Team));
                setTeamsByStage((prev) => ({ ...prev, [stage.id]: teams }));
            });
        });

        return () => {
            unsubs.forEach((unsub) => unsub());
        };
    }, []);

    useEffect(() => {
        const unsubs = STAGES_LIST.map((stage) => {
            const q = query(
                collection(db, 'member_stats'),
                where('stageId', '==', stage.id),
                orderBy('totalPoints', 'desc'),
            );
            return onSnapshot(q, (snap) => {
                const members = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as MemberStat));
                setMembersByStage((prev) => ({ ...prev, [stage.id]: members }));
            }, () => {
                setMembersByStage((prev) => ({ ...prev, [stage.id]: [] }));
            });
        });

        return () => {
            unsubs.forEach((unsub) => unsub());
        };
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
                        <ResponsiveContainer width="100%" height="100%">
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
                            <div key={item.id} className="flex items-center gap-3 p-3 hover:bg-surface/50 rounded-xl transition-colors">
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

                                <span className={`font-black ${isRank1 ? 'text-xl' : 'text-text-muted'}`} style={isRank1 ? { color: stage.color } : {}}>
                                    {item.totalPoints}
                                </span>
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
        </div>
    );
}
