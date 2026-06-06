import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { isAdminRole, type StaffProfile, type StaffRole } from '../lib/roles';

const SESSION_KEY = 'alpha_gym_session';

/**
 * ⚠️ Demo-only credentials — replace with a real auth backend before production.
 */
const DEMO_USERS = [
  {
    id: '1',
    username: 'admin',
    password: 'admin123',
    full_name: 'مدیر سیستم',
    role: 'admin' as StaffRole,
  },
  {
    id: '2',
    username: 'staff',
    password: 'staff123',
    full_name: 'منشی',
    role: 'staff' as StaffRole,
  },
];

/**
 * Stored session shape
 */
interface StoredSession {
  id: string;
  username: string;
  full_name: string;
  role: StaffRole;
}

/**
 * Context type
 */
interface AuthContextType {
  user: { id: string; username?: string } | null;
  profile: StaffProfile | null;
  role: StaffRole;
  isAdmin: boolean;
  loading: boolean;

  signIn: (
    username: string,
    password: string
  ) => Promise<{ error: string | null }>;

  signUp: (
    username: string,
    password: string,
    fullName: string
  ) => Promise<{ error: string | null }>;

  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Convert session → profile
 */
function sessionToProfile(s: StoredSession): StaffProfile {
  return {
    id: s.id,
    full_name: s.full_name,
    phone: '',
    role: s.role,
    avatar_url: '',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextType['user']>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Restore session on mount
   */
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);

    if (raw) {
      try {
        const s = JSON.parse(raw) as StoredSession;
        setUser({ id: s.id, username: s.username });
        setProfile(sessionToProfile(s));
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }

    setLoading(false);
  }, []);

  /**
   * LOGIN
   */
  const signIn = async (username: string, password: string) => {
    const match = DEMO_USERS.find(
      (u) =>
        u.username.toLowerCase() === username.trim().toLowerCase() &&
        u.password === password
    );

    if (!match) {
      return { error: 'نام کاربری یا رمز عبور اشتباه است' };
    }

    const session: StoredSession = {
      id: match.id,
      username: match.username,
      full_name: match.full_name,
      role: match.role,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser({ id: session.id, username: session.username });
    setProfile(sessionToProfile(session));

    return { error: null };
  };

  /**
   * REGISTER (default role = staff)
   * FIX: check for duplicate username before creating a session
   */
  const signUp = async (
    username: string,
    password: string,
    fullName: string
  ) => {
    if (!username.trim() || !password) {
      return { error: 'نام کاربری و رمز عبور الزامی است' };
    }

    // Prevent overwriting an existing demo account with the same username
    const duplicate = DEMO_USERS.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );
    if (duplicate) {
      return { error: 'این نام کاربری قبلاً ثبت شده است' };
    }

    const session: StoredSession = {
      id: String(Date.now()),
      username: username.trim(),
      full_name: fullName.trim() || 'کاربر جدید',
      role: 'staff',
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser({ id: session.id, username: session.username });
    setProfile(sessionToProfile(session));

    return { error: null };
  };

  /**
   * LOGOUT
   */
  const signOut = async () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setProfile(null);
  };

  const role: StaffRole = profile?.role ?? 'staff';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        isAdmin: isAdminRole(role),
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook
 */
export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return ctx;
}
