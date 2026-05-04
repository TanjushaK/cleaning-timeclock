# Deploy file list (self-host + GitHub)

## Краткий итог

В продакшен уходит **исходный код**, **статика**, **SQL-миграции**, **Capacitor `android/` / `ios/`**, lockfile и конфиги **без секретов**.  
**Не** деплоить: локальные `.env*`, `var/logs`, `var/uploads`, одноразовые аудит-снимки, локальные скрипты только для вашей машины.

## Классификация (кратко)

| Класс | Содержимое |
|-------|------------|
| **MUST_KEEP** | Совпадает с **MUST_DEPLOY** + `db/migrations`, `public/`, нативные проекты, lockfile. |
| **KEEP_LOCAL_ONLY** | См. таблицу ниже (секреты, `var/`, локальные БД, smoke-скрипты). |
| **DELETE_NOW** (уже очищено в репо по возможности) | Случайные `var/logs/*.json` (снимки API), `local-start*.log`, `curl-worker.out.txt`, `smoke-pixel.png` — **не** часть продукта. |
| **IGNORE_IN_GIT** | См. `.gitignore` — `node_modules`, `.next`, `var/logs`, `var/uploads`, `*.log` smoke, `audit-reports/`, `release-audit/`. |

---

## MUST_DEPLOY

| Область | Пути / файлы |
|--------|----------------|
| Приложение Next.js | `app/`, `components/`, `lib/`, `messages/`, `public/` |
| Конфиг сборки | `package.json`, `package-lock.json`, `next.config.*`, `tsconfig.json`, `postcss.config.*`, `eslint.config.*`, конфиги Tailwind |
| БД | `db/migrations/**` |
| Документация деплоя (опционально на сервер, желательно в Git) | `README.md`, `docs/**`, `DEPLOY_FILELIST.md`, `PRODUCTION_ENV_CHECKLIST.md` |
| Capacitor / магазины | `capacitor.config.ts`, `android/**`, `ios/**` (в т.ч. `@capgo/capacitor-native-biometric` после `npx cap sync`) |
| Service worker / PWA | `public/sw.js` и связанные ассеты |
| Служебные скрипты на сервере | `scripts/apply-migration.mjs`, `scripts/bootstrap-admin.mjs` (при необходимости), `scripts/setup-local-db.mjs` только если используете для CI/админа |

---

## KEEP_LOCAL_ONLY

| Что | Зачем |
|-----|--------|
| `.env.local` | Секреты и локальные URL |
| `var/logs/**` | Локальные логи (`auth-delivery`, smoke) |
| `var/uploads/**` | Локальные файлы пользователей / фото |
| `var/postgres-bundle/**` | Локальный кластер PostgreSQL (если есть) |
| `fix-local-postgres.ps1`, `force-local-postgres-bootstrap.ps1`, `scripts/start-local-postgres-bundle.ps1` | Только локальная Windows-сборка БД |
| `local-smoke-auth-api.ps1` | Локальный smoke |
| `scripts/import-workers-from-users-stage.mjs`, `scripts/verify-worker-reset.mjs` | Импорт/проверки только при миграции данных |
| Любые CSV/дампы вне репозитория | Импорт данных |

---

## DELETE_OR_IGNORE

| Что | Действие |
|-----|----------|
| `audit-reports/*.txt`, `release-audit/*.txt` | Одноразовые снимки — **не коммитить**; можно удалить локально (уже в `.gitignore`) |
| `CURSOR_TASK.md` | Локальная заметка — **игнор в Git** |
| `.next/`, `node_modules/` | Артефакты сборки — не в Git |
| `*.log` в `var/logs` | Не коммитить |

---

## Не включать в GitHub

- `.env`, `.env.local`, любые файлы с паролями и API-ключами  
- `var/logs/`, `var/uploads/`  
- `.next/`, `node_modules/`  
- Большие бинарники данных PostgreSQL под `var/postgres-bundle/`  

*(Частично уже покрыто `.gitignore`.)*

---

## Не включать в server deploy

- Исходники только для разработки на Windows: локальные postgres-bootstrap скрипты (если на сервере Linux без них)  
- `local-smoke-auth-api.ps1`  
- Личные заметки и каталоги `audit-reports/` / `release-audit/`  

На сервере нужны: собранное приложение (`next build` → `.next`), `node_modules` (или `npm ci`), `public/`, при необходимости `db/migrations`, `.env` **на сервере** (не из репозитория).

---

## Safe Deploy Pattern (rsync)

Базовый безопасный шаблон синхронизации в `/opt/timeclock`:

`rsync -az --delete --filter='P .env.production' --filter='P var/uploads/***' --filter='P var/logs/***' --filter='P *.dump' --exclude='.git/' --exclude='node_modules/' --exclude='.next/' ./ root@<host>:/opt/timeclock/`

**Обязательно защищать загрузки и логи** при `rsync --delete`, иначе каталог приложения перезапишется без `var/uploads` из архива и файлы пользователей пропадут:

- `--filter='P var/uploads/***'`
- `--filter='P var/logs/***'`

(альтернатива: `--exclude='var/uploads'` / `--exclude='var'` — по политике команды.)

Критично:

- `EnvironmentFile` для systemd лучше держать вне deploy path: `/etc/timeclock/timeclock.env`.
- Никогда не удалять вручную `/etc/timeclock/timeclock.env`.
- Перед deploy всегда иметь rollback snapshot service/env.

---

## Очистка диска (storage cleanup)

Скрипт **только вручную** на сервере (не в CI/deploy по умолчанию): удаляет **файлы** для уже soft-deleted вложений (старше N дней), «осиротевшие» файлы под `workers/*/admin-chat/**`, и старые tarball’ы rollback в `/var/tmp/tanjusha-rollback/` с префиксом `timeclock-`. **Строки БД не удаляет.** По умолчанию **dry-run** — без `--apply` удалений нет.

Рекомендуемый порядок:

1. Первый запуск только план:  
   `cd /opt/timeclock && npm run cleanup:storage`  
   (или явно `npm run cleanup:storage -- --dry-run`).
2. После проверки вывода:  
   `npm run cleanup:storage -- --apply`.

Параметры: `--deleted-attachments-days=30`, `--orphan-days=30`, `--rollback-days=14`. Env: приоритет `/etc/timeclock/timeclock.env`, иначе `.env.production` в корне приложения (нужен `DATABASE_URL`, не логировать).

**Systemd timer в этом репозитории не добавляется.** После успешного dry-run при необходимости на сервере вручную создайте unit + timer (daily), вызывающий ту же команду с `--apply` только когда процедура проверена.

---

## Zero-Trace Guard

Перед релизом запускать repo-wide проверку legacy cloud-токенов и не деплоить, если есть совпадения в current tree или в активных runtime-конфигах.
