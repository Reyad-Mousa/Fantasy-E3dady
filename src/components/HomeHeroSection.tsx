import { motion } from 'motion/react';
import { Trophy, Star } from 'lucide-react';
import StageBadge from './StageBadge';

interface HomeHeroSectionProps {
    user: any;
    animationsEnabled: boolean;
}

export function HomeHeroSection({ user, animationsEnabled }: HomeHeroSectionProps) {
    return (
        <motion.div
            initial={animationsEnabled ? { opacity: 0, scale: 0.98 } : false}
            animate={animationsEnabled ? { opacity: 1, scale: 1 } : undefined}
            className="relative overflow-hidden bg-surface-card rounded-3xl p-8 sm:p-12 border border-white/5 border-b-border shadow-2xl"
        >
            <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-primary/10 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="space-y-5 flex-1">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 border border-accent/20 text-accent-light text-[14px] font-black tracking-widest uppercase">
                        <Star className="w-3 h-3 fill-current" />
                        Fantasy E3dady             </div>
                    <h1 className="text-4xl sm:text-5xl font-black text-white leading-[1.15] whitespace-pre-line">
                        {user ? `منور يـ ${user.name?.split(' ')[0]} 👋` : 'تحدى نفسك،\nواربح القمة 🏆'}
                    </h1>
                    <p className="text-text-secondary text-sm sm:text-base font-bold max-w-lg leading-relaxed">
                        تابع نتائج المراحل الثلاث واكتشف الفريق المتصدر في الوقت الحقيقي. نظام ذكي لإدارة النقاط والمهام.
                    </p>
                    {user?.stageId && (
                        <div className="mt-4 inline-block">
                            <StageBadge stageId={user.stageId} size="lg" className="px-6 py-2.5 rounded-2xl shadow-lg border-2" />
                        </div>
                    )}
                </div>

                <div className="hidden lg:block w-72 h-72 relative">
                    <div className={`absolute inset-0 bg-primary/20 rounded-full blur-[80px] ${animationsEnabled ? 'animate-pulse-glow' : ''} mobile-hide-blur`} />
                    <Trophy className="w-full h-full text-accent/80 relative z-10 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]" />
                </div>
            </div>
        </motion.div>
    );
}
