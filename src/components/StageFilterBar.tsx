import { STAGES_LIST, StageId } from '@/config/stages';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type FilterValue = StageId | 'all';

interface StageFilterBarProps {
    active: FilterValue;
    onChange: (value: FilterValue) => void;
    showAll?: boolean;
    className?: string;
}

export default function StageFilterBar({ active, onChange, showAll = false, className }: StageFilterBarProps) {
    return (
        <div className={twMerge('flex flex-wrap items-center gap-2 mb-6', className)}>
            {showAll && (
                <button
                    onClick={() => onChange('all')}
                    className={clsx(
                        'px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300',
                        active === 'all'
                            ? 'bg-surface border border-border text-text-primary shadow-[0_0_15px_rgba(255,255,255,0.05)]'
                            : 'hover:bg-surface/50 text-text-muted hover:text-text-primary'
                    )}
                >
                    الكل
                </button>
            )}

            {STAGES_LIST.map((stage) => {
                const isActive = active === stage.id;

                return (
                    <button
                        key={stage.id}
                        onClick={() => onChange(stage.id)}
                        className={clsx(
                            'px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2',
                            isActive
                                ? 'text-white'
                                : 'hover:bg-surface/50 text-text-muted hover:text-text-primary'
                        )}
                        style={{
                            backgroundColor: isActive ? stage.color : 'transparent',
                            boxShadow: isActive ? `0 0 20px ${stage.color}40` : 'none',
                            border: isActive ? `1px solid ${stage.color}` : '1px solid transparent',
                        }}
                    >
                        <span
                            className="w-2 h-2 rounded-full"
                            style={{
                                backgroundColor: isActive ? '#fff' : stage.color,
                                boxShadow: isActive ? 'none' : `0 0 8px ${stage.color}`,
                            }}
                        />
                        {stage.name}
                    </button>
                );
            })}
        </div>
    );
}
