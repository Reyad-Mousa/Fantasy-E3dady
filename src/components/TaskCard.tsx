import { motion } from 'motion/react';
import { Target, Users, XCircle } from 'lucide-react';

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

interface TaskCardProps {
    task: Task;
    isMass: boolean;
    hasUser: boolean;
    index: number;
    canArchive: boolean;
    onCardClick: () => void;
    onArchiveClick: (e: React.MouseEvent) => void;
}

export default function TaskCard({
    task,
    isMass,
    hasUser,
    index,
    canArchive,
    onCardClick,
    onArchiveClick
}: TaskCardProps) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: index * 0.05 }}
            className={`glass-card p-5 ${isMass && hasUser ? 'cursor-pointer glass-card-hover ring-1 ring-purple-500/30' : 'glass-card-hover'}`}
            onClick={onCardClick}
        >
            <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-xl ${isMass ? 'bg-purple-500/15 text-purple-400' : 'bg-primary/15 text-primary-light'}`}>
                    {isMass
                        ? <span className="text-lg leading-none">⛪</span>
                        : <Target className="w-5 h-5" />
                    }
                </div>
                <div className="flex items-center gap-2">
                    {isMass && (
                        <span className="badge text-[10px] px-2 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/30">
                            حضور قداس
                        </span>
                    )}
                    <span className={`badge ${task.type === 'team' ? 'badge-sync' : 'badge-pending'}`}>
                        {task.type === 'team' ? 'فريق' : 'فرد'}
                    </span>
                </div>
            </div>

            <h3 className="font-bold text-text-primary mb-2">{task.title}</h3>

            {isMass && (
                <p className={`text-xs ${hasUser ? 'text-purple-400/80' : 'text-text-muted'} mb-2 flex items-center gap-1`}>
                    <Users className="w-3 h-3" />
                    {hasUser ? 'اضغط لتسجيل حضور الأعضاء' : 'سجل الدخول لتسجيل الحضور'}
                </p>
            )}

            <div className="flex items-center justify-between mt-4">
                <div className="flex flex-col gap-1">
                    {task.points > 0 && (
                        <div className="flex items-center gap-1.5 text-accent font-black">
                            <span className="text-lg">+{task.points}</span>
                            <span className="text-xs text-text-muted">نقطة للفرد</span>
                        </div>
                    )}
                    {task.type === 'team' && task.teamPoints !== undefined && task.teamPoints > 0 && (
                        <div className="flex items-center gap-1.5 text-success font-black">
                            <span className="text-sm">+{task.teamPoints}</span>
                            <span className="text-xs text-text-muted">للمجموعة</span>
                        </div>
                    )}
                </div>

                {canArchive && (
                    <button
                        onClick={onArchiveClick}
                        className="text-text-muted hover:text-danger transition-colors text-xs font-bold flex items-center gap-1"
                    >
                        <XCircle className="w-3.5 h-3.5" />
                        أرشفة
                    </button>
                )}
            </div>
        </motion.div>
    );
}
