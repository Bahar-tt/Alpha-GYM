import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isRegister) {
      const { error: err } = await signUp(email, password, fullName);
      if (err) setError(err);
      else {
        setError('');
        setIsRegister(false);
      }
    } else {
      const { error: err } = await signIn(email, password);
      if (err) setError(err);
      else navigate('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#050505] flex" dir="rtl">
      {/* Right side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-gold-500/10 via-transparent to-transparent" />
        <div className="absolute inset-0">
          {/* Decorative grid */}
          <div className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: 'linear-gradient(rgba(212,168,67,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(212,168,67,0.3) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          <img
            src="/IMG_20260525_112000_518.png"
            alt="آلفا جیم"
            className="w-40 h-40 object-contain mb-8 animate-pulse-gold"
          />
          <h1 className="text-5xl font-black gold-text-gradient mb-4">آلفا جیم</h1>
          <p className="text-xl text-gray-400 mb-2">سیستم مدیریت باشگاه هوشمند</p>
          <div className="w-24 h-1 gold-gradient rounded-full my-6" />
          <p className="text-gray-500 text-center max-w-md leading-7">
            قدرت را لمس کن.
          با سیستم پیشرفته مدیریت باشگاه، شکوه قدرت و تفاوت را احساس کن  .
          </p>
          {/* Stats preview */}
          <div className="flex gap-8 mt-12">
            {[
              { label: 'اعضای فعال', value: '۵۰۰۰+' },
              { label: 'مربیان حرفه‌ای', value: '۲۰+' },
              { label: 'سال تجربه', value: '۱۵' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold gold-text-gradient">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Left side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <img
              src="/IMG_20260525_112000_518.png"
              alt="آلفا جیم"
              className="w-24 h-24 object-contain mb-4 animate-pulse-gold"
            />
            <h1 className="text-3xl font-black gold-text-gradient">آلفا جیم</h1>
          </div>

          <div className="glass-card p-8">
            <h2 className="text-2xl font-bold text-white mb-2">
              {isRegister ? 'ایجاد حساب' : 'ورود به سیستم'}
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              {isRegister ? 'حساب جدید بسازید و شروع کنید' : 'به پنل مدیریت آلفا جیم خوش آمدید'}
            </p>
            {!isRegister && (
              <p className="text-gray-600 text-xs mb-6 leading-6">
                مدیر: admin@alpha.local / admin123 — منشی: staff@alpha.local / staff123
              </p>
            )}
            {isRegister && <div className="mb-6" />}

            {error && (
              <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {isRegister && (
                <div className="relative">
                  <User size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="نام و نام خانوادگی"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input-dark pr-11"
                    required
                  />
                </div>
              )}

              <div className="relative">
                <Mail size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  placeholder="ایمیل"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-dark pr-11"
                  required
                />
              </div>

              <div className="relative">
                <Lock size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500" />
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
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : isRegister ? (
                  'ایجاد حساب'
                ) : (
                  'ورود'
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                }}
                className="text-sm text-gray-500 hover:text-gold-400 transition-colors"
              >
                {isRegister ? 'حساب دارید؟ وارد شوید' : 'حساب ندارید؟ ثبت‌نام کنید'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

