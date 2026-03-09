import { useState } from 'react';
import { useAuth, canCreateTeams, canExportReports } from '@/context/AuthContext';
import { useToast, SectionHeader, EmptyState, ConfirmModal } from './ui/SharedUI';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit3, Trash2, X, Users, Trophy, UserPlus, UserMinus, ArrowLeftRight, Download, Upload } from 'lucide-react';
import StageBadge from './StageBadge';
import StageFilterBar, { FilterValue } from './StageFilterBar';
import MemberScoreDetailsModal, { type MemberDetailsTarget } from './MemberScoreDetailsModal';
import { STAGES_LIST, STAGES } from '@/config/stages';
import { useTeamsData, type TeamData } from '@/hooks/useTeamsData';
import { buildMemberKey } from '@/services/memberKeys';
import * as XLSX from 'xlsx-js-style';
import { useExcelImport } from '@/hooks/useExcelImport';
import ImportPreviewModal from './ImportPreviewModal';

export default function TeamsPage({ onBack }: { onBack?: () => void }) {
    const { user } = useAuth();
    const { showToast } = useToast();

    const { teams, memberStats, loading, saveTeam, deleteTeam, addMember, removeMember, moveMember } = useTeamsData(user, showToast);

    const [stageFilter, setStageFilter] = useState<FilterValue>('all');

    // Team form
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [teamName, setTeamName] = useState('');
    const [teamStageId, setTeamStageId] = useState('');
    const [editingTeam, setEditingTeam] = useState<TeamData | null>(null);
    const [deleteTeamConfirm, setDeleteTeamConfirm] = useState<TeamData | null>(null);

    // Member add form
    const [addingMemberTo, setAddingMemberTo] = useState<TeamData | null>(null);
    const [newMemberName, setNewMemberName] = useState('');
    const [removeMemberConfirm, setRemoveMemberConfirm] = useState<{ team: TeamData, memberName: string } | null>(null);
    const [memberDetails, setMemberDetails] = useState<MemberDetailsTarget | null>(null);

    // Move member
    const [moveMemberState, setMoveMemberState] = useState<{ team: TeamData; memberName: string } | null>(null);
    const [moveTargetTeamId, setMoveTargetTeamId] = useState<string>('');
    const [isMoving, setIsMoving] = useState(false);

    const canCreateTeam = !!user && canCreateTeams(user.role);
    const canManageTeamDetails = !!user && ['super_admin', 'admin', 'leader'].includes(user.role);

    // Excel import hook
    const {
        previewData: importPreviewData,
        isImporting,
        parseExcel,
        confirmImport,
        cancelImport
    } = useExcelImport(user, teams, memberStats, showToast, () => { });

    // ──────────── Team CRUD ────────────
    const handleSaveTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        await saveTeam(teamName, teamStageId, editingTeam, () => {
            resetTeamForm();
        });
    };

    const handleDeleteTeam = async () => {
        await deleteTeam(deleteTeamConfirm, () => {
            setDeleteTeamConfirm(null);
        });
    };

    const resetTeamForm = () => {
        setShowTeamModal(false);
        setEditingTeam(null);
        setTeamName('');
        setTeamStageId('');
    };

    // ──────────── Add/Remove Members ────────────
    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        await addMember(addingMemberTo, newMemberName, (updatedTeam) => {
            setNewMemberName('');
            setAddingMemberTo(updatedTeam);
        });
    };

    const handleRemoveMember = async () => {
        if (!removeMemberConfirm) return;
        const { team, memberName } = removeMemberConfirm;

        await removeMember(team, memberName, (updatedTeam) => {
            if (addingMemberTo?.id === team.id) {
                setAddingMemberTo(updatedTeam);
            }
            setRemoveMemberConfirm(null);
        });
    };

    const handleMoveMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!moveMemberState || !moveTargetTeamId) return;
        const targetTeam = teams.find(t => t.id === moveTargetTeamId);
        if (!targetTeam) return;
        setIsMoving(true);
        await moveMember(moveMemberState.team, targetTeam, moveMemberState.memberName, null, () => {
            // If the member manage modal was open for the source team, refresh it
            if (addingMemberTo?.id === moveMemberState.team.id) {
                const refreshed = teams.find(t => t.id === moveMemberState.team.id);
                if (refreshed) setAddingMemberTo(refreshed);
            }
            setMoveMemberState(null);
            setMoveTargetTeamId('');
        });
        setIsMoving(false);
    };

    const handleExportTeamsReport = () => {
        try {
            const TEAM_COLORS = [
                "FFE6E6", // Light Red
                "E6FFE6", // Light Green
                "E6E6FF", // Light Blue
                "FFFFE6", // Light Yellow
                "FFE6FF", // Light Magenta
                "E6FFFF", // Light Cyan
                "FFF0E6", // Light Orange
                "F0E6FF"  // Light Purple
            ];
            const wb = XLSX.utils.book_new();

            // Apply current stage filter to teams
            const teamsToExport = stageFilter === 'all'
                ? teams
                : teams.filter(t => t.stageId === stageFilter);

            // Group by stage for better organization
            const stages = Array.from(new Set(teamsToExport.map(t => t.stageId))).filter(Boolean).sort();

            if (stages.length === 0) {
                showToast('لا توجد بيانات لتصديرها', 'warning');
                return;
            }

            stages.forEach(sId => {
                const stageName = STAGES[sId as keyof typeof STAGES]?.name || sId;
                const stageTeams = teamsToExport.filter(t => t.stageId === sId);
                const sheetData: any[] = [];
                const rowGroups: { start: number, end: number, colorIndex: number }[] = [];

                let currentRowIndex = 1; // Header row is 0, so first data row is 1

                stageTeams.forEach((team, tIdx) => {
                    const groupStart = currentRowIndex;

                    // Add team header row
                    sheetData.push({
                        'الفريق': team.name,
                        'إجمالي النقاط': Math.round(team.totalPoints || 0),
                        'اسم العضو': '---',
                        'نقاط العضو': '---'
                    });
                    currentRowIndex++;

                    // Add member rows
                    if (team.members && team.members.length > 0) {
                        const sortedMembers = [...team.members].sort((a, b) => {
                            const aKey = buildMemberKey({ teamId: team.id, memberName: a });
                            const bKey = buildMemberKey({ teamId: team.id, memberName: b });
                            const aPts = memberStats[aKey] || 0;
                            const bPts = memberStats[bKey] || 0;
                            return bPts - aPts; // Sort descending
                        });

                        sortedMembers.forEach(member => {
                            const mKey = buildMemberKey({ teamId: team.id, memberName: member });
                            const pts = memberStats[mKey] || 0;
                            sheetData.push({
                                'الفريق': '',
                                'إجمالي النقاط': '',
                                'اسم العضو': member,
                                'نقاط العضو': Math.round(pts)
                            });
                            currentRowIndex++;
                        });
                    } else {
                        sheetData.push({
                            'الفريق': '',
                            'إجمالي النقاط': '',
                            'اسم العضو': 'لا يوجد أعضاء',
                            'نقاط العضو': '---'
                        });
                        currentRowIndex++;
                    }

                    rowGroups.push({ start: groupStart, end: currentRowIndex - 1, colorIndex: tIdx % TEAM_COLORS.length });

                    // Empty separator row
                    sheetData.push({});
                    currentRowIndex++;
                });

                const ws = XLSX.utils.json_to_sheet(sheetData);

                // Set RTL for the sheet
                ws['!dir'] = 'rtl';

                // Adjust column widths
                ws['!cols'] = [
                    { wch: 20 }, // الفريق
                    { wch: 15 }, // إجمالي النقاط
                    { wch: 25 }, // اسم العضو
                    { wch: 15 }  // نقاط العضو
                ];

                // Apply styles to headers
                for (let C = 0; C < 4; ++C) {
                    const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
                    if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
                    ws[cellRef].s = {
                        fill: { fgColor: { rgb: "E0E0E0" } },
                        font: { bold: true },
                        alignment: { horizontal: "center" }
                    };
                }

                // Apply styles to team rows
                rowGroups.forEach(group => {
                    const color = TEAM_COLORS[group.colorIndex];
                    for (let R = group.start; R <= group.end; ++R) {
                        for (let C = 0; C < 4; ++C) {
                            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                            if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

                            ws[cellRef].s = {
                                fill: { fgColor: { rgb: color } },
                                alignment: { horizontal: "center" },
                                font: R === group.start ? { bold: true } : {}
                            };
                        }
                    }
                });

                const cleanSheetName = (stageName || 'Unknown').substring(0, 31).replace(/[\[\]\*\\\/\?]/g, '');
                XLSX.utils.book_append_sheet(wb, ws, cleanSheetName);
            });

            const fileName = `teams-report-${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            showToast('تم تصدير التقرير بنجاح ✅');
        } catch (err) {
            console.error('Export error:', err);
            showToast('فشل في تصدير التقرير', 'error');
        }
    };

    if (!user || !canCreateTeam) {
        return (
            <div dir="rtl" className="glass-card p-12 text-center">
                <div className="text-5xl mb-4">🔐</div>
                <h3 className="text-xl font-bold text-text-primary mb-2">غير مسموح</h3>
                <p className="text-text-secondary text-sm">ليس لديك صلاحية الوصول</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="text-center py-16">
                <div className="spinner mx-auto mb-4" />
                <p className="text-text-secondary font-bold">جاري تحميل الفرق...</p>
            </div>
        );
    }

    const filteredTeams = stageFilter === 'all'
        ? teams
        : teams.filter(t => t.stageId === stageFilter);

    return (
        <div dir="rtl" className="space-y-6">
            <SectionHeader
                title="إدارة الفرق"
                subtitle="أنشئ الفرق وأضِف الأعضاء يدوياً"
                onBack={onBack}
                action={(user?.role === 'admin' || user?.role === 'leader') && user?.stageId ? <StageBadge stageId={user.stageId} size="md" /> : undefined}
            />

            {/* Create Team Button & Filter Component */}
            <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full`}>
                <div className="flex flex-wrap items-center gap-4">
                    {user?.role === 'super_admin' && (
                        <StageFilterBar
                            active={stageFilter}
                            onChange={setStageFilter}
                            showAll={true}
                        />
                    )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 shrink-0 w-full sm:w-auto">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border/50 text-sm font-bold text-text-secondary w-full sm:w-auto justify-center">
                        <Users className="w-4 h-4 text-primary" />
                        <span>عدد الفرق:</span>
                        <span className="text-text-primary bg-primary/20 text-primary-light border-primary/50 flex items-center justify-center w-6 h-6 rounded-full">{filteredTeams.length}</span>
                    </div>
                    {canExportReports(user.role) && (
                        <>
                            <input
                                type="file"
                                id="excel-upload"
                                accept=".xlsx, .xls"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        parseExcel(file, stageFilter);
                                    }
                                    e.target.value = '';
                                }}
                            />
                            <label
                                htmlFor="excel-upload"
                                className="btn btn-ghost text-sm w-full sm:w-auto justify-center cursor-pointer"
                                title="استيراد بيانات الفرق"
                            >
                                <Upload className="w-4 h-4" />
                                استيراد
                            </label>
                            <button
                                onClick={handleExportTeamsReport}
                                className="btn btn-ghost text-sm w-full sm:w-auto justify-center"
                                title="تصدير بيانات الفرق"
                            >
                                <Download className="w-4 h-4" />
                                تصدير
                            </button>
                        </>
                    )}
                    {canCreateTeam && (
                        <button onClick={() => setShowTeamModal(true)} className="btn btn-primary text-sm w-full sm:w-auto justify-center">
                            <Plus className="w-4 h-4" />
                            فريق جديد
                        </button>
                    )}
                </div>
            </div>

            {/* Teams Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTeams.map(team => (
                    <motion.div
                        key={team.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="glass-card glass-card-hover p-5"
                    >
                        {/* Team Header */}
                        <div className="flex items-start justify-between mb-4 gap-3">
                            <div className="flex items-start sm:items-center gap-3 min-w-0">
                                <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white font-black text-xl shrink-0 shadow-sm border border-white/10">
                                    {(team.name || '؟').charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-text-primary text-base sm:text-lg truncate" title={team.name}>{team.name}</h3>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                        <span className="flex items-center gap-1 text-[11px] font-bold text-text-secondary bg-surface px-2 py-0.5 rounded-lg border border-border/50">
                                            <Trophy className="w-3 h-3 text-accent" />
                                            {team.totalPoints} نقطة
                                        </span>
                                        <span className="flex items-center gap-1 text-[11px] font-bold text-text-secondary bg-surface px-2 py-0.5 rounded-lg border border-border/50">
                                            <Users className="w-3 h-3 text-primary" />
                                            {team.members?.length || 0} عضو
                                        </span>
                                        {team.stageId && <StageBadge stageId={team.stageId} />}
                                    </div>
                                </div>
                            </div>
                            {canManageTeamDetails && (
                                <div className="flex flex-col gap-1 shrink-0 bg-surface/50 p-1 rounded-xl border border-border/50">
                                    <button
                                        onClick={() => {
                                            setEditingTeam(team);
                                            setTeamName(team.name);
                                            setTeamStageId(team.stageId || '');
                                            setShowTeamModal(true);
                                        }}
                                        className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"
                                        title="تعديل"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleteTeamConfirm(team)}
                                        className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                        title="حذف"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Members List */}
                        <div className="border-t border-border/30 pt-3 mt-3">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-bold text-text-secondary">الأعضاء</h4>
                                {canManageTeamDetails && (
                                    <button
                                        onClick={() => {
                                            setAddingMemberTo(team);
                                            setNewMemberName('');
                                        }}
                                        className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-light transition-colors"
                                    >
                                        <UserPlus className="w-3 h-3" />
                                        إضافة
                                    </button>
                                )}
                            </div>

                            {team.members && team.members.length > 0 ? (
                                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                    {team.members.map((member, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between group py-1 px-2 rounded-lg hover:bg-surface/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                                    {(member || '؟').charAt(0)}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setMemberDetails({
                                                        memberKey: buildMemberKey({ teamId: team.id, memberName: member }),
                                                        memberName: member,
                                                        name: member,
                                                        teamId: team.id,
                                                        teamName: team.name,
                                                        stageId: team.stageId || null,
                                                    })}
                                                    className="text-sm text-text-primary hover:text-primary-light transition-colors"
                                                >
                                                    {member}
                                                </button>
                                            </div>
                                            {canManageTeamDetails && (
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => {
                                                            setMoveMemberState({ team, memberName: member });
                                                            setMoveTargetTeamId('');
                                                        }}
                                                        className="p-1 rounded-md hover:bg-primary/10 text-text-muted hover:text-primary transition-all"
                                                        title="نقل إلى فريق آخر"
                                                    >
                                                        <ArrowLeftRight className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={() => setRemoveMemberConfirm({ team, memberName: member })}
                                                        className="p-1 rounded-md hover:bg-danger/10 text-text-muted hover:text-danger transition-all"
                                                        title="إزالة"
                                                    >
                                                        <UserMinus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-text-muted text-center py-3">لا يوجد أعضاء بعد</p>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>

            {filteredTeams.length === 0 && (
                <EmptyState
                    icon="🏆"
                    title="لا توجد فرق"
                    description="أنشئ فريقاً جديداً وأضِف الأعضاء"
                />
            )}

            {/* ──────── Create/Edit Team Modal ──────── */}
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
                                    {editingTeam ? 'تعديل الفريق' : '🏆 فريق جديد'}
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
                                        placeholder="مثال: فريق النسور"
                                        autoFocus
                                    />
                                </div>

                                {user?.role === 'super_admin' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">اختر المرحلة</label>
                                        <select
                                            value={teamStageId}
                                            onChange={e => setTeamStageId(e.target.value)}
                                            className="select-field"
                                            required
                                        >
                                            <option value="">حدد المرحلة الدراسية</option>
                                            {STAGES_LIST.map(stage => (
                                                <option key={stage.id} value={stage.id}>{stage.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <button type="submit" className="btn btn-primary w-full py-3">
                                    {editingTeam ? 'حفظ التعديلات' : 'إنشاء الفريق'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ──────── Add Member Modal ──────── */}
            <AnimatePresence>
                {addingMemberTo && (
                    <div className="modal-backdrop" onClick={() => setAddingMemberTo(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="glass-card p-6 max-w-md w-full"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-text-primary">
                                    👤 إضافة أعضاء — {addingMemberTo.name}
                                </h3>
                                <button onClick={() => setAddingMemberTo(null)} className="p-2 hover:bg-surface rounded-xl transition-colors">
                                    <X className="w-5 h-5 text-text-muted" />
                                </button>
                            </div>

                            {/* Add form */}
                            <form onSubmit={handleAddMember} className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    required
                                    value={newMemberName}
                                    onChange={e => setNewMemberName(e.target.value)}
                                    className="input-field flex-1"
                                    placeholder="اسم العضو"
                                    autoFocus
                                />
                                <button type="submit" className="btn btn-primary shrink-0">
                                    <UserPlus className="w-4 h-4" />
                                    إضافة
                                </button>
                            </form>

                            {/* Current members */}
                            <div className="border-t border-border/30 pt-3">
                                <h4 className="text-xs font-bold text-text-secondary mb-2">
                                    الأعضاء الحاليين ({addingMemberTo.members?.length || 0})
                                </h4>
                                {addingMemberTo.members && addingMemberTo.members.length > 0 ? (
                                    <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                                        {addingMemberTo.members.map((member, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface/30"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                                        {(member || '؟').charAt(0)}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMemberDetails({
                                                            memberKey: buildMemberKey({ teamId: addingMemberTo.id, memberName: member }),
                                                            memberName: member,
                                                            name: member,
                                                            teamId: addingMemberTo.id,
                                                            teamName: addingMemberTo.name,
                                                            stageId: addingMemberTo.stageId || null,
                                                        })}
                                                        className="text-sm text-text-primary font-bold hover:text-primary-light transition-colors"
                                                    >
                                                        {member}
                                                    </button>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => {
                                                            setMoveMemberState({ team: addingMemberTo, memberName: member });
                                                            setMoveTargetTeamId('');
                                                        }}
                                                        className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"
                                                        title="نقل إلى فريق آخر"
                                                    >
                                                        <ArrowLeftRight className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setRemoveMemberConfirm({ team: addingMemberTo, memberName: member })}
                                                        className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                                        title="إزالة"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-text-muted text-center py-6">لم يتم إضافة أعضاء بعد</p>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete Team Confirm */}
            <ConfirmModal
                isOpen={!!deleteTeamConfirm}
                title="حذف الفريق"
                message={`هل أنت متأكد من حذف فريق "${deleteTeamConfirm?.name}"؟ سيتم حذف جميع الأعضاء.`}
                onConfirm={handleDeleteTeam}
                onCancel={() => setDeleteTeamConfirm(null)}
                confirmText="حذف"
                variant="danger"
            />

            {/* Remove Member Confirm */}
            <ConfirmModal
                isOpen={!!removeMemberConfirm}
                title="إزالة العضو"
                message={`هل أنت متأكد من إزالة "${removeMemberConfirm?.memberName}" من فريق "${removeMemberConfirm?.team.name}"؟`}
                onConfirm={handleRemoveMember}
                onCancel={() => setRemoveMemberConfirm(null)}
                confirmText="إزالة"
                variant="danger"
            />

            {/* ──────── Move Member Modal ──────── */}
            <AnimatePresence>
                {moveMemberState && (
                    <div className="modal-backdrop" onClick={() => { setMoveMemberState(null); setMoveTargetTeamId(''); }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="glass-card p-6 max-w-md w-full"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-text-primary">
                                    <ArrowLeftRight className="inline w-5 h-5 ml-2 text-primary" />
                                    نقل عضو — {moveMemberState.memberName}
                                </h3>
                                <button
                                    onClick={() => { setMoveMemberState(null); setMoveTargetTeamId(''); }}
                                    className="p-2 hover:bg-surface rounded-xl transition-colors"
                                >
                                    <X className="w-5 h-5 text-text-muted" />
                                </button>
                            </div>

                            <div className="mb-4 p-3 rounded-xl bg-surface/50 border border-border/50 text-sm text-text-secondary">
                                <p>الفريق الحالي: <span className="font-bold text-text-primary">{moveMemberState.team.name}</span></p>
                                {moveMemberState.team.stageId && (
                                    <p className="mt-1">المرحلة: <StageBadge stageId={moveMemberState.team.stageId} /></p>
                                )}
                            </div>

                            <form onSubmit={handleMoveMember} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-secondary">الفريق المستهدف (نفس المرحلة)</label>
                                    <select
                                        value={moveTargetTeamId}
                                        onChange={e => setMoveTargetTeamId(e.target.value)}
                                        className="select-field"
                                        required
                                        autoFocus
                                    >
                                        <option value="">اختر الفريق</option>
                                        {teams
                                            .filter(t =>
                                                t.id !== moveMemberState.team.id &&
                                                t.stageId === moveMemberState.team.stageId
                                            )
                                            .map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))
                                        }
                                    </select>
                                </div>

                                <p className="text-xs text-text-muted">
                                    ⚠️ سيتم نقل جميع نقاط وسجلات العضو إلى الفريق الجديد تلقائياً.
                                </p>

                                <button
                                    type="submit"
                                    disabled={!moveTargetTeamId || isMoving}
                                    className="btn btn-primary w-full py-3"
                                >
                                    {isMoving ? <div className="spinner !w-4 !h-4" /> : <ArrowLeftRight className="w-4 h-4" />}
                                    {isMoving ? 'جاري النقل...' : 'نقل العضو'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <MemberScoreDetailsModal
                member={memberDetails}
                onClose={() => setMemberDetails(null)}
                stageScope={user?.role === 'super_admin'
                    ? (stageFilter === 'all' ? null : stageFilter)
                    : (user?.stageId || memberDetails?.stageId || null)}
            />

            {importPreviewData && (
                <ImportPreviewModal
                    data={importPreviewData}
                    isImporting={isImporting}
                    onConfirm={confirmImport}
                    onCancel={cancelImport}
                />
            )}
        </div>
    );
}
