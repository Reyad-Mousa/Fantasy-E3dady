import TaskCard, { Task } from './TaskCard';
import { isMassTaskTitle } from '@/services/attendanceCache';
import { EmptyState } from './ui/SharedUI';

interface TasksActiveGridProps {
    tasks: Task[];
    user: any;
    onTaskClick: (task: Task) => void;
    onArchiveClick: (task: Task, e: React.MouseEvent) => void;
    canArchiveTask: (task: Task) => boolean;
}

export function TasksActiveGrid({
    tasks,
    user,
    onTaskClick,
    onArchiveClick,
    canArchiveTask,
}: TasksActiveGridProps) {
    if (tasks.length === 0) {
        return <EmptyState icon="📋" title="لا توجد مهام نشطة" description="سيتم عرض المهام هنا عند إنشائها" />;
    }

    return (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map((task, i) => {
                const isMass = isMassTaskTitle(task.title);
                return (
                    <TaskCard
                        key={task.id}
                        task={task}
                        isMass={isMass}
                        hasUser={!!user}
                        index={i}
                        canArchive={canArchiveTask(task)}
                        onCardClick={() => onTaskClick(task)}
                        onArchiveClick={(e) => onArchiveClick(task, e)}
                    />
                );
            })}
        </div>
    );
}
