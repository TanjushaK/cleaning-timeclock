# Worker API contract (read-only documentation)

**Purpose:** Single reference for a future **React Native** (or any non-browser) worker client.  
**Scope:** Describes current behavior as implemented in this repository. **No route or schema changes** are implied by this document.

**Base URL:** Same origin as the app, e.g. `https://timeclock.tanjusha.nl` (or dev).  
**Content-Type:** `application/json; charset=utf-8` for JSON bodies and responses.

---

## Auth headers (all authenticated worker endpoints)

- **Header:** `Authorization: Bearer <access_token>`
- Access token is returned by `POST /api/auth/login` and `POST /api/auth/refresh`.
- Web client also stores tokens in `localStorage` keys (`ct_access_token`, `ct_refresh_token`); native apps should use **secure storage** instead.

---

## Error format

### Worker / me routes (`/api/me/*`)

Typical error shape (see `lib/worker-api-response.ts`):

```json
{
  "errorCode": "SOME_STABLE_CODE",
  "error": "Human-readable message (English, for logs; UI may map via i18n)"
}
```

- `errorCode` is the stable key for client-side i18n (`errors.api.<code>` in messages).
- HTTP status: 4xx/5xx depending on the error.

### Auth login / refresh

Returns JSON with `errorCode` and `error` on failure (see `app/api/auth/login/route.ts`, `app/api/auth/refresh/route.ts`).

---

## Endpoints

### `POST /api/auth/login`

- **Body:** `{ "identifier" | "email" | "phone": string, "password": string }`
- **Success 200:** `{ "access_token", "refresh_token", "user": { ... } }`
- **Notes:** Identifier is email **or** E.164 phone (`+...`).

### `POST /api/auth/refresh`

- **Body:** `{ "refresh_token": string }`
- **Success 200:** `{ "access_token", "refresh_token", "user" }`

### `GET /api/me/profile`

- **Auth:** Bearer (any signed-in user; not worker-only).
- **Success 200:**  
  `{ "user": { "id", "email", "phone", "email_confirmed_at", "temp_password" }, "profile": { ... } }`  
- Profile fields from DB include: `id`, `role`, `active`, `full_name`, `phone`, `email`, `avatar_path`, `notes`, `onboarding_submitted_at` (see route).

### `POST /api/me/profile/update`

- **Auth:** Bearer.
- **Body:** Partial profile updates as implemented in route (full_name, email, phone, notes, etc.).
- **Success:** `{ ok: true }` or updated payload per implementation.

### `POST /api/me/profile/submit`

- **Auth:** Bearer (worker onboarding submit — see route).

### `GET /api/me/jobs`

- **Auth:** Bearer; **requires active worker** (`requireActiveWorker`: `role === 'worker'`, `active === true`).
- **Query (optional):**  
  - `date_from` or `from` — ISO date `YYYY-MM-DD`  
  - `date_to` or `to` — ISO date `YYYY-MM-DD`  
  If omitted, server uses a default window (approximately −180 days to +365 days from “today” UTC logic in route).

**Job inclusion rules (summary):**

1. `jobs.worker_id` equals current user id, within date range.
2. Or job id appears in `job_workers` for this user, within date range.
3. Or “open” shift: `worker_id` is null, `status === 'planned'`, `site_id` is in the user’s site assignments, within date range.

**Success 200:** `{ "jobs": [ Job, ... ], "items": [ ... ] }` (items duplicate jobs for compatibility).

**Job object (representative fields returned by the route):**

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Job id |
| `status` | string | e.g. `planned`, `in_progress`, `done` |
| `job_date` | string \| null | ISO date |
| `scheduled_time` | string \| null | Time / interval text from DB (often `HH:MM:SS` or range string) |
| `scheduled_end_time` | string \| null | End time if column exists |
| `site_id` | string \| null | |
| `site_name`, `site_address`, `site_lat`, `site_lng`, `site_radius` | | Denormalized from `sites` |
| `site_photo_url`, `site_photos_count` | | |
| `worker_id` | string \| null | |
| `started_at`, `stopped_at` | string \| null | From `time_logs` aggregation |
| `actual_minutes` | number | |
| `distance_m`, `accuracy_m` | number \| null | GPS vs site / last start |
| `can_accept` | boolean | Planned + unassigned + eligible via assignment or `job_workers` |
| `accepted_at` | null | Currently null in list response (reserved) |
| `worker_note` | null | Reserved |

Future RN clients should treat unknown fields as optional.

### `GET /api/me/jobs/team`

- **Auth:** Bearer worker.
- **Success 200:** `{ "teams": { "<job_id>": [ { "id", "name" }, ... ] } }`  
  Names from `profiles` / email fallback.

### `POST /api/me/jobs/accept`

- **Auth:** Bearer worker.
- **Body:** `{ "jobId" | "job_id" | "id": string }`
- Accept is allowed when job is `planned`, `worker_id` is null, and user is linked via `job_workers` or site assignment (see route).

### `POST /api/me/jobs/start`

- **Auth:** Bearer worker.
- **Body:**  
  `{ "jobId" | "job_id" | "id", "lat": number, "lng": number, "accuracy": number }`  
  All three GPS fields are **required**.

### `POST /api/me/jobs/stop`

- **Auth:** Bearer worker.
- **Body:** Same shape as start (`jobId` + `lat`, `lng`, `accuracy`).

### `GET` / `POST` `/api/me/photos` (and related)

- **Auth:** Bearer.  
- Used for worker photo list / upload as implemented in `app/api/me/photos/route.ts` and related handlers.

### `POST /api/me/password`

- **Auth:** Bearer.  
- Password change flow per route implementation.

### `GET` / `POST` `/api/me/avatar`

- **Auth:** Bearer.  
- Avatar upload/update per route.

---

## Offline / outbox expectations (client-side contract)

The **server** does not implement a durable “outbox” queue; reliability is **client-side**:

- When offline, the web app queues start/stop (see `lib/offline/outbox`).
- On reconnect, the client replays pending events to the same endpoints with the same JSON bodies.
- Native apps should replicate: persistent queue, exponential backoff, user-visible sync state, and idempotency awareness (server may reject duplicates).

---

## Future React Native compatibility

- Use **HTTPS** same as web.
- Send **Authorization Bearer** on all `/api/me/*` calls.
- Parse **`errorCode`** for stable UX (i18n).
- Prefer **`scheduled_time` + `scheduled_end_time`** together for displaying ranges if both present.
- Do not assume admin APIs or cookies; worker flows are token-based.

---

## Document maintenance

When API behavior changes, update this file in the same PR as the code change (unless explicitly documentation-only freeze).
