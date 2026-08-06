# Publish NiikSkate to production (recommended: GitHub → Vercel auto-deploy)
#
# PowerShell:
#   .\publish.ps1 -Message "Fix skateshop prices and product photos"
#
# Git Bash:
#   ./publish.sh "Fix skateshop prices and product photos"
#   # or: powershell -ExecutionPolicy Bypass -File ./publish.ps1 -Message "..."
#
# Optional:
#   .\publish.ps1 -Message "..." -Branch main
#   .\publish.ps1 -VercelCliOnly          # Skip git; deploy local folder via Vercel CLI
#
# Recommended workflow: commit + push only. If Vercel is linked to this repo on GitHub,
# production updates after the push (check the Vercel dashboard). Use -VercelCliOnly only
# when you must deploy without pushing or GitHub deploy is broken.

param(
  [string]$Message = "",
  [string]$Branch = "main",
  [switch]$VercelCliOnly
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Invoke-VercelDeploy {
  & "$PSScriptRoot\deploy-to-vercel.ps1"
}

if ($VercelCliOnly) {
  Write-Host "Vercel CLI deploy only (GitHub will NOT be updated)." -ForegroundColor Yellow
  Invoke-VercelDeploy
  exit 0
}

Write-Host "`n=== NiikSkate publish (git push -> Vercel) ===" -ForegroundColor Cyan

$porcelain = git status --porcelain
if (-not $porcelain) {
  Write-Host "Working tree clean - nothing to commit." -ForegroundColor Gray
} else {
  Write-Host "`nChanges to publish:" -ForegroundColor Cyan
  git status -sb

  if (-not $Message.Trim()) {
    throw 'Provide -Message "what changed" (required when there are uncommitted changes).'
  }

  # Respect .gitignore (.env, .nuxt, node_modules, etc.)
  git add -A
  $staged = git diff --cached --name-only
  if (-not $staged) {
    Write-Host "No staged files after git add (ignored-only changes?)." -ForegroundColor Yellow
  } else {
    Write-Host "`nCommitting..." -ForegroundColor Cyan
    git commit -m $Message.Trim()
    if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
  }
}

$upstream = git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null
if (-not $upstream) {
  Write-Host "`nSetting upstream to origin/$Branch..." -ForegroundColor Cyan
  git push -u origin HEAD:$Branch
} else {
  Write-Host "`nPushing to origin/$Branch..." -ForegroundColor Cyan
  git push origin HEAD:$Branch
}
if ($LASTEXITCODE -ne 0) { throw "git push failed" }

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  GitHub: branch '$Branch' is updated." -ForegroundColor Green
Write-Host "  Vercel: open your project dashboard and wait until the latest deployment is Ready." -ForegroundColor Green
Write-Host "  Browser: hard-refresh production (Ctrl+Shift+R)." -ForegroundColor Green
Write-Host ""
Write-Host "Supabase SQL migrations are NOT run by this script - run those in the SQL Editor when needed." -ForegroundColor Gray
