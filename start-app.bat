@echo off
setlocal EnableExtensions
title NiikSkate Academy - Starting...
color 0A

:: Navigate to app directory first (needed for relative paths below)
cd /d "%~dp0"

:: ---------------------------------------------------------------------------
:: Put Node.js on PATH — double-click / "Open with cmd" often has a short PATH
:: (no NVM/fnm/Volta hooks). Match scripts\fix-node-path.ps1 as much as we can.
:: ---------------------------------------------------------------------------
if defined NVM_SYMLINK set "PATH=%NVM_SYMLINK%;%PATH%"
if defined NVM_HOME set "PATH=%NVM_HOME%;%PATH%"
set "PATH=%ProgramFiles%\nodejs;%PATH%"
set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
if defined LOCALAPPDATA set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if exist "%USERPROFILE%\.volta" set "PATH=%USERPROFILE%\.volta\bin;%PATH%"

:: fnm: apply version from .node-version / .nvmrc if fnm is installed (no shell hook)
if exist "%USERPROFILE%\.fnm\fnm.exe" (
  for /f "usebackq delims=" %%i in (`"%USERPROFILE%\.fnm\fnm.exe" env --shell cmd 2^>nul`) do call %%i
) else if exist "%LOCALAPPDATA%\fnm\fnm.exe" (
  for /f "usebackq delims=" %%i in (`"%LOCALAPPDATA%\fnm\fnm.exe" env --shell cmd 2^>nul`) do call %%i
)

:: Resolve npm.cmd without relying on PATH alone (fixes many "npm not found" cases)
set "NPM_CMD="
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do (
  set "NPM_CMD=%%I"
  goto :npm_found
)
if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
if not defined NPM_CMD if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"
if not defined NPM_CMD if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" set "NPM_CMD=%LOCALAPPDATA%\Programs\nodejs\npm.cmd"
:npm_found

if not defined NPM_CMD (
  color 0C
  echo.
  echo  ERROR: npm.cmd was not found.
  echo.
  echo  This folder was checked: %CD%
  echo.
  echo  Fix one of these:
  echo   1. Install Node.js LTS from https://nodejs.org  ^(enable "Add to PATH"^)
  echo   2. Run scripts\fix-node-path.ps1, sign out of Windows, try again
  echo   3. If you use nvm-windows, open a shell where "node -v" works, then run this .bat from there
  echo   4. If you use fnm, ensure fnm.exe is under %%USERPROFILE%%\.fnm or %%LOCALAPPDATA%%\fnm
  echo.
  pause
  exit /b 1
)

echo.
echo  ========================================
echo   NiikSkate Academy - App Launcher
echo   Version 1.3.0
echo  ========================================
echo.
echo  Using: %NPM_CMD%
echo.

echo [1/4] Stopping previous dev server on this machine ^(all node.exe^)...
taskkill /F /IM node.exe >nul 2>&1
:: ping pause works when TIMEOUT fails ^(e.g. non-interactive stdin: "Input redirection is not supported"^)
ping 127.0.0.1 -n 3 >nul

echo [2/4] Clearing Nuxt/Vite cache...
if /i "%NIIK_SKIP_CLEAN%"=="1" (
  echo   Skipped ^(NIIK_SKIP_CLEAN=1^).
) else if /i "%NIIK_FULL_CLEAN%"=="1" (
  echo   Full clean: env NIIK_FULL_CLEAN=1 — removes .nuxt, Vite cache, .output
  if exist ".nuxt" rmdir /s /q ".nuxt" 2>nul
  if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite" 2>nul
  if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache" 2>nul
  if exist ".output" rmdir /s /q ".output" 2>nul
) else (
  echo   Default: keeping .nuxt ^(better on OneDrive^). Set NIIK_FULL_CLEAN=1 to wipe all caches.
  if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite" 2>nul
  if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache" 2>nul
)

:: Fix "Cannot find module ...\.nuxt\dist\server\server.mjs" — dev stub without Nitro bundle ^(OneDrive / killed node^).
if exist ".nuxt\dev\index.mjs" if not exist ".nuxt\dist\server\server.mjs" (
  echo   Nuxt dev cache incomplete — removing .nuxt so the server bundle rebuilds.
  if exist ".nuxt" rmdir /s /q ".nuxt" 2>nul
)

echo [3/4] Cache step done.
echo.

echo [3b/4] Nuxt prepare ^(types / stubs^)...
call "%NPM_CMD%" exec nuxi prepare
if errorlevel 1 (
  color 0C
  echo   nuxi prepare failed. Fix errors above, then try again.
  pause
  exit /b 1
)

echo [4/4] Starting development server...
echo.
echo  ----------------------------------------
echo   App will be available at:
echo   http://localhost:3062
echo  ----------------------------------------
echo.
echo   Press Ctrl+C to stop the server
echo.
echo  Tip: Repo on OneDrive — if the app spins forever, ensure vite polling is on ^(nuxt.config^).
echo.

:: Chokidar polling for tools that read this env ^(belt-and-suspenders on Windows^)
set "CHOKIDAR_USEPOLLING=1"
set "CHOKIDAR_INTERVAL=1000"

:: Corporate VPN/proxy ^(e.g. AMDOCS^): Node rejects Supabase HTTPS while the browser works.
:: scripts/dev-server.mjs applies the same on Windows; this covers nuxi prepare above too.
if /i not "%NIIK_ALLOW_INSECURE_TLS%"=="0" (
  echo   TLS: allowing local dev through corporate proxy certs ^(NIIK_ALLOW_INSECURE_TLS=0 to disable^)
  set "NODE_TLS_REJECT_UNAUTHORIZED=0"
)

:: MUST use CALL: npm.cmd is a batch file — without CALL, when npm exits, CMD may
:: skip the rest of this script ^(window closes; you never see errors^).
call "%NPM_CMD%" run dev -- --port 3062

echo.
pause
endlocal
