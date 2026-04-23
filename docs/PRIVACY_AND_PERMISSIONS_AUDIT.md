# Privacy and permissions audit

Project: `cleaning-timeclock`  
Updated: 2026-04-23

## Scope checked

- Legal pages: `/privacy`, `/terms`, `/legal`, `/support`, `/contact`, `/returns`, `/shipping`
- In-app deletion initiation: `/me/profile` and `/api/me/account-deletion`
- Worker consent UX: geolocation pre-modal and photo rationale panel
- Native shell artifacts in this repo: `capacitor.config.ts`, `ios/App/App/Info.plist`, `android/app/src/main/AndroidManifest.xml`

## Permission-to-feature mapping

| Permission / key | Used in code | User-facing rationale | Status |
|---|---|---|---|
| `NSLocationWhenInUseUsageDescription` | Yes (`navigator.geolocation.getCurrentPosition` for shift start/stop) | Pre-modal in worker flow before first GPS read | aligned |
| `NSFaceIDUsageDescription` | Yes (optional biometric unlock via native plugin) | Inline explanatory copy near biometric toggle | aligned |
| `NSPhotoLibraryUsageDescription` | Yes (user-selected photo upload) | Dismissible rationale panel in profile | aligned |
| `NSCameraUsageDescription` | Yes (capture path for uploads/admin) | Invoked only on user action; documented in privacy text | aligned |
| ATT / `NSUserTrackingUsageDescription` | No | N/A | not used |
| Microphone usage strings | No | N/A | not used |
| Background location | No | N/A | not used |

## Account deletion readiness

- Implemented in app: yes (`/me/profile` UI with explicit confirmation).
- Server endpoint: yes (`POST/GET /api/me/account-deletion`).
- Storage model: queued request (`account_deletion_requests`), asynchronous processing.
- Email-only fallback as sole mechanism: no (in-app initiation exists).

## Metadata consistency check (repo)

- App naming is now consistent around "Cleaning Timeclock" across:
  - `capacitor.config.ts` (`appName`)
  - `public/manifest.webmanifest` (`name`)
  - `app/layout.tsx` (`metadata.title`)
- Legal/support contact endpoint present: `/contact` and linked from shared footer.

## N/A items for this project

- `PrivacyInfo.xcprivacy`: N/A (not present in this repo currently).
- iOS entitlements file customizations for extra capabilities: N/A in this repo.
- Push notification capability and UI: N/A (not implemented in current codebase).
- In-app purchase / StoreKit flows: N/A (not implemented).
