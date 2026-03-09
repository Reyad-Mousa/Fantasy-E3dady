import { createContext, useContext, useEffect, useState } from 'react';
import {
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';

export type Role = 'super_admin' | 'admin' | 'leader' | 'member';

export interface User {
  uid: string;
  email: string | null;
  role: Role;
  name: string;
  teamId?: string | null;
  stageId?: string | null;
  stageName?: string | null;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getAuthToken: () => Promise<string | null>;
  isLoading: boolean;
  isShellReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const VALID_ROLES: Role[] = ['super_admin', 'admin', 'leader', 'member'];

const parseRole = (value: unknown): Role | null => {
  if (typeof value === 'string' && VALID_ROLES.includes(value as Role)) {
    return value as Role;
  }
  return null;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

interface ClaimsProfile {
  role: Role | null;
  teamId: string | null;
  stageId: string | null;
  stageName: string | null;
}

interface UserResolution {
  user: User | null;
  hadFetchFailure: boolean;
}

const USER_CACHE_KEY = 'fantasy_e3dady_user_cache';
const USER_CACHE_MAX_AGE_MS = 1000 * 60 * 30;

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const saveCachedUser = (user: User) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ user, savedAt: Date.now() }));
  } catch {
    // Ignore storage errors and keep auth flow running.
  }
};

const clearCachedUser = () => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // Ignore storage errors and keep auth flow running.
  }
};

const readCachedUser = (uid: string): User | null => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { user?: User; savedAt?: number } | null;
    if (!parsed?.user || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > USER_CACHE_MAX_AGE_MS) return null;
    if (parsed.user.uid !== uid) return null;

    const role = parseRole(parsed.user.role);
    if (!role) return null;

    return {
      ...parsed.user,
      role,
      stageId: asNonEmptyString(parsed.user.stageId),
      stageName: asNonEmptyString(parsed.user.stageName),
      teamId: asNonEmptyString(parsed.user.teamId),
    };
  } catch {
    return null;
  }
};

const readClaimsProfile = async (firebaseUser: FirebaseUser, forceRefresh = false): Promise<ClaimsProfile> => {
  const tokenResult = await getIdTokenResult(firebaseUser, forceRefresh);
  return {
    role: parseRole(tokenResult.claims.role),
    teamId: asNonEmptyString(tokenResult.claims.teamId),
    stageId: asNonEmptyString(tokenResult.claims.stageId),
    stageName: asNonEmptyString(tokenResult.claims.stageName),
  };
};

/**
 * Resolve the user's role. Priority:
 * 1. Firebase Auth custom claims (if set via Admin SDK)
 * 2. Firestore /users/{uid}.role (fallback — always works)
 */
const resolveAppUser = async (firebaseUser: FirebaseUser): Promise<UserResolution> => {
  let hadFetchFailure = false;
  let claimsProfile: ClaimsProfile = {
    role: null,
    teamId: null,
    stageId: null,
    stageName: null,
  };
  let userDocData: Record<string, unknown> | null = null;
  let displayName = firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'مستخدم';

  // 1. Try custom claims first
  try {
    claimsProfile = await readClaimsProfile(firebaseUser);
    const stageScopedRole = claimsProfile.role === 'admin' || claimsProfile.role === 'leader';

    // Refresh stale token once for stage-scoped roles when stage claim is missing.
    if (stageScopedRole && !claimsProfile.stageId) {
      claimsProfile = await readClaimsProfile(firebaseUser, true);
    }
  } catch {
    hadFetchFailure = true;
    // claims not available
  }

  // 2. Read from Firestore and use as fallback for missing claim fields
  try {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      userDocData = userDoc.data() as Record<string, unknown>;
      const nameFromDoc = asNonEmptyString(userDocData.name);
      if (nameFromDoc) displayName = nameFromDoc;
    }
  } catch (err) {
    hadFetchFailure = true;
    console.warn('Failed to fetch user doc from Firestore:', err);
  }

  const role = claimsProfile.role ?? parseRole(userDocData?.role);
  if (!role) {
    return { user: null, hadFetchFailure };
  }

  const teamId = claimsProfile.teamId ?? asNonEmptyString(userDocData?.teamId);
  let stageId = claimsProfile.stageId ?? asNonEmptyString(userDocData?.stageId);
  const stageName = claimsProfile.stageName ?? asNonEmptyString(userDocData?.stageName);

  if (!stageId && teamId) {
    try {
      const teamDoc = await getDoc(doc(db, 'teams', teamId));
      if (teamDoc.exists()) {
        stageId = asNonEmptyString(teamDoc.data().stageId);
      }
    } catch (err) {
      hadFetchFailure = true;
      console.warn('Failed to infer stageId from team doc:', err);
    }
  }

  return {
    user: {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      role,
      name: displayName,
      teamId,
      stageId,
      stageName,
    },
    hadFetchFailure,
  };
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isShellReady, setIsShellReady] = useState(false);

  useEffect(() => {
    setIsShellReady(true);
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        clearCachedUser();
        setIsLoading(false);
        return;
      }

      try {
        const { user: resolvedUser, hadFetchFailure } = await resolveAppUser(firebaseUser);

        if (resolvedUser) {
          setUser(resolvedUser);
          saveCachedUser(resolvedUser);
        } else {
          const cached = hadFetchFailure ? readCachedUser(firebaseUser.uid) : null;
          if (cached) {
            setUser(cached);
          } else if (hadFetchFailure) {
            setUser((prev) => (prev?.uid === firebaseUser.uid ? prev : null));
          } else {
            // No valid role after successful checks: treat as unauthorized session.
            await signOut(auth);
            setUser(null);
          }
        }
      } catch {
        const cached = readCachedUser(firebaseUser.uid);
        setUser((prev) => cached ?? (prev?.uid === firebaseUser.uid ? prev : null));
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const { user: mappedUser } = await resolveAppUser(credential.user);

    if (!mappedUser) {
      await signOut(auth);
      throw new Error('ليس لديك صلاحية الدخول');
    }

    setUser(mappedUser);
    saveCachedUser(mappedUser);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    clearCachedUser();
  };

  const getAuthToken = async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, getAuthToken, isLoading, isShellReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Role permission helpers
export function canCreateTasks(role: Role): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'leader';
}

export function canCreateTeams(role: Role): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'leader';
}

export function canManageAllTeams(role: Role): boolean {
  return role === 'super_admin' || role === 'admin';
}

export function canRegisterScores(role: Role): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'leader';
}

export function canManageMembers(role: Role): boolean {
  return role === 'super_admin' || role === 'admin';
}

export function canViewAllTeams(role: Role): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'member';
}

export function canExportReports(role: Role): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'leader';
}

export function canManageUsers(role: Role): boolean {
  return role === 'super_admin';
}
