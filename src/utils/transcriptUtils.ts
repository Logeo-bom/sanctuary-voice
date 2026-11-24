/**
 * Languages natively supported by Deepgram Nova-3 (superior accuracy in reverberant rooms
 * and background worship music compared to Nova-2).
 */
export const NOVA3_SUPPORTED_LANGS = new Set([
  'auto',
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'hi',
  'it',
  'ja',
  'nl',
  'ru',
]);

/**
 * Selects the optimal Deepgram acoustic model for the requested source language.
 */
export function selectDeepgramModel(sourceLang: string): 'nova-3' | 'nova-2' {
  const baseCode = (sourceLang || 'auto').toLowerCase().trim().split('-')[0];
  return NOVA3_SUPPORTED_LANGS.has(baseCode) ? 'nova-3' : 'nova-2';
}

/**
 * Sanitizes theological glossary / keyword phrases into single-word tokens
 * required by Deepgram Nova-2's `keywords` query parameter (spaces trigger HTTP 400).
 */
export function sanitizeNova2Keywords(terms: string[], maxCount = 25): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const term of terms || []) {
    const parts = (term || '').trim().split(/\s+/);
    for (const part of parts) {
      const cleaned = part.replace(/^[,.;:!?()[\]"']+|[,.;:!?()[\]"']+$/g, '').trim();
      if (cleaned.length <= 1) continue;
      const lower = cleaned.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(cleaned);
        if (result.length >= maxCount) {
          return result;
        }
      }
    }
  }

  return result;
}

/**
 * Deepgram Nova-3 returns an overall `confidence` score (0-1) per transcript alternative.
 * Garbled/stuttered audio (background noise, cross-talk, a word cut mid-syllable by segmentation)
 * tends to produce noticeably lower average confidence than clean speech, which otherwise still
 * gets faithfully translated word-for-word by DeepL/Google ("a que a é razão a é é" -> "Reason is
 * that which is reason, which is is"). Below this threshold a segment is dropped *before* it's
 * sent to translation, so the live pipeline doesn't spend a network round-trip translating text
 * the STT engine itself wasn't confident about - this is a synchronous, zero-latency filter, not
 * a "wait for more context" delay.
 */
export const MIN_SEGMENT_CONFIDENCE = 0.35;

/**
 * Decides whether a finalized segment's average STT confidence is low enough that it should be
 * skipped rather than translated. `avgConfidence` of `undefined` (Deepgram didn't report one)
 * is treated as confident, since we have no evidence to gate on.
 */
export function isLowConfidenceSegment(
  avgConfidence: number | undefined,
  threshold = MIN_SEGMENT_CONFIDENCE
): boolean {
  if (avgConfidence === undefined || Number.isNaN(avgConfidence)) return false;
  return avgConfidence < threshold;
}

/**
 * Cheap, synchronous near-duplicate / low-information fragment detector, extending the existing
 * *exact*-duplicate check (see `evaluateDuplicateSegment`'s 'skip' branch) to also catch segments
 * that are only slightly different from the immediately preceding flushed segment - e.g. a word
 * dropped/reordered mid-stutter - or very short fragments that repeat most of what was already
 * shown without adding new information. This runs purely on text already received (no network
 * call, no waiting for more audio), so it doesn't add any perceptible delay to the live stream.
 */
export function isNearDuplicateFragment(incomingText: string, previousText: string): boolean {
  const normalize = (s: string) =>
    (s || '')
      .trim()
      .toLowerCase()
      .replace(/[.,?!;:"']/g, '')
      .split(/\s+/)
      .filter(Boolean);

  const incomingWords = normalize(incomingText);
  const previousWords = normalize(previousText);

  if (incomingWords.length === 0) return true;
  if (previousWords.length === 0) return false;

  const incomingSet = new Set(incomingWords);
  const previousSet = new Set(previousWords);
  const overlap = [...incomingSet].filter((w) => previousSet.has(w)).length;
  const overlapRatio = overlap / Math.min(incomingSet.size, previousSet.size);

  // A very short fragment (<=2 words) that's already mostly contained in the previous segment adds
  // no new information for the listener - skip it instead of translating a near-empty echo.
  if (incomingWords.length <= 2 && overlapRatio >= 0.5) {
    return true;
  }

  // Near-duplicate: most words overlap with the previous segment (not an exact match, which is
  // already handled separately) and the incoming segment isn't meaningfully longer/newer.
  if (overlapRatio >= 0.75 && incomingWords.length <= previousWords.length + 1) {
    return true;
  }

  return false;
}

export type DuplicateDecision = 'append' | 'skip' | 'replace';

/**
 * Evaluates whether an incoming translation segment is a duplicate or progressive
 * expansion of the immediately preceding segment.
 */
export function evaluateDuplicateSegment(params: {
  incomingOriginal: string;
  incomingTranslated: string;
  lastOriginal: string;
  lastTranslated: string;
  timeDiffMs: number;
  windowMs?: number;
}): DuplicateDecision {
  const windowMs = params.windowMs ?? 3500;
  if (params.timeDiffMs >= windowMs) {
    return 'append';
  }

  const normalize = (s: string) =>
    (s || '').trim().toLowerCase().replace(/^[.,?!;\s]+|[.,?!;\s]+$/g, '');

  const normIncoming = normalize(params.incomingOriginal);
  const normLast = normalize(params.lastOriginal);
  const normTransIncoming = normalize(params.incomingTranslated);
  const normTransLast = normalize(params.lastTranslated);

  if (
    (normIncoming && normIncoming === normLast) ||
    (normTransIncoming && normTransIncoming === normTransLast)
  ) {
    return 'skip';
  }

  // Detect loop stutters like "O que que que" or "O código o" vs "O código código é"
  // If either text is a partial repetition or share >= 85% of words within this time window
  const inWords = normIncoming.split(/\s+/).filter(Boolean);
  const lastWords = normLast.split(/\s+/).filter(Boolean);
  if (inWords.length <= 4 && lastWords.length <= 4 && inWords.length > 0 && lastWords.length > 0) {
    const setA = new Set(inWords);
    const setB = new Set(lastWords);
    const intersect = [...setA].filter((w) => setB.has(w));
    if (intersect.length >= Math.min(setA.size, setB.size)) {
      return 'skip';
    }
  }

  if (normLast && normIncoming.length > normLast.length && normIncoming.startsWith(normLast)) {
    return 'replace';
  }

  return 'append';
}

/**
 * Detects whether an incoming transcript is an acoustic feedback echo of the app's own
 * recent TTS speaker playback or a recursive stutter loop (e.g. "O que que que", "The code code for").
 */
export function isLikelyTtsEcho(incomingText: string, recentSpokenTexts: string[]): boolean {
  const words = (incomingText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u3130-\u318f\uac00-\ud7af\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (words.length === 0) return false;

  // 1. Recursive acoustic echo stutter detection (e.g. "que que que", "code code", "said said that that's that's")
  if (words.length >= 3) {
    const uniqueWords = new Set(words);
    let consecutiveRepeats = 0;
    for (let i = 1; i < words.length; i++) {
      if (words[i] === words[i - 1]) consecutiveRepeats++;
    }
    // High repetition density: 3 words with only 1-2 unique, or consecutive identical tokens ("que que que", "code code")
    if (uniqueWords.size / words.length <= 0.6 || consecutiveRepeats >= 1) {
      return true;
    }
  }

  // 2. Direct overlap with text the app's own TTS spoke aloud in the last few seconds
  if (recentSpokenTexts && recentSpokenTexts.length > 0) {
    const spokenWordSet = new Set(
      recentSpokenTexts
        .join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9\u00c0-\u024f\u3130-\u318f\uac00-\ud7af\s]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3)
    );

    if (spokenWordSet.size > 0) {
      const meaningfulIncoming = words.filter((w) => w.length >= 3);
      if (meaningfulIncoming.length >= 2) {
        let overlapCount = 0;
        for (const w of meaningfulIncoming) {
          if (spokenWordSet.has(w)) overlapCount++;
        }
        if (overlapCount / meaningfulIncoming.length >= 0.6) {
          return true;
        }
      }
    }
  }

  return false;
}
