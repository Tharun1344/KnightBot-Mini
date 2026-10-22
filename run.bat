@echo off
title KnightBot-Mini
color 0B

REM Prevent running from wrong directory
if not exist "package.json" (
    echo [ERROR] package.json not found!
    echo Please run this script from the KnightBot-Mini folder.
    pause
    exit /b 1
)

REM Check if node_modules installed
if not exist "node_modules\@whiskeysockets\baileys" (
    echo [WARNING] Dependencies not installed. Running setup first...
    call setup.bat
)

REM Check .env exists
if not exist ".env" (
    echo [WARNING] .env not found. Creating from example...
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo Please edit .env and run this script again.
        notepad ".env"
        pause
        exit /b 0
    )
)

REM Kill any existing bot processes on port or by name
echo [INFO] Checking for existing bot processes...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if not errorlevel 1 (
    echo [INFO] Existing Node.js processes found. They may be other apps.
    echo [INFO] Starting bot alongside them...
)

echo.
echo  ===================================================
echo       KnightBot-Mini is starting...
echo  ===================================================
echo.
echo  - Scan the QR code with WhatsApp when it appears
echo  - Or wait for pairing code instructions
echo  - Press Ctrl+C to stop the bot
echo.

:start
node index.js
echo.
echo [INFO] Bot stopped. Restarting in 5 seconds...
echo [INFO] Press Ctrl+C to exit.
timeout /t 5 /nobreak >nul
goto start
