import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { isAdminRole, type StaffProfile, type StaffRole } from '../lib/roles';
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  setToken,
  getToken,
  type ApiStaffUser,
  type ApiFeatures,
} from '../services/api';

const SESSION_KEY = 'alpha_gym_session';
const USERS_KEY   = 'alpha_gym_users';

const EMPTY_FEATURES: ApiFeatures = { accounting: false, attendance: false, coach_portal: false, messaging: false };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManagedUser {
  id: string;
  username: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
  last_login_at?: string | null;
}

interface StoredSession {
  id: string;
  username: string;
  full_name: string;
  role: StaffRole;
  features?: ApiFeatures;
}

interface AuthContextType {
  user: { id: string; username?: string } | null;
  profile: StaffProfile | null;
  role: StaffRole;
  isAdmin: boolean;
  loading: boolean;
  features: ApiFeatures;
  hasFeature: (key: string) => boolean;

  signIn:  (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;

  // Admin-only user management
  users:          ManagedUser[];
  refreshUsers:   () => Promise<void>;
  createUser:     (data: { username: string; password: string; full_name: string; role: StaffRole }) => Promise<{ error: string | null }>;
  updateUserRole: (id: string, role: StaffRole)                   => Promise<{ error: string | null }>;
  updateUserPassword: (id: string, newPassword: string)          => Promise<{ error: string | null }>;
  updateUser:     (id: string, data: Partial<{ full_name: string; role: StaffRole; is_active: boolean; password: string }>) => Promise<{ error: string | null }>;
  deleteUser:     (id: string)                                     => Promise<{ error: string | null }>;

  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiUserToManaged(u: ApiStaffUser): ManagedUser {
  return {
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    role: u.role,
    is_active: u.is_active,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  };
}

function sessionToProfile(s: StoredSession): StaffProfile {
  return { id: s.id, full_name: s.full_name, phone: '', role: s.role, avatar_url: '' };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthContextType['user']>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [features, setFeatures] = useState<ApiFeatures>(EMPTY_FEATURES);
  const [loading, setLoading] = useState(true);
  const [users,   setUsers]   = useState<ManagedUser[]>([]);

  // 🧹 حذف داده‌های احراز هویت قدیمی (localStorage) از نسخه‌های قبلی
  useEffect(() => {
    localStorage.removeItem(USERS_KEY);
    localStorage.removeItem(SESSION_KEY);

    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await apiGet<{ user: ApiStaffUser }>('/auth/me');
      if (data?.user) {
        const s: StoredSession = {
          id: data.user.id,
          username: data.user.username,
          full_name: data.user.full_name,
          role: data.user.role,
          features: data.user.features,
        };
        setUser({ id: s.id, username: s.username });
        setProfile(sessionToProfile(s));
        setFeatures(s.features ?? EMPTY_FEATURES);
      } else {
        setToken(null);
      }
      setLoading(false);
    })();
  }, []);

  const signIn = async (username: string, password: string) => {
    const { data, error } = await apiPost<{ token: string; user: ApiStaffUser }>('/auth/login', {
      username,
      password,
    });
    if (error || !data) return { error };
    setToken(data.token);
    const s: StoredSession = {
      id: data.user.id,
      username: data.user.username,
      full_name: data.user.full_name,
      role: data.user.role,
      features: data.user.features,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setUser({ id: s.id, username: s.username });
    setProfile(sessionToProfile(s));
    setFeatures(data.user.features ?? EMPTY_FEATURES);
    return { error: null };
  };

  const signOut = async () => {
    await apiPost('/auth/logout', {}).catch(() => null);
    setToken(null);
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setProfile(null);
    setFeatures(EMPTY_FEATURES);
  };

  const refreshUsers = async () => {
    const { data } = await apiGet<ApiStaffUser[]>('/users');
    if (data) setUsers(data.map(apiUserToManaged));
  };

  const createUser = async (data: { username: string; password: string; full_name: string; role: StaffRole }) => {
    const { error } = await apiPost('/users', data);
    if (!error) await refreshUsers();
    return { error };
  };

  const updateUserRole = async (id: string, role: StaffRole) => {
    const { error } = await apiPut(`/users/${id}`, { role });
    if (!error) await refreshUsers();
    return { error };
  };

  const updateUserPassword = async (id: string, newPassword: string) => {
    const { error } = await apiPut(`/users/${id}`, { password: newPassword });
    if (!error) await refreshUsers();
    return { error };
  };

  const updateUser = async (id: string, data: Partial<{ full_name: string; role: StaffRole; is_active: boolean; password: string }>) => {
    const { error } = await apiPut(`/users/${id}`, data);
    if (!error) await refreshUsers();
    return { error };
  };

  const deleteUser = async (id: string) => {
    const { error } = await apiDelete(`/users/${id}`);
    if (!error) await refreshUsers();
    return { error };
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    return apiPost<{ ok: boolean }>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  };

  const role: StaffRole = profile?.role ?? 'staff';
  const hasFeature = (key: string) => !!features[key as keyof ApiFeatures];

  return (
    <AuthContext.Provider
      value={{
        user, profile, role,
        isAdmin: isAdminRole(role),
        loading,
        features, hasFeature,
        signIn, signOut,
        users, refreshUsers, createUser, updateUserRole, updateUserPassword, updateUser, deleteUser,
        changePassword,
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
