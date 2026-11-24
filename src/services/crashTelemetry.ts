// Lightweight, dependency-free crash telemetry (no Sentry/DataDog install required). Captures
// unhandled errors/promise rejections and React render errors (via AppErrorBoundary) so that field
// failures (missionaries/churches running the app unattended, far from a developer) are actually
// visible instead of silently vanishing the moment the tab reloads.
//
// Design: persist every crash to localStorage first (always works, zero network dependency), then
// make a single best-effort fire-and-forget attempt to relay it to a serverless endpoint so it's
// visible centrally too. Never throws, never blocks the UI, never retries (a crash loop must not
// turn into a network-request loop).

export interface CrashEntry {
  id: string;
  message: string;
  stack?: string;
  context: string;
  timestamp: number;
  userAgent: string;
  url: string;
}

const STORAGE_KEY_CRASH_LOG = 'sanctuary_voice_crash_log_v1';
const MAX_CRASH_ENTRIES = 25;
const CRASH_REPORT_ENDPOINT = '/api/crash-report';

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full/unavailable (e.g. private browsing) - crash logging must never itself crash.
  }
}

export function loadCrashLog(): CrashEntry[] {
  try {
    const raw = safeLocalStorageGet(STORAGE_KEY_CRASH_LOG);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearCrashLog(): void {
  safeLocalStorageSet(STORAGE_KEY_CRASH_LOG, '[]');
}

function extractMessageAndStack(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || 'Unknown error', stack: error.stack };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: 'Unserializable error' };
  }
}

/**
 * Records a crash/error to the local, persistent crash log and makes a best-effort attempt to
 * relay it to the serverless `crash-report` endpoint. Safe to call from anywhere (error boundary,
 * global window handlers, or a manual try/catch around a risky operation) - it never throws.
 */
export function recordCrash(error: unknown, context: string): CrashEntry {
  const { message, stack } = extractMessageAndStack(error);
  const entry: CrashEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    message,
    stack,
    context,
    timestamp: Date.now(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    url: typeof window !== 'undefined' ? window.location.href : 'unknown',
  };

  try {
    const existing = loadCrashLog();
    existing.push(entry);
    const trimmed = existing.slice(-MAX_CRASH_ENTRIES);
    safeLocalStorageSet(STORAGE_KEY_CRASH_LOG, JSON.stringify(trimmed));
  } catch {
    // Non-fatal: the in-memory entry is still returned/relayed below.
  }

  // Best-effort remote relay - fire and forget, swallow any failure (offline, cold start, etc.).
  // Uses `sendBeacon` when available since it survives a page unload/crash better than `fetch`.
  try {
    const payload = JSON.stringify({ entry });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(CRASH_REPORT_ENDPOINT, blob);
    } else if (typeof fetch !== 'undefined') {
      void fetch(CRASH_REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Ignore - local log already has the entry, which is the important part.
  }

  return entry;
}

/**
 * Installs global `window.onerror`/`unhandledrejection` listeners so crashes outside of React's
 * render cycle (e.g. a stray async error in an audio/WebSocket callback) are captured too, not just
 * errors caught by `AppErrorBoundary`. Returns a cleanup function. Safe to call once at app startup.
 */
export function installGlobalCrashHandlers(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleError = (event: ErrorEvent) => {
    recordCrash(event.error || event.message, 'window.onerror');
  };
  const handleRejection = (event: PromiseRejectionEvent) => {
    recordCrash(event.reason, 'unhandledrejection');
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
