@echo off
chcp 65001 >nul
title منصة الأستاذ محمد القماش

echo ===================================================
echo     جاري تشغيل منصة الأستاذ محمد القماش...
echo ===================================================

:: 1. تشغيل خادم الباك إند (Port 5000)
netstat -ano | findstr /R /C:":5000\>" >nul
if %errorlevel% neq 0 (
    echo [1/3] تشغيل خادم البيانات (Backend)...
    start /min "Qammash Backend" cmd /c "cd /d "%~dp0backend" && node src\index.js"
) else (
    echo [1/3] خادم البيانات يعمل بالفعل.
)

:: 2. تشغيل واجهة النظام (Port 5173)
netstat -ano | findstr /R /C:":5173\>" >nul
if %errorlevel% neq 0 (
    echo [2/3] تشغيل واجهة المنصة (Frontend)...
    start /min "Qammash Frontend" cmd /c "cd /d "%~dp0frontend" && npm.cmd run dev"
) else (
    echo [2/3] واجهة المنصة تعمل بالفعل.
)

:: 3. الانتظار الذكي حتى تصبح المنصة جاهزة
echo [3/3] جاري فحص جاهزية المنصة...
set /a attempts=0
:WAIT_LOOP
timeout /t 1 /nobreak >nul
netstat -ano | findstr /R /C:":5173\>" >nul
if %errorlevel% neq 0 (
    set /a attempts+=1
    if %attempts% lss 25 (
        goto WAIT_LOOP
    )
)

:: انتظار ثانية إضافية للتأكد من اكتمال استجابة السيرفر
timeout /t 2 /nobreak >nul

:: رابط المنصة (HTTPS)
set APP_URL=https://localhost:5173

:: محاولة فتح Chrome في وضع التطبيق المستقل وبدون أخطاء شهادة
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --ignore-certificate-errors --app=%APP_URL%
    exit
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --ignore-certificate-errors --app=%APP_URL%
    exit
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --ignore-certificate-errors --app=%APP_URL%
    exit
)

:: محاولة فتح Microsoft Edge
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --ignore-certificate-errors --app=%APP_URL%
    exit
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --ignore-certificate-errors --app=%APP_URL%
    exit
)

:: فتح المتصفح الافتراضي كخيار أخير
start "" "%APP_URL%"
exit
