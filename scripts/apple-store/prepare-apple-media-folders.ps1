# Creates marketing/apple-store folder tree and README files for App Store media.
# Run from the repository root:  .\scripts\apple-store\prepare-apple-media-folders.ps1
# Does not require macOS, CocoaPods, or any backend.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
while ($root -and -not (Test-Path (Join-Path $root "package.json"))) {
    $parent = Split-Path $root -Parent
    if ($parent -eq $root) { break }
    $root = $parent
}
if (-not (Test-Path (Join-Path $root "package.json"))) {
    Write-Error "Run this script from the cleaning-timeclock repo (package.json not found when walking up from $PSScriptRoot)."
}

$base = Join-Path $root "marketing\apple-store"
$screens = Join-Path $base "screenshots"
$video = Join-Path $base "video"

$specs = @(
    @{ Name = "iphone-6-7"; Size = "1290x2796"; Note = "iPhone 6.7 inch (portrait)" }
    @{ Name = "iphone-6-5"; Size = "1242x2688"; Note = "iPhone 6.5 inch (portrait)" }
    @{ Name = "iphone-5-5"; Size = "1242x2208"; Note = "iPhone 5.5 inch (portrait)" }
    @{ Name = "ipad-12-9";  Size = "2048x2732"; Note = "iPad Pro 12.9 inch (portrait)" }
)

New-Item -ItemType Directory -Path $base -Force | Out-Null
New-Item -ItemType Directory -Path $video -Force | Out-Null
New-Item -ItemType Directory -Path $screens -Force | Out-Null

$readme = @"
App Store screenshot staging folder
Target image size (portrait): {0} pixels (width x height)
{1}
Place final PNG or JPEG here for App Store Connect upload.
See docs\apple-store\APP_STORE_MEDIA_PLAN.md for screen list and naming.
"@

foreach ($s in $specs) {
    $d = Join-Path $screens $s.Name
    New-Item -ItemType Directory -Path $d -Force | Out-Null
    $text = $readme -f $s.Size, $s.Note
    Set-Content -Path (Join-Path $d "README.txt") -Value $text -Encoding UTF8
}

$videoReadme = @"
App Preview / video staging (final recording on Mac Simulator or iPhone)
See docs\apple-store\APP_PREVIEW_SCRIPT.md for 20-30s beat sheet.
"@
Set-Content -Path (Join-Path $video "README.txt") -Value $videoReadme -Encoding UTF8

Write-Host "OK: $base"
