# Release readiness report

## 1. Build result

`npm run build` — **успешно** (2026-04-23: Next.js 16.2.3, Turbopack, TypeScript без ошибок).

`npm install` — **успешно** (`up to date`).  
`npm run lint` — **успешно** (`eslint`, без ошибок).

## 2. Smoke result

`powershell -ExecutionPolicy Bypass -File .\local-smoke-auth-api.ps1` — **успешно** (exit code 0): GET 200 по основным страницам; `POST /api/auth/login` → 401, `POST /api/auth/refresh` → 400 (ожидаемо без валидного token), geocode 200. Логи: `var/logs/local-start.20260423102128.stdout.log` / `.stderr.log`.

## 3. Auth / recovery result

- **Код и маршруты** для login, refresh, forgot-password (email), forgot-password-sms, verify-reset-sms, reset-password-sms, exchange, `/api/me/password` присутствуют; сборка проходит.  
- **Полный E2E** (реальный Resend + Twilio + ручной ввод кода) в этой автоматической ревизии **не выполнялся** — требуется проверка на стенде с реальными секретами.  
- **Admin login** не изменялся в этой задаче; smoke не ломает сценарий.

## 4. Deploy file list summary

См. **`DEPLOY_FILELIST.md`**: MUST_DEPLOY / KEEP_LOCAL_ONLY / DELETE_OR_IGNORE.

## 5. Production env summary

См. **`PRODUCTION_ENV_CHECKLIST.md`**.

## 6. Cleanup performed

См. **`CLEANUP_REPORT.md`** — удаление следов внешних SaaS-платформ из кода/CI/доков; переименование модулей `lib/route-db.ts`, `lib/browser-auth.ts`, `lib/db-admin.ts`.

## 7. GitHub readiness

- **Готовность:** **условная** — после `git add` убедиться, что нет секретов и бинарных дампов; новые отчётные `.md` можно коммитить.  
- **Документация:** рабочие инструкции — `README.md`, `docs/self-host-runtime.md`, `.env.example` (self-host).

## 8. Server deploy readiness

- **Готовность:** **условная** — нужны прод `DATABASE_URL`, секреты JWT/storage, `APP_PUBLIC_ORIGIN` домена продакшена, опционально Resend/Twilio.  
- **Жёсткий прод URL:** в `capacitor.config.ts` fallback `https://timeclock.tanjusha.nl`; для своего домена задайте **`CAP_SERVER_URL`** / сборку под свой хост.  
- **Email recovery redirect:** `app/page.tsx` — `redirectTo` для письма сброса пароля строится от **`window.location.origin`** (без захардкоженного чужого домена).

## 9. Apple compliance status

См. **`APPLE_COMPLIANCE_AUDIT.md`** и **`BIOMETRIC_IMPLEMENTATION_REPORT.md`**.  
**Биометрический quick-login:** код и plist обновлены; **подтверждение на реальном устройстве не выполнялось** — перед маркетингом «Face ID» в описании приложения нужен успешный прогон на iPhone/Android.

## 10. Hard blockers

| Блокер | Критичность |
|--------|-------------|
| Биометрия не проверена на физическом устройстве | Высокая **только если** заявляете биометрию пользователю / в App Store |
| Прод secrets и origin не заданы на сервере | Высокая для любого деплоя |
| Старый хардкод Capacitor URL на чужой домен | Средняя, если целевой сервер другой |

## 11. Safe next step before deploy

1. Заполнить прод `.env` по **`PRODUCTION_ENV_CHECKLIST.md`**.  
2. Прогнать `npm ci && npm run build` на CI или сервере.  
3. Приложить миграции: `db/migrations`.  
4. Выполнить `bootstrap:admin` на прод-БД (один раз, безопасным каналом).  
5. Для App Store: прогнать сценарии на **реальном iPhone** (биометрия, гео); в Connect не заявлять «только Face ID»; см. **`APPLE_COMPLIANCE_AUDIT.md`**.

## 12. Runtime preflight before baseline/deploy (2026-04-23)

- `timeclock.service` = active  
- `postgresql` / `postgresql@16-main` = active  
- `127.0.0.1:5432` listening = yes  
- `GET /`, `GET /forgot-password`, `GET /reset-password` = 200  
- `GET /api/auth/sms-capabilities` = 200 (`{"outboundSms":true}`)  
- `POST /api/auth/login` with wrong password = 401 (`AUTH_INVALID_CREDENTIALS`)  
- `POST /api/auth/forgot-password` = 200 (`{"ok":true,"delivery":"none"}`)  
