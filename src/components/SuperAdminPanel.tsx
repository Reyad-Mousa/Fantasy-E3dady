import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, getDocs, where, writeBatch } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth, canManageUsers, canExportReports } from '@/context/AuthContext';
import { useToast, SectionHeader, StatsCard, EmptyState, ConfirmModal } from './ui/SharedUI';
import { motion, AnimatePresence } from 'motion/react';
import {
    Settings, Users, ListTodo, Trophy, BarChart3, FileSpreadsheet,
    Plus, Upload, Download, Trash2, Edit3, X, Shield, UserPlus,
    PieChart, Activity, AlertTriangle, RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import StageFilterBar, { FilterValue } from './StageFilterBar';
import StageBadge from './StageBadge';
import { STAGES_LIST, StageId } from '@/config/stages';
import { logActivity } from '@/services/activityLogger';
import { buildMemberKey, normalizeMemberName } from '@/services/memberKeys';

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
    const [activeTab, setActiveTab] = useState<AdminTab>('overview');
    const [stageFilter, setStageFilter] = useState<FilterValue>('all');
    const [teams, setTeams] = useState<TeamData[]>([]);
    const [users, setUsers] = useState<UserData[]>([]);
    const [scores, setScores] = useState<ScoreData[]>([]);
    const [tasks, setTasks] = useState<TaskData[]>([]);
    const [loading, setLoading] = useState(true);
    const [recalculating, setRecalculating] = useState(false);
    // member_stats: teamId → total individual points
    const [memberStatsByTeam, setMemberStatsByTeam] = useState<Record<string, number>>({});

    // Team form
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [teamName, setTeamName] = useState('');
    const [teamLeader, setTeamLeader] = useState('');
    const [teamStageId, setTeamStageId] = useState<string>('');
    const [editingTeam, setEditingTeam] = useState<TeamData | null>(null);
    const [deleteTeamConfirm, setDeleteTeamConfirm] = useState<TeamData | null>(null);
    const [showRecalculateConfirm, setShowRecalculateConfirm] = useState(false);
    const [showClearLogsConfirm, setShowClearLogsConfirm] = useState(false);
    const [clearingLogs, setClearingLogs] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const teamsQuery = stageFilter === 'all'
            ? collection(db, 'teams')
            : query(collection(db, 'teams'), where('stageId', '==', stageFilter));

        const unsub1 = onSnapshot(teamsQuery, snap => {
            setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamData)));
        });
        const unsub2 = onSnapshot(collection(db, 'users'), snap => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
        });
        const unsub3 = onSnapshot(query(collection(db, 'scores'), orderBy('timestamp', 'desc')), snap => {
            setScores(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScoreData)));
        });
        const unsub4 = onSnapshot(collection(db, 'tasks'), snap => {
            setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskData)));
            setLoading(false);
        });

        return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
    }, [stageFilter]);

    // Independent listener for member_stats (not affected by stageFilter changes)
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

    // =========================
    // Team Management
    // =========================
    const handleSaveTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingTeam) {
                const oldName = editingTeam.name;
                const newName = teamName;
                await updateDoc(doc(db, 'teams', editingTeam.id), {
                    name: newName,
                    leaderId: teamLeader || editingTeam.leaderId,
                    stageId: teamStageId || null,
                });
                if (oldName !== newName) {
                    logActivity({
                        kind: 'audit',
                        operation: 'update',
                        entityType: 'team',
                        entityId: editingTeam.id,
                        entityName: newName,
                        stageId: teamStageId || editingTeam.stageId || null,
                        details: `الاسم السابق: ${oldName}`,
                        actorId: user!.uid,
                        actorName: user!.name,
                        actorRole: user!.role,
                    });
                }
                showToast('تم تحديث الفريق');
            } else {
                const id = `team_${Date.now()}`;
                const finalStageId = teamStageId || null;
                await setDoc(doc(db, 'teams', id), {
                    name: teamName,
                    leaderId: teamLeader || '',
                    stageId: finalStageId,
                    totalPoints: 0,
                    memberCount: 0,
                    createdAt: serverTimestamp(),
                });
                logActivity({
                    kind: 'audit',
                    operation: 'create',
                    entityType: 'team',
                    entityId: id,
                    entityName: teamName,
                    stageId: finalStageId,
                    actorId: user!.uid,
                    actorName: user!.name,
                    actorRole: user!.role,
                });
                showToast('تم إنشاء الفريق');
            }
            resetTeamForm();
        } catch {
            showToast('فشل في حفظ الفريق', 'error');
        }
    };

    const handleDeleteTeam = async () => {
        if (!deleteTeamConfirm) return;
        try {
            await deleteDoc(doc(db, 'teams', deleteTeamConfirm.id));
            logActivity({
                kind: 'audit',
                operation: 'delete',
                entityType: 'team',
                entityId: deleteTeamConfirm.id,
                entityName: deleteTeamConfirm.name,
                stageId: deleteTeamConfirm.stageId || null,
                actorId: user!.uid,
                actorName: user!.name,
                actorRole: user!.role,
            });
            showToast('تم حذف الفريق');
            setDeleteTeamConfirm(null);
        } catch {
            showToast('فشل في حذف الفريق', 'error');
        }
    };

    const resetTeamForm = () => {
        setShowTeamModal(false);
        setEditingTeam(null);
        setTeamName('');
        setTeamLeader('');
        setTeamStageId('');
    };

    const handleRecalculateTotals = async () => {
        setRecalculating(true);
        try {
            console.log('Starting points recalculation...');
            // 1. Fetch current scores
            const scoresSnap = await getDocs(collection(db, 'scores'));
            const allScores = scoresSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            console.log(`Fetched ${allScores.length} scores.`);

            // 2. Safeguard: If no scores found, abort to prevent accidental wipe
            if (allScores.length === 0) {
                showToast('❌ لم يتم العثور على أي سجلات نقاط. تم إلغاء العملية لحماية البيانات.', 'error');
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

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                >
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatsCard icon="👥" label="إجمالي الفرق" value={teams.length} color="primary" />
                        <StatsCard icon="⭐" label="إجمالي النقاط" value={totalPoints} color="accent" />
                        <StatsCard icon="📋" label="المهام النشطة" value={activeTasksCount} color="success" />
                        <StatsCard icon="👤" label="الأعضاء" value={totalMembers} color="primary" />
                    </div>

                    {/* Quick Actions */}
                    <div className="glass-card p-6">
                        <h3 className="font-bold text-text-primary mb-4">إجراءات سريعة</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <button onClick={() => setActiveTab('teams')} className="btn btn-primary text-sm">
                                <Plus className="w-4 h-4" />
                                إضافة فريق
                            </button>
                            <button onClick={() => fileInputRef.current?.click()} className="btn btn-accent text-sm">
                                <Upload className="w-4 h-4" />
                                استيراد حسابات
                            </button>
                            <button onClick={handleExportExcel} className="btn btn-ghost text-sm">
                                <Download className="w-4 h-4" />
                                تصدير تقرير
                            </button>
                            <button onClick={() => setActiveTab('reports')} className="btn btn-ghost text-sm">
                                <BarChart3 className="w-4 h-4" />
                                عرض التقارير
                            </button>
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="glass-card overflow-hidden">
                        <div className="p-4 border-b border-border">
                            <h3 className="font-bold text-text-primary flex items-center gap-2">
                                <Activity className="w-4 h-4 text-primary" />
                                آخر النشاطات
                            </h3>
                        </div>
                        <div className="divide-y divide-border/30 max-h-[300px] overflow-y-auto">
                            {scores.slice(0, 10).map(score => {
                                const team = teams.find(t => t.id === score.teamId);
                                return (
                                    <div key={score.id} className="p-3 px-4 flex items-center gap-3 text-sm">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${score.type === 'earn' ? 'bg-success' : 'bg-danger'}`} />
                                        <span className="text-text-secondary flex-1">
                                            <span className="text-text-primary font-bold">{team?.name}</span>
                                            {' ← '}
                                            <span className={score.type === 'earn' ? 'text-success' : 'text-danger'}>
                                                {score.type === 'earn' ? '+' : '-'}{score.points} نقطة
                                            </span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Teams Tab */}
            {activeTab === 'teams' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                >
                    <div className="flex justify-end">
                        <button onClick={() => setShowTeamModal(true)} className="btn btn-primary text-sm">
                            <Plus className="w-4 h-4" />
                            فريق جديد
                        </button>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {teams.map(team => {
                            const leader = users.find(u => u.id === team.leaderId);
                            return (
                                <div key={team.id} className="glass-card glass-card-hover p-5">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white font-black text-xl">
                                                {(team.name || '؟').charAt(0)}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-text-primary">{team.name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <p className="text-text-muted text-xs">قائد: {leader?.name || 'غير محدد'}</p>
                                                    <StageBadge stageId={team.stageId} />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => {
                                                    setEditingTeam(team);
                                                    setTeamName(team.name);
                                                    setTeamLeader(team.leaderId);
                                                    setTeamStageId(team.stageId || '');
                                                    setShowTeamModal(true);
                                                }}
                                                className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteTeamConfirm(team)}
                                                className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 mt-4">
                                        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                                            <Trophy className="w-3.5 h-3.5 text-accent" />
                                            {memberStatsByTeam[team.id] ?? team.totalPoints ?? 0} نقطة
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                                            <Users className="w-3.5 h-3.5" />
                                            {team.memberCount} عضو
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {teams.length === 0 && (
                        <EmptyState icon="🏆" title="لا توجد فرق" description="أنشئ فريقاً جديداً للبدء" />
                    )}
                </motion.div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                >
                    <div className="flex gap-3 justify-end">
                        <button onClick={() => fileInputRef.current?.click()} className="btn btn-accent text-sm">
                            <Upload className="w-4 h-4" />
                            استيراد من Excel
                        </button>
                    </div>

                    <div className="glass-card overflow-hidden">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>الاسم</th>
                                    <th>البريد</th>
                                    <th>الدور</th>
                                    <th>الفريق</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td className="font-bold text-text-primary">{u.name}</td>
                                        <td className="text-text-secondary">{u.email}</td>
                                        <td>
                                            <span className={`badge ${u.role === 'super_admin' ? 'badge-pending' :
                                                u.role === 'admin' ? 'badge-sync' :
                                                    u.role === 'leader' ? 'badge-completed' : ''
                                                }`}>
                                                {u.role === 'super_admin' ? 'مشرف عام' :
                                                    u.role === 'admin' ? 'مشرف' :
                                                        u.role === 'leader' ? 'قائد' : 'عضو'}
                                            </span>
                                        </td>
                                        <td className="text-text-secondary">
                                            {teams.find(t => t.id === u.teamId)?.name || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            )}

            {/* Reports Tab */}
            {activeTab === 'reports' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                >
                    <div className="glass-card p-6">
                        <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-success" />
                            تصدير التقارير
                        </h3>
                        <p className="text-text-secondary text-sm mb-4">
                            صدّر بيانات المسابقة كملف Excel يحتوي على ترتيب الفرق وسجل النقاط
                        </p>
                        <button onClick={handleExportExcel} className="btn btn-primary">
                            <Download className="w-4 h-4" />
                            تصدير Excel
                        </button>
                    </div>

                    <div className="glass-card p-6 border border-warning/30 bg-warning/5">
                        <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-warning" />
                            إعادة حساب الإجماليات
                        </h3>
                        <p className="text-text-secondary text-sm mb-4">
                            استخدم هذه الميزة إذا لاحظت عدم دقة في مجموع النقاط للفرق أو الأعضاء. سيتم مسح الإجماليات الحالية وإعادة بنائها من سجلات النقاط فقط.
                        </p>
                        <button
                            onClick={() => setShowRecalculateConfirm(true)}
                            disabled={recalculating}
                            className="btn btn-ghost text-warning border-warning/30 hover:bg-warning/10"
                        >
                            {recalculating ? <div className="spinner !w-4 !h-4" /> : <RefreshCw className="w-4 h-4" />}
                            إعادة حساب النقاط
                        </button>
                    </div>

                    <div className="glass-card p-6 border border-danger/30 bg-danger/5">
                        <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                            <Trash2 className="w-5 h-5 text-danger" />
                            مسح سجل النشاطات والعمليات
                        </h3>
                        <p className="text-text-secondary text-sm mb-4">
                            تحذير: سيتم حذف جميع سجلات "النشاطات" و "النقاط المسجلة" نهائياً، وسيتم **تصفير نقاط جميع الفرق والأفراد**. المسح سيجعل المنظومة تبدأ من الصفر (موسم جديد).
                        </p>
                        <button
                            onClick={() => setShowClearLogsConfirm(true)}
                            disabled={clearingLogs}
                            className="btn btn-ghost text-danger border-danger/30 hover:bg-danger/10"
                        >
                            {clearingLogs ? <div className="spinner !w-4 !h-4" /> : <Trash2 className="w-4 h-4" />}
                            مسح السجل بالكامل
                        </button>
                    </div>

                    {/* Summary Stats */}
                    <div className="grid sm:grid-cols-3 gap-4">
                        <div className="glass-card p-5 text-center">
                            <p className="text-3xl font-black text-accent">{scores.filter(s => s.type === 'earn').reduce((s, sc) => s + sc.points, 0)}</p>
                            <p className="text-text-secondary text-sm mt-1">إجمالي النقاط المكتسبة</p>
                        </div>
                        <div className="glass-card p-5 text-center">
                            <p className="text-3xl font-black text-danger">{scores.filter(s => s.type === 'deduct').reduce((s, sc) => s + sc.points, 0)}</p>
                            <p className="text-text-secondary text-sm mt-1">إجمالي النقاط المخصومة</p>
                        </div>
                        <div className="glass-card p-5 text-center">
                            <p className="text-3xl font-black text-primary">{scores.length}</p>
                            <p className="text-text-secondary text-sm mt-1">إجمالي التسجيلات</p>
                        </div>
                    </div>
                </motion.div>
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
