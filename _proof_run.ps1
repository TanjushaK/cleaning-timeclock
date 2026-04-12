Set-Location C:\Users\info\cleaning_timeclock\cleaning-timeclock-main

git status --short --branch
git diff --name-only
git diff --stat

git diff -- app/me/profile/page.tsx
git diff -- app/page.tsx
git diff -- app/auth/callback/page.tsx
git diff -- app/forgot-password/page.tsx
git diff -- app/reset-password/page.tsx
git diff -- app/offline/page.tsx
git diff -- app/not-found.tsx
git diff -- app/_components/AppFooter.tsx
git diff -- app/_components/SearchableSelect.tsx
git diff -- app/_components/SmartPickers.tsx
git diff -- lib/app-api-message.ts
git diff -- lib/locale-format.ts

Select-String -Path "app/me/profile/page.tsx" -Pattern '[А-Яа-яЁё]' | ForEach-Object { "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim() }

Select-String -Path "app/page.tsx" -Pattern "formatDateRu|formatTimeRu|formatDateTimeRu" | ForEach-Object { "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim() }

Get-ChildItem app/me,app/auth,app/forgot-password,app/reset-password,app/offline,app/_components -Recurse -File |
  Select-String -Pattern '[А-Яа-яЁё]' |
  ForEach-Object { "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim() }

npm run build
