# Server dependency audit (read-only checklist)

## Scope

Автоматический SSH-обзор **не выполнялся**: в рабочей копии репозитория нет зафиксированных параметров подключения (хост, пользователь, ключ) для read-only сессии. Этот документ описывает **ожидаемые** зависимости приложения из кода и конфигов проекта.

---

## REQUIRED_SERVER_DEPENDENCIES

| Компонент | Откуда в коде / конфиге |
|-----------|-------------------------|
| Node.js runtime | `npm run start` после `npm run build` |
| PostgreSQL | `DATABASE_URL`, миграции в `db/migrations/` |
| Файловое хранилище загрузок | `UPLOAD_ROOT` (директория должна быть доступна процессу на запись) |
| Секреты приложения | `JWT_SECRET`, `STORAGE_SIGNING_SECRET` |
| Публичный origin | `APP_PUBLIC_ORIGIN` — cookies, редиректы, подписанные URL |
| Reverse proxy TLS | Обычно Caddy/nginx — терминирует HTTPS перед `localhost` приложения |

---

## OPTIONAL_SERVER_DEPENDENCIES

| Компонент | Условие |
|-----------|---------|
| Resend email | `EMAIL_SEND_ENABLED=1` и `RESEND_API_KEY`, `MAIL_FROM` |
| Twilio SMS | `SMS_SEND_ENABLED=1` и Twilio переменные |
| Geocode | `GEOCODE_PUBLIC` / админ-доступ к `/api/geocode` по политике prod |

---

## LEGACY_SERVER_DEPENDENCIES_TO_REMOVE

По текущему коду приложения **не требуются** внешние SaaS-auth или SaaS-storage URL. Устаревшие ключи из прошлых стеков в окружении сервера следует удалять только после сверки с актуальным `.env.example` (не изменять прод из этого репозитория автоматически).

---

## CONFIG_MISMATCH_RISKS

| Риск | Митигация |
|------|-----------|
| `APP_PUBLIC_ORIGIN` не совпадает с реальным доменом | Сломанные cookie/redirect и signed URLs для storage |
| `UPLOAD_ROOT` read-only или не на том диске | 5xx на upload / фото |
| БД недоступна из процесса Node | 503 на login и API |
| Capacitor приложение указывает на другой хост чем сервер | Проверить `CAP_SERVER_URL` / `capacitor.config.ts` при сборке оболочки |

---

## Read-only SSH commands (выполняет владелец сервера вручную)

Примеры **только чтения** (не выполнялись из IDE):

- `systemctl status <unit>` — имя unit из вашего деплоя  
- `sudo caddy validate --config /path/to/Caddyfile` (если установлено)  
- `ls -la` на каталог `UPLOAD_ROOT`  
- `node -v` / `npm -v` рядом с приложением  

Зафиксируйте вывод локально для сверки с этим чеклистом.
