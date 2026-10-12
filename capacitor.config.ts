import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android-App (Capacitor). Gebaut wird sie von .github/workflows/android.yml:
 * VITE_NATIVE=1 npm run build → npx cap add android → scripts/android-prepare.mjs → Gradle.
 */
const config: CapacitorConfig = {
  appId: 'ch.spurlos.app',
  appName: 'Spurlos',
  webDir: 'dist',
  android: {
    // Verhindert, dass Standort-Updates nach 5 Min im Hintergrund stoppen (Plugin-Empfehlung)
    useLegacyBridge: true,
    // Android 15 zeichnet bis unter die Statusleiste; so bleibt die Karte darunter frei
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_spurlos',
      iconColor: '#F9B07E',
    },
  },
};

export default config;
