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
const toAppUser = async (firebaseUser: FirebaseUser): Promise<User | null> => {
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
    console.warn('Failed to fetch user doc from Firestore:', err);
  }

  const role = claimsProfile.role ?? parseRole(userDocData?.role);
  if (!role) {
    return null;
  }

  const teamId = claimsProfile.teamId ?? asNonEmptyString(userDocData?.teamId);
  const stageId = claimsProfile.stageId ?? asNonEmptyString(userDocData?.stageId);
  const stageName = claimsProfile.stageName ?? asNonEmptyString(userDocData?.stageName);

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    role,
    name: displayName,
    teamId,
    stageId,
    stageName,
  };
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const mappedUser = await toAppUser(firebaseUser);
        if (!mappedUser) {
          // No valid role found — sign out
          await signOut(auth);
          setUser(null);
        } else {
          setUser(mappedUser);
        }
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const mappedUser = await toAppUser(credential.user);

    if (!mappedUser) {
      await signOut(auth);
      throw new Error('ليس لديك صلاحية الدخول');
    }

    setUser(mappedUser);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const getAuthToken = async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, getAuthToken, isLoading }}>
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
  return role === 'super_admin' || role === 'admin';
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
  return role === 'super_admin';
}

export function canManageUsers(role: Role): boolean {
  return role === 'super_admin';
}
