# Deploy local working tree to Vercel production
# Usage:  .\deploy-to-vercel.ps1
# First run will ask you to log in / link the project.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Corporate VPN/proxy (e.g. AMDOCS) often breaks Node HTTPS to Vercel
if ($env:NIIK_ALLOW_INSECURE_TLS -ne "0") {
  $env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
  Write-Host "Using NODE_TLS_REJECT_UNAUTHORIZED=0 (corporate proxy)." -ForegroundColor Yellow
}

# Ensure Vercel CLI is on PATH (npm global bin)
$npmPrefix = (& npm config get prefix 2>$null)
if ($npmPrefix) {
  $env:Path = "$npmPrefix;$npmPrefix\bin;$env:Path"
}

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Vercel CLI..." -ForegroundColor Cyan
  npm i -g vercel
  if ($LASTEXITCODE -ne 0) { throw "Failed to install vercel CLI" }
}

Write-Host "`nChecking Vercel login..." -ForegroundColor Cyan
vercel whoami
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Opening login..." -ForegroundColor Yellow
  vercel login
  if ($LASTEXITCODE -ne 0) { throw "Vercel login failed" }
}

# Link project once (creates .vercel/)
if (-not (Test-Path ".vercel\project.json")) {
  Write-Host "`nLinking this folder to your Vercel project..." -ForegroundColor Cyan
  Write-Host "Pick the EXISTING niikskate project (do not create a new one)." -ForegroundColor Yellow
  vercel link
  if ($LASTEXITCODE -ne 0) { throw "Vercel link failed" }
}

Write-Host "`nDeploying to Vercel (production)..." -ForegroundColor Cyan
vercel --prod --yes
if ($LASTEXITCODE -ne 0) {
  throw "Deploy failed (exit $LASTEXITCODE). Nothing was published."
}

Write-Host "`nDone. Open the Production URL printed above (hard-refresh: Ctrl+Shift+R)." -ForegroundColor Green
