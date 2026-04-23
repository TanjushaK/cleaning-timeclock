# Cleaning Timeclock (Tanija)

Next.js (App Router) + PostgreSQL + local file storage + internal JWT auth + Tailwind.

## Быстрый старт

```bash
npm install
npm run dev
```

Открой: http://localhost:3000

## Environment (.env.local)

Скопируй `.env.example` → `.env.local` и заполни значения.

Обязательные переменные:

- `DATABASE_URL`
- `JWT_SECRET`
- `STORAGE_SIGNING_SECRET`
- `APP_PUBLIC_ORIGIN`
- `UPLOAD_ROOT`

## Scripts

- `npm run dev` — локальная разработка
- `npm run build` — сборка
- `npm run start` — запуск прод-сервера
- `npm run lint` — eslint

## Self-host runtime

Приложение готово для one-server запуска (PostgreSQL + `next start` на своём сервере):

- PostgreSQL — основная БД
- uploads — локально на сервере в `UPLOAD_ROOT`
- auth/session — внутри проекта
- signed/public files — через `/api/storage/*`

Ключевые документы:

- `docs/self-host-runtime.md`
- `docs/self-host-cutover-checklist.md`
- `docs/STORE_RELEASE.md`

### Bootstrap schema

```bash
psql "$DATABASE_URL" -f db/migrations/001_init.sql
```

### Bootstrap first admin

```bash
BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
BOOTSTRAP_ADMIN_PASSWORD='change-me-now' \
BOOTSTRAP_ADMIN_FULL_NAME='Main admin' \
node scripts/bootstrap-admin.mjs
```

## Продакшен (свой сервер)

Сборка: `npm run build`, запуск: `npm run start`.
Секреты не коммитить. Для `Capacitor` публичный URL остаётся тем же: `https://timeclock.tanjusha.nl`.

## Локали (uk / ru / en / nl)

- Переключатель в UI сохраняет язык в **`localStorage`** и **cookie** `ct_lang`.
- Прямая ссылка с языком: `https://ваш-домен/?lang=nl`.
- Словарь `useI18n().t(...)` и `document.documentElement.lang` работают как раньше.

### Мобильные приложения (Google Play / App Store)

Проект на **Capacitor 6**: каталоги **`android/`** и **`ios/`**, оболочка грузит продакшен URL. После правок выполняйте `npx cap sync`. Пошаговая инструкция по публикации: **[docs/STORE_RELEASE.md](./docs/STORE_RELEASE.md)**.
