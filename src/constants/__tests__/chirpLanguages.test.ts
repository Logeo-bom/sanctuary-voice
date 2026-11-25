import { describe, expect, it } from 'vitest';
import { isChirpOnlyLanguage, getChirpLanguageCode, CHIRP_LANGUAGE_MAP } from '../chirpLanguages';

describe('chirpLanguages', () => {
  it('recognizes Cebuano/Bisaya as a Chirp-only language', () => {
    expect(isChirpOnlyLanguage('ceb')).toBe(true);
    expect(isChirpOnlyLanguage('CEB')).toBe(true);
    expect(isChirpOnlyLanguage('ceb-PH')).toBe(true);
  });

  it('does not flag Deepgram-supported languages as Chirp-only', () => {
    expect(isChirpOnlyLanguage('en')).toBe(false);
    expect(isChirpOnlyLanguage('pt')).toBe(false);
    expect(isChirpOnlyLanguage('tl')).toBe(false);
    expect(isChirpOnlyLanguage('auto')).toBe(false);
    expect(isChirpOnlyLanguage('')).toBe(false);
  });

  it('maps app language codes to the Chirp 2 BCP-47 code', () => {
    expect(getChirpLanguageCode('ceb')).toBe('ceb-PH');
  });

  it('falls back to the input code when no explicit mapping exists', () => {
    expect(getChirpLanguageCode('xx')).toBe('xx');
  });

  it('keeps the map small and intentional', () => {
    expect(CHIRP_LANGUAGE_MAP.ceb).toBe('ceb-PH');
  });
});
