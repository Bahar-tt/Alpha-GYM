import Link from 'next/link';
import { Printer, MapPin, Phone, Mail, Clock, Sparkles, ArrowUpLeft } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-gradient-to-b from-background via-accent/10 to-accent/20">
      {/* Decorative gradient */}
      <div className="absolute -top-px right-0 h-px w-1/2 bg-gradient-to-l from-primary/40 to-transparent" />

      <div className="container mx-auto px-4 py-14 md:px-6 md:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* About */}
          <div className="space-y-4">
            <Link href="/" className="group flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-3 text-primary-foreground shadow-lg shadow-primary/25 transition-transform group-hover:scale-105">
                <Printer className="h-5 w-5" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-xl font-extrabold text-foreground">نترینو</span>
                <span className="mt-0.5 text-[10px] font-medium tracking-wider text-muted-foreground">
                  چاپ و طراحی گرافیک
                </span>
              </div>
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground">
              نترینو، کافی‌نت تخصصی چاپ و طراحی گرافیک با بیش از ۷ سال تجربه. خدمات حضوری و غیرحضوری
              با کیفیت بالا و قیمت منصفانه.
            </p>
            <div className="flex gap-2">
              {['اینستاگرام', 'تلگرام', 'لینکدین'].map((social) => (
                <span
                  key={social}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                >
                  {social}
                </span>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-foreground">دسترسی سریع</h3>
            <ul className="space-y-2.5 text-sm">
              {[
                { href: '/', label: 'خانه' },
                { href: '/services', label: 'خدمات' },
                { href: '/portfolio', label: 'نمونه‌کارها' },
                { href: '/order', label: 'سفارش آنلاین' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
                  >
                    <span className="h-px w-0 bg-primary transition-all duration-300 group-hover:w-4" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-foreground">اطلاعات تماس</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>تهران، خیابان ولیعصر، نبش کوچه گلستان، پلاک ۱۲</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-primary" />
                <span dir="ltr">۰۲۱-۸۸۷۷۶۶۵۵</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-primary" />
                <span dir="ltr">info@netrino.ir</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>شنبه تا پنجشنبه، ۹ تا ۲۱</span>
              </li>
            </ul>
          </div>

          {/* Neurosh sister brand */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-foreground">برند خواهر تخصصی</h3>
            <a
              href="https://neurosh.ir"
              target="_blank"
              rel="noopener noreferrer"
              className="group block overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-accent/20 p-5 transition-all hover:border-primary/30 hover:shadow-lg"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-chart-3 text-primary-foreground shadow-md transition-transform group-hover:scale-110">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-foreground">Neurosh</span>
                    <ArrowUpLeft className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                  <span className="text-[10px] font-medium tracking-wider text-muted-foreground">
                    اتوماسیون و هوش مصنوعی
                  </span>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                نوروش، برند خواهر تخصصی نترینو در حوزه‌ی اتوماسیون و هوش مصنوعی. ما با ترکیب خلاقیت
                انسانی و قدرت هوش مصنوعی، راه‌حل‌های نوآورانه برای کسب‌وکار شما طراحی می‌کنیم.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary transition-colors group-hover:text-chart-3">
                مشاهده وب‌سایت نوروش
                <ArrowUpLeft className="h-3 w-3" />
              </span>
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-border pt-6">
          <div className="flex flex-col items-center justify-between gap-3 text-center md:flex-row md:text-right">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} نترینو. تمامی حقوق محفوظ است.
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              طراحی و توسعه توسط تیم نترینو
              <span className="text-border">|</span>
              <span>
                Powered by{' '}
                <a
                  href="https://neurosh.ir"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-primary transition-colors hover:text-chart-3"
                >
                  Neurosh
                </a>
              </span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
