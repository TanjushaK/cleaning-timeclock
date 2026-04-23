# Cleanup report — cloud vendor removal (historical archive)

Этот файл намеренно сохраняет **краткую историю** удаления внешних SaaS-следов из проекта. Рабочий `README.md`, `.env.example`, код и CI **не** должны содержать имена удалённых платформ — проверка выполняется поиском по репозиторию (ниже).

## Убрано из runtime (бывший облачный клиентский контур)

- Удалены legacy cloud-adapter файлы-совместимости со старыми именами модулей.
- Новые точки входа **self-host**:
  - `lib/route-db.ts` — JWT + `requireUser` / `requireAdmin` / `requireActiveWorker`, экспорт `dbService`, `dbAnon`, `dbUser`, `ApiError`, `toErrorResponse`.
  - `lib/browser-auth.ts` — браузерный клиент авторизации поверх `/api/auth/*`; экспорт `appAuth`.
  - `lib/db-admin.ts` — `getDbAdmin()` для совместного сервисного клиента PostgreSQL/storage.
- Все API-маршруты переведены на `@/lib/route-db` и поле **`db`** (вместо прежнего имени handle в guard).
- UI-сообщения об ошибках: ключи i18n `errors.identity.*` (ранее отдельное имя группы ошибок переименовано для отсутствия ссылок на внешний бренд).

## Убрано из storage / медиа

- Публичные и подписанные URL строятся через `APP_PUBLIC_ORIGIN` и `/api/storage/*`; комментарии в `lib/server/compat/storage-shim.ts` приведены к нейтральной формулировке («storage surface», без чужих продуктовых имён).

## Убрано из CI и конфигурации

- `.github/workflows/ci.yml` — удалены подставные переменные legacy cloud-провайдера; заданы **self-host** заглушки для сборки (`DATABASE_URL`, `JWT_SECRET`, `STORAGE_SIGNING_SECRET`, `APP_PUBLIC_ORIGIN`, `UPLOAD_ROOT`).
- Legacy cloud SDK-пакеты в `package.json` **отсутствуют** (локальный стек: `pg`, `jose`, JWT, файловое хранилище).

## Документация

- Удалены устаревшие документы миграции:  
  `docs/self-host-migration-audit.md`, `docs/self-host-migration-plan.md`, `docs/self-host-migration-db.md`.
- `README.md`, `PRODUCTION_ENV_CHECKLIST.md`, `RELEASE_READINESS_REPORT.md` очищены от ссылок на удалённые документы и SaaS env.
- SQL-комментарии приведены к формулировке «psql / migration runner».

## Прочее

- `local-smoke-auth-api.ps1` — логи запуска пишутся в уникальные файлы `local-start.<timestamp>.std*.log`, чтобы параллельный dev-сервер не блокировал удаление логов.

## Подтверждение поиска (рабочее дерево)

После правок выполнен поиск по репозиторию (регистронезависимо) по ключам legacy-cloud трассировки: в коде, `.env.example`, `README.md`, `docs/**`, workflows, `package.json`, `package-lock.json`.

## Зависимости

Отдельное удаление vendor-пакетов из `package.json` не потребовалось: они не были объявлены в актуальных зависимостях.

## Проверки (2026-04-22)

- `npm install` — OK  
- `npm run build` — OK  
- `npm run lint` — OK  
- `powershell -ExecutionPolicy Bypass -File .\local-smoke-auth-api.ps1` — OK (exit 0)

---

## Обновление 2026-04-22 — биометрия и повторный аудит

### Добавлено

- `@capgo/capacitor-native-biometric` (Capacitor 6): быстрый повторный вход после обычного пароля; хранение **refresh token** в связке Keychain/Keystore, не пароля аккаунта (`lib/biometric-unlock.ts`, `app/page.tsx`, тексты в `messages/*`).
- iOS: `NSFaceIDUsageDescription`; Android: `USE_BIOMETRIC`.

### Повторный repo-wide скан (краткая классификация)

| Группа | Наблюдения |
|--------|------------|
| ACTIVE_RUNTIME_BLOCKER | Не выявлено для self-host после проверки сборки. |
| ACTIVE_CODE_TO_REPLACE | Задокументированные `localhost` / `127.0.0.1` — в README, `lib/server/env.ts` дефолт порта, CI env, локальные скрипты (`scripts/verify-worker-reset.mjs`) — **ожидаемо** для dev/smoke. |
| DOCS_TO_REWRITE | Нет обязательных конфликтов с прод; при смене домена обновить README/Capacitor инструкции вручную. |
| SAFE_TO_DELETE | Одноразовые файлы под `var/logs/` (старые smoke-логи, json-снимки, curl/out) удалены там, где они не нужны сборке; см. `.gitignore` для `audit-reports/`, `release-audit/`. |
| SERVER_DEPENDENCY_TO_AUDIT | SSH read-only из среды IDE **не выполнялся** — см. `SERVER_DEPENDENCY_AUDIT.md`. |

### Честность по биометрии

Реализован код и нативная связка плагина; подтверждение на **реальном iPhone/Android** в этом окружении **не выполнялось** — см. `BIOMETRIC_IMPLEMENTATION_REPORT.md`.

---

## Обновление — Apple audit + зачистка `var/logs` (та же сессия)

### Изменения под Apple / self-host

- **`ios/App/App/Info.plist`:** удалён ключ **`NSLocationAlwaysAndWhenInUseUsageDescription`** — для текущего кода достаточно **When In Use** (`getCurrentPosition`).
- **`app/page.tsx`:** recovery email — `redirectTo` только из **`window.location.origin`**, без захардкоженного прод-домена.

### Удалённые локальные артефакты (не нужны сборке)

- Логи smoke `local-start*.log`, вспомогательные **`curl-worker.out.txt`**, **`smoke-pixel.png`**, одноразовые **`var/logs/*.json`** (снимки отладки API).

### `.gitignore`

- Дублирование правил для `var/logs/` / `var/uploads/`; маски для `local-start*.log`, `curl-*.txt`.

### Проверки после правок (выполнено 2026-04-22)

- `npm install` — OK (зависимости up to date)  
- `npm run build` — OK (Next.js 16.2.3, TypeScript)  
- `npm run lint` — OK  
- `local-smoke-auth-api.ps1` — exit 0 (логи: `var/logs/local-start.20260422210225.stdout.log`, `...stderr.log`)

---

## Обновление 2026-04-23 — жёсткая зачистка перед baseline

### Классификация

| Класс | Содержимое |
|-------|------------|
| MUST_KEEP | `app/**`, `lib/**`, `components/**`, `messages/**`, `ios/**`, `android/**`, `db/migrations/**`, `scripts/**` (кроме локальных throwaway) |
| KEEP_LOCAL_ONLY | `.env*`, `var/logs/**`, `var/uploads/**`, `var/postgres-bundle/**` |
| DELETE_NOW | локальные архивы/дампы/логи: `timeclock-deploy.tgz`, `timeclock-prod.dump`, `var/imports/*.dump`, `var/logs/local-start*.log` |
| IGNORE_IN_GIT | `.next/`, `node_modules/`, `var/**`, `*.dump`, `*.tgz`, `audit-reports/`, `release-audit/` |

### Удалено в этом прогоне

- `timeclock-deploy.tgz`
- `timeclock-prod.dump`
- `var/imports/timeclock-before-sites-20260422-160011.dump`
- `var/imports/timeclock-before-workers-20260422-161038.dump`
- `var/logs/local-start.20260422212014.stdout.log`
- `var/logs/local-start.20260422212014.stderr.log`
- legacy cloud-adapter файл совместимости (остаток старого стека, неиспользуемый в self-host)

### Обновлённые правила ignore

- `.gitignore`: добавлены `*.dump`, `*.tgz`, `var/imports/*.dump`.

