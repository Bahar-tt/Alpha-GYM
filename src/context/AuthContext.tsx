import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isAdminRole, type StaffProfile, type StaffRole } from '../lib/roles';

const SESSION_KEY = 'alpha_gym_session';

const DEMO_USERS = [
  {
    id: '1',
    email: 'admin@alpha.local',
    password: 'admin123',
    full_name: 'مدیر سیستم',
    role: 'admin' as StaffRole,
  },
  {
    id: '2',
    email: 'staff@alpha.local',
    password: 'staff123',
    full_name: 'منشی',
    role: 'staff' as StaffRole,
  },
];

interface StoredSession {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
}

interface AuthContextType {
  user: { id: string; email?: string } | null;
  profile: StaffProfile | null;
  role: StaffRole;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw) as StoredSession;
        setUser({ id: s.id, email: s.email });
        setProfile(sessionToProfile(s));
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    const match = DEMO_USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
    );
    if (!match) {
      return { error: 'ایمیل یا رمز عبور اشتباه است' };
    }
    const session: StoredSession = {
      id: match.id,
      email: match.email,
      full_name: match.full_name,
      role: match.role,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser({ id: session.id, email: session.email });
    setProfile(sessionToProfile(session));
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    if (!email.trim() || !password) {
      return { error: 'ایمیل و رمز عبور الزامی است' };
    }
    const session: StoredSession = {
      id: String(Date.now()),
      email: email.trim(),
      full_name: fullName.trim() || 'کاربر جدید',
      role: 'staff',
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser({ id: session.id, email: session.email });
    setProfile(sessionToProfile(session));
    return { error: null };
  };

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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
