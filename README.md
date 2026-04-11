# Cleaning Timeclock (Tanija)

Next.js (App Router) + Supabase (Auth/Postgres/RLS) + Tailwind.

## Быстрый старт

```bash
npm i
npm run dev
```

Открой: http://localhost:3000

## Environment (.env.local)

Скопируй `.env.example` → `.env.local` и заполни значения.

Обязательные переменные:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (только сервер; нужен для admin API)

Без этих переменных часть страниц/эндпоинтов может возвращать 500.

## Scripts

- `npm run dev` — локальная разработка
- `npm run build` — сборка
- `npm run start` — запуск прод-сервера
- `npm run lint` — eslint

### Если сборка флапает на Turbopack

В Next.js 16 Turbopack — дефолтный бандлер. Если где-то сборка нестабильна по окружению,
можно собирать Webpack’ом:

```bash
next build --webpack
```

(удобно вынести отдельным CI-скриптом).

## Продакшен (свой сервер)

Сборка: `npm run build`, запуск: `npm run start` (часто за reverse proxy — Caddy/nginx).  
Переменные окружения те же, что в `.env.example`; секреты не коммитить.  
Опционально задайте `GIT_COMMIT_SHA` или `DEPLOY_SHA` (7+ символов), чтобы в ответе `/api/pwa/sw-kill` была понятная метка релиза — иначе используется хэш из `.next/BUILD_ID`.

### Обслуживание VPS (очистка и обновления системы)

На Ubuntu уже обычно включён **`unattended-upgrades`** (автоустановка обновлений безопасности). Дополнительно в репозитории:

- `scripts/vps-maintain.sh` — вручную: `sudo bash scripts/vps-maintain.sh` (полное обновление пакетов, `autoremove`, очистка кэша apt, сжатие журнала journal).
- `scripts/vps-install-auto-cleanup.sh` — один раз: еженедельная лёгкая очистка (`/etc/cron.weekly/timeclock-cleanup`) и `APT::Periodic::AutocleanInterval` для apt.

## Локали (uk / ru / en / nl)

- Переключатель в UI сохраняет язык в **`localStorage`** и **cookie** `ct_lang` (для SSR и корректного `lang` у `<html>`).
- Прямая ссылка с языком: `https://ваш-домен/?lang=nl` — выставит cookie и уберёт параметр из адреса.
- Автоперевод интерфейса (тексты, собранные на русском в разметке) и словарь `useI18n().t(...)` работают от выбранной локали; `document.documentElement.lang` синхронизируется на клиенте.

### Мобильные приложения (Google Play / App Store)

Проект на **Capacitor 6**: каталоги **`android/`** и **`ios/`**, оболочка грузит продакшен URL. После правок выполняйте `npx cap sync`. Пошаговая инструкция по публикации: **[docs/STORE_RELEASE.md](./docs/STORE_RELEASE.md)**.
