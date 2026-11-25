/**
 * Languages that Deepgram (Nova-3/Nova-2) does not support at all, routed instead through Google
 * Cloud Speech-to-Text's Chirp 2 model (see `api/chirp-transcribe.ts` + `googleChirpTranslator.ts`).
 * Chirp 2 was specifically verified to officially support Cebuano/Bisaya (`ceb-PH`) - the language
 * requested for the local church service test - unlike Deepgram, Gemini, or the on-device
 * Whisper/NLLB fallback, none of which have a dedicated acoustic model for it.
 *
 * This map is intentionally small and easy to extend: add a new entry here (app language code ->
 * Chirp 2 BCP-47 language code) whenever another Deepgram-unsupported, Chirp-2-supported language
 * is needed (e.g. other Philippine/Visayan regional languages), without touching any routing logic
 * in `App.tsx` or `deepgramLiveWebSocket.ts`.
 */
export const CHIRP_LANGUAGE_MAP: Record<string, string> = {
  ceb: 'ceb-PH',
};

/**
 * Returns true if the given app language code should be routed through the Chirp 2 provider
 * instead of Deepgram/Gemini, because Deepgram has no acoustic model for it at all.
 */
export function isChirpOnlyLanguage(sourceLang: string): boolean {
  const baseCode = (sourceLang || '').toLowerCase().trim().split('-')[0];
  return Object.prototype.hasOwnProperty.call(CHIRP_LANGUAGE_MAP, baseCode);
}

/**
 * Maps an app-internal language code (e.g. 'ceb') to the BCP-47 code Chirp 2 expects (e.g. 'ceb-PH').
 * Falls back to the input code itself if no explicit mapping exists.
 */
export function getChirpLanguageCode(sourceLang: string): string {
  const baseCode = (sourceLang || '').toLowerCase().trim().split('-')[0];
  return CHIRP_LANGUAGE_MAP[baseCode] || sourceLang;
}
