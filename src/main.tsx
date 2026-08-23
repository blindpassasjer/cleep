import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Installed home-screen PWAs are usually resumed from a suspended state rather than truly
// reloaded, so the default "a new service worker activated in the background" flow never gets a
// chance to actually swap in the new JS bundle for the page that's already open. Force a reload as
// soon as an update is ready, and poll for updates periodically since a resumed PWA may sit open
// for a long time without ever triggering the browser's own SW update check.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 60 * 60 * 1000);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
