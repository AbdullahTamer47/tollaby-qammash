@echo off
title Tollaby Platform - Mr. Mohamed Al-Qammash

echo ========================================================
echo   Starting Tollaby Platform - Mr. Mohamed Al-Qammash...
echo ========================================================

REM 1. Check if backend is LISTENING on Port 5000
netstat -ano -p tcp | findstr /R /C:":5000 .*LISTENING" >nul
if %errorlevel% neq 0 (
    echo [1/3] Launching Backend Server...
    start "Tollaby Backend" /D "%~dp0backend" /min cmd /c "node src\index.js"
) else (
    echo [1/3] Backend Server is already running.
)

REM 2. Check if frontend is LISTENING on Port 5173
netstat -ano -p tcp | findstr /R /C:":5173 .*LISTENING" >nul
if %errorlevel% neq 0 (
    echo [2/3] Launching Frontend Server...
    start "Tollaby Frontend" /D "%~dp0frontend" /min cmd /c "npm.cmd run dev"
) else (
    echo [2/3] Frontend Server is already running.
)

REM 3. Wait until Frontend is actually LISTENING on Port 5173
echo [3/3] Waiting for platform to be ready...
set /a attempts=0
:WAIT_LOOP
ping 127.0.0.1 -n 2 >nul
netstat -ano -p tcp | findstr /R /C:":5173 .*LISTENING" >nul
if %errorlevel% neq 0 (
    set /a attempts+=1
    if %attempts% lss 35 (
        goto WAIT_LOOP
    )
)

ping 127.0.0.1 -n 2 >nul

set APP_URL=https://localhost:5173

REM Try Google Chrome in App Mode
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

REM Try Microsoft Edge in App Mode
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --ignore-certificate-errors --app=%APP_URL%
    exit
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --ignore-certificate-errors --app=%APP_URL%
    exit
)

REM Fallback to Default Browser
start "" "%APP_URL%"
exit
