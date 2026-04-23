# Self-host cutover checklist

## Before cutover

- [ ] provision PostgreSQL
- [ ] create upload root and writable directories
- [ ] apply `db/migrations/001_init.sql`
- [ ] bootstrap first admin
- [ ] import production data from old database
- [ ] copy photo/object files into `UPLOAD_ROOT`
- [ ] set all new env values on the server
- [ ] confirm `APP_PUBLIC_ORIGIN=https://timeclock.tanjusha.nl`

## Smoke

- [ ] worker login by email/password
- [ ] worker login by phone/password
- [ ] admin login
- [ ] `/api/auth/refresh`
- [ ] `/api/me/profile`
- [ ] worker photo upload/list/delete
- [ ] admin site photo upload/list/delete
- [ ] admin worker photo upload/list/delete
- [ ] schedule/jobs CRUD
- [ ] reports load
- [ ] Capacitor shell still opens the same public URL

## Rollback

- [ ] keep the previous deployment artifact intact
- [ ] keep the previous database snapshot intact
- [ ] keep a tarball of `UPLOAD_ROOT` before switching traffic
- [ ] if smoke fails, restore previous app release + previous database snapshot + previous uploads snapshot together
