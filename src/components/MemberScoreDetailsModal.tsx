import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock3, Star, UserRound, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import StageBadge from './StageBadge';
import { useOnlineStatus } from './ui/SharedUI';
import {
    getMemberScoreHistory,
    type MemberScoreHistoryItem,
    type MemberScoreHistoryTarget,
} from '@/services/memberScoreHistory';

export interface MemberDetailsTarget extends MemberScoreHistoryTarget {
    name: string;
    teamName?: string | null;
    stageId?: string | null;
    totalPoints?: number | null;
}

interface MemberScoreDetailsModalProps {
    member: MemberDetailsTarget | null;
    onClose: () => void;
    stageScope?: string | null;
}

function toEventDate(value: unknown): Date {
    if (!value) return new Date(0);
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate();
    }
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
    }
    return new Date(0);
}

export default function MemberScoreDetailsModal({
    member,
    onClose,
    stageScope = null,
}: MemberScoreDetailsModalProps) {
    const online = useOnlineStatus();
    const [items, setItems] = useState<MemberScoreHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!member) {
            setItems([]);
            setHasError(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setHasError(false);
        getMemberScoreHistory({
            target: member,
            stageId: stageScope,
            online,
        }).then((history) => {
            if (!cancelled) {
                setItems(history);
                setHasError(false);
            }
        }).catch((err) => {
            console.error('Member score history failed:', err);
            if (!cancelled) {
                setItems([]);
                setHasError(true);
            }
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });

        return () => { cancelled = true; };
    }, [member, online, stageScope]);

    return (
        <AnimatePresence>
            {member && (
                <div className="modal-backdrop" onClick={onClose}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 16 }}
                        className="glass-card p-0 max-w-lg w-full overflow-hidden"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-primary/5">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary-light flex items-center justify-center shrink-0">
                                    <UserRound className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-text-primary truncate">{member.name}</h3>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        {member.stageId && <StageBadge stageId={member.stageId} size="sm" />}
                                        {member.teamName && (
                                            <span className="text-xs text-text-muted">{member.teamName}</span>
                                        )}
                                        {typeof member.totalPoints === 'number' && (
                                            <span className="text-xs font-bold text-accent">إجمالي: {Math.round(member.totalPoints)} نقطة</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-surface rounded-xl transition-colors"
                            >
                                <X className="w-5 h-5 text-text-muted" />
                            </button>
                        </div>

                        <div className="p-4 max-h-[60vh] overflow-y-auto">
                            {loading ? (
                                <div className="py-10 text-center">
                                    <div className="spinner mx-auto mb-3 !w-6 !h-6" />
                                    <p className="text-sm text-text-secondary font-bold">جاري تحميل تفاصيل النقاط...</p>
                                </div>
                            ) : hasError ? (
                                <div className="py-10 text-center">
                                    <div className="text-4xl mb-3">⚠️</div>
                                    <p className="text-sm text-text-secondary font-bold">تعذر تحميل سجل النقاط الآن</p>
                                </div>
                            ) : items.length === 0 ? (
                                <div className="py-10 text-center">
                                    <div className="text-4xl mb-3">📄</div>
                                    <p className="text-sm text-text-secondary font-bold">لا توجد سجلات نقاط لهذا العضو</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {items.map((item) => {
                                        const isEarn = item.type === 'earn';
                                        const eventDate = toEventDate(item.timestamp);
                                        const timeAgo = eventDate.getTime() > 0
                                            ? formatDistanceToNow(eventDate, { addSuffix: true, locale: ar })
                                            : 'الآن';

                                        return (
                                            <div
                                                key={item.id}
                                                className="rounded-2xl border border-border/50 bg-surface/40 p-3 flex items-start gap-3"
                                            >
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isEarn ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                                                    <span className="font-black">{isEarn ? '+' : '-'}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-text-primary truncate">{item.taskTitle}</p>
                                                            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-text-muted">
                                                                <span className="inline-flex items-center gap-1">
                                                                    <Clock3 className="w-3 h-3" />
                                                                    {timeAgo}
                                                                </span>
                                                                {item.actorName && (
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <Star className="w-3 h-3" />
                                                                        {item.actorName}
                                                                    </span>
                                                                )}
                                                                {item.pending && (
                                                                    <span className="text-warning font-bold">بانتظار المزامنة</span>
                                                                )}
                                                            </div>
                                                            {item.customNote && (
                                                                <p className="text-xs text-text-secondary mt-2">{item.customNote}</p>
                                                            )}
                                                        </div>
                                                        <div className={`font-black shrink-0 ${isEarn ? 'text-success' : 'text-danger'}`}>
                                                            {isEarn ? '+' : '-'}{item.points}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
