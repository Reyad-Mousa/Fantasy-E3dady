import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast, SectionHeader, ConfirmModal } from './ui/SharedUI';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Trophy, Users, BarChart3, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import StageFilterBar, { type FilterValue } from './StageFilterBar';
import StageBadge from './StageBadge';
import { STAGES_LIST, StageId } from '@/config/stages';
import { logActivity } from '@/services/activityLogger';
import { buildMemberKey, normalizeMemberName } from '@/services/memberKeys';

// Required Sub-Components
import AdminOverviewTab from './AdminOverviewTab';
import AdminTeamsTab from './AdminTeamsTab';
import AdminUsersTab from './AdminUsersTab';
import AdminReportsTab from './AdminReportsTab';

interface TeamData {
    id: string;
    name: string;
    leaderId: string;
    totalPoints: number;
    memberCount: number;
    stageId?: string | null;
}

interface UserData {
    id: string;
    name: string;
    email: string;
    role: string;
    teamId: string | null;
}

interface ScoreData {
    id: string;
    teamId: string;
    taskId: string;
    points: number;
    type: 'earn' | 'deduct';
    registeredBy: string;
    timestamp: any;
}

interface TaskData {
    id: string;
    title: string;
    points: number;
    type: 'team' | 'leader';
    status: string;
}

type AdminTab = 'overview' | 'teams' | 'users' | 'reports';

export default function SuperAdminPanel({ onBack }: { onBack?: () => void }) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<AdminTab>('overview');
    const [stageFilter, setStageFilter] = useState<FilterValue>('all');

    // Data states
    const [teams, setTeams] = useState<TeamData[]>([]);
    const [users, setUsers] = useState<UserData[]>([]);
    const [scores, setScores] = useState<ScoreData[]>([]);
    const [tasks, setTasks] = useState<TaskData[]>([]);

    // Team Management
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [editingTeam, setEditingTeam] = useState<TeamData | null>(null);
    const [teamName, setTeamName] = useState('');
    const [teamLeader, setTeamLeader] = useState('');
    const [teamStageId, setTeamStageId] = useState('');
    const [deleteTeamConfirm, setDeleteTeamConfirm] = useState<TeamData | null>(null);

    // Advanced Actions
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [recalculating, setRecalculating] = useState(false);
    const [showRecalculateConfirm, setShowRecalculateConfirm] = useState(false);

    const [clearingLogs, setClearingLogs] = useState(false);
    const [showClearLogsConfirm, setShowClearLogsConfirm] = useState(false);

    const [memberStatsByTeam, setMemberStatsByTeam] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!user || user.role !== 'super_admin') return;

        const stageCondition = stageFilter !== 'all' ? stageFilter : null;

        const unsubTeams = onSnapshot(collection(db, 'teams'), snap => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamData));
            setTeams(stageCondition ? data.filter(t => t.stageId === stageCondition) : data);
        });

        const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
            // Filter users: if a stage is selected, usually we want to see users belonging to that stage
            setUsers(data);
        });

        const qScores = query(collection(db, 'scores'), orderBy('timestamp', 'desc'));
        const unsubScores = onSnapshot(qScores, snap => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ScoreData));
            setScores(data);
        });

        const unsubTasks = onSnapshot(collection(db, 'tasks'), snap => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskData));
            setTasks(data);
        });

        const unsubMemberStats = onSnapshot(collection(db, 'member_stats'), snap => {
            const stats = snap.docs.map(d => d.data());
            const grouped: Record<string, number> = {};
            stats.forEach(s => {
                const tId = s.teamId as string;
                if (!grouped[tId]) grouped[tId] = 0;
                grouped[tId] += (s.totalPoints || 0);
            });
            setMemberStatsByTeam(grouped);
        });

        setLoading(false);

        return () => {
            unsubTeams();
            unsubUsers();
            unsubScores();
            unsubTasks();
            unsubMemberStats();
        };
    }, [user, stageFilter]);


    // =========================
    // Team Management
    // =========================
    const handleSaveTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingTeam) {
                await updateDoc(doc(db, 'teams', editingTeam.id), {
                    name: teamName,
                    leaderId: teamLeader,
                    stageId: teamStageId || null,
                    updatedAt: serverTimestamp()
                });
                showToast('تم تحديث الفريق بنجاح');
            } else {
                const teamData = {
                    name: teamName,
                    leaderId: teamLeader,
                    totalPoints: 0,
                    memberCount: 0,
                    stageId: teamStageId || null,
                    createdAt: serverTimestamp()
                };
                const newTeamRef = doc(collection(db, 'teams'));
                await setDoc(newTeamRef, teamData);
                showToast('تم إضافة الفريق بنجاح');
            }

            if (teamLeader) {
                await updateDoc(doc(db, 'users', teamLeader), {
                    teamId: editingTeam?.id || null, // Will be updated by trigger if needed, or done manually
                    role: 'leader',
                    stageId: teamStageId || null
                });
            }

            resetTeamForm();
        } catch (err) {
            console.error('Save team error:', err);
            showToast('حدث خطأ أثناء حفظ الفريق', 'error');
        }
    };

    const handleDeleteTeam = async () => {
        if (!deleteTeamConfirm) return;
        try {
            // Update users of this team
            const teamUsers = users.filter(u => u.teamId === deleteTeamConfirm.id);
            for (const u of teamUsers) {
                await updateDoc(doc(db, 'users', u.id), { teamId: null });
            }

            await deleteDoc(doc(db, 'teams', deleteTeamConfirm.id));
            showToast('تم حذف الفريق بنجاح');
            setDeleteTeamConfirm(null);
        } catch {
            showToast('حدث خطأ أثناء حذف الفريق', 'error');
        }
    };

    const resetTeamForm = () => {
        setEditingTeam(null);
        setTeamName('');
        setTeamLeader('');
        setTeamStageId('');
        setShowTeamModal(false);
    };

    const handleRecalculateTotals = async () => {
        setRecalculating(true);
        try {
            // 1. Fetch scores
            const scoresSnap = await getDocs(collection(db, 'scores'));
            const allScores = scoresSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

            if (allScores.length === 0) {
                showToast('لا توجد سجلات نقاط لإعادة الحساب', 'warning');
                setRecalculating(false);
                return;
            }

            // 3. Fetch dependencies locally
            const [teamsSnap, memberStatsSnap, usersSnap] = await Promise.all([
                getDocs(collection(db, 'teams')),
                getDocs(collection(db, 'member_stats')),
                getDocs(collection(db, 'users'))
            ]);

            const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            const teamsById = new Map(teamsSnap.docs.map(d => [d.id, d.data() as any]));
            const teamTotals: Record<string, number> = {};
            const memberStatsMap: Record<string, any> = {};

            const asNonEmptyString = (value: unknown): string | null =>
                (typeof value === 'string' && value.trim()) ? value.trim() : null;

            const normalizeStageId = (value: unknown): StageId | null => {
                if (value === 'grade7' || value === 'grade8' || value === 'grade9') {
                    return value;
                }
                return null;
            };

            const getTeamStageId = (teamId: string | null | undefined): StageId | null => {
                if (!teamId) return null;
                return normalizeStageId(teamsById.get(teamId)?.stageId);
            };

            const parseLegacyMemberKey = (memberKey: string): { teamId: string; memberName: string | null } | null => {
                const match = /^m:(team_\d+)_(.+)$/.exec(memberKey);
                if (!match) return null;
                const parsedName = match[2].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
                return {
                    teamId: match[1],
                    memberName: parsedName || null,
                };
            };

            // Initialize totals to 0 for all found teams and members
            teamsSnap.forEach(d => teamTotals[d.id] = 0);
            memberStatsSnap.forEach(d => {
                const current = d.data() as any;
                memberStatsMap[d.id] = {
                    ...current,
                    memberKey: asNonEmptyString(current.memberKey) || d.id,
                    stageId: normalizeStageId(current.stageId),
                    totalPoints: 0,
                };
            });

            // 4. Identification pass: Find team tasks that already HAVE individual member scores
            const teamTasksWithMemberScores = new Set<string>();
            allScores.forEach(s => {
                const isMemberEntry = s.memberKey || s.targetType === 'member' || s.memberUserId;
                if (isMemberEntry && s.teamId && s.taskId) {
                    teamTasksWithMemberScores.add(`${s.teamId}_${s.taskId}`);
                }
            });

            // Helper to get or create member stats object
            const getOrCreateMemberStat = (
                mKey: string,
                {
                    teamId,
                    memberName,
                    memberUserId,
                    stageId,
                }: {
                    teamId?: string | null;
                    memberName?: string | null;
                    memberUserId?: string | null;
                    stageId?: StageId | null;
                }
            ) => {
                if (!memberStatsMap[mKey]) {
                    memberStatsMap[mKey] = {
                        memberKey: mKey,
                        totalPoints: 0,
                    };
                }

                const stat = memberStatsMap[mKey];
                const legacyInfo = parseLegacyMemberKey(mKey);

                const resolvedTeamId = asNonEmptyString(teamId) || legacyInfo?.teamId || null;
                const resolvedMemberName = asNonEmptyString(memberName) || legacyInfo?.memberName || null;
                const resolvedMemberUserId = asNonEmptyString(memberUserId);
                const resolvedStageId =
                    normalizeStageId(stageId) ||
                    getTeamStageId(resolvedTeamId);

                if (!asNonEmptyString(stat.memberKey)) stat.memberKey = mKey;
                if (!asNonEmptyString(stat.teamId) && resolvedTeamId) stat.teamId = resolvedTeamId;
                if (!asNonEmptyString(stat.memberName) && resolvedMemberName) stat.memberName = resolvedMemberName;
                if (!asNonEmptyString(stat.memberUserId) && resolvedMemberUserId) stat.memberUserId = resolvedMemberUserId;
                if (!normalizeStageId(stat.stageId) && resolvedStageId) stat.stageId = resolvedStageId;

                return stat;
            };

            // 5. Distribution pass: Build accurate MEMBER totals
            let processedCount = 0;
            for (const score of allScores) {
                // Robust point extraction
                const rawPoints = score.points ?? score.score ?? 0;
                const basePts = typeof rawPoints === 'number' ? rawPoints : parseFloat(rawPoints) || 0;
                // Default to 'earn' unless explicitly 'deduct'
                const pts = score.type === 'deduct' ? -Math.abs(basePts) : Math.abs(basePts);

                if (pts === 0) continue;
                processedCount++;

                const teamId = score.teamId || score.team_id;

                // Member Totals
                const memberKey = score.memberKey || score.member_key;
                if (memberKey) {
                    // Direct individual score
                    const stat = getOrCreateMemberStat(memberKey, {
                        teamId,
                        memberName: score.memberName,
                        memberUserId: score.memberUserId,
                        stageId: normalizeStageId(score.stageId) || getTeamStageId(teamId),
                    });
                    stat.totalPoints += pts;
                } else if (teamId && (score.taskId || score.task_id)) {
                    // Potential legacy team score to be distributed
                    const key = `${teamId}_${score.taskId || score.task_id}`;
                    if (!teamTasksWithMemberScores.has(key)) {
                        // Distribute to current team members
                        const teamDoc = teamsById.get(teamId);
                        const teamStageId = normalizeStageId(score.stageId) || getTeamStageId(teamId);
                        const teamMemberNames = teamDoc?.members || [];
                        const teamUserMembers = allUsers.filter(u => u.teamId === teamId && u.role === 'member');

                        // Map of member keys to their info
                        const membersToAdd = new Map<string, { name?: string; uid?: string | null; stageId?: StageId | null }>();

                        // Track normalized user names so team list members that already
                        // have a user account are not double-counted
                        const userNormalizedNames = new Set<string>();
                        teamUserMembers.forEach(u => {
                            const userName = asNonEmptyString(u.name);
                            if (!userName) return;
                            membersToAdd.set(`u:${u.id}`, {
                                name: userName,
                                uid: u.id,
                                stageId: normalizeStageId(u.stageId) || teamStageId,
                            });
                            userNormalizedNames.add(normalizeMemberName(userName));
                        });
                        teamMemberNames.forEach((rawName: string) => {
                            const name = (rawName || '').trim();
                            if (!name) return;
                            // Skip if this name already has a user account
                            if (userNormalizedNames.has(normalizeMemberName(name))) return;
                            const mKey = buildMemberKey({ teamId, memberName: name });
                            if (!mKey) return;
                            membersToAdd.set(mKey, {
                                name,
                                uid: null,
                                stageId: teamStageId,
                            });
                        });

                        if (membersToAdd.size > 0) {
                            const perMember = pts / membersToAdd.size;
                            membersToAdd.forEach((info, mKey) => {
                                const stat = getOrCreateMemberStat(mKey, {
                                    teamId,
                                    memberName: info.name,
                                    memberUserId: info.uid,
                                    stageId: info.stageId || teamStageId,
                                });
                                stat.totalPoints += perMember;
                            });
                        }
                    }
                }
            }

            // 6. Derive team totals from member stats (guarantees team.totalPoints == Σ member_stats)
            for (const stat of Object.values(memberStatsMap)) {
                const tid = asNonEmptyString(stat.teamId);
                if (tid && teamTotals[tid] !== undefined) {
                    teamTotals[tid] = (teamTotals[tid] || 0) + (stat.totalPoints || 0);
                }
            }

            let overallComputedTeamPoints = 0;
            // 7. Batch update Firestore in chunks of 400
            const updates = [
                ...Object.entries(teamTotals).map(([id, total]) => {
                    overallComputedTeamPoints += total;
                    return { type: 'team', id, data: { totalPoints: total } };
                }),
                ...Object.entries(memberStatsMap).map(([id, data]) => ({ type: 'member', id, data }))
            ];

            if (updates.length === 0) {
                showToast('لم يتم العثور على تحديثات لتطبيقها', 'warning');
                setRecalculating(false);
                return;
            }

            console.log(`Applying ${updates.length} updates across teams and members.`);

            const CHUNK_SIZE = 400;
            for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                const chunk = updates.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);

                for (const update of chunk) {
                    const docRef = doc(db, update.type === 'team' ? 'teams' : 'member_stats', update.id);
                    batch.set(docRef, update.data, { merge: true });
                }

                await batch.commit();
                console.log(`Committed batch ${Math.floor(i / CHUNK_SIZE) + 1}`);
            }

            showToast(`✅ تم! السجلات: ${processedCount} | مجموع نقاط الفرق: ${overallComputedTeamPoints}`, 'success');
            setShowRecalculateConfirm(false);
        } catch (err: any) {
            console.error('Recalculate error detailed:', err);
            const errorCode = err.code ? ` (${err.code})` : '';
            showToast(`فشل في إعادة حساب النقاط: ${err.message || 'خطأ غير معروف'}${errorCode}`, 'error');
        } finally {
            setRecalculating(false);
        }
    };

    const handleClearLogs = async () => {
        setClearingLogs(true);
        try {
            // Fetch all collections that make up the activity/score history, plus member_stats to reset individuals
            const [scoresSnap, logsSnap, activitiesSnap, memberStatsSnap, teamsSnap] = await Promise.all([
                getDocs(collection(db, 'scores')),
                getDocs(collection(db, 'logs')),
                getDocs(collection(db, 'activities')),
                getDocs(collection(db, 'member_stats')),
                getDocs(collection(db, 'teams')),
            ]);

            const allRefsToDelete = [
                ...scoresSnap.docs.map(d => d.ref),
                ...logsSnap.docs.map(d => d.ref),
                ...activitiesSnap.docs.map(d => d.ref),
                ...memberStatsSnap.docs.map(d => d.ref),
            ];

            const CHUNK_SIZE = 400;
            // First, delete logs, scores, activities, and member_stats
            for (let i = 0; i < allRefsToDelete.length; i += CHUNK_SIZE) {
                const chunk = allRefsToDelete.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);
                chunk.forEach(ref => batch.delete(ref));
                await batch.commit();
                console.log(`Deleted batch ${Math.floor(i / CHUNK_SIZE) + 1}`);
            }

            // Next, reset all team points to 0
            for (let i = 0; i < teamsSnap.docs.length; i += CHUNK_SIZE) {
                const chunk = teamsSnap.docs.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);
                chunk.forEach(teamDoc => batch.update(teamDoc.ref, { totalPoints: 0 }));
                await batch.commit();
            }

            showToast('تم مسح سجل النشاطات والأپعاد وإعادة تصفير النقاط بنجاح 🗑️');
            setShowClearLogsConfirm(false);
        } catch (err: any) {
            console.error('Clear logs error:', err);
            showToast('فشل في مسح السجل وتصفير النقاط', 'error');
        } finally {
            setClearingLogs(false);
        }
    };

    // =========================
    // XLSX Import
    // =========================
    const handleXlsxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet);

            let imported = 0;
            for (const row of rows) {
                if (!row.name || !row.email) continue;

                const id = `imported_${Date.now()}_${imported}`;
                await setDoc(doc(db, 'users', id), {
                    name: row.name,
                    email: row.email,
                    role: row.role || 'member',
                    teamId: row.teamId || null,
                    createdAt: serverTimestamp(),
                });
                imported++;
            }

            showToast(`تم استيراد ${imported} حساب بنجاح`);
        } catch (err) {
            console.error('Import error:', err);
            showToast('فشل في استيراد الملف', 'error');
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // =========================
    // Export Reports
    // =========================
    const handleExportExcel = () => {
        try {
            // Teams report
            const teamsData = teams.map(t => ({
                'اسم الفريق': t.name,
                'النقاط': t.totalPoints,
                'عدد الأعضاء': t.memberCount,
            }));

            // Scores report
            const scoresData = scores.map(s => {
                const team = teams.find(t => t.id === s.teamId);
                const task = tasks.find(t => t.id === s.taskId);
                return {
                    'الفريق': team?.name || 'غير معروف',
                    'المهمة': task?.title || 'مخصص',
                    'النقاط': s.type === 'earn' ? `+${s.points}` : `-${s.points}`,
                    'النوع': s.type === 'earn' ? 'إضافة' : 'خصم',
                };
            });

            const wb = XLSX.utils.book_new();
            const ws1 = XLSX.utils.json_to_sheet(teamsData);
            const ws2 = XLSX.utils.json_to_sheet(scoresData);
            XLSX.utils.book_append_sheet(wb, ws1, 'الفرق');
            XLSX.utils.book_append_sheet(wb, ws2, 'النقاط');
            XLSX.writeFile(wb, `competition-report-${new Date().toISOString().split('T')[0]}.xlsx`);
            showToast('تم تصدير التقرير بنجاح');
        } catch {
            showToast('فشل في تصدير التقرير', 'error');
        }
    };

    // Use team totalPoints as source of truth (same as Home page)
    const totalPoints = useMemo(
        () => Math.round(teams.reduce((sum, t) => sum + (t.totalPoints || 0), 0)),
        [teams]
    );
    const totalMembers = users.filter(u => u.role === 'member').length;
    const activeTasksCount = tasks.filter(t => t.status === 'active').length;

    if (!user || user.role !== 'super_admin') {
        return (
            <div dir="rtl" className="glass-card p-12 text-center">
                <div className="text-5xl mb-4">🔐</div>
                <h3 className="text-xl font-bold text-text-primary mb-2">منطقة محظورة</h3>
                <p className="text-text-secondary text-sm">هذه الصفحة متاحة للمشرف العام فقط</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="text-center py-16">
                <div className="spinner mx-auto mb-4" />
                <p className="text-text-secondary font-bold">جاري تحميل لوحة التحكم...</p>
            </div>
        );
    }

    const tabs: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
        { key: 'overview', label: 'نظرة عامة', icon: <PieChart className="w-4 h-4" /> },
        { key: 'teams', label: 'الفرق', icon: <Trophy className="w-4 h-4" /> },
        { key: 'users', label: 'المستخدمين', icon: <Users className="w-4 h-4" /> },
        { key: 'reports', label: 'التقارير', icon: <BarChart3 className="w-4 h-4" /> },
    ];

    const leaders = users.filter(u => u.role === 'leader');

    return (
        <div dir="rtl" className="space-y-6">
            <SectionHeader
                title="لوحة المشرف العام"
                subtitle="إدارة كاملة للمسابقة"
                onBack={onBack}
            />

            <StageFilterBar
                active={stageFilter}
                onChange={setStageFilter}
                showAll={true}
            />

            {/* Admin Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeTab === tab.key ? 'tab-active' : 'tab-inactive'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Switcher */}
            {activeTab === 'overview' && (
                <AdminOverviewTab
                    teams={teams}
                    totalPoints={totalPoints}
                    activeTasksCount={activeTasksCount}
                    totalMembers={totalMembers}
                    scores={scores}
                    setActiveTab={setActiveTab}
                    fileInputRef={fileInputRef}
                    handleExportExcel={handleExportExcel}
                />
            )}

            {activeTab === 'teams' && (
                <AdminTeamsTab
                    teams={teams}
                    users={users}
                    memberStatsByTeam={memberStatsByTeam}
                    setShowTeamModal={setShowTeamModal}
                    setEditingTeam={setEditingTeam}
                    setTeamName={setTeamName}
                    setTeamLeader={setTeamLeader}
                    setTeamStageId={setTeamStageId}
                    setDeleteTeamConfirm={setDeleteTeamConfirm}
                />
            )}

            {activeTab === 'users' && (
                <AdminUsersTab
                    users={users}
                    teams={teams}
                    fileInputRef={fileInputRef}
                />
            )}

            {activeTab === 'reports' && (
                <AdminReportsTab
                    scores={scores}
                    recalculating={recalculating}
                    clearingLogs={clearingLogs}
                    handleExportExcel={handleExportExcel}
                    setShowRecalculateConfirm={setShowRecalculateConfirm}
                    setShowClearLogsConfirm={setShowClearLogsConfirm}
                />
            )}

            {/* Hidden file input for XLSX import */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleXlsxImport}
            />

            {/* Team Create/Edit Modal */}
            <AnimatePresence>
                {showTeamModal && (
                    <div className="modal-backdrop" onClick={resetTeamForm}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="glass-card p-6 max-w-md w-full"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-text-primary">
                                    {editingTeam ? 'تعديل الفريق' : 'فريق جديد'}
                                </h3>
                                <button onClick={resetTeamForm} className="p-2 hover:bg-surface rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-text-muted" />
                                </button>
                            </div>

                            <form onSubmit={handleSaveTeam} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-secondary">اسم الفريق</label>
                                    <input
                                        type="text"
                                        required
                                        value={teamName}
                                        onChange={e => setTeamName(e.target.value)}
                                        className="input-field"
                                        placeholder="أدخل اسم الفريق"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-secondary">القائد</label>
                                    <select
                                        value={teamLeader}
                                        onChange={e => setTeamLeader(e.target.value)}
                                        className="select-field"
                                    >
                                        <option value="">اختر القائد</option>
                                        {leaders.map(l => (
                                            <option key={l.id} value={l.id}>{l.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-secondary">المرحلة</label>
                                    <select
                                        value={teamStageId}
                                        onChange={e => setTeamStageId(e.target.value)}
                                        className="select-field"
                                        required
                                    >
                                        <option value="">اختر المرحلة</option>
                                        {STAGES_LIST.map(stage => (
                                            <option key={stage.id} value={stage.id}>{stage.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <button type="submit" className="btn btn-primary w-full py-3">
                                    {editingTeam ? 'حفظ التعديلات' : 'إنشاء الفريق'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete Team Confirm */}
            <ConfirmModal
                isOpen={!!deleteTeamConfirm}
                title="حذف الفريق"
                message={`هل أنت متأكد من حذف فريق "${deleteTeamConfirm?.name}"؟`}
                onConfirm={handleDeleteTeam}
                onCancel={() => setDeleteTeamConfirm(null)}
                confirmText="حذف"
                variant="danger"
            />

            {/* Recalculate Confirm */}
            <ConfirmModal
                isOpen={showRecalculateConfirm}
                title="إعادة حساب النقاط"
                message="سيتم تصفير جميع إجماليات النقاط للفرق والأعضاء وإعادة حسابها من سجلات النقاط. هل أنت متأكد؟"
                onConfirm={handleRecalculateTotals}
                onCancel={() => setShowRecalculateConfirm(false)}
                confirmText={recalculating ? 'جاري الحساب...' : 'بدء الحساب'}
                variant="primary"
            />

            {/* Clear Logs Confirm */}
            <ConfirmModal
                isOpen={showClearLogsConfirm}
                title="مسح سجل النشاطات والعمليات"
                message="سيتم حذف جميع سجلات النشاطات والنقاط المسجلة نهائياً من قاعدة البيانات. لن تتمكن من التراجع أو إعادة حساب النقاط لاحقاً. هل أنت متأكد؟"
                onConfirm={handleClearLogs}
                onCancel={() => setShowClearLogsConfirm(false)}
                confirmText={clearingLogs ? 'جاري المسح...' : 'حذف السجل'}
                variant="danger"
            />
        </div>
    );
}
