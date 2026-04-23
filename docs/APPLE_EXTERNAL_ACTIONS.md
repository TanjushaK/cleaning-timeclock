# Apple external actions (outside repo)

Project: `cleaning-timeclock`  
Updated: 2026-04-23

This table tracks actions required for Apple readiness that cannot be completed by git changes alone.

| Area | Action | Owner | Status |
|---|---|---|---|
| App Store Connect | Set Privacy Policy URL to deployed host (`/privacy`) | Product/Release | pending |
| App Store Connect | Set Support URL (`/support`) and verify contact mailbox | Product/Support | pending |
| App Store Connect | Fill Privacy Nutrition answers to match actual data use | Product/Legal | pending |
| App Store Connect | Provide review test credentials and deterministic review steps | Product/Ops | pending |
| Device QA | Validate iPhone flows: login, GPS start/stop, photo upload, deletion request | QA | pending |
| Ops | Ensure DB migration `002_account_deletion_requests.sql` is applied in target env | Ops | pending |
| Ops | Verify production legal routes return 200 (`/privacy`, `/terms`, `/support`, `/contact`, `/legal`) | Ops | pending |
| Ops | Keep app metadata naming consistent: "Cleaning Timeclock" across ASC and app shells | Product/Release | pending |

## Notes

- In-app deletion initiation is implemented via `/me/profile` + `POST /api/me/account-deletion`.
- This project has a Capacitor iOS shell (`ios/`, `capacitor.config.ts`), so permission strings and consent UX must stay aligned with web behavior.
