import { useState, useEffect, useCallback, createContext, useContext } from 'react';

// =========================
// Toast System
// =========================
interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning';
}

interface ToastContextType {
    showToast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => { } });

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2">
                {toasts.map(toast => (
                    <div key={toast.id} className={`toast toast-${toast.type}`}>
                        {toast.type === 'success' && '✅'}
                        {toast.type === 'error' && '❌'}
                        {toast.type === 'warning' && '⚠️'}
                        {toast.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// =========================
// Online Status Hook
// =========================
export function useOnlineStatus() {
    const [online, setOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return online;
}

// =========================
// Online Status Bar
// =========================
export function OnlineStatusBar() {
    const online = useOnlineStatus();
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!online) {
            setShow(true);
        } else {
            const timer = setTimeout(() => setShow(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [online]);

    if (!show && online) return null;

    return (
        <div className={`online-indicator ${online ? 'online' : 'offline'}`}>
            {online ? '✅ تم استعادة الاتصال' : '⚠️ أنت غير متصل بالإنترنت — البيانات تُحفظ محلياً'}
        </div>
    );
}

// =========================
// Loading Spinner
// =========================
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
    const sizeMap = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
    return (
        <div className="flex items-center justify-center p-8">
            <div className={`spinner ${sizeMap[size]}`} />
        </div>
    );
}

// =========================
// Full Page Loading
// =========================
export function FullPageLoading() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-bg">
            <div className="text-center space-y-4">
                <div className="spinner mx-auto" />
                <p className="text-text-secondary font-bold text-sm">جاري التحميل...</p>
            </div>
        </div>
    );
}

// =========================
// Empty State
// =========================
export function EmptyState({ icon, title, description }: { icon: string; title: string; description?: string }) {
    return (
        <div className="text-center py-16 px-4">
            <div className="text-5xl mb-4">{icon}</div>
            <h3 className="text-xl font-bold text-text-primary mb-2">{title}</h3>
            {description && <p className="text-text-secondary text-sm">{description}</p>}
        </div>
    );
}

// =========================
// Confirm Modal
// =========================
interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'primary';
}

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'تأكيد', cancelText = 'إلغاء', variant = 'primary' }: ConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" onClick={onCancel}>
            <div className="glass-card p-6 max-w-sm w-full animate-slide-up" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-text-primary mb-2">{title}</h3>
                <p className="text-text-secondary text-sm mb-6">{message}</p>
                <div className="flex gap-3">
                    <button onClick={onConfirm} className={`btn flex-1 ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}>
                        {confirmText}
                    </button>
                    <button onClick={onCancel} className="btn btn-ghost flex-1">
                        {cancelText}
                    </button>
                </div>
            </div>
        </div>
    );
}

// =========================
// Sync Status Badge
// =========================
export function SyncBadge({ count }: { count: number }) {
    if (count === 0) return null;
    return (
        <span className="badge badge-pending">
            ⚠️ {count} في انتظار المزامنة
        </span>
    );
}

// =========================
// Stats Card
// =========================
interface StatsCardProps {
    icon: string;
    label: string;
    value: string | number;
    trend?: 'up' | 'down' | 'neutral';
    color?: 'primary' | 'accent' | 'success' | 'danger';
}

export function StatsCard({ icon, label, value, color = 'primary' }: StatsCardProps) {
    const colorMap = {
        primary: 'from-primary/20 to-primary/5 border-primary/20',
        accent: 'from-accent/20 to-accent/5 border-accent/20',
        success: 'from-success/20 to-success/5 border-success/20',
        danger: 'from-danger/20 to-danger/5 border-danger/20',
    };

    return (
        <div className={`glass-card glass-card-hover p-5 bg-gradient-to-br ${colorMap[color]}`}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-text-secondary text-xs font-bold uppercase tracking-wider">{label}</p>
                    <p className="text-2xl font-black text-text-primary mt-1">{value}</p>
                </div>
                <div className="text-3xl">{icon}</div>
            </div>
        </div>
    );
}

// =========================
// SectionHeader
// =========================
export function SectionHeader({ title, subtitle, action, onBack }: { title: string; subtitle?: string; action?: React.ReactNode; onBack?: () => void }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="p-2.5 rounded-xl bg-surface/50 hover:bg-surface text-text-muted hover:text-text-primary transition-colors flex items-center justify-center shrink-0 border border-border/50 shadow-sm"
                        title="رجوع"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                )}
                <div className="min-w-0">
                    <h2 className="text-xl sm:text-2xl font-black text-text-primary truncate">{title}</h2>
                    {subtitle && <p className="text-text-secondary text-xs sm:text-sm mt-0.5 truncate">{subtitle}</p>}
                </div>
            </div>
            {action && <div className="flex items-center gap-2 self-end sm:self-auto">{action}</div>}
        </div>
    );
}
