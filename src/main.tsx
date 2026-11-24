import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { installGlobalCrashHandlers } from './services/crashTelemetry';

// Crash telemetry: catches errors outside React's render cycle (e.g. a stray async error in an
// audio/WebSocket callback) that `AppErrorBoundary` alone wouldn't see, since those don't throw
// during render. Installed once at startup for the lifetime of the tab.
installGlobalCrashHandlers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
