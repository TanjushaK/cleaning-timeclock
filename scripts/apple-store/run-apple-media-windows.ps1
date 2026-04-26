$ErrorActionPreference = "Stop"

function Assert-RepoRoot {
    param([string]$StartPath)
    $root = $StartPath
    while ($root -and -not (Test-Path (Join-Path $root "package.json"))) {
        $parent = Split-Path $root -Parent
        if ($parent -eq $root) { break }
        $root = $parent
    }
    if (-not (Test-Path (Join-Path $root "package.json"))) {
        throw "Run this script from the cleaning-timeclock repository root."
    }
    return $root
}

function Wait-Url {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 180
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
                return $true
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

$repoRoot = Assert-RepoRoot -StartPath (Get-Location).Path
Set-Location $repoRoot

Write-Host "Installing dependencies..."
npm install

Write-Host "Installing Playwright Chromium..."
npx playwright install chromium

Write-Host "Building project..."
npm run build

$logDir = Join-Path $repoRoot "var\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$devOut = Join-Path $logDir "apple-media-dev.out.log"
$devErr = Join-Path $logDir "apple-media-dev.err.log"

Write-Host "Starting local dev server..."
$devProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -WorkingDirectory $repoRoot -PassThru -RedirectStandardOutput $devOut -RedirectStandardError $devErr

try {
    Write-Host "Waiting for http://127.0.0.1:3000 ..."
    if (-not (Wait-Url -Url "http://127.0.0.1:3000" -TimeoutSeconds 180)) {
        throw "Local site did not start at http://127.0.0.1:3000. Check $devOut and $devErr"
    }

    node "scripts/apple-store/save-apple-auth-state.mjs"
    node "scripts/apple-store/capture-apple-screenshots.mjs"
    node "scripts/apple-store/record-apple-preview.mjs"
}
finally {
    if ($devProc -and -not $devProc.HasExited) {
        Write-Host "Stopping dev server..."
        Stop-Process -Id $devProc.Id -Force
    }
}

Start-Process "explorer.exe" -ArgumentList (Join-Path $repoRoot "marketing\apple-store\screenshots")
Start-Process "explorer.exe" -ArgumentList (Join-Path $repoRoot "marketing\apple-store\video")

