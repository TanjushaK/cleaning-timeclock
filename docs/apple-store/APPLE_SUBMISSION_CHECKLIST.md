# Apple submission checklist

Final release steps to run on a Mac before App Store submission.

1. Pull latest `main` on Mac.
2. Run `npm install`.
3. Run `npm run build`.
4. Run `npx cap sync ios`.
5. Open `ios/App/App.xcworkspace` in Xcode.
6. Check signing/team/provisioning settings.
7. Create Archive (`Product` -> `Archive`).
8. Upload build to App Store Connect.
9. Run TestFlight smoke test.
10. Upload screenshots and App Preview assets.
11. Submit for App Review.
