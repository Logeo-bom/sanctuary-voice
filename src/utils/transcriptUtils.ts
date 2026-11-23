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

  if (normLast && normIncoming.length > normLast.length && normIncoming.startsWith(normLast)) {
    return 'replace';
  }

  return 'append';
}
