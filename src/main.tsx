import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Installed home-screen PWAs are usually resumed from a suspended state rather than truly
// reloaded, so the default "a new service worker activated in the background" flow never gets a
// chance to actually swap in the new JS bundle for the page that's already open. Force a reload as
// soon as an update is ready, and check for updates periodically since a resumed PWA may sit open
// for a long time without ever triggering the browser's own SW update check.
let swRegistration: ServiceWorkerRegistration | null = null;

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    swRegistration = registration;
    setInterval(() => registration.update(), 60 * 60 * 1000);
  },
});

// The hourly poll above only helps a session that's been open continuously -- the far more common
// mobile pattern is backgrounding the app (switch apps, lock the screen) and coming back to it
// minutes or hours later, which doesn't restart the JS or reset that timer. Checking on every
// return to the foreground catches a new build as soon as the user's actually back, instead of
// however long is left on the hourly timer (or never, if they close it again before it fires).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') swRegistration?.update();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
