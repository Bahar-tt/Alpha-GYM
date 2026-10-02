'use client';

import { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  X,
  Phone,
  Mail,
  User,
  MessageSquare,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Clock,
  Tag,
} from 'lucide-react';
import { services } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export default function OrderPage() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const phone = formData.get('phone') as string;
    const email = (formData.get('email') as string) || null;
    const serviceType = formData.get('serviceType') as string;
    const serviceName = formData.get('serviceName') as string;
    const description = (formData.get('description') as string) || null;

    let fileUrl: string | null = null;
    let fileName: string | null = null;

    try {
      if (file) {
        setUploading(true);
        const fileExt = file.name.split('.').pop();
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        const filePath = `orders/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('order-files')
          .upload(filePath, file);

        if (uploadError) throw new Error('خطا در آپلود فایل');

        const { data: urlData } = supabase.storage
          .from('order-files')
          .getPublicUrl(filePath);

        fileUrl = urlData.publicUrl;
        fileName = file.name;
        setUploading(false);
      }

      const { error: insertError } = await supabase.from('orders').insert({
        name,
        phone,
        email,
        service_type: serviceType,
        service_name: serviceName,
        description,
        file_url: fileUrl,
        file_name: fileName,
        status: 'pending',
      });

      if (insertError) throw new Error('خطا در ثبت سفارش');

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطایی رخ داد. دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > 20 * 1024 * 1024) {
        setError('حجم فایل نباید بیش از ۲۰ مگابایت باشد.');
        return;
      }
      setFile(selected);
      setError(null);
    }
  };

  const resetForm = () => {
    setSuccess(false);
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (success) {
    return (
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-border bg-card text-center shadow-xl">
            <div className="relative bg-gradient-to-br from-primary to-chart-3 px-8 py-12">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
            </div>
            <div className="p-8 md:p-10">
              <h1 className="text-2xl font-extrabold text-foreground md:text-3xl">
                سفارش شما ثبت شد!
              </h1>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                از اعتماد شما سپاسگزاریم. تیم نترینو در اولین فرصت با شما تماس خواهد گرفت. برای پیگیری
                سفارش می‌توانید با شماره{' '}
                <span dir="ltr" className="font-bold text-foreground">
                  09013447174
                </span>{' '}
                تماس بگیرید.
              </p>
              <button
                onClick={resetForm}
                className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground transition-all hover:scale-105"
              >
                ثبت سفارش جدید
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

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
            سفارش آنلاین
          </div>
          <h1 className="text-4xl font-extrabold text-foreground md:text-5xl">ثبت سفارش</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            فرم زیر را پر کنید و فایل خود را آپلود نمایید. ما در کوتاه‌ترین زمان با شما تماس می‌گیریم.
          </p>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              اطلاعات شما محفوظ است
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 text-primary" />
              پاسخ در کمتر از ۲۴ ساعت
            </div>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mx-auto max-w-2xl">
            <form
              onSubmit={handleSubmit}
              className="space-y-6 rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8"
            >
              {/* Name */}
              <div>
                <label
                  htmlFor="name"
                  className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"
                >
                  <User className="h-4 w-4 text-primary" />
                  نام و نام خانوادگی
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder="نام خود را وارد کنید"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Phone & Email */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="phone"
                    className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"
                  >
                    <Phone className="h-4 w-4 text-primary" />
                    شماره تماس
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    required
                    dir="ltr"
                    placeholder="0912-345-6789"
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"
                  >
                    <Mail className="h-4 w-4 text-primary" />
                    ایمیل (اختیاری)
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    dir="ltr"
                    placeholder="example@mail.com"
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Service type */}
              <div>
                <label
                  htmlFor="serviceType"
                  className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"
                >
                  <Tag className="h-4 w-4 text-primary" />
                  نوع خدمت
                </label>
                <select
                  id="serviceType"
                  name="serviceType"
                  required
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  defaultValue=""
                >
                  <option value="" disabled>
                    انتخاب کنید...
                  </option>
                  <optgroup label="خدمات حضوری">
                    {services
                      .filter((s) => s.category === 'in-person')
                      .map((s) => (
                        <option key={s.id} value="in-person">
                          {s.title}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="خدمات غیرحضوری">
                    {services
                      .filter((s) => s.category === 'online')
                      .map((s) => (
                        <option key={s.id} value="online">
                          {s.title}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              {/* Service name */}
              <div>
                <label
                  htmlFor="serviceName"
                  className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"
                >
                  <Tag className="h-4 w-4 text-primary" />
                  عنوان خدمت مورد نظر
                </label>
                <select
                  id="serviceName"
                  name="serviceName"
                  required
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  defaultValue=""
                >
                  <option value="" disabled>
                    انتخاب کنید...
                  </option>
                  {services.map((s) => (
                    <option key={s.id} value={s.title}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"
                >
                  <MessageSquare className="h-4 w-4 text-primary" />
                  توضیحات سفارش
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  placeholder="مشخصات دقیق سفارش خود را بنویسید: ابعاد، تعداد، رنگ‌ها، متن و..."
                  className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* File upload */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Upload className="h-4 w-4 text-primary" />
                  آپلود فایل (اختیاری)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png,.ai,.psd,.cdr,.zip,.rar,.doc,.docx"
                  className="hidden"
                />
                {!file ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="group flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-accent/15 px-4 py-10 text-center transition-all hover:border-primary/40 hover:bg-accent/25"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-transform group-hover:scale-110">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <span className="text-sm font-bold text-foreground">
                      فایل خود را کلیک کنید
                    </span>
                    <span className="text-xs text-muted-foreground">
                      حداکثر ۲۰ مگابایت | PDF, JPG, PNG, AI, PSD, CDR, ZIP
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-accent/15 p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      {uploading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      ) : (
                        <FileText className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm font-bold text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-bold text-primary-foreground shadow-lg transition-all',
                  submitting
                    ? 'cursor-not-allowed opacity-70'
                    : 'hover:scale-[1.02] hover:shadow-xl'
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    در حال ثبت سفارش...
                  </>
                ) : (
                  <>
                    ثبت سفارش
                    <ArrowLeft className="h-5 w-5" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-muted-foreground">
                با ثبت سفارش، تیم نترینو در اولین فرصت با شما تماس خواهد گرفت.
              </p>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
