import { motion } from 'motion/react';
import { Download, Upload, BarChart3, PieChart, Activity, Users, Trophy, Plus, CheckCircle2, X } from 'lucide-react';
import { StatsCard } from './ui/SharedUI';

interface OverviewTabProps {
    teams: any[];
    totalPoints: number;
    activeTasksCount: number;
    totalMembers: number;
    scores: any[];
    setActiveTab: (tab: 'teams' | 'users' | 'reports') => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleExportExcel: () => void;
}

export default function OverviewTab({
    teams,
    totalPoints,
    activeTasksCount,
    totalMembers,
    scores,
    setActiveTab,
    fileInputRef,
    handleExportExcel
}: OverviewTabProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
        >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard icon="👥" label="إجمالي الفرق" value={teams.length} color="primary" />
                <StatsCard icon="⭐" label="إجمالي النقاط" value={totalPoints} color="accent" />
                <StatsCard icon="📋" label="المهام النشطة" value={activeTasksCount} color="success" />
                <StatsCard icon="👤" label="الأعضاء" value={totalMembers} color="primary" />
            </div>

            {/* Quick Actions */}
            <div className="glass-card p-6">
                <h3 className="font-bold text-text-primary mb-4">إجراءات سريعة</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button onClick={() => setActiveTab('teams')} className="btn btn-primary text-sm">
                        <Plus className="w-4 h-4" />
                        إضافة فريق
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="btn btn-accent text-sm">
                        <Upload className="w-4 h-4" />
                        استيراد حسابات
                    </button>
                    <button onClick={handleExportExcel} className="btn btn-ghost text-sm">
                        <Download className="w-4 h-4" />
                        تصدير تقرير
                    </button>
                    <button onClick={() => setActiveTab('reports')} className="btn btn-ghost text-sm">
                        <BarChart3 className="w-4 h-4" />
                        عرض التقارير
                    </button>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-border">
                    <h3 className="font-bold text-text-primary flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" />
                        آخر النشاطات
                    </h3>
                </div>
                <div className="divide-y divide-border/30 max-h-[300px] overflow-y-auto">
                    {scores.slice(0, 10).map((score) => {
                        const team = teams.find(t => t.id === score.teamId);
                        return (
                            <div key={score.id} className="p-3 px-4 flex items-center gap-3 text-sm">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${score.type === 'earn' ? 'bg-success' : 'bg-danger'}`} />
                                <span className="text-text-secondary flex-1">
                                    <span className="text-text-primary font-bold">{team?.name}</span>
                                    {' ← '}
                                    <span className={score.type === 'earn' ? 'text-success' : 'text-danger'}>
                                        {score.type === 'earn' ? '+' : '-'}{score.points} نقطة
                                    </span>
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
}
