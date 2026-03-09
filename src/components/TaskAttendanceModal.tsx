import { motion, AnimatePresence } from 'motion/react';
import { X, Users } from 'lucide-react';
import StageBadge from './StageBadge';
import StageFilterBar, { type FilterValue } from './StageFilterBar';
import MemberScoreDetailsModal, { type MemberDetailsTarget } from './MemberScoreDetailsModal';

export interface Task {
    id: string;
    title: string;
    points: number;
    teamPoints?: number;
    type: 'team' | 'leader' | string;
    status: 'active' | 'archived';
    createdBy: string;
    stageId?: string;
    deadline?: any;
    createdAt?: any;
    isSuperAdminOnly?: boolean;
}

export interface AttendanceMember {
    key: string;
    userId: string | null;
    name: string;
    teamId: string;
    teamName: string;
    stageId: string | null;
}

interface TaskAttendanceModalProps {
    attendanceTask: Task;
    onClose: () => void;
    attendanceMembers: AttendanceMember[];
    resolvedAddedKeys: Set<string>;
    visibleAddedCount: number;
    addingKey: string | null;
    online: boolean;
    userRole?: string;
    attendanceStageFilter: FilterValue;
    setAttendanceStageFilter: (f: FilterValue) => void;
    setMemberDetails: (details: MemberDetailsTarget) => void;
    handleGivePoints: (member: AttendanceMember) => void;
    memberDetails: MemberDetailsTarget | null;
    stageScope: FilterValue | null;
}

export default function TaskAttendanceModal({
    attendanceTask,
    onClose,
    attendanceMembers,
    resolvedAddedKeys,
    visibleAddedCount,
    addingKey,
    online,
    userRole,
    attendanceStageFilter,
    setAttendanceStageFilter,
    setMemberDetails,
    handleGivePoints,
    memberDetails,
    stageScope
}: TaskAttendanceModalProps) {
    return (
        <>
            <AnimatePresence mode="wait">
                {attendanceTask && (
                    <div
                        key="attendance-modal-overlay"
                        className="modal-backdrop"
                        onClick={onClose}
                    >
                        <motion.div
                            key="attendance-modal-card"
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="glass-card p-0 max-w-lg w-full overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-purple-500/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-xl">
                                        ⛪
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-text-primary">{attendanceTask.title}</h3>
                                        <p className="text-xs text-purple-400 font-bold">
                                            {attendanceTask.points > 0 && `+${attendanceTask.points} نقطة لكل حاضر`}
                                            {attendanceTask.points > 0 && (attendanceTask.teamPoints ?? 0) > 0 && ' | '}
                                            {(attendanceTask.teamPoints ?? 0) > 0 && `+${attendanceTask.teamPoints} مكافأة فريق`}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-surface rounded-xl transition-colors"
                                >
                                    <X className="w-5 h-5 text-text-muted" />
                                </button>
                            </div>

                            {/* Stats bar */}
                            <div className="px-6 py-3 bg-surface/30 border-b border-border/30 flex items-center justify-between text-xs">
                                <span className="text-text-muted">
                                    إجمالي الأعضاء: <span className="font-bold text-text-primary">{attendanceMembers.length}</span>
                                </span>
                                <span className="text-purple-400 font-bold">
                                    تم تسجيل: {visibleAddedCount}
                                </span>
                            </div>

                            {userRole === 'super_admin' && (
                                <div className="px-6 py-4 border-b border-border/20 bg-surface/10">
                                    <StageFilterBar
                                        active={attendanceStageFilter}
                                        onChange={setAttendanceStageFilter}
                                        showAll={true}
                                        className="mb-0"
                                    />
                                </div>
                            )}

                            {/* Members List */}
                            <div className="overflow-y-auto max-h-[60vh] divide-y divide-border/20">
                                {attendanceMembers.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="text-4xl mb-3">👥</div>
                                        <p className="text-text-secondary text-sm font-bold">
                                            {!online
                                                ? 'لا توجد بيانات أعضاء محفوظة محليًا لهذه المرحلة بعد'
                                                : userRole === 'super_admin'
                                                    ? 'لا يوجد أعضاء في المرحلة المحددة'
                                                    : 'لا يوجد أعضاء في مرحلتك'}
                                        </p>
                                    </div>
                                ) : (
                                    attendanceMembers.map(member => {
                                        const isAdded = resolvedAddedKeys.has(member.key);
                                        const isLoading = addingKey === member.key;
                                        return (
                                            <motion.div
                                                key={`member-${member.key}`}
                                                layout
                                                className={`flex items-center gap-3 px-5 py-3 transition-all ${isAdded
                                                    ? 'bg-green-500/8'
                                                    : 'hover:bg-surface/50'
                                                    }`}
                                            >
                                                {/* Avatar */}
                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${isAdded
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : 'bg-primary/20 text-primary-light'
                                                    }`}>
                                                    {(member.name || '؟').charAt(0)}
                                                </div>

                                                {/* Info */}
                                                <button
                                                    type="button"
                                                    onClick={() => setMemberDetails({
                                                        memberKey: member.key,
                                                        memberUserId: member.userId,
                                                        memberName: member.name,
                                                        name: member.name,
                                                        teamId: member.teamId,
                                                        teamName: member.teamName,
                                                        stageId: member.stageId,
                                                    })}
                                                    className="flex-1 min-w-0 text-right"
                                                >
                                                    <p className="font-bold text-text-primary text-sm truncate hover:text-primary-light transition-colors">
                                                        {member.name}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                        <StageBadge stageId={member.stageId} size="sm" />
                                                        <span className="text-[11px] text-text-muted flex items-center gap-1">
                                                            <Users className="w-3 h-3" />
                                                            {member.teamName}
                                                        </span>
                                                    </div>
                                                </button>

                                                {/* Action button */}
                                                <button
                                                    disabled={isAdded || isLoading}
                                                    onClick={() => handleGivePoints(member)}
                                                    className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all font-bold text-sm ${isAdded
                                                        ? 'bg-green-500/20 text-green-400 cursor-default'
                                                        : isLoading
                                                            ? 'bg-surface opacity-60'
                                                            : 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 hover:border-purple-500/60'
                                                        }`}
                                                >
                                                    {isLoading ? (
                                                        <div className="spinner !w-4 !h-4" />
                                                    ) : isAdded ? (
                                                        <span>✓</span>
                                                    ) : attendanceTask.points > 0 ? (
                                                        <span>+{attendanceTask.points}</span>
                                                    ) : (
                                                        <span className="text-xs">تسجيل</span>
                                                    )}
                                                </button>
                                            </motion.div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Footer */}
                            {!online && (
                                <div className="px-6 py-3 bg-warning/10 border-t border-warning/30">
                                    <p className="text-xs text-warning font-bold text-center">
                                        ⚠️ لا يوجد اتصال — التسجيل يعمل محليًا الآن وسيتم التزامن تلقائيًا عند عودة الإنترنت
                                    </p>
                                </div>
                            )}
                            {visibleAddedCount > 0 && online && (
                                <div className="px-6 py-3 bg-green-500/5 border-t border-green-500/20">
                                    <p className="text-xs text-green-400 font-bold text-center">
                                        ✅ تم تسجيل {visibleAddedCount} حاضر بنجاح
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <MemberScoreDetailsModal
                member={memberDetails}
                onClose={() => setMemberDetails(null)}
                stageScope={stageScope}
            />
        </>
    );
}
