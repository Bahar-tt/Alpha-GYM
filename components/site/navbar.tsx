'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Menu, X, Printer, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/', label: 'خانه' },
  { href: '/services', label: 'خدمات' },
  { href: '/portfolio', label: 'نمونه‌کارها' },
  { href: '/order', label: 'سفارش آنلاین' },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        scrolled
          ? 'border-b border-border/40 bg-background/90 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70 shadow-sm'
          : 'border-b border-transparent bg-background/50 backdrop-blur-sm'
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:h-20 md:px-6">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-3" onClick={() => setOpen(false)}>
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-3 text-primary-foreground shadow-lg shadow-primary/25 transition-transform group-hover:scale-105 md:h-12 md:w-12">
            <Printer className="h-5 w-5 md:h-6 md:w-6" />
            <div className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full bg-chart-4 ring-2 ring-background" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xl font-extrabold tracking-tight text-foreground md:text-2xl">
              نترینو
            </span>
            <span className="mt-0.5 text-[10px] font-medium tracking-wider text-muted-foreground md:text-[11px]">
              چاپ و طراحی گرافیک
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'relative rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 hover:text-primary',
                pathname === link.href
                  ? 'text-primary'
                  : 'text-foreground/70'
              )}
            >
              {link.label}
              {pathname === link.href && (
                <span className="absolute -bottom-0.5 right-1/2 h-1 w-1 translate-x-1/2 rounded-full bg-primary" />
              )}
            </Link>
          ))}
        </nav>

        {/* CTA + Mobile toggle */}
        <div className="flex items-center gap-2">
          <Link
            href="/order"
            className="hidden rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-105 sm:inline-flex md:px-6"
          >
            ثبت سفارش
          </Link>
          <button
            className="rounded-xl p-2 text-foreground transition-colors hover:bg-accent md:hidden"
            onClick={() => setOpen(!open)}
            aria-label="منو"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          'overflow-hidden border-t border-border bg-background/95 backdrop-blur-lg transition-all duration-300 md:hidden',
          open ? 'max-h-96' : 'max-h-0 border-transparent'
        )}
      >
        <div className="container mx-auto flex flex-col gap-1 px-4 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                'rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
                pathname === link.href
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-accent'
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/order"
            onClick={() => setOpen(false)}
            className="mt-2 rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground"
          >
            ثبت سفارش
          </Link>
        </div>
      </div>
    </header>
  );
}
