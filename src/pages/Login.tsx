import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, ArrowLeft, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getActiveMemberCount } from '../services/memberService';

/** عدد اعضای فعال (شمارنده‌ی ورودی) — فقط یک عدد از endpoint عمومی، نه لیست اعضا */
function useActiveMembers(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const n = await getActiveMemberCount();
      if (alive) setCount(n);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return count;
}

function FlipCounter({ value }: { value: number }) {
  const len = String(value).length;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let cur = 0;
    const step = Math.max(1, Math.ceil(value / 45));
    const iv = window.setInterval(() => {
      cur = Math.min(value, cur + step);
      setShown(cur);
      if (cur >= value) window.clearInterval(iv);
    }, 35);
    return () => window.clearInterval(iv);
  }, [value]);
  const digits = String(shown).padStart(len, '0').split('');
  return (
    <div className="lg-fc" dir="ltr">
      {digits.map((d, i) => (
        <i key={i}>{d}</i>
      ))}
      <span>
        عضو فعال
        <small>در خانواده‌ی آلفا</small>
      </span>
    </div>
  );
}

/** صحنه‌ی عمق‌دار: پس‌زمینه، تابلوی نئونی و سوژه با سرعت‌های متفاوت حرکت می‌کنند */
function DepthScene({ entering }: { entering: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const l0 = useRef<HTMLImageElement>(null);
  const l1 = useRef<HTMLDivElement>(null);
  const l2 = useRef<HTMLImageElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const enteringRef = useRef(entering);
  enteringRef.current = entering;

  useEffect(() => {
    const box = boxRef.current;
    const stage = stageRef.current;
    const cv = cvRef.current;
    if (!box || !stage || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const layers = [l0.current, l1.current, l2.current];
    const K = [12, 24, 46];
    const Z = [1.12, 1.28, 1.55];
    let W = 800;
    let H = 800;
    const ps = Array.from({ length: 70 }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 800,
      r: Math.random() * 1.8 + 0.4,
      v: Math.random() * 0.7 + 0.25,
      a: Math.random() * 0.7 + 0.3,
      w: Math.random() * 6,
    }));
    const size = () => {
      W = cv.width = box.clientWidth || 800;
      H = cv.height = box.clientHeight || 800;
      const s = Math.max(W / 1178, H / 1094) * 1.1;
      stage.style.width = `${1178 * s}px`;
      stage.style.height = `${1094 * s}px`;
      stage.style.fontSize = `${(1178 * s) / 100}px`;
    };
    const ro = new ResizeObserver(size);
    ro.observe(box);
    size();
    let mx = 0;
    let my = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('mousemove', onMove);
    let cx = 0;
    let cy = 0;
    let z = 0;
    let t = 0;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      t += 0.016;
      const tx = mx + Math.sin(t * 0.5) * 0.1;
      const ty = my + Math.cos(t * 0.4) * 0.06;
      cx += (tx - cx) * 0.05;
      cy += (ty - cy) * 0.05;
      const go = enteringRef.current;
      z += ((go ? 1 : 0) - z) * 0.045;
      layers.forEach((l, i) => {
        if (l) l.style.transform = `translate(${-cx * K[i] * (1 + z)}px,${-cy * K[i] * 0.55}px) scale(${1 + z * (Z[i] - 1)})`;
      });
      ctx.clearRect(0, 0, W, H);
      ctx.shadowColor = '#ff6a00';
      ctx.shadowBlur = 8;
      ps.forEach((p) => {
        p.y -= p.v * (go ? 5 : 1);
        p.x += Math.sin(t + p.w) * 0.35 - cx * 0.8;
        if (p.y < -10 || p.x < -10 || p.x > W + 10) {
          p.x = Math.random() * W;
          p.y = H + 10;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.3);
        ctx.fillStyle = `rgba(255,${100 + Math.floor(p.w * 15)},0,${(p.a * (0.55 + 0.45 * Math.sin(t * 3 + p.w))).toFixed(2)})`;
        ctx.fill();
      });
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <div ref={boxRef} className="absolute inset-0">
      <div ref={stageRef} className="lg-stage">
        <img ref={l0} className="lg-ly" src="/login-bg.webp" alt="" draggable={false} />
        <div ref={l1} className="lg-neon lg-ly">
          <div>
            <span className="a">Alpha</span>
            <span className="b">GYM</span>
          </div>
        </div>
        <img ref={l2} className="lg-ly" src="/login-subject.webp" alt="" draggable={false} />
      </div>
      <canvas ref={cvRef} className="lg-canvas" />
    </div>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const activeCount = useActiveMembers();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');

  const formRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const orbRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const f = formRef.current;
    const c = cardRef.current;
    if (!f || !c) return;
    const r = f.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    c.style.transform = `perspective(1100px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg)`;
    orbRefs.current.forEach((el, i) => {
      if (el) el.style.transform = `translate(${-x * (30 + i * 20)}px,${-y * (24 + i * 14)}px)`;
    });
  };
  const handleMouseLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = '';
    orbRefs.current.forEach((el) => {
      if (el) el.style.transform = '';
    });
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

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setForgotMsg('لطفاً نام کاربری را وارد کنید');
      return;
    }
    setForgotMsg('لینک بازیابی رمز عبور برای شما ارسال شد. با پشتیبانی تماس بگیرید.');
  };

  const userField = (
    <div className="lg-fld">
      <User size={16} />
      <input
        type="text"
        placeholder="admin"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
    </div>
  );

  return (
    <div dir="rtl" className="lg-root">
      {/* عکس و صحنه‌ی باشگاه */}
      <div className="lg-brand">
        <DepthScene entering={loading} />
        <div className="lg-grain" />
        <div className="lg-ov">
          <h2 className="lg-slg">
            <b>قدرت</b>
            از اینجا ساخته می‌شود
          </h2>
          {activeCount !== null && activeCount > 0 && <FlipCounter value={activeCount} />}
        </div>
      </div>

      {/* فرم ورود شیشه‌ای */}
      <div ref={formRef} className="lg-form" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        <div className="lg-gwrap">
          <div className="lg-g3" />
        </div>
        {['lg-glow', 'lg-plate', 'lg-glow2'].map((c, i) => (
          <div
            key={c}
            className="lg-ow"
            ref={(el) => {
              orbRefs.current[i] = el;
            }}
          >
            <i className={c} />
          </div>
        ))}

        <button
          type="button"
          onClick={toggleTheme}
          className="absolute top-6 left-6 z-10 w-10 h-10 rounded-xl grid place-items-center"
          style={{ background: 'var(--glass)', border: '1px solid var(--lg-gb)', color: 'var(--text)', backdropFilter: 'blur(10px)' }}
          aria-label="تغییر تم"
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <div ref={cardRef} className="lg-card">
          <img src="/v5.png" alt="Alpha GYM" className="lg-logo" draggable={false} />

          {!showForgot ? (
            <>
              <h1 className="text-center text-3xl font-black" style={{ color: 'var(--text)' }}>
                خوش آمدید
              </h1>
              <p className="text-center text-sm mt-1.5 mb-5" style={{ color: 'var(--text)', opacity: 0.75 }}>
                برای ورود به پنل مدیریت باشگاه آلفا، اطلاعات حساب را وارد کنید.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                    نام کاربری
                  </label>
                  {userField}
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                    رمز عبور
                  </label>
                  <div className="lg-fld">
                    <Lock size={16} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="نمایش رمز">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-sm font-bold"
                    style={{ color: '#ff6a00' }}
                    onClick={() => {
                      setShowForgot(true);
                      setForgotMsg('');
                      setError('');
                    }}
                  >
                    فراموشی رمز؟
                  </button>
                </div>

                <button type="submit" disabled={loading} className="lg-btn">
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      در حال ورود...
                    </>
                  ) : (
                    <>
                      ورود به پنل
                      <ArrowLeft size={18} strokeWidth={2.5} />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-center text-2xl font-black" style={{ color: 'var(--text)' }}>
                بازیابی رمز عبور
              </h1>
              <p className="text-center text-sm mt-1.5 mb-5" style={{ color: 'var(--text)', opacity: 0.75 }}>
                نام کاربری خود را وارد کنید
              </p>
              {forgotMsg && (
                <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}>
                  {forgotMsg}
                </div>
              )}
              <form onSubmit={handleForgot} className="space-y-4">
                {userField}
                <button type="submit" className="lg-btn">
                  ارسال لینک بازیابی
                </button>
                <button
                  type="button"
                  className="w-full text-center text-sm"
                  style={{ color: 'var(--text)', opacity: 0.7 }}
                  onClick={() => {
                    setShowForgot(false);
                    setForgotMsg('');
                  }}
                >
                  بازگشت به ورود
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
