export interface WerScore {
  wer: number; // 0.0 to 1.0 (or higher if insertions > wordCount)
  werPercentage: string; // e.g. "4.2%"
  substitutions: number;
  deletions: number;
  insertions: number;
  hits: number;
  wordCount: number;
}

export interface CerScore {
  cer: number;
  cerPercentage: string;
  charCount: number;
}

/**
 * Normalizes text for speech recognition benchmarking by removing
 * non-semantic punctuation, collapsing whitespace, and standardizing casing.
 */
export function normalizeTranscript(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\.,\?!:;"'\(\)\[\]\{\}—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates Word Error Rate (WER) using Levenshtein distance matrix.
 * WER = (Substitutions + Deletions + Insertions) / Reference Word Count
 */
export function calculateWer(reference: string, hypothesis: string): WerScore {
  const normRef = normalizeTranscript(reference);
  const normHyp = normalizeTranscript(hypothesis);

  const refWords = normRef.length > 0 ? normRef.split(' ') : [];
  const hypWords = normHyp.length > 0 ? normHyp.split(' ') : [];

  const n = refWords.length;
  const m = hypWords.length;

  if (n === 0) {
    return {
      wer: m === 0 ? 0 : 1.0,
      werPercentage: m === 0 ? '0.0%' : '100.0%',
      substitutions: 0,
      deletions: 0,
      insertions: m,
      hits: 0,
      wordCount: 0,
    };
  }

  // Cost matrix: dp[i][j] stores minimum edits between refWords[0..i-1] and hypWords[0..j-1]
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (refWords[i - 1] === hypWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        const substitution = dp[i - 1][j - 1] + 1;
        const deletion = dp[i - 1][j] + 1;
        const insertion = dp[i][j - 1] + 1;
        dp[i][j] = Math.min(substitution, deletion, insertion);
      }
    }
  }

  // Backtrack to count exact substitutions, deletions, and insertions
  let i = n;
  let j = m;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let hits = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && refWords[i - 1] === hypWords[j - 1]) {
      hits++;
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      substitutions++;
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      deletions++;
      i--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      insertions++;
      j--;
    } else if (i > 0) {
      deletions++;
      i--;
    } else {
      insertions++;
      j--;
    }
  }

  const rawWer = (substitutions + deletions + insertions) / n;
  const wer = Math.round(rawWer * 10000) / 10000;
  const werPercentage = `${(wer * 100).toFixed(1)}%`;

  return {
    wer,
    werPercentage,
    substitutions,
    deletions,
    insertions,
    hits,
    wordCount: n,
  };
}

/**
 * Calculates Character Error Rate (CER) using Levenshtein distance on normalized character streams.
 */
export function calculateCer(reference: string, hypothesis: string): CerScore {
  const normRef = normalizeTranscript(reference).replace(/\s+/g, '');
  const normHyp = normalizeTranscript(hypothesis).replace(/\s+/g, '');

  const n = normRef.length;
  const m = normHyp.length;

  if (n === 0) {
    return {
      cer: m === 0 ? 0 : 1.0,
      cerPercentage: m === 0 ? '0.0%' : '100.0%',
      charCount: 0,
    };
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (normRef[i - 1] === normHyp[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // sub
          dp[i - 1][j] + 1,     // del
          dp[i][j - 1] + 1      // ins
        );
      }
    }
  }

  const rawCer = dp[n][m] / n;
  const cer = Math.round(rawCer * 10000) / 10000;
  const cerPercentage = `${(cer * 100).toFixed(1)}%`;

  return {
    cer,
    cerPercentage,
    charCount: n,
  };
}
