import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
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

  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setTilt({
      x: ((y - centerY) / centerY) * -6,
      y: ((x - centerX) / centerX) * 6,
    });
  };

  const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

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
    <div className="min-h-screen flex bg-[#0a0a0a] overflow-hidden">
      {/* ========== LEFT PANEL – Form ========== */}
      <div className="w-full lg:w-[42%] xl:w-[38%] flex flex-col justify-center px-8 sm:px-12 lg:px-14 xl:px-16 relative z-10">
        {/* subtle left bg */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#111] via-[#0c0c0c] to-[#080808]" />

        <div className="relative z-10 max-w-[360px] mx-auto w-full" dir="rtl">
          {/* Logo */}
          <div className="mb-10 text-center">
            <img
              src="/v5.png"
              alt="Alpha GYM"
              className="mx-auto w-[150px] sm:w-[170px] h-auto"
              style={{
                filter: 'drop-shadow(0 0 12px rgba(255,180,0,0.45)) drop-shadow(0 4px 16px rgba(0,0,0,0.5))',
              }}
            />
            <h1
              className="mt-5 text-3xl sm:text-4xl font-black tracking-[0.12em] text-white"
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
            >
              ALPHA <span style={{ color: '#f5c518' }}>GYM</span>
            </h1>
            <p className="mt-2 text-xs font-medium tracking-[0.3em] uppercase text-white/40">
              Management System
            </p>
          </div>

          {/* Card */}
          <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ perspective: '900px' }}
          >
            <div
              className="rounded-2xl p-7 sm:p-8 transition-transform duration-200 ease-out"
              style={{
                background: 'rgba(18,18,18,0.85)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 20px 50px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
                transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                backdropFilter: 'blur(12px)',
              }}
            >
              <h2 className="text-center text-[15px] font-semibold text-white/90 mb-6">
                ورود به پنل مدیریت
              </h2>

              {error && (
                <div className="mb-4 p-3 rounded-xl text-sm bg-red-500/10 text-red-300 border border-red-500/20">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2">
                    نام کاربری
                  </label>
                  <div className="relative">
                    <User size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                    <input
                      type="text"
                      className="w-full rounded-xl py-3.5 pr-10 pl-4 text-sm bg-black/40 border border-white/10 text-white placeholder:text-white/25 outline-none focus:border-[#f5c518]/60 focus:ring-2 focus:ring-[#f5c518]/15 transition-all"
                      placeholder="admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2">
                    رمز عبور
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full rounded-xl py-3.5 pr-10 pl-10 text-sm bg-black/40 border border-white/10 text-white placeholder:text-white/25 outline-none focus:border-[#f5c518]/60 focus:ring-2 focus:ring-[#f5c518]/15 transition-all"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/60 transition-colors"
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
                    background: 'linear-gradient(135deg, #f5c518 0%, #e0a800 100%)',
                    color: '#1a1400',
                    boxShadow: '0 4px 16px -2px rgba(245,197,24,0.4)',
                  }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/25 border-t-black rounded-full animate-spin" />
                      در حال ورود...
                    </span>
                  ) : (
                    <>
                      ورود به سیستم
                      <ArrowLeft size={17} strokeWidth={2.5} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          <p className="text-center text-[10px] mt-8 tracking-[0.2em] text-white/20">
            ALPHA GYM · POWERED BY STRENGTH
          </p>
        </div>
      </div>

      {/* ========== RIGHT PANEL – Hero Image ========== */}
      <div className="hidden lg:block lg:w-[58%] xl:w-[62%] relative">
        <img
          src="/hero-woman.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          style={{
            filter: 'brightness(0.85) contrast(1.08) saturate(1.1)',
          }}
        />
        {/* soft left fade so it blends with form panel */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, rgba(10,10,10,0.75) 0%, rgba(10,10,10,0.2) 25%, transparent 50%)',
          }}
        />
        {/* bottom vignette */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(10,10,10,0.5) 0%, transparent 35%)',
          }}
        />
      </div>
    </div>
  );
}
