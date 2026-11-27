import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHIRP_ACCESS_CODE_REQUIRED_EVENT,
  ChirpAccessCodeRequiredError,
  clearChirpAccessCode,
  hasChirpAccessCode,
  isChirpAccessCodeSaved,
  setChirpAccessCode,
  transcribeAndTranslateWithChirp,
} from '../googleChirpTranslator';

describe('transcribeAndTranslateWithChirp glossary forwarding', () => {
  beforeEach(() => {
    setChirpAccessCode('test-access-code', false);
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

describe('Chirp operator access code', () => {
  beforeEach(() => {
    clearChirpAccessCode();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearChirpAccessCode();
  });

  const call = () =>
    transcribeAndTranslateWithChirp({
      audioBlob: new Blob(['audio']),
      mimeType: 'audio/wav',
      sourceLanguageCode: 'ceb',
      targetLanguageCode: 'en',
    });

  it('never opens a blocking prompt; asks the UI for the code and sends nothing', async () => {
    const promptMock = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('prompt', promptMock);
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    window.addEventListener(CHIRP_ACCESS_CODE_REQUIRED_EVENT, listener);

    await expect(call()).rejects.toBeInstanceOf(ChirpAccessCodeRequiredError);
    expect(promptMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(CHIRP_ACCESS_CODE_REQUIRED_EVENT, listener);
  });

  it('only saves the code on the device when asked to remember it', () => {
    setChirpAccessCode('session-only', false);
    expect(hasChirpAccessCode()).toBe(true);
    expect(isChirpAccessCodeSaved()).toBe(false);

    setChirpAccessCode('remembered', true);
    expect(isChirpAccessCodeSaved()).toBe(true);

    clearChirpAccessCode();
    expect(hasChirpAccessCode()).toBe(false);
    expect(isChirpAccessCodeSaved()).toBe(false);
  });

  it('forgets a rejected code and asks again', async () => {
    setChirpAccessCode('wrong', true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'no' }));

    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(ChirpAccessCodeRequiredError);
    expect(err.invalid).toBe(true);
    expect(hasChirpAccessCode()).toBe(false);
    expect(isChirpAccessCodeSaved()).toBe(false);
  });
});
