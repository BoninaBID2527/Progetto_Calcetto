/*
 * PWA e Web Push lato browser. Il permesso per le notifiche si chiede SOLO
 * dopo un clic esplicito (mai al caricamento della pagina).
 */
import { api } from '../api/client';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Senza service worker l'app funziona lo stesso: niente offline e niente push.
    });
  });
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/** Cosa si può fare su questo dispositivo, con una spiegazione onesta. */
export function pushSupport() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    if (isIos() && !isStandalone()) {
      return { supported: false, reason: "Su iPhone e iPad le notifiche push arrivano solo se aggiungi BONMATCH alla schermata Home (Condividi → Aggiungi alla schermata Home, iOS 16.4 o successivo) e la apri da lì." };
    }
    return { supported: false, reason: 'Questo browser non supporta le notifiche push. Le notifiche dentro l\'app funzionano comunque.' };
  }
  return { supported: true, permission: Notification.permission };
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Chiede il permesso (va chiamata da un clic), iscrive il browser e lo registra sul server. */
export async function enablePush() {
  const config = await api('/push/config');
  if (!config.enabled) throw new Error('Le notifiche push non sono configurate sul server (mancano le chiavi VAPID).');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'Hai bloccato le notifiche: riattivale dalle impostazioni del browser per questo sito.' : 'Permesso non concesso.');
  }
  const reg = await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) }));
  await api('/push/subscriptions', { method: 'POST', body: subscription.toJSON() });
  return subscription;
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (subscription) {
    await api('/push/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }
  await api('/users/me', { method: 'PATCH', body: { notificationPrefs: { push: false } } });
}

/** Numero sull'icona dell'app installata, dove il sistema lo supporta. */
export function setAppBadge(count) {
  if (!('setAppBadge' in navigator)) return;
  if (count > 0) navigator.setAppBadge(count).catch(() => {});
  else navigator.clearAppBadge?.().catch(() => {});
}

let deferredInstall = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    listeners.forEach((fn) => fn(true));
  });
}

export function onInstallAvailable(fn) {
  listeners.add(fn);
  fn(Boolean(deferredInstall));
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  const choice = await deferredInstall.userChoice;
  deferredInstall = null;
  listeners.forEach((fn) => fn(false));
  return choice.outcome === 'accepted';
}

export { isIos, isStandalone };
