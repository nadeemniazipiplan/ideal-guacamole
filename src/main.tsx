import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing from index.html');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Offline app shell. Registered after load so it never delays first paint, and
// skipped in development where Vite serves modules directly.
if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.VITE_SINGLE_FILE) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // An unavailable service worker only costs offline caching; the app and
      // its IndexedDB records keep working.
    });
  });
}
