import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ── PWA: auto-reload on new deploy ──
if ('serviceWorker' in navigator) {
  import('workbox-window').then(({ Workbox }) => {
    const wb = new Workbox('/sw.js');

    // When the new SW takes control, reload the page automatically
    wb.addEventListener('controlling', () => {
      window.location.reload();
    });

    wb.register();
  });
}
