@echo off
title NiikSkate Academy - Starting...
color 0A

echo.
echo  ========================================
echo   NiikSkate Academy - App Launcher
echo   Version 1.1.0
echo  ========================================
echo.

:: Navigate to app directory
cd /d "%~dp0"

echo [1/4] Killing old Node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] Clearing Nuxt cache...
if exist ".nuxt" rmdir /s /q ".nuxt" 2>nul
if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite" 2>nul
if exist ".output" rmdir /s /q ".output" 2>nul

echo [3/4] Cache cleared successfully!
echo.

echo [4/4] Starting development server...
echo.
echo  ----------------------------------------
echo   App will be available at:
echo   http://localhost:3000
echo  ----------------------------------------
echo.
echo   Press Ctrl+C to stop the server
echo.

npm run dev

pause
