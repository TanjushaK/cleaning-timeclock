param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$pgCtl = "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe"
if (-not (Test-Path $pgCtl)) {
  throw "pg_ctl was not found: $pgCtl"
}

$data = Join-Path $root "var\postgres-bundle\data"
$log = Join-Path $root "var\logs\postgres-bundle.log"

if (-not (Test-Path (Join-Path $data "PG_VERSION"))) {
  throw "No cluster found at $data. Create it first (initdb + pg_ctl register)."
}

New-Item -ItemType Directory -Force -Path (Join-Path $root "var\logs") | Out-Null

& $pgCtl -D $data status 2>&1 | Out-Host
if ($LASTEXITCODE -eq 0) {
  Write-Host "OK: local PostgreSQL is already running"
  exit 0
}

& $pgCtl -D $data -l $log -w start 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "pg_ctl start failed"
}
Write-Host "OK: local PostgreSQL bundle started"
