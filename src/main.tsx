import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { installPrompt } from './pwa/installPrompt';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import './styles/index.css';

// Chromium may offer its install prompt before Settings opens, so catch it from the start.
installPrompt.listen(window);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD) {
  registerServiceWorker();
}
