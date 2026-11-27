import { SUPPORTED_LANGUAGES } from '../constants/languages';
import { getChirpLanguageCode } from '../constants/chirpLanguages';
import {
  isLowConfidenceSegment,
  isInternallyGarbledSentence,
  isLikelyTtsEcho,
} from '../utils/transcriptUtils';

// Operator access code for the paid Chirp proxy. Kept in memory by default; only saved on the device
// when the operator ticks "Remember on this device" (anyone holding that device can then use Chirp).
const STORAGE_KEY_CHIRP_ACCESS_CODE = 'sanctuary_chirp_access_code';
export const CHIRP_ACCESS_CODE_REQUIRED_EVENT = 'sanctuary:chirp-access-code-required';

function loadSavedChirpAccessCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_CHIRP_ACCESS_CODE) || null;
  } catch {
    return null;
  }
}

let chirpAccessCode: string | null = loadSavedChirpAccessCode();

/** Thrown instead of prompting when Chirp needs an operator access code (missing or rejected). */
export class ChirpAccessCodeRequiredError extends Error {
  readonly invalid: boolean;
  constructor(invalid: boolean) {
    super(invalid ? 'The Chirp access code was not accepted.' : 'Enter the Chirp operator access code.');
    this.name = 'ChirpAccessCodeRequiredError';
    this.invalid = invalid;
  }
}

function requestChirpAccessCode(invalid: boolean): never {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHIRP_ACCESS_CODE_REQUIRED_EVENT, { detail: { invalid } }));
  }
  throw new ChirpAccessCodeRequiredError(invalid);
}

export function hasChirpAccessCode(): boolean {
  return !!chirpAccessCode;
}

export function isChirpAccessCodeSaved(): boolean {
  return !!loadSavedChirpAccessCode();
}

/** Sets the code for this session; `remember` also saves it on this device. */
export function setChirpAccessCode(code: string, remember: boolean): void {
  const trimmed = code.trim();
  chirpAccessCode = trimmed || null;
  try {
    if (remember && trimmed) localStorage.setItem(STORAGE_KEY_CHIRP_ACCESS_CODE, trimmed);
    else localStorage.removeItem(STORAGE_KEY_CHIRP_ACCESS_CODE);
  } catch {}
}

/** Forgets the code in memory and on this device. */
export function clearChirpAccessCode(): void {
  chirpAccessCode = null;
  try {
    localStorage.removeItem(STORAGE_KEY_CHIRP_ACCESS_CODE);
  } catch {}
}

export interface ChirpStageUtterance {
  speakerId: string;
  speakerLabel: string;
  roleHint: 'main-speaker' | 'stage-interpreter' | 'worship-leader' | 'unknown';
  sourceLanguageCode: string;
  sourceLanguageName: string;
  originalText: string;
  translatedText: string;
  confidence?: number;
}

export interface ChirpTranslationResult {
  utterances: ChirpStageUtterance[];
  latencyMs: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1] || '';
        resolve(base64);
      } else {
        reject(new Error('Failed to encode audio chunk'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Transcribes an audio chunk with Google Cloud Chirp 2 (via the `/api/chirp-transcribe` serverless
 * proxy) and translates the resulting transcript with the existing DeepL/Google Neural `/api/translate`
 * proxy. This is a REST-chunk based pipeline (like the Gemini fallback), not a live WebSocket, since
 * Chirp 2's streaming API isn't practical to drive directly from a browser. Used specifically for
 * source languages Deepgram has no acoustic model for at all (see `isChirpOnlyLanguage`), independent
 * of the Deepgram/Gemini `aiProvider` toggle.
 */
export async function transcribeAndTranslateWithChirp(params: {
  audioBlob: Blob;
  mimeType: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  speakerId?: string;
  speakerLabel?: string;
  glossaryTerms?: string[];
  recentContext?: string;
}): Promise<ChirpTranslationResult> {
  const startTime = performance.now();
  // Never block with window.prompt(): it freezes the whole page (and live captions) until answered.
  if (!chirpAccessCode) requestChirpAccessCode(false);
  const base64Audio = await blobToBase64(params.audioBlob);
  const chirpLanguageCode = getChirpLanguageCode(params.sourceLanguageCode);

  const sttRes = await fetch('/api/chirp-transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chirpAccessCode}` },
    body: JSON.stringify({
      audioBase64: base64Audio,
      languageCode: chirpLanguageCode,
      glossaryTerms: params.glossaryTerms,
    }),
  });

  if (!sttRes.ok) {
    if (sttRes.status === 401) {
      clearChirpAccessCode();
      requestChirpAccessCode(true);
    }
    const errText = await sttRes.text();
    throw new Error(`Chirp 2 transcription failed (${sttRes.status}): ${errText.slice(0, 200)}`);
  }

  const sttData = await sttRes.json();
  const transcript = ((sttData?.transcript || '') as string).trim();
  const confidence = typeof sttData?.confidence === 'number' ? sttData.confidence : undefined;

  if (!transcript) {
    return { utterances: [], latencyMs: Math.round(performance.now() - startTime) };
  }

  // 1. Confidence gate: drop low-confidence hallucinations (e.g. ambient noise misheard as words)
  if (isLowConfidenceSegment(confidence)) {
    return { utterances: [], latencyMs: Math.round(performance.now() - startTime) };
  }

  // 2. Garble & loop stutter filter: catch repetitive loops like "mga nag-aab sa mga nag-aab..."
  if (isInternallyGarbledSentence(transcript) || isLikelyTtsEcho(transcript, [])) {
    return { utterances: [], latencyMs: Math.round(performance.now() - startTime) };
  }

  // 3. Drop tiny 1-2 character non-words that produce garbage translations (e.g. "op" -> "operating room")
  const cleanedAlphaWords = transcript.replace(/[.,?!;:\"']/g, '').trim().split(/\s+/).filter(Boolean);
  if (cleanedAlphaWords.length === 1 && cleanedAlphaWords[0].length <= 2 && !/^\d+$/.test(cleanedAlphaWords[0])) {
    return { utterances: [], latencyMs: Math.round(performance.now() - startTime) };
  }

  // Reuse the existing DeepL -> Google Neural translation proxy to translate the Chirp 2 transcript,
  // rather than standing up a separate translation path just for this provider.
  let translatedText = transcript;
  try {
    const translateRes = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: transcript,
        sl: params.sourceLanguageCode,
        tl: params.targetLanguageCode,
        ...(params.recentContext ? { context: params.recentContext } : {}),
      }),
    });
    if (translateRes.ok) {
      const translateData = await translateRes.json();
      translatedText = translateData?.translatedText || transcript;
    }
  } catch {
    // Keep the original transcript as a best-effort "translation" rather than dropping the segment.
  }

  const sourceLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === params.sourceLanguageCode);

  return {
    utterances: [
      {
        speakerId: params.speakerId || 'speaker_1',
        speakerLabel: params.speakerLabel || 'Speaker 1 (Chirp 2)',
        roleHint: 'main-speaker',
        sourceLanguageCode: params.sourceLanguageCode,
        sourceLanguageName: sourceLangObj?.name || params.sourceLanguageCode,
        originalText: transcript,
        translatedText,
        confidence,
      },
    ],
    latencyMs: Math.round(performance.now() - startTime),
  };
}
