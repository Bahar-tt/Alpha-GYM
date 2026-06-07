import { useState } from 'react';
import { useAuth, type ManagedUser } from '../context/AuthContext';
import { type StaffRole } from '../lib/roles';
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
} from 'lucide-react';

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: StaffRole }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gold-500/10 text-gold-400 border border-gold-500/20">
      <ShieldCheck size={12} /> مدیر
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
      <User size={12} /> منشی
    </span>
  );
}

// ─── Create / Edit modal ──────────────────────────────────────────────────────

interface UserModalProps {
  editTarget?: ManagedUser | null;
  onClose: () => void;
}

function UserModal({ editTarget, onClose }: UserModalProps) {
  const { createUser, updateUserRole } = useAuth();
  const isEdit = !!editTarget;

  const [fullName,     setFullName]     = useState(editTarget?.full_name ?? '');
  const [username,     setUsername]     = useState(editTarget?.username  ?? '');
  const [password,     setPassword]     = useState('');
  const [role,         setRole]         = useState<StaffRole>(editTarget?.role ?? 'staff');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isEdit) {
      // In edit mode we only update the role (username/password change = separate flow)
      const { error: err } = updateUserRole(editTarget!.id, role);
      if (err) { setError(err); setLoading(false); return; }
    } else {
      const { error: err } = createUser({ username, password, full_name: fullName, role });
      if (err) { setError(err); setLoading(false); return; }
    }

    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md glass-card p-8 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? 'ویرایش دسترسی کاربر' : 'افزودن کاربر جدید'}
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
          {!isEdit && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">نام و نام خانوادگی</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-dark"
                  placeholder="مثال: علی رضایی"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">نام کاربری</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-dark"
                  placeholder="مثال: ali_rezaei"
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
            </>
          )}

          {isEdit && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10 mb-2">
              <p className="text-sm text-gray-300">
                <span className="text-gray-500 ml-1">کاربر:</span>
                {editTarget!.full_name}
              </p>
              <p className="text-xs text-gray-500 mt-1">@{editTarget!.username}</p>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-2">سطح دسترسی</label>
            <div className="grid grid-cols-2 gap-3">
              {(['admin', 'staff'] as StaffRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex items-center gap-2 p-3 rounded-xl border transition-all duration-200 text-sm ${
                    role === r
                      ? r === 'admin'
                        ? 'bg-gold-500/15 border-gold-500/50 text-gold-400'
                        : 'bg-blue-500/15 border-blue-500/50 text-blue-400'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                  }`}
                >
                  {r === 'admin' ? <ShieldCheck size={16} /> : <User size={16} />}
                  {r === 'admin' ? 'مدیر' : 'منشی'}
                  {role === r && <Check size={14} className="mr-auto" />}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {role === 'admin'
                ? 'دسترسی کامل به تمام بخش‌ها شامل مدیریت کاربران، گزارش‌ها و پخش پیام'
                : 'دسترسی به اعضا، تمدیدها و پیام‌رسانی — بدون دسترسی به بخش‌های مدیریتی'}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-gold w-full mt-2"
          >
            {loading ? 'در حال ذخیره...' : isEdit ? 'ذخیره تغییرات' : 'ایجاد کاربر'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Delete confirmation ──────────────────────────────────────────────────────

function DeleteConfirm({ target, onClose }: { target: ManagedUser; onClose: () => void }) {
  const { deleteUser } = useAuth();
  const [error, setError] = useState('');

  const handleDelete = () => {
    const { error: err } = deleteUser(target.id);
    if (err) { setError(err); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm glass-card p-6 animate-fade-in text-center">
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
            className="flex-1 px-6 py-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/30 transition-all duration-200 font-semibold"
          >
            حذف
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { users, user: currentUser } = useAuth();

  const [showCreate,    setShowCreate]    = useState(false);
  const [editTarget,    setEditTarget]    = useState<ManagedUser | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<ManagedUser | null>(null);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Users size={24} className="text-gold-400" />
            <h1 className="text-2xl font-bold text-white">مدیریت کاربران</h1>
          </div>
          <p className="text-gray-500 text-sm">افزودن، ویرایش و تنظیم سطح دسترسی کاربران سیستم</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-gold flex items-center gap-2 self-start sm:self-auto"
        >
          <UserPlus size={18} />
          افزودن کاربر
        </button>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold-500/10">
                <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">کاربر</th>
                <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">نام کاربری</th>
                <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">سطح دسترسی</th>
                <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">تاریخ عضویت</th>
                <th className="text-right text-xs text-gray-500 font-medium px-6 py-4">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="table-row">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-500/30 to-gold-700/10 flex items-center justify-center text-gold-400 text-sm font-bold">
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
                  <td className="px-6 py-4">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {new Date(u.created_at).toLocaleDateString('fa-IR')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditTarget(u)}
                        className="p-2 rounded-lg text-gray-400 hover:text-gold-400 hover:bg-gold-500/10 transition-all duration-200"
                        title="ویرایش دسترسی"
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

          {users.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-12">هیچ کاربری یافت نشد</p>
          )}
        </div>
      </div>

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
    </div>
  );
}