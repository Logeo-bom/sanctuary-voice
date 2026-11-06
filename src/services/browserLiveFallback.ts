import { SUPPORTED_LANGUAGES } from '../constants/languages';

export interface FallbackTranscriptEvent {
  originalText: string;
  translatedText: string;
  sourceLanguageCode: string;
  sourceLanguageName: string;
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

export class BrowserLiveSpeechFallback {
  private recognition: SpeechRecognitionInstance | null = null;
  private isRunning = false;
  private sourceLangBcp47 = 'en-US';
  private targetLangCode = 'no';
  private onSegment: (ev: FallbackTranscriptEvent) => void;

  constructor(
    sourceLangCode: string,
    targetLangCode: string,
    onSegment: (ev: FallbackTranscriptEvent) => void
  ) {
    this.setLanguages(sourceLangCode, targetLangCode);
    this.onSegment = onSegment;
  }

  public static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as Record<string, unknown>;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  public setLanguages(sourceLangCode: string, targetLangCode: string): void {
    const srcMeta = SUPPORTED_LANGUAGES.find(
      (l) => l.code === (sourceLangCode === 'auto' ? 'en' : sourceLangCode)
    );
    this.sourceLangBcp47 = srcMeta?.bcp47 || 'en-US';
    this.targetLangCode = targetLangCode;
    if (this.recognition && this.isRunning) {
      this.recognition.lang = this.sourceLangBcp47;
    }
  }

  public start(): boolean {
    if (!BrowserLiveSpeechFallback.isSupported()) return false;
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
    rec.lang = this.sourceLangBcp47;

    rec.onresult = async (event: SpeechRecognitionResultEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal && res[0]?.transcript) {
          const rawText = res[0].transcript.trim();
          if (rawText.length > 1) {
            const t0 = performance.now();
            const srcCode = this.sourceLangBcp47.split('-')[0].toLowerCase();
            const srcName =
              SUPPORTED_LANGUAGES.find((l) => l.code === srcCode)?.name || 'English';
            const translated = await this.translateTextFree(
              rawText,
              srcCode,
              this.targetLangCode
            );
            this.onSegment({
              originalText: rawText,
              translatedText: translated,
              sourceLanguageCode: srcCode,
              sourceLanguageName: srcName,
              latencyMs: Math.round(performance.now() - t0),
            });
          }
        }
      }
    };

    rec.onend = () => {
      if (this.isRunning) {
        try {
          rec.start();
        } catch {
          // Ignore rapid restart error
        }
      }
    };

    rec.onerror = () => {
      // Automatically recovers on onend
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

  private async translateTextFree(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<string> {
    if (sourceLang === targetLang) return text;
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
        sourceLang
      )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) return text;
      const data = (await res.json()) as Array<Array<[string]>>;
      if (Array.isArray(data?.[0])) {
        return data[0].map((part) => part[0]).join('');
      }
      return text;
    } catch {
      return text;
    }
  }
}

