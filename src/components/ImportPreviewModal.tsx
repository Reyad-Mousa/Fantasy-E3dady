import React from 'react';
import { motion } from 'motion/react';
import { X, Users, Trophy, AlertTriangle, UserPlus, ArrowRight } from 'lucide-react';
import { ImportPreviewData } from '@/hooks/useExcelImport';

interface ImportPreviewModalProps {
    data: ImportPreviewData;
    onConfirm: () => void;
    onCancel: () => void;
    isImporting: boolean;
}

export default function ImportPreviewModal({ data, onConfirm, onCancel, isImporting }: ImportPreviewModalProps) {
    const totalChanges = data.newTeams.length + data.newMembers.length + data.pointUpdates.length;

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
                    {data.newTeams.length > 0 && (
                        <div className="bg-surface/50 border border-success/20 rounded-2xl p-4">
                            <h4 className="font-bold text-success flex items-center gap-2 mb-3">
                                <Users className="w-4 h-4" />
                                فرق جديدة سيتم إنشاؤها ({data.newTeams.length})
                            </h4>
                            <div className="flex flex-wrap gap-2 text-sm">
                                {data.newTeams.map((t, idx) => (
                                    <span key={idx} className="bg-success/10 text-success-light px-2.5 py-1 rounded-lg font-bold border border-success/20">
                                        {t.name}
                                    </span>
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
                        disabled={isImporting || totalChanges === 0}
                        className="btn btn-warning flex-1 py-3 disabled:opacity-50"
                    >
                        {isImporting ? <div className="spinner !w-5 !h-5 border-2 border-black/20 border-t-black" /> : 'تأكيد وحفظ'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
