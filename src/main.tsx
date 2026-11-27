import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { installGlobalCrashHandlers } from './services/crashTelemetry';
import { AppUpdateBanner } from './components/AppUpdateBanner';
import { registerServiceWorker } from './pwa/registerServiceWorker';

// Crash telemetry: catches errors outside React's render cycle (e.g. a stray async error in an
// audio/WebSocket callback) that `AppErrorBoundary` alone wouldn't see, since those don't throw
// during render. Installed once at startup for the lifetime of the tab.
installGlobalCrashHandlers();

// Offline app shell: lets the web app open with no internet after its first online visit.
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
    <AppUpdateBanner />
  </StrictMode>
);
