import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, OnlineStatusBar, FullPageLoading } from './components/ui/SharedUI';
import Navbar from './components/Navbar';
import LoginModal from './components/LoginModal';
import Home from './components/Home';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy } from 'lucide-react';

// Lazy-loaded pages — only downloaded when the user navigates to them
const Leaderboard = lazy(() => import('./components/Leaderboard'));
const TasksPage = lazy(() => import('./components/TasksPage'));
const ScoreRegistration = lazy(() => import('./components/ScoreRegistration'));
const MembersPage = lazy(() => import('./components/MembersPage'));
const TeamsPage = lazy(() => import('./components/TeamsPage'));
const SuperAdminPanel = lazy(() => import('./components/SuperAdminPanel'));
const RecentActivitiesPage = lazy(() => import('./components/RecentActivitiesPage'));

const VALID_TABS = ['home', 'leaderboard', 'tasks', 'teams', 'scores', 'members', 'admin', 'activities'];

function getTabFromHash(): string {
  const hash = window.location.hash.replace('#', '');
  return VALID_TABS.includes(hash) ? hash : 'home';
}

function isTabAllowed(tab: string, user: any): boolean {
  switch (tab) {
    case 'teams':
      return !!user && ['super_admin', 'admin'].includes(user.role);
    case 'scores':
      return !!user && ['super_admin', 'admin', 'leader'].includes(user.role);
    case 'members':
    case 'admin':
      return !!user && user.role === 'super_admin';
    case 'activities':
      return !!user && ['super_admin', 'admin', 'leader'].includes(user.role);
    case 'home':
    case 'leaderboard':
    case 'tasks':
    default:
      return true; // Public or broadly allowed tabs
  }
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState(getTabFromHash);
  const [showLogin, setShowLogin] = useState(false);

  const handleNavigate = useCallback((tab: string) => {
    setActiveTab(tab);
    window.location.hash = tab === 'home' ? '' : tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Sync tab when browser back/forward changes the hash
  useEffect(() => {
    const onHashChange = () => {
      let nextTab = getTabFromHash();
      // Wait for auth to finish loading before redirecting, otherwise it bounces back to home too early.
      if (!isLoading && !isTabAllowed(nextTab, user)) {
        nextTab = 'home';
        window.location.hash = ''; // Revert the hash
        // We can show a toast here if we imported useToast, but simple redirect is enough
      }
      setActiveTab(nextTab);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [user, isLoading]);

  // Initial load check and whenever user/loading state changes
  useEffect(() => {
    if (isLoading) return;
    const currentTab = getTabFromHash();
    if (!isTabAllowed(currentTab, user)) {
      handleNavigate('home');
    }
  }, [user, isLoading, handleNavigate]);

  if (isLoading) return <FullPageLoading />;

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Home onNavigate={handleNavigate} />;
      case 'leaderboard':
        return <Leaderboard onBack={() => handleNavigate('home')} />;
      case 'teams':
        return user && ['super_admin', 'admin'].includes(user.role)
          ? <TeamsPage onBack={() => handleNavigate('home')} />
          : <Home onNavigate={handleNavigate} />;
      case 'tasks':
        return <TasksPage onBack={() => handleNavigate('home')} />;
      case 'scores':
        return user && ['super_admin', 'admin', 'leader'].includes(user.role)
          ? <ScoreRegistration onBack={() => handleNavigate('home')} />
          : <Home onNavigate={handleNavigate} />;
      case 'members':
        return user?.role === 'super_admin'
          ? <MembersPage onBack={() => handleNavigate('home')} />
          : <Home onNavigate={handleNavigate} />;
      case 'admin':
        return user?.role === 'super_admin'
          ? <SuperAdminPanel onBack={() => handleNavigate('home')} />
          : <Home onNavigate={handleNavigate} />;
      case 'activities':
        return user && ['super_admin', 'admin', 'leader'].includes(user.role)
          ? <RecentActivitiesPage onBack={() => handleNavigate('home')} />
          : <Home onNavigate={handleNavigate} />;
      default:
        return <Home onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col gradient-surface" dir="rtl">
      <OnlineStatusBar />

      <Navbar
        activeTab={activeTab}
        setActiveTab={handleNavigate}
        onLoginClick={() => setShowLogin(true)}
      />

      <main
        key={activeTab}
        className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-slide-up"
      >
        <Suspense fallback={<div className="text-center py-16"><div className="spinner mx-auto mb-4" /><p className="text-text-secondary font-bold text-sm">جاري التحميل...</p></div>}>
          {renderContent()}
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 mt-auto shrink-0">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <div className="bg-gradient-to-br from-primary to-accent p-1.5 rounded-lg">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <span className="font-black text-text-primary">Fantasy E3DADY 2026</span>
          </div>
          <p className="text-text-muted text-xs">نظام إدارة المسابقات — بُني بالحب ❤️</p>
        </div>
      </footer>

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
