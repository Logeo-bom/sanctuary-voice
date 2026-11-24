import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserLiveSpeechFallback } from '../../services/browserLiveFallback';

describe('BrowserLiveSpeechFallback Service', () => {
  let mockSpeechRecognitionInstance: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      onresult: any = null;
      onerror: any = null;
      onend: any = null;
      constructor() {
        mockSpeechRecognitionInstance = this;
      }
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;
  });

  it('detects browser support properly', () => {
    expect(BrowserLiveSpeechFallback.isSupported()).toBe(true);
  });

  it('starts recognition with correct language parameters and lifecycle', () => {
    const onSegment = vi.fn();
    const fallback = new BrowserLiveSpeechFallback('es', 'en', onSegment);

    const started = fallback.start();
    expect(started).toBe(true);
    expect(mockSpeechRecognitionInstance.start).toHaveBeenCalled();
    expect(mockSpeechRecognitionInstance.continuous).toBe(true);
    expect(mockSpeechRecognitionInstance.lang).toBe('es-ES');
  });

  it('handles speech recognition result event and translates speech', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[['Hello sanctuary brothers and sisters.']]],
    });

    const onSegment = vi.fn();
    const fallback = new BrowserLiveSpeechFallback('es', 'en', onSegment);
    fallback.start();

    // Trigger mock result
    const mockEvent = {
      resultIndex: 0,
      results: [
        {
          isFinal: true,
          length: 1,
          0: {
            transcript: 'Hola hermanos y hermanas del santuario.',
            confidence: 0.95,
          },
        },
      ],
    };

    mockSpeechRecognitionInstance.onresult(mockEvent);

    await vi.waitFor(() => {
      expect(onSegment).toHaveBeenCalled();
    });

    const segment = onSegment.mock.calls[0][0];
    expect(segment.originalText).toBe('Hola hermanos y hermanas del santuario.');
    expect(segment.translatedText).toBe('Hello sanctuary brothers and sisters.');
    expect(segment.sourceLanguageCode).toBe('es');
  });

  it('stops recognition cleanly when requested', () => {
    const fallback = new BrowserLiveSpeechFallback('en', 'es', vi.fn());
    fallback.start();
    fallback.stop();

    expect(mockSpeechRecognitionInstance.stop).toHaveBeenCalled();
  });
});
