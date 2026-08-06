#!/usr/bin/env bash
# Git Bash / macOS / Linux wrapper for publish.ps1
# Usage: ./publish.sh "Fix skateshop MXN prices"

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  echo 'Usage: ./publish.sh "commit message"'
  echo 'Example: ./publish.sh "Fix skateshop MXN prices"'
  exit 1
fi

if command -v pwsh >/dev/null 2>&1; then
  exec pwsh -NoProfile -File "$ROOT/publish.ps1" -Message "$MSG"
elif command -v powershell >/dev/null 2>&1; then
  exec powershell -NoProfile -ExecutionPolicy Bypass -File "$ROOT/publish.ps1" -Message "$MSG"
else
  echo "PowerShell not found. From PowerShell run:"
  echo "  .\\publish.ps1 -Message \"$MSG\""
  exit 1
fi
