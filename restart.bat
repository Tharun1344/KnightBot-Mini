@echo off
title KnightBot-Mini - Restart
color 0E
echo.
echo  Restarting KnightBot-Mini...
echo.

REM Stop existing processes
call stop.bat >nul 2>&1

timeout /t 2 /nobreak >nul

REM Start again
start "" run.bat
echo [OK] KnightBot-Mini restarted.
timeout /t 3 /nobreak >nul
