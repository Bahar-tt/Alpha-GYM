import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { isAdminRole, type StaffProfile, type StaffRole } from '../lib/roles';

const SESSION_KEY = 'alpha_gym_session';
const USERS_KEY   = 'alpha_gym_users';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManagedUser {
  id: string;
  username: string;
  password: string;       // plain-text – demo only, replace with hashed backend
  full_name: string;
  role: StaffRole;
  created_at: string;
}

interface StoredSession {
  id: string;
  username: string;
  full_name: string;
  role: StaffRole;
}

interface AuthContextType {
  user: { id: string; username?: string } | null;
  profile: StaffProfile | null;
  role: StaffRole;
  isAdmin: boolean;
  loading: boolean;

  signIn:  (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;

  // Admin-only user management
  users:          ManagedUser[];
  createUser:     (data: Omit<ManagedUser, 'id' | 'created_at'>) => { error: string | null };
  updateUserRole: (id: string, role: StaffRole)                   => { error: string | null };
  deleteUser:     (id: string)                                     => { error: string | null };
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

const SEED_USERS: ManagedUser[] = [
  {
    id: '1',
    username: 'admin',
    password: 'admin123',
    full_name: 'مدیر سیستم',
    role: 'admin',
    created_at: new Date().toISOString(),
  },
  {
    id: '2',
    username: 'staff',
    password: 'staff123',
    full_name: 'منشی',
    role: 'staff',
    created_at: new Date().toISOString(),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadUsers(): ManagedUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw) as ManagedUser[];
  } catch { /* ignore */ }
  localStorage.setItem(USERS_KEY, JSON.stringify(SEED_USERS));
  return SEED_USERS;
}

function saveUsers(list: ManagedUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(list));
}

function sessionToProfile(s: StoredSession): StaffProfile {
  return { id: s.id, full_name: s.full_name, phone: '', role: s.role, avatar_url: '' };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthContextType['user']>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [users,   setUsers]   = useState<ManagedUser[]>([]);

  useEffect(() => {
    setUsers(loadUsers());

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

  const signIn = async (username: string, password: string) => {
    const list  = loadUsers();
    const match = list.find(
      (u) =>
        u.username.toLowerCase() === username.trim().toLowerCase() &&
        u.password === password,
    );
    if (!match) return { error: 'نام کاربری یا رمز عبور اشتباه است' };

    const session: StoredSession = {
      id: match.id, username: match.username,
      full_name: match.full_name, role: match.role,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser({ id: session.id, username: session.username });
    setProfile(sessionToProfile(session));
    return { error: null };
  };

  const signOut = async () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setProfile(null);
  };

  const createUser = (data: Omit<ManagedUser, 'id' | 'created_at'>) => {
    const list = loadUsers();
    if (list.some((u) => u.username.toLowerCase() === data.username.trim().toLowerCase())) {
      return { error: 'این نام کاربری قبلاً ثبت شده است' };
    }
    if (!data.username.trim() || !data.password) {
      return { error: 'نام کاربری و رمز عبور الزامی است' };
    }
    const newUser: ManagedUser = {
      ...data,
      username:   data.username.trim(),
      full_name:  data.full_name.trim() || 'کاربر جدید',
      id:         String(Date.now()),
      created_at: new Date().toISOString(),
    };
    const updated = [...list, newUser];
    saveUsers(updated);
    setUsers(updated);
    return { error: null };
  };

  const updateUserRole = (id: string, role: StaffRole) => {
    const list   = loadUsers();
    const admins = list.filter((u) => u.role === 'admin');
    const target = list.find((u) => u.id === id);
    if (target?.role === 'admin' && admins.length === 1 && role !== 'admin') {
      return { error: 'حداقل یک مدیر باید در سیستم وجود داشته باشد' };
    }
    const updated = list.map((u) => (u.id === id ? { ...u, role } : u));
    saveUsers(updated);
    setUsers(updated);

    if (id === user?.id) {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}') as StoredSession;
      const next    = { ...session, role };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setProfile(sessionToProfile(next));
    }
    return { error: null };
  };

  const deleteUser = (id: string) => {
    const list   = loadUsers();
    const admins = list.filter((u) => u.role === 'admin');
    const target = list.find((u) => u.id === id);
    if (target?.role === 'admin' && admins.length === 1) {
      return { error: 'نمی‌توان تنها مدیر سیستم را حذف کرد' };
    }
    if (id === user?.id) {
      return { error: 'نمی‌توانید حساب خودتان را حذف کنید' };
    }
    const updated = list.filter((u) => u.id !== id);
    saveUsers(updated);
    setUsers(updated);
    return { error: null };
  };

  const role: StaffRole = profile?.role ?? 'staff';

  return (
    <AuthContext.Provider
      value={{
        user, profile, role,
        isAdmin: isAdminRole(role),
        loading,
        signIn, signOut,
        users, createUser, updateUserRole, deleteUser,
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