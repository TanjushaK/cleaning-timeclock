# Timeclock — Master handoff / production checkpoint — 2026-09-03

## Authoritative state

- Repository: `TanjushaK/cleaning-timeclock`
- Production URL: `https://timeclock.tanjusha.nl/`
- Verified production commit: `bfc908f2fa4ec5fde8ca34ef54b559bbf9903d49`
- Parent production commit: `9361d6f0240ecb0581adfdc15a5a692309d95c62`
- Production service: `timeclock.service`
- Application path: `/opt/timeclock`
- Production marker: `/opt/timeclock/.deployed-commit`
- Runtime storage under `/opt/timeclock/var` must be preserved on every deploy.

This checkpoint was accepted by the user after real UI verification: the worker report now sorts dates correctly.

## Changes completed on 2026-09-03

### PR #164 — worker durations as hours + minutes

Merged commit: `8330fc528ddafa7e648dc4bb20a57d280d4c2015`

Worker-facing decimal hours were replaced with ordinary hours and minutes while keeping integer minutes as the calculation source.

Examples:

- RU: `3 ч 15 мин`
- UK: `3 год 15 хв`
- NL: `3 u 15 min`
- EN: `3 h 15 min`

Scope was display-only in `app/page.tsx`; no DB, API, Start/Stop, GPS/geofence or admin-report calculation changes.

### PR #166 — Admin → Shifts date order

Merged commit: `f842af3c11c3d5e5068d355441e84da1016d9909`

Admin Shifts now shows:

1. today;
2. yesterday;
3. older dates descending;
4. future dates after current/past dates, ascending;
5. times inside the same date ascending.

User verified this UI as correct.

### PR #167 — employee report date order

Merged commit: `9361d6f0240ecb0581adfdc15a5a692309d95c62`

Initial report-detail presentation sorting was added in `app/admin/hours/page.tsx`:

- current/past dates from today backwards;
- future dates after current/past;
- same-date jobs by scheduled time.

No DB or Start/Stop changes.

### PR #168 — robust report date normalization

Merged production commit: `bfc908f2fa4ec5fde8ca34ef54b559bbf9903d49`

Real-device verification showed that the employee report could still appear unsorted because report dates were not guaranteed to arrive as strict `YYYY-MM-DD` strings.

Final fix:

- `app/admin/hours/page.tsx`
  - added `jobDateKey(...)` normalization before date comparison;
  - existing today-backwards comparator now works with ISO/date-time values as well as plain dates.
- `app/api/admin/reports/route.ts`
  - added `normalizeJobDateKey(...)`;
  - report `job_date` values are normalized before returning report data.

The final intended order is now deterministic:

- today first;
- then previous dates descending;
- future dates after current/past, ascending;
- same-date jobs ordered by scheduled time, then deterministic ID tie-breaker in the UI.

User verified after deployment that this now works correctly.

## Validation history

For the report fixes, guarded isolated workflows ran before PR creation and verified:

- exact expected base / branch;
- constrained file scope;
- semantic assertions for the date-ordering logic;
- `npm ci`;
- `npm run test:workforce-map`;
- `npm run test:checkout-geofence`;
- `npm run lint`;
- `npm run build`.

PR checks for #167 and #168 completed successfully before merge:

- CI — success;
- Trivy — success;
- CodeQL — success.

Post-merge checks on `bfc908f2fa4ec5fde8ca34ef54b559bbf9903d49` also completed successfully:

- CI — success;
- Trivy — success;
- CodeQL — success.

## Verified deployment evidence for `bfc908f...`

Exact-commit deployment:

`9361d6f0240ecb0581adfdc15a5a692309d95c62 -> bfc908f2fa4ec5fde8ca34ef54b559bbf9903d49`

Deployment result:

- state: `DONE`;
- `DEPLOY_OK=yes`;
- production marker: `bfc908f2fa4ec5fde8ca34ef54b559bbf9903d49`;
- service: `active`;
- local root: HTTP 200;
- local admin: HTTP 200;
- public root: HTTP 200;
- public admin: HTTP 200;
- no DB migrations;
- no intentional deploy DB writes.

Open shifts were preserved exactly across cutover:

- before: 2 open logs;
- after: 2 open logs;
- SHA before/after: `b1dd82df06c15bbc1742ad6929d7232f7e39ae1abd9913aa667197a7eac37219`;
- `OPEN_LOGS_UNCHANGED=yes`.

Runtime `var` files were preserved exactly:

- SHA before/after: `e40a7a16a6519ccceb53bf4325d69c0482dd081816872ff7f48f049d179b0b69`;
- `VAR_FILES_UNCHANGED=yes`.

Latest rollback application copy:

`/opt/timeclock.rollback-9361d6f0240e-20260903T144526Z`

Latest deploy backup:

`/var/tmp/tanjusha-rollback/timeclock-20260903T144526Z-9361d6f0240e-to-bfc908f2fa4e`

Disk immediately after deployment:

- filesystem size: 38G;
- used: 28G;
- available: 8.1G;
- utilization: 78%.

## Earlier rollback / cleanup artifacts still intentionally preserved

Do not delete rollback, backup, quarantine or baseline artifacts merely because the current UI fix is verified. Cleanup must remain a separate audited task.

Known cleanup quarantine from the same maintenance day:

`/var/tmp/timeclock-quarantine-20260903T115445Z`

It contains older backup/stage material moved aside for safety. Moving it on the same filesystem did not reclaim disk space. Deletion requires a separate review and explicit decision.

## Deployment rules that must remain in force

Production is live and employees may have active shifts.

Required workflow for future code changes:

`branch -> targeted patch -> tests/lint/build -> PR -> CI/CodeQL/Trivy green -> explicit merge authorization -> merge -> post-merge checks -> explicit deploy authorization -> exact-commit safe deploy`

Important deployment invariants:

- `/opt/timeclock` is not treated as a git working tree; do not `git pull` in production;
- deploy exact GitHub commit archives only;
- preserve `/opt/timeclock/var`, especially uploads;
- create a DB backup before cutover;
- snapshot open `time_logs` before and after cutover and require exact equality;
- verify runtime files before and after cutover;
- keep automatic rollback available;
- if an SSH session drops during deployment, verify read-only state first and never blindly rerun;
- do not claim a UI bug fixed until real-device/user verification.

## Current acceptance status

As of 2026-09-03:

- worker duration display: implemented and deployed;
- Admin → Shifts date ordering: implemented, deployed and user-verified;
- Admin → Reports → employee detail date ordering: implemented, deployed and user-verified;
- production health after latest deploy: green;
- current authoritative production SHA: `bfc908f2fa4ec5fde8ca34ef54b559bbf9903d49`.

This document is the checkpoint to use when continuing work. Do not restart analysis from an older production SHA or from pre-#168 report behavior.
