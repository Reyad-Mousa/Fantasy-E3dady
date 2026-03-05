import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, limit, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';
import { StatsCard } from './ui/SharedUI';
import { Trophy, Users, ListTodo, BarChart3, Star, Target, Award, ArrowLeft, Medal, X } from 'lucide-react';
import StageBadge from './StageBadge';
import { motion, AnimatePresence } from 'motion/react';
import { STAGES_LIST } from '@/config/stages';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { usePerfProfile } from '@/hooks/usePerfProfile';

interface HomeProps {
  onNavigate?: (tab: string, taskId?: string) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const { user } = useAuth();

  const [isMounted, setIsMounted] = useState(false);

  // ── Raw Firestore state (updated by independent real-time listeners) ──────
  const [teamsData, setTeamsData] = useState<any[]>([]);
  const [memberStatsByTeam, setMemberStatsByTeam] = useState<Record<string, number>>({});
  const [tasksCount, setTasksCount] = useState<number | null>(null);
  const [publicTasks, setPublicTasks] = useState<any[]>([]);
  const [massTasks, setMassTasks] = useState<any[]>([]);

  // ── Team detail modal ─────────────────────────────────────────────────────
  const [selectedTeam, setSelectedTeam] = useState<any | null>(null);
  const [teamMembersStats, setTeamMembersStats] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const mobileChartContainerRef = useRef<HTMLDivElement | null>(null);
  const [isMobileChartReady, setIsMobileChartReady] = useState(false);

  // ── Listener 1: member_stats → summed by teamId ───────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'member_stats'), snap => {
      const totals: Record<string, number> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const tid = data.teamId as string | undefined;
        if (tid) totals[tid] = (totals[tid] || 0) + (data.totalPoints || 0);
      });
      setMemberStatsByTeam(totals);
    }, () => { });
    return unsub;
  }, []);

  // ── Listener 2: teams (raw docs) ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'teams'), snap => {
      setTeamsData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => { });
    return unsub;
  }, []);

  // ── Listener 3: active tasks count (logged-in users) ─────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'tasks'), where('status', '==', 'active')),
      snap => setTasksCount(snap.size),
    );
    return unsub;
  }, [user]);

  // ── Listener 4: active mass tasks (shortcut) ───────────────────────────
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

  // ── Listener 5: public task previews (guests only) ───────────────────────
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
  }, [user, teamsData, memberStatsByTeam, tasksCount]);
  const { isMobile, prefersLowMotion } = usePerfProfile();
  const animationsEnabled = !prefersLowMotion;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !isMobile) {
      setIsMobileChartReady(false);
      return;
    }

    const container = mobileChartContainerRef.current;
    if (!container) {
      setIsMobileChartReady(false);
      return;
    }

    const updateReady = () => {
      const { width, height } = container.getBoundingClientRect();
      setIsMobileChartReady(width > 0 && height > 0);
    };

    updateReady();
    const rafId = window.requestAnimationFrame(updateReady);
    const resizeObserver = new ResizeObserver(updateReady);
    resizeObserver.observe(container);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [isMounted, isMobile]);

  useEffect(() => {
    if (!selectedTeam) {
      setTeamMembersStats([]);
      return;
    }

    setLoadingMembers(true);
    const fetchMemberStats = async () => {
      try {
        const statsSnap = await getDocs(query(collection(db, 'member_stats'), where('teamId', '==', selectedTeam.id)));
        const statsDocs = statsSnap.docs.map(d => d.data());

        const seen = new Set<string>();
        const merged: { name: string; points: number }[] = [];

        for (const memberName of (selectedTeam.members || [])) {
          const name = String(memberName || '').trim();
          if (!name || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          const stat = statsDocs.find(s => (s as any).memberName?.toLowerCase().trim() === name.toLowerCase());
          merged.push({ name, points: Math.round((stat as any)?.totalPoints || 0) });
        }

        // Lastly, add any member stats documents that weren't caught in the loops above
        for (const s of statsDocs) {
          const statData = s as any;
          const nameLower = (statData.memberName || '').toLowerCase().trim();
          if (nameLower && !seen.has(nameLower)) {
            seen.add(nameLower);
            merged.push({ name: statData.memberName, points: Math.round(statData.totalPoints || 0) });
          }
        }

        merged.sort((a, b) => b.points - a.points);
        setTeamMembersStats(merged);
      } catch {
        const fallback = (selectedTeam.members || []).map((name: string) => ({ name, points: 0 }));
        setTeamMembersStats(fallback);
      } finally {
        setLoadingMembers(false);
      }
    };

    fetchMemberStats();
  }, [selectedTeam]);


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
      <motion.div
        initial={animationsEnabled ? { opacity: 0, scale: 0.98 } : false}
        animate={animationsEnabled ? { opacity: 1, scale: 1 } : undefined}
        className="relative overflow-hidden bg-surface-card rounded-3xl p-8 sm:p-12 border border-white/5 border-b-border shadow-2xl"
      >
        <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-primary/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-5 flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 border border-accent/20 text-accent-light text-[14px] font-black tracking-widest uppercase">
              <Star className="w-3 h-3 fill-current" />
              Fantasy E3dady             </div>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-[1.15] whitespace-pre-line">
              {user ? `منور يـ ${user.name?.split(' ')[0]} 👋` : 'تحدى نفسك،\nواربح القمة 🏆'}
            </h1>
            <p className="text-text-secondary text-sm sm:text-base font-bold max-w-lg leading-relaxed">
              تابع نتائج المراحل الثلاث واكتشف الفريق المتصدر في الوقت الحقيقي. نظام ذكي لإدارة النقاط والمهام.
            </p>
            {user?.stageId && (
              <div className="mt-4 inline-block">
                <StageBadge stageId={user.stageId} size="lg" className="px-6 py-2.5 rounded-2xl shadow-lg border-2" />
              </div>
            )}
          </div>

          <div className="hidden lg:block w-72 h-72 relative">
            <div className={`absolute inset-0 bg-primary/20 rounded-full blur-[80px] ${animationsEnabled ? 'animate-pulse-glow' : ''} mobile-hide-blur`} />
            <Trophy className="w-full h-full text-accent/80 relative z-10 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]" />
          </div>
        </div>
      </motion.div>

      {/* Mass Task Shortcut - Only for logged in users */}
      <AnimatePresence>
        {user && massTasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid gap-4"
          >
            {massTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => navigate('tasks', task.id)}
                className="bg-purple-600/20 border border-purple-500/40 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-purple-600/30 transition-all group shadow-lg shadow-purple-900/20"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-2xl shadow-inner border border-purple-500/30 group-hover:scale-110 transition-transform">
                    ⛪
                  </div>
                  <div>
                    <h3 className="font-black text-white text-sm sm:text-base">{task.title} (اختصار تسجيل الحضور)</h3>
                    <p className="text-purple-300/80 text-[10px] sm:text-xs font-bold mt-0.5">
                      انقر هنا لتسجيل حضور فريقك في القداس مباشرة ⚡
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex flex-col items-end mr-2">
                    <span className="text-white font-black text-sm">+{task.points}</span>
                    <span className="text-purple-300 text-[9px] uppercase font-black tracking-tighter">نقطة للفرد</span>
                  </div>
                  <div className="p-2 rounded-full bg-purple-500/20 text-purple-300 group-hover:translate-x-[-4px] transition-transform">
                    <ArrowLeft className="w-5 h-5" />
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-12 gap-6">

        {/* Stages Chart - Modernized */}
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : false}
          animate={animationsEnabled ? { opacity: 1, y: 0 } : undefined}
          transition={animationsEnabled ? { delay: 0.1 } : undefined}
          className="lg:col-span-8 bg-surface-card rounded-3xl p-6 sm:p-8 border border-white/5 shadow-xl flex flex-col"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2.5 rounded-xl border border-primary/30">
                <BarChart3 className="w-5 h-5 text-primary-light" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">تحليل نقاط المراحل</h2>
                <p className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">نسبة النقاط التراكمية</p>
              </div>
            </div>

          </div>

          {isMobile ? (
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
              <div
                ref={mobileChartContainerRef}
                className="h-[240px] w-full"
                style={{ minWidth: 10, minHeight: 240 }}
                dir="ltr"
              >
                {isMounted && isMobileChartReady && (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                    <BarChart
                      data={mobileChartData}
                      margin={{ top: 8, bottom: 2 }}
                    >
                      <XAxis
                        dataKey="shortName"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}
                        dy={8}
                      />
                      <YAxis hide />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        formatter={(value: any, _name, payload: any) => [
                          `${Number(value) || 0} نقطة`,
                          `${payload?.payload?.name ?? 'المرحلة'}`,
                        ]}
                        contentStyle={{
                          backgroundColor: '#1e1b4b',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                          fontSize: '12px',
                        }}
                        itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                      />
                      <Bar
                        dataKey="points"
                        radius={[10, 10, 0, 0]}
                        barSize={32}
                        isAnimationActive={!prefersLowMotion}
                      >
                        {mobileChartData.map((entry, index) => (
                          <Cell key={`mobile-cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-3" dir="ltr">
                {mobileChartData.map((stage, i) => (
                  <div key={i} className="text-center">
                    <div className="text-[10px] font-black text-text-secondary uppercase">{stage.shortName}</div>
                    <div className="text-sm font-black" style={{ color: stage.color, filter: 'brightness(1.15)' }}>{stage.points}</div>
                    <div className="text-[10px] text-text-secondary">{stage.count} فرق</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="h-[280px] sm:h-[350px] w-full" dir="ltr">
                {isMounted && (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                    <BarChart data={stageStats} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}
                        dy={10}
                      />
                      <YAxis hide />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        contentStyle={{ backgroundColor: '#1e1b4b', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}
                        itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                      />
                      <Bar
                        dataKey="points"
                        radius={[12, 12, 0, 0]}
                        barSize={isMobile ? 28 : 60}
                        isAnimationActive={!prefersLowMotion}
                      >
                        {stageStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Stage Legend for Desktop */}
              <div className="mt-8 grid grid-cols-3 gap-3 border-t border-white/5 pt-6" dir="ltr">
                {stageStats.map((s, i) => (
                  <div key={i} className="text-center group cursor-default">
                    <div className="text-[10px] font-black text-text-secondary mb-1 group-hover:text-white transition-colors uppercase">{s.name.split(' ')[0]}</div>
                    <div className="text-lg font-black transition-all group-hover:scale-110" style={{ color: s.color, filter: 'brightness(1.15)' }}>{s.points}</div>
                    <div className="text-[12px] text-text-secondary mt-0.5">{s.count} فرق</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>

        {/* Sidebar Sections */}
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
              {STAGES_LIST.map((stage) => {
                const stageData = stageStats.find(s => s.name === stage.name);
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              <StatsCard icon="🏆" label="ترتيبك" value={stats.rank} color="accent" />
              <StatsCard icon="⭐" label="نقاطك" value={stats.points} color="primary" />
            </div>
          )}
        </div>
      </div >

      {/* Role Actions - Re-styled */}
      {
        user && (
          <motion.div
            initial={animationsEnabled ? { opacity: 0, y: 10 } : false}
            animate={animationsEnabled ? { opacity: 1, y: 0 } : undefined}
            transition={animationsEnabled ? { delay: 0.3 } : undefined}
            className="bg-surface-card rounded-3xl p-8 border border-white/5 shadow-xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl" />
            <h2 className="text-lg font-black text-white mb-6 flex items-center gap-3">
              <div className="w-2 h-6 bg-accent rounded-full" />
              ماذا تود أن تفعل اليوم؟
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
              <button onClick={() => navigate('scores')} className="btn btn-primary py-4 rounded-2xl h-full flex flex-col items-center gap-3 shadow-lg shadow-primary/20 group hover:-translate-y-1 transition-all">
                <div className="bg-white/10 p-2 rounded-xl group-hover:scale-110 transition-transform"><Star className="w-6 h-6" /></div>
                <span>تسجيل النقاط</span>
              </button>
              <button onClick={() => navigate('tasks')} className="btn btn-accent py-4 rounded-2xl h-full flex flex-col items-center gap-3 shadow-lg shadow-accent/20 group hover:-translate-y-1 transition-all text-bg font-black">
                <div className="bg-bg/10 p-2 rounded-xl group-hover:scale-110 transition-transform"><ListTodo className="w-6 h-6 text-bg" /></div>
                <span>عرض المهام</span>
              </button>
              <button onClick={() => navigate('teams')} className="btn btn-ghost py-4 rounded-2xl h-full flex flex-col items-center gap-3 border-2 border-border/30 hover:border-text-primary hover:-translate-y-1 transition-all group">
                <div className="bg-surface p-2 rounded-xl group-hover:scale-110 transition-transform"><Users className="w-6 h-6" /></div>
                <span>إدارة الفرق</span>
              </button>
              {user.role === 'super_admin' && (
                <button onClick={() => navigate('admin')} className="btn btn-ghost py-4 rounded-2xl h-full flex flex-col items-center gap-3 border-2 border-border/30 hover:border-text-primary hover:-translate-y-1 transition-all group">
                  <div className="bg-surface p-2 rounded-xl group-hover:scale-110 transition-transform"><Target className="w-6 h-6" /></div>
                  <span>لوحة التحكم</span>
                </button>
              )}
            </div>
          </motion.div>
        )
      }

      {/* Team Members Modal */}
      <AnimatePresence>
        {selectedTeam && (
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
                  <h3 className="text-xl sm:text-2xl font-black text-white mb-2">{selectedTeam.name}</h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm bg-accent/10 text-accent px-2 py-1 rounded-lg font-bold flex items-center gap-1.5 border border-accent/20">
                      <Trophy className="w-3.5 h-3.5 fill-accent" />
                      {Math.round(selectedTeam.totalPoints || 0)} نقطة
                    </span>
                    <span className="text-sm bg-white/5 text-text-primary px-2 py-1 rounded-lg font-bold flex items-center gap-1.5 border border-white/10">
                      <Users className="w-3.5 h-3.5 text-text-muted" />
                      {selectedTeam.members?.length || 0} أعضاء
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
                          <span className="font-bold text-text-primary text-sm truncate block">{member.name}</span>
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end">
                          <span className="text-sm font-black text-white flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded-md border border-white/5">
                            {member.points}
                            <span className="text-[10px] text-text-muted font-bold">نقطة</span>
                          </span>
                          {(() => {
                            const teamTotal = selectedTeam.totalPoints || 0;
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
        )}
      </AnimatePresence>

    </div >
  );
}
