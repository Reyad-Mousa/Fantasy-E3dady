import { useState } from 'react';
import { useAuth, canCreateTeams, canExportReports } from '@/context/AuthContext';
import { useToast, SectionHeader, EmptyState, ConfirmModal } from './ui/SharedUI';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { AnimatePresence } from 'motion/react';
import { Plus, Users, Download, Upload } from 'lucide-react';
import StageBadge from './StageBadge';
import StageFilterBar, { FilterValue } from './StageFilterBar';
import MemberScoreDetailsModal, { type MemberDetailsTarget } from './MemberScoreDetailsModal';
import { STAGES_LIST, STAGES } from '@/config/stages';
import { useTeamsData, type TeamData } from '@/hooks/useTeamsData';
import { buildMemberKey, normalizeMemberName } from '@/services/memberKeys';
import { useExcelImport } from '@/hooks/useExcelImport';
import ImportPreviewModal from './ImportPreviewModal';

import TeamCard from './TeamCard';
import TeamFormModal from './TeamFormModal';
import TeamAddMemberModal from './TeamAddMemberModal';
import TeamMoveMemberModal from './TeamMoveMemberModal';

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
        removeMissingMembers,
        setRemoveMissingMembers,
        parseExcel,
        confirmImport,
        cancelImport,
        updateNewTeamStage
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
        void (async () => {
            try {
                const XLSX = await import('xlsx-js-style');
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

                const generateExportUuid = () => {
                    const cryptoApi = (typeof globalThis !== 'undefined'
                        ? (globalThis as any).crypto
                        : undefined) as { getRandomValues?: (arr: Uint8Array) => Uint8Array } | undefined;
                    let value = 0;
                    if (cryptoApi?.getRandomValues) {
                        const bytes = new Uint8Array(2);
                        cryptoApi.getRandomValues(bytes);
                        value = (bytes[0] << 8) | bytes[1];
                    } else {
                        value = Math.floor(Math.random() * 10000);
                    }
                    return String(value % 10000).padStart(4, '0');
                };

                const usersSnap = await getDocs(collection(db, 'users'));
                const memberIdByTeamAndName = new Map<string, string>();
                const generatedMemberIds = new Map<string, string>();
                usersSnap.docs.forEach(docSnap => {
                    const data = docSnap.data() as any;
                    const teamId = typeof data.teamId === 'string' ? data.teamId.trim() : '';
                    const name = typeof data.name === 'string' ? data.name.trim() : '';
                    if (!teamId || !name) return;
                    const key = `${teamId}:::${normalizeMemberName(name)}`;
                    if (!memberIdByTeamAndName.has(key)) {
                        memberIdByTeamAndName.set(key, docSnap.id);
                    }
                });

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

                const headers = [
                    'الفريق',
                    'المرحلة',
                    'إجمالي النقاط',
                    'معرّف العضو',
                    'اسم العضو',
                    'نقاط العضو'
                ];
                const totalColumns = headers.length;

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
                            'المرحلة': STAGES[team.stageId as keyof typeof STAGES]?.name || team.stageId || '',
                            'إجمالي النقاط': Math.round(team.totalPoints || 0),
                            'معرّف العضو': '',
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
                                const memberIdKey = `${team.id}:::${normalizeMemberName(member)}`;
                                let memberUserId = memberIdByTeamAndName.get(memberIdKey) || '';
                                if (!memberUserId) {
                                    memberUserId = generatedMemberIds.get(memberIdKey) || '';
                                    if (!memberUserId) {
                                        memberUserId = generateExportUuid();
                                        generatedMemberIds.set(memberIdKey, memberUserId);
                                    }
                                }
                                sheetData.push({
                                    'الفريق': '',
                                    'المرحلة': '',
                                    'إجمالي النقاط': '',
                                    'معرّف العضو': memberUserId,
                                    'اسم العضو': member,
                                    'نقاط العضو': Math.round(pts)
                                });
                                currentRowIndex++;
                            });
                        } else {
                            sheetData.push({
                                'الفريق': '',
                                'المرحلة': '',
                                'إجمالي النقاط': '',
                                'معرّف العضو': '',
                                'اسم العضو': 'لا يوجد أعضاء',
                                'نقاط العضو': '---'
                            });
                            currentRowIndex++;
                        }

                        rowGroups.push({ start: groupStart, end: currentRowIndex - 1, colorIndex: tIdx % TEAM_COLORS.length });

                        // Empty separator row
                        sheetData.push({
                            'الفريق': '',
                            'المرحلة': '',
                            'إجمالي النقاط': '',
                            'معرّف العضو': '',
                            'اسم العضو': '',
                            'نقاط العضو': ''
                        });
                        currentRowIndex++;
                    });

                    const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers });

                    // Set RTL for the sheet
                    ws['!dir'] = 'rtl';

                    // Adjust column widths
                    ws['!cols'] = headers.map(header => {
                        if (header === 'الفريق') return { wch: 20 };
                        if (header === 'المرحلة') return { wch: 15 };
                        if (header === 'إجمالي النقاط') return { wch: 15 };
                        if (header === 'معرّف العضو') return { wch: 40 };
                        if (header === 'اسم العضو') return { wch: 25 };
                        return { wch: 15 };
                    });

                    // Apply styles to headers
                    for (let C = 0; C < totalColumns; ++C) {
                        const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
                        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
                        ws[cellRef].s = {
                            fill: { fgColor: { rgb: "E0E0E0" } },
                            font: { bold: true },
                            alignment: { horizontal: "center", vertical: "center", wrapText: true }
                        };
                    }

                    // Apply styles to team rows
                    rowGroups.forEach(group => {
                        const color = TEAM_COLORS[group.colorIndex];
                        for (let R = group.start; R <= group.end; ++R) {
                            for (let C = 0; C < totalColumns; ++C) {
                                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                                if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

                                ws[cellRef].s = {
                                    fill: { fgColor: { rgb: color } },
                                    alignment: { horizontal: "center", vertical: "center", wrapText: true },
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
        })();
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
                    {/* Import: super_admin & admin only */}
                    {(user?.role === 'super_admin' || user?.role === 'admin') && (
                        <>
                            <input
                                type="file"
                                id="excel-upload"
                                accept=".xlsx, .xls"
                                className="hidden"
                                disabled={isImporting}
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
                                className={`btn btn-ghost text-sm w-full sm:w-auto justify-center cursor-pointer ${isImporting ? 'opacity-60 cursor-not-allowed' : ''}`}
                                title="استيراد بيانات الفرق"
                            >
                                <Upload className="w-4 h-4" />
                                {isImporting ? 'جاري الاستيراد...' : 'استيراد'}
                            </label>
                        </>
                    )}
                    {/* Export keeps prior permission */}
                    {canExportReports(user.role) && (
                        <button
                            onClick={handleExportTeamsReport}
                            className="btn btn-ghost text-sm w-full sm:w-auto justify-center"
                            title="تصدير بيانات الفرق"
                        >
                            <Download className="w-4 h-4" />
                            تصدير
                        </button>
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
                    <TeamCard
                        key={team.id}
                        team={team}
                        canManageTeamDetails={canManageTeamDetails}
                        onEditTeam={(t) => {
                            setEditingTeam(t);
                            setTeamName(t.name);
                            setTeamStageId(t.stageId || '');
                            setShowTeamModal(true);
                        }}
                        onDeleteTeam={(t) => setDeleteTeamConfirm(t)}
                        onAddMember={(t) => {
                            setAddingMemberTo(t);
                            setNewMemberName('');
                        }}
                        onViewMemberDetails={setMemberDetails}
                        onMoveMember={(t, m) => {
                            setMoveMemberState({ team: t, memberName: m });
                            setMoveTargetTeamId('');
                        }}
                        onRemoveMember={(t, m) => setRemoveMemberConfirm({ team: t, memberName: m })}
                    />
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
                    <TeamFormModal
                        editingTeam={editingTeam}
                        onClose={resetTeamForm}
                        teamName={teamName}
                        setTeamName={setTeamName}
                        teamStageId={teamStageId}
                        setTeamStageId={setTeamStageId}
                        onSave={handleSaveTeam}
                        userRole={user?.role}
                    />
                )}
            </AnimatePresence>

            {/* ──────── Add Member Modal ──────── */}
            <AnimatePresence>
                {addingMemberTo && (
                    <TeamAddMemberModal
                        team={addingMemberTo}
                        onClose={() => setAddingMemberTo(null)}
                        newMemberName={newMemberName}
                        setNewMemberName={setNewMemberName}
                        onAddMember={handleAddMember}
                        onViewMemberDetails={setMemberDetails}
                        onMoveMember={(t, m) => {
                            setMoveMemberState({ team: t, memberName: m });
                            setMoveTargetTeamId('');
                        }}
                        onRemoveMember={(t, m) => setRemoveMemberConfirm({ team: t, memberName: m })}
                    />
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
                    <TeamMoveMemberModal
                        moveMemberState={moveMemberState}
                        onClose={() => { setMoveMemberState(null); setMoveTargetTeamId(''); }}
                        moveTargetTeamId={moveTargetTeamId}
                        setMoveTargetTeamId={setMoveTargetTeamId}
                        teams={teams}
                        isMoving={isMoving}
                        onMoveMemberSubmit={handleMoveMember}
                    />
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
                    removeMissingMembers={removeMissingMembers}
                    onToggleRemoveMissingMembers={setRemoveMissingMembers}
                    onConfirm={confirmImport}
                    onCancel={cancelImport}
                    onUpdateTeamStage={updateNewTeamStage}
                    stageOptions={user?.role === 'super_admin' ? undefined : (user?.stageId ? STAGES_LIST.filter(s => s.id === user.stageId) : [])}
                />
            )}
        </div>
    );
}
