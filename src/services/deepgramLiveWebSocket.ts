import { SUPPORTED_LANGUAGES } from '../constants/languages';

export interface DeepgramLiveSegment {
  speakerId: string;
  speakerLabel: string;
  sourceLanguageCode: string;
  sourceLanguageName: string;
  originalText: string;
  translatedText: string;
  isFinal: boolean;
  latencyMs: number;
}

export type OnTranscriptCallback = (segment: DeepgramLiveSegment) => void;
export type OnErrorCallback = (err: string) => void;

export class DeepgramLiveWebSocket {
  private socket: WebSocket | null = null;
  private apiKey: string;
  private sourceLang: string;
  private targetLang: string;
  private onSegment: OnTranscriptCallback;
  private onError: OnErrorCallback;

  constructor(
    apiKey: string,
    sourceLang: string,
    targetLang: string,
    onSegment: OnTranscriptCallback,
    onError: OnErrorCallback
  ) {
    this.apiKey = apiKey.trim();
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;
    this.onSegment = onSegment;
    this.onError = onError;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // If specific language is chosen (e.g. 'ko', 'pt', 'en'), pin directly to it.
        // If Auto-Detect is chosen, use nova-3 with language=multi (supports Korean, Spanish, English, etc.)
        const isAuto = !this.sourceLang || this.sourceLang === 'auto';
        const modelName = isAuto ? 'nova-3' : 'nova-2';
        const langParam = isAuto ? '&language=multi' : `&language=${encodeURIComponent(this.sourceLang)}`;

        // Deepgram live WebSocket URL
        const wsUrl = `wss://api.deepgram.com/v1/listen?model=${modelName}&diarize=true&punctuate=true&smart_format=true&interim_results=true&endpointing=500&utterance_end_ms=1000${langParam}`;

        this.socket = new WebSocket(wsUrl, ['token', this.apiKey]);

        this.socket.onopen = () => {
          resolve();
        };

        this.socket.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            const channel = data?.channel;
            const alt = channel?.alternatives?.[0];
            const transcript = alt?.transcript?.trim();
            const isFinal = Boolean(data?.is_final);

            if (transcript && transcript.length > 0 && isFinal) {
              const speakerNum = alt.words?.[0]?.speaker ?? 0;
              
              // Use translateAndDetect to auto-detect the language from the live spoken transcript
              const { translatedText, detectedLang } = await this.translateAndDetect(
                transcript,
                this.sourceLang !== 'auto' ? this.sourceLang : 'auto',
                this.targetLang
              );

              this.onSegment({
                speakerId: `speaker_${speakerNum + 1}`,
                speakerLabel:
                  speakerNum === 0
                    ? 'Pastor (Pulpit PA)'
                    : `Speaker ${speakerNum + 1} (Audience/Floor)`,
                sourceLanguageCode: detectedLang,
                sourceLanguageName:
                  SUPPORTED_LANGUAGES.find((l) => l.code === detectedLang)?.name ||
                  detectedLang.toUpperCase(),
                originalText: transcript,
                translatedText,
                isFinal,
                latencyMs: 250,
              });
            }
          } catch {
            // Ignore parse errors on ping/metadata messages
          }
        };

        this.socket.onerror = () => {
          this.onError('Deepgram WebSocket connection failed. Please check your API key.');
          reject(new Error('WebSocket connection error'));
        };

        this.socket.onclose = () => {
          // Closed
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public sendAudio(blobOrBuffer: Blob | ArrayBuffer): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(blobOrBuffer);
    }
  }

  public setLanguages(sourceLang: string, targetLang: string): void {
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;
  }

  public close(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
  }

  private async translateAndDetect(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<{ translatedText: string; detectedLang: string }> {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
        sourceLang
      )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) {
        return { translatedText: text, detectedLang: sourceLang !== 'auto' ? sourceLang : 'en' };
      }
      const data = await res.json();
      let translatedText = text;
      if (Array.isArray(data?.[0])) {
        translatedText = data[0].map((part: [string]) => part[0]).join('');
      }
      const detectedLang = typeof data?.[2] === 'string' ? data[2] : (sourceLang !== 'auto' ? sourceLang : 'en');
      return { translatedText, detectedLang };
    } catch {
      return { translatedText: text, detectedLang: sourceLang !== 'auto' ? sourceLang : 'en' };
    }
  }
}
