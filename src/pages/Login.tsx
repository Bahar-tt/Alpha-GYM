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
  const [showForgot, setShowForgot] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');

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
      x: ((y - centerY) / centerY) * -5,
      y: ((x - centerX) / centerX) * 5,
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

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setForgotMsg('لطفاً نام کاربری را وارد کنید');
      return;
    }
    setForgotMsg('لینک بازیابی رمز عبور برای شما ارسال شد. با پشتیبانی تماس بگیرید.');
  };

  return (
    <div dir="ltr" className="min-h-screen flex bg-[#0a0a0a] overflow-hidden">
      {/* LEFT – Form */}
      <div className="w-full lg:w-[40%] flex flex-col justify-center px-8 sm:px-12 lg:px-14 relative z-10">
        <div className="absolute inset-0 bg-[#0c0c0c]" />

        <div className="relative z-10 w-full max-w-[340px] mx-auto" dir="rtl">
          {/* Logo + Title */}
          <div className="mb-9 text-center">
            <img
              src="/v5.png"
              alt="Alpha GYM"
              className="mx-auto w-[145px] sm:w-[165px] h-auto"
              style={{
                filter: 'drop-shadow(0 0 14px rgba(245,197,24,0.5)) drop-shadow(0 4px 12px rgba(0,0,0,0.5))',
              }}
            />

            {/* Professional title */}
            <h1
              className="mt-5 text-[26px] sm:text-[30px] font-extrabold tracking-[0.18em]"
              style={{
                color: '#f0f0f0',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}
            >
              ALPHA{' '}
              <span
                style={{
                  color: '#f5c518',
                  textShadow: '0 0 18px rgba(245,197,24,0.35)',
                }}
              >
                GYM
              </span>
            </h1>

            <p className="mt-2 text-[10px] sm:text-[11px] font-medium tracking-[0.32em] uppercase text-white/40">
              Management System
            </p>
          </div>

          {/* Card */}
          <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ perspective: '800px' }}
          >
            <div
              className="rounded-2xl p-6 sm:p-7 transition-transform duration-200 ease-out"
              style={{
                background: 'rgba(20,20,20,0.9)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 16px 40px -10px rgba(0,0,0,0.65)',
                transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              }}
            >
              {!showForgot ? (
                <>
                  <h2 className="text-center text-sm font-semibold text-white/85 mb-5">
                    ورود به پنل مدیریت
                  </h2>

                  {error && (
                    <div className="mb-4 p-3 rounded-xl text-sm bg-red-500/10 text-red-300 border border-red-500/20">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/45 mb-1.5">نام کاربری</label>
                      <div className="relative">
                        <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                        <input
                          type="text"
                          className="w-full rounded-xl py-3 pr-9 pl-3 text-sm bg-black/50 border border-white/10 text-white placeholder:text-white/20 outline-none focus:border-[#f5c518]/50 focus:ring-1 focus:ring-[#f5c518]/20 transition-all"
                          placeholder="admin"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-white/45">رمز عبور</label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowForgot(true);
                            setForgotMsg('');
                            setError('');
                          }}
                          className="text-[11px] text-[#f5c518]/80 hover:text-[#f5c518] transition-colors"
                        >
                          فراموشی رمز؟
                        </button>
                      </div>
                      <div className="relative">
                        <Lock size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="w-full rounded-xl py-3 pr-9 pl-9 text-sm bg-black/50 border border-white/10 text-white placeholder:text-white/20 outline-none focus:border-[#f5c518]/50 focus:ring-1 focus:ring-[#f5c518]/20 transition-all"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/55 transition-colors"
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full mt-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                      style={{
                        background: 'linear-gradient(135deg, #f5c518, #e0a800)',
                        color: '#1a1400',
                        boxShadow: '0 4px 14px -2px rgba(245,197,24,0.35)',
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
                          <ArrowLeft size={16} strokeWidth={2.5} />
                        </>
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <h2 className="text-center text-sm font-semibold text-white/85 mb-2">
                    بازیابی رمز عبور
                  </h2>
                  <p className="text-center text-xs text-white/40 mb-5">
                    نام کاربری خود را وارد کنید
                  </p>

                  {forgotMsg && (
                    <div className="mb-4 p-3 rounded-xl text-sm bg-[#f5c518]/10 text-[#f5c518] border border-[#f5c518]/20">
                      {forgotMsg}
                    </div>
                  )}

                  <form onSubmit={handleForgot} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/45 mb-1.5">نام کاربری</label>
                      <div className="relative">
                        <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                        <input
                          type="text"
                          className="w-full rounded-xl py-3 pr-9 pl-3 text-sm bg-black/50 border border-white/10 text-white placeholder:text-white/20 outline-none focus:border-[#f5c518]/50 focus:ring-1 focus:ring-[#f5c518]/20 transition-all"
                          placeholder="admin"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
                      style={{
                        background: 'linear-gradient(135deg, #f5c518, #e0a800)',
                        color: '#1a1400',
                        boxShadow: '0 4px 14px -2px rgba(245,197,24,0.35)',
                      }}
                    >
                      ارسال لینک بازیابی
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowForgot(false);
                        setForgotMsg('');
                      }}
                      className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors mt-1"
                    >
                      بازگشت به ورود
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>

          <p className="text-center text-[10px] mt-7 tracking-[0.2em] text-white/18">
            ALPHA GYM · POWERED BY STRENGTH
          </p>
        </div>
      </div>

      {/* RIGHT – Hero */}
      <div className="hidden lg:block lg:w-[60%] relative">
        <img
          src="/hero-woman.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-[center_15%]"
          style={{ filter: 'brightness(0.92) contrast(1.05)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, rgba(10,10,10,0.5) 0%, transparent 28%)',
          }}
        />
      </div>
    </div>
  );
}
