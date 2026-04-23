# Apple metadata & review notes (App Store Connect)

**This file is guidance for ASC — nothing here changes App Store Connect automatically.**

## App summary (suggested honest positioning)

- **What it is:** Workforce timeclock for cleaning teams: sign in, view assigned shifts, accept jobs, **start/stop** with **GPS check at the job site** (when configured), optional **profile photos**, optional **Face ID / Touch ID** re-login on device.  
- **What it is not:** Consumer shop, social network, dating, medical app, subscription fitness content, push-notification marketing tool.

## URLs to register in ASC

Replace host if you self-host elsewhere; default production WebView host from `capacitor.config.ts`:

| Field | Example |
|-------|---------|
| Privacy Policy URL | `https://timeclock.tanjusha.nl/privacy` |
| Support URL (if separate) | `https://timeclock.tanjusha.nl/support` or mailto `support@tanjusha.nl` |
| Marketing URL (optional) | Same origin or company site |

Ensure **ATS / HTTPS** works on that host for WebView.

## App Privacy questionnaire (high level)

Declare truthfully (verify against your deployment):

- **Contact info** (name, email, phone) — collected for account & support.  
- **Location** — coarse/fine **when in use** for start/stop validation.  
- **Photos / video** — if user uploads profile or job images.  
- **Identifiers** — user id, session tokens.  
- **Diagnostics** — server logs / errors (minimal).  

**Not collected** (today’s codebase): health, financial details, contacts, browsing history for tracking, microphone.

## Review notes template (paste in ASC)

```
TEST ACCOUNT
- Login: <provide reviewer-specific worker email or phone in E.164>
- Password: <one-time / rotated after review>
- Organisation: <company name> — account must be Active=true for job list.

FLOW TO EXERCISE
1) Sign in on iPhone.
2) Optional: enable Face ID when prompted after login (can skip).
3) Open an assigned shift → Accept if needed.
4) Tap Start — location pre-screen appears once → Continue → iOS location permission → allow.
   (If no jobs: ask admin to assign a test site with coordinates and a shift for this worker.)
5) Tap Stop — same GPS flow.
6) Profile → scroll to “Delete account” — submit a deletion REQUEST (async; shows request UUID).

NOT IN THIS BUILD
- No push notifications / no remote-notification background mode.
- No in-app subscriptions or consumable IAP.
- No App Tracking Transparency (no IDFA tracking).

WEBVIEW
- App loads https://timeclock.tanjusha.nl (or build-specific CAP_SERVER_URL). Admin users may open /admin in same WebView — reviewers can ignore if using worker test account only.
```

**External:** create and **rotate** test credentials after review.

## Screenshots

**ASC:** capture real device screenshots for largest iPhone size; avoid showing internal debug banners or `.env` dev SMS hints.

## “Guest mode”

- **Not available.** Reviewers must use supplied credentials. State that clearly if Apple asks.

## Company / trader consistency

- **Van Tanija BV** — keep spelling consistent across ASC, privacy footer, and support email signatures.  
- **ASC:** legal name, address, DUNS/KvK as required by Apple Business forms.

## Payments

- **N/A** — no StoreKit. Do not select IAP unless you add products in a future version.
