import { SUPPORTED_LANGUAGES } from '../constants/languages';
import { getKeywordsForLanguage } from '../constants/theologyKeywords';

export interface DeepgramLiveSegment {
  speakerId: string;
  speakerLabel: string;
  sourceLanguageCode: string;
  sourceLanguageName: string;
  originalText: string;
  translatedText: string;
  provider?: 'deepl' | 'gemini' | 'google-neural';
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
  private customChurchGlossary: string[] = [];
  private onSegment: OnTranscriptCallback;
  private onInterim?: OnInterimCallback;
  private onError: OnErrorCallback;
  private onReconnected?: () => void;

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
    onInterim?: OnInterimCallback,
    customChurchGlossary: string[] = [],
    onReconnected?: () => void
  ) {
    this.apiKey = apiKey.trim();
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;
    this.customChurchGlossary = customChurchGlossary || [];
    this.onSegment = onSegment;
    this.onError = onError;
    this.onInterim = onInterim;
    this.onReconnected = onReconnected;
  }

  public async connect(): Promise<void> {
    // 1. Fetch short-lived token via our serverless grant endpoint (uses process.env.DEEPGRAM_API_KEY)
    let accessToken = this.apiKey;
    let authProtocol = 'token';
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
          authProtocol = 'token'; // Deepgram browser WebSocket requires ['token', token]
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
        // Deepgram live WebSocket configuration
        // When Auto-Detect is chosen:
        // Nova-3 supports multi-language real-time speech recognition (language=multi).
        // IMPORTANT: Nova-3 requires 'keyterm=WORD' without ':weight' suffixes!
        // Nova-2 requires 'keywords=WORD:weight'.
        // If a specific language is chosen (e.g. 'ko', 'en', 'es'), use nova-2 or nova-3 based on language support.
        const isAuto = !this.sourceLang || this.sourceLang === 'auto';
        
        let wsUrl: string;
        const boostedWords = getKeywordsForLanguage(this.sourceLang, this.customChurchGlossary);

        if (isAuto) {
          // Nova-3 multi-language auto-detection
          // Use keyterm parameter (Nova-3 does not accept keywords with intensity weights)
          const keytermParams = boostedWords
            .slice(0, 20)
            .map((w) => `&keyterm=${encodeURIComponent(w)}`)
            .join('');
          wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&diarize=true&punctuate=true&smart_format=true&interim_results=true&endpointing=300&utterance_end_ms=1000${keytermParams}`;
        } else {
          // Specific language pinned (e.g. ko, en, es, pt, etc.)
          // Nova-2 supports keywords with weight intensity (:2) across all languages
          // Filter to single words without spaces to avoid Deepgram 400 Bad Request
          const singleWords = boostedWords
            .flatMap((w) => w.split(/\s+/))
            .filter((w) => w.length > 1)
            .slice(0, 25);
          const keywordParams = singleWords
            .map((w) => `&keywords=${encodeURIComponent(w)}:2`)
            .join('');
          wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=${encodeURIComponent(this.sourceLang)}&diarize=true&punctuate=true&smart_format=true&interim_results=true&endpointing=300&utterance_end_ms=1000${keywordParams}`;
        }

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

              // Fast clause flush: if terminal punctuation OR speech_final OR reached 4+ words, flush immediately for instant sub-second translation
              if (speechFinal || (hasTerminalPunctuation && totalWordsCount >= 2) || totalWordsCount >= 5) {
                await this.flushAccumulatedSentence();
              } else {
                // Safety timer: flush after 500ms of pause so delay is virtually instant
                this.resetSafetyFlushTimer();
              }
            }
          } catch {
            // Ignore parse errors on ping/metadata messages
          }
        };

        this.socket.onerror = (e) => {
          console.error('[DeepgramLiveWebSocket] Socket error event:', e);
          this.onError('Deepgram WebSocket connection failed. Please check your API key or connection.');
          reject(new Error('WebSocket connection error'));
        };

        this.socket.onclose = (event) => {
          console.warn('[DeepgramLiveWebSocket] Socket closed:', event.code, event.reason);
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
    }, 500);
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

    const now = Date.now();
    let dedupedSentence = fullOriginalSentence;
    if (this.lastFlushedText) {
      const cleanLast = this.lastFlushedText.trim().toLowerCase().replace(/^[.,?!;\s]+|[.,?!;\s]+$/g, '');
      const cleanCurrent = fullOriginalSentence.trim().toLowerCase().replace(/^[.,?!;\s]+|[.,?!;\s]+$/g, '');

      // Clean duplicate check: ignore if exact identical sentence was already flushed within 6 seconds
      if (cleanCurrent && cleanCurrent === cleanLast && now - this.lastFlushedAt < 6000) {
        return;
      }

      // Strip overlapping prefix if start of current sentence repeats the tail of previous sentence
      const lastWords = this.lastFlushedText.trim().split(/\s+/);
      const currentWords = fullOriginalSentence.trim().split(/\s+/);
      const maxOverlap = Math.min(lastWords.length, currentWords.length, 6);

      for (let len = maxOverlap; len >= 2; len--) {
        const lastTail = lastWords.slice(-len).join(' ').toLowerCase().replace(/[.,?!]/g, '');
        const currentHead = currentWords.slice(0, len).join(' ').toLowerCase().replace(/[.,?!]/g, '');
        if (lastTail === currentHead) {
          dedupedSentence = currentWords.slice(len).join(' ').trim();
          break;
        }
      }
    }

    if (!dedupedSentence || dedupedSentence.length < 2) return;

    this.lastFlushedText = fullOriginalSentence;
    this.lastFlushedAt = now;

    try {
      // Direct, word-for-word translation of the complete sentence
      const { translatedText, detectedLang, provider } = await this.translateAndDetect(
        dedupedSentence,
        this.sourceLang !== 'auto' ? this.sourceLang : 'auto',
        this.targetLang
      );

      const speakerId = `speaker_${speakerNum + 1}`;
      this.onSegment({
        speakerId,
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
        provider,
        isFinal: true,
        latencyMs: 250,
      });
    } catch {
      // Fallback
    }
  }

  public sendAudio(blobOrBuffer: Blob | ArrayBuffer): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      if (blobOrBuffer instanceof Blob) {
        // Converting Blob to ArrayBuffer before transmission ensures binary frame compatibility
        // across mobile WebKit and Chrome WebSocket implementations
        blobOrBuffer.arrayBuffer().then((buffer) => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(buffer);
          }
        }).catch(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(blobOrBuffer);
          }
        });
      } else {
        this.socket.send(blobOrBuffer);
      }
    }
  }

  public isConnected(): boolean {
    return Boolean(this.socket && this.socket.readyState === WebSocket.OPEN);
  }

  public setLanguages(sourceLang: string, targetLang: string, customGlossary?: string[]): void {
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;
    if (customGlossary !== undefined) {
      this.customChurchGlossary = customGlossary;
    }
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
    }, 4000);
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
          // Notify audio engine to emit a fresh WebM container header for the new socket
          this.onReconnected?.();
        })
        .catch(() => {
          this.isReconnecting = false;
          if (this.accessToken) {
            this.attemptReconnect();
          }
        });
    }, 1200);
  }

  private async translateAndDetect(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<{ translatedText: string; detectedLang: string; provider?: 'deepl' | 'gemini' | 'google-neural' }> {
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
            provider: data.provider || 'deepl',
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
      return { translatedText, detectedLang, provider: 'google-neural' };
    } catch {
      return { translatedText: text, detectedLang: sourceLang !== 'auto' ? sourceLang : 'en' };
    }
  }
}
