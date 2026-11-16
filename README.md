# Alpha Gym

سیستم مدیریت باشگاه آلفا با رابط React/Vite، سرور Express و دیتابیس SQLite. ماژول‌های اصلی شامل مدیریت اعضا، تمدید اشتراک، پیامک، حسابداری، سهم مربی، گزارش مالی، حضور و غیاب، پورتال مربی، مدیریت کاربران و Audit Log است.

## پیش‌نیازها

- Node.js 20 یا جدیدتر
- npm 10 یا جدیدتر
- برای production: Docker و Docker Compose

## نصب وابستگی‌ها

در ریشه پروژه اجرا کنید:

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

برای نصب تکرارپذیر در CI و Docker از lockfile commit‌شده استفاده کنید:

```bash
npm ci
cd backend && npm ci
```

## تنظیمات محیطی

```bash
cp .env.example .env
```

متغیرهای مهم:

| متغیر | کاربرد |
|---|---|
| `PORT` | پورت سرور؛ پیش‌فرض `8000` |
| `DB_PATH` | مسیر SQLite؛ در Docker، `/app/data/gym.db` |
| `CORS_ORIGIN` | originهای مجاز، جداشده با کاما |
| `PROVIDER_KEY` | کلید طولانی و تصادفی برای فعال‌سازی featureها |
| `INITIAL_ADMIN_PASSWORD` | رمز اولیه admin در دیتابیس خالی |
| `INITIAL_STAFF_PASSWORD` | رمز اولیه staff در دیتابیس خالی |
| `KAVENEGAR_API_KEY` | کلید پیامک |
| `KAVENEGAR_SENDER` | شماره فرستنده پیامک |

اگر رمزهای اولیه مشخص نشوند، برنامه در دیتابیس خالی رمز تصادفی تولید می‌کند و فقط در log راه‌اندازی چاپ می‌کند. پس از اولین ورود، رمزها را تغییر دهید. مقادیر قدیمی `admin/admin123` و `staff/staff123` پیش‌فرض قطعی این نسخه نیستند.

## اجرای Docker

```bash
cp .env.example .env
# مقادیر واقعی، مخصوصاً PROVIDER_KEY و CORS_ORIGIN را تنظیم کنید
docker compose up -d --build
```

برنامه روی پورت `8000` اجرا می‌شود و volume داده در `/app/data` قرار دارد. بررسی سلامت:

```bash
curl http://localhost:8000/health
```

پاسخ موفق: `{"ok":true}`

## اجرای محلی

بک‌اند:

```bash
cd backend
npm ci
npm start
```

فرانت‌اند در ترمینال دیگر:

```bash
npm ci
npm run dev
```

برای اجرای Vite در `.env.local` بنویسید:

```env
VITE_API_URL=http://localhost:8000
```

## تاریخ‌ها

تاریخ‌های قابل مشاهده در پنل، رسیدها، پیامک‌ها و گزارش‌های مالی به‌صورت جلالی نمایش داده می‌شوند. بازه گزارش‌ها با تقویم شمسی انتخاب می‌شود. برای ذخیره‌سازی و مرتب‌سازی، تاریخ‌ها در SQLite با قالب ISO میلادی `YYYY-MM-DD` نگهداری و در رابط کاربری به جلالی تبدیل می‌شوند.

## احراز هویت

APIهای مدیریتی با Bearer session token محافظت می‌شوند. نقش `admin` به حسابداری، سهم مربی، تنظیمات و مدیریت کاربران دسترسی دارد و نقش `staff` فقط عملیات مجاز روزمره را انجام می‌دهد. رمزها با `scrypt` و salt تصادفی هش می‌شوند و نشست‌ها پس از ۳۰ روز منقضی می‌شوند.

## Audit Log

مسیر `GET /audit-logs` فقط برای admin است. عملیات اصلی کاربر، عضو، پرداخت، هزینه، سهم مربی و تسویه ثبت می‌شوند. برای حسابرسی رسمی، مسیرهای قدیمی `/coaches`، ایجاد پرداخت ضمنی در ثبت‌نام/تمدید، وضعیت تمدید و رسید‌ها باید تکمیل و یکپارچه شوند؛ این موارد در گزارش بررسی امنیتی شناسایی شده‌اند.

## APIهای مهم

- `GET /health`
- `POST /auth/login` و `GET /auth/me`
- `GET/POST/PUT/DELETE /members`
- `GET /accounting/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET/POST/DELETE /accounting/payments`
- `GET/POST/PUT/DELETE /accounting/expenses`
- `GET /audit-logs`

## کنترل کیفیت

```bash
npm ci
npm run typecheck
npm run lint
npm run build
node --check backend/server.js
npm audit
```

از `npm audit fix --force` بدون بررسی تغییرات major استفاده نکنید.

## Deploy امن روی سرور

اسکریپت `alpha-reportfix-deploy.sh` قبل از deploy، وضعیت clean گیت را بررسی می‌کند، از `.env` و SQLite نسخه پشتیبان می‌گیرد، با `git pull --ff-only` فقط commit تأییدشده را دریافت می‌کند، با `npm ci` نصب دقیق انجام می‌دهد، typecheck/lint/build و syntax بک‌اند را اجرا می‌کند، سپس Docker Compose یا systemd را restart و health check می‌کند.

نمونه اجرای Docker Compose:

```bash
sudo install -m 750 alpha-reportfix-deploy.sh /tmp/alpha-reportfix-deploy.sh
sudo APP_DIR=/opt/alpha-gym BRANCH=master DEPLOY_MODE=docker /tmp/alpha-reportfix-deploy.sh
```

برای systemd:

```bash
sudo APP_DIR=/opt/alpha-gym BRANCH=master DEPLOY_MODE=systemd SYSTEMD_UNIT=alpha-gym.service /tmp/alpha-reportfix-deploy.sh
```

اسکریپت در صورت dirty بودن working tree یا شکست health check متوقف می‌شود و مسیر backup را چاپ می‌کند. فایل‌های `.env` هرگز از Git overwrite نمی‌شوند.
