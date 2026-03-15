@echo off
REM Sync C:\Scheduling (where you edit) to OneDrive repo so GitHub Desktop can commit/push.
REM Run this from C:\Scheduling or double-click the file.

set SOURCE=C:\Scheduling
set DEST=C:\Users\rodrigs\OneDrive - AMDOCS\Documents\GitHub\niikskate

if not exist "%DEST%" (
  echo Destination folder not found: %DEST%
  echo Edit DEST in this script if your OneDrive path is different.
  pause
  exit /b 1
)

echo Syncing %SOURCE% to OneDrive repo...
echo Excluding: node_modules, .nuxt, .output, .git
echo.

robocopy "%SOURCE%" "%DEST%" /E /XD node_modules .nuxt .output .git /XF *.log /NFL /NDL /NJH /NJS /R:1 /W:1

if %ERRORLEVEL% LSS 8 (
  echo.
  echo Sync done. Open GitHub Desktop and you should see changed files.
) else (
  echo Robocopy reported errors. Check paths.
)

pause
