/** فیلدهای مشترک ثبت عضو / مربی */
export interface ProfileExtras {
  has_insurance: boolean;
  insurance_notes: string;
  referrer_name: string;
  referral_source: string;
  training_goal: string;
  photo_url: string;
}

export const emptyExtras = (): ProfileExtras => ({
  has_insurance: false,
  insurance_notes: '',
  referrer_name: '',
  referral_source: '',
  training_goal: '',
  photo_url: '',
});

const SOURCES = ['اینستاگرام', 'معرف', 'گوگل', 'تبلیغات', 'پیاده‌روی / همسایه', 'سایر'];

export default function ProfileExtrasFields({
  value,
  onChange,
}: {
  value: ProfileExtras;
  onChange: (v: ProfileExtras) => void;
}) {
  const set = (patch: Partial<ProfileExtras>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
        اطلاعات تکمیلی
      </p>

      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
        <input
          type="checkbox"
          checked={value.has_insurance}
          onChange={(e) => set({ has_insurance: e.target.checked })}
        />
        بیمه ورزشی دارد
      </label>

      {value.has_insurance && (
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            توضیحات بیمه
          </label>
          <input
            className="input-field"
            placeholder="شماره بیمه‌نامه، شرکت، تاریخ انقضا..."
            value={value.insurance_notes}
            onChange={(e) => set({ insurance_notes: e.target.value })}
          />
        </div>
      )}

      <div>
        <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          نام معرف
        </label>
        <input
          className="input-field"
          value={value.referrer_name}
          onChange={(e) => set({ referrer_name: e.target.value })}
          placeholder="نام کسی که معرفی کرده"
        />
      </div>

      <div>
        <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          منبع آشنایی
        </label>
        <select
          className="input-field"
          value={value.referral_source}
          onChange={(e) => set({ referral_source: e.target.value })}
        >
          <option value="">انتخاب کنید</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          هدف تمرینی
        </label>
        <input
          className="input-field"
          placeholder="مثلاً کاهش وزن، حجم، آمادگی مسابقه..."
          value={value.training_goal}
          onChange={(e) => set({ training_goal: e.target.value })}
        />
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
          برای پیامک و پیام شخصی‌سازی‌شده استفاده می‌شود
        </p>
      </div>

      <div>
        <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          لینک عکس (برای کارت عضویت)
        </label>
        <input
          className="input-field"
          dir="ltr"
          placeholder="https://..."
          value={value.photo_url}
          onChange={(e) => set({ photo_url: e.target.value })}
        />
      </div>
    </div>
  );
}
