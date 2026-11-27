import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOfflineModelStatus,
  markOfflineModelDownloading,
  markOfflineModelError,
  markOfflineModelReady,
  reportOfflineModelProgress,
  resetOfflineReadinessForTests,
  subscribeOfflineReadiness,
} from '../offlineReadiness';

const MODEL = 'Xenova/whisper-tiny';

describe('offline readiness store', () => {
  beforeEach(() => {
    resetOfflineReadinessForTests();
  });

  it('reports a model as missing until it has been downloaded', () => {
    expect(getOfflineModelStatus(MODEL)).toEqual({ state: 'missing', progress: 0 });
  });

  it('aggregates download progress across the files of a model', () => {
    markOfflineModelDownloading(MODEL);
    reportOfflineModelProgress(MODEL, { status: 'progress', file: 'encoder.onnx', loaded: 50, total: 100 });
    expect(getOfflineModelStatus(MODEL)).toEqual({ state: 'downloading', progress: 50 });

    reportOfflineModelProgress(MODEL, { status: 'progress', file: 'decoder.onnx', loaded: 0, total: 100 });
    expect(getOfflineModelStatus(MODEL).progress).toBe(25);
  });

  it('never shows 100% before the model has actually loaded', () => {
    markOfflineModelDownloading(MODEL);
    reportOfflineModelProgress(MODEL, { status: 'progress', file: 'encoder.onnx', loaded: 100, total: 100 });
    expect(getOfflineModelStatus(MODEL)).toEqual({ state: 'downloading', progress: 99 });
  });

  it('ignores malformed progress events', () => {
    markOfflineModelDownloading(MODEL);
    reportOfflineModelProgress(MODEL, { status: 'progress', file: 'encoder.onnx', loaded: 10, total: 0 });
    reportOfflineModelProgress(MODEL, { status: 'initiate', file: 'encoder.onnx' });
    expect(getOfflineModelStatus(MODEL)).toEqual({ state: 'downloading', progress: 0 });
  });

  it('remembers a downloaded model across app restarts', () => {
    markOfflineModelDownloading(MODEL);
    markOfflineModelReady(MODEL);
    expect(getOfflineModelStatus(MODEL).state).toBe('ready');

    const stored = JSON.parse(localStorage.getItem('sanctuary_offline_ready_models') || '[]');
    expect(stored).toEqual([MODEL]);
  });

  it('keeps a downloaded model shown as ready when it is re-opened from cache', () => {
    markOfflineModelReady(MODEL);
    markOfflineModelDownloading(MODEL);
    expect(getOfflineModelStatus(MODEL).state).toBe('ready');
  });

  it('records a failed download without marking the model as ready', () => {
    markOfflineModelDownloading(MODEL);
    markOfflineModelError(MODEL, new Error('network down'));
    expect(getOfflineModelStatus(MODEL)).toEqual({ state: 'error', progress: 0, error: 'network down' });
    expect(localStorage.getItem('sanctuary_offline_ready_models')).toBeNull();
  });

  it('notifies subscribers on changes until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOfflineReadiness(listener);
    markOfflineModelDownloading(MODEL);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    markOfflineModelReady(MODEL);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
