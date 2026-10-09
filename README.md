# Alpha Gym MVP (React + Express + SQLite)

سیستم مدیریت باشگاه آلفا — فرانت‌اند React + بک‌اند Express + دیتابیس SQLite.

## اجرای با Docker (توصیه‌شده — پورت 8000)

روی سرورهای Cloudflare که پورت‌های `3000 / 5000 / 8000` را پشتیبانی می‌کنند، از پورت **8000** استفاده کنید.

### ۱. آماده‌سازی env

```bash
cp .env.example .env
# سپس KAVENEGAR_API_KEY را در .env قرار دهید
```

### ۲. بیلد و اجرا

```bash
docker compose up -d --build
```

یا بدون compose:

```bash
docker build -t alpha-gym .
docker run -d \
  --name alpha-gym \
  -p 8000:8000 \
  -e KAVENEGAR_API_KEY=your_key \
  -e KAVENEGAR_SENDER=20006000853 \
  -v alpha-gym-data:/app/backend \
  alpha-gym
```

اپ روی آدرس زیر در دسترس است:

```
http://YOUR_SERVER:8000
```

Health check:

```
GET /health  →  { "ok": true }
```

دیتابیس SQLite داخل volume ذخیره می‌شود و با ری‌استارت کانتینر پاک نمی‌شود.

---

## اجرای لوکال (بدون Docker)

### Backend (پورت 8000)

```bash
cd backend
npm install
# فایل .env را در ریشه پروژه یا داخل backend قرار دهید
PORT=8000 npm start
```

### Frontend (پورت 5173)

```bash
npm install
# در .env یا .env.local:
# VITE_API_URL=http://localhost:8000
npm run dev
```

Open http://localhost:5173

### Demo login

| Role  | Username | Password  |
|-------|----------|-----------|
| Admin | admin    | admin123  |
| Staff | staff    | staff123  |

## API

- `GET /health` — health check
- `GET /members` — list members
- `POST /members` — create (`name`, `phone`, `expiry_date`, `weekly_sessions`, `birthday`)
- `PUT /members/:id` — update
- `DELETE /members/:id` — delete
- `GET /sms-logs` — SMS history
- `POST /sms/send` — send single SMS
- `POST /sms/broadcast` — broadcast SMS

Database file: `backend/gym.db`

Cron jobs (Asia/Tehran):
- 09:00 — birthday SMS
- 10:00 — expiry reminders (1 / 3 / 7 days)
