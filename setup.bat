@echo off
title KnightBot-Mini Setup
color 0A
echo.
echo  ===================================================
echo       KnightBot-Mini - Windows Setup Script
echo  ===================================================
echo.

REM Check Node.js version
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found!
    echo Please install Node.js v20 or newer from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

FOR /F "tokens=1,2 delims=v." %%a IN ('node --version') DO SET NODE_MAJOR=%%b
if %NODE_MAJOR% LSS 18 (
    echo [WARNING] Node.js version is too old. Please use v20 or newer.
    echo Current version:
    node --version
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js version:
node --version
echo.

REM Check npm
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Please reinstall Node.js.
    pause
    exit /b 1
)
echo [OK] npm version:
npm --version
echo.

REM Create .env from example if not exists
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Creating .env from .env.example ...
        copy ".env.example" ".env" >nul
        echo [OK] .env created. Please edit it with your settings.
        echo.
        echo Opening .env for editing...
        notepad ".env"
    ) else (
        echo [WARNING] .env.example not found. Please create .env manually.
    )
) else (
    echo [OK] .env already exists.
)
echo.

REM Create necessary directories
if not exist "session" mkdir session
if not exist "database" mkdir database
if not exist "temp" mkdir temp
echo [OK] Directories created/verified.
echo.

REM Install dependencies
echo [INFO] Installing npm dependencies...
echo This may take a few minutes...
echo.
call npm install --legacy-peer-deps
if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed! Check the error messages above.
    pause
    exit /b 1
)
echo.
echo [OK] Dependencies installed successfully.
echo.

REM Run tests
echo [INFO] Running tests...
call npm test
if errorlevel 1 (
    echo [WARNING] Some tests failed. Check test output above.
) else (
    echo [OK] All tests passed.
)
echo.

echo  ===================================================
echo   Setup Complete!
echo  ===================================================
echo.
echo  Next steps:
echo   1. Edit .env file with your settings
echo   2. Set OWNER_NUMBER to your WhatsApp number
echo   3. Set BOT_NAME to your preferred bot name
echo   4. Run: run.bat to start the bot
echo.
echo  For Supabase (optional):
echo   Set SUPABASE_URL and SUPABASE_KEY in .env
echo.
pause
