# Biometric implementation report

## Goal

Optional **Face ID / Touch ID / Android fingerprint** quick unlock **after** a successful normal (password) login. Not a replacement for password authentication.

## Plugin

- **Package:** `@capgo/capacitor-native-biometric@6.0.4`  
- **Peer:** Capacitor 6 (`@capacitor/core` ^6)  
- **Storage:** Plugin uses **iOS Keychain** and **Android Keystore** for credential blobs (per upstream).

## Security model

1. User signs in with **identifier + password** → receives JWT access + refresh tokens (existing API).  
2. User taps **Enable Face ID / fingerprint unlock** → native biometric prompt → plugin stores **`username: "refresh_session"`**, **`password: <refresh_token>`** under server id `nl.tanjusha.timeclock.biometric.v1`.  
   - The field name `password` in the plugin API holds the **refresh token**, not the user’s account password.  
3. **Quick login:** `verifyIdentity` → `getCredentials` → `POST /api/auth/refresh` → `setAuthTokens` + update stored refresh if rotated.  
4. **Logout:** `deleteCredentials` + `clearAuthTokens` + clear local flag `ct_bio_unlock_saved`.

## Files touched

| File | Role |
|------|------|
| `lib/biometric-unlock.ts` | Native availability, enable, unlock, clear |
| `app/page.tsx` | UI: quick login, enable/disable, logout integration |
| `messages/*.ts`, `messages/types.ts` | Copy for biometric flows |
| `ios/App/App/Info.plist` | `NSFaceIDUsageDescription` |
| `android/app/src/main/AndroidManifest.xml` | `USE_BIOMETRIC` |
| `package.json` / lockfile | New dependency |

## Verification status

| Check | Status |
|-------|--------|
| Typecheck + `npm run build` | **Passed** |
| ESLint | **Passed** |
| Web smoke (`local-smoke-auth-api.ps1`) | **Passed** (HTTP; no biometric) |
| **Physical iPhone Face ID** | **Not run in this environment** |
| **Physical Android fingerprint** | **Not run in this environment** |

## Device test plan (minimum)

1. Build iOS/Android shell, `npx cap sync`, open in Xcode/Android Studio.  
2. Install on device, open app → normal password login.  
3. Tap enable biometric → complete system prompt → restart app → use quick login.  
4. Log out → confirm quick login option gone and login requires password again.

## Verdict

- **Implementation in repo:** **Complete** for the described model.  
- **“Works on my phone” confirmation:** **NOT READY** until steps above succeed on hardware.
