import { useEffect } from 'react';
import { X, Lock, Sparkles, Phone, ShieldCheck, RefreshCw, Cloud, Headphones } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

const SUPPORT_PHONE = '09013447174';

const benefits = [
  { icon: RefreshCw, text: 'آپدیت‌های مستمر و نسخه‌های جدید' },
  { icon: Cloud, text: 'ذخیره‌سازی ابری امن اطلاعات' },
  { icon: Headphones, text: 'پشتیبانی و خط تلفن اختصاصی' },
  { icon: ShieldCheck, text: 'نگهداری سرور، دامنه و امنیت' },
];

export default function FeatureLockModal({
  open,
  onClose,
  title = 'بخش ویژه',
  subtitle = 'این بخش با اشتراک ماهانه + هزینه فعال‌سازی در پکیج «مدیریت هوشمند» فعال می‌شود.',
}: Props) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="glass-card w-full max-w-md p-8 max-h-[calc(100vh-2rem)] overflow-y-auto relative">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 text-gray-500 hover:text-white transition-colors"
          title="بستن"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold-500/30 to-gold-700/10 border border-gold-500/30 flex items-center justify-center mb-4">
            <Lock size={28} className="text-gold-400" />
          </div>
          <h2 className="text-xl font-bold gold-text-gradient mb-2">{title}</h2>
          <p className="text-sm text-gray-400 leading-7 mb-6">{subtitle}</p>

          <div className="w-full space-y-3 mb-6">
            {benefits.map((b) => (
              <div key={b.text} className="flex items-center gap-3 text-sm text-gray-300">
                <b.icon size={16} className="text-gold-400 shrink-0" />
                <span>{b.text}</span>
              </div>
            ))}
          </div>

          <div className="w-full p-4 rounded-xl border border-gold-500/20 bg-gold-500/5 mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles size={16} className="text-gold-400" />
              <span className="text-sm font-semibold text-gold-400">برای فعال‌سازی:</span>
            </div>
            <p className="text-xs text-gray-400 leading-6">
              برای فعال‌سازی با پشتیبانی تماس بگیرید
            </p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Phone size={16} className="text-gold-400" />
              <span dir="ltr" className="text-gold-400 font-bold">{SUPPORT_PHONE}</span>
            </div>
          </div>

          <button onClick={onClose} className="btn-outline-gold w-full">
            فهمیدم
          </button>
        </div>
      </div>
    </div>
  );
}
