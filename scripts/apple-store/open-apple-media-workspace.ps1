# Opens App Store media folders in Explorer (Windows).
# Run from the repository root:  .\scripts\apple-store\open-apple-media-workspace.ps1

$ErrorActionPreference = "Stop"
$start = $PSScriptRoot
$root = $start
while ($root -and -not (Test-Path (Join-Path $root "package.json"))) {
    $parent = Split-Path $root -Parent
    if ($parent -eq $root) { break }
    $root = $parent
}
if (-not (Test-Path (Join-Path $root "package.json"))) {
    Write-Error "Run this script from the cleaning-timeclock repo (package.json not found when walking up from $start)."
}

$shots = Join-Path $root "marketing\apple-store\screenshots"
$video = Join-Path $root "marketing\apple-store\video"
$docs  = Join-Path $root "docs\apple-store"

foreach ($p in @($shots, $video, $docs)) {
    if (-not (Test-Path $p)) {
        Write-Warning "Missing: $p — run prepare-apple-media-folders.ps1 or create folders first."
    } else {
        Start-Process "explorer.exe" -ArgumentList $p
    }
}
