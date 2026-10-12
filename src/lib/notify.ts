import { useEffect, useState } from 'react';
import { isNative } from './native';

/*
 * System-Benachrichtigungen, wenn die App im Hintergrund ist (neue Challenge, Falle, «Gefunden!»).
 * Im Browser über den Service Worker, in der Android-App über lokale Benachrichtigungen.
 * Ist die App sichtbar, reicht der Hinweis in der App.
 */

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

let nextId = 1;

export async function notifyPermission(): Promise<NotifyPermission> {
  try {
    if (isNative) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const p = await LocalNotifications.checkPermissions();
      return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'default';
    }
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export async function requestNotify(): Promise<NotifyPermission> {
  try {
    if (isNative) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const p = await LocalNotifications.requestPermissions();
      return p.display === 'granted' ? 'granted' : 'denied';
    }
    if (!('Notification' in window)) return 'unsupported';
    return await Notification.requestPermission();
  } catch {
    return 'unsupported';
  }
}

/** Benachrichtigung zeigen – nur wenn die App gerade nicht sichtbar ist */
export async function notifyUser(title: string, body: string, tag = 'zeitgeist') {
  if (document.visibilityState === 'visible') return;
  try {
    if (isNative) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({ notifications: [{ id: nextId++, title, body }] });
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const icon = `${import.meta.env.BASE_URL}icons/icon-192.png`;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon, badge: icon, tag, data: { url: location.href } });
    else new Notification(title, { body, icon, tag });
  } catch {
    // Benachrichtigungen sind ein Zusatz – ohne geht es auch
  }
}

/** Aktueller Stand der Erlaubnis, mit Funktion zum Nachfragen */
export function useNotifyPermission() {
  const [perm, setPerm] = useState<NotifyPermission>('default');
  useEffect(() => {
    void notifyPermission().then(setPerm);
  }, []);
  const ask = async () => setPerm(await requestNotify());
  return { perm, ask };
}
