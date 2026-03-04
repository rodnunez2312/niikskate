# ========================================
# NiikSkate Academy - App Launcher
# PowerShell Script
# ========================================

$Host.UI.RawUI.WindowTitle = "NiikSkate Academy - Dev Server"

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host "   NiikSkate Academy - App Launcher" -ForegroundColor Cyan
Write-Host "   Version 1.1.0" -ForegroundColor Yellow
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to script directory
Set-Location $PSScriptRoot

# Step 1: Kill old processes
Write-Host "[1/4] Killing old Node processes..." -ForegroundColor Gray
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Step 2: Clear caches
Write-Host "[2/4] Clearing Nuxt cache..." -ForegroundColor Gray

$cacheFolders = @(".nuxt", "node_modules\.vite", ".output")
foreach ($folder in $cacheFolders) {
    if (Test-Path $folder) {
        Remove-Item -Recurse -Force $folder -ErrorAction SilentlyContinue
        Write-Host "  - Removed $folder" -ForegroundColor DarkGray
    }
}

Write-Host "[3/4] Cache cleared successfully!" -ForegroundColor Green
Write-Host ""

# Step 3: Start server
Write-Host "[4/4] Starting development server..." -ForegroundColor Gray
Write-Host ""
Write-Host "  ----------------------------------------" -ForegroundColor DarkCyan
Write-Host "   App will be available at:" -ForegroundColor White
Write-Host "   http://localhost:3000" -ForegroundColor Yellow
Write-Host "  ----------------------------------------" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "   Press Ctrl+C to stop the server" -ForegroundColor DarkGray
Write-Host ""

# Run npm dev
npm run dev
