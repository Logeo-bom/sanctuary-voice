import { Capacitor } from '@capacitor/core';

export const APP_UPDATE_READY_EVENT = 'sanctuary:app-update-ready';
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Registers the offline app-shell service worker (built from src/pwa/sw-template.js) so the web app
 * opens without internet after its first online visit. Web production builds only: the Android app
 * already ships its files inside the APK, and the Vite dev server has no sw.js.
 *
 * When a newer deploy takes over, `APP_UPDATE_READY_EVENT` fires on `window` so the UI can offer a
 * refresh. The page never reloads itself, so a live sermon isn't interrupted.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (Capacitor.isNativePlatform()) return;

  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The very first install also triggers controllerchange; only later ones are real updates.
    if (hadController) window.dispatchEvent(new Event(APP_UPDATE_READY_EVENT));
  });

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        window.setInterval(() => {
          if (navigator.onLine) void registration.update().catch(() => {});
        }, UPDATE_CHECK_INTERVAL_MS);
      })
      .catch((err) => console.warn('[ServiceWorker] Registration failed:', err));
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
