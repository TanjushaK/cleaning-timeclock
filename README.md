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
