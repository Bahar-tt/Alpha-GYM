import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, Sun, Moon, ArrowLeft } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await signIn(username, password);
    if (err) setError(err);
    else navigate('/dashboard');
    setLoading(false);
  };

  return (
    <div dir="rtl" className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Visual panel (RTL = right side) — gym photo background */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden flex-col justify-between p-12">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/login-bg.svg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, rgba(8,20,35,0.72) 0%, rgba(12,40,70,0.55) 45%, rgba(8,20,35,0.78) 100%)',
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <img src="/v5.png" alt="" className="w-9 h-9 object-contain" />
            </div>
            <div>
              <p className="text-white font-bold text-lg tracking-tight">Alpha GYM</p>
              <p className="text-white/60 text-xs">Smart Club Platform</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-6 max-w-md">
          <h2 className="text-4xl font-extrabold text-white leading-tight">
            مدیریت حرفه‌ای
            <br />
            باشگاه شما
          </h2>
          <p className="text-white/80 text-sm leading-relaxed">
            اعضا، تمدید، پیامک و گزارش‌ها را از یک پنل یکپارچه و مدرن مدیریت کنید.
          </p>
          <div className="flex gap-3">
            {['اعضا', 'پیامک', 'گزارش'].map((t) => (
              <span
                key={t}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-white/90"
                style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-white/45 text-xs">Alpha GYM Management System</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        <button
          onClick={toggleTheme}
          className="absolute top-5 left-5 p-2.5 rounded-xl transition-colors"
          style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
          title={theme === 'light' ? 'حالت تاریک' : 'حالت روشن'}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <div className="w-full max-w-[400px] animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #0c8ce7, #006fc5)' }}
            >
              <img src="/v5.png" alt="" className="w-9 h-9 object-contain" />
            </div>
            <div>
              <p className="font-bold text-lg" style={{ color: 'var(--text)' }}>Alpha GYM</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>مدیریت باشگاه</p>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
              ورود به پنل
            </h1>
            <p className="text-sm mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              نام کاربری و رمز عبور خود را وارد کنید
            </p>
          </div>

          <div className="panel-card p-6 sm:p-8">
            {error && (
              <div
                className="mb-4 p-3 rounded-xl text-sm"
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)' }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  نام کاربری
                </label>
                <div className="relative">
                  <User
                    size={16}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    type="text"
                    className="input-field pr-10"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  رمز عبور
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input-field pr-10 pl-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 p-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full mt-2 py-3">
                {loading ? (
                  'در حال ورود...'
                ) : (
                  <>
                    ورود به سیستم
                    <ArrowLeft size={16} />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
            برای دریافت دسترسی با مدیر سیستم تماس بگیرید
          </p>
        </div>
      </div>
    </div>
  );
}
