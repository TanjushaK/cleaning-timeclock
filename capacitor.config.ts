import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'nl.tanjusha.timeclock',
  appName: 'Cleaning Timeclock',
  webDir: 'out',
  bundledWebRuntime: false,
  server: {
    url: 'https://clock.tanjusha.nl',
    cleartext: false
  }
}

export default config
