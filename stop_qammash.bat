@echo off
title Stopping Tollaby Platform

echo ==============================================
echo   Stopping Tollaby Platform servers...
echo ==============================================

for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":5000\>"') do (
    taskkill /f /pid %%a 2>nul
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":5173\>"') do (
    taskkill /f /pid %%a 2>nul
)

echo.
echo All servers have been stopped successfully.
ping 127.0.0.1 -n 3 >nul
exit
