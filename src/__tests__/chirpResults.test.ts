import { describe, expect, it } from 'vitest';
import { selectChirpTranscript } from '../../api/chirp-transcribe';

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