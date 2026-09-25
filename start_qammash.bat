@echo off
chcp 65001 >nul
title منصة الأستاذ القماش

:: فحص وتشغيل خادم الباك إند 5000
netstat -ano | findstr :5000 >nul
if %errorlevel% neq 0 (
    start /min "Qammash Backend" cmd /c "cd /d D:\pro2\tollaby-v2\backend && node src\index.js"
)

:: فحص وتشغيل خادم الفرونت إند 5173
netstat -ano | findstr :5173 >nul
if %errorlevel% neq 0 (
    start /min "Qammash Frontend" cmd /c "cd /d D:\pro2\tollaby-v2\frontend && npm run dev"
)

:: انتظار ثانية واحدة ثم فتح المنصة في المتصفح
timeout /t 2 /nobreak >nul

:: محاولة فتح Chrome في وضع التطبيق المستقل (بدون شريط متصفح) إذا كان مثبتاً
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173
    exit
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173
    exit
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173
    exit
)

:: إذا لم يكن كروم موجوداً يتم الفتح في المتصفح الافتراضي
start "" "http://localhost:5173"
exit
