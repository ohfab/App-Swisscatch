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

const REMINDER_ID = 9001;

/**
 * Erinnerung ans Tagesquiz für morgen um 18 Uhr (nur in der Android-App: dort kommen
 * geplante Meldungen auch, wenn die App zu ist). Eine neue ersetzt die alte.
 */
export async function scheduleQuizReminder(streak: number) {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    const at = new Date();
    at.setDate(at.getDate() + 1);
    at.setHours(18, 0, 0, 0);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: streak > 1 ? `🔥 ${streak} Tage Serie – mach weiter!` : '👻 Geisti hat neue Fragen',
          body: 'Dein Tagesquiz wartet: 5 Fragen zur Schweiz, dauert eine Minute.',
          schedule: { at, allowWhileIdle: true },
          extra: { url: '?quiz' },
        },
      ],
    });
  } catch {
    // Erinnerungen sind ein Zusatz
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
