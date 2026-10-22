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
    <div dir="rtl" className="min-h-screen relative flex items-center justify-center px-4 py-10 overflow-hidden">
      {/* پس‌زمینه — عکس باشگاه */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/gym-hero.jpg'), url('/login-bg.svg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(160deg, rgba(3,6,5,0.9) 0%, rgba(5,10,8,0.8) 45%, rgba(3,6,5,0.93) 100%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 50% 28%, rgba(163,230,53,0.1), transparent 70%)',
        }}
      />

      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 left-5 z-20 p-2.5 rounded-xl"
        style={{
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.7)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        title={theme === 'light' ? 'حالت تاریک' : 'حالت روشن'}
      >
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <div className="relative z-10 w-full max-w-[400px] animate-fade-in">
        <div className="text-center mb-8">
          <div
            className="mx-auto mb-5 w-[72px] h-[72px] rounded-2xl flex items-center justify-center"
            style={{
              background: 'rgba(8,12,10,0.8)',
              border: '1px solid rgba(163,230,53,0.4)',
              boxShadow: '0 0 40px rgba(163,230,53,0.22)',
            }}
          >
            <img src="/v5.png" alt="Alpha GYM" className="w-12 h-12 object-contain" />
          </div>
          <p className="text-white font-black text-sm mb-3" style={{ letterSpacing: '0.22em' }}>
            ALPHA GYM
          </p>
          <h1
            className="text-white font-black leading-tight"
            style={{
              fontSize: 'clamp(1.7rem, 4vw, 2.1rem)',
              letterSpacing: '-0.02em',
            }}
          >
            مدیریت حرفه‌ای باشگاه
          </h1>
          <p className="mt-2 text-sm font-medium" style={{ color: 'rgba(190,242,100,0.75)' }}>
            قدرت · نظم · نتیجه
          </p>
        </div>

        <div
          className="rounded-2xl p-7 sm:p-8"
          style={{
            background: 'rgba(12,18,16,0.85)',
            border: '1px solid rgba(163,230,53,0.16)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.03)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {error && (
            <div
              className="mb-4 p-3 rounded-xl text-sm font-medium"
              style={{
                background: 'rgba(248,113,113,0.12)',
                color: '#fca5a5',
                border: '1px solid rgba(248,113,113,0.25)',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                نام کاربری
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                />
                <input
                  type="text"
                  className="w-full rounded-xl py-3 pr-10 pl-4 text-sm text-white outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(163,230,53,0.5)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(163,230,53,0.12)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                رمز عبور
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full rounded-xl py-3 pr-10 pl-10 text-sm text-white outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(163,230,53,0.5)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(163,230,53,0.12)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 p-0.5"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #bef264 0%, #a3e635 45%, #65a30d 100%)',
                color: '#0a1208',
                boxShadow: '0 8px 28px -6px rgba(163,230,53,0.45)',
                border: '1px solid rgba(220,252,150,0.35)',
              }}
            >
              {loading ? 'در حال ورود...' : (
                <>
                  ورود به سیستم
                  <ArrowLeft size={18} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6 font-medium" style={{ color: 'rgba(255,255,255,0.28)' }}>
          Alpha GYM · Management System
        </p>
      </div>
    </div>
  );
}
