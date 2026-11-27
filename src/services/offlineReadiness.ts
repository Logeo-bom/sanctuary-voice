// Offline readiness tracking for the on-device models (Whisper speech recognition and NLLB-200
// translation). Missionary/no-internet use case: the operator needs to confirm, before travelling,
// that the models are actually downloaded on this device rather than finding out in the field.
// The model loaders in churchAudioEngine.ts and offlineEdgeTranslator.ts report into this store.

export type OfflineModelState = 'missing' | 'downloading' | 'ready' | 'error';

export interface OfflineModelStatus {
  state: OfflineModelState;
  /** Download progress, 0-100. Only meaningful while `state` is 'downloading'. */
  progress: number;
  error?: string;
}

/** Shape of the events transformers.js passes to `progress_callback`. */
export interface ModelProgressEvent {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

const STORAGE_KEY_READY_MODELS = 'sanctuary_offline_ready_models';
const TRANSFORMERS_CACHE_NAME = 'transformers-cache';
const MISSING: OfflineModelStatus = { state: 'missing', progress: 0 };

const statuses = new Map<string, OfflineModelStatus>();
const fileProgress = new Map<string, Map<string, { loaded: number; total: number }>>();
const listeners = new Set<() => void>();

function loadReadyModelIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_READY_MODELS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveReadyModelIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_READY_MODELS, JSON.stringify(ids));
  } catch {}
}

function setStatus(modelId: string, status: OfflineModelStatus): void {
  statuses.set(modelId, status);
  listeners.forEach((listener) => listener());
}

export function getOfflineModelStatus(modelId: string): OfflineModelStatus {
  const current = statuses.get(modelId);
  if (current) return current;
  return loadReadyModelIds().includes(modelId) ? { state: 'ready', progress: 100 } : MISSING;
}

export function subscribeOfflineReadiness(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markOfflineModelDownloading(modelId: string): void {
  // A model already downloaded on this device is only being re-opened from the browser cache, so
  // keep showing it as ready instead of flickering back to "downloading" on every app start.
  if (getOfflineModelStatus(modelId).state === 'ready') return;
  fileProgress.delete(modelId);
  setStatus(modelId, { state: 'downloading', progress: 0 });
}

export function reportOfflineModelProgress(modelId: string, event: ModelProgressEvent): void {
  if (getOfflineModelStatus(modelId).state !== 'downloading') return;
  if (event?.status !== 'progress' || !event.file) return;
  const loaded = Number(event.loaded);
  const total = Number(event.total);
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return;

  let files = fileProgress.get(modelId);
  if (!files) {
    files = new Map();
    fileProgress.set(modelId, files);
  }
  files.set(event.file, { loaded: Math.min(loaded, total), total });

  let loadedSum = 0;
  let totalSum = 0;
  files.forEach((entry) => {
    loadedSum += entry.loaded;
    totalSum += entry.total;
  });
  // Capped at 99: "100%" is only shown once the model has actually loaded (see markOfflineModelReady).
  const progress = Math.min(99, Math.floor((loadedSum / totalSum) * 100));
  setStatus(modelId, { state: 'downloading', progress });
}

export function markOfflineModelReady(modelId: string): void {
  fileProgress.delete(modelId);
  const ids = loadReadyModelIds();
  if (!ids.includes(modelId)) saveReadyModelIds([...ids, modelId]);
  setStatus(modelId, { state: 'ready', progress: 100 });
}

export function markOfflineModelError(modelId: string, err: unknown): void {
  fileProgress.delete(modelId);
  const message = err instanceof Error ? err.message : String(err);
  setStatus(modelId, { state: 'error', progress: 0, error: message });
}

/**
 * Cross-checks the remembered "ready" flags against the browser's Cache Storage, where
 * transformers.js keeps downloaded model files. If the browser has evicted a model (e.g. the user
 * cleared site data, or the OS reclaimed storage), the flag is dropped so the panel doesn't claim
 * a model is available offline when it isn't. No-op where Cache Storage is unavailable.
 */
export async function verifyOfflineModelCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const ids = loadReadyModelIds();
  if (ids.length === 0) return;
  try {
    if (!(await caches.has(TRANSFORMERS_CACHE_NAME))) {
      saveReadyModelIds([]);
      ids.forEach((id) => {
        if (statuses.get(id)?.state !== 'downloading') setStatus(id, MISSING);
      });
      return;
    }
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const urls = (await cache.keys()).map((request) => request.url);
    const stillCached = ids.filter((id) => urls.some((url) => url.includes(id)));
    if (stillCached.length === ids.length) return;
    saveReadyModelIds(stillCached);
    ids
      .filter((id) => !stillCached.includes(id))
      .forEach((id) => {
        if (statuses.get(id)?.state !== 'downloading') setStatus(id, MISSING);
      });
  } catch {}
}

/** Test helper: clears all in-memory and persisted readiness state. */
export function resetOfflineReadinessForTests(): void {
  statuses.clear();
  fileProgress.clear();
  listeners.clear();
  try {
    localStorage.removeItem(STORAGE_KEY_READY_MODELS);
  } catch {}
}
