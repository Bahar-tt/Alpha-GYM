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
      {/* پنل بصری — تصویر باشگاه + لوگو */}
      <div className="hidden lg:flex lg:w-[50%] relative overflow-hidden flex-col justify-between p-10 xl:p-14">
        <div
          className="absolute inset-0 scale-105"
          style={{
            backgroundImage: "url('/login-bg.svg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'saturate(1.05) contrast(1.05)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(165deg, rgba(5,8,7,0.82) 0%, rgba(8,16,10,0.55) 42%, rgba(5,8,7,0.88) 100%)',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 55% at 75% 35%, rgba(163,230,53,0.18), transparent 60%)',
          }}
        />

        {/* لوگو بالا */}
        <div className="relative z-10 flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: 'rgba(5,8,7,0.55)',
              border: '1px solid rgba(163,230,53,0.45)',
              boxShadow: '0 0 32px rgba(163,230,53,0.35)',
            }}
          >
            <img src="/v5.png" alt="Alpha GYM" className="w-12 h-12 object-contain" />
          </div>
          <div>
            <p
              className="text-white font-black tracking-[0.08em] text-xl"
              style={{ letterSpacing: '0.12em' }}
            >
              ALPHA GYM
            </p>
            <p className="text-xs font-semibold mt-0.5" style={{ color: '#bef264' }}>
              قدرت · نظم · نتیجه
            </p>
          </div>
        </div>

        {/* تیتر اصلی — قوی و حرفه‌ای */}
        <div className="relative z-10 max-w-lg space-y-5">
          <div
            className="h-1 w-16 rounded-full"
            style={{ background: 'linear-gradient(90deg, #a3e635, transparent)' }}
          />
          <h2
            className="font-black text-white leading-[1.15]"
            style={{
              fontSize: 'clamp(2.4rem, 4.2vw, 3.35rem)',
              letterSpacing: '-0.03em',
              textShadow: '0 4px 32px rgba(0,0,0,0.45)',
            }}
          >
            مدیریت حرفه‌ای
            <br />
            <span style={{ color: '#bef264' }}>باشگاه</span>
          </h2>
          <p
            className="text-base font-medium leading-relaxed max-w-md"
            style={{ color: 'rgba(240,253,244,0.78)' }}
          >
            اعضا، تمدید، پیامک و گزارش‌ها — یک پنل یکپارچه برای باشگاهی که جدی کار می‌کند.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            {['اعضا', 'مربیان', 'پیامک', 'گزارش'].map((t) => (
              <span
                key={t}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide"
                style={{
                  background: 'rgba(163,230,53,0.12)',
                  border: '1px solid rgba(163,230,53,0.35)',
                  color: '#ecfccb',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[11px] font-medium tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Alpha GYM · Management System
        </p>
      </div>

      {/* فرم ورود */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04] dark:opacity-[0.07]"
          style={{
            backgroundImage: "url('/v5.png')",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: 'min(55%, 320px)',
          }}
        />

        <button
          onClick={toggleTheme}
          className="absolute top-5 left-5 p-2.5 rounded-xl transition-colors z-10"
          style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
          title={theme === 'light' ? 'حالت تاریک' : 'حالت روشن'}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <div className="w-full max-w-[400px] animate-fade-in relative z-10">
          <div className="lg:hidden flex flex-col items-center gap-3 mb-10">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(145deg, #0a1208, #1a2e14)',
                boxShadow: '0 0 28px rgba(163,230,53,0.35)',
                border: '1px solid rgba(163,230,53,0.4)',
              }}
            >
              <img src="/v5.png" alt="" className="w-12 h-12 object-contain" />
            </div>
            <div className="text-center">
              <p className="font-black text-xl tracking-[0.15em]" style={{ color: 'var(--text)' }}>
                ALPHA GYM
              </p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--accent)' }}>
                قدرت · نظم · نتیجه
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h1
              className="font-black tracking-tight"
              style={{ color: 'var(--text)', fontSize: '1.75rem', letterSpacing: '-0.02em' }}
            >
              ورود به پنل
            </h1>
            <p className="text-sm mt-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
              نام کاربری و رمز عبور خود را وارد کنید
            </p>
          </div>

          <div className="panel-card p-6 sm:p-8">
            {error && (
              <div
                className="mb-4 p-3 rounded-xl text-sm font-medium"
                style={{
                  background: 'var(--danger-soft)',
                  color: 'var(--danger)',
                  border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
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
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
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

              <button type="submit" disabled={loading} className="btn-primary w-full mt-2 py-3.5 text-base font-bold">
                {loading ? (
                  'در حال ورود...'
                ) : (
                  <>
                    ورود به سیستم
                    <ArrowLeft size={18} />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs mt-6 font-medium" style={{ color: 'var(--text-muted)' }}>
            برای دریافت دسترسی با مدیر سیستم تماس بگیرید
          </p>
        </div>
      </div>
    </div>
  );
}
