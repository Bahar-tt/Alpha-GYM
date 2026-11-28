# پرومپت رفع باگ ثبت اثر انگشت پرسنل (کامپیوتر باشگاه)

عزیزم، لطفاً روی کامپیوتر باشگاه **اول فقط بخوان** و خروجی JSON را برگردان:

```powershell
py -3 diag_club_pc_readonly.py --path "C:\alpha-gym-module-native" --tail-lines 120 --foh 800008 800009
```

سپس (فقط بعد از تأیید من) این اصلاحات را اعمال کن:

## علت دقیق باگ

در `src/Hardware.cs` پرچم `_enrolling` فقط هنگام callback موفق (`StaticEnrollComplete`) یا استثنا/`false` صفر میشود.
وقتی SDK در `FPLIB.dll` گیر میکند، Agent timeout را اعلام میکند ولی `_enrolling` همچنان `true` میماند.
پس هر درخواست بعدی با پیغام `Enroll() returned false (already enrolled or sensor busy)` رد میشود — دقیقاً همان چیزی که در لاگهای `800008` و `800005` دیده میشود.
همچنین `FohReadLoop_Start()` قبل از `Enroll()` متوقف نمیشود و با حلقهٔ خواندن، wizard ثبت اثر انگشت به مرحلهٔ دوم نمیرسد.

## اصلاح لازم

### 1) `src/Hardware.cs`

اضافه کن:

```csharp
public void CancelEnroll()
{
    try { Log.Write("Foh CancelEnroll: reset _enrolling and EnrollMod"); } catch { }
    _enrolling = false;
    try { FohTimer.EnrollMod = false; } catch { }
    try { FohTimer.MemberID = 0; } catch { }
}
```

در `Enroll(uint memberId)`:

* قبل از `FohTimer.EnrollMod = true`، حلقهٔ خواندن را متوقف کن:
  `try { InvokeStatic("FohReadLoop_End"); Log.Write("FohReadLoop_End before Enroll"); } catch (Exception ex) { Log.Write("FohReadLoop_End failed: " + Log.Flatten(ex)); }`
* SDK call را در `try/finally` بگیر و در `finally` `_enrolling` و `EnrollMod` را پاک کن (فقط بعد از callback موفق نباید پاک شود — در `StaticEnrollComplete` sudah پاک میشود؛ بنابراین در `finally` فقط زمانی پاک کن که `ok == false` یا استثنا رخ داده باشد).
* بعد از `Enroll() returned false` حتماً `CancelEnroll()` را صدا بزن و سپس `FohReadLoop_Start()` را دوباره اجرا کن.
* در `Stop()` هم قبل از `FohReadLoop_End`، `CancelEnroll()` را صدا بزن.

### 2) `src/Agent.cs`

در `OnFingerTimeout` بعد از `EnqueueEnrollmentFail(...)`:

```csharp
try { _fp.CancelEnroll(); } catch (Exception ex) { Log.Write("CancelEnroll on timeout: " + Log.Flatten(ex)); }
try { _fp.RestartReadLoop(); } catch { }
```

و در `Hardware.cs` متد کمکی:

```csharp
public void RestartReadLoop()
{
    try { InvokeStatic("FohReadLoop_Start"); Log.Write("FohReadLoop_Start after enroll close"); } catch { }
}
```

همچنین در `OnFpEnrollComplete` و مسیر `enroll_failed` هم `RestartReadLoop()` صدا زده شود.

### 3) `src/GymBridge.cs`

همان الگو را برای متد `Enroll` و timeout اعمال کن: reset `_enrolling`، `EnrollMod=false`، `FohReadLoop_End` قبل از Enroll و `FohReadLoop_Start` بعد از اتمام.

## بعد از اصلاح

* Agent را ریاستارت کن (-services)، سپس `800009` (نازنین رضایی) را تست کن — نه `800008`.
* خروجی لاگ را فقط با الگوبرداریِ bright resulting lines برگردان؛ **هیچ** `agent_key`، رمز یا محتوای `agent.config.json` نفرست.
* نام فایلها و هش قبل/بعد را اعلام کن.

هیچ تغییری روی `/var/www/alphagym` لازم نیست؛ سمت سرور و پیغامهای UI توسط من آپدیت میشود.
