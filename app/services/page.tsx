import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Printer,
  Globe,
  ShieldCheck,
  Zap,
  Clock,
} from 'lucide-react';
import { services } from '@/lib/data';

export default function ServicesPage() {
  const inPersonServices = services.filter((s) => s.category === 'in-person');
  const onlineServices = services.filter((s) => s.category === 'online');

  return (
    <>
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-b from-accent/30 to-background py-16 md:py-20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-20 top-0 h-64 w-64 rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-chart-2/10 blur-3xl" />
        </div>
        <div className="container relative mx-auto px-4 text-center md:px-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-xs font-bold tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            خدمات نترینو
          </div>
          <h1 className="text-4xl font-extrabold text-foreground md:text-5xl">خدمات تخصصی ما</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            خدمات تخصصی چاپ و طراحی در دو بخش حضوری و غیرحضوری، همراه با اتوماسیون و هوش مصنوعی
          </p>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              ضمانت کیفیت
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-4 w-4 text-primary" />
              تحویل فوری
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 text-primary" />
              ۷ سال تجربه
            </div>
          </div>
        </div>
      </section>

      {/* In-person services */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-10 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5">
              <Printer className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">خدمات حضوری</h2>
              <p className="text-sm text-muted-foreground">با مراجعه به مرکز نترینو</p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {inPersonServices.map((service) => (
              <div
                key={service.id}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-xl"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-4 right-4 flex items-center gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
                      <service.icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-bold text-foreground">{service.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {service.description}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {service.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-foreground/80">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                    <div>
                      <span className="text-xs text-muted-foreground">قیمت از</span>
                      <div className="text-lg font-bold text-primary">{service.priceFrom}</div>
                    </div>
                    <Link
                      href="/order"
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/20 hover:brightness-105"
                    >
                      سفارش
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Online services */}
      <section className="bg-gradient-to-b from-accent/15 to-background py-16 md:py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-10 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5">
              <Globe className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">خدمات غیرحضوری</h2>
              <p className="text-sm text-muted-foreground">سفارش آنلاین و تحویل دیجیتال</p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {onlineServices.map((service) => (
              <div
                key={service.id}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-xl"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-4 right-4 flex items-center gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
                      <service.icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-bold text-foreground">{service.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {service.description}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {service.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-foreground/80">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                    <div>
                      <span className="text-xs text-muted-foreground">قیمت از</span>
                      <div className="text-lg font-bold text-primary">{service.priceFrom}</div>
                    </div>
                    <Link
                      href="/order"
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/20 hover:brightness-105"
                    >
                      سفارش
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Automation — external link to neurosh.ir */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4 md:px-6">
          <a
            href="https://neurosh.ir"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block overflow-hidden rounded-[2rem] border-2 border-primary/15 bg-gradient-to-br from-card via-accent/20 to-card p-8 transition-all hover:border-primary/30 hover:shadow-2xl md:p-12"
          >
            {/* Decorative */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-primary/10 blur-3xl transition-opacity group-hover:opacity-80" />
              <div className="absolute -right-20 -bottom-20 h-60 w-60 rounded-full bg-chart-3/10 blur-3xl" />
              <div
                className="absolute inset-0 opacity-[0.02]"
                style={{
                  backgroundImage:
                    'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              />
            </div>

            <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
                  <Sparkles className="h-4 w-4" />
                  Powered by Neurosh
                </div>
                <h2 className="text-3xl font-extrabold text-foreground md:text-4xl">
                  اتوماسیون و هوش مصنوعی
                </h2>
                <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                  اتوماسیون فرآیندهای کسب‌وکار شما با کمک هوش مصنوعی. از چت‌بات‌های هوشمند تا تحلیل
                  داده و خودکارسازی وظایف — نروش، برند تخصصی نیوروش، راه‌حل‌های نوآورانه‌ی شما
                  را توسعه می‌دهد.
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <span className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-lg transition-transform group-hover:scale-105">
                    مشاهده وب‌سایت نیوروش
                    <ExternalLink className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground" dir="ltr">
                    neurosh.ir
                  </span>
                </div>
              </div>

              <div className="hidden md:block">
                <div className="flex h-36 w-36 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-chart-3 text-primary-foreground shadow-2xl transition-transform group-hover:scale-110">
                  <Sparkles style={{ width: '4.5rem', height: '4.5rem' }} />
                </div>
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="rounded-3xl border border-border bg-accent/15 p-8 text-center md:p-12">
            <h2 className="text-2xl font-extrabold text-foreground md:text-3xl">
              سفارش خود را ثبت کنید
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              برای هر یک از خدمات نترینو می‌توانید آنلاین سفارش ثبت کنید و فایل خود را آپلود نمایید.
            </p>
            <Link
              href="/order"
              className="group mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-lg transition-all hover:scale-105"
            >
              ثبت سفارش آنلاین
              <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
