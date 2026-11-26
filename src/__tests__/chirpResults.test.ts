import { describe, expect, it } from 'vitest';
import { selectChirpTranscript, buildAdaptationPhrases } from '../../api/chirp-transcribe';

describe('Chirp recognition results', () => {
  it('removes a low-confidence result without losing a valid phrase', () => {
    expect(selectChirpTranscript([
      { alternatives: [{ transcript: 'Buhaton ta kini', confidence: 0.9 }] },
      { alternatives: [{ transcript: 'unexpected sentence', confidence: 0.1 }] },
    ])).toEqual({ transcript: 'Buhaton ta kini', confidence: 0.9 });
  });

  it('preserves speech with missing confidence and retains deliberate repetition', () => {
    expect(selectChirpTranscript([
      { alternatives: [{ transcript: 'Buhaton ta kini, buhaton ta kini' }] },
      { alternatives: [{ transcript: 'Hatag aron pagahatagan', confidence: 0.8 }] },
    ])).toEqual({ transcript: 'Buhaton ta kini, buhaton ta kini Hatag aron pagahatagan', confidence: undefined });
  });

  it('returns an empty transcript when every result has low confidence', () => {
    expect(selectChirpTranscript([{ alternatives: [{ transcript: 'noise', confidence: 0.1 }] }]))
      .toEqual({ transcript: '', confidence: undefined });
  });
});

describe('Chirp speech adaptation phrase list', () => {
  it('includes the default Cebuano church terms when no custom glossary is given', () => {
    const phrases = buildAdaptationPhrases(undefined);
    expect(phrases.length).toBeGreaterThan(0);
    expect(phrases.map((p) => p.toLowerCase())).toContain('ikanapulo');
    expect(phrases.map((p) => p.toLowerCase())).toContain('panalangin');
  });

  it('merges the operator glossary with the default terms', () => {
    const phrases = buildAdaptationPhrases(['Pastor Velasquez', 'Hallelujah']);
    expect(phrases).toContain('Pastor Velasquez');
    expect(phrases).toContain('Hallelujah');
    expect(phrases.map((p) => p.toLowerCase())).toContain('ikanapulo');
  });

  it('deduplicates terms that already exist in the default list (case-insensitive)', () => {
    const before = buildAdaptationPhrases(undefined).length;
    const after = buildAdaptationPhrases(['Ikanapulo', 'ikanapulo', 'Panalangin']).length;
    expect(after).toBe(before);
  });

  it('caps the merged list at the documented maximum phrase count', () => {
    const bigGlossary = Array.from({ length: 200 }, (_, i) => `term-${i}`);
    const phrases = buildAdaptationPhrases(bigGlossary);
    expect(phrases.length).toBeLessThanOrEqual(100);
  });

  it('ignores non-string/empty entries without throwing', () => {
    const phrases = buildAdaptationPhrases(['', '   ', 'Valid Term'] as string[]);
    expect(phrases).toContain('Valid Term');
  });
});