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
set ROBOCOPY_RC=%ERRORLEVEL%

REM Robocopy never deletes extra files in the destination. Old files can override Nuxt routes on Vercel.
echo.
echo Removing obsolete files that no longer exist on C: (safe; fixes /dashboard/students old UI)...
if exist "%DEST%\pages\dashboard\students.vue" (
  del /f /q "%DEST%\pages\dashboard\students.vue"
  echo   Removed pages\dashboard\students.vue ^(use students\index.vue instead^)
)
if exist "%DEST%\scripts\parse-niik-library.cjs" (
  del /f /q "%DEST%\scripts\parse-niik-library.cjs"
  echo   Removed scripts\parse-niik-library.cjs ^(use .mjs parser only^)
)

if %ROBOCOPY_RC% LSS 8 (
  echo.
  echo Sync done. Open GitHub Desktop and you should see changed files.
) else (
  echo Robocopy reported errors. Check paths.
)

pause
