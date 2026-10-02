import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  Star,
  Users,
  Award,
  Clock,
  CheckCircle2,
  Sparkles,
  Printer,
  PenTool,
  Globe,
  ScanLine,
  Book,
  Image as ImageIcon,
  Quote,
  TrendingUp,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { services, portfolioItems, testimonials, stats } from '@/lib/data';

export default function HomePage() {
  const featuredWork = portfolioItems.slice(0, 6);
  const inPersonServices = services.filter((s) => s.category === 'in-person');
  const onlineServices = services.filter((s) => s.category === 'online');

  return (
    <>
      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-accent/30 via-background to-background">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute -right-32 top-40 h-96 w-96 rounded-full bg-chart-2/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-chart-4/8 blur-3xl" />
        </div>

        {/* Grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="container relative mx-auto px-4 py-20 md:px-6 md:py-28 lg:py-32">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Text */}
            <div className="space-y-7 animate-fade-in-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
                <span className="flex h-2 w-2 rounded-full bg-primary">
                  <span className="h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                </span>
                کافی‌نت تخصصی چاپ و طراحی
              </div>

              <h1 className="text-4xl font-extrabold leading-[1.15] text-foreground md:text-5xl lg:text-6xl">
                چاپ و طراحی،
                <br />
                با خلاقیت{' '}
                <span className="relative inline-block text-primary">
                  نترینو
                  <svg
                    className="absolute -bottom-2 right-0 w-full"
                    viewBox="0 0 200 12"
                    fill="none"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M2 9C50 3 150 3 198 7"
                      stroke="hsl(var(--primary))"
                      strokeWidth="3"
                      strokeLinecap="round"
                      opacity="0.3"
                    />
                  </svg>
                </span>
              </h1>

              <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
                از چاپ دیجیتال و صحافی تا طراحی لوگو، سایت و بنر — همه خدمات حضوری و غیرحضوری شما در
                یک مرکز تخصصی. کیفیت بالا، تحویل سریع، قیمت منصفانه.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/order"
                  className="group inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/35 hover:brightness-105"
                >
                  ثبت سفارش آنلاین
                  <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
                </Link>
                <Link
                  href="/portfolio"
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-primary/20 bg-card/50 px-7 py-3.5 text-base font-bold text-foreground backdrop-blur-sm transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground"
                >
                  مشاهده نمونه‌کارها
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  ضمانت کیفیت
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Zap className="h-4 w-4 text-primary" />
                  تحویل فوری
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  قیمت منصفانه
                </div>
              </div>
            </div>

            {/* Visual */}
            <div className="relative animate-fade-in-up [animation-delay:200ms]">
              <div className="relative">
                {/* Main image */}
                <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-border">
                  <Image
                    src="https://images.pexels.com/photos/6620972/pexels-photo-6620972.jpeg?auto=compress&cs=tinysrgb&h=900&w=720"
                    alt="استودیو چاپ و طراحی نترینو"
                    fill
                    className="object-cover"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/20 via-transparent to-transparent" />
                </div>

                {/* Floating quality card */}
                <div className="absolute -bottom-5 -right-5 hidden rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur-md md:block">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                      <Award className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-foreground">ضمانت کیفیت</div>
                      <div className="text-xs text-muted-foreground">تحویل مجدد رایگان</div>
                    </div>
                  </div>
                </div>

                {/* Floating satisfaction badge */}
                <div className="absolute -top-4 -left-4 animate-float rounded-2xl bg-gradient-to-br from-primary to-chart-3 px-5 py-3.5 text-primary-foreground shadow-xl">
                  <div className="text-2xl font-extrabold">{stats.satisfaction}</div>
                  <div className="text-xs opacity-90">رضایت مشتری</div>
                </div>

                {/* Decorative dots */}
                <div className="absolute -right-8 top-1/2 hidden h-24 w-24 -translate-y-1/2 opacity-20 lg:block">
                  <div className="grid grid-cols-6 gap-1.5">
                    {Array.from({ length: 36 }).map((_, i) => (
                      <div key={i} className="h-1.5 w-1.5 rounded-full bg-primary" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-16 grid grid-cols-2 gap-4 md:mt-20 md:grid-cols-4 md:gap-6">
            {[
              { icon: Users, value: stats.clients, label: 'مشتری راضی' },
              { icon: Award, value: stats.projects, label: 'پروژه موفق' },
              { icon: Clock, value: stats.years + ' سال', label: 'تجربه تخصصی' },
              { icon: Star, value: stats.satisfaction, label: 'رضایت مشتری' },
            ].map((stat, i) => (
              <div
                key={i}
                className="group rounded-2xl border border-border bg-card/50 p-5 text-center backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg"
              >
                <stat.icon className="mx-auto mb-3 h-7 w-7 text-primary transition-transform group-hover:scale-110" />
                <div className="text-2xl font-extrabold text-foreground md:text-3xl">{stat.value}</div>
                <div className="mt-1 text-xs text-muted-foreground md:text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== SERVICES ===================== */}
      <section className="py-20 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-14 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-xs font-bold tracking-wider text-primary">
              خدمات نترینو
            </div>
            <h2 className="text-3xl font-extrabold text-foreground md:text-4xl">
              همه چیز در یک مرکز تخصصی
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              خدمات تخصصی در دو بخش حضوری و غیرحضوری، متناسب با نیاز شما
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* In-person */}
            <div className="group/section rounded-3xl border border-border bg-card p-7 transition-all hover:shadow-lg md:p-8">
              <div className="mb-7 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 transition-transform group-hover/section:scale-105">
                  <Printer className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">خدمات حضوری</h3>
                  <p className="text-sm text-muted-foreground">مراجعه حضوری به مرکز نترینو</p>
                </div>
              </div>
              <div className="space-y-3">
                {inPersonServices.map((service) => (
                  <Link
                    key={service.id}
                    href="/services"
                    className="group flex items-center gap-4 rounded-2xl border border-border p-4 transition-all hover:border-primary/30 hover:bg-accent/20"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent transition-colors group-hover:bg-primary/10">
                      <service.icon className="h-7 w-7 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-foreground">{service.title}</h4>
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
                        {service.description}
                      </p>
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] text-muted-foreground">از</div>
                      <div className="text-sm font-bold text-primary">{service.priceFrom}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Online */}
            <div className="group/section rounded-3xl border border-border bg-card p-7 transition-all hover:shadow-lg md:p-8">
              <div className="mb-7 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 transition-transform group-hover/section:scale-105">
                  <Globe className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">خدمات غیرحضوری</h3>
                  <p className="text-sm text-muted-foreground">سفارش آنلاین و تحویل دیجیتال</p>
                </div>
              </div>
              <div className="space-y-3">
                {onlineServices.map((service) => (
                  <Link
                    key={service.id}
                    href="/services"
                    className="group flex items-center gap-4 rounded-2xl border border-border p-4 transition-all hover:border-primary/30 hover:bg-accent/20"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent transition-colors group-hover:bg-primary/10">
                      <service.icon className="h-7 w-7 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-foreground">{service.title}</h4>
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
                        {service.description}
                      </p>
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] text-muted-foreground">از</div>
                      <div className="text-sm font-bold text-primary">{service.priceFrom}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/services"
              className="group inline-flex items-center gap-2 text-base font-bold text-primary transition-colors hover:text-chart-3"
            >
              مشاهده همه خدمات
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== FEATURED WORK ===================== */}
      <section className="bg-gradient-to-b from-accent/15 to-background py-20 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-14 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-xs font-bold tracking-wider text-primary">
                نمونه‌کارها
              </div>
              <h2 className="text-3xl font-extrabold text-foreground md:text-4xl">
                نمونه‌کارهای برتر
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">
                گزینه‌ای از پروژه‌های موفق نترینو
              </p>
            </div>
            <Link
              href="/portfolio"
              className="group inline-flex items-center gap-2 rounded-xl border-2 border-primary/20 px-5 py-2.5 text-sm font-bold text-primary transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground"
            >
              همه نمونه‌کارها
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredWork.map((item, i) => (
              <div
                key={item.id}
                className={`group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-xl ${
                  i === 0 ? 'sm:col-span-2 lg:col-span-1' : ''
                }`}
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="absolute bottom-0 right-0 left-0 p-5">
                      <p className="text-sm text-white/90">{item.description}</p>
                    </div>
                  </div>
                  <span className="absolute right-3 top-3 rounded-full bg-primary/90 px-3 py-1 text-xs font-bold text-primary-foreground backdrop-blur-sm">
                    {item.category === 'logo' && 'لوگو'}
                    {item.category === 'banner' && 'بنر'}
                    {item.category === 'website' && 'سایت'}
                    {item.category === 'print' && 'چاپ'}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.client}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== TESTIMONIALS ===================== */}
      <section className="py-20 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-14 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-xs font-bold tracking-wider text-primary">
              نظرات مشتریان
            </div>
            <h2 className="text-3xl font-extrabold text-foreground md:text-4xl">
              آنچه مشتریان می‌گویند
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              اعتماد صدها مشتری به کیفیت و تعهد ما
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <div
                key={t.id}
                className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-lg hover:border-primary/20"
              >
                <Quote className="absolute left-5 top-5 h-8 w-8 text-primary/10" />
                <div className="mb-3 flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < t.rating ? 'fill-primary text-primary' : 'fill-muted text-muted'
                      }`}
                    />
                  ))}
                </div>
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{t.text}</p>
                <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-base font-bold text-primary">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-primary to-chart-3 px-8 py-14 text-center md:px-16 md:py-20">
            {/* Decorative */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              />
            </div>

            <div className="relative">
              <h2 className="text-3xl font-extrabold text-primary-foreground md:text-4xl">
                آماده‌اید پروژه‌تان را شروع کنیم؟
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
                همین حالا سفارش خود را ثبت کنید و در کوتاه‌ترین زمان نتیجه را دریافت کنید.
              </p>
              <Link
                href="/order"
                className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-primary-foreground px-8 py-4 text-base font-bold text-primary shadow-lg transition-all hover:scale-105"
              >
                ثبت سفارش
                <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
