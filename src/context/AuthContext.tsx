import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiDelete, apiGet, apiPost, apiPut, getToken, setToken } from '../services/api';
import { isAdminRole, type StaffProfile, type StaffRole } from '../lib/roles';

const SESSION_KEY = 'alpha_gym_session';

export interface ManagedUser {
  id: string;
  username: string;
  full_name: string;
  role: StaffRole;
  is_active?: boolean;
  created_at?: string;
  last_login_at?: string | null;
}

interface ApiUser extends ManagedUser {
  features?: Record<string, boolean>;
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
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  users: ManagedUser[];
  createUser: (data: Omit<ManagedUser, 'id' | 'created_at'> & { password: string }) => Promise<{ error: string | null }>;
  updateUserRole: (id: string, role: StaffRole) => Promise<{ error: string | null }>;
  deleteUser: (id: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toProfile(s: StoredSession): StaffProfile {
  return { id: s.id, full_name: s.full_name, phone: '', role: s.role, avatar_url: '' };
}

function saveSession(user: ApiUser | null): void {
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  const session: StoredSession = {
    id: String(user.id), username: user.username, full_name: user.full_name, role: user.role,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function errorResult(error: string | null) { return { error: error || null }; }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextType['user']>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ManagedUser[]>([]);

  const applyUser = (apiUser: ApiUser | null) => {
    if (!apiUser) {
      setUser(null); setProfile(null); saveSession(null); return;
    }
    saveSession(apiUser);
    setUser({ id: String(apiUser.id), username: apiUser.username });
    setProfile(toProfile({ id: String(apiUser.id), username: apiUser.username, full_name: apiUser.full_name, role: apiUser.role }));
  };

  const loadUsers = async () => {
    const result = await apiGet<ApiUser[]>('/users');
    if (!result.error && Array.isArray(result.data)) setUsers(result.data);
  };

  useEffect(() => {
    let alive = true;
    const restore = async () => {
      if (!getToken()) { if (alive) setLoading(false); return; }
      const result = await apiGet<{ user: ApiUser }>('/auth/me');
      if (!alive) return;
      if (result.error || !result.data?.user) {
        setToken(null); applyUser(null);
      } else {
        applyUser(result.data.user);
        if (result.data.user.role === 'admin') void loadUsers();
      }
      setLoading(false);
    };
    void restore();
    const onUnauthorized = () => applyUser(null);
    window.addEventListener('alpha-gym-unauthorized', onUnauthorized);
    return () => { alive = false; window.removeEventListener('alpha-gym-unauthorized', onUnauthorized); };
  }, []);

  const signIn = async (username: string, password: string) => {
    const result = await apiPost<{ token: string; user: ApiUser }>('/auth/login', { username: username.trim(), password });
    if (result.error || !result.data?.token || !result.data.user) return errorResult(result.error || 'نام کاربری یا رمز عبور اشتباه است');
    setToken(result.data.token);
    applyUser(result.data.user);
    if (result.data.user.role === 'admin') void loadUsers();
    return errorResult(null);
  };

  const signOut = async () => {
    if (getToken()) await apiPost('/auth/logout', {});
    setToken(null); applyUser(null); setUsers([]);
  };

  const createUser = async (data: Omit<ManagedUser, 'id' | 'created_at'> & { password: string }) => {
    const result = await apiPost<ApiUser>('/users', data);
    if (result.error) return errorResult(result.error);
    await loadUsers();
    return errorResult(null);
  };

  const updateUserRole = async (id: string, role: StaffRole) => {
    const result = await apiPut<ApiUser>(`/users/${id}`, { role });
    if (result.error) return errorResult(result.error);
    if (String(id) === user?.id && result.data) applyUser(result.data);
    await loadUsers();
    return errorResult(null);
  };

  const deleteUser = async (id: string) => {
    const result = await apiDelete(`/users/${id}`);
    if (result.error) return errorResult(result.error);
    await loadUsers();
    return errorResult(null);
  };

  const role: StaffRole = profile?.role ?? 'staff';
  return (
    <AuthContext.Provider value={{
      user, profile, role, isAdmin: isAdminRole(role), loading, signIn, signOut,
      users, createUser, updateUserRole, deleteUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
