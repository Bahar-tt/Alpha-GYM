import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User } from 'lucide-react';

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
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: '#030303', fontFamily: "'Vazirmatn', sans-serif" }}
    >
      {/* ─── لوگو پس‌زمینه طلایی ─── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <img
          src="/v5.png"
          alt=""
          style={{
            width: '90vw',
            maxWidth: '600vh',
            opacity: 0.4,
            filter: 'sepia(1) saturate(4) hue-rotate(5deg) brightness(0.85) drop-shadow(0 0 80px rgba(212,168,67,0.7))',
            objectFit: 'cover',
          }}
        />
      </div>

      {/* ─── grid ─── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(212,168,67,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(212,168,67,0.025) 1px,transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />

      {/* ─── vignette ─── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 85% 85% at center,rgba(3,3,3,0.15) 0%,#030303 72%)' }}
      />

      {/* ─── glow ─── */}
      <div className="absolute pointer-events-none" style={{ top: -80, left: '50%', transform: 'translateX(-50%)', width: 500, height: 300, background: 'radial-gradient(ellipse,rgba(212,168,67,0.09) 0%,transparent 70%)' }} />
      <div className="absolute pointer-events-none" style={{ top: -60, right: -60, width: 300, height: 300, background: 'radial-gradient(circle,rgba(212,168,67,0.1) 0%,transparent 65%)' }} />
      <div className="absolute pointer-events-none" style={{ bottom: -60, left: -60, width: 260, height: 260, background: 'radial-gradient(circle,rgba(212,168,67,0.05) 0%,transparent 65%)' }} />

      {/* ─── کارت ─── */}
      <div className="relative z-10 w-full max-w-sm">

        {/* هدر */}
        <div className="text-center mb-2">
          {/* لوگو */}
          <img
            src="/v5.png"
            alt="Alpha GYM"
            style={{
              width: 280,
              height: 280,
              objectFit: 'contain',
              margin: '0 auto -50px',
              display: 'block',
              filter: 'sepia(1) saturate(4) hue-rotate(5deg) brightness(1.15) drop-shadow(0 0 20px rgba(212,168,67,0.7)) drop-shadow(0 0 6px rgba(212,168,67,0.4))',
            }}
          />

          {/* نام */}
          <h1
            style={{
              fontSize: '3rem',
              fontWeight: 1000,
              letterSpacing: 2,
              textTransform: 'uppercase',
              background: 'linear-gradient(135deg,#f8e898 0%,#d4a843 35%,#f0cc60 55%,#8b5e0a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0,
            }}
          >
            Alpha GYM
          </h1>

          <p style={{ fontSize: '0.62rem', color: 'rgba(255, 255, 255, 0.45)', letterSpacing: 3, textTransform: 'uppercase', marginTop: 4 }}>
            Smart Gym Management System
          </p>

          {/* separator */}
          <div className="flex items-center gap-2 mx-auto my-4" style={{ width: '50%' }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,rgba(212,168,67,0.22),transparent)' }} />
            <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(212,168,67,0.5)' }} />
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(212,168,67,0.22),transparent)' }} />
          </div>

          {/* badge */}
          <div
            className="inline-flex items-center gap-2"
            style={{
              background: 'rgba(212,168,67,0.04)',
              border: '1px solid rgba(212,168,67,0.12)',
              borderRadius: 20,
              padding: '4px 14px',
              fontSize: '0.65rem',
              color: 'rgba(237, 174, 24, 0.5)',
            }}
          >
            <span
              className="animate-pulse"
              style={{ width: 7, height: 7, borderRadius: '50%', background: '#d4cb1b', display: 'inline-block' }}
            />
            سیستم آنلاین
          </div>
        </div>

        {/* ─── فرم شیشه‌ای ─── */}
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(212,168,67,0.13)',
            borderRadius: 20,
            padding: '2rem 1.8rem',
            position: 'relative',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* corner brackets — چهار گوشه */}
          <span style={{ position: 'absolute', top: 10, right: 10, width: 15, height: 15, borderTop: '1px solid rgba(212,168,67,0.4)', borderRight: '1px solid rgba(212,168,67,0.4)' }} />
          <span style={{ position: 'absolute', top: 10, left: 10, width: 15, height: 15, borderTop: '1px solid rgba(212,168,67,0.4)', borderLeft: '1px solid rgba(212,168,67,0.4)' }} />
          <span style={{ position: 'absolute', bottom: 10, right: 10, width: 15, height: 15, borderBottom: '1px solid rgba(212,168,67,0.4)', borderRight: '1px solid rgba(212,168,67,0.4)' }} />
          <span style={{ position: 'absolute', bottom: 10, left: 10, width: 15, height: 15, borderBottom: '1px solid rgba(212,168,67,0.4)', borderLeft: '1px solid rgba(212,168,67,0.4)' }} />

          <p className="text-center mb-5" style={{ fontSize: '0.82rem', fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>
            ورود به پنل مدیریت
            <span style={{ display: 'block', width: 24, height: 1, background: 'rgba(240, 192, 79, 0.3)', margin: '6px auto 0' }} />
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* نام کاربری */}
            <div className="relative">
              <User size={15} className="absolute" style={{ right: 13, top: '50%', transform: 'translateY(-50%)', color: 'rgba(212,168,67,0.32)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="نام کاربری"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(212,168,67,0.1)',
                  borderRadius: 11,
                  padding: '13px 42px 13px 14px',
                  color: 'rgba(255,255,255,0.75)',
                  fontFamily: 'inherit', fontSize: '0.84rem', outline: 'none',
                  transition: 'border-color .2s, background .2s, box-shadow .2s',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(212,168,67,0.45)'; e.target.style.boxShadow = '0 0 0 3px rgba(212,168,67,0.07)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(212,168,67,0.1)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            {/* رمز عبور */}
            <div className="relative">
              <Lock size={15} className="absolute" style={{ right: 13, top: '50%', transform: 'translateY(-50%)', color: 'rgba(212,168,67,0.32)', pointerEvents: 'none' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="رمز عبور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(212,168,67,0.1)',
                  borderRadius: 11,
                  padding: '13px 42px 13px 42px',
                  color: 'rgba(255,255,255,0.75)',
                  fontFamily: 'inherit', fontSize: '0.84rem', outline: 'none',
                  transition: 'border-color .2s, background .2s, box-shadow .2s',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(212,168,67,0.45)'; e.target.style.boxShadow = '0 0 0 3px rgba(212,168,67,0.07)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(212,168,67,0.1)'; e.target.style.boxShadow = 'none'; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'rgba(212,168,67,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* دکمه ورود */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                marginTop: '6px',
                border: 'none',
                borderRadius: 11,
                fontFamily: 'inherit',
                fontSize: '0.88rem',
                fontWeight: 700,
                letterSpacing: '2px',
                cursor: loading ? 'not-allowed' : 'pointer',
                color: '#140a00',
                background: loading
                  ? 'rgba(212,168,67,0.4)'
                  : 'linear-gradient(135deg,#b8860b 0%,#d4a843 30%,#f0cc60 55%,#d4a843 75%,#8b5e0a 100%)',
                boxShadow: loading ? 'none' : '0 4px 24px rgba(212,168,67,0.28), inset 0 1px 0 rgba(255,255,255,0.2)',
                transition: 'transform .15s, box-shadow .15s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 36px rgba(212,168,67,0.45), inset 0 1px 0 rgba(255,255,255,0.2)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 24px rgba(212,168,67,0.28), inset 0 1px 0 rgba(255,255,255,0.2)';
              }}
              onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(1px)'; }}
              onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
            >
              {/* shine animation */}
              {!loading && (
                <span style={{
                  position: 'absolute', top: 0, left: '-100%', width: '55%', height: '100%',
                  background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)',
                  transform: 'skewX(-20deg)',
                  animation: 'shine 3s infinite',
                }} />
              )}
              <style>{`@keyframes shine{0%{left:-100%}20%,100%{left:150%}}`}</style>
              {loading ? 'در حال ورود...' : 'ورود به سیستم'}
            </button>
          </form>

          <p className="text-center mt-4" style={{ fontSize: '0.63rem', color: 'rgba(255, 255, 255, 0.34)' }}>
            برای دریافت دسترسی با مدیر سیستم تماس بگیرید
          </p>
        </div>
      </div>
    </div>
  );
}