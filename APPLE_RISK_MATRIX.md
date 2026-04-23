# Apple review risk matrix

**Product:** Cleaning Timeclock (Capacitor WebView worker app)  
**Updated:** 2026-04-23  

Legend: **Risk** (1 low – 5 high) · **ASC** = App Store Connect / process outside repo  

| Feature / topic | Rejection risk | Current status | Mitigation in repo | External / ASC action? |
|-----------------|----------------|----------------|----------------------|------------------------|
| **Privacy policy completeness** | 4 | `/privacy` with controller, purposes, processors summary, retention, rights, children | `lib/apple-legal-docs.ts` + `LegalDocView` | Set public URL in ASC; keep in sync with Nutrition labels |
| **Privacy Nutrition mismatch** | 5 | Code collects GPS, profile, photos, auth tokens | Document matches implementation | **ASC:** answer questionnaire exactly |
| **Account deletion (5.1.1(v))** | 5 | Was mailto-only risk; now **in-app POST** + DB queue | `account_deletion_requests` + `/api/me/account-deletion` + `/me/profile` UI | **Ops:** run migration; **Process:** operator completes deletion; **ASC:** explain async in Review Notes |
| **GPS purpose string vs behaviour** | 4 | When-in-use + one-shot read for start/stop | Pre-modal + `NSLocationWhenInUseUsageDescription` aligned | Device QA on production build |
| **Biometric (Face ID)** | 3 | Refresh token in secure store; password not stored | `NSFaceIDUsageDescription` + UI copy | Device QA |
| **Photo library / camera** | 3 | Picker + admin capture | `NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription` + profile rationale | Device QA capture path in `/admin` |
| **ATT / tracking** | 2 | Removed | No `NSUserTrackingUsageDescription` | None if stays absent |
| **Push notifications claimed but missing** | 4 | **Not implemented** in code | N/A — do not claim in metadata | **ASC:** do not enable Push capability or claim push in description until implemented |
| **Subscriptions / IAP claimed but missing** | 5 | **No IAP** | N/A | **ASC:** no IAP products; description must not imply paid unlock |
| **WebView / “minimum functionality”** | 3 | Full shift workflow in web UI | Stable worker flows | Review notes describe domain + login |
| **Broken legal links** | 3 | Footer + routes `/privacy` … `/shipping` | Implemented | Verify production host serves same routes |
| **Support contact unreachable** | 3 | `support@tanjusha.nl` in docs | Same in `apple-legal-docs` | Monitor mailbox |
| **Review login / no test path** | 4 | Login required | — | **ASC:** Review Notes + dedicated test worker |
| **Microphone** | 1 | Not used | No key | None |
| **Share sheet** | 1 | Not used in code | — | Do not claim “Share” as native feature unless implemented |

### High-risk blockers remaining

- **None in code** for a honest “workforce timeclock + optional GPS + no IAP” positioning, **provided** ASC metadata and App Privacy match the implementation and a **test account** is supplied.  
- **Ops blocker:** database migration `002_account_deletion_requests.sql` must be applied on every environment where `/api/me/account-deletion` is used.
