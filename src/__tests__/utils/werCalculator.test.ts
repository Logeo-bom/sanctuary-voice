import { describe, it, expect } from 'vitest';
import { calculateWer, calculateCer, normalizeTranscript } from '../../utils/werCalculator';

describe('WER and CER Calculator Utility', () => {
  it('normalizes transcripts by standardizing casing and stripping non-semantic punctuation', () => {
    const raw = '  "Grace and Peace," — multiplied unto you! (Romans 1:7)...  ';
    const norm = normalizeTranscript(raw);
    expect(norm).toBe('grace and peace multiplied unto you romans 1 7');
  });

  it('computes 0% WER and 0% CER on identical transcripts', () => {
    const ref = 'Blessed be the Lord God of Israel from everlasting to everlasting';
    const hyp = 'Blessed be the Lord God of Israel from everlasting to everlasting';

    const werResult = calculateWer(ref, hyp);
    expect(werResult.wer).toBe(0);
    expect(werResult.werPercentage).toBe('0.0%');
    expect(werResult.substitutions).toBe(0);
    expect(werResult.deletions).toBe(0);
    expect(werResult.insertions).toBe(0);
    expect(werResult.hits).toBe(11);

    const cerResult = calculateCer(ref, hyp);
    expect(cerResult.cer).toBe(0);
    expect(cerResult.cerPercentage).toBe('0.0%');
  });

  it('accurately identifies word substitutions, deletions, and insertions', () => {
    const ref = 'the quick brown fox jumps over the lazy dog';
    // Changed "brown" -> "red" (1 sub), deleted "fox" (1 del), inserted "very" (1 ins)
    const hyp = 'the quick red jumps over the very lazy dog';

    const werResult = calculateWer(ref, hyp);
    expect(werResult.wordCount).toBe(9);
    expect(werResult.substitutions).toBe(1);
    expect(werResult.deletions).toBe(1);
    expect(werResult.insertions).toBe(1);
    expect(werResult.wer).toBeCloseTo(3 / 9, 2);
  });

  it('handles edge cases like empty reference or empty hypothesis', () => {
    expect(calculateWer('', '').wer).toBe(0);
    expect(calculateWer('some words', '').wer).toBe(1.0);
    expect(calculateWer('', 'extra words').wer).toBe(1.0);
  });
});
