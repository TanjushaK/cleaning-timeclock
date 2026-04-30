# React Native worker app — plan (not started in this repo)

**Status:** Planning only. **Do not** scaffold a React Native app inside the production repository while the current iOS Capacitor build is in Apple Review.

---

## Goals

- Ship a **worker-only** native app (iOS + Android) that uses the **same backend** as today.
- Keep **admin** on Next.js web (see `04-admin-stays-web.md`).
- Align strictly with `docs/api/worker-api-contract.md`.

---

## Repository strategy

| Phase | Approach |
|-------|----------|
| Now | No RN folder in `cleaning-timeclock` until explicitly approved post-review |
| Later | Either **new repo** `tanjusha-worker-mobile` or a **monorepo subdirectory** — decision recorded in ADR when unblocked |

---

## Feature parity (worker)

| Feature | Priority | Notes |
|---------|----------|--------|
| Login (email / E.164 phone + password) | P0 | Same `/api/auth/login` |
| Token refresh | P0 | `/api/auth/refresh`; secure storage |
| Profile view/edit | P0 | `/api/me/profile`, `profile/update` |
| Schedule / job list | P0 | `/api/me/jobs` with optional `date_from`/`date_to` |
| Job detail / actions | P0 | Accept, Start, Stop per contract |
| GPS for start/stop | P0 | `lat`, `lng`, `accuracy` |
| Offline queue | P0 | Local persistence + replay |
| Language switch | P1 | Match locales en/ru/uk/nl — reuse copy keys conceptually |
| Team display | P1 | `/api/me/jobs/team` |
| Photos / avatar | P2 | After core stability |

---

## Suggested architecture

- **HTTP client:** `fetch` or axios with interceptors (inject Bearer, handle 401 → refresh).
- **Auth storage:** iOS Keychain / Android EncryptedSharedPreferences (not AsyncStorage for refresh tokens).
- **Navigation:** stack for auth → main tabs: Schedule | Profile (extend later).
- **State:** lightweight global store for session + jobs cache + outbox.
- **i18n:** JSON bundles keyed like web `messages/*` for consistency.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Token leakage on device | Secure storage, no logs in production |
| Duplicate start/stop on replay | Show server errors clearly; optional request ids later |
| API drift | Contract doc + contract tests / smoke scripts |
| Two apps in store (Capacitor vs RN) | Clear product naming and sunset plan for old app |

---

## Migration from WebView / Capacitor worker

1. **Freeze** Capacitor worker shell changes during review.
2. After approval, release RN **internal/beta** with same API base URL.
3. Migrate users by communication + optional deep link to new app.
4. Deprecate Capacitor worker entry point when RN reaches parity (offline + GPS + schedule).

---

## Exit criteria for “start RN repo”

- Apple Review decision on current app documented.
- Written approval to add RN codebase or create sibling repo.
- `worker-api-contract.md` reviewed against production.
