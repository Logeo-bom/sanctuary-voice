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

  // Utterance accumulation state to ensure word-for-word complete sentences
  private accumulatedWords: string[] = [];
  private currentSpeakerNum = 0;
  private flushTimer: number | null = null;

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

  public async connect(): Promise<void> {
    // 1. Fetch short-lived JWT token via our serverless grant endpoint to avoid browser subprotocol rejections
    let accessToken = this.apiKey;
    let authProtocol = 'token'; // 'token' for master API key, 'bearer' for JWT access_token
    try {
      const tokenRes = await fetch('/api/deepgram-token', {
        method: 'POST',
        headers: {
          'x-deepgram-key': this.apiKey,
        },
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData?.access_token) {
          accessToken = tokenData.access_token;
          authProtocol = 'bearer';
        }
      }
    } catch {
      // Fallback to direct key if token endpoint is unreachable
    }

    return new Promise((resolve, reject) => {
      try {
        // If specific language is chosen (e.g. 'ko', 'pt', 'en'), pin directly to it.
        // If Auto-Detect is chosen, use nova-3 with language=multi
        const isAuto = !this.sourceLang || this.sourceLang === 'auto';
        const modelName = isAuto ? 'nova-3' : 'nova-2';
        const langParam = isAuto ? '&language=multi' : `&language=${encodeURIComponent(this.sourceLang)}`;

        // Deepgram live WebSocket URL
        // Endpointing=300ms triggers speech_final on natural speaker pauses.
        const wsUrl = `wss://api.deepgram.com/v1/listen?model=${modelName}&diarize=true&punctuate=true&smart_format=true&interim_results=true&endpointing=300${langParam}`;

        this.socket = new WebSocket(wsUrl, [authProtocol, accessToken]);

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
            const speechFinal = Boolean(data?.speech_final);

            if (transcript && transcript.length > 0 && isFinal) {
              // Determine speaker
              if (alt.words && alt.words.length > 0 && typeof alt.words[0].speaker === 'number') {
                const speaker = alt.words[0].speaker;
                if (this.accumulatedWords.length > 0 && speaker !== this.currentSpeakerNum) {
                  await this.flushAccumulatedSentence();
                }
                this.currentSpeakerNum = speaker;
              }

              // Append finalized phrase slice to accumulator
              this.accumulatedWords.push(transcript);

              const currentAccumulated = this.accumulatedWords.join(' ').trim();
              // Check if sentence naturally ended with punctuation (period, question mark, exclamation, or Korean verbal ending 다/요)
              const hasTerminalPunctuation = /[.?!]$/.test(transcript) || /[다요][.?!]?$/.test(transcript);
              const totalWordsCount = currentAccumulated.split(/\s+/).length;

              // If speaker reached natural sentence boundary OR speech_final OR reached a substantial thought (15+ words), flush
              if (speechFinal || (hasTerminalPunctuation && totalWordsCount >= 4) || totalWordsCount >= 18) {
                await this.flushAccumulatedSentence();
              } else {
                // Safety timer: flush after 2.8 seconds of silence to prevent premature sentence cutting
                this.resetSafetyFlushTimer();
              }
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
          void this.flushAccumulatedSentence();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private resetSafetyFlushTimer(): void {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
    }
    this.flushTimer = window.setTimeout(() => {
      void this.flushAccumulatedSentence();
    }, 2800);
  }

  private async flushAccumulatedSentence(): Promise<void> {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.accumulatedWords.length === 0) return;

    // Join all accumulated chunks into one complete, word-for-word sentence
    const fullOriginalSentence = this.accumulatedWords.join(' ').trim();
    const speakerNum = this.currentSpeakerNum;
    this.accumulatedWords = [];

    if (!fullOriginalSentence) return;

    try {
      // Direct, word-for-word translation of the complete sentence
      const { translatedText, detectedLang } = await this.translateAndDetect(
        fullOriginalSentence,
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
        originalText: fullOriginalSentence,
        translatedText,
        isFinal: true,
        latencyMs: 250,
      });
    } catch {
      // Fallback
    }
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
      // 1. Try our own serverless proxy endpoint first to bypass browser CORS restrictions
      const serverlessRes = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sl: sourceLang,
          tl: targetLang,
        }),
      });

      if (serverlessRes.ok) {
        const data = await serverlessRes.json();
        if (data?.translatedText) {
          return {
            translatedText: data.translatedText,
            detectedLang: data.detectedLang || (sourceLang !== 'auto' ? sourceLang : 'en'),
          };
        }
      }
    } catch {
      // Fallback below
    }

    try {
      // 2. Direct browser fallback
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
