import { describe, expect, it } from 'vitest';
import { evaluateDuplicateSegment, sanitizeNova2Keywords } from '../transcriptUtils';

describe('transcriptUtils', () => {
  it('splits multi-word theological phrases into single Nova-2 tokens without spaces', () => {
    const sanitized = sanitizeNova2Keywords([
      'Espírito Santo',
      'Pastor Velasquez',
      'Hallelujah!',
      'a',
      'Jesus',
      'jesus',
    ]);
    expect(sanitized).toEqual(['Espírito', 'Santo', 'Pastor', 'Velasquez', 'Hallelujah', 'Jesus']);
    expect(sanitized.every((w) => !/\s/.test(w))).toBe(true);
  });

  it('respects maxCount cap for Deepgram query length safety', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Term${i}`);
    expect(sanitizeNova2Keywords(many, 25)).toHaveLength(25);
  });

  it('skips exact duplicate segments within the 3.5s window', () => {
    const decision = evaluateDuplicateSegment({
      incomingOriginal: 'Amém!',
      incomingTranslated: 'Amen!',
      lastOriginal: 'amém.',
      lastTranslated: 'Amen.',
      timeDiffMs: 1200,
    });
    expect(decision).toBe('skip');
  });

  it('appends identical short praise phrases after 3.5s has elapsed', () => {
    const decision = evaluateDuplicateSegment({
      incomingOriginal: 'Amém!',
      incomingTranslated: 'Amen!',
      lastOriginal: 'Amém!',
      lastTranslated: 'Amen!',
      timeDiffMs: 4200,
    });
    expect(decision).toBe('append');
  });

  it('replaces a short fragment when an expanded sentence starts with it', () => {
    const decision = evaluateDuplicateSegment({
      incomingOriginal: 'A Bíblia nos ensina que somos libertos.',
      incomingTranslated: 'The Bible teaches us that we are set free.',
      lastOriginal: 'A Bíblia nos ensina',
      lastTranslated: 'The Bible teaches us',
      timeDiffMs: 900,
    });
    expect(decision).toBe('replace');
  });
});
