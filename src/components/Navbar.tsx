import { useState, useEffect, useRef } from 'react';
import { useAuth, type Role } from '@/context/AuthContext';
import { useOnlineStatus, SyncBadge } from './ui/SharedUI';
import { getPendingSyncCount } from '@/services/offlineDb';
import ProfileSettings from './ProfileSettings';
import StageBadge from './StageBadge';
import { usePerfProfile } from '@/hooks/usePerfProfile';
import { getRoleLabel, getRoleBadgeColor } from '@/utils/helpers';
import {
  Trophy, Home, ListTodo, Users, Settings, BarChart3,
  LogOut, Menu, X, Wifi, WifiOff, ChevronDown, UserCog, User, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLoginClick: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  roles: Role[] | 'all';
}

const navItems: NavItem[] = [
  { id: 'home', label: 'الرئيسية', icon: <Home className="w-5 h-5" />, roles: 'all' },
  { id: 'leaderboard', label: 'المتصدرين', icon: <Trophy className="w-5 h-5" />, roles: 'all' },
  { id: 'tasks', label: 'المهام', icon: <ListTodo className="w-5 h-5" />, roles: 'all' },
  { id: 'teams', label: 'الفرق', icon: <Users className="w-5 h-5" />, roles: ['super_admin', 'admin', 'leader'] },
  { id: 'scores', label: 'النقاط', icon: <BarChart3 className="w-5 h-5" />, roles: ['super_admin', 'admin', 'leader'] },
  { id: 'activities', label: 'النشاطات', icon: <Activity className="w-5 h-5" />, roles: ['super_admin', 'admin', 'leader'] },
  { id: 'members', label: 'الأعضاء', icon: <Users className="w-5 h-5" />, roles: ['super_admin', 'admin'] },
  { id: 'admin', label: 'لوحة التحكم', icon: <Settings className="w-5 h-5" />, roles: ['super_admin'] },
];

// getRoleLabel and getRoleBadgeColor are now imported from @/utils/helpers

export default function Navbar({ activeTab, setActiveTab, onLoginClick }: NavbarProps) {
  const { user, logout } = useAuth();
  const online = useOnlineStatus();
  const { prefersLowMotion } = usePerfProfile();
  const animationsEnabled = !prefersLowMotion;
  const [pendingCount, setPendingCount] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      const count = await getPendingSyncCount();
      setPendingCount(count);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const filteredItems = navItems.filter(item => {
    if (!user) return item.roles === 'all';
    if (item.roles === 'all') return true;
    return item.roles.includes(user.role);
  });

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    setUserMenuOpen(false);
  };

  return (
    <>
      <nav className="sticky top-0 z-50 bg-surface-card border-b border-border/50 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-primary to-accent p-2 rounded-xl">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-black text-text-primary text-lg leading-none">Fantasy</h1>
                <p className="text-text-muted text-[10px] font-bold tracking-widest">E3DADY</p>
              </div>
            </div>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-0.5 xl:gap-1 bg-surface-card p-1 xl:p-1.5 rounded-2xl border border-border/20">
              {filteredItems.map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabClick(item.id)}
                    className={`relative flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-4 py-1.5 xl:py-2.5 rounded-xl text-[12px] xl:text-sm font-bold transition-all duration-300 ${isActive ? 'text-white' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                      }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId={animationsEnabled ? 'activeTab' : undefined}
                        className="absolute inset-0 bg-gradient-to-br from-primary to-primary-dark rounded-xl shadow-lg shadow-primary/20"
                        transition={animationsEnabled ? { type: 'spring', bounce: 0.2, duration: 0.6 } : undefined}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      {item.icon}
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Connection status */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold ${online ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                }`}>
                {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span className="hidden xl:inline">{online ? 'متصل' : 'غير متصل'}</span>
              </div>

              {user?.stageId && (
                <div className="flex">
                  <StageBadge stageId={user.stageId} size="md" />
                </div>
              )}

              <SyncBadge count={pendingCount} />

              {user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface/50 hover:bg-surface transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center text-white">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="hidden xl:block text-right">
                      <p className="text-xs font-bold text-text-primary leading-none">{user.name}</p>
                      <span className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${getRoleBadgeColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-text-muted hidden xl:block" />
                  </button>

                  <AnimatePresence>
                    {userMenuOpen && (
                      <motion.div
                        initial={animationsEnabled ? { opacity: 0, y: 10, scale: 0.95 } : false}
                        animate={animationsEnabled ? { opacity: 1, y: 0, scale: 1 } : undefined}
                        exit={animationsEnabled ? { opacity: 0, y: 10, scale: 0.95 } : undefined}
                        className="absolute left-0 top-full mt-3 w-56 bg-surface-card p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 rounded-2xl overflow-hidden"
                      >
                        <div className="relative p-4 mb-2 bg-white/5 rounded-xl border border-white/5">
                          <p className="text-sm font-black text-text-primary truncate">{user.name}</p>
                          <p className="text-[10px] text-text-muted truncate mt-0.5">{user.email}</p>
                          <div className="absolute top-2 left-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <button
                            onClick={() => { setShowProfile(true); setUserMenuOpen(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:bg-primary/10 hover:text-primary-light transition-all text-sm font-bold group"
                          >
                            <UserCog className="w-4 h-4 transition-transform group-hover:scale-110" />
                            إعدادات الحساب
                          </button>
                          <div className="h-px bg-border/30 mx-2 my-1" />
                          <button
                            onClick={() => { logout(); setUserMenuOpen(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-danger/80 hover:bg-danger/10 hover:text-danger transition-all text-sm font-bold group"
                          >
                            <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                            تسجيل الخروج
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <button onClick={onLoginClick} className="btn btn-primary text-sm py-2">
                  دخول
                </button>
              )}


            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2">
          <div className="max-w-md mx-auto bg-surface-card/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.4)] flex items-center justify-around p-2">
            {filteredItems.slice(0, 5).map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`relative flex flex-col items-center gap-1 p-2 min-w-[64px] transition-all duration-300 ${isActive ? 'text-primary' : 'text-text-muted hover:text-text-secondary'
                    }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId={animationsEnabled ? 'activeTabBottom' : undefined}
                      className="absolute inset-0 bg-primary/10 rounded-2xl"
                      transition={animationsEnabled ? { type: 'spring', bounce: 0.2, duration: 0.6 } : undefined}
                    />
                  )}
                  <div className={`relative z-10 transition-transform duration-300 ${isActive ? 'scale-110 -translate-y-0.5' : ''}`}>
                    {item.icon}
                  </div>
                  <span className="relative z-10 text-[10px] font-bold tracking-tight">
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId={animationsEnabled ? 'activeIndicator' : undefined}
                      className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary-rgb),0.6)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <ProfileSettings isOpen={showProfile} onClose={() => setShowProfile(false)} />
    </>
  );
}
