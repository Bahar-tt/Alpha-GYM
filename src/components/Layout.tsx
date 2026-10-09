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

/** منوی ثابت — آیتم‌ها و ترتیب در همه صفحات یکسان است */
const NAV_ITEMS = [
  { to: '/dashboard', label: 'داشبورد', icon: LayoutDashboard, adminOnly: false },
  { to: '/members', label: 'اعضا', icon: Users, adminOnly: false },
  { to: '/renewals', label: 'تمدیدها', icon: RefreshCcw, adminOnly: false },
  { to: '/messaging', label: 'پیام‌رسانی', icon: MessageSquare, adminOnly: false },
  { to: '/sms-logs', label: 'گزارش پیامک', icon: ScrollText, adminOnly: true },
  { to: '/broadcast', label: 'ارسال گروهی', icon: Send, adminOnly: true },
  { to: '/coach', label: 'پورتال مربی', icon: Dumbbell, adminOnly: true },
  { to: '/users', label: 'کاربران', icon: UserCog, adminOnly: true },
] as const;

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'داشبورد',
  '/members': 'مدیریت اعضا',
  '/renewals': 'تمدید عضویت',
  '/messaging': 'پیام‌رسانی هوشمند',
  '/sms-logs': 'گزارش پیامک‌ها',
  '/broadcast': 'ارسال گروهی',
  '/coach': 'پورتال مربی',
  '/users': 'مدیریت کاربران',
};

const SIDEBAR_WIDTH = 280;

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // فیلتر فقط بر اساس نقش کاربر — نه صفحه فعلی
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const currentTitle = PAGE_TITLES[location.pathname] || 'آلفا جیم';

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/*
        سایدبار همیشه fixed است:
        - عرض ثابت SIDEBAR_WIDTH
        - ارتفاع همیشه 100dvh
        - در همه صفحات یکسان (Layout یک‌بار mount می‌شود و فقط Outlet عوض می‌شود)
      */}
      <aside
        className={`fixed top-0 right-0 z-50 flex flex-col h-[100dvh]
          transition-transform duration-300 ease-out
          ${mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
        style={{
          width: SIDEBAR_WIDTH,
          background: 'var(--bg-sidebar)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        {/* Brand — ارتفاع ثابت */}
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
            <h1 className="text-sm font-bold tracking-tight leading-tight" style={{ color: 'var(--text)' }}>
              Alpha GYM
            </h1>
            <p className="text-[10px] truncate leading-tight" style={{ color: 'var(--text-muted)' }}>
              مدیریت هوشمند باشگاه
            </p>
          </div>
          <button
            type="button"
            className="lg:hidden p-1.5 rounded-lg shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setMobileOpen(false)}
            aria-label="بستن منو"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav — لیست ثابت */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
          <p
            className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            منوی اصلی
          </p>
          <ul className="space-y-0.5">
            {visibleItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/dashboard'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 h-11 px-3.5 rounded-xl text-sm font-medium transition-colors duration-150 ${
                      isActive ? 'nav-item-active' : 'nav-item'
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

        {/* User footer — ارتفاع ثابت */}
        <div
          className="shrink-0 p-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
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
              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                {roleLabel(profile?.role)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 w-full h-10 px-3 text-sm rounded-xl transition-colors"
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
            <LogOut size={16} className="shrink-0" />
            خروج از حساب
          </button>
        </div>
      </aside>

      {/* محتوای اصلی — همیشه margin ثابت برای جای سایدبار دسکتاپ */}
      <div
        className="flex flex-col min-h-screen min-w-0"
        style={{
          // در RTL سایدبار سمت راست است → padding/margin راست روی دسکتاپ
        }}
      >
        <div
          className="flex flex-col min-h-screen min-w-0 w-full"
          style={{
            // lg و بالاتر: فضای سایدبار را رزرو کن تا محتوا زیر منو نرود
          }}
        >
          <style>{`
            @media (min-width: 1024px) {
              .alpha-main-shell {
                margin-right: ${SIDEBAR_WIDTH}px;
                width: calc(100% - ${SIDEBAR_WIDTH}px);
              }
            }
          `}</style>

          <div className="alpha-main-shell flex flex-col min-h-screen min-w-0">
            {/* Header ثابت */}
            <header
              className="sticky top-0 z-30 h-16 shrink-0 px-4 sm:px-6 flex items-center justify-between gap-3"
              style={{
                background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="lg:hidden p-2 rounded-xl shrink-0"
                  style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}
                  aria-label="باز کردن منو"
                >
                  <Menu size={20} />
                </button>
                <div className="hidden sm:flex items-center gap-1.5 text-xs min-w-0" style={{ color: 'var(--text-muted)' }}>
                  <span className="shrink-0">آلفا جیم</span>
                  <ChevronLeft size={12} className="shrink-0" />
                  <span className="font-medium truncate" style={{ color: 'var(--text)' }}>
                    {currentTitle}
                  </span>
                </div>
                <h2 className="sm:hidden text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {currentTitle}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                  style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--success)' }} />
                  سیستم فعال
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="p-2.5 rounded-xl transition-colors"
                  style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
                  title={theme === 'light' ? 'حالت تاریک' : 'حالت روشن'}
                >
                  {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </button>
              </div>
            </header>

            {/* فقط این بخش با تغییر صفحه عوض می‌شود */}
            <main className="flex-1 p-4 sm:p-6 lg:p-8">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
