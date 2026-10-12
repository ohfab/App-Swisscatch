import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform = 'ios' | 'android' | 'desktop';
export type Browser = 'chromium' | 'safari' | 'firefox' | 'other';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const ua = navigator.userAgent;
const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const platform: Platform = ios ? 'ios' : /android/i.test(ua) ? 'android' : 'desktop';
const browser: Browser = /firefox|fxios/i.test(ua)
  ? 'firefox'
  : /edg|chrome|crios|chromium|opr|samsungbrowser/i.test(ua)
    ? 'chromium'
    : /safari/i.test(ua)
      ? 'safari'
      : 'other';

/*
 * Der Browser meldet «installierbar» nur einmal kurz nach dem Laden.
 * Darum hört dieses Modul sofort beim Import zu und merkt sich das Ereignis
 * für alle Komponenten, auch solche, die erst später erscheinen.
 */
let deferred: BeforeInstallPromptEvent | null = null;
let installed = isStandalone();
let snapshot = { canPrompt: false, installed };
const listeners = new Set<() => void>();

function emit() {
  snapshot = { canPrompt: deferred !== null, installed };
  listeners.forEach((l) => l());
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  emit();
});
window.addEventListener('appinstalled', () => {
  installed = true;
  deferred = null;
  emit();
});

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Zeigt den Installationsdialog des Browsers. true, wenn installiert wurde. */
async function install() {
  if (!deferred) return false;
  const event = deferred;
  await event.prompt();
  const choice = await event.userChoice;
  deferred = null;
  if (choice.outcome === 'accepted') installed = true;
  emit();
  return choice.outcome === 'accepted';
}

/** «Als App installieren» – nativer Dialog (Chrome, Edge, Android) oder Anleitung (iPhone, andere Browser) */
export function useInstallPrompt() {
  const state = useSyncExternalStore(subscribe, () => snapshot);
  return { ...state, ios, platform, browser, install };
}
