/** Wrapper Android Capacitor — BonAI (fost Buget Familie) păstrează același build web ca GitHub Pages. */
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ro.balty1991.bugetfamilie",
  appName: "BonAI",
  webDir: "dist/public",
  android: {
    backgroundColor: "#1A1446",
    adjustMarginsForEdgeToEdge: "disable",
  },
  plugins: {
    // Iconul mic al notificării: bonul BonAI, colorat ca în launcher.
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
      iconColor: "#0F7B5F",
    },
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
    },
  },
};

export default config;
