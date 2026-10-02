import './globals.css';
import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import { Navbar } from '@/components/site/navbar';
import { SiteFooter } from '@/components/site/footer';

const vazirmatn = Vazirmatn({
  subsets: ['arabic', 'latin'],
  variable: '--font-vazirmatn',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'نترینو | مرکز خدمات چاپ، طراحی گرافیک و دیجیتال',
  description:
    'نترینو، کافی‌نت تخصصی با خدمات حضوری و غیرحضوری شامل چاپ، اسکن، صحافی، طراحی لوگو، طراحی سایت و بنر. کیفیت بالا، تحویل سریع، قیمت منصفانه.',
  keywords: [
    'چاپ',
    'طراحی لوگو',
    'طراحی سایت',
    'بنر',
    'اسکن',
    'صحافی',
    'کافی‌نت',
    'نترینو',
  ],
  openGraph: {
    title: 'نترینو | مرکز خدمات چاپ، طراحی گرافیک و دیجیتال',
    description:
      'کافی‌نت تخصصی با خدمات حضوری و غیرحضوری شامل چاپ، طراحی لوگو، سایت و بنر.',
    type: 'website',
    locale: 'fa_IR',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={`${vazirmatn.variable} font-sans antialiased`}>
        <Navbar />
        <main className="min-h-screen">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
