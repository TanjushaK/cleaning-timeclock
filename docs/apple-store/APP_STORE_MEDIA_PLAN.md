# App Store media plan (Windows prep)

This document lists what to capture for App Store Connect and how to organize assets on disk. Final App Preview video is recorded on a Mac (Simulator) or a physical iPhone; on Windows we only prepare the folder structure, scripts, and planning docs.

## Screenshots to provide

App Store Connect accepts device-size sets. Prepare one screenshot per **logical screen** below for each size you plan to support (at minimum 6.7" for iPhone; add others if you want full device coverage in the store listing).

### Screens to capture (file naming)

| # | Suggested filename prefix | What to show |
|---|--------------------------|--------------|
| 01 | `01-login` | Login / sign-in |
| 02 | `02-worker-dashboard` | Worker home / assigned work overview |
| 03 | `03-job-details` | Job details for a single assignment |
| 04 | `04-start-shift-location` | Start shift with location / site verification in context |
| 05 | `05-stop-shift` | Stopping a shift (timer / confirmation) |
| 06 | `06-admin-dashboard` | Admin overview (jobs or summary) |
| 07 | `07-admin-sites` | Admin sites / locations management |
| 08 | `08-admin-workers` | Admin workers / team list |

Use PNG or JPEG as required by App Store Connect; avoid upscaling low-res captures.

## Apple screenshot pixel sizes

| Device / slot | Resolution (portrait) |
|---------------|------------------------|
| iPhone 6.7" | 1290 × 2796 |
| iPhone 6.5" | 1242 × 2688 |
| iPhone 5.5" | 1242 × 2208 |
| iPad Pro 12.9" | 2048 × 2732 |

Subfolders with matching `README.txt` files are created by `scripts/apple-store/prepare-apple-media-folders.ps1` from the repo root.

## App Preview (video)

- **Final recording**: done on a Mac (iOS Simulator screen recording) or on a real iPhone (Control Center screen recording), then trimmed to App Store spec.
- **On Windows**: prepare the scenario only — see [APP_PREVIEW_SCRIPT.md](./APP_PREVIEW_SCRIPT.md).

## Browser / responsive screenshots (no Playwright in this repo)

Playwright is not added as a dependency here. **Browser screenshots can be captured manually in Chrome DevTools using responsive sizes** (or another browser’s device toolbar): set the viewport to the target width/height in the table above, capture full-page or visible viewport as needed, and export at 1x scale to match the pixel sizes.

## Upload bundle on a Mac

Copy the `marketing/apple-store/` tree (or the `screenshots/<device>` folders) to a Mac, drop files into the correct App Store Connect slots, and add the App Preview when ready.
