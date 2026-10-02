'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { portfolioItems, portfolioCategories } from '@/lib/data';
import { cn } from '@/lib/utils';
import { ArrowLeft, Sparkles } from 'lucide-react';

export default function PortfolioPage() {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filteredItems =
    activeCategory === 'all'
      ? portfolioItems
      : portfolioItems.filter((item) => item.category === activeCategory);

  const categoryCounts = portfolioCategories.map((cat) => ({
    ...cat,
    count:
      cat.id === 'all'
        ? portfolioItems.length
        : portfolioItems.filter((i) => i.category === cat.id).length,
  }));

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
            گالری نمونه‌کارها
          </div>
          <h1 className="text-4xl font-extrabold text-foreground md:text-5xl">نمونه‌کارهای نترینو</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            گالری نمونه‌کارهای ما در حوزه‌های طراحی لوگو، بنر، وب‌سایت و چاپ
          </p>
        </div>
      </section>

      {/* Gallery */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4 md:px-6">
          {/* Filter */}
          <div className="mb-10 flex flex-wrap justify-center gap-2">
            {categoryCounts.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'group flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all',
                  activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'border border-border bg-card text-foreground hover:border-primary/30 hover:bg-accent/20'
                )}
              >
                {cat.label}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    activeCategory === cat.id
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-xl"
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
                      <p className="text-sm leading-relaxed text-white/90">{item.description}</p>
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

          {filteredItems.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              نمونه‌کاری در این دسته یافت نشد.
            </div>
          )}

          {/* CTA */}
          <div className="mt-14 rounded-3xl border border-border bg-accent/15 p-8 text-center md:p-12">
            <h2 className="text-2xl font-extrabold text-foreground md:text-3xl">
              پروژه‌ی شما می‌تواند نمونه‌کار بعدی ما باشد
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              همین حالا سفارش خود را ثبت کنید و نتیجه‌ی حرفه‌ای را دریافت کنید.
            </p>
            <Link
              href="/order"
              className="group mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-lg transition-all hover:scale-105"
            >
              ثبت سفارش
              <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
