import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nl.tanjusha.timeclock",
  appName: "Cleaning Timeclock",
  webDir: "out",
  server: {
    url: "https://timeclock.tanjusha.nl",
    cleartext: true
  }
};

export default config;
