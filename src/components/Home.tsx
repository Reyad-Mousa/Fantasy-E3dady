import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';
import { StatsCard } from './ui/SharedUI';
import { Trophy, Users, ListTodo, BarChart3, Star, Target, Award, ArrowLeft, Medal, X, ChevronLeft } from 'lucide-react';
import StageBadge from './StageBadge';
import MemberScoreDetailsModal, { type MemberDetailsTarget } from './MemberScoreDetailsModal';
import { motion, AnimatePresence } from 'motion/react';
import { STAGES_LIST } from '@/config/stages';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { usePerfProfile } from '@/hooks/usePerfProfile';
import { buildMemberKey } from '@/services/memberKeys';
import { mergeTeamMemberTotals } from '@/services/memberTotals';

import { HomeHeroSection } from './HomeHeroSection';
import { RoleActions } from './RoleActions';
import { TeamMembersModal } from './TeamMembersModal';
import { HomeStageStatsChart } from './HomeStageStatsChart';
import { HomeSidebarTeams } from './HomeSidebarTeams';
import { HomeMassTasks } from './HomeMassTasks';

interface HomeProps {
  onNavigate?: (tab: string, taskId?: string) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const { user } = useAuth();

  const [isMounted, setIsMounted] = useState(false);

  // ── Raw Firestore state (updated by independent real-time listeners) ──────
  const [teamsData, setTeamsData] = useState<any[]>([]);
  const [tasksCount, setTasksCount] = useState<number | null>(null);
  const [publicTasks, setPublicTasks] = useState<any[]>([]);
  const [massTasks, setMassTasks] = useState<any[]>([]);

  // ── Team detail modal ─────────────────────────────────────────────────────
  const [selectedTeam, setSelectedTeam] = useState<any | null>(null);
  const [teamMembersStats, setTeamMembersStats] = useState<Array<{
    name: string;
    points: number;
    memberKey?: string | null;
    memberUserId?: string | null;
    stageId?: string | null;
  }>>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberDetails, setMemberDetails] = useState<MemberDetailsTarget | null>(null);
  const mobileChartContainerRef = useRef<HTMLDivElement | null>(null);
  const [mobileChartSize, setMobileChartSize] = useState({ width: 0, height: 0 });
  const selectedTeamLive = useMemo(() => {
    if (!selectedTeam) return null;
    return teamsData.find(t => t.id === selectedTeam.id) || selectedTeam;
  }, [teamsData, selectedTeam]);

  // ── Listener 1: teams (raw docs) ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'teams'), snap => {
      setTeamsData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => { });
    return unsub;
  }, []);

  // ── Listener 2: active tasks count (logged-in users) ─────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('status', '==', 'active')),
      snap => setTasksCount(snap.size),
    );
    return unsub;
  }, [user]);

  // ── Listener 3: active mass tasks (shortcut) ───────────────────────────
  useEffect(() => {
    if (!user) {
      setMassTasks([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('status', '==', 'active'), where('type', '==', 'team')),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const massOnly = data.filter((t: any) =>
          (t.title?.includes('قداس') || t.title?.includes('قداسس')) &&
          (!t.stageId || t.stageId === user.stageId || user.role === 'super_admin')
        );
        setMassTasks(massOnly);
      }
    );
    return unsub;
  }, [user]);

  // ── Listener 4: public task previews (guests only) ───────────────────────
  useEffect(() => {
    if (user) return;
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('status', '==', 'active'), limit(4)),
      snap => setPublicTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    );
    return unsub;
  }, [user]);

  // ── Derived: stage statistics for chart + sidebar ─────────────────────────
  // Recomputes automatically whenever teamsData changes.
  const stageStats = useMemo(() => {
    const teamsWithPoints = teamsData.map(t => ({
      ...t,
      computedPoints: Math.round(t.totalPoints || 0),
    }));
    return STAGES_LIST.map(stage => {
      const stageTeams = teamsWithPoints.filter(t => t.stageId === stage.id);
      const totalPoints = stageTeams.reduce((sum, t) => sum + t.computedPoints, 0);
      const sorted = [...stageTeams].sort((a, b) => b.computedPoints - a.computedPoints);
      return { name: stage.name, points: totalPoints, color: stage.color, count: stageTeams.length, topTeams: sorted.slice(0, 5) };
    });
  }, [teamsData]);

  // ── Derived: stats cards (rank / points / tasks / members) ───────────────
  const stats = useMemo(() => {
    const tasks = tasksCount !== null ? tasksCount.toString() : '--';
    const fallback = { rank: '--', points: '--', tasks, members: '--' };
    if (!user || teamsData.length === 0) return fallback;

    const teamsWithPoints = teamsData.map(t => ({
      ...t,
      computedPoints: t.totalPoints || 0,
    }));

    const isTeamUser = user.teamId || user.role === 'leader' || user.role === 'member';
    if (isTeamUser) {
      const stageTeams = user.stageId
        ? teamsWithPoints.filter(t => t.stageId === user.stageId)
        : teamsWithPoints;
      const sortedTeams = [...stageTeams].sort((a, b) => b.computedPoints - a.computedPoints);
      const myTeamIndex = sortedTeams.findIndex(t => t.id === user.teamId || t.leaderId === user.uid);
      if (myTeamIndex !== -1) {
        const myTeam = sortedTeams[myTeamIndex];
        return {
          rank: `#${myTeamIndex + 1}`,
          points: Math.round(Number(myTeam.computedPoints)).toString(),
          tasks,
          members: myTeam.memberCount?.toString() || '0',
        };
      }
    } else {
      const totalPoints = teamsWithPoints.reduce((acc, t) => acc + t.computedPoints, 0);
      const totalMembers = teamsWithPoints.reduce((acc, t) => acc + (t.memberCount || 0), 0);
      return { rank: `${teamsWithPoints.length}`, points: totalPoints.toString(), tasks, members: totalMembers.toString() };
    }

    return fallback;
  }, [user, teamsData, tasksCount]);
  const { isMobile, prefersLowMotion } = usePerfProfile();
  const animationsEnabled = !prefersLowMotion;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !isMobile) {
      setMobileChartSize({ width: 0, height: 0 });
      return;
    }

    const container = mobileChartContainerRef.current;
    if (!container) {
      setMobileChartSize({ width: 0, height: 0 });
      return;
    }

    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect();
      setMobileChartSize({
        width: width > 0 ? Math.floor(width) : 0,
        height: height > 0 ? Math.floor(height) : 0,
      });
    };

    updateSize();
    const rafId = window.requestAnimationFrame(updateSize);
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [isMounted, isMobile]);

  useEffect(() => {
    if (!selectedTeamLive) {
      setTeamMembersStats([]);
      return;
    }

    setLoadingMembers(true);
    const unsub = onSnapshot(
      query(collection(db, 'member_stats'), where('teamId', '==', selectedTeamLive.id)),
      (memberStatsSnap) => {
        const merged = mergeTeamMemberTotals({
          teamId: selectedTeamLive.id,
          teamMembers: selectedTeamLive.members || [],
          entries: memberStatsSnap.docs.map((docSnap) => docSnap.data()),
          resolveStageId: (teamId) => teamsData.find((team) => team.id === teamId)?.stageId || null,
        }).map((member) => ({
          name: member.memberName,
          points: Math.round(Number(member.totalPoints || 0)),
          memberKey: member.memberKey || null,
          memberUserId: member.memberUserId || null,
          stageId: member.stageId || null,
        }));

        setTeamMembersStats(merged);
        setLoadingMembers(false);
      },
      () => {
        const fallback = mergeTeamMemberTotals({
          teamId: selectedTeamLive.id,
          teamMembers: selectedTeamLive.members || [],
          entries: [],
          resolveStageId: (teamId) => teamsData.find((team) => team.id === teamId)?.stageId || null,
        }).map((member) => ({
          name: member.memberName,
          points: 0,
          memberKey: member.memberKey || null,
          memberUserId: member.memberUserId || null,
          stageId: member.stageId || null,
        }));
        setTeamMembersStats(fallback);
        setLoadingMembers(false);
      }
    );

    return unsub;
  }, [selectedTeamLive, teamsData]);


  const navigate = (tab: string, taskId?: string) => {
    if (onNavigate) onNavigate(tab, taskId);
  };

  const mobileChartData = stageStats.map((stage) => ({
    ...stage,
    shortName: stage.name.split(' ')[0],
    points: Number(stage.points) || 0,
  }));

  return (
    <div dir="rtl" className="space-y-8 pb-12">
      {/* Hero Section - Redesigned to be bolder */}
      <HomeHeroSection user={user} animationsEnabled={animationsEnabled} />

      {/* Mass Task Shortcut - Only for logged in users */}
      <HomeMassTasks user={user} massTasks={massTasks} navigate={navigate} />

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-12 gap-6">

        {/* Stages Chart - Modernized */}
        <HomeStageStatsChart
          animationsEnabled={animationsEnabled}
          isMobile={isMobile}
          prefersLowMotion={prefersLowMotion}
          stageStats={stageStats}
          mobileChartData={mobileChartData}
        />

        {/* Sidebar Sections */}
        <HomeSidebarTeams
          stageStats={stageStats}
          user={user}
          stats={stats}
          navigate={navigate}
          setSelectedTeam={setSelectedTeam}
        />
      </div >

      {/* Role Actions - Re-styled */}
      <RoleActions user={user} animationsEnabled={animationsEnabled} navigate={navigate} />

      {/* Team Members Modal */}
      <TeamMembersModal
        selectedTeamLive={selectedTeamLive}
        setSelectedTeam={setSelectedTeam}
        animationsEnabled={animationsEnabled}
        loadingMembers={loadingMembers}
        teamMembersStats={teamMembersStats}
        setMemberDetails={setMemberDetails}
        buildMemberKey={buildMemberKey}
      />

      <MemberScoreDetailsModal
        member={memberDetails}
        onClose={() => setMemberDetails(null)}
        stageScope={user?.role === 'super_admin'
          ? null
          : (user?.stageId || memberDetails?.stageId || selectedTeamLive?.stageId || null)}
      />

    </div >
  );
}
