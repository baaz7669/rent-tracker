@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Rent Tracker Build

echo ============================================
echo   Rent Tracker - One-Click Build
echo ============================================
echo.

:: ---------- Verify Node.js, install only if missing ----------
echo Checking for Node.js...
where node >nul 2>nul
if !errorlevel! equ 0 (
    echo Node.js is already installed - skipping install.
    node -v
    goto :build
)

echo Node.js not found.
where winget >nul 2>nul
if !errorlevel! neq 0 (
    echo Please install Node.js LTS from https://nodejs.org and run this script again.
    pause
    exit /b 1
)
echo Installing Node.js LTS with winget (Windows may ask for permission)...
winget install OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
echo.
echo Node.js installed. Close this window and run the script again
echo so it picks up the new PATH.
pause
exit /b

:build
echo.

:: ---------- Install project dependencies (also fetches Electron) ----------
echo Installing project dependencies...
call npm install
if !errorlevel! neq 0 (
    echo npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
)

:: ---------- Run the rent calculation tests before packaging ----------
echo Running tests...
call npm test
if !errorlevel! neq 0 (
    echo Tests failed - not building. Nothing was changed.
    pause
    exit /b 1
)

:: ---------- Build the web bundle and package the Windows exe ----------
echo Building and packaging Windows .exe (installer + portable)...
call npm run dist:win
if !errorlevel! neq 0 (
    echo Packaging failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Done! Your .exe files are in .\dist-electron\
echo   - "Rent Tracker Setup x.x.x.exe"      = installer
echo   - "Rent Tracker x.x.x Portable.exe"   = portable (no install)
echo ============================================
explorer "%~dp0dist-electron"
pause
