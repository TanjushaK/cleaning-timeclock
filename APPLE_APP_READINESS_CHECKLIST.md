# Apple App Store readiness checklist (in-repo)

**App:** Cleaning Timeclock (Capacitor iOS WebView, bundle `nl.tanjusha.timeclock`)  
**Operator (trader):** Van Tanija BV — contact `support@tanjusha.nl`  
**Last repo audit:** 2026-04-23  

Use this list before **Archive → TestFlight → App Review**. Items marked **ASC** require **App Store Connect** (cannot be completed in git alone).

---

## 1. Privacy & legal (in-app)

| # | Item | In repo? | Notes |
|---|------|-----------|--------|
| 1.1 | Standalone **Privacy Policy** URL/path | Yes | `/privacy` (`LegalDocView` + `lib/apple-legal-docs.ts`) |
| 1.2 | **Terms of Use** | Yes | `/terms` |
| 1.3 | **Support** + **Contact** | Yes | `/support`, `/contact`, `/legal` hub |
| 1.4 | **Returns** / **Shipping** statements (honest N/A for non‑shop) | Yes | `/returns`, `/shipping` |
| 1.5 | Footer links on worker shell | Yes | `AppFooter` → Legal / Privacy / Terms / Support |
| 1.6 | Privacy answers App Store **Privacy Nutrition** questions truthfully | **ASC** | Align answers with `lib/apple-legal-docs.ts` + actual APIs |
| 1.7 | **Privacy Policy URL** field in ASC | **ASC** | Must match production host (`https://timeclock.tanjusha.nl/privacy` or your deployed domain) |

---

## 2. Permissions & system strings (`Info.plist`)

| Capability | Used? | `Info.plist` key | Pre‑permission UX |
|-------------|-------|------------------|-------------------|
| Location (when in use) | Yes — shift start/stop | `NSLocationWhenInUseUsageDescription` | Yes — modal before first GPS read (`app/page.tsx` + `permissions.*` strings) |
| Face ID / Touch ID | Yes — optional unlock | `NSFaceIDUsageDescription` | Yes — short copy next to enable button |
| Photo library | Yes — file picker uploads | `NSPhotoLibraryUsageDescription` | Yes — dismissible panel on `/me/profile` |
| Camera | Yes — **admin** “take photo” + optional capture flows in WebView | `NSCameraUsageDescription` | Explain in privacy doc; system prompt only when user chooses capture |
| Microphone | **No** | None | N/A — do not add |
| Push (APNs) | **No** in current codebase | No plugin | N/A — do not add UIBackgroundModes until implemented |
| ATT / IDFA | **No** | None | N/A |

---

## 3. Account deletion (Guideline 5.1.1(v))

| # | Item | In repo? |
|---|------|------------|
| 3.1 | In-app **initiation** (not mailto-only) | Yes — `POST /api/me/account-deletion` + UI on `/me/profile` |
| 3.2 | Confirmation + consequences copy | Yes — checkbox + `accountDeletion.*` strings |
| 3.3 | Async / queued model + reference **id** | Yes — table `account_deletion_requests`, status `pending` |
| 3.4 | DB migration applied on server | **Ops** | Run `node scripts/apply-migration.mjs` (applies `db/migrations/*.sql` in order) |
| 3.5 | Operator procedure to **complete** deletion | **Process** | Not automated hard-delete by design |

---

## 4. Payments & subscriptions

| Item | Status |
|------|--------|
| In-app purchases / subscriptions | **None** in codebase — **N/A** |
| Restore purchases | N/A |
| Paywall / price display | N/A |
| ASC “Price” / IAP metadata | **ASC** — must stay empty / honest if no IAP |

---

## 5. Review & login

| # | Item | Status |
|---|------|--------|
| 5.1 | Core flows need login | Yes — worker account |
| 5.2 | **Demo / review account** in Review Notes | **ASC** — provide inactive-safe credentials + steps |
| 5.3 | Guest mode | **No** — document limitation in `APPLE_METADATA_REVIEW.md` |

---

## 6. Build & QA (device)

| # | Item |
|---|------|
| 6.1 | `npm run build` + `npm run lint` green |
| 6.2 | Real **iPhone**: login, GPS modal → Allow, start/stop shift, profile photo pick, account deletion request |
| 6.3 | **Archive** without missing usage-description warnings |

---

## 7. App Store Connect (external)

- [ ] Screenshots per required sizes  
- [ ] Description does **not** claim features absent (push, subscriptions, guest mode)  
- [ ] **App Privacy** questionnaire matches data types collected  
- [ ] Review notes: test account, GPS expectation, admin URL if reviewers need `/admin`  

---

## Related docs

- `APPLE_RISK_MATRIX.md` — risk table  
- `APPLE_METADATA_REVIEW.md` — ASC-focused narrative  
- `APPLE_COMPLIANCE_AUDIT.md` — earlier technical audit (biometric, WebView, etc.)  
