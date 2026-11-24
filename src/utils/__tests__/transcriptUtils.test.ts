import { describe, expect, it } from 'vitest';
import {
  evaluateDuplicateSegment,
  isLikelyTtsEcho,
  isLowConfidenceSegment,
  isNearDuplicateFragment,
  sanitizeNova2Keywords,
  selectDeepgramModel,
} from '../transcriptUtils';

describe('transcriptUtils', () => {
  it('selects nova-3 for Portuguese, English, Spanish, and Auto-Detect, and nova-2 for Korean/Norwegian', () => {
    expect(selectDeepgramModel('auto')).toBe('nova-3');
    expect(selectDeepgramModel('pt')).toBe('nova-3');
    expect(selectDeepgramModel('pt-BR')).toBe('nova-3');
    expect(selectDeepgramModel('en')).toBe('nova-3');
    expect(selectDeepgramModel('es')).toBe('nova-3');
    expect(selectDeepgramModel('ko')).toBe('nova-2');
    expect(selectDeepgramModel('no')).toBe('nova-2');
  });

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

  it('detects recursive TTS acoustic feedback loops and speaker self-echoes', () => {
    expect(
      isLikelyTtsEcho('Table said said that that\'s that\'s said that that no longer sue.', [])
    ).toBe(true);
    expect(
      isLikelyTtsEcho('Longer sued me. Me sued. Sued. Me sued.', [])
    ).toBe(true);
    expect(
      isLikelyTtsEcho('O que que que', [])
    ).toBe(true);
    expect(
      isLikelyTtsEcho('The code code for', [])
    ).toBe(true);
    expect(
      isLikelyTtsEcho('There are a few tables that no longer suit me', [
        'There are a few tables that no longer suit me.',
      ])
    ).toBe(true);
    expect(
      isLikelyTtsEcho('A Bíblia nos ensina que nós somos libertos pela palavra.', [
        'There are a few tables that no longer suit me.',
      ])
    ).toBe(false);
  });

  it('gates segments whose average Deepgram confidence is below the minimum threshold', () => {
    expect(isLowConfidenceSegment(0.2)).toBe(true);
    expect(isLowConfidenceSegment(0.34)).toBe(true);
    expect(isLowConfidenceSegment(0.35)).toBe(false);
    expect(isLowConfidenceSegment(0.9)).toBe(false);
  });

  it('treats a missing confidence score as confident (no evidence to gate on)', () => {
    expect(isLowConfidenceSegment(undefined)).toBe(false);
  });

  it('detects near-duplicate fragments that mostly overlap the previous segment', () => {
    expect(isNearDuplicateFragment('razão é que a é razão', 'razão é que a é razão a')).toBe(true);
    expect(isNearDuplicateFragment('é', 'razão é que a é razão')).toBe(true);
  });

  it('does not flag a genuinely new, longer sentence as a near-duplicate', () => {
    expect(
      isNearDuplicateFragment(
        'A Bíblia nos ensina que somos libertos pela graça de Deus.',
        'Amém.'
      )
    ).toBe(false);
  });
});
