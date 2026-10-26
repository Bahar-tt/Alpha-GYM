# endpoint عمومی «تعداد اعضای فعال» (فقط یک عدد، بدون اطلاعات شخصی)

صفحه‌ی ورود دیگر `GET /members` را صدا نمی‌زند؛ فقط این مسیر را:

    GET /stats/active-count   →   { "active": 1964 }

تا وقتی این مسیر در بک‌اند ساخته نشود، شمارنده‌ی ورود نمایش داده نمی‌شود (بقیه‌ی صفحه سالم کار می‌کند).

> کد بک‌اند در بسته‌ی فرانت نبود؛ نمونه‌های زیر قالب‌اند و نام جدول (`members`) و ستون (`expiry_date`) را از روی `api.ts` فرض کرده‌ام. با ساختار واقعی خودتان تطبیق دهید.

## SQL
    SELECT COUNT(*) FROM members WHERE expiry_date >= date('now');

## FastAPI
    @app.get("/stats/active-count")
    def active_count():
        row = db.execute("SELECT COUNT(*) FROM members WHERE expiry_date >= date('now')").fetchone()
        return {"active": row[0]}

## Express + better-sqlite3
    app.get('/stats/active-count', (req, res) => {
      const r = db.prepare("SELECT COUNT(*) AS n FROM members WHERE expiry_date >= date('now')").get();
      res.json({ active: r.n });
    });

## توصیه
- فقط همین مسیر باید عمومی بماند.
- یک محدودیت نرخ (rate limit) ساده یا کش چند‌دقیقه‌ای برایش بگذارید.
- این تغییر فقط جلوی افشای بیشتر را می‌گیرد؛ خود `GET /members` و بقیه‌ی مسیرها تا وقتی احراز هویت سمت سرور نداشته باشند هنوز برای هر کسی که آدرس را بداند باز هستند.
