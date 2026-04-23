param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$project = "C:\Users\info\cleaning-timeclock-selfhost-audit"
Set-Location $project

function Get-EnvMap {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  foreach ($line in Get-Content $Path) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.TrimStart().StartsWith("#")) { continue }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1)
    $map[$key] = $val
  }
  return $map
}

function Set-EnvValue {
  param([string]$Path,[string]$Key,[string]$Value)
  $lines = @()
  if (Test-Path $Path) { $lines = Get-Content $Path }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$([regex]::Escape($Key))=") {
      $lines[$i] = "$Key=$Value"
      $found = $true
    }
  }
  if (-not $found) { $lines += "$Key=$Value" }
  Set-Content -Path $Path -Value $lines -Encoding UTF8
}

function Resolve-Psql {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "bin\psql.exe" } |
    Where-Object { Test-Path $_ }
  if ($candidates -and $candidates.Count -gt 0) { return $candidates[0] }
  throw "psql.exe не найден"
}

if (-not (Test-Path ".env.local") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env.local"
}

$envPath = Join-Path $project ".env.local"
$envMap = Get-EnvMap $envPath
$dbUrl = if ($envMap.ContainsKey("DATABASE_URL") -and $envMap["DATABASE_URL"]) { $envMap["DATABASE_URL"] } else { "postgres://timeclock:change-me@127.0.0.1:5432/timeclock" }

$uri = [Uri]$dbUrl
$userInfo = $uri.UserInfo
$appUser = if ($userInfo.Contains(":")) { $userInfo.Split(":",2)[0] } else { "timeclock" }
$appPass = if ($userInfo.Contains(":")) { $userInfo.Split(":",2)[1] } else { "change-me" }
$appDb   = $uri.AbsolutePath.TrimStart("/")
if (-not $appDb) { $appDb = "timeclock" }
$pgHost  = if ($uri.Host) { $uri.Host } else { "127.0.0.1" }
$pgPort  = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

$svc = Get-CimInstance Win32_Service | Where-Object { $_.Name -like "postgresql*" } | Sort-Object Name -Descending | Select-Object -First 1
if (-not $svc) { throw "Сервис PostgreSQL не найден" }

$serviceName = $svc.Name
$pathName = $svc.PathName
if ($pathName -notmatch '-D\s+"([^"]+)"') { throw "Не удалось определить data dir PostgreSQL" }
$dataDir = $Matches[1]

$pgHba = Join-Path $dataDir "pg_hba.conf"
$backup = Join-Path $dataDir "pg_hba.conf.selfhost-audit.bak"

if (-not (Test-Path $pgHba)) { throw "Не найден pg_hba.conf" }
if (-not (Test-Path $backup)) {
  Copy-Item $pgHba $backup -Force
}

$original = Get-Content $backup -Raw
$trustBlock = @"
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust

"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($pgHba, ($trustBlock + $original), $utf8NoBom)

Restart-Service $serviceName -Force
Start-Sleep -Seconds 3

$psql = Resolve-Psql
New-Item -ItemType Directory -Force -Path ".\var\logs" | Out-Null
$sqlPath = Join-Path $project "var\logs\local-postgres-bootstrap.sql"

$appUserSql = $appUser.Replace("'", "''")
$appPassSql = $appPass.Replace("'", "''")
$appDbSql   = $appDb.Replace("'", "''")

@"
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$appUserSql') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '$appUserSql', '$appPassSql');
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', '$appUserSql', '$appPassSql');
  END IF;
END
\$\$;

SELECT format('CREATE DATABASE %I OWNER %I', '$appDbSql', '$appUserSql')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$appDbSql') \gexec

GRANT ALL PRIVILEGES ON DATABASE "$appDb" TO "$appUser";
"@ | Set-Content -Path $sqlPath -Encoding UTF8

& $psql -h $pgHost -p $pgPort -U postgres -d postgres -v ON_ERROR_STOP=1 -f $sqlPath
if ($LASTEXITCODE -ne 0) { throw "psql bootstrap завершился с ошибкой" }

Set-EnvValue -Path $envPath -Key "DATABASE_URL" -Value ('postgres://{0}:{1}@{2}:{3}/{4}' -f $appUser, $appPass, $pgHost, $pgPort, $appDb)
Set-EnvValue -Path $envPath -Key "APP_PUBLIC_ORIGIN" -Value "http://localhost:3000"
Set-EnvValue -Path $envPath -Key "GEOCODE_PUBLIC" -Value "1"

npm.cmd run db:migrate
if ($LASTEXITCODE -ne 0) { throw "npm run db:migrate завершился с ошибкой" }

$adminEmail = "admin@local.test"
$adminPassword = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 20 | ForEach-Object {[char]$_})
$env:BOOTSTRAP_ADMIN_EMAIL = $adminEmail
$env:BOOTSTRAP_ADMIN_PASSWORD = $adminPassword

npm.cmd run bootstrap:admin
if ($LASTEXITCODE -ne 0) { throw "npm run bootstrap:admin завершился с ошибкой" }

@"
EMAIL=$adminEmail
PASSWORD=$adminPassword
"@ | Set-Content -Path ".\var\logs\local-admin-credentials.txt" -Encoding UTF8

Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "npm run build завершился с ошибкой" }

powershell -ExecutionPolicy Bypass -File .\local-smoke-auth-api.ps1

Copy-Item $backup $pgHba -Force
Restart-Service $serviceName -Force
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "OK: локальный Postgres поднят, миграция применена, admin создан"
Write-Host "CREDENTIALS: .\var\logs\local-admin-credentials.txt"
