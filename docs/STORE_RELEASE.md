# Публикация в Google Play и App Store (Capacitor)

Приложение — **WebView** к продакшен-сайту `https://timeclock.tanjusha.nl` (см. `capacitor.config.ts`). Нативные проекты: **`android/`**, **`ios/`**.

## Общее

1. Убедитесь, что сайт стабильно открывается по HTTPS с того же домена, что в `capacitor.config.ts` (или задайте `CAP_SERVER_URL` при `npx cap sync`).
2. После изменений в веб-приложении или `capacitor.config.ts`:

   ```bash
   npm run build
   npx cap sync
   ```

3. Политика конфиденциальности и контакты поддержки понадобятся в обеих витринах (URL публичной страницы).

---

## Google Play (Android)

**На машине с Android Studio (Windows / Linux / macOS):**

1. Откройте папку `android` в Android Studio: `npm run cap:open:android` или File → Open → `android`.
2. **Подпись релиза:** в Play Console создайте приложение, включите App Signing, создайте keystore (или используйте Play App Signing и загрузите ключ подписи по инструкции Google).
3. В `android/app/build.gradle` при необходимости увеличьте `versionCode` / `versionName` перед каждым релизом.
4. Build → **Generate Signed Bundle / APK** → **Android App Bundle (.aab)** для загрузки в Play Console.
5. Заполните карточку магазина (скриншоты, описание, возрастной рейтинг, декларация разрешений — геолокация указана в манифесте).

**Локальная отладка** против `localhost` / IP в той же Wi‑Fi сети:

```bash
set CAP_SERVER_URL=http://ВАШ_IP:3000
npx cap sync
npx cap run android
```

(На эмуляторе Android часто используют `http://10.0.2.2:3000` для хоста Windows.)

---

## Apple App Store (iOS)

Сборка **.ipa** и загрузка в App Store Connect выполняются **на macOS с Xcode** (установите [Xcode](https://developer.apple.com/xcode/) и [CocoaPods](https://cocoapods.org/)):

1. `cd ios/App && pod install` (при необходимости).
2. Откройте `ios/App/App.xcworkspace` в Xcode.
3. Выберите Team (Apple Developer Program), задайте уникальный **Bundle ID** при необходимости (сейчас задаётся в проекте Capacitor).
4. Product → **Archive** → **Distribute App** → App Store Connect.
5. В [App Store Connect](https://appstoreconnect.apple.com/) создайте приложение, заполните метаданные, скриншоты, политику конфиденциости, ответы на вопросы о шифровании и геолокации.

На Windows/Linux папка **`ios/`** уже в репозитории — её дорабатывают и собирают на Mac.

---

## Версии и скрипты

| Команда | Действие |
|--------|----------|
| `npx cap sync` | Копирует `mobile-www` и конфиг в нативные проекты, обновляет плагины. |
| `npm run cap:open:android` | Android Studio. |
| `npm run cap:open:ios` | Xcode (на Mac). |

Перед отправкой в магазины имеет смысл поднять **`version`** в `package.json` и синхронизировать с `versionName` / Marketing Version в нативных проектах.
