import type { CapacitorConfig } from '@capacitor/cli'

/** Продакшен WebView грузить цей хост (Next.js). Для локальної збірки: CAP_SERVER_URL=http://10.0.2.2:3000 npx cap run android */
const serverUrl =
  process.env.CAP_SERVER_URL?.replace(/\/$/, '') || 'https://timeclock.tanjusha.nl'

const config: CapacitorConfig = {
  appId: 'nl.tanjusha.timeclock',
  appName: 'Cleaning Timeclock',
  webDir: 'mobile-www',
  server: {
    url: serverUrl,
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'App',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#120805',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      iosSpinnerStyle: 'small',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#120805',
    },
  },
}

export default config
