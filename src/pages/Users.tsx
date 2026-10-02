import { useEffect, useMemo, useState } from 'react';
import { useAuth, type ManagedUser } from '../context/AuthContext';


import { type StaffRole } from '../lib/roles';
import { apiGet, type ApiAuditLog } from '../services/api';
import {
  Users,
  UserPlus,
  Pencil,
  Trash2,
  ShieldCheck,
  User,
  Eye,
  EyeOff,
  X,
  Check,
  AlertTriangle,
  Lock,
  LogIn,
  LogOut,
  Search,
  RefreshCw,
  History,
  UserCog,
  KeyRound,
} from 'lucide-react';

// ─── تنظیمات برچسب فعالیت ─────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; dot: string }> = {
  'auth.login':         { label: 'ورود به سیستم',     dot: 'bg-emerald-400' },
  'auth.logout':        { label: 'خروج از سیستم',     dot: 'bg-gray-500' },
  'auth.password_change': { label: 'تغییر رمز عبور',   dot: 'bg-gold-400' },
  'user.create':        { label: 'افزودن کاربر',       dot: 'bg-gold-400' },
  'user.update':        { label: 'ویرایش کاربر',       dot: 'bg-gold-400' },
  'user.delete':        { label: 'حذف کاربر',          dot: 'bg-red-400' },
  'user.password_reset': { label: 'بازنشانی رمز کاربر', dot: 'bg-gold-400' },
  'member.create':      { label: 'افزودن عضو',         dot: 'bg-emerald-400' },
  'member.update':      { label: 'ویرایش عضو',         dot: 'bg-blue-400' },
  'member.delete':      { label: 'حذف عضو',            dot: 'bg-red-400' },
  'renewal.create':     { label: 'تمدید اشتراک',       dot: 'bg-purple-400' },
  'sms.send':           { label: 'ارسال پیام',         dot: 'bg-sky-400' },
  'sms.broadcast':      { label: 'پیام گروهی',         dot: 'bg-sky-400' },
  'accounting.payment':         { label: 'ثبت پرداخت',        dot: 'bg-gold-400' },
  'accounting.payment_delete':  { label: 'حذف پرداخت',        dot: 'bg-red-400' },
  'accounting.expense':         { label: 'ثبت هزینه',         dot: 'bg-red-400' },
  'accounting.expense_update':  { label: 'ویرایش هزینه',      dot: 'bg-gold-400' },
  'accounting.expense_delete':  { label: 'حذف هزینه',         dot: 'bg-red-400' },
  'accounting.coach':           { label: 'افزودن مربی',       dot: 'bg-emerald-400' },
  'accounting.coach_update':    { label: 'ویرایش مربی',       dot: 'bg-gold-400' },
  'accounting.coach_delete':    { label: 'غیرفعال‌سازی مربی',  dot: 'bg-red-400' },
  'accounting.coach_settle':    { label: 'تسویه مربی',        dot: 'bg-emerald-400' },
  'coach_session.create': { label: 'ثبت جلسه مربی',   dot: 'bg-emerald-400' },
  'coach_session.update': { label: 'به‌روزرسانی جلسه', dot: 'bg-gold-400' },
  'coach_session.delete': { label: 'حذف جلسه',        dot: 'bg-red-400' },
  'workout_program.create': { label: 'ثبت برنامه تمرینی', dot: 'bg-emerald-400' },
  'workout_program.update': { label: 'ویرایش برنامه تمرینی', dot: 'bg-gold-400' },
  'workout_program.delete': { label: 'حذف برنامه تمرینی', dot: 'bg-red-400' },
  'coach_plan.create': { label: 'ثبت اشتراک مربی',    dot: 'bg-emerald-400' },
  'coach_plan.update': { label: 'به‌روزرسانی اشتراک مربی', dot: 'bg-gold-400' },
  'message.create':       { label: 'ارسال پیام هوشمند', dot: 'bg-sky-400' },
  'message.delete':       { label: 'حذف پیام',        dot: 'bg-red-400' },
};

function actionMeta(action: string) {
  return ACTION_META[action] || { label: action, dot: 'bg-gray-500' };
}

// ─── نقش ─────────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: StaffRole }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gold-500/10 text-gold-400 border border-gold-500/20">
        <ShieldCheck size={12} /> مدیر
      </span>
    );
  }
  if (role === 'coach') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
        <User size={12} /> مربی
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
      <User size={12} /> منشی
    </span>
  );
}

// ─── فرمت زمان ───────────────────────────────────────────────────────────────

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch {
    return String(iso);
  }
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
  } catch {
    return String(iso);
  }
}

// ─── مودال ایجاد / ویرایش کاربر ──────────────────────────────────────────────

interface UserModalProps {
  editTarget?: ManagedUser | null;
  onClose: () => void;
}

function UserModal({ editTarget, onClose }: UserModalProps) {
  const { createUser, updateUser } = useAuth();
  const isEdit = !!editTarget;

  const [fullName,     setFullName]     = useState(editTarget?.full_name ?? '');
  const [username,     setUsername]     = useState(editTarget?.username  ?? '');
  const [password,     setPassword]     = useState('');
  const [confirmPw,    setConfirmPw]    = useState('');
  const [role,         setRole]         = useState<StaffRole>(editTarget?.role ?? 'staff');
  const [isActive,     setIsActive]     = useState<boolean>(editTarget?.is_active ?? true);
  const [showPassword, setShowPassword] = useState(false);
  const [changePw,     setChangePw]     = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isEdit) {
      if (changePw && password && password !== confirmPw) {
        setError('تکرار رمز عبور مطابقت ندارد');
        return;
      }
      if (changePw && password && password.length < 6) {
        setError('رمز عبور باید حداقل ۶ کاراکتر باشد');
        return;
      }
    } else {
      if (password.length < 6) {
        setError('رمز عبور باید حداقل ۶ کاراکتر باشد');
        return;
      }
      if (password !== confirmPw) {
        setError('تکرار رمز عبور مطابقت ندارد');
        return;
      }
    }

    setLoading(true);
    if (isEdit) {
      const payload: { full_name?: string; role?: StaffRole; is_active?: boolean; password?: string } = {
        full_name: fullName,
        role,
        is_active: isActive,
      };
      if (changePw && password) payload.password = password;
      const { error: err } = await updateUser(editTarget!.id, payload);
      if (err) { setError(err); setLoading(false); return; }
    } else {
      const { error: err } = await createUser({ username, password, full_name: fullName, role });
      if (err) { setError(err); setLoading(false); return; }
    }
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md glass-card p-8 animate-fade-in"
        style={{ maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <UserCog size={18} className="text-gold-400" />
            {isEdit ? 'ویرایش کاربر' : 'افزودن کاربر جدید'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">نام و نام خانوادگی</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-dark placeholder:text-xs"
              placeholder="نام و نام خانوادگی خود را وارد کنید"
              required
            />
          </div>

          {!isEdit && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">نام کاربری</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-dark placeholder:text-xs"
                  placeholder="نام کاربری خود را وارد کنید"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">رمز عبور</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-dark pl-11"
                    placeholder="حداقل ۶ کاراکتر"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">تکرار رمز عبور</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="input-dark"
                  placeholder="تکرار رمز عبور"
                  minLength={6}
                  required
                />
              </div>
            </>
          )}

          {isEdit && (
            <>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-sm text-gray-300">
                  <span className="text-gray-500 ml-1">کاربر:</span>
                  {editTarget!.full_name}
                </p>
                <p className="text-xs text-gray-500 mt-1">@{editTarget!.username}</p>
              </div>

              {/* وضعیت فعال / غیرفعال */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">وضعیت حساب</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsActive(true)}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-200 text-sm ${
                      isActive
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <Check size={15} /> فعال
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsActive(false)}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-200 text-sm ${
                      !isActive
                        ? 'bg-red-500/15 border-red-500/50 text-red-400'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <X size={15} /> غیرفعال
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  با غیرفعال‌کردن حساب، دسترسی کاربر بلافاصله قطع می‌شود.
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => { setChangePw(!changePw); setPassword(''); setConfirmPw(''); }}
                  className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-200 text-sm ${
                    changePw
                      ? 'bg-gold-500/15 border-gold-500/50 text-gold-400'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                  }`}
                >
                  <KeyRound size={15} />
                  {changePw ? 'انصراف از تغییر رمز عبور' : 'بازنشانی رمز عبور'}
                </button>
              </div>
              {changePw && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">رمز عبور جدید</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-dark pl-11"
                        placeholder="حداقل ۶ کاراکتر"
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">تکرار رمز عبور جدید</label>
                    <input
                      type="password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      className="input-dark"
                      placeholder="تکرار رمز عبور جدید"
                      minLength={6}
                    />
                  </div>
                </>
              )}
            </>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-2">سطح دسترسی</label>
            <div className="grid grid-cols-3 gap-3">
              {(['admin', 'staff', 'coach'] as StaffRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={r === 'coach'}
                  onClick={() => setRole(r)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all duration-200 text-sm ${
                    role === r
                      ? r === 'admin'
                        ? 'bg-gold-500/15 border-gold-500/50 text-gold-400'
                        : 'bg-blue-500/15 border-blue-500/50 text-blue-400'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                  } ${r === 'coach' ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {r === 'admin' ? <ShieldCheck size={16} /> : <User size={16} />}
                  {r === 'admin' ? 'مدیر' : r === 'coach' ? 'مربی' : 'منشی'}
                  {role === r && <Check size={14} />}
                  {r === 'coach' && <span className="text-[10px] text-gray-600">به‌زودی</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {role === 'admin'
                ? 'دسترسی کامل به تمام بخش‌ها شامل مدیریت کاربران، گزارش‌ها و پخش پیام'
                : 'دسترسی به اعضا، تمدیدها و پیام‌رسانی — بدون دسترسی به بخش‌های مدیریتی'}
            </p>
          </div>

          <button type="submit" disabled={loading} className="btn-gold w-full mt-2">
            {loading ? 'در حال ذخیره...' : isEdit ? 'ذخیره تغییرات' : 'ایجاد کاربر'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── مودال تغییر رمز عبور شخصی ────────────────────────────────────────────────

function PasswordModal({ onClose }: { onClose: () => void }) {
  const { changePassword, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 6) { setError('رمز عبور جدید باید حداقل ۶ کاراکتر باشد'); return; }
    if (next !== confirm) { setError('تکرار رمز عبور مطابقت ندارد'); return; }
    setLoading(true);
    const { error: err } = await changePassword(current, next);
    setLoading(false);
    if (err) { setError(err); return; }
    setSuccess(true);
    setTimeout(() => {
      onClose();
      signOut();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md glass-card p-8 animate-fade-in"
        style={{ maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Lock size={18} className="text-gold-400" /> تغییر رمز عبور
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {success && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
            <Check size={16} /> رمز عبور با موفقیت تغییر کرد. در حال خروج...
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">رمز عبور فعلی</label>
            <input
              type={show ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="input-dark"
              placeholder="رمز عبور فعلی"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">رمز عبور جدید</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="input-dark pl-11"
                placeholder="حداقل ۶ کاراکتر"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">تکرار رمز عبور جدید</label>
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input-dark"
              placeholder="تکرار رمز عبور جدید"
              minLength={6}
              required
            />
          </div>
          <button type="submit" disabled={loading || success} className="btn-gold w-full mt-2">
            {loading ? 'در حال ذخیره...' : 'ذخیره رمز عبور'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── حذف کاربر ───────────────────────────────────────────────────────────────

function DeleteConfirm({ target, onClose }: { target: ManagedUser; onClose: () => void }) {
  const { deleteUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    const { error: err } = await deleteUser(target.id);
    setLoading(false);
    if (err) { setError(err); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm glass-card p-6 animate-fade-in text-center"
        style={{ maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}
      >
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={22} className="text-red-400" />
        </div>
        <h3 className="text-white font-bold mb-1">حذف کاربر</h3>
        <p className="text-gray-400 text-sm mb-4">
          آیا از حذف <span className="text-white">{target.full_name}</span> مطمئن هستید؟
          این عمل قابل بازگشت نیست.
        </p>
        {error && (
          <p className="text-red-400 text-sm mb-3 flex items-center justify-center gap-1">
            <AlertTriangle size={14} /> {error}
          </p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-outline-gold flex-1">انصراف</button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex-1 px-6 py-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/30 transition-all duration-200 font-semibold"
          >
            {loading ? '...' : 'حذف'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── گزارش فعالیت ────────────────────────────────────────────────────────────

function ActivityIcon({ action }: { action: string }) {
  if (action === 'auth.login') return <LogIn size={14} />;
  if (action === 'auth.logout') return <LogOut size={14} />;
  if (action === 'member.delete' || action === 'user.delete') return <Trash2 size={14} />;
  if (action === 'member.create' || action === 'user.create') return <UserPlus size={14} />;
  if (action === 'member.update') return <Pencil size={14} />;
  if (action === 'renewal.create') return <RefreshCw size={14} />;
  if (action.includes('password')) return <KeyRound size={14} />;
  if (action.startsWith('user')) return <UserCog size={14} />;
  return <History size={14} />;
}

function ActivityLogs() {
  const { users } = useAuth();
  const [logs, setLogs] = useState<ApiAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error: err } = await apiGet<ApiAuditLog[]>('/audit-logs?limit=300');
    if (data) setLogs(data);
    if (err) setError(err);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))), [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (actorFilter && l.actor_name !== actorFilter) return false;
      if (actionFilter && l.action !== actionFilter) return false;
      return true;
    });
  }, [logs, actorFilter, actionFilter]);

  return (
    <div className="space-y-4">
      {/* فیلترها */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="input-dark pr-9"
          >
            <option value="">همه کاربران</option>
            {users.map((u) => (
              <option key={u.id} value={u.full_name}>{u.full_name}</option>
            ))}
          </select>
        </div>
        <div className="relative flex-1">
          <History size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="input-dark pr-9"
          >
            <option value="">همه فعالیت‌ها</option>
            {actions.map((a) => (
              <option key={a} value={a}>{actionMeta(a).label}</option>
            ))}
          </select>
        </div>
        <button onClick={load} className="btn-outline-gold flex items-center gap-2 justify-center">
          <RefreshCw size={15} /> به‌روزرسانی
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-16">فعالیتی ثبت نشده است</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => {
            const meta = actionMeta(log.action);
            const memberName =
              log.entity_type === 'member' && log.detail && typeof log.detail.name === 'string'
                ? log.detail.name
                : null;
            return (
              <div
                key={log.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gold-400 shrink-0">
                  <ActivityIcon action={log.action} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">
                      {log.actor_name || 'سیستم'}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                    <span className="text-sm text-gray-400">{meta.label}</span>
                    {log.entity_type === 'member' && memberName && (
                      <span className="text-xs text-gray-500">
                        — عضو: <span className="text-gray-300">{memberName}</span>
                      </span>
                    )}
                    {log.entity_type === 'sms_log' && log.detail && typeof log.detail.phone === 'string' && (
                      <span className="text-xs text-gray-500">— {String(log.detail.phone)}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-500 shrink-0">{fmtTime(log.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── صفحه اصلی ───────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { users, user: currentUser, refreshUsers } = useAuth();
  const [tab, setTab] = useState<'users' | 'activity'>('users');
  const [search, setSearch] = useState('');
  const [showCreate,   setShowCreate]   = useState(false);
  const [editTarget,   setEditTarget]   = useState<ManagedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => { refreshUsers(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Users size={24} className="text-gold-400" />
            <h1 className="text-2xl font-bold text-white">مدیریت کاربران</h1>
          </div>
          <p className="text-gray-500 text-sm">مدیریت حساب‌های کاربری و گزارش فعالیت اعضای تیم</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPassword(true)}
            className="btn-outline-gold flex items-center gap-2"
          >
            <KeyRound size={16} />
            تغییر رمز من
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-gold flex items-center gap-2"
          >
            <UserPlus size={18} />
            افزودن کاربر
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
            tab === 'users'
              ? 'bg-gold-500/15 border-gold-500/40 text-gold-400'
              : 'bg-white/[0.03] border-white/10 text-gray-400 hover:border-white/20'
          }`}
        >
          <UserCog size={16} /> کاربران
          <span className="text-xs opacity-70">({users.length})</span>
        </button>
        <button
          onClick={() => setTab('activity')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
            tab === 'activity'
              ? 'bg-gold-500/15 border-gold-500/40 text-gold-400'
              : 'bg-white/[0.03] border-white/10 text-gray-400 hover:border-white/20'
          }`}
        >
          <History size={16} /> گزارش فعالیت
        </button>
      </div>

      {tab === 'users' ? (
        <div className="glass-card overflow-hidden">
          {/* نوار جستجو */}
          <div className="p-4 border-b border-gold-500/10">
            <div className="relative max-w-sm">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-dark pr-9"
                placeholder="جستجوی نام یا نام کاربری..."
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gold-500/10">
                  <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">کاربر</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">نام کاربری</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">سطح دسترسی</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">وضعیت</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">آخرین ورود</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">تاریخ عضویت</th>
                  <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="table-row">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                          u.role === 'admin'
                            ? 'bg-gradient-to-br from-gold-500/30 to-gold-700/10 text-gold-400'
                            : 'bg-gradient-to-br from-blue-500/30 to-blue-700/10 text-blue-400'
                        }`}>
                          {u.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{u.full_name}</p>
                          {u.id === currentUser?.id && (
                            <p className="text-xs text-gold-500/70">(حساب شما)</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">@{u.username}</td>
                    <td className="px-6 py-4"><RoleBadge role={u.role} /></td>
                    <td className="px-6 py-4">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> فعال
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> غیرفعال
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">{fmtTime(u.last_login_at)}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">{fmtDate(u.created_at)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditTarget(u)}
                          className="p-2 rounded-lg text-gray-400 hover:text-gold-400 hover:bg-gold-500/10 transition-all duration-200"
                          title="ویرایش کاربر"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u)}
                          disabled={u.id === currentUser?.id}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="حذف کاربر"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-12">هیچ کاربری یافت نشد</p>
            )}
          </div>
        </div>
      ) : (
        <ActivityLogs />
      )}

      {/* Modals */}
      {showCreate && (
        <UserModal onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <UserModal editTarget={editTarget} onClose={() => setEditTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteConfirm target={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
      {showPassword && (
        <PasswordModal onClose={() => setShowPassword(false)} />
      )}
    </div>
  );
}
