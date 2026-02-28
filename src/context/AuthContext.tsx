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

/**
 * Resolve the user's role. Priority:
 * 1. Firebase Auth custom claims (if set via Admin SDK)
 * 2. Firestore /users/{uid}.role (fallback — always works)
 */
const toAppUser = async (firebaseUser: FirebaseUser): Promise<User | null> => {
  let role: Role | null = null;
  let teamId: string | null = null;
  let stageId: string | null = null;
  let stageName: string | null = null;
  let displayName = firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'مستخدم';

  // 1. Try custom claims first
  try {
    const tokenResult = await getIdTokenResult(firebaseUser);
    role = parseRole(tokenResult.claims.role);
    teamId = (tokenResult.claims.teamId as string) ?? null;
    stageId = (tokenResult.claims.stageId as string) ?? null;
    stageName = (tokenResult.claims.stageName as string) ?? null;
  } catch {
    // claims not available
  }

  // 2. Fallback: read from Firestore
  if (!role) {
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        role = parseRole(data.role);
        teamId = data.teamId ?? null;
        stageId = data.stageId ?? null;
        stageName = data.stageName ?? null;
        if (data.name) displayName = data.name;
      }
    } catch (err) {
      console.warn('Failed to fetch user doc from Firestore:', err);
    }
  }

  if (!role) {
    return null;
  }

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
  return role === 'super_admin';
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
