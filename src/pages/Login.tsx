import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, ArrowLeft, Sun, Moon } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === 'dark';

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

  const pageBg = isDark ? '#070a09' : '#eef2ec';
  const textMain = isDark ? '#f5f5f0' : '#0c1410';
  const textMuted = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(12,20,16,0.5)';
  const gold = isDark ? '#e8c547' : '#a8841f';
  const green = isDark ? '#a3e635' : '#65a30d';

  return (
    <div
      dir="rtl"
      className="min-h-screen relative flex flex-col items-center justify-center px-4 py-10 overflow-hidden transition-colors duration-300"
      style={{ background: pageBg }}
    >
      {/* لوگوی پس‌زمینه — خیلی محو و تمیز */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: isDark ? 0.06 : 0.05 }}
      >
        <img
          src="/v4.png"
          alt=""
          className="w-[min(85vw,640px)] h-auto object-contain select-none"
          style={{ filter: 'blur(8px) saturate(0.85)' }}
        />
      </div>

      {/* هاله‌های خیلی ملایم */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse 55% 40% at 50% 25%, rgba(232,197,71,0.06), transparent 60%)'
            : 'radial-gradient(ellipse 55% 40% at 50% 25%, rgba(201,162,39,0.08), transparent 60%)',
        }}
      />

      {/* دکمه روز / شب */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 left-5 z-20 p-2.5 rounded-xl transition-all"
        style={{
          background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
          color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.55)',
          border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
          boxShadow: isDark
            ? '0 4px 16px rgba(0,0,0,0.35)'
            : '0 4px 16px rgba(0,0,0,0.08)',
        }}
        title={isDark ? 'حالت روز' : 'حالت شب'}
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="relative z-10 w-full max-w-[400px] animate-fade-in flex flex-col items-center">
        {/* لوگو واضح در بالا */}
        <div className="text-center mb-7">
          <img
            src="/v4.png"
            alt="Alpha GYM"
            className="mx-auto w-[140px] sm:w-[170px] h-auto object-contain"
            style={{
              filter: isDark
                ? 'drop-shadow(0 8px 28px rgba(232,197,71,0.35)) drop-shadow(0 0 40px rgba(163,230,53,0.12))'
                : 'drop-shadow(0 8px 24px rgba(168,132,31,0.25))',
            }}
          />
          <h1
            className="mt-4 font-black tracking-[0.14em]"
            style={{
              fontSize: 'clamp(1.7rem, 4.5vw, 2.15rem)',
              background: isDark
                ? 'linear-gradient(180deg, #f5e6a3 0%, #e8c547 45%, #c9a227 100%)'
                : 'linear-gradient(180deg, #c9a227 0%, #a8841f 55%, #7a6418 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 2px 10px rgba(232,197,71,0.25))',
            }}
          >
            ALPHA GYM
          </h1>
          <p
            className="mt-2 text-[10px] sm:text-xs font-semibold tracking-[0.26em] uppercase"
            style={{ color: isDark ? 'rgba(163,230,53,0.7)' : 'rgba(101,163,13,0.8)' }}
          >
            Smart Gym Management System
          </p>
        </div>

        {/* کارت فرم سه‌بعدی قوی */}
        <div
          className="w-full rounded-[1.35rem] p-6 sm:p-8 relative"
          style={{
            background: isDark
              ? 'linear-gradient(160deg, rgba(22,28,24,0.95) 0%, rgba(12,16,14,0.98) 100%)'
              : 'linear-gradient(160deg, #ffffff 0%, #f4f7f2 100%)',
            border: isDark
              ? '1px solid rgba(232,197,71,0.28)'
              : '1px solid rgba(201,162,39,0.25)',
            boxShadow: isDark
              ? `
                0 2px 0 0 rgba(232,197,71,0.15),
                0 12px 0 -2px rgba(0,0,0,0.35),
                0 28px 56px -8px rgba(0,0,0,0.65),
                0 0 48px -16px rgba(232,197,71,0.12),
                inset 0 1px 0 0 rgba(255,255,255,0.06)
              `
              : `
                0 2px 0 0 rgba(201,162,39,0.12),
                0 10px 0 -2px rgba(0,0,0,0.04),
                0 24px 48px -12px rgba(0,0,0,0.18),
                0 0 32px -12px rgba(163,230,53,0.1),
                inset 0 1px 0 0 rgba(255,255,255,0.9)
              `,
            transform: 'translateY(-2px)',
          }}
        >
          {/* نوار طلایی بالای کارت */}
          <div
            className="absolute top-0 right-8 left-8 h-[3px] rounded-b-full"
            style={{
              background: isDark
                ? 'linear-gradient(90deg, transparent, #e8c547 30%, #a3e635 70%, transparent)'
                : 'linear-gradient(90deg, transparent, #c9a227 30%, #65a30d 70%, transparent)',
              opacity: 0.85,
            }}
          />

          <p
            className="text-center text-sm font-bold mb-5 tracking-wide"
            style={{ color: isDark ? 'rgba(245,230,163,0.92)' : '#7a6418' }}
          >
            ورود به پنل مدیریت
          </p>

          {error && (
            <div
              className="mb-4 p-3 rounded-xl text-sm font-medium"
              style={{
                background: 'rgba(248,113,113,0.12)',
                color: isDark ? '#fca5a5' : '#dc2626',
                border: '1px solid rgba(248,113,113,0.25)',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-xs font-bold mb-1.5"
                style={{ color: isDark ? 'rgba(232,197,71,0.75)' : 'rgba(122,100,24,0.85)' }}
              >
                نام کاربری
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: isDark ? 'rgba(232,197,71,0.4)' : 'rgba(168,132,31,0.5)' }}
                />
                <input
                  type="text"
                  className="w-full rounded-xl py-3.5 pr-10 pl-4 text-sm outline-none transition-shadow"
                  style={{
                    background: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.95)',
                    border: isDark
                      ? '1px solid rgba(232,197,71,0.22)'
                      : '1px solid rgba(201,162,39,0.28)',
                    color: textMain,
                    boxShadow: isDark
                      ? 'inset 0 2px 6px rgba(0,0,0,0.35)'
                      : 'inset 0 2px 4px rgba(0,0,0,0.04)',
                  }}
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = green;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${isDark ? 'rgba(163,230,53,0.15)' : 'rgba(101,163,13,0.15)'}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = isDark
                      ? 'rgba(232,197,71,0.22)'
                      : 'rgba(201,162,39,0.28)';
                    e.currentTarget.style.boxShadow = isDark
                      ? 'inset 0 2px 6px rgba(0,0,0,0.35)'
                      : 'inset 0 2px 4px rgba(0,0,0,0.04)';
                  }}
                />
              </div>
            </div>

            <div>
              <label
                className="block text-xs font-bold mb-1.5"
                style={{ color: isDark ? 'rgba(232,197,71,0.75)' : 'rgba(122,100,24,0.85)' }}
              >
                رمز عبور
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: isDark ? 'rgba(232,197,71,0.4)' : 'rgba(168,132,31,0.5)' }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full rounded-xl py-3.5 pr-10 pl-10 text-sm outline-none transition-shadow"
                  style={{
                    background: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.95)',
                    border: isDark
                      ? '1px solid rgba(232,197,71,0.22)'
                      : '1px solid rgba(201,162,39,0.28)',
                    color: textMain,
                    boxShadow: isDark
                      ? 'inset 0 2px 6px rgba(0,0,0,0.35)'
                      : 'inset 0 2px 4px rgba(0,0,0,0.04)',
                  }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = green;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${isDark ? 'rgba(163,230,53,0.15)' : 'rgba(101,163,13,0.15)'}`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = isDark
                      ? 'rgba(232,197,71,0.22)'
                      : 'rgba(201,162,39,0.28)';
                    e.currentTarget.style.boxShadow = isDark
                      ? 'inset 0 2px 6px rgba(0,0,0,0.35)'
                      : 'inset 0 2px 4px rgba(0,0,0,0.04)';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 p-0.5"
                  style={{ color: isDark ? 'rgba(232,197,71,0.5)' : 'rgba(168,132,31,0.55)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-50"
              style={{
                background: isDark
                  ? 'linear-gradient(145deg, #f0d060 0%, #e8c547 40%, #a3e635 100%)'
                  : 'linear-gradient(145deg, #e8c547 0%, #c9a227 40%, #65a30d 100%)',
                color: '#0a1208',
                boxShadow: isDark
                  ? `
                    0 1px 0 0 rgba(255,255,255,0.25) inset,
                    0 6px 0 0 rgba(100,80,10,0.35),
                    0 12px 28px -4px rgba(232,197,71,0.4),
                    0 0 24px -4px rgba(163,230,53,0.25)
                  `
                  : `
                    0 1px 0 0 rgba(255,255,255,0.4) inset,
                    0 5px 0 0 rgba(120,95,15,0.25),
                    0 12px 24px -4px rgba(201,162,39,0.35)
                  `,
                border: '1px solid rgba(245,230,163,0.4)',
                transform: 'translateY(-1px)',
              }}
            >
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

        <p
          className="text-center text-[10px] mt-7 font-medium tracking-[0.2em]"
          style={{ color: textMuted }}
        >
          ALPHA GYM · MANAGEMENT SYSTEM
        </p>
      </div>
    </div>
  );
}
