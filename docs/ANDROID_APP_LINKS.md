# Android App Links (timeclock.tanjusha.nl)

Domain verification for `https://timeclock.tanjusha.nl` and package `nl.tanjusha.cleaningtimeclock`.

## SHA-256 fingerprint (Google Play App Signing)

1. Open [Google Play Console](https://play.google.com/console) and select the app.
2. Go to **Release** → **Setup** → **App integrity** (or **Testing and release** → **App integrity**, depending on console layout).
3. Under **App signing key certificate**, copy the **SHA-256 certificate fingerprint**.

   RU: **Тестирование и выпуск** → **Целостность приложения** → **Сертификат ключа подписи приложения** → **SHA-256**

4. Paste the value into `public/.well-known/assetlinks.json`, replacing `REPLACE_WITH_GOOGLE_PLAY_APP_SIGNING_SHA256`.

   Format: Google often shows colon-separated hex (`AA:BB:…`). Asset Links accepts that form; keep it consistent with Play Console output.

5. Deploy the site so the file is live.

6. Verify in the browser:

   `https://timeclock.tanjusha.nl/.well-known/assetlinks.json`

7. In Play Console, open **Deep links** / **App Links** (Ссылки на контент) for the domain and use **Verify** / **Check and publish** (Проверить и опубликовать) after the file is reachable.

## Repo files

- `android/app/src/main/AndroidManifest.xml` — `autoVerify` HTTPS intent-filter for `timeclock.tanjusha.nl`.
- `public/.well-known/assetlinks.json` — Digital Asset Links statement (update SHA-256 before production verification).

Do not commit real signing secrets outside this JSON on the public site; the SHA-256 app signing fingerprint is expected to be published in `assetlinks.json` for verification (it is not a private key).
