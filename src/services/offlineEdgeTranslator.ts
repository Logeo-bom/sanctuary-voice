import { SUPPORTED_LANGUAGES } from '../constants/languages';

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
            const translated = this.translateOffline(rawText, this.sourceLangCode, this.targetLangCode);
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
}
