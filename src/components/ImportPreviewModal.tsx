import React from 'react';
import { motion } from 'motion/react';
import { X, Users, Trophy, AlertTriangle, UserPlus, ArrowRight } from 'lucide-react';
import { ImportPreviewData } from '@/hooks/useExcelImport';
import { STAGES_LIST } from '@/config/stages';

interface ImportPreviewModalProps {
    data: ImportPreviewData;
    onConfirm: () => void;
    onCancel: () => void;
    isImporting: boolean;
    removeMissingMembers: boolean;
    onToggleRemoveMissingMembers: (value: boolean) => void;
    onUpdateTeamStage: (teamId: string, stageId: string) => void;
    stageOptions?: { id: string; name: string; }[];
}

export default function ImportPreviewModal({ data, onConfirm, onCancel, isImporting, removeMissingMembers, onToggleRemoveMissingMembers, onUpdateTeamStage, stageOptions }: ImportPreviewModalProps) {
    const totalChanges = data.newTeams.length + data.newMembers.length + data.memberMoves.length + data.memberRemovals.length + data.pointUpdates.length;
    const missingStage = data.newTeams.some(t => !t.stageId || !t.stageId.trim());
    const options = stageOptions && stageOptions.length > 0 ? stageOptions : STAGES_LIST;

    return (
        <div className="modal-backdrop" onClick={!isImporting ? onCancel : undefined}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="glass-card max-w-lg w-full flex flex-col max-h-[90vh] overflow-hidden relative"
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-warning to-primary opacity-80" />

                <div className="p-6 md:p-8 shrink-0 flex items-center justify-between border-b border-border/30">
                    <div>
                        <h3 className="text-xl font-black text-white flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-warning" />
                            مراجعة الاستيراد
                        </h3>
                        <p className="text-text-secondary text-sm font-bold mt-1">راجع التغييرات المكتشفة قبل التطبيق النهائي</p>
                    </div>
                    <button onClick={onCancel} disabled={isImporting} className="p-2 hover:bg-white/5 rounded-xl transition-colors disabled:opacity-50">
                        <X className="w-5 h-5 text-text-muted" />
                    </button>
                </div>

                <div className="p-6 md:p-8 overflow-y-auto space-y-6" dir="rtl">
                    <div className="bg-black/20 border border-border/30 rounded-2xl p-3 text-xs text-text-muted leading-relaxed">
                        هذا الاستيراد يعتمد على الملف كمصدر الحقيقة. تغيير الاسم يُعامل كحذف + إضافة. نقاط الفريق تُحسب من نقاط الأعضاء فقط ولا تُقرأ من عمود "إجمالي النقاط".
                    </div>
                    <div className="flex items-center justify-between gap-4 bg-surface/40 border border-border/30 rounded-2xl p-3">
                        <label className="flex items-center gap-2 text-sm text-text-muted">
                            <input
                                type="checkbox"
                                checked={removeMissingMembers}
                                onChange={e => onToggleRemoveMissingMembers(e.target.checked)}
                                className="h-4 w-4 rounded border-border bg-black/10 text-primary focus:ring-primary"
                            />
                            <span className="font-bold">حذف الأعضاء غير الموجودين في الملف</span>
                        </label>
                        <span className="text-[11px] text-text-muted">سيتم ترك الأعضاء في مجموعاتهم القديمة إذا تم إيقاف هذا الخيار.</span>
                    </div>

                    {data.newTeams.length > 0 && (
                        <div className="bg-surface/50 border border-success/20 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center gap-2 justify-between flex-wrap">
                                <h4 className="font-bold text-success flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    فرق جديدة سيتم إنشاؤها ({data.newTeams.length})
                                </h4>
                                {missingStage && (
                                    <span className="text-warning text-xs font-bold">يجب اختيار مرحلة لكل فريق جديد</span>
                                )}
                            </div>
                            <div className="space-y-2">
                                {data.newTeams.map((t) => (
                                    <div key={t.id} className="flex flex-col sm:flex-row gap-2 sm:items-center bg-black/20 p-3 rounded-xl border border-success/20">
                                        <div className="font-bold text-success min-w-0">{t.name}</div>
                                        <div className="flex-1 flex items-center gap-2">
                                            <label className="text-xs text-text-muted whitespace-nowrap">المرحلة:</label>
                                            <select
                                                className={`select-field !py-1 !h-9 flex-1 ${(!t.stageId && missingStage) ? 'border-warning/60' : ''}`}
                                                value={t.stageId}
                                                onChange={e => onUpdateTeamStage(t.id, e.target.value)}
                                            >
                                                <option value="">اختر المرحلة</option>
                                                {options.map(stage => (
                                                    <option key={stage.id} value={stage.id}>{stage.name}</option>
                                                ))}
                                            </select>
                                            {t.suggestedStageId && !t.stageId && (
                                                <button
                                                    type="button"
                                                    className="text-[11px] px-2 py-1 rounded-lg bg-primary/15 text-primary border border-primary/30"
                                                    onClick={() => onUpdateTeamStage(t.id, t.suggestedStageId || '')}
                                                >
                                                    استخدام {STAGES_LIST.find(s => s.id === t.suggestedStageId)?.name || 'المقترحة'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {data.newMembers.length > 0 && (
                        <div className="bg-surface/50 border border-info/20 rounded-2xl p-4">
                            <h4 className="font-bold text-info flex items-center gap-2 mb-3">
                                <UserPlus className="w-4 h-4" />
                                أعضاء جدد سيتم إضافتهم ({data.newMembers.length})
                            </h4>
                            <div className="flex flex-wrap gap-2 text-sm">
                                {data.newMembers.map((m, idx) => (
                                    <span key={idx} className="bg-info/10 text-info-light px-2.5 py-1 rounded-lg font-bold border border-info/20">
                                        {m.memberName} <span className="text-white/30 truncate mx-1">في</span> {m.teamName}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {data.memberMoves.length > 0 && (
                        <div className="bg-surface/50 border border-warning/20 rounded-2xl p-4">
                            <h4 className="font-bold text-warning flex items-center gap-2 mb-3">
                                <ArrowRight className="w-4 h-4" />
                                أعضاء سيتم نقلهم ({data.memberMoves.length})
                            </h4>
                            <div className="flex flex-wrap gap-2 text-sm">
                                {data.memberMoves.map((m, idx) => (
                                    <span key={idx} className="bg-warning/10 text-warning-light px-2.5 py-1 rounded-lg font-bold border border-warning/20">
                                        {m.memberName} <span className="text-white/30 truncate mx-1">من</span> {m.fromTeamName} <span className="text-white/30 truncate mx-1">إلى</span> {m.toTeamName}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {data.memberRemovals.length > 0 && (
                        <div className="bg-surface/50 border border-danger/20 rounded-2xl p-4">
                            <h4 className="font-bold text-danger flex items-center gap-2 mb-3">
                                <X className="w-4 h-4" />
                                أعضاء سيتم حذفهم ({data.memberRemovals.length})
                            </h4>
                            {!removeMissingMembers && (
                                <p className="text-warning text-xs font-bold mb-3 bg-warning/10 border border-warning/20 rounded-lg p-2">
                                    ⚠️ لن تُطبق هذه الحذفيات لأن خيار "حذف الأعضاء غير الموجودين في الملف" معطل.
                                </p>
                            )}
                            <div className="flex flex-wrap gap-2 text-sm">
                                {data.memberRemovals.map((m, idx) => (
                                    <span key={idx} className="bg-danger/10 text-danger-light px-2.5 py-1 rounded-lg font-bold border border-danger/20">
                                        {m.memberName} <span className="text-white/30 truncate mx-1">من</span> {m.fromTeamName}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {data.pointUpdates.length > 0 && (
                        <div className="bg-surface/50 border border-warning/20 rounded-2xl p-4">
                            <h4 className="font-bold text-warning flex items-center gap-2 mb-3">
                                <Trophy className="w-4 h-4" />
                                أعضاء سيتم تحديث نقاطهم ({data.pointUpdates.length})
                            </h4>
                            <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                                {data.pointUpdates.map((p, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-sm bg-black/20 p-2 rounded-xl border border-white/5">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-bold text-white truncate">{p.memberName}</div>
                                            <div className="text-[10px] text-text-muted truncate">{p.teamName}</div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 font-black" dir="ltr">
                                            <span className="text-text-muted line-through">{p.oldPoints}</span>
                                            <ArrowRight className="w-3 h-3 text-text-muted" />
                                            <span className={p.delta > 0 ? 'text-success' : 'text-danger'}>{p.newPoints}</span>
                                            <span className={`text-[10px] ${p.delta > 0 ? 'text-success-light bg-success/20' : 'text-danger-light bg-danger/20'} px-1.5 py-0.5 rounded ml-1`}>
                                                {p.delta > 0 ? '+' : ''}{p.delta}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {totalChanges === 0 && (
                        <div className="text-center py-8 text-text-muted">
                            <p className="font-bold">لم يتم رصد أي تغييرات تحتاج للحفظ.</p>
                        </div>
                    )}
                </div>

                <div className="p-6 md:p-8 shrink-0 bg-surface/80 border-t border-border/50 flex gap-3">
                    <button
                        onClick={onCancel}
                        disabled={isImporting}
                        className="btn btn-ghost flex-1 py-3 disabled:opacity-50"
                    >
                        إلغاء
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isImporting || totalChanges === 0 || missingStage}
                        className="btn btn-warning flex-1 py-3 disabled:opacity-50"
                    >
                        {isImporting ? <div className="spinner !w-5 !h-5 border-2 border-black/20 border-t-black" /> : 'تأكيد وحفظ'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
