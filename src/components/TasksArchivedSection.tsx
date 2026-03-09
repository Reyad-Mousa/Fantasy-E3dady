import { Clock } from 'lucide-react';
import { Task } from './TaskCard';

interface TasksArchivedSectionProps {
    tasks: Task[];
}

export function TasksArchivedSection({ tasks }: TasksArchivedSectionProps) {
    if (tasks.length === 0) return null;

    return (
        <div className="mt-8">
            <h3 className="text-text-muted font-bold text-sm mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                المهام المؤرشفة ({tasks.length})
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {tasks.map(task => (
                    <div key={task.id} className="glass-card p-4 opacity-50">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="badge badge-failed text-xs">مؤرشفة</span>
                            <span className="badge">{task.type === 'team' ? 'فريق' : 'فرد'}</span>
                        </div>
                        <h4 className="font-bold text-text-secondary text-sm">{task.title}</h4>
                        <p className="text-text-muted text-xs mt-1">+{task.points} نقطة</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
