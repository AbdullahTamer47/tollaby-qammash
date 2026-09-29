@echo off
title Tollaby Backend Server
:LOOP
echo [%DATE% %TIME%] Starting Tollaby Backend Server...
node src\index.js
echo [%DATE% %TIME%] Backend process stopped. Auto-restarting in 2 seconds...
timeout /t 2 >nul
goto LOOP
