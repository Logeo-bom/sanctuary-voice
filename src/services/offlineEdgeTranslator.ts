import { SUPPORTED_LANGUAGES } from '../constants/languages';
import {
  type ModelProgressEvent,
  markOfflineModelDownloading,
  markOfflineModelError,
  markOfflineModelReady,
  removeOfflineModelFiles,
  reportOfflineModelProgress,
} from './offlineReadiness';

export interface OfflineTranscriptEvent {
  originalText: string;
  translatedText: string;
  sourceLanguageCode: string;
  sourceLanguageName: string;
  isOffline: boolean;
  latencyMs: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

// Built-in foundational offline vocabulary lexicon across sermon languages
const OFFLINE_DICTIONARY: Record<string, Record<string, string>> = {
  // Korean to English
  ko_en: {
    '하나님': 'God',
    '예수님': 'Jesus',
    '예수 그리스도': 'Jesus Christ',
    '성령님': 'Holy Spirit',
    '은혜': 'grace',
    '구원': 'salvation',
    '기도': 'prayer',
    '할렐루야': 'Hallelujah',
    '아멘': 'Amen',
    '말씀': 'Word',
    '믿음': 'faith',
    '부활': 'resurrection',
    '십자가': 'cross',
    '복음': 'Gospel',
    '찬양': 'praise',
    '천국': 'heaven',
    '성경': 'Bible',
    '주님': 'Lord',
    '사랑': 'love',
    '평안': 'peace',
  },
  // Portuguese to English
  pt_en: {
    'deus': 'God',
    'jesus': 'Jesus',
    'cristo': 'Christ',
    'espírito santo': 'Holy Spirit',
    'senhor': 'Lord',
    'graça': 'grace',
    'salvação': 'salvation',
    'oração': 'prayer',
    'aleluia': 'Hallelujah',
    'amém': 'Amen',
    'palavra': 'Word',
    'fé': 'faith',
    'ressurreição': 'resurrection',
    'cruz': 'cross',
    'evangelho': 'Gospel',
    'adoração': 'worship',
    'céu': 'heaven',
    'bíblia': 'Bible',
    'amor': 'love',
    'paz': 'peace',
  },
  // Spanish to English
  es_en: {
    'dios': 'God',
    'jesús': 'Jesus',
    'cristo': 'Christ',
    'espíritu santo': 'Holy Spirit',
    'señor': 'Lord',
    'gracia': 'grace',
    'salvación': 'salvation',
    'oración': 'prayer',
    'aleluya': 'Hallelujah',
    'amén': 'Amen',
    'palabra': 'Word',
    'fe': 'faith',
    'resurrección': 'resurrection',
    'cruz': 'cross',
    'evangelio': 'Gospel',
    'adoración': 'worship',
    'cielo': 'heaven',
    'biblia': 'Bible',
    'amor': 'love',
    'paz': 'peace',
  },
};

// GoGospelNow/DilMesh-inspired on-device translation quality upgrade: NLLB-200 (distilled 600M)
// is a free, open-weights, 200-language neural machine translation model that runs entirely in the
// browser via transformers.js (WASM), giving meaningfully better offline translation quality than
// the small hardcoded theological lexicon above, without requiring any cloud API or local Ollama
// install. It is loaded lazily and on request from the Offline Ready panel or offline fallback, so
// the operator controls whether this large model is stored on the device.
export const NLLB_MODEL_ID = 'Xenova/nllb-200-distilled-600M';

// Minimal mapping from our app's ISO language codes to NLLB's FLORES-200 codes, covering the
// languages already supported by SUPPORTED_LANGUAGES. Unmapped codes fall back to the lexicon.
const NLLB_LANG_CODES: Record<string, string> = {
  en: 'eng_Latn',
  es: 'spa_Latn',
  pt: 'por_Latn',
  ko: 'kor_Hang',
  fr: 'fra_Latn',
  de: 'deu_Latn',
  it: 'ita_Latn',
  ja: 'jpn_Jpan',
  zh: 'zho_Hans',
  ru: 'rus_Cyrl',
  ar: 'arb_Arab',
  tl: 'tgl_Latn',
  no: 'nob_Latn',
  sv: 'swe_Latn',
  nl: 'nld_Latn',
};

interface NllbTranslationResult {
  translation_text: string;
}

type NllbTranslator = (
  text: string,
  options?: Record<string, unknown>
) => Promise<NllbTranslationResult | NllbTranslationResult[]>;

let nllbPipelinePromise: Promise<NllbTranslator> | null = null;

async function getNllbPipeline(): Promise<NllbTranslator> {
  if (!nllbPipelinePromise) {
    nllbPipelinePromise = (async () => {
      markOfflineModelDownloading(NLLB_MODEL_ID);
      try {
        const transformersModuleUrl = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transformers: any = await import(/* @vite-ignore */ transformersModuleUrl);
        transformers.env.allowLocalModels = false;
        const translator = (await transformers.pipeline('translation', NLLB_MODEL_ID, {
          quantized: true,
          progress_callback: (event: ModelProgressEvent) => reportOfflineModelProgress(NLLB_MODEL_ID, event),
        })) as NllbTranslator;
        markOfflineModelReady(NLLB_MODEL_ID);
        return translator;
      } catch (err) {
        // Drop the failed promise so a later attempt can retry instead of reusing the rejection.
        nllbPipelinePromise = null;
        markOfflineModelError(NLLB_MODEL_ID, err);
        throw err;
      }
    })();
  }
  return nllbPipelinePromise;
}

/**
 * Loads the on-device NLLB-200 translation model. The app uses this to warm a model only after the
 * readiness store confirms it was already downloaded; explicit downloads are initiated by the
 * Offline Ready panel. Safe to call repeatedly; no-op once loaded or already loading. Never throws.
 */
export function preloadNllbModel(): void {
  void getNllbPipeline().catch((err) => {
    console.warn('[OfflineEdgeTranslator] Eager NLLB-200 model pre-cache failed (will retry on demand):', err);
  });
}

/**
 * Same as `preloadNllbModel`, but returns a promise the "Offline Ready" panel can await. Rejects if
 * the download fails; progress is reported through `offlineReadiness`.
 */
export async function downloadNllbModel(): Promise<void> {
  await getNllbPipeline();
}

/** Releases the NLLB pipeline and removes its cached model files from this device. */
export async function removeNllbModel(): Promise<void> {
  const pipelinePromise = nllbPipelinePromise;
  nllbPipelinePromise = null;

  if (pipelinePromise) {
    try {
      const translator = await pipelinePromise;
      const disposable = translator as NllbTranslator & { dispose?: () => void | Promise<void> };
      await disposable.dispose?.();
    } catch {}
  }

  await removeOfflineModelFiles(NLLB_MODEL_ID);
}

/** Whether on-device NLLB translation covers this language (otherwise the small lexicon is used). */
export function isNllbLanguageSupported(langCode: string): boolean {
  return !!NLLB_LANG_CODES[(langCode || '').toLowerCase().split('-')[0]];
}

export class OfflineEdgeTranslator {
  private recognition: SpeechRecognitionInstance | null = null;
  private isRunning = false;
  private sourceLangCode = 'en';
  private targetLangCode = 'en';
  private onSegment: (ev: OfflineTranscriptEvent) => void;

  constructor(
    sourceLangCode: string,
    targetLangCode: string,
    onSegment: (ev: OfflineTranscriptEvent) => void
  ) {
    this.sourceLangCode = sourceLangCode;
    this.targetLangCode = targetLangCode;
    this.onSegment = onSegment;
  }

  public static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as Record<string, unknown>;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  public setLanguages(sourceLangCode: string, targetLangCode: string): void {
    this.sourceLangCode = sourceLangCode;
    this.targetLangCode = targetLangCode;
    if (this.recognition && this.isRunning) {
      const srcMeta = SUPPORTED_LANGUAGES.find(
        (l) => l.code === (sourceLangCode === 'auto' ? 'en' : sourceLangCode)
      );
      this.recognition.lang = srcMeta?.bcp47 || 'en-US';
    }
  }

  public start(): boolean {
    if (!OfflineEdgeTranslator.isSupported()) return false;
    if (this.isRunning) return true;

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRec) return false;

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = false;
    const srcMeta = SUPPORTED_LANGUAGES.find(
      (l) => l.code === (this.sourceLangCode === 'auto' ? 'en' : this.sourceLangCode)
    );
    rec.lang = srcMeta?.bcp47 || 'en-US';

    rec.onresult = (event: SpeechRecognitionResultEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal && res[0]?.transcript) {
          const rawText = res[0].transcript.trim();
          if (rawText.length > 0) {
            const t0 = performance.now();
            void this.translateBestEffort(rawText, this.sourceLangCode, this.targetLangCode).then((translated) => {
              const srcName =
                SUPPORTED_LANGUAGES.find((l) => l.code === this.sourceLangCode)?.name || this.sourceLangCode.toUpperCase();

              this.onSegment({
                originalText: rawText,
                translatedText: translated,
                sourceLanguageCode: this.sourceLangCode,
                sourceLanguageName: srcName,
                isOffline: true,
                latencyMs: Math.round(performance.now() - t0),
              });
            });
          }
        }
      }
    };

    rec.onend = () => {
      // Automatic edge-loop restart if still running offline
      if (this.isRunning) {
        try {
          rec.start();
        } catch {
          // Ignore
        }
      }
    };

    rec.onerror = () => {
      // Auto-recovers on next pause
    };

    try {
      rec.start();
      this.recognition = rec;
      this.isRunning = true;
      return true;
    } catch {
      return false;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
  }

  public translateOffline(text: string, srcLang: string, tgtLang: string): string {
    const src = srcLang.toLowerCase().split('-')[0];
    const tgt = tgtLang.toLowerCase().split('-')[0];
    if (src === tgt) return text;

    const dictKey = `${src}_${tgt}`;
    const dict = OFFLINE_DICTIONARY[dictKey];
    if (!dict) {
      return text;
    }

    // Replace known theological terms and words with fast offline lexicon lookup
    let output = text;
    for (const [k, v] of Object.entries(dict)) {
      const regex = new RegExp(k, 'gi');
      output = output.replace(regex, v);
    }
    return output;
  }

  /**
   * On-device NLLB-200 translation upgrade (GoGospelNow/DilMesh-inspired). Tries the neural model
   * first for noticeably better offline translation quality than the lexicon; if the model fails to
   * load (e.g. the very first offline use with zero connectivity to fetch the weights) or the
   * language pair isn't mapped to a FLORES-200 code, it falls back to the fast lexicon-based
   * `translateOffline` so captions never stop flowing.
   */
  public async translateBestEffort(text: string, srcLang: string, tgtLang: string): Promise<string> {
    const src = srcLang.toLowerCase().split('-')[0];
    const tgt = tgtLang.toLowerCase().split('-')[0];
    if (src === tgt) return text;

    const nllbSrc = NLLB_LANG_CODES[src];
    const nllbTgt = NLLB_LANG_CODES[tgt];
    if (nllbSrc && nllbTgt) {
      try {
        const translator = await getNllbPipeline();
        const result = await translator(text, { src_lang: nllbSrc, tgt_lang: nllbTgt });
        const translated = Array.isArray(result) ? result[0]?.translation_text : result?.translation_text;
        if (translated && translated.trim().length > 0) {
          return translated.trim();
        }
      } catch (err) {
        console.warn('[OfflineEdgeTranslator] NLLB-200 neural translation failed, using lexicon fallback:', err);
      }
    }

    return this.translateOffline(text, srcLang, tgtLang);
  }
}
