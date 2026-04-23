param(
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $root) { $root = (Get-Location).Path }
Set-Location $root

New-Item -ItemType Directory -Force -Path (Join-Path $root "var\logs") | Out-Null

if (-not (Test-Path (Join-Path $root ".env.local")) -and (Test-Path (Join-Path $root ".env.example"))) {
  Copy-Item (Join-Path $root ".env.example") (Join-Path $root ".env.local")
}

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
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )
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

$envPath = Join-Path $root ".env.local"
$envMap = Get-EnvMap $envPath
$dbUrl = if ($envMap.ContainsKey("DATABASE_URL") -and $envMap["DATABASE_URL"]) { $envMap["DATABASE_URL"] } else { "postgres://timeclock:change-me@127.0.0.1:5432/timeclock" }

$uri = [Uri]$dbUrl
$userInfo = $uri.UserInfo
$appUser = if ($userInfo.Contains(":")) { $userInfo.Split(":", 2)[0] } else { "timeclock" }
$appPass = if ($userInfo.Contains(":")) { $userInfo.Split(":", 2)[1] } else { "change-me" }
$appDb = $uri.AbsolutePath.TrimStart("/")
if (-not $appDb) { $appDb = "timeclock" }
$pgHost = if ($uri.Host) { $uri.Host } else { "127.0.0.1" }
$pgPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

$tcp = Test-NetConnection -ComputerName $pgHost -Port $pgPort -WarningAction SilentlyContinue
if (-not $tcp.TcpTestSucceeded) { throw "PostgreSQL недоступен на $pgHost`:$pgPort" }

$psql = Resolve-Psql

$adminUser = "postgres"
if ($envMap.ContainsKey("POSTGRES_ADMIN_USER") -and $envMap["POSTGRES_ADMIN_USER"]) {
  $adminUser = $envMap["POSTGRES_ADMIN_USER"].Trim()
} elseif ($env:POSTGRES_ADMIN_USER) {
  $adminUser = [string]$env:POSTGRES_ADMIN_USER
}

$adminPassword = ""
$passFile = $env:POSTGRES_ADMIN_PASSWORD_FILE
if (-not $passFile) { $passFile = $envMap["POSTGRES_ADMIN_PASSWORD_FILE"] }
if ($passFile -and (Test-Path $passFile)) {
  $adminPassword = (Get-Content -Path $passFile -Raw).Trim()
}
if (-not $adminPassword -and $envMap.ContainsKey("POSTGRES_ADMIN_PASSWORD") -and $envMap["POSTGRES_ADMIN_PASSWORD"]) {
  $adminPassword = $envMap["POSTGRES_ADMIN_PASSWORD"].Trim()
}
# Унаследованный из shell пароль часто неверен (напр. агент/CI); только по явному флагу:
if (-not $adminPassword -and $env:POSTGRES_INHERIT_ADMIN_PASSWORD -eq '1') {
  $adminPassword = [string]$env:POSTGRES_ADMIN_PASSWORD
}
if (-not $adminPassword) {
  $mustThrow = $NonInteractive -or (-not [Environment]::UserInteractive)
  if ($mustThrow) {
    throw @"
Задайте пароль суперпользователя PostgreSQL одним из способов:

  • Раскомментируйте и заполните в .env.local:
      POSTGRES_ADMIN_PASSWORD=...

  • Или одна строка в файле + в .env.local путь:
      POSTGRES_ADMIN_PASSWORD_FILE=C:\\path\\to\\secret.txt

  • Или интерактивно (без флага -NonInteractive): .\\fix-local-postgres.ps1

  • Или если пароль уже корректно задан в текущем shell:
      `$env:POSTGRES_INHERIT_ADMIN_PASSWORD='1'; `$env:POSTGRES_ADMIN_PASSWORD='your-password'; .\\fix-local-postgres.ps1 -NonInteractive
"@
  }
  $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
      (Read-Host "Пароль локального postgres (роль '$adminUser')" -AsSecureString)
    )
  )
}

$appUserSql = $appUser.Replace("'", "''")
$appPassSql = $appPass.Replace("'", "''")
$appDbSql = $appDb.Replace("'", "''")

$sqlPath = Join-Path $root "var\logs\postgres-bootstrap.sql"
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

$env:PGPASSWORD = $adminPassword
& $psql -h $pgHost -p $pgPort -U $adminUser -d postgres -v ON_ERROR_STOP=1 -f $sqlPath
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
  throw "psql bootstrap failed (check POSTGRES_ADMIN_PASSWORD or POSTGRES_ADMIN_PASSWORD_FILE for user '$adminUser' on ${pgHost}:${pgPort})"
}

$eu = [System.Uri]::EscapeDataString($appUser)
$ep = [System.Uri]::EscapeDataString($appPass)
$finalDbUrl = ('postgres://{0}:{1}@{2}:{3}/{4}' -f $eu, $ep, $pgHost, $pgPort, $appDb)
Set-EnvValue -Path $envPath -Key "DATABASE_URL" -Value $finalDbUrl

& npm.cmd run db:migrate
if ($LASTEXITCODE -ne 0) { throw "npm run db:migrate завершился с ошибкой" }

Write-Host ""
Write-Host "OK: PostgreSQL локально приведён"
Write-Host "DATABASE_URL=$finalDbUrl"
