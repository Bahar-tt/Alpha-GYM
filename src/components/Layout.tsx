import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'داشبورد',          icon: LayoutDashboard, adminOnly: false },
  { to: '/members',   label: 'اعضا',              icon: Users,           adminOnly: false },
  { to: '/renewals',  label: 'تمدیدها',           icon: RefreshCcw,      adminOnly: false },
  { to: '/messaging', label: 'پیام‌رسانی هوشمند', icon: MessageSquare,   adminOnly: false },
  { to: '/sms-logs',  label: 'پیام‌ها',           icon: ScrollText,      adminOnly: true  },
  { to: '/broadcast', label: 'ارسال پیام',        icon: Send,            adminOnly: true  },
  { to: '/coach',     label: 'پورتال مربی',       icon: Dumbbell,        adminOnly: true  },
  { to: '/users',     label: 'مدیریت کاربران',    icon: UserCog,         adminOnly: true  },
];

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-[#050505] flex" dir="rtl">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 right-0 z-50 w-72 bg-[#0a0a0a] border-l border-gold-500/10
        transform transition-transform duration-300 lg:transform-none
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        flex flex-col`}
      >
        {/* Brand */}
        <div className="p-6 border-b border-gold-500/10">
          <div className="flex items-center gap-3">
            <img
              src="/IMG_20260525_112000_518.png"
              alt="آلفا جیم"
              className="w-11 h-11 object-contain animate-pulse-gold"
            />
            <div>
              <h1 className="text-xl font-bold gold-text-gradient">آلفا جیم</h1>
              <p className="text-xs text-gray-500">سیستم مدیریت باشگاه</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => isActive ? 'nav-item-active' : 'nav-item'}
            >
              <item.icon size={20} />
              <span className="text-sm font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-gold-500/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-500 to-gold-700 flex items-center justify-center text-black font-bold text-sm">
              {profile?.full_name?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {profile?.full_name || 'مدیر'}
              </p>
              <p className="text-xs text-gray-500">{roleLabel(profile?.role)}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-400 hover:text-red-400
            rounded-lg hover:bg-red-500/5 transition-all duration-200"
          >
            <LogOut size={16} />
            خروج
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-gold-500/10">
          <div className="flex items-center justify-between px-6 py-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-400 hover:text-gold-400 transition-colors"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                آنلاین
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}