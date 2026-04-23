$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $root) { $root = (Get-Location).Path }
Set-Location $root

New-Item -ItemType Directory -Force -Path (Join-Path $root "var\logs") | Out-Null

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$stdout = Join-Path $root "var\logs\local-start.$stamp.stdout.log"
$stderr = Join-Path $root "var\logs\local-start.$stamp.stderr.log"

function Hit {
  param(
    [string]$Method,
    [string]$Url,
    [string]$Body = ""
  )
  try {
    if ($Method -eq "GET") {
      $r = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 20
    } else {
      $r = Invoke-WebRequest -Uri $Url -Method $Method -Body $Body -ContentType "application/json" -UseBasicParsing -TimeoutSec 20
    }
    [pscustomobject]@{
      Method = $Method
      Url    = $Url
      Status = [int]$r.StatusCode
      Result = "OK"
    }
  } catch {
    $status = 0
    if ($_.Exception.Response) {
      try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = 0 }
    }
    [pscustomobject]@{
      Method = $Method
      Url    = $Url
      Status = $status
      Result = "ERR"
    }
  }
}

$proc = Start-Process -FilePath "npm.cmd" -ArgumentList @("run","start") -WorkingDirectory $root -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

try {
  $ready = $false
  foreach ($i in 1..120) {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/" -Method GET -UseBasicParsing -TimeoutSec 10
      if ([int]$r.StatusCode -ge 200) {
        $ready = $true
        break
      }
    } catch {}
  }

  if (-not $ready) { throw "npm run start не поднял localhost:3000" }

  $results = @()
  $results += Hit -Method GET  -Url "http://127.0.0.1:3000/"
  $results += Hit -Method GET  -Url "http://127.0.0.1:3000/admin"
  $results += Hit -Method GET  -Url "http://127.0.0.1:3000/me"
  $results += Hit -Method GET  -Url "http://127.0.0.1:3000/forgot-password"
  $results += Hit -Method GET  -Url "http://127.0.0.1:3000/reset-password"
  $results += Hit -Method GET  -Url "http://127.0.0.1:3000/offline"
  $results += Hit -Method POST -Url "http://127.0.0.1:3000/api/auth/login"   -Body '{"email":"admin@example.com","password":"wrong-password"}'
  $results += Hit -Method POST -Url "http://127.0.0.1:3000/api/auth/refresh" -Body '{}'
  $results += Hit -Method GET  -Url "http://127.0.0.1:3000/api/geocode?q=Amsterdam"

  $results | Format-Table -AutoSize

  if (Test-Path $stderr) {
    $bad = Select-String -Path $stderr -Pattern "28P01|password authentication failed|database .* does not exist|relation .* does not exist|ECONNREFUSED" -Quiet
    if ($bad) { throw "runtime всё ещё падает на БД, смотри var\logs\local-start.stderr.log" }
  }

  Write-Host ""
  Write-Host "OK: локальный smoke завершён"
  Write-Host "STDOUT: $stdout"
  Write-Host "STDERR: $stderr"
}
finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
  }
}
