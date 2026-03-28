# Finds Node.js install folder and adds it to your *user* PATH if missing.
# Run in PowerShell (right-click -> Run with PowerShell), or:
#   powershell -ExecutionPolicy Bypass -File .\scripts\fix-node-path.ps1
# Then close ALL terminals and Cursor, reopen, and run: npm -v

$ErrorActionPreference = 'Stop'

$searchRoots = @(
    (Join-Path $env:ProgramFiles 'nodejs'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs'),
    (Join-Path $env:LOCALAPPDATA 'fnm_multishells'),
    (Join-Path $env:USERPROFILE '.volta\bin')
)

$nodeDir = $null
foreach ($dir in $searchRoots) {
    if (-not $dir) { continue }
    $npm = Join-Path $dir 'npm.cmd'
    $nodeExe = Join-Path $dir 'node.exe'
    if ((Test-Path $npm) -and (Test-Path $nodeExe)) {
        $nodeDir = $dir
        break
    }
}

if (-not $nodeDir) {
    Write-Host ''
    Write-Host 'Node.js was not found in common install locations.' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Install Node.js LTS, then run this script again:' -ForegroundColor Yellow
    Write-Host '  https://nodejs.org/en/download/' -ForegroundColor Cyan
    Write-Host '  Or (Windows 10/11):  winget install OpenJS.NodeJS.LTS' -ForegroundColor Cyan
    Write-Host ''
    Write-Host 'In the installer, enable "Add to PATH" / automatically install tools.' -ForegroundColor Yellow
    exit 1
}

Write-Host "Found Node.js at: $nodeDir" -ForegroundColor Green

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ([string]::IsNullOrEmpty($userPath)) {
    $userPath = ''
}

$parts = $userPath -split ';' | ForEach-Object { $_.TrimEnd('\') } | Where-Object { $_ }
if ($parts -contains $nodeDir.TrimEnd('\')) {
    Write-Host 'That folder is already on your User PATH.' -ForegroundColor Green
    Write-Host 'If npm still fails, sign out of Windows or reboot, then try again.' -ForegroundColor Yellow
    exit 0
}

$newPath = ($userPath.TrimEnd(';') + ';' + $nodeDir).Trim(';')
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
Write-Host ''
Write-Host 'Added to User PATH:' $nodeDir -ForegroundColor Green
Write-Host ''
Write-Host 'IMPORTANT: Close every terminal, quit Cursor completely, then reopen.' -ForegroundColor Yellow
Write-Host 'After that, run:  npm -v' -ForegroundColor Cyan
exit 0
