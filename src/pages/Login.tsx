import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const navigate   = useNavigate();

  const [username,     setUsername]     = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

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
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4" dir="rtl">

      {/* LAYER 1: FULL BACKGROUND LOGO */}
      <div className="absolute inset-0">
        <img
          src="/IMG_20260525_112000_518.png"
          alt="آلفا جیم"
          className="w-full h-full object-cover scale-[0.95] opacity-100"
        />
      </div>

      {/* LAYER 2: DARK OVERLAY */}
      <div className="absolute inset-0 bg-black/70" />

      {/* LAYER 3: SOFT GRADIENT GLOW */}
      <div className="absolute inset-0">
        <div className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] bg-gold-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] bg-gold-500/10 rounded-full blur-3xl" />
      </div>

      {/* CONTENT */}
      <div className="relative z-10 w-full max-w-md">

        <div className="text-center mb-8">
          <h1 className="text-5xl font-black gold-text-gradient">آلفا جیم</h1>
          <p className="text-gray-300 mt-3 text-lg">سیستم مدیریت باشگاه هوشمند</p>
          <div className="w-24 h-1 gold-gradient rounded-full mx-auto my-6" />
          <p className="text-gray-400 leading-7 text-sm">
            مدیریت هوشمند، تمرکز بیشتر بر اعضا <br />
            تبدیل تلاش‌ها به دستاورد و افتخار
          </p>
        </div>

        <div className="glass-card p-8 backdrop-blur-xl bg-white/5 border border-white/10">
          <h2 className="text-xl font-bold text-white text-center mb-6">ورود به سیستم</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <Mail size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="نام کاربری"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-dark pr-11"
                required
              />
            </div>

            <div className="relative">
              <Lock size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="رمز عبور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-dark pr-11 pl-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button type="submit" disabled={loading} className="btn-gold w-full">
              {loading ? 'در حال ورود...' : 'ورود'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            برای دریافت دسترسی با مدیر سیستم تماس بگیرید
          </p>
        </div>
      </div>
    </div>
  );
}