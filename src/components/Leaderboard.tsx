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

import { LeaderboardTeamModal } from './LeaderboardTeamModal';
import { StageLeaderboardCard } from './StageLeaderboardCard';

export interface Team {
    id: string;
    name: string;
    totalPoints: number;
    memberCount: number;
    stageId: string;
    members?: string[];
}

export interface MemberStat {
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
        const teams = teamsByStage[stageId] || [];
        const members = membersByStage[stageId] || [];
        const chartKey = `${stageId}-${boardType}`;
        const chartSize = chartSizes[chartKey];

        return (
            <StageLeaderboardCard
                key={chartKey}
                stageId={stageId}
                boardType={boardType}
                teams={teams}
                members={members}
                chartSize={chartSize}
                onSetChartRef={(node) => {
                    chartContainerRefs.current[chartKey] = node;
                }}
                setSelectedTeam={setSelectedTeam}
                setMemberDetails={setMemberDetails}
                getTeamName={getTeamName}
            />
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
                <LeaderboardTeamModal
                    selectedTeam={selectedTeam}
                    setSelectedTeam={setSelectedTeam}
                    membersByStage={membersByStage}
                    setMemberDetails={setMemberDetails}
                    teamsById={teamsById}
                />
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
