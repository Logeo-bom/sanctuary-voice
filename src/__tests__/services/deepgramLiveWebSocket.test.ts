import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepgramLiveWebSocket } from '../../services/deepgramLiveWebSocket';
import { MockWebSocket } from '../mocks/mockWebSocket';
import { createMockDeepgramMessage } from '../mocks/mockTranslationStream';

describe('DeepgramLiveWebSocket Service', () => {
  beforeEach(() => {
    MockWebSocket.clearInstances();
    (window as any).WebSocket = MockWebSocket;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches serverless token and connects websocket with optimal audio params', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'temp-deepgram-token-xyz' }),
    });

    const onSegment = vi.fn();
    const onError = vi.fn();
    const onInterim = vi.fn();

    const client = new DeepgramLiveWebSocket(
      '',
      'auto',
      'es',
      onSegment,
      onError,
      onInterim,
      ['Sanctuary', 'Praise']
    );

    await client.connect();

    expect(MockWebSocket.instances.length).toBe(1);
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toContain('wss://api.deepgram.com/v1/listen');
    expect(ws.url).toContain('encoding=linear16');
    expect(ws.url).toContain('sample_rate=16000');
    expect(ws.url).toContain('diarize=true');
    expect(ws.url).toContain('keyterm=Sanctuary');
  });

  it('handles incoming final transcription messages and invokes translation', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('deepgram-token')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ key: 'mock-token' }),
        });
      }
      if (url.includes('/api/translate') || url.includes('translate.googleapis.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            translatedText: 'Bendito sea Dios en su santuario.',
            provider: 'deepl',
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const onSegment = vi.fn();
    const onError = vi.fn();

    const client = new DeepgramLiveWebSocket(
      'test-key',
      'en',
      'es',
      onSegment,
      onError
    );

    await client.connect();
    const ws = MockWebSocket.instances[0];

    // Simulate final utterance message from Deepgram
    const dgPayload = createMockDeepgramMessage('Blessed be God in His sanctuary.', 0, true, true);
    ws.simulateMessage(dgPayload);

    // Wait for async translation
    await vi.waitFor(() => {
      expect(onSegment).toHaveBeenCalled();
    });

    const emitted = onSegment.mock.calls[0][0];
    expect(emitted.originalText).toContain('Blessed be God in His sanctuary.');
    expect(emitted.translatedText).toBe('Bendito sea Dios en su santuario.');
    expect(emitted.speakerId).toBe('speaker_1');
  });

  it('streams 16kHz PCM audio buffers through open websocket', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'mock-key' }),
    });

    const client = new DeepgramLiveWebSocket('test-key', 'en', 'es', vi.fn(), vi.fn());
    await client.connect();
    const ws = MockWebSocket.instances[0];

    const pcmBuffer = new Int16Array([100, 200, -300, -400, 0, 500]).buffer;
    client.sendAudio(pcmBuffer);

    expect(ws.sentData.length).toBe(1);
    expect(ws.sentData[0]).toBe(pcmBuffer);
  });

  it('handles websocket errors gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'mock-key' }),
    });

    const onError = vi.fn();
    const client = new DeepgramLiveWebSocket('test-key', 'en', 'es', vi.fn(), onError);
    await client.connect();
    const ws = MockWebSocket.instances[0];

    ws.simulateError();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Deepgram WebSocket connection failed'));
  });
});
