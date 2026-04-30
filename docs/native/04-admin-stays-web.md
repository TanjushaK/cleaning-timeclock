# Admin stays on web

## Principle

- **Administration** (sites, workers, schedule creation, reports, approvals) remains the **Next.js web admin** at `/admin` and related routes.
- The **worker** mobile experience may move to native (React Native) later; it must **not** embed or duplicate the full admin panel.

## Implications

| Topic | Decision |
|-------|----------|
| Admin UI | Web-only; no requirement to ship admin in the worker native app |
| Admin API | Used only by the web admin session; worker app must not depend on admin routes |
| Security | Worker tokens are **worker** scoped; admin requires **admin** role — enforced server-side |
| Deep links | Worker app should not link to `/admin` except opening external browser for emergencies (optional, product decision) |

## What worker native must use

- Only **worker** endpoints documented in `docs/api/worker-api-contract.md`.
- No reliance on `requireAdmin` routes for day-to-day worker flows.

## Change policy

- Admin web and admin APIs are **out of scope** for the native worker initiative unless a separate product decision is made.
