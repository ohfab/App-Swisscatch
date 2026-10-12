import { Capacitor } from '@capacitor/core';

/** Läuft als Android-App (Capacitor) statt im Browser */
export const isNative = Capacitor.isNativePlatform();
export const nativePlatform = Capacitor.getPlatform();

/** Öffentliche Adresse der Web-App – in der Android-App ist location.origin nur «localhost» */
export const PUBLIC_URL = isNative ? 'https://ohfab.github.io/App-Swisscatch/' : `${location.origin}${import.meta.env.BASE_URL}`;

/** Immer die neueste Android-App (wird bei jedem Push gebaut) */
export const APK_URL = 'https://github.com/ohfab/App-Swisscatch/releases/latest/download/Zeitgeist.apk';
