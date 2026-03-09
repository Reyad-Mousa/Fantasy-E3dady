import { motion } from 'motion/react';
import { Plus, Edit3, Trash2, Trophy, Users } from 'lucide-react';
import StageBadge from './StageBadge';

interface AdminTeamsTabProps {
    teams: any[];
    users: any[];
    memberStatsByTeam: Record<string, number>;
    setShowTeamModal: (show: boolean) => void;
    setEditingTeam: (team: any) => void;
    setTeamName: (name: string) => void;
    setTeamLeader: (leaderId: string) => void;
    setTeamStageId: (stageId: string) => void;
    setDeleteTeamConfirm: (team: any) => void;
}

export default function AdminTeamsTab({
    teams,
    users,
    memberStatsByTeam,
    setShowTeamModal,
    setEditingTeam,
    setTeamName,
    setTeamLeader,
    setTeamStageId,
    setDeleteTeamConfirm
}: AdminTeamsTabProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
        >
            <div className="flex justify-end">
                <button onClick={() => setShowTeamModal(true)} className="btn btn-primary text-sm">
                    <Plus className="w-4 h-4" />
                    فريق جديد
                </button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map(team => {
                    const leader = users.find(u => u.id === team.leaderId);
                    return (
                        <div key={team.id} className="glass-card glass-card-hover p-5">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white font-black text-xl">
                                        {(team.name || '؟').charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-text-primary">{team.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-text-muted text-xs">قائد: {leader?.name || 'غير محدد'}</p>
                                            <StageBadge stageId={team.stageId} />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => {
                                            setEditingTeam(team);
                                            setTeamName(team.name);
                                            setTeamLeader(team.leaderId);
                                            setTeamStageId(team.stageId || '');
                                            setShowTeamModal(true);
                                        }}
                                        className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"
                                    >
                                        <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setDeleteTeamConfirm(team)}
                                        className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mt-4">
                                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                                    <Trophy className="w-3.5 h-3.5 text-accent" />
                                    {memberStatsByTeam[team.id] ?? team.totalPoints ?? 0} نقطة
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                                    <Users className="w-3.5 h-3.5" />
                                    {team.memberCount} عضو
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {teams.length === 0 && (
                <div className="glass-card p-12 text-center text-text-secondary">
                    <div className="text-4xl mb-3">🏆</div>
                    <h3 className="font-bold text-lg mb-1">لا توجد فرق</h3>
                    <p className="text-sm">أنشئ فريقاً جديداً للبدء</p>
                </div>
            )}
        </motion.div>
    );
}
