import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { roleLabel } from '../lib/roles';
import {
  LayoutDashboard,
  Users,
  RefreshCcw,
  MessageSquare,
  Dumbbell,
  LogOut,
  Menu,
  X,
  UserCog,
  Sun,
  Moon,
  ChevronLeft,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'داشبورد', icon: LayoutDashboard, adminOnly: false },
  { to: '/members', label: 'اعضا', icon: Users, adminOnly: false },
  { to: '/renewals', label: 'تمدیدها', icon: RefreshCcw, adminOnly: false },
  { to: '/sms', label: 'مرکز پیامک', icon: MessageSquare, adminOnly: false },
  { to: '/coach', label: 'پورتال مربی', icon: Dumbbell, adminOnly: true },
  { to: '/users', label: 'کاربران', icon: UserCog, adminOnly: true },
] as const;

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'داشبورد',
  '/members': 'مدیریت اعضا',
  '/renewals': 'تمدید عضویت',
  '/sms': 'مرکز پیامک',
  '/coach': 'پورتال مربی',
  '/users': 'مدیریت کاربران',
};

const SIDEBAR_W = 280;

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const pathKey = location.pathname.startsWith('/sms') ? '/sms' : location.pathname;
  const currentTitle = PAGE_TITLES[pathKey] || 'آلفا جیم';

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(15, 23, 42, 0.4)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 right-0 z-50 flex flex-col
          transition-transform duration-300 ease-out
          ${mobileOpen ? 'translate-x-0' : 'translate-x-full'} lg:!translate-x-0`}
        style={{
          width: SIDEBAR_W,
          background: 'var(--bg-sidebar)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        <div
          className="h-16 shrink-0 px-5 flex items-center gap-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shrink-0"
            style={{ background: 'linear-gradient(135deg, #0c8ce7, #006fc5)' }}
          >
            <img src="/v5.png" alt="Alpha" className="w-8 h-8 object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold" style={{ color: 'var(--text)' }}>
              Alpha GYM
            </h1>
            <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
              مدیریت هوشمند باشگاه
            </p>
          </div>
          <button
            type="button"
            className="lg:hidden p-1.5 rounded-lg"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <p
            className="px-3 mb-2 text-[10px] font-semibold tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            منوی اصلی
          </p>
          <ul className="space-y-0.5">
            {visibleItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 h-11 px-3.5 rounded-xl text-sm font-medium ${
                      isActive || (item.to === '/sms' && location.pathname.startsWith('/sms'))
                        ? 'nav-item-active'
                        : 'nav-item'
                    }`
                  }
                >
                  <item.icon size={18} strokeWidth={2} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="shrink-0 p-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #d4a843, #b8862a)' }}
            >
              {profile?.full_name?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                {profile?.full_name || 'کاربر'}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {roleLabel(profile?.role)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 w-full h-10 px-3 text-sm rounded-xl"
            style={{ color: 'var(--text-secondary)' }}
          >
            <LogOut size={16} />
            خروج از حساب
          </button>
        </div>
      </aside>

      <div className="min-h-screen flex flex-col">
        <div className="lg:pr-[280px] min-h-screen flex flex-col w-full">
          <header
            className="sticky top-0 z-30 h-16 shrink-0 px-4 sm:px-6 flex items-center justify-between gap-3"
            style={{
              background: 'var(--bg)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-2 rounded-xl"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}
              >
                <Menu size={20} />
              </button>
              <div
                className="hidden sm:flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>آلفا جیم</span>
                <ChevronLeft size={12} />
                <span className="font-medium" style={{ color: 'var(--text)' }}>
                  {currentTitle}
                </span>
              </div>
              <h2 className="sm:hidden text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {currentTitle}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: 'var(--success)' }}
                />
                سیستم فعال
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2.5 rounded-xl"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
