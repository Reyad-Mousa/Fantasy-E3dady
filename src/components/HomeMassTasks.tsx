import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft } from 'lucide-react';

interface HomeMassTasksProps {
    user: any;
    massTasks: any[];
    navigate: (tab: string, taskId?: string) => void;
}

export function HomeMassTasks({ user, massTasks, navigate }: HomeMassTasksProps) {
    return (
        <AnimatePresence>
            {user && massTasks.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="grid gap-4"
                >
                    {massTasks.map((task) => (
                        <div
                            key={task.id}
                            onClick={() => navigate('tasks', task.id)}
                            className="bg-purple-600/20 border border-purple-500/40 rounded-2xl p-4 sm:p-5 cursor-pointer hover:bg-purple-600/30 transition-all group shadow-lg shadow-purple-900/20"
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-2xl shadow-inner border border-purple-500/30 group-hover:scale-110 transition-transform shrink-0">
                                        ⛪
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-black text-white text-sm sm:text-base leading-tight">{task.title} (اختصار تسجيل الحضور)</h3>
                                        <p className="text-purple-300/80 text-[10px] sm:text-xs font-bold mt-0.5 leading-relaxed">
                                            انقر هنا لتسجيل حضور فريقك في القداس مباشرة ⚡
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                                    <div className="flex flex-col items-end sm:mr-2">
                                        <span className="text-white font-black text-sm">+{task.points}</span>
                                        <span className="text-purple-300 text-[9px] uppercase font-black tracking-tighter">نقطة للفرد</span>
                                    </div>
                                    <div className="p-2 rounded-full bg-purple-500/20 text-purple-300 group-hover:translate-x-[-4px] transition-transform">
                                        <ArrowLeft className="w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
