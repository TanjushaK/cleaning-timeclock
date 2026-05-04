# Tanjusha Timeclock Golden Baseline — 2026-05-04

Production commit: 9c3c34b
Tag: baseline-timeclock-worker-chats-photo-ok-2026-05-04

Confirmed OK:
- Worker web “Мой график” visible
- Worker shift chat visible and working
- Worker profile chat visible and working
- Profile chat photo picker: 1/5 + preview
- Profile chat photo send works
- Send button mobile layout fixed
- Admin sees profile chat photo
- Web not broken
- Smoke /, /admin, live /, live /admin = 200

Untouched:
- Firebase/push
- DB/migrations
- mobile repo
- Caddy/systemd/env/secrets

Rollback before PR #123:
/root/rollback/timeclock-pre-profile-chat-send-button-20260504-123734.tar.gz

Do not deploy older main or revert these fixes without explicit instruction.
