@echo off
title KnightBot-Mini - Stop
color 0C
echo.
echo  Stopping KnightBot-Mini...
echo.

REM Find and kill node processes running index.js
for /f "tokens=2" %%p in ('tasklist /fi "imagename eq node.exe" /fo csv /nh 2^>nul') do (
    wmic process where "processid=%%~p" get commandline 2>nul | findstr /i "index.js" >nul
    if not errorlevel 1 (
        echo Stopping process %%~p ...
        taskkill /PID %%~p /F >nul 2>&1
    )
)

echo [OK] KnightBot-Mini stopped.
echo.
pause
