import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { checkUpdates, getSystemVersion } from '../services/systemService';
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
  UserRound,
  Wallet,
  Settings,
  Bell,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'داشبورد', icon: LayoutDashboard, adminOnly: false },
  { to: '/members', label: 'اعضا', icon: Users, adminOnly: false },
  { to: '/renewals', label: 'تمدیدها', icon: RefreshCcw, adminOnly: false },
  { to: '/sms', label: 'مرکز پیامک', icon: MessageSquare, adminOnly: false },
  { to: '/coaches', label: 'مربیان', icon: UserRound, adminOnly: true },
  { to: '/coach', label: 'پورتال مربی', icon: Dumbbell, adminOnly: true },
  { to: '/accounting', label: 'حسابداری', icon: Wallet, adminOnly: true },
  { to: '/settings', label: 'تنظیمات', icon: Settings, adminOnly: true },
  { to: '/users', label: 'کاربران', icon: UserCog, adminOnly: true },
] as const;

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'داشبورد',
  '/members': 'مدیریت اعضا',
  '/renewals': 'تمدید عضویت',
  '/sms': 'مرکز پیامک',
  '/coaches': 'مربیان',
  '/coach': 'پورتال مربی',
  '/accounting': 'حسابداری',
  '/settings': 'تنظیمات پنل',
  '/users': 'مدیریت کاربران',
};

const SIDEBAR_W = 280;

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('—');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const pathKey = location.pathname.startsWith('/sms') ? '/sms' : location.pathname;
  const currentTitle = PAGE_TITLES[pathKey] || 'آلفا جیم';
  const displayName = profile?.full_name?.trim() || 'کاربر';

  useEffect(() => {
    (async () => {
      const v = await getSystemVersion();
      if (v.data?.version) setAppVersion(v.data.version);
      if (isAdmin) {
        const u = await checkUpdates();
        if (u.data?.update_available) {
          setUpdateAvailable(true);
          setRemoteVersion(u.data.remote_version);
        }
      }
    })();
  }, [isAdmin]);

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" style={{ background: 'rgba(15, 23, 42, 0.4)' }} onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`fixed top-0 bottom-0 right-0 z-50 flex flex-col transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : 'translate-x-full'} lg:!translate-x-0`}
        style={{ width: SIDEBAR_W, background: 'var(--bg-sidebar)', borderLeft: '1px solid var(--border)' }}
      >
        <div className="h-16 shrink-0 px-5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shrink-0" style={{ background: 'linear-gradient(135deg, #0c8ce7, #006fc5)' }}>
            <img src="/v5.png" alt="Alpha" className="w-8 h-8 object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Alpha GYM</h1>
            <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>مدیریت هوشمند باشگاه</p>
          </div>
          <button type="button" className="lg:hidden p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }} onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <p className="px-3 mb-2 text-[10px] font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>منوی اصلی</p>
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
          <button type="button" onClick={signOut} className="flex items-center gap-2 w-full h-10 px-3 text-sm rounded-xl" style={{ color: 'var(--text-secondary)' }}>
            <LogOut size={16} />
            خروج از حساب
          </button>
          <p className="mt-3 text-center text-[10px] font-medium" style={{ color: 'var(--text-muted)' }} dir="ltr">
            Alpha GYM v{appVersion}
          </p>
        </div>
      </aside>

      <div className="min-h-screen flex flex-col">
        <div className="lg:pr-[280px] min-h-screen flex flex-col w-full">
          <header className="sticky top-0 z-30 h-16 shrink-0 px-4 sm:px-6 flex items-center justify-between gap-3" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <button type="button" onClick={() => setMobileOpen(true)} className="lg:hidden p-2 rounded-xl" style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}>
                <Menu size={20} />
              </button>
              <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>آلفا جیم</span>
                <ChevronLeft size={12} />
                <span className="font-medium" style={{ color: 'var(--text)' }}>{currentTitle}</span>
              </div>
              <h2 className="sm:hidden text-sm font-semibold" style={{ color: 'var(--text)' }}>{currentTitle}</h2>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* کاربر واردشده */}
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, #d4a843, #b8862a)' }}
                >
                  {displayName.charAt(0)}
                </div>
                <div className="hidden sm:block min-w-0 text-right">
                  <p className="text-xs font-semibold truncate max-w-[140px]" style={{ color: 'var(--text)' }}>
                    {displayName}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    وارد شده
                  </p>
                </div>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  className="relative p-2.5 rounded-xl"
                  style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
                  title="اعلان‌ها"
                >
                  <Bell size={18} />
                  {updateAvailable && (
                    <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full" style={{ background: 'var(--danger)' }} />
                  )}
                </button>
                {notifOpen && (
                  <div
                    className="absolute left-0 top-full mt-2 w-72 rounded-2xl p-3 z-50"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      boxShadow: 'var(--shadow)',
                    }}
                  >
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>
                      اعلان‌ها
                    </p>
                    {updateAvailable ? (
                      <button
                        type="button"
                        className="w-full text-right p-3 rounded-xl text-sm"
                        style={{ background: 'var(--accent-soft)', color: 'var(--text)' }}
                        onClick={() => {
                          setNotifOpen(false);
                          navigate('/settings');
                        }}
                      >
                        <span className="font-semibold block">نسخه جدید آماده است</span>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          v{remoteVersion} — برای نصب به تنظیمات بروید
                        </span>
                      </button>
                    ) : (
                      <p className="text-xs p-2" style={{ color: 'var(--text-muted)' }}>
                        اعلان جدیدی نیست
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button type="button" onClick={toggleTheme} className="p-2.5 rounded-xl" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
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
