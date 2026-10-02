import { Lock, Sparkles, Phone, ShieldCheck, RefreshCw, Cloud, Headphones, ChevronLeft } from 'lucide-react';

export const SUPPORT_PHONE = '09013447174';

export const commonLockBenefits = [
  { icon: RefreshCw, text: 'آپدیت‌های مستمر و نسخه‌های جدید' },
  { icon: Cloud, text: 'ذخیره‌سازی ابری امن اطلاعات' },
  { icon: Headphones, text: 'پشتیبانی و خط تلفن اختصاصی' },
  { icon: ShieldCheck, text: 'نگهداری سرور، دامنه و امنیت' },
];

interface Props {
  title: string;
  description: string;
  onBack: () => void;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  benefits?: Array<{ icon: React.ComponentType<{ size?: number | string; className?: string }>; text: string }>;
  activationNote?: string;
}

export default function FeatureLockedScreen({ title, description, onBack, icon: Icon, benefits, activationNote }: Props) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Icon className="text-gold-400" size={26} />
          {title}
        </h1>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
          <ChevronLeft size={16} /> بازگشت
        </button>
      </div>

      <div className="glass-card p-8 sm:p-12 flex flex-col items-center text-center max-w-2xl mx-auto">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-gold-500/30 to-gold-700/10 border border-gold-500/30 flex items-center justify-center mb-6">
          <Lock size={34} className="text-gold-400" />
        </div>
        <h2 className="text-2xl font-bold gold-text-gradient mb-3">{title}</h2>
        <p className="text-sm text-gray-400 leading-7 max-w-md mb-8">{description}</p>

        <div className="w-full max-w-md space-y-3 mb-8">
          {(benefits ?? commonLockBenefits).map((b) => (
            <div key={b.text} className="flex items-center gap-3 text-sm text-gray-300">
              <b.icon size={16} className="text-gold-400 shrink-0" />
              <span>{b.text}</span>
            </div>
          ))}
        </div>

        <div className="w-full max-w-md p-5 rounded-2xl border border-gold-500/20 bg-gold-500/5 mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles size={16} className="text-gold-400" />
            <span className="text-sm font-semibold text-gold-400">برای فعال‌سازی:</span>
          </div>
          <p className="text-xs text-gray-400 leading-6">{activationNote ?? 'برای فعال‌سازی با پشتیبانی تماس بگیرید'}</p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Phone size={16} className="text-gold-400" />
            <span dir="ltr" className="text-gold-400 font-bold">{SUPPORT_PHONE}</span>
          </div>
        </div>

        <button onClick={onBack} className="btn-outline-gold">بازگشت به داشبورد</button>
      </div>
    </div>
  );
}
