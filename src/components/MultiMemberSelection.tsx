import { motion, AnimatePresence } from 'motion/react';
import { Check, X } from 'lucide-react';
import { MemberOption } from './ScoreRegistration'; // We will export this from ScoreRegistration or Shared types

interface MultiMemberSelectionProps {
    availableMembers: MemberOption[];
    selectedMembers: MemberOption[];
    selectedMemberKeys: string[];
    selectedTeam: string;
    teams: any[];
    toggleMember: (key: string) => void;
    selectAllMembers: () => void;
    clearMembers: () => void;
    setMemberDetails: (details: any) => void;
    getSelectedTeam: () => any;
}

export function MultiMemberSelection({
    availableMembers,
    selectedMembers,
    selectedMemberKeys,
    selectedTeam,
    teams,
    toggleMember,
    selectAllMembers,
    clearMembers,
    setMemberDetails,
    getSelectedTeam,
}: MultiMemberSelectionProps) {
    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
        >
            <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-text-secondary">
                    الأفراد
                    {selectedMembers.length > 0 && (
                        <span className="mr-1.5 bg-accent/20 text-accent px-1.5 py-0.5 rounded-full text-[10px]">
                            {selectedMembers.length} مختار
                        </span>
                    )}
                </label>
                {availableMembers.length > 0 && (
                    <div className="flex gap-2">
                        <button type="button" onClick={selectAllMembers}
                            className="text-[11px] font-bold text-primary hover:text-primary-light transition-colors">
                            تحديد الكل
                        </button>
                        {selectedMembers.length > 0 && (
                            <button type="button" onClick={clearMembers}
                                className="text-[11px] font-bold text-danger hover:text-danger/80 transition-colors">
                                إلغاء الكل
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Member chips list */}
            {!selectedTeam ? (
                <p className="text-xs text-text-muted text-center py-3 bg-surface/40 rounded-xl border border-border/30">
                    اختر الفريق أولاً
                </p>
            ) : availableMembers.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-3 bg-surface/40 rounded-xl border border-border/30">
                    لا يوجد أعضاء في هذا الفريق
                </p>
            ) : (
                <div className="max-h-60 overflow-y-auto overscroll-contain space-y-1 border border-border/40 rounded-xl p-2 bg-surface/30">
                    {availableMembers.map(member => {
                        const isSelected = selectedMemberKeys.includes(member.key);
                        return (
                            <div
                                key={member.key}
                                onClick={() => toggleMember(member.key)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-right cursor-pointer ${isSelected
                                    ? 'bg-accent/15 border border-accent/40 text-accent-light'
                                    : 'hover:bg-surface/60 border border-transparent text-text-secondary'
                                    }`}
                            >
                                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${isSelected ? 'bg-accent border-accent' : 'border-border'
                                    }`}>
                                    {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                                    {(member.name || '؟').charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setMemberDetails({
                                                memberKey: member.key,
                                                memberUserId: member.userId,
                                                memberName: member.name,
                                                name: member.name,
                                                teamId: member.teamId,
                                                teamName: getSelectedTeam()?.name || teams.find(team => team.id === member.teamId)?.name || 'فريق غير معروف',
                                                stageId: getSelectedTeam()?.stageId || teams.find(team => team.id === member.teamId)?.stageId || null,
                                            });
                                        }}
                                        className="text-xs font-bold truncate text-right hover:text-primary-light transition-colors"
                                    >
                                        {member.name}
                                    </button>
                                    {member.source === 'team_list' && (
                                        <span className="text-[9px] text-text-muted shrink-0">قائمة</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Selected chips */}
            {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selectedMembers.map(m => (
                        <span key={m.key}
                            className="flex items-center gap-1 text-[11px] font-bold bg-accent/15 text-accent border border-accent/30 px-2 py-0.5 rounded-full max-w-full">
                            <button
                                type="button"
                                onClick={() => setMemberDetails({
                                    memberKey: m.key,
                                    memberUserId: m.userId,
                                    memberName: m.name,
                                    name: m.name,
                                    teamId: m.teamId,
                                    teamName: getSelectedTeam()?.name || teams.find(team => team.id === m.teamId)?.name || 'فريق غير معروف',
                                    stageId: getSelectedTeam()?.stageId || teams.find(team => team.id === m.teamId)?.stageId || null,
                                })}
                                className="hover:text-primary-light transition-colors truncate max-w-[120px]"
                            >
                                {m.name}
                            </button>
                            <button type="button" onClick={() => toggleMember(m.key)}
                                className="hover:text-danger transition-colors">
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
