# Self-host runtime

## Required env

- `DATABASE_URL`
- `JWT_SECRET`
- `STORAGE_SIGNING_SECRET`
- `APP_PUBLIC_ORIGIN`
- `UPLOAD_ROOT`

## Optional env

- `JWT_ACCESS_TTL_SECONDS`
- `REFRESH_TOKEN_TTL_SECONDS`
- `PASSWORD_RECOVERY_TTL_SECONDS`
- `SMS_OTP_TTL_SECONDS`
- `SITE_PHOTOS_BUCKET`
- `WORKER_PHOTOS_BUCKET`
- `SITE_PHOTOS_SIGNED_URL_TTL`
- `WORKER_PHOTOS_SIGNED_URL_TTL`
- `EMAIL_SEND_ENABLED` / `SMTP_*` — реальная отправка писем (если не задано, ссылка сброса пишется в `var/logs/auth-delivery.log`)
- `SMS_SEND_ENABLED` / `SMS_PROVIDER` — реальная отправка SMS (иначе OTP в том же логе)
- `GIT_COMMIT_SHA`
- `DEPLOY_SHA`

## One-server runtime shape

- PostgreSQL runs on the same VPS or a private host reachable from the VPS.
- uploads live on disk, for example `/opt/timeclock-data/uploads`.
- Next.js runs under `next start` behind systemd + reverse proxy.
- runtime target is Node.js (`next start`); нет привязки к конкретному облачному хостингу.

## Storage layout

```text
UPLOAD_ROOT/
  site-photos/
    sites/<siteId>/<filename>
    workers/<workerId>/<filename>
```

## Start sequence

```bash
npm install
psql "$DATABASE_URL" -f db/migrations/001_init.sql
npm run build
npm run start
```
