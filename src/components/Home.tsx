import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';
import type { MemberDetailsTarget } from './MemberScoreDetailsModal';
import { STAGES_LIST } from '@/config/stages';
import { usePerfProfile } from '@/hooks/usePerfProfile';
import { useDeferredRender } from '@/hooks/useDeferredRender';
import { buildMemberKey } from '@/services/memberKeys';
import { mergeTeamMemberTotals } from '@/services/memberTotals';

import { HomeHeroSection } from './HomeHeroSection';
import { HomeSidebarTeams } from './HomeSidebarTeams';

const HomeStageStatsChart = lazy(() =>
  import('./HomeStageStatsChart').then((module) => ({ default: module.HomeStageStatsChart })),
);
const HomeMassTasks = lazy(() =>
  import('./HomeMassTasks').then((module) => ({ default: module.HomeMassTasks })),
);
const RoleActions = lazy(() =>
  import('./RoleActions').then((module) => ({ default: module.RoleActions })),
);
const TeamMembersModal = lazy(() =>
  import('./TeamMembersModal').then((module) => ({ default: module.TeamMembersModal })),
);
const MemberScoreDetailsModal = lazy(() => import('./MemberScoreDetailsModal'));

interface HomeProps {
  onNavigate?: (tab: string, taskId?: string) => void;
}

const toUnixMs = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object' && value !== null) {
    if ('toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
      return (value as { toMillis: () => number }).toMillis();
    }
    if ('seconds' in value && typeof (value as { seconds?: unknown }).seconds === 'number') {
      return (value as { seconds: number }).seconds * 1000;
    }
  }
  return 0;
};

export default function Home({ onNavigate }: HomeProps) {
  const { user } = useAuth();

  // ── Raw Firestore state (updated by independent real-time listeners) ──────
  const [teamsData, setTeamsData] = useState<any[]>([]);
  const [massTasks, setMassTasks] = useState<any[]>([]);
  const [liveReady, setLiveReady] = useState(false);
  const [teamsReady, setTeamsReady] = useState(false);
  const [massTasksReady, setMassTasksReady] = useState(false);

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
  const selectedTeamLive = useMemo(() => {
    if (!selectedTeam) return null;
    return teamsData.find(t => t.id === selectedTeam.id) || selectedTeam;
  }, [teamsData, selectedTeam]);
  const deferredSections = useDeferredRender({ observe: true, timeoutMs: 900 });
  const idleMassTasks = useDeferredRender({ enabled: !!user, timeoutMs: 700 });
  const shouldLoadDeferredSections = deferredSections.isReady;
  const shouldLoadMassTasks = idleMassTasks.isReady;

  // Wait for first paint/idle before attaching Firestore listeners to reduce main-thread pressure.
  useEffect(() => {
    const idle = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 120));
    const cancel = (window as any).cancelIdleCallback || clearTimeout;
    const id = idle(() => setLiveReady(true));
    return () => cancel(id);
  }, []);

  // ── Listener 1: teams (raw docs) ──────────────────────────────────────────
  useEffect(() => {
    if (!liveReady) return;
    setTeamsReady(false);
    const unsub = onSnapshot(collection(db, 'teams'), snap => {
      const orderedTeams = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => Number(b.totalPoints || 0) - Number(a.totalPoints || 0));

      setTeamsData(orderedTeams);
      setTeamsReady(true);
    }, (err) => {
      console.error('teams listener error', err);
      setTeamsReady(true);
    });
    return unsub;
  }, [liveReady]);

  // ── Listener 2: active mass tasks (shortcut) ───────────────────────────
  useEffect(() => {
    if (!user || !shouldLoadMassTasks || !liveReady || !teamsReady) {
      setMassTasks([]);
      setMassTasksReady(!user);
      return;
    }
    setMassTasksReady(false);

    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('status', '==', 'active'), where('type', '==', 'team'), limit(80)),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const massOnly = data.filter((t: any) =>
          (t.title?.includes('قداس') || t.title?.includes('قداسس')) &&
          (!t.stageId || t.stageId === user.stageId || user.role === 'super_admin')
        );
        massOnly.sort((a: any, b: any) => {
          const bTime = toUnixMs(b.updatedAt ?? b.createdAt ?? b.created_at ?? b.date);
          const aTime = toUnixMs(a.updatedAt ?? a.createdAt ?? a.created_at ?? a.date);
          return bTime - aTime;
        });
        setMassTasks(massOnly);
        setMassTasksReady(true);
      },
      () => {
        setMassTasks([]);
        setMassTasksReady(true);
      },
    );
    return unsub;
  }, [shouldLoadMassTasks, user, liveReady, teamsReady]);

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
    const fallback = { rank: '--', points: '--', members: '--' };
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
          members: myTeam.memberCount?.toString() || '0',
        };
      }
    } else {
      const totalPoints = teamsWithPoints.reduce((acc, t) => acc + t.computedPoints, 0);
      const totalMembers = teamsWithPoints.reduce((acc, t) => acc + (t.memberCount || 0), 0);
      return { rank: `${teamsWithPoints.length}`, points: totalPoints.toString(), members: totalMembers.toString() };
    }

    return fallback;
  }, [user, teamsData]);
  const { isMobile, prefersLowMotion } = usePerfProfile();
  const animationsEnabled = !prefersLowMotion;

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

  const deferredSectionFallback = (
    <div className="space-y-6">
      <div className="h-72 rounded-3xl border border-white/5 bg-surface-card/70 animate-pulse" />
      <div className="h-36 rounded-3xl border border-white/5 bg-surface-card/50 animate-pulse" />
    </div>
  );
  const canRenderDeferredSections = shouldLoadDeferredSections && teamsReady;

  return (
    <div dir="rtl" className="space-y-8 pb-12 ">
      {/* Hero Section - Redesigned to be bolder */}
      <HomeHeroSection user={user} animationsEnabled={animationsEnabled} />

      {/* Mass Task Shortcut - Only for logged in users */}
      {shouldLoadMassTasks && user && !massTasksReady && (
        <div className="h-24 rounded-2xl border border-white/5 bg-surface-card/50 animate-pulse" />
      )}
      {shouldLoadMassTasks && user && teamsReady && massTasksReady && (
        <Suspense fallback={null}>
          <HomeMassTasks user={user} massTasks={massTasks} navigate={navigate} />
        </Suspense>
      )}

      {/* Main Content Grid */}
      <div
        ref={deferredSections.ref}
        className="grid lg:grid-cols-12 gap-6"
      >
        {canRenderDeferredSections ? (
          <Suspense fallback={deferredSectionFallback}>
            <HomeStageStatsChart
              animationsEnabled={animationsEnabled}
              isMobile={isMobile}
              prefersLowMotion={prefersLowMotion}
              stageStats={stageStats}
              mobileChartData={mobileChartData}
            />
          </Suspense>
        ) : (
          <div className="lg:col-span-8 h-72 rounded-3xl border border-white/5 bg-surface-card/70 animate-pulse" />
        )}
        {/* Sidebar Sections */}
        {teamsReady ? (
          <HomeSidebarTeams
            stageStats={stageStats}
            user={user}
            stats={stats}
            navigate={navigate}
            setSelectedTeam={setSelectedTeam}
          />
        ) : (
          <div className="lg:col-span-4 space-y-4">
            <div className="h-64 rounded-3xl border border-white/5 bg-surface-card/60 animate-pulse" />
            <div className="h-28 rounded-2xl border border-white/5 bg-surface-card/50 animate-pulse" />
          </div>
        )}
      </div >

      {/* Role Actions - Re-styled */}
      {canRenderDeferredSections && (
        <Suspense fallback={<div className="h-32 rounded-3xl border border-white/5 bg-surface-card/50 animate-pulse" />}>
          <RoleActions user={user} animationsEnabled={animationsEnabled} navigate={navigate} />
        </Suspense>
      )}

      {/* Team Members Modal */}
      {selectedTeamLive && (
        <Suspense fallback={null}>
          <TeamMembersModal
            selectedTeamLive={selectedTeamLive}
            setSelectedTeam={setSelectedTeam}
            animationsEnabled={animationsEnabled}
            loadingMembers={loadingMembers}
            teamMembersStats={teamMembersStats}
            setMemberDetails={setMemberDetails}
            buildMemberKey={buildMemberKey}
          />
        </Suspense>
      )}

      {memberDetails && (
        <Suspense fallback={null}>
          <MemberScoreDetailsModal
            member={memberDetails}
            onClose={() => setMemberDetails(null)}
            stageScope={user?.role === 'super_admin'
              ? null
              : (user?.stageId || memberDetails?.stageId || selectedTeamLive?.stageId || null)}
          />
        </Suspense>
      )}

    </div >
  );
}
