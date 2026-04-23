# Apple compliance audit (App Store–oriented)

## Verdict: **READY WITH WARNINGS**

Под «ready» понимается: **код и метаданные соответствуют заявленному поведению** и не содержат очевидных противоречий для review **при честном описании** приложения и **без необоснованных маркетинговых утверждений**. Предупреждения ниже нужно закрыть тестами или политикой перед подачей.

---

## Что проверено по факту (репозиторий)

### 1. Info.plist (`ios/App/App/Info.plist`)

| Элемент | Статус |
|---------|--------|
| `NSFaceIDUsageDescription` | **Есть** — объясняет разблокировку сохранённого входа; указано, что пароль аккаунта не хранится |
| Location | **`NSLocationWhenInUseUsageDescription` только** — текст про проверку на объекте при начале/конце смены; ключ **«Always» удалён**, т.к. в коде используется только `navigator.geolocation.getCurrentPosition` (нет background / watch без необходимости для заявленного сценария) |
| Tracking (ATT) | **Нет** `NSUserTrackingUsageDescription`, нет вызовов App Tracking Transparency в коде |

### 2. Биометрия (`lib/biometric-unlock.ts`, `app/page.tsx`)

| Требование | Факт |
|------------|------|
| Реальный плагин | `@capgo/capacitor-native-biometric` — импорт и вызовы `isAvailable`, `verifyIdentity`, `setCredentials`, `getCredentials`, `deleteCredentials` |
| Пароль не кладём в поле credential | В нативное API передаётся **refresh token** под именем поля плагина `password`; пароль аккаунта не сохраняется |
| Не единственный способ входа | Биометрия только после обычного входа + опциональные кнопки при `Capacitor.isNativePlatform()` и наличии железа |
| Fallback | Формы email/phone + пароль всегда доступны в WebView |
| Logout | `clearBiometricStoredCredentials()` + очистка токенов в приложении |

### 3. Privacy / риски review

| Риск | Оценка |
|------|--------|
| Обманные permission strings | Не выявлено для оставшихся ключей |
| Fake UI биометрии | Нет — кнопки завязаны на native + `biometricHardwareAvailable` + флаг сохранённого режима |
| Hidden debug ATT | Нет |
| Остатки старого cloud-adapter кода | legacy-файл совместимости удалён как мёртвый leftover; активные self-host роуты идут через `lib/route-db.ts` |

### 4. Захардкоженный прод-домен в recovery flow

| Файл | Изменение |
|------|-----------|
| `app/page.tsx` (`doEmailRecovery`) | Redirect для reset больше **не** использует захардкоженный посторонний URL — только `window.location.origin` в клиенте |

Остаётся **осознанный** дефолт **`capacitor.config.ts`** (`CAP_SERVER_URL` или дефолт-хост для WebView сборки) — это **конфигурация оболочки**, не код review WebView страницы; для другого домена задаётся при сборке.

### 5. Что может вызвать вопрос у ревьюера Apple

| Тема | Комментарий |
|------|-------------|
| WebView + свой backend | Допустимо; в метаданных App Store нужно корректно описать вход (аккаунт организации и т.д.), без недостоверной «только Face ID» |
| Геолокация | Строка When In Use должна совпадать с реальным UX (старт/стоп смены рядом с объектом) |
| Биометрия | До маркетинга «Face ID» в описании — прогон на реальном iPhone |

---

## Что обязательно проверить на реальном iPhone

1. Первый вход паролем → включение биометрии → выход → повторный вход биометрией → выход → только пароль.  
2. Отказ / Cancel на системном диалоге биометрии → можно войти паролем.  
3. Системный сценарий геолокации: текст системного запроса соответствует **When In Use**.  
4. Archive / TestFlight без предупреждений о missing usage strings для используемых API.

### Файлы, требующие device verification (не code blocker, а QA blocker)

- `app/page.tsx`
- `lib/biometric-unlock.ts`
- `ios/App/App/Info.plist`
- `android/app/src/main/AndroidManifest.xml`

---

## Блокеры для статуса «READY» без оговорок

| Блокер | Тип |
|--------|-----|
| Отсутствие подтверждения на физическом устройстве (биометрия + при необходимости гео) | Процесс / QA, не конкретный файл |
| Неверное описание в App Store Connect | Метаданные |

Файлов с перечислением «блокирует сборку или отправку автоматически» в репозитории **не выявлено** при этом аудите.

---

## Итоговая формулировка

- **Не заявлять «Apple-compliant» без ваших собственных прогонов на устройстве и выбранной политики приватности.**  
- Техническая готовность к review: **READY WITH WARNINGS** по состоянию на дату правок в этом аудите.

---

## Обновления (2026-04-23)

- **Account deletion:** in-app initiation via `POST /api/me/account-deletion` + UI на `/me/profile` (очередь `account_deletion_requests`, не мгновенный hard-delete).  
- **Legal pages:** `/privacy`, `/terms`, `/legal`, `/support`, `/contact`, `/returns`, `/shipping` + тексты в `lib/apple-legal-docs.ts`.  
- **Расширенный чеклист:** `APPLE_APP_READINESS_CHECKLIST.md`, `APPLE_RISK_MATRIX.md`, `APPLE_METADATA_REVIEW.md`.
