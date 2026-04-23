# Production environment checklist (values intentionally omitted)

Используйте `.env.example` как шаблон имён переменных. Значения задаются только на сервере / в секрет-хранилище.

---

## Обязательные (production)

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | PostgreSQL connection string для приложения |
| `JWT_SECRET` | Подпись access JWT |
| `STORAGE_SIGNING_SECRET` | Подпись URL/токенов для локального storage |
| `APP_PUBLIC_ORIGIN` | Публичный origin сайта (`https://your-domain`, без завершающего `/`) — cookies, редиректы, ссылки в письмах сброса пароля |
| `UPLOAD_ROOT` | Каталог файлов на диске сервера (напр. `./var/uploads`) |

---

## Обычно нужны для полного функционала

| Переменная | Назначение |
|------------|------------|
| `JWT_ACCESS_TTL_SECONDS` | TTL access-токена |
| `REFRESH_TOKEN_TTL_SECONDS` | TTL refresh-сессии |
| `PASSWORD_RECOVERY_TTL_SECONDS` | TTL записи в `password_recovery_tokens` (email recovery) |
| `SMS_OTP_TTL_SECONDS` | TTL строк в `sms_otp_codes` и окно жизни SMS-кода |
| `SITE_PHOTOS_BUCKET`, `WORKER_PHOTOS_BUCKET` | Имена bucket для локального storage shim |
| `SITE_PHOTOS_SIGNED_URL_TTL`, `WORKER_PHOTOS_SIGNED_URL_TTL` | TTL подписанных ссылок на файлы |

---

## Email (Resend)

| Переменная | Назначение |
|------------|------------|
| `EMAIL_SEND_ENABLED` | `1` / `true` — включить реальную отправку при наличии ключей |
| `RESEND_API_KEY` | API-ключ Resend |
| `MAIL_FROM` | Отправитель (домен должен быть верифицирован в Resend) |

Опционально: `PASSWORD_RESET_TTL_MINUTES` — если задан (>0), переопределяет TTL сброса пароля в минутах.

SMTP-переменные в коде помечены как не реализованы для отправки — не полагаться на них для продакшена.

---

## SMS (Twilio)

| Переменная | Назначение |
|------------|------------|
| `SMS_SEND_ENABLED` | `1` — разрешить реальную отправку SMS |
| `TWILIO_ACCOUNT_SID` | Account SID |
| `TWILIO_AUTH_TOKEN` | Auth token |
| `TWILIO_FROM_NUMBER` | Отправитель (номер Twilio) |

**Fallback имена (устаревшие, но поддерживаются кодом):**  
`SMS_TWILIO_ACCOUNT_SID`, `SMS_TWILIO_AUTH_TOKEN`, `SMS_TWILIO_FROM`

---

## Только локальная разработка / опционально

| Переменная | Назначение |
|------------|------------|
| `GEOCODE_PUBLIC` | На проде обычно `0`; `1` — разрешить публичный геокод для отладки |
| `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_ADMIN_USER`, … | Только для скриптов настройки локальной БД на Windows |
| `BOOTSTRAP_ADMIN_*` | Одноразовый bootstrap админа |
| `CAP_SERVER_URL` | URL для Capacitor WebView при локальной сборке (иначе см. `capacitor.config.ts`) |
| `GIT_COMMIT_SHA` / `DEPLOY_SHA` | Опционально для `/api/pwa/sw-kill` |

---

## Нельзя коммитировать

- Любые реальные значения `JWT_SECRET`, `STORAGE_SIGNING_SECRET`, `DATABASE_URL` с паролем  
- `RESEND_API_KEY`, `TWILIO_AUTH_TOKEN`, пароли SMTP  
- Файлы `.env`, `.env.local`, `.env.production`  

---

## Явная пометка запрошенных ключей

| Ключ | Роль |
|------|------|
| `APP_PUBLIC_ORIGIN` | База для ссылок восстановления пароля и согласования origin клиента |
| `EMAIL_SEND_ENABLED` | Флаг включения исходящей почты |
| `RESEND_API_KEY` | Провайдер email |
| `MAIL_FROM` | From для transactional email |
| `SMS_SEND_ENABLED` | Флаг исходящих SMS |
| `TWILIO_ACCOUNT_SID` | Учёт Twilio |
| `TWILIO_AUTH_TOKEN` | Секрет Twilio |
| `TWILIO_FROM_NUMBER` | Отправитель SMS |
| `PASSWORD_RECOVERY_TTL_SECONDS` | Время жизни токена email-reset |
| `SMS_OTP_TTL_SECONDS` | Время жизни OTP в БД |

**Database / auth / session:** всё сводится к `DATABASE_URL`, `JWT_*`, refresh-хранилище в БД (таблица `refresh_sessions`), пароли — `password_hash` в `app_users`.

---

## Наследованное окружение

Если на сервере остались переменные от предыдущего стека, они не должны считаться источником истины без сверки с актуальным кодом и `.env.example`.
