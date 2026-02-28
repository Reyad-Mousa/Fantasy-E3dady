import { STAGES, StageId } from '@/config/stages';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface StageBadgeProps {
    stageId?: StageId | string | null;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export default function StageBadge({ stageId, size = 'sm', className }: StageBadgeProps) {
    if (!stageId || !(stageId in STAGES)) return null;

    const stage = STAGES[stageId as StageId];

    const sizeClasses = {
        sm: 'text-[10px] px-2 py-0.5',
        md: 'text-xs px-2.5 py-1',
        lg: 'text-sm px-3 py-1.5',
    };

    return (
        <span
            className={twMerge(
                'inline-flex items-center rounded-full font-bold whitespace-nowrap',
                sizeClasses[size],
                className
            )}
            style={{
                backgroundColor: `${stage.color}15`,
                color: stage.color,
                border: `1px solid ${stage.color}40`,
            }}
        >
            <span
                className="w-1.5 h-1.5 rounded-full ml-1.5"
                style={{ backgroundColor: stage.color }}
            />
            {stage.name}
        </span>
    );
}
