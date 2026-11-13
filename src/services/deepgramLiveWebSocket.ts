import { SUPPORTED_LANGUAGES } from '../constants/languages';
import { getKeywordsForLanguage } from '../constants/theologyKeywords';

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
export type OnInterimCallback = (interimText: string) => void;
export type OnErrorCallback = (err: string) => void;

export class DeepgramLiveWebSocket {
  private socket: WebSocket | null = null;
  private apiKey: string;
  private sourceLang: string;
  private targetLang: string;
  private onSegment: OnTranscriptCallback;
  private onInterim?: OnInterimCallback;
  private onError: OnErrorCallback;

  // Utterance accumulation state to ensure word-for-word complete sentences
  private accumulatedWords: string[] = [];
  private currentSpeakerNum = 0;
  private flushTimer: number | null = null;
  private keepAliveTimer: number | null = null;
  private lastFlushedText = '';
  private lastFlushedAt = 0;
  private lastChunkText = '';
  private isReconnecting = false;
  private accessToken = '';

  constructor(
    apiKey: string,
    sourceLang: string,
    targetLang: string,
    onSegment: OnTranscriptCallback,
    onError: OnErrorCallback,
    onInterim?: OnInterimCallback
  ) {
    this.apiKey = apiKey.trim();
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;
    this.onSegment = onSegment;
    this.onError = onError;
    this.onInterim = onInterim;
  }

  public async connect(): Promise<void> {
    // 1. Fetch short-lived token via our serverless grant endpoint (uses process.env.DEEPGRAM_API_KEY)
    let accessToken = this.apiKey;
    let authProtocol = 'token'; // 'token' for master/temporary API key, 'bearer' for JWT access_token
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['x-deepgram-key'] = this.apiKey;
      }
      const tokenRes = await fetch('/api/deepgram-token', {
        method: 'POST',
        headers,
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData?.key) {
          accessToken = tokenData.key;
          authProtocol = 'token';
        } else if (tokenData?.access_token) {
          accessToken = tokenData.access_token;
          authProtocol = 'bearer';
        }
      }
    } catch {
      // Fallback to direct key if token endpoint is unreachable
    }

    if (!accessToken) {
      throw new Error('No Deepgram API key or temporary token available');
    }

    this.accessToken = accessToken;

    return new Promise((resolve, reject) => {
      try {
        // If specific language is chosen (e.g. 'ko', 'pt', 'en'), pin directly to it.
        // If Auto-Detect is chosen, use nova-3 with language=multi
        const isAuto = !this.sourceLang || this.sourceLang === 'auto';
        const modelName = isAuto ? 'nova-3' : 'nova-2';
        const langParam = isAuto ? '&language=multi' : `&language=${encodeURIComponent(this.sourceLang)}`;

        // Deepgram biblical keyword boosting parameters
        const boostedWords = getKeywordsForLanguage(this.sourceLang);
        const keywordParams = boostedWords.map((w) => `&keywords=${encodeURIComponent(w)}:2`).join('');

        // Deepgram live WebSocket URL
        // Endpointing=300ms triggers speech_final on natural speaker pauses.
        const wsUrl = `wss://api.deepgram.com/v1/listen?model=${modelName}&diarize=true&punctuate=true&smart_format=true&interim_results=true&endpointing=300${langParam}${keywordParams}`;

        this.socket = new WebSocket(wsUrl, [authProtocol, accessToken]);

        this.socket.onopen = () => {
          this.startKeepAlive();
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

            if (transcript && transcript.length > 0 && !isFinal) {
              this.onInterim?.(transcript);
            }

            if (transcript && transcript.length > 0 && isFinal) {
              this.onInterim?.(''); // Clear interim when finalized
              // Deduplicate consecutive identical raw chunks
              const normalizedChunk = transcript.toLowerCase().replace(/^[.,?!;\s]+|[.,?!;\s]+$/g, '');
              const prevChunk = this.lastChunkText.toLowerCase().replace(/^[.,?!;\s]+|[.,?!;\s]+$/g, '');
              if (normalizedChunk && normalizedChunk === prevChunk) {
                return;
              }
              this.lastChunkText = transcript;

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
              // Check if sentence naturally ended with terminal punctuation or Korean verbal ending
              const hasTerminalPunctuation = /[.?!]$/.test(transcript) || /[다요죠죠][.?!]?$/.test(transcript);
              const totalWordsCount = currentAccumulated.split(/\s+/).length;

              // Fast clause flush: if terminal punctuation OR speech_final OR reached a substantial thought (12+ words), flush
              if (speechFinal || (hasTerminalPunctuation && totalWordsCount >= 3) || totalWordsCount >= 14) {
                await this.flushAccumulatedSentence();
              } else {
                // Safety timer: flush after 1.8 seconds of silence to prevent lag and ensure responsive continuous streaming
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
          this.stopKeepAlive();
          void this.flushAccumulatedSentence();
          // Auto-reconnect if unexpectedly closed while still active
          if (!this.isReconnecting && this.accessToken) {
            this.attemptReconnect();
          }
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
    }, 1800);
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

    // Clean duplicate check: ignore if identical sentence was already flushed within 10 seconds
    const cleanSentence = fullOriginalSentence.toLowerCase().replace(/^[.,?!;\s]+|[.,?!;\s]+$/g, '');
    const cleanLastFlushed = this.lastFlushedText.toLowerCase().replace(/^[.,?!;\s]+|[.,?!;\s]+$/g, '');
    const now = Date.now();
    if (cleanSentence && cleanSentence === cleanLastFlushed && now - this.lastFlushedAt < 10000) {
      return;
    }

    this.lastFlushedText = fullOriginalSentence;
    this.lastFlushedAt = now;

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
    this.stopKeepAlive();
    this.accessToken = ''; // Prevent auto-reconnect on deliberate close
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = window.setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ type: 'KeepAlive' }));
        } catch {}
      }
    }, 5000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      window.clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private attemptReconnect(): void {
    if (this.isReconnecting || !this.accessToken) return;
    this.isReconnecting = true;
    window.setTimeout(() => {
      if (!this.accessToken) {
        this.isReconnecting = false;
        return;
      }
      this.connect()
        .then(() => {
          this.isReconnecting = false;
        })
        .catch(() => {
          this.isReconnecting = false;
        });
    }, 1500);
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
