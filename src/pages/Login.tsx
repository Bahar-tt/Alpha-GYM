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

  // 3D tilt state
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -12;
    const rotateY = ((x - centerX) / centerX) * 12;
    setTilt({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await signIn(username, password);
    if (err) setError(err);
    else navigate('/dashboard');
    setLoading(false);
  };

  // Colors – Black + Orange + Neon Green
  const orange = '#ff6b00';
  const orangeBright = '#ff8c33';
  const neonGreen = '#39ff14';
  const neonGreenSoft = 'rgba(57, 255, 20, 0.35)';

  return (
    <div
      dir="rtl"
      className="min-h-screen relative flex items-center justify-center overflow-hidden"
      style={{
        background: '#050505',
      }}
    >
      {/* ========== HERO BACKGROUND (Woman) ========== */}
      <div className="absolute inset-0 z-0">
        <img
          src="/hero-woman.jpg"
          alt=""
          className="w-full h-full object-cover object-center scale-105"
          style={{
            filter: 'brightness(0.45) contrast(1.15) saturate(1.1)',
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* Dark cinematic overlays */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(90deg, rgba(5,5,5,0.92) 0%, rgba(5,5,5,0.55) 45%, rgba(5,5,5,0.75) 100%),
              linear-gradient(180deg, rgba(5,5,5,0.3) 0%, transparent 40%, rgba(5,5,5,0.85) 100%),
              radial-gradient(ellipse 80% 60% at 70% 40%, rgba(255,107,0,0.12), transparent 60%)
            `,
          }}
        />
        {/* Neon green accent glow bottom-left */}
        <div
          className="absolute bottom-0 left-0 w-[60%] h-[50%] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 20% 80%, rgba(57,255,20,0.08), transparent 55%)',
          }}
        />
      </div>

      {/* ========== FLOATING PARTICLES (CSS) ========== */}
      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${4 + (i % 4) * 3}px`,
              height: `${4 + (i % 4) * 3}px`,
              background: i % 3 === 0 ? neonGreen : orange,
              opacity: 0.25 + (i % 5) * 0.08,
              left: `${8 + i * 7.5}%`,
              top: `${12 + (i * 13) % 70}%`,
              boxShadow: `0 0 ${10 + i * 2}px ${i % 3 === 0 ? neonGreenSoft : 'rgba(255,107,0,0.4)'}`,
              animation: `floatParticle ${6 + (i % 5)}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
      </div>

      {/* ========== MAIN CONTENT ========== */}
      <div className="relative z-10 w-full max-w-[440px] px-4 py-10 flex flex-col items-center">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <img
            src="/v4.png"
            alt="Alpha GYM"
            className="mx-auto w-[150px] sm:w-[180px] h-auto object-contain"
            style={{
              filter: `
                drop-shadow(0 0 20px rgba(255,107,0,0.55))
                drop-shadow(0 0 40px rgba(57,255,20,0.25))
                drop-shadow(0 12px 30px rgba(0,0,0,0.6))
              `,
            }}
          />
          <h1
            className="mt-5 font-black tracking-[0.18em]"
            style={{
              fontSize: 'clamp(1.85rem, 5vw, 2.4rem)',
              background: `linear-gradient(180deg, #fff 0%, ${orangeBright} 40%, ${orange} 75%, #cc5500 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 4px 16px rgba(255,107,0,0.45))',
            }}
          >
            ALPHA GYM
          </h1>
          <p
            className="mt-2 text-[11px] sm:text-xs font-bold tracking-[0.32em] uppercase"
            style={{ color: neonGreen, textShadow: `0 0 12px ${neonGreenSoft}` }}
          >
            Management System
          </p>
        </div>

        {/* ========== 3D CARD ========== */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full relative transition-transform duration-200 ease-out"
          style={{
            perspective: '1200px',
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            className="w-full rounded-2xl p-7 sm:p-9 relative"
            style={{
              background: 'linear-gradient(165deg, rgba(18,18,18,0.92) 0%, rgba(10,10,10,0.97) 100%)',
              border: `1px solid rgba(255,107,0,0.35)`,
              boxShadow: `
                0 0 0 1px rgba(57,255,20,0.08),
                0 2px 0 0 rgba(255,107,0,0.2),
                0 25px 50px -12px rgba(0,0,0,0.85),
                0 0 60px -15px rgba(255,107,0,0.25),
                0 0 40px -10px rgba(57,255,20,0.12),
                inset 0 1px 0 0 rgba(255,255,255,0.06)
              `,
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(20px)`,
              transformStyle: 'preserve-3d',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Top neon line */}
            <div
              className="absolute top-0 right-10 left-10 h-[3px] rounded-b-full"
              style={{
                background: `linear-gradient(90deg, transparent, ${orange} 25%, ${neonGreen} 75%, transparent)`,
                opacity: 0.9,
                boxShadow: `0 0 12px ${orange}, 0 0 8px ${neonGreen}`,
              }}
            />

            {/* Side glow accents */}
            <div
              className="absolute -left-1 top-1/4 bottom-1/4 w-[3px] rounded-full"
              style={{
                background: `linear-gradient(180deg, transparent, ${orange}, transparent)`,
                opacity: 0.6,
                boxShadow: `0 0 15px ${orange}`,
              }}
            />

            <p
              className="text-center text-sm font-bold mb-6 tracking-wide"
              style={{
                color: '#ffd4a8',
                textShadow: '0 0 20px rgba(255,107,0,0.3)',
              }}
            >
              ورود به پنل مدیریت
            </p>

            {error && (
              <div
                className="mb-5 p-3.5 rounded-xl text-sm font-medium"
                style={{
                  background: 'rgba(248,113,113,0.12)',
                  color: '#fca5a5',
                  border: '1px solid rgba(248,113,113,0.3)',
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username */}
              <div>
                <label
                  className="block text-xs font-bold mb-2"
                  style={{ color: 'rgba(255,140,51,0.85)' }}
                >
                  نام کاربری
                </label>
                <div className="relative">
                  <User
                    size={17}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'rgba(255,107,0,0.55)' }}
                  />
                  <input
                    type="text"
                    className="w-full rounded-xl py-3.5 pr-11 pl-4 text-sm outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(0,0,0,0.55)',
                      border: '1px solid rgba(255,107,0,0.28)',
                      color: '#f5f5f5',
                      boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.45)',
                    }}
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = neonGreen;
                      e.currentTarget.style.boxShadow = `0 0 0 3px rgba(57,255,20,0.18), inset 0 2px 8px rgba(0,0,0,0.45)`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,107,0,0.28)';
                      e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0,0,0,0.45)';
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  className="block text-xs font-bold mb-2"
                  style={{ color: 'rgba(255,140,51,0.85)' }}
                >
                  رمز عبور
                </label>
                <div className="relative">
                  <Lock
                    size={17}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'rgba(255,107,0,0.55)' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full rounded-xl py-3.5 pr-11 pl-11 text-sm outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(0,0,0,0.55)',
                      border: '1px solid rgba(255,107,0,0.28)',
                      color: '#f5f5f5',
                      boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.45)',
                    }}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = neonGreen;
                      e.currentTarget.style.boxShadow = `0 0 0 3px rgba(57,255,20,0.18), inset 0 2px 8px rgba(0,0,0,0.45)`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,107,0,0.28)';
                      e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0,0,0,0.45)';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 p-0.5 transition-colors"
                    style={{ color: 'rgba(255,107,0,0.6)' }}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {/* Submit Button – Heavy 3D */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-3 py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.97] disabled:opacity-55"
                style={{
                  background: `linear-gradient(145deg, ${orangeBright} 0%, ${orange} 45%, #e05a00 100%)`,
                  color: '#0a0a0a',
                  border: '1px solid rgba(255,200,120,0.45)',
                  boxShadow: `
                    0 1px 0 0 rgba(255,255,255,0.3) inset,
                    0 7px 0 0 #b34a00,
                    0 14px 28px -4px rgba(255,107,0,0.55),
                    0 0 30px -6px rgba(57,255,20,0.2)
                  `,
                  transform: 'translateY(-2px)',
                  textShadow: '0 1px 0 rgba(255,255,255,0.2)',
                }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    در حال ورود...
                  </span>
                ) : (
                  <>
                    ورود به سیستم
                    <ArrowLeft size={18} strokeWidth={2.5} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <p
          className="text-center text-[10px] mt-8 font-semibold tracking-[0.28em]"
          style={{ color: 'rgba(255,255,255,0.28)' }}
        >
          ALPHA GYM · POWERED BY STRENGTH
        </p>
      </div>

      {/* Keyframes for particles */}
      <style>{`
        @keyframes floatParticle {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
          50% { transform: translateY(-28px) translateX(12px); opacity: 0.7; }
        }
        .animate-fade-in {
          animation: fadeIn 0.7s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
