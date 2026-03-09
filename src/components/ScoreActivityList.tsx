import { motion } from 'motion/react';
import { Trophy, AlertTriangle, Trash2, Clock, Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { toEventDate } from '@/utils/helpers';
import { ScoreActivity } from './ScoreRegistration'; // Or from types

import { EmptyState } from './ui/SharedUI';

interface ScoreActivityListProps {
    activities: ScoreActivity[];
    teams: any[];
    tasks: any[];
    missingStageScope: boolean;
    setMemberDetails: (details: any) => void;
    buildMemberKey: (params: any) => string;
}

export function ScoreActivityList({
    activities,
    teams,
    tasks,
    missingStageScope,
    setMemberDetails,
    buildMemberKey
}: ScoreActivityListProps) {
    if (missingStageScope) {
        return <EmptyState icon="⚠️" title="تعذر العرض" description="لا يمكن عرض التسجيلات قبل تعيين المرحلة" />;
    }

    if (activities.length === 0) {
        return <EmptyState icon="📝" title="لا توجد نشاطات" description="لم يتم تسجيل أي نشاط مؤخراً" />;
    }

    return (
        <>
            {activities.map((activity, i) => {
                const isEarn = activity.scoreType === 'earn';
                const isMember = activity.targetType === 'member';
                const points = Math.abs(Number(activity.points || 0));
                const teamName = activity.teamName || teams.find(t => t.id === activity.teamId)?.name || '؟';
                const taskTitle = activity.taskTitle || tasks.find(t => t.id === activity.taskId)?.title || activity.customNote || 'مهمة مخصصة';
                const eventDate = toEventDate(activity.timestamp);
                const timeAgo = eventDate.getTime() > 0
                    ? formatDistanceToNow(eventDate, { addSuffix: true, locale: ar })
                    : 'الآن';
                return (
                    <motion.div
                        key={activity.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="p-4 sm:p-5 hover:bg-white/[0.02] transition-colors w-full overflow-hidden"
                    >
                        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-lg ${isEarn
                                ? 'bg-success/10 border-success/30 text-success shadow-success/10'
                                : 'bg-danger/10 border-danger/30 text-danger shadow-danger/10'}`}>
                                {isEarn ? <Trophy className="w-5 h-5 sm:w-6 sm:h-6" /> : <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-bold text-text-primary text-sm sm:text-base leading-snug truncate">
                                            {isMember
                                                ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setMemberDetails({
                                                            memberKey: activity.memberKey || buildMemberKey({ teamId: activity.teamId, memberName: activity.memberName || undefined }),
                                                            memberUserId: activity.memberUserId || null,
                                                            memberName: activity.memberName || 'فرد',
                                                            name: activity.memberName || 'فرد',
                                                            teamId: activity.teamId || '',
                                                            teamName: teamName,
                                                            stageId: activity.stageId || teams.find(t => t.id === activity.teamId)?.stageId || null,
                                                        })}
                                                        className="text-primary-light hover:text-primary transition-colors text-right truncate max-w-full block"
                                                    >
                                                        {activity.memberName || activity.memberUserId || 'فرد'}
                                                    </button>
                                                )
                                                : <span className="block truncate">{teamName}</span>}
                                        </h4>
                                        <p className="text-xs sm:text-sm text-text-secondary line-clamp-2 mt-0.5 leading-relaxed">
                                            {taskTitle}
                                            {isMember && <span className="opacity-60 text-[10px] sm:text-xs"> — {teamName}</span>}
                                        </p>
                                    </div>
                                    <div className={`shrink-0 px-2 sm:px-3 py-1.5 rounded-xl font-black text-xs sm:text-base border flex items-center gap-1 ${isEarn
                                        ? 'bg-success/10 text-success border-success/20'
                                        : 'bg-danger/10 text-danger border-danger/20'}`}>
                                        {isEarn ? '+' : '-'}{points}
                                        <span className="text-[9px] font-bold opacity-70">نقطة</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] sm:text-xs text-text-muted font-medium">
                                    <span className="flex items-center gap-1 bg-surface/50 px-2 py-0.5 rounded-md shrink-0">
                                        <Clock className="w-3 h-3 text-accent/70" />
                                        {timeAgo}
                                    </span>
                                    {activity.actorName && (
                                        <span className="flex items-center gap-1 truncate max-w-[150px]">
                                            <Shield className="w-3 h-3 text-primary-light/70 shrink-0" />
                                            بواسطة: <span className="text-text-secondary truncate">{activity.actorName}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                );
            })}
        </>
    );
}
