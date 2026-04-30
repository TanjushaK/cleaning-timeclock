# Web / Capacitor worker MVP — checklist

**Golden baseline reference:** commit `287cb47`, tag `baseline-timeclock-golden-2026-04-30-worker-custom-period`, production `https://timeclock.tanjusha.nl`.

This document captures what the current worker-facing web app is expected to cover and how to validate it without disturbing the iOS app under Apple Review.

---

## What is already in place (high level)

Based on the codebase and routes:

| Area | Status | Notes |
|------|--------|--------|
| Worker login | Implemented | `/api/auth/login` (email or E.164 phone + password); tokens stored client-side |
| Profile | Implemented | `/api/me/profile`, `/api/me/profile/update`, `/api/me/profile/submit`, password flow |
| Schedule / shifts list | Implemented | Worker home (`app/page.tsx`) schedule UI; data from `/api/me/jobs` |
| Scheduled time display | Implemented | `scheduled_time`; API also returns `scheduled_end_time` where DB supports it |
| Planned totals / summaries | Implemented | UI summarizes planned hours where duration can be derived from `scheduled_time` parsing |
| Custom job date range (API) | Supported | `GET /api/me/jobs?date_from=&date_to=` (ISO dates); defaults ~−180d/+365d if omitted |
| Start / Stop | Implemented | `/api/me/jobs/start`, `/api/me/jobs/stop` with GPS payload |
| GPS | Implemented | Start/stop require `lat`, `lng`, `accuracy`; site radius validation on server |
| Offline / outbox | Implemented | Client outbox (`lib/offline/outbox`) for queued start/stop when offline |
| Language switch | Implemented | `useI18n` / message bundles (en, ru, uk, nl) |
| Team on shift | Implemented | `/api/me/jobs/team` for colleague names per job |
| Mobile layout | Implemented | Mobile-first patterns, safe-area padding on main shell |
| Biometric quick login (where supported) | Optional | Capacitor / device dependent |

---

## What must not be touched (Apple Review freeze)

Do **not** change any of the following while the iOS app is in review, unless a separate release decision is made:

- `ios/**`
- `capacitor.config.ts`
- `package.json`, `package-lock.json`, or other lockfiles
- App Store metadata, `marketing/apple-store/**`, `PrivacyInfo.xcprivacy`, `Info.plist`, `AppDelegate.swift`
- Bundle id, build number, versionCode, versionName
- `.env`, secrets, `Caddyfile`, systemd units, `db/migrations`
- **Do not deploy** production from this work stream without an explicit go-ahead

`android/**` only with a separate decision.

---

## Pre-build / pre-release checks (before any new native-related build)

When a new mobile build is eventually allowed:

1. **Web parity:** `npm run build` passes; no TypeScript errors.
2. **Worker flows:** login → jobs load → optional accept → start (GPS) → stop (GPS) on a test shift.
3. **Offline:** toggle airplane mode → queue action → reconnect → sync (outbox drains or surfaces error).
4. **Locales:** switch EN/RU/UK/NL; no mixed-language strings on worker surfaces.
5. **API unchanged:** worker contract doc (`docs/api/worker-api-contract.md`) still matches server behavior.
6. **Scope:** confirm diff does not include forbidden paths above.

---

## Files and paths that must stay unchanged for “review-safe” work

| Category | Examples |
|----------|----------|
| iOS / Capacitor packaging | `ios/**`, `capacitor.config.ts` |
| Dependencies | `package.json`, `package-lock.json` |
| App identity / store | `marketing/apple-store/**`, `*Info.plist*`, `*xcprivacy*`, `AppDelegate.swift` |
| Infra / secrets | `.env*`, `Caddyfile`, systemd, migrations |
| Admin as product | No requirement to change admin; admin stays web (see `04-admin-stays-web.md`) |

Application code under `app/page.tsx`, `app/me/**`, `lib/**` (web client) may change for worker UX **only** when not conflicting with the freeze list.

---

## MVP readiness criteria (Web/Capacitor worker)

The worker Web/Capacitor MVP is **ready** when:

1. A worker with `role=worker` and `active=true` can sign in and see their assigned / open shifts in the job list for the default or custom date range.
2. Accept (when `can_accept`), Start, and Stop work with valid GPS and site configuration; errors are readable (API `errorCode` + i18n where applicable).
3. Offline queue does not lose start/stop intent without user-visible feedback.
4. Profile can be viewed and core fields updated per existing APIs.
5. Language and theme controls work on a narrow (phone) viewport without breaking the schedule header.
6. No regression for the frozen iOS/capacitor config (no accidental edits to forbidden files).

---

## Gaps / follow-ups (not blockers for “MVP” label, but document)

- **Duration from `scheduled_end_time`:** if the API returns only `scheduled_time` as a single clock time and `scheduled_end_time` separately, the UI may not show a range/duration until it explicitly combines both (product decision).
- **“Custom period” in UI:** the API supports `date_from` / `date_to` on `/api/me/jobs`; the home page may or may not expose a From/To picker—verify against the golden baseline if product requires it visible in the worker UI.

For API details, see `docs/api/worker-api-contract.md`.
