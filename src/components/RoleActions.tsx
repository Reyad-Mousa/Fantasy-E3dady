import { motion } from 'motion/react';
import { Target, Users, ListTodo, Star } from 'lucide-react';

interface RoleActionsProps {
    user: any;
    animationsEnabled: boolean;
    navigate: (tab: string, taskId?: string) => void;
}

export function RoleActions({ user, animationsEnabled, navigate }: RoleActionsProps) {
    if (!user) return null;

    return (
        <motion.div
            initial={animationsEnabled ? { opacity: 0, y: 10 } : false}
            animate={animationsEnabled ? { opacity: 1, y: 0 } : undefined}
            transition={animationsEnabled ? { delay: 0.3 } : undefined}
            className="bg-surface-card rounded-3xl p-8 border border-white/5 shadow-xl relative overflow-hidden"
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl" />
            <h2 className="text-lg font-black text-white mb-6 flex items-center gap-3">
                <div className="w-2 h-6 bg-accent rounded-full" />
                ماذا تود أن تفعل اليوم؟
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 relative z-10">
                <button onClick={() => navigate('scores')} className="btn btn-primary py-3 sm:py-4 rounded-2xl h-full flex flex-col items-center gap-2 sm:gap-3 shadow-lg shadow-primary/20 group hover:-translate-y-1 transition-all text-xs sm:text-sm">
                    <div className="bg-white/10 p-1.5 sm:p-2 rounded-xl group-hover:scale-110 transition-transform"><Star className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                    <span className="text-center font-bold">تسجيل النقاط</span>
                </button>
                <button onClick={() => navigate('tasks')} className="btn btn-accent py-3 sm:py-4 rounded-2xl h-full flex flex-col items-center gap-2 sm:gap-3 shadow-lg shadow-accent/20 group hover:-translate-y-1 transition-all text-bg font-black text-xs sm:text-sm">
                    <div className="bg-bg/10 p-1.5 sm:p-2 rounded-xl group-hover:scale-110 transition-transform"><ListTodo className="w-5 h-5 sm:w-6 sm:h-6 text-bg" /></div>
                    <span className="text-center">عرض المهام</span>
                </button>
                <button onClick={() => navigate('teams')} className="btn btn-ghost py-3 sm:py-4 rounded-2xl h-full flex flex-col items-center gap-2 sm:gap-3 border-2 border-border/30 hover:border-text-primary hover:-translate-y-1 transition-all group text-xs sm:text-sm">
                    <div className="bg-surface p-1.5 sm:p-2 rounded-xl group-hover:scale-110 transition-transform"><Users className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                    <span className="text-center font-bold">إدارة الفرق</span>
                </button>
                {user.role === 'super_admin' && (
                    <button onClick={() => navigate('admin')} className="btn btn-ghost py-3 sm:py-4 rounded-2xl h-full flex flex-col items-center gap-2 sm:gap-3 border-2 border-border/30 hover:border-text-primary hover:-translate-y-1 transition-all group text-xs sm:text-sm">
                        <div className="bg-surface p-1.5 sm:p-2 rounded-xl group-hover:scale-110 transition-transform"><Target className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                        <span className="text-center font-bold">لوحة التحكم</span>
                    </button>
                )}
            </div>
        </motion.div>
    );
}
