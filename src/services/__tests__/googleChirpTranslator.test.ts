import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transcribeAndTranslateWithChirp } from '../googleChirpTranslator';

describe('transcribeAndTranslateWithChirp glossary forwarding', () => {
  beforeEach(() => {
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('test-access-code'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('includes glossaryTerms in the POST body to /api/chirp-transcribe', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transcript: 'Buhaton ta kini', confidence: 0.9 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ translatedText: "Let's do this" }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const audioBlob = new Blob(['audio']);
    await transcribeAndTranslateWithChirp({
      audioBlob,
      mimeType: 'audio/webm',
      sourceLanguageCode: 'ceb',
      targetLanguageCode: 'en',
      glossaryTerms: ['Pastor Velasquez', 'Hallelujah'],
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/chirp-transcribe', expect.objectContaining({
      method: 'POST',
    }));
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.glossaryTerms).toEqual(['Pastor Velasquez', 'Hallelujah']);
  });

  it('omits glossaryTerms gracefully when not provided', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transcript: 'Buhaton ta kini', confidence: 0.9 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ translatedText: "Let's do this" }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const audioBlob = new Blob(['audio']);
    await transcribeAndTranslateWithChirp({
      audioBlob,
      mimeType: 'audio/webm',
      sourceLanguageCode: 'ceb',
      targetLanguageCode: 'en',
    });

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.glossaryTerms).toBeUndefined();
  });
});
