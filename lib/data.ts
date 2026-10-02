import {
  Printer,
  ScanLine,
  Book,
  PenTool,
  Globe,
  Image as ImageIcon,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export type ServiceCategory = 'in-person' | 'online';

export interface Service {
  id: string;
  title: string;
  category: ServiceCategory;
  icon: LucideIcon;
  description: string;
  features: string[];
  priceFrom: string;
  image: string;
}

export interface PortfolioItem {
  id: string;
  title: string;
  category: 'logo' | 'banner' | 'website' | 'print';
  client: string;
  image: string;
  description: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  text: string;
  rating: number;
}

export const services: Service[] = [
  {
    id: 'print',
    title: 'چاپ دیجیتال و آفست',
    category: 'in-person',
    icon: Printer,
    description:
      'چاپ کاتالوگ، بروشور، کارت ویزیت، تراکت و پوستر با کیفیت بالا و رنگ پایدار.',
    features: ['چاپ رنگی با رزولوشن بالا', 'انواع کاغذ و grammage', 'تحویل فوری', 'قیمت عمده‌ای'],
    priceFrom: '۵٬۰۰۰ تومان',
    image:
      'https://images.pexels.com/photos/1440504/pexels-photo-1440504.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'scan',
    title: 'اسکن و بایگانی اسناد',
    category: 'in-person',
    icon: ScanLine,
    description:
      'اسکن اسناد، عکس، نقشه و کتاب با دستگاه اسکنر ریزنگ و خروجی فایل باکیفیت.',
    features: ['اسکن با رزولوشن تا ۱۲۰۰ dpi', 'خروجی PDF/JPG/TIFF', 'بایگانی دیجیتال', 'حذف پس‌زمینه'],
    priceFrom: '۲٬۰۰۰ تومان',
    image:
      'https://images.pexels.com/photos/6620985/pexels-photo-6620985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'binding',
    title: 'صحافی و تکمیل',
    category: 'in-person',
    icon: Book,
    description:
      'صحافی پایان‌نامه، گزارش، کاتالوگ و کتاب با انواع روش‌های فنر، چسب و سیمی.',
    features: ['صحافی فنر و سیمی', 'جلد سخت و نرم', 'طلاکوب و طلاکوب برجسته', 'تیراژ محدود'],
    priceFrom: '۱۵٬۰۰۰ تومان',
    image:
      'https://images.pexels.com/photos/19316517/pexels-photo-19316517.png?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'logo-design',
    title: 'طراحی لوگو و هویت بصری',
    category: 'online',
    icon: PenTool,
    description:
      'طراحی لوگو حرفه‌ای، کاتالوگ هویت سازمانی و سیستم بصری کامل برند شما.',
    features: ['۳ پیشنهاد اولیه', 'فایل‌های لایه‌باز', 'کتابچه هویت بصری', 'اصلاحات نامحدود'],
    priceFrom: '۴۵۰٬۰۰۰ تومان',
    image:
      'https://images.pexels.com/photos/7661184/pexels-photo-7661184.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'web-design',
    title: 'طراحی و توسعه وب‌سایت',
    category: 'online',
    icon: Globe,
    description:
      'طراحی سایت شرکتی، فروشگاهی و شخصی با تکنولوژی مدرن و سرعت بارگذاری بالا.',
    features: ['طراحی واکنش‌گرا', 'بهینه‌سازی SEO', 'پنل مدیریت محتوا', 'پشتیبانی ۶ ماه'],
    priceFrom: '۳٬۵۰۰٬۰۰۰ تومان',
    image:
      'https://images.pexels.com/photos/285814/pexels-photo-285814.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'banner-design',
    title: 'طراحی بنر و پوستر',
    category: 'online',
    icon: ImageIcon,
    description:
      'طراحی بنر تبلیغاتی، پوستر رویداد، پست شبکه‌های اجتماعی و موشن گرافیک.',
    features: ['طراحی برای همه پلتفرم‌ها', 'موشن و انیمیشن', 'طراحی پست اینستاگرام', 'تحویل سریع'],
    priceFrom: '۱۲۰٬۰۰۰ تومان',
    image:
      'https://images.pexels.com/photos/32459951/pexels-photo-32459951.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
];

export const portfolioItems: PortfolioItem[] = [
  {
    id: 'p1',
    title: 'هویت بصری رستوران زعفران',
    category: 'logo',
    client: 'رستوران زعفران',
    image:
      'https://images.pexels.com/photos/26576975/pexels-photo-26576975.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'طراحی لوگو و سیستم بصری کامل برای رستوران سنتی زعفران.',
  },
  {
    id: 'p2',
    title: 'کارت ویزیت مجموعه آرتین',
    category: 'print',
    client: 'مجموعه آرتین',
    image:
      'https://images.pexels.com/photos/9878733/pexels-photo-9878733.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'چاپ و طراحی کارت ویزیت لاک‌دار با کاغذ کراته ۳۵۰ گرم.',
  },
  {
    id: 'p3',
    title: 'بنر کمپین فروش پاییزی',
    category: 'banner',
    client: 'فروشگاه دیجی‌مارت',
    image:
      'https://images.pexels.com/photos/32459951/pexels-photo-32459951.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'طراحی بنر تبلیغاتی برای کمپین فروش پاییزی دیجی‌مارت.',
  },
  {
    id: 'p4',
    title: 'وب‌سایت شرکت ساختمانی پارس‌بنا',
    category: 'website',
    client: 'پارس‌بنا',
    image:
      'https://images.pexels.com/photos/285814/pexels-photo-285814.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'طراحی و توسعه وب‌سایت شرکتی واکنش‌گرا برای پارس‌بنا.',
  },
  {
    id: 'p5',
    title: 'لوگو برند پوشاک لِین',
    category: 'logo',
    client: 'برند لِین',
    image:
      'https://images.pexels.com/photos/7661184/pexels-photo-7661184.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'طراحی لوگو مینیمال برای برند پوشاک لِین.',
  },
  {
    id: 'p6',
    title: 'پوستر رویداد تکنولوژی ۱۴۰۳',
    category: 'banner',
    client: 'نمایشگاه فناوری',
    image:
      'https://images.pexels.com/photos/4913828/pexels-photo-4913828.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'طراحی پوستر و بنر نمایشگاه فناوری و نوآوری ۱۴۰۳.',
  },
  {
    id: 'p7',
    title: 'کاتالوگ شرکت دارویی سینا',
    category: 'print',
    client: 'داروسازی سینا',
    image:
      'https://images.pexels.com/photos/8842916/pexels-photo-8842916.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'چاپ و طراحی کاتالوگ ۲۴ صفحه‌ای داروسازی سینا با کاغذ گلاسه.',
  },
  {
    id: 'p8',
    title: 'فروشگاه آنلاین مدیا‌شاپ',
    category: 'website',
    client: 'مدیا‌شاپ',
    image:
      'https://images.pexels.com/photos/7191162/pexels-photo-7191162.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'طراحی فروشگاه اینترنتی مدیا‌شاپ با پنل مدیریت کامل.',
  },
  {
    id: 'p9',
    title: 'کارت ویزیت طلاکوب مدیریت',
    category: 'print',
    client: 'دفیر مدیریت',
    image:
      'https://images.pexels.com/photos/8066713/pexels-photo-8066713.png?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'کارت ویزیت طلاکوب با طراحی لوکس برای کادر مدیریت.',
  },
  {
    id: 'p10',
    title: 'هویت بصری کافه نارنج',
    category: 'logo',
    client: 'کافه نارنج',
    image:
      'https://images.pexels.com/photos/7661590/pexels-photo-7661590.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'طراحی لوگو و هویت بصری کافه نارنج با الهام از رنگ گرم.',
  },
  {
    id: 'p11',
    title: 'بنر اینستاگرام فروشگاه کیک',
    category: 'banner',
    client: 'کیک‌خانه شیرین',
    image:
      'https://images.pexels.com/photos/8655746/pexels-photo-8655746.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'طراحی پست و استوری اینستاگرام برای کیک‌خانه شیرین.',
  },
  {
    id: 'p12',
    title: 'وب‌سایت شخصی عکاس',
    category: 'website',
    client: 'استودیو نگاه',
    image:
      'https://images.pexels.com/photos/6672290/pexels-photo-6672290.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    description: 'طراحی وب‌سایت پرتفولیو برای استودیو عکاسی نگاه.',
  },
];

export const testimonials: Testimonial[] = [
  {
    id: 't1',
    name: 'سارا محمدی',
    role: 'مدیر بازاریابی، دیجی‌مارت',
    text: 'همکاری با تیم نترینو فوق‌العاده بود. طراحی بنرها و کاتالوگ ما با کیفیت و سرعت بالایی تحویل داده شد. قطعا سفارش‌های بعدی هم به نترینو سپرده می‌شه.',
    rating: 5,
  },
  {
    id: 't2',
    name: 'امیرحسین رضایی',
    role: 'بنیان‌گذار استارتاپ لِین',
    text: 'لوگویی که برای برند ما طراحی کردند دقیقا همان چیزی بود که در ذهن داشتم. خلاقیت و حرفه‌ای‌گری تیم نترینو قابل تحسینه.',
    rating: 5,
  },
  {
    id: 't3',
    name: 'نرگس کریمی',
    role: 'دانشجوی کارشناسی ارشد',
    text: 'برای صحافی پایان‌نامه‌ام به نترینو مراجعه کردم. کار تمیز و دقیق، قیمت منصفانه و تحویل به‌موقع. به همه دوستانم پیشنهاد می‌کنم.',
    rating: 5,
  },
  {
    id: 't4',
    name: 'محمد جوادی',
    role: 'مدیرعامل پارس‌بنا',
    text: 'وب‌سایت شرکتمون رو به نترینو سپردیم و نتیجه فراتر از انتظار بود. سایت سریع، زیبا و کاربرپسند. پشتیبانی بعد از تحویل هم عالی بود.',
    rating: 5,
  },
  {
    id: 't5',
    name: 'الهام موسوی',
    role: 'صاحب کافه نارنج',
    text: 'هویت بصری کافه‌مون کامل توسط نترینو طراحی شد. از لوگو تا منو و بنر، همه هماهنگ و زیبا. مشتری‌ها همیشه درباره طراحی تعریف می‌کنند.',
    rating: 5,
  },
  {
    id: 't6',
    name: 'رضا احمدی',
    role: 'مدیر داروسازی سینا',
    text: 'چاپ کاتالوگ‌های شرکت با کیفیت بی‌نظیری انجام شد. رنگ‌ها پایدار و کاغذ باکیفیت. نترینو شریک مطمئن ما در چاپ است.',
    rating: 4,
  },
];

export const stats = {
  clients: '۸۵۰+',
  projects: '۳٬۲۰۰+',
  years: '۷',
  satisfaction: '۹۸٪',
};

export const portfolioCategories = [
  { id: 'all', label: 'همه' },
  { id: 'logo', label: 'لوگو' },
  { id: 'banner', label: 'بنر' },
  { id: 'website', label: 'سایت' },
  { id: 'print', label: 'چاپ' },
] as const;
