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
  Send,
  ScrollText,
  Dumbbell,
  LogOut,
  Menu,
  X,
  UserCog,
  Sun,
  Moon,
  ChevronLeft,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'داشبورد', icon: LayoutDashboard, adminOnly: false },
  { to: '/members', label: 'اعضا', icon: Users, adminOnly: false },
  { to: '/renewals', label: 'تمدیدها', icon: RefreshCcw, adminOnly: false },
  { to: '/messaging', label: 'پیام‌رسانی', icon: MessageSquare, adminOnly: false },
  { to: '/sms-logs', label: 'گزارش پیامک', icon: ScrollText, adminOnly: true },
  { to: '/broadcast', label: 'ارسال گروهی', icon: Send, adminOnly: true },
  { to: '/coach', label: 'پورتال مربی', icon: Dumbbell, adminOnly: true },
  { to: '/users', label: 'کاربران', icon: UserCog, adminOnly: true },
];

const pageTitles: Record<string, string> = {
  '/dashboard': 'داشبورد',
  '/members': 'مدیریت اعضا',
  '/renewals': 'تمدید عضویت',
  '/messaging': 'پیام‌رسانی هوشمند',
  '/sms-logs': 'گزارش پیامک‌ها',
  '/broadcast': 'ارسال گروهی',
  '/coach': 'پورتال مربی',
  '/users': 'مدیریت کاربران',
};

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const currentTitle = pageTitles[location.pathname] || 'آلفا جیم';

  return (
    <div className="min-h-screen flex" dir="rtl" style={{ background: 'var(--bg)' }}>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 right-0 z-50 w-[280px] flex flex-col
          transform transition-transform duration-300 lg:transform-none
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
        style={{
          background: 'var(--bg-sidebar)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        {/* Brand */}
        <div className="px-5 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden shrink-0"
            style={{ background: 'linear-gradient(135deg, #0c8ce7, #006fc5)' }}
          >
            <img src="/v5.png" alt="Alpha" className="w-9 h-9 object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight" style={{ color: 'var(--text)' }}>
              Alpha GYM
            </h1>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
              مدیریت هوشمند باشگاه
            </p>
          </div>
          <button
            className="lg:hidden mr-auto p-1.5 rounded-lg"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            منوی اصلی
          </p>
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => (isActive ? 'nav-item-active' : 'nav-item')}
            >
              <item.icon size={18} strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
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
            onClick={signOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-xl transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--danger-soft)';
              e.currentTarget.style.color = 'var(--danger)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <LogOut size={16} />
            خروج از حساب
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <header
          className="sticky top-0 z-30 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3"
          style={{
            background: 'color-mix(in srgb, var(--bg) 85%, transparent)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>آلفا جیم</span>
              <ChevronLeft size={12} />
              <span className="font-medium" style={{ color: 'var(--text)' }}>{currentTitle}</span>
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
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--success)' }} />
              سیستم فعال
            </div>
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl transition-colors"
              style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
              title={theme === 'light' ? 'حالت تاریک' : 'حالت روشن'}
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
  );
}
