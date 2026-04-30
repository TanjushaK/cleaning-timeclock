# Native “admin-lite” — deferred

## Status

**Not in scope** until:

1. Worker native app is shipped and stable, and  
2. Product explicitly requests mobile operational tooling.

---

## Hypothetical future scope (minimal)

If ever built, an **admin-lite** companion might include **read-only** or **limited** actions, for example:

- Today’s schedule overview (read-only)
- Worker online / shift status (aggregated)
- Emergency contact / escalation link (opens tel: / mailto: or web)

This is **not** a replacement for the full admin web app.

---

## Constraints

- Would still require **admin-authenticated** APIs — separate token / role from worker.
- Must not duplicate sensitive HR data on device without security review.
- **No implementation** in this repository until explicitly approved.

---

## Relation to other docs

- Worker app plan: `03-react-native-worker-app-plan.md`
- Admin remains web: `04-admin-stays-web.md`
- API contract for worker only: `docs/api/worker-api-contract.md`
