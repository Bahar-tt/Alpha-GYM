@echo off
chcp 65001 >nul
title Alpha Gym - Fingerprint Agent
echo ========================================
echo   Alpha Gym - Fingerprint Agent
echo   دستگاه: RFT-200-Mifer (FOH02)
echo   پورت: COM5
echo ========================================
echo.

REM بررسی نصب Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [خطا] Node.js نصب نیست!
    echo از https://nodejs.org نصب کنید
    pause
    exit /b 1
)

echo [1/2] بررسی کتابخانه‌ها...
cd /d "%~dp0"
if not exist node_modules (
    echo نصب کتابخانه‌ها... ^(بار اول ممکنه ۲ دقیقه طول بکشه^)
    call npm install
    if errorlevel 1 (
        echo [خطا] نصب کتابخانه‌ها ناموفق بود
        pause
        exit /b 1
    )
)
echo [✓] کتابخانه‌ها آماده است
echo.

echo [2/2] اتصال به دستگاه...
echo.
echo اگر دستگاه کار نکرد، این موارد را چک کنید:
echo   - کابل USB متصل است؟
echo   - نرمافزار "ایمن تردد تندیس" بسته شده؟ (فقط یکی می‌تواند به COM5 وصل شود)
echo   - شماره پورت در Device Manager همان COM5 است؟
echo.
echo برای خروج Ctrl+C را بزنید
echo.

node fingerprint-agent.js

pause