import { useState, useEffect } from 'react';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from './ui/SharedUI';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Lock, Save, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

interface ProfileSettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ProfileSettings({ isOpen, onClose }: ProfileSettingsProps) {
    const { user } = useAuth();
    const { showToast } = useToast();

    // Name
    const [newName, setNewName] = useState(user?.name || '');
    const [savingName, setSavingName] = useState(false);

    useEffect(() => {
        if (user?.name) {
            setNewName(user.name);
        }
    }, [user?.name]);

    // Password
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);
    const [showCurrentPw, setShowCurrentPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);

    const [activeSection, setActiveSection] = useState<'name' | 'password'>('name');

    const handleUpdateName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim() || !auth.currentUser) return;

        setSavingName(true);
        try {
            // Update Firebase Auth profile
            await updateProfile(auth.currentUser, { displayName: newName.trim() });

            // Update Firestore user doc
            await setDoc(doc(db, 'users', auth.currentUser.uid), {
                name: newName.trim(),
            }, { merge: true });

            showToast('تم تحديث الاسم بنجاح ✅');

            // Force reload to update context
            setTimeout(() => window.location.reload(), 800);
        } catch (err: any) {
            console.error('Name update error:', err);
            showToast('فشل في تحديث الاسم', 'error');
        } finally {
            setSavingName(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth.currentUser || !auth.currentUser.email) return;

        if (newPassword.length < 6) {
            showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showToast('كلمة المرور الجديدة غير متطابقة', 'error');
            return;
        }

        setSavingPassword(true);
        try {
            // Re-authenticate first
            const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);

            // Update password
            await updatePassword(auth.currentUser, newPassword);

            showToast('تم تحديث كلمة المرور بنجاح ✅');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            console.error('Password update error:', err);
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                showToast('كلمة المرور الحالية غير صحيحة', 'error');
            } else if (err.code === 'auth/weak-password') {
                showToast('كلمة المرور ضعيفة جداً', 'error');
            } else {
                showToast('فشل في تحديث كلمة المرور', 'error');
            }
        } finally {
            setSavingPassword(false);
        }
    };

    const getRoleLabel = (role: string) => {
        const labels: Record<string, string> = {
            super_admin: 'مشرف عام',
            admin: 'مشرف',
            leader: 'قائد',
            member: 'عضو',
        };
        return labels[role] || role;
    };

    if (!user) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="modal-backdrop" onClick={onClose}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="glass-card p-0 max-w-md w-full overflow-hidden"
                        dir="rtl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="gradient-primary p-6 text-center relative">
                            <button
                                onClick={onClose}
                                className="absolute top-4 left-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                            >
                                <X className="w-4 h-4 text-white" />
                            </button>

                            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-3">
                                <span className="text-3xl font-black text-white">{user.name.charAt(0)}</span>
                            </div>
                            <h3 className="text-lg font-bold text-white">{user.name}</h3>
                            <p className="text-white/70 text-xs mt-1">{user.email}</p>
                            <span className="inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full bg-white/20 text-white">
                                {getRoleLabel(user.role)}
                            </span>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-border">
                            <button
                                onClick={() => setActiveSection('name')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-colors ${activeSection === 'name'
                                    ? 'text-primary border-b-2 border-primary'
                                    : 'text-text-muted hover:text-text-secondary'
                                    }`}
                            >
                                <User className="w-4 h-4" />
                                تغيير الاسم
                            </button>
                            <button
                                onClick={() => setActiveSection('password')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-colors ${activeSection === 'password'
                                    ? 'text-primary border-b-2 border-primary'
                                    : 'text-text-muted hover:text-text-secondary'
                                    }`}
                            >
                                <Lock className="w-4 h-4" />
                                تغيير الباسورد
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            {activeSection === 'name' && (
                                <motion.form
                                    key="name"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    onSubmit={handleUpdateName}
                                    className="space-y-4"
                                >
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">الاسم الجديد</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                required
                                                value={newName}
                                                onChange={e => setNewName(e.target.value)}
                                                className="input-field pr-10"
                                                placeholder="أدخل اسمك الجديد"
                                            />
                                            <User className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={savingName || newName.trim() === user.name}
                                        className="btn btn-primary w-full py-3 disabled:opacity-50"
                                    >
                                        {savingName ? (
                                            <div className="spinner w-5 h-5" />
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" />
                                                حفظ الاسم
                                            </>
                                        )}
                                    </button>
                                </motion.form>
                            )}

                            {activeSection === 'password' && (
                                <motion.form
                                    key="password"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    onSubmit={handleUpdatePassword}
                                    className="space-y-4"
                                >
                                    {/* Current Password */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">كلمة المرور الحالية</label>
                                        <div className="relative">
                                            <input
                                                type={showCurrentPw ? 'text' : 'password'}
                                                required
                                                value={currentPassword}
                                                onChange={e => setCurrentPassword(e.target.value)}
                                                className="input-field pr-10 pl-10"
                                                placeholder="أدخل كلمة المرور الحالية"
                                            />
                                            <Lock className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrentPw(!showCurrentPw)}
                                                className="absolute top-1/2 left-3 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                                            >
                                                {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* New Password */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">كلمة المرور الجديدة</label>
                                        <div className="relative">
                                            <input
                                                type={showNewPw ? 'text' : 'password'}
                                                required
                                                minLength={6}
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                className="input-field pr-10 pl-10"
                                                placeholder="6 أحرف على الأقل"
                                            />
                                            <Lock className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewPw(!showNewPw)}
                                                className="absolute top-1/2 left-3 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                                            >
                                                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        {newPassword.length > 0 && newPassword.length < 6 && (
                                            <p className="text-xs text-danger flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                يجب أن تكون 6 أحرف على الأقل
                                            </p>
                                        )}
                                    </div>

                                    {/* Confirm Password */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-text-secondary">تأكيد كلمة المرور</label>
                                        <div className="relative">
                                            <input
                                                type="password"
                                                required
                                                value={confirmPassword}
                                                onChange={e => setConfirmPassword(e.target.value)}
                                                className="input-field pr-10"
                                                placeholder="أعد إدخال كلمة المرور الجديدة"
                                            />
                                            <Lock className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                        </div>
                                        {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                                            <p className="text-xs text-danger flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                كلمة المرور غير متطابقة
                                            </p>
                                        )}
                                        {confirmPassword.length > 0 && newPassword === confirmPassword && newPassword.length >= 6 && (
                                            <p className="text-xs text-success flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" />
                                                كلمة المرور متطابقة
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={savingPassword || !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                                        className="btn btn-primary w-full py-3 disabled:opacity-50"
                                    >
                                        {savingPassword ? (
                                            <div className="spinner w-5 h-5" />
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" />
                                                تحديث كلمة المرور
                                            </>
                                        )}
                                    </button>
                                </motion.form>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
