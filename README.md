# Alpha GYM Ops

ریپوی سبک عملیات برای بررسی بکاند/اسکنر/دیتابیس باشگاه، بدون وارد کردن دیتابیس، بکاپ، رمزها یا تنظیمات ایجنت به Git.

## اصل کلی

- پیشفرض **فقط خواندن** است.
- هیچ `.db`، `.bak`، `.env`، `agent.config.json`، کلید ایجنت/AnyDesk یا لاگ حاوی رمز در Git ذخیره نمیشود.
- هر نوشتن در دیتابیس باید: بکاپ تازه + assert دقیق + شمارش نهایی + `PRAGMA integrity_check` داشته باشد.
- تغییر کد بکاند فقط با بکاپ فایل و restart/pm2 تاییدشده انجام میشود.

## راهاندازی یکبار

```powershell
cd D:\opencode-work\alpha-gym-ops
py -3 -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

در `.env` فقط رمز VPS را پر کن. این فایل توسط `.gitignore` نادیده گرفته میشود.

بررسی سلامت ریپو:

```powershell
py -3 scripts\verify_repo.py
```

## دستورهای پرکاربرد

### 1) چک سلامت فقطخواندنی

```powershell
py -3 scripts\health_check.py
```

### 2) گرفتن عکس تمیز از بکاند (بدون دیتابیس/داده عضوها)

```powershell
py -3 scripts\snapshot_backend.py
```

خروجی در `snapshots\<timestamp>\` قرار میگیرد: کد بکاند پاکشده، schema دیتابیس، وضعیت API و frontend asset.

### 3) اجرای SQL فقطخواندنی

```powershell
py -3 scripts\db_query.py --sql "select id,name,member_code from members order by id desc limit 10"
```

برای کوئریهای طولانی:

```powershell
py -3 scripts\db_query.py --file query.sql
```

### 4) اجرای دستور دوری فقطخواندنی

```powershell
py -3 scripts\remote_run.py --cmd "tail -n 20 /var/www/alphagym/backend/attendanceScan.js"
```

برای نوشتن صراحةً:

```powershell
py -3 scripts\remote_run.py --allow-write --confirm WRITE --sudo --cmd "..."
```

### 5) بکاپ تازه قبل از هر تغییر DB

```powershell
py -3 scripts\make_backup.py --reason sara-dance-fix --persist
```

### 6) اعمال تغییر DB بررسیشده

اسکریپت الگو را کپی و ویرایش کن:

```powershell
Copy-Item templates\db_change.py changes\20261125_reason.py
notepad changes\20261125_reason.py
py -3 scripts\verify_repo.py
py -3 scripts\apply_change.py --change-file changes\20261125_reason.py --reason reason --confirm "APPLY reason"
```

`apply_change.py` خودش بکاپ میگیرد، اسکریپت تغییر را آپلود میکند، و فقط در صورتی موفق میشود که اسکریپت `ROWCOUNT`، `FINAL_COUNTS`، `INTEGRITY ok` و `COMMITTED` چاپ کند.

## OpenCode

از ریشه همین ریپو `opencode` را باز کن. فایلهای زیر بهطور خودکار استفاده میشوند:

- `AGENTS.md`: قواعد پروژه
- `.opencode/agents/alphagym-auditor.md`: بازبین فقطخواندن
- `.opencode/commands/*.md`: دستورهای `/diagnose`، `/remote-check`، `/db-check`، `/safe-change`، `/verify-repo`

پرامپت جامع قابل کپی در `docs/AGENT_PROMPT.md` است.

## Git

ریپو بهصورت محلی init و commit اولیه شده است. برای وصل کردن به remote:

```powershell
git remote add origin <REMOTE_URL>
git push -u origin main
```

تا زمانی که URL را ندهی، push نکن.

## مسیرهای مهم سرور

- DB: `/var/www/alphagym/backend/gym.db`
- اسکنر بکاند: `/var/www/alphagym/backend/attendanceScan.js`
- frontend: `/var/www/alphagym/frontend/index.html`
- pm2: `/usr/local/node/bin/pm2`، سرویس `alphagym-api`

## یادآوری

پاسخها فارسی و با لحن گرم باشند. کاربر فقط زن است و ترجیح میدهد با «عزیزم/عزیزکم» خطاب شود.
