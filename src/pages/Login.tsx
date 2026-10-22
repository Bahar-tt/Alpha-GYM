import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, ArrowLeft } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
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
    <div dir="rtl" className="min-h-screen relative flex flex-col items-center justify-center px-4 py-10 overflow-hidden" style={{ background: '#050807' }}>
      {/* پس‌زمینه لوگو طلایی — بزرگ و محو */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: 0.22 }}
      >
        <img
          src="/v4.png"
          alt=""
          className="w-[min(92vw,720px)] h-auto object-contain"
          style={{
            filter: 'blur(1px) brightness(0.85) saturate(1.1)',
          }}
        />
      </div>
      {/* گرادیان تیره + هاله طلایی و سبز */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 30%, rgba(232,197,71,0.12) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 50% 70%, rgba(163,230,53,0.08) 0%, transparent 60%), linear-gradient(180deg, rgba(5,8,7,0.55) 0%, rgba(5,8,7,0.85) 55%, rgba(5,8,7,0.95) 100%)',
        }}
      />

      <div className="relative z-10 w-full max-w-[400px] animate-fade-in flex flex-col items-center">
        {/* لوگو طلایی بولد */}
        <div className="text-center mb-6">
          <img
            src="/v4.png"
            alt="Alpha GYM"
            className="mx-auto w-[160px] sm:w-[200px] h-auto object-contain drop-shadow-2xl"
            style={{
              filter: 'drop-shadow(0 0 28px rgba(232,197,71,0.45)) drop-shadow(0 0 48px rgba(163,230,53,0.15))',
            }}
          />
          <h1
            className="mt-4 font-black tracking-[0.12em]"
            style={{
              fontSize: 'clamp(1.85rem, 5vw, 2.4rem)',
              background: 'linear-gradient(180deg, #f5e6a3 0%, #e8c547 40%, #c9a227 75%, #a8841f 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: 'none',
              filter: 'drop-shadow(0 2px 12px rgba(232,197,71,0.35))',
            }}
          >
            ALPHA GYM
          </h1>
          <p
            className="mt-2 text-[10px] sm:text-xs font-semibold tracking-[0.28em] uppercase"
            style={{ color: 'rgba(163,230,53,0.75)' }}
          >
            Smart Gym Management System
          </p>
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium"
            style={{
              background: 'rgba(163,230,53,0.1)',
              border: '1px solid rgba(163,230,53,0.28)',
              color: '#bef264',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#a3e635' }} />
            سیستم آنلاین
          </div>
        </div>

        {/* کارت فرم — طلایی + سبز */}
        <div
          className="w-full rounded-2xl p-6 sm:p-7"
          style={{
            background: 'rgba(10,14,12,0.72)',
            border: '1px solid rgba(232,197,71,0.22)',
            boxShadow:
              '0 20px 56px rgba(0,0,0,0.5), 0 0 40px -12px rgba(232,197,71,0.12), inset 0 0 0 1px rgba(163,230,53,0.06)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <p className="text-center text-sm font-bold mb-5" style={{ color: 'rgba(245,230,163,0.9)' }}>
            ورود به پنل مدیریت
          </p>

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
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'rgba(232,197,71,0.7)' }}>
                نام کاربری
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'rgba(232,197,71,0.45)' }}
                />
                <input
                  type="text"
                  className="w-full rounded-xl py-3 pr-10 pl-4 text-sm text-white outline-none"
                  style={{
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(232,197,71,0.2)',
                  }}
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(163,230,53,0.55)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(163,230,53,0.12)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(232,197,71,0.2)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'rgba(232,197,71,0.7)' }}>
                رمز عبور
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'rgba(232,197,71,0.45)' }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full rounded-xl py-3 pr-10 pl-10 text-sm text-white outline-none"
                  style={{
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(232,197,71,0.2)',
                  }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(163,230,53,0.55)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(163,230,53,0.12)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(232,197,71,0.2)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 p-0.5"
                  style={{ color: 'rgba(232,197,71,0.5)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #f0d060 0%, #e8c547 35%, #a3e635 100%)',
                color: '#0a1208',
                boxShadow: '0 8px 28px -6px rgba(232,197,71,0.4), 0 0 20px -4px rgba(163,230,53,0.3)',
                border: '1px solid rgba(245,230,163,0.45)',
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

        <p className="text-center text-[10px] mt-6 font-medium tracking-wider" style={{ color: 'rgba(232,197,71,0.35)' }}>
          ALPHA GYM · MANAGEMENT SYSTEM
        </p>
      </div>
    </div>
  );
}
