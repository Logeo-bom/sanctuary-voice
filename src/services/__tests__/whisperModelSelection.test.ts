import { describe, expect, it } from 'vitest';
import { getWhisperModelIdForLanguage } from '../churchAudioEngine';

describe('getWhisperModelIdForLanguage', () => {
  it('uses the larger multilingual checkpoint for Cebuano/Bisaya', () => {
    expect(getWhisperModelIdForLanguage('ceb')).toBe('Xenova/whisper-small');
  });

  it('uses the larger multilingual checkpoint for Tagalog/Filipino', () => {
    expect(getWhisperModelIdForLanguage('tl')).toBe('Xenova/whisper-small');
  });

  it('is case/region-suffix insensitive', () => {
    expect(getWhisperModelIdForLanguage('CEB-PH')).toBe('Xenova/whisper-small');
  });

  it('falls back to the default fast model for other languages', () => {
    expect(getWhisperModelIdForLanguage('en')).toBe('Xenova/whisper-tiny');
    expect(getWhisperModelIdForLanguage('pt')).toBe('Xenova/whisper-tiny');
    expect(getWhisperModelIdForLanguage('')).toBe('Xenova/whisper-tiny');
  });
});
