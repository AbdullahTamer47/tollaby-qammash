@echo off
chcp 65001 >nul
title إيقاف منصة الأستاذ القماش
echo ==============================================
echo   جاري إيقاف جميع خوادم منصة الأستاذ القماش...
echo ==============================================

for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":5000\>"') do (
    taskkill /f /pid %%a 2>nul
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":5173\>"') do (
    taskkill /f /pid %%a 2>nul
)

echo.
echo تم إيقاف جميع الخوادم بنجاح!
timeout /t 2 >nul
exit
