/** Wrapper Android Capacitor — Buget Familie păstrează același build web ca GitHub Pages. */
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ro.balty1991.bugetfamilie",
  appName: "Bonuț",
  webDir: "dist/public",
  android: {
    backgroundColor: "#E4E9E6",
    adjustMarginsForEdgeToEdge: "disable",
  },
  plugins: {
    // Iconul mic al notificării: silueta plicului aplicației, colorată ca în launcher.
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
      iconColor: "#1B4F42",
    },
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
    },
  },
};

export default config;
