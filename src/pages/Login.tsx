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

  // 3D tilt – stronger
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    // Stronger tilt (max ~18deg)
    const rotateX = ((y - centerY) / centerY) * -18;
    const rotateY = ((x - centerX) / centerX) * 18;
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

  // Brand colors
  const orange = '#ff6b00';
  const orangeBright = '#ff8c33';
  const neonGreen = '#39ff14';
  const neonGreenSoft = 'rgba(57, 255, 20, 0.4)';

  return (
    <div
      dir="rtl"
      className="min-h-screen relative flex items-center justify-center overflow-hidden"
      style={{ background: '#030303' }}
    >
      {/* ========== HERO BACKGROUND – full visible woman ========== */}
      <div className="absolute inset-0 z-0">
        <img
          src="/hero-woman.jpg"
          alt=""
          className="w-full h-full object-cover"
          style={{
            objectPosition: 'center 20%',
            filter: 'brightness(0.62) contrast(1.12) saturate(1.15)',
            transform: 'scale(1.08)',
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />

        {/* Soft cinematic overlays – less aggressive so she stays clear */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(105deg, 
                rgba(3,3,3,0.88) 0%, 
                rgba(3,3,3,0.55) 38%, 
                rgba(3,3,3,0.35) 55%, 
                rgba(3,3,3,0.65) 100%
              ),
              linear-gradient(180deg, 
                rgba(3,3,3,0.25) 0%, 
                transparent 35%, 
                rgba(3,3,3,0.7) 100%
              ),
              radial-gradient(ellipse 70% 50% at 75% 45%, rgba(255,107,0,0.14), transparent 65%)
            `,
          }}
        />

        {/* Neon green ambient */}
        <div
          className="absolute bottom-0 left-0 w-[55%] h-[45%] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 15% 85%, rgba(57,255,20,0.1), transparent 55%)',
          }}
        />
      </div>

      {/* ========== FLOATING PARTICLES ========== */}
      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
        {[...Array(14)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${3 + (i % 5) * 2.5}px`,
              height: `${3 + (i % 5) * 2.5}px`,
              background: i % 3 === 0 ? neonGreen : orange,
              opacity: 0.22 + (i % 4) * 0.1,
              left: `${5 + i * 6.8}%`,
              top: `${8 + (i * 11) % 75}%`,
              boxShadow: `0 0 ${8 + i * 1.5}px ${i % 3 === 0 ? neonGreenSoft : 'rgba(255,107,0,0.45)'}`,
              animation: `floatParticle ${5.5 + (i % 6)}s ease-in-out infinite`,
              animationDelay: `${i * 0.35}s`,
            }}
          />
        ))}
      </div>

      {/* ========== MAIN CONTENT ========== */}
      <div className="relative z-10 w-full max-w-[430px] px-4 py-8 flex flex-col items-center">
        {/* Logo – no white box */}
        <div className="text-center mb-7 animate-fade-in">
          <img
            src="/v5.png"
            alt="Alpha GYM"
            className="mx-auto w-[145px] sm:w-[170px] h-auto object-contain"
            style={{
              filter: `
                drop-shadow(0 0 18px rgba(255,107,0,0.6))
                drop-shadow(0 0 36px rgba(57,255,20,0.28))
                drop-shadow(0 10px 28px rgba(0,0,0,0.7))
              `,
            }}
          />
          <h1
            className="mt-4 font-black tracking-[0.16em]"
            style={{
              fontSize: 'clamp(1.8rem, 5vw, 2.35rem)',
              background: `linear-gradient(180deg, #ffffff 0%, ${orangeBright} 38%, ${orange} 72%, #cc5500 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 3px 14px rgba(255,107,0,0.5))',
            }}
          >
            ALPHA GYM
          </h1>
          <p
            className="mt-1.5 text-[11px] sm:text-xs font-bold tracking-[0.3em] uppercase"
            style={{ color: neonGreen, textShadow: `0 0 14px ${neonGreenSoft}` }}
          >
            Management System
          </p>
        </div>

        {/* ========== 3D CARD – stronger tilt ========== */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full relative"
          style={{
            perspective: '1400px',
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            className="w-full rounded-2xl p-7 sm:p-8 relative transition-transform duration-150 ease-out"
            style={{
              background: 'linear-gradient(165deg, rgba(16,16,16,0.94) 0%, rgba(8,8,8,0.97) 100%)',
              border: `1px solid rgba(255,107,0,0.38)`,
              boxShadow: `
                0 0 0 1px rgba(57,255,20,0.1),
                0 2px 0 0 rgba(255,107,0,0.22),
                0 28px 55px -12px rgba(0,0,0,0.9),
                0 0 70px -12px rgba(255,107,0,0.3),
                0 0 45px -8px rgba(57,255,20,0.15),
                inset 0 1px 0 0 rgba(255,255,255,0.07)
              `,
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(30px)`,
              transformStyle: 'preserve-3d',
              backdropFilter: 'blur(18px)',
            }}
          >
            {/* Top neon line */}
            <div
              className="absolute top-0 right-8 left-8 h-[3px] rounded-b-full"
              style={{
                background: `linear-gradient(90deg, transparent, ${orange} 20%, ${neonGreen} 80%, transparent)`,
                opacity: 0.95,
                boxShadow: `0 0 14px ${orange}, 0 0 10px ${neonGreen}`,
              }}
            />

            {/* Side accent */}
            <div
              className="absolute -left-[2px] top-1/4 bottom-1/4 w-[3px] rounded-full"
              style={{
                background: `linear-gradient(180deg, transparent, ${orange}, transparent)`,
                opacity: 0.7,
                boxShadow: `0 0 18px ${orange}`,
              }}
            />

            <p
              className="text-center text-sm font-bold mb-6 tracking-wide"
              style={{
                color: '#ffd9b0',
                textShadow: '0 0 18px rgba(255,107,0,0.35)',
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
              {/* Username – dark input */}
              <div>
                <label
                  className="block text-xs font-bold mb-2"
                  style={{ color: 'rgba(255,140,51,0.9)' }}
                >
                  نام کاربری
                </label>
                <div className="relative">
                  <User
                    size={17}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'rgba(255,107,0,0.6)' }}
                  />
                  <input
                    type="text"
                    className="w-full rounded-xl py-3.5 pr-11 pl-4 text-sm outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(0,0,0,0.65)',
                      border: '1px solid rgba(255,107,0,0.32)',
                      color: '#f5f5f5',
                      boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
                    }}
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = neonGreen;
                      e.currentTarget.style.boxShadow = `0 0 0 3px rgba(57,255,20,0.2), inset 0 2px 8px rgba(0,0,0,0.5)`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,107,0,0.32)';
                      e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0,0,0,0.5)';
                    }}
                  />
                </div>
              </div>

              {/* Password – dark input */}
              <div>
                <label
                  className="block text-xs font-bold mb-2"
                  style={{ color: 'rgba(255,140,51,0.9)' }}
                >
                  رمز عبور
                </label>
                <div className="relative">
                  <Lock
                    size={17}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'rgba(255,107,0,0.6)' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full rounded-xl py-3.5 pr-11 pl-11 text-sm outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(0,0,0,0.65)',
                      border: '1px solid rgba(255,107,0,0.32)',
                      color: '#f5f5f5',
                      boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
                    }}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = neonGreen;
                      e.currentTarget.style.boxShadow = `0 0 0 3px rgba(57,255,20,0.2), inset 0 2px 8px rgba(0,0,0,0.5)`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,107,0,0.32)';
                      e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0,0,0,0.5)';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 p-0.5 transition-colors"
                    style={{ color: 'rgba(255,107,0,0.65)' }}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {/* Submit – orange + neon green glow */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-3 py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.97] disabled:opacity-55"
                style={{
                  background: `linear-gradient(145deg, ${orangeBright} 0%, ${orange} 45%, #e05a00 100%)`,
                  color: '#0a0a0a',
                  border: '1px solid rgba(255,200,120,0.5)',
                  boxShadow: `
                    0 1px 0 0 rgba(255,255,255,0.28) inset,
                    0 7px 0 0 #b34a00,
                    0 16px 32px -4px rgba(255,107,0,0.6),
                    0 0 28px -2px rgba(57,255,20,0.35)
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
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          ALPHA GYM · POWERED BY STRENGTH
        </p>
      </div>

      <style>{`
        @keyframes floatParticle {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.25; }
          50% { transform: translateY(-32px) translateX(14px); opacity: 0.75; }
        }
        .animate-fade-in {
          animation: fadeIn 0.7s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
