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

        // Deepgram live WebSocket URL with endpointing=300 for natural pause detection
        // and vad_events=true / utterance_end_ms=1000 for bulletproof utterance completion
        const wsUrl = `wss://api.deepgram.com/v1/listen?model=${modelName}&diarize=true&punctuate=true&smart_format=true&interim_results=true&vad_events=true&endpointing=300&utterance_end_ms=1000${langParam}`;

        this.socket = new WebSocket(wsUrl, [authProtocol, accessToken]);

        this.socket.onopen = () => {
          resolve();
        };

        this.socket.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            // Handle UtteranceEnd event (fallback trigger when speaker stops speaking)
            if (data?.type === 'UtteranceEnd') {
              await this.flushAccumulatedSentence();
              return;
            }

            const channel = data?.channel;
            const alt = channel?.alternatives?.[0];
            const transcript = alt?.transcript?.trim();
            const isFinal = Boolean(data?.is_final);
            const speechFinal = Boolean(data?.speech_final);

            if (transcript && transcript.length > 0) {
              if (isFinal) {
                // Determine speaker
                if (alt.words && alt.words.length > 0 && typeof alt.words[0].speaker === 'number') {
                  const speaker = alt.words[0].speaker;
                  // If speaker changed mid-stream, flush previous speaker's words first
                  if (this.accumulatedWords.length > 0 && speaker !== this.currentSpeakerNum) {
                    await this.flushAccumulatedSentence();
                  }
                  this.currentSpeakerNum = speaker;
                }

                // Accumulate this finalized chunk to preserve EVERY spoken word without skipping
                this.accumulatedWords.push(transcript);

                // If speech_final is signaled by Deepgram (pause detected), translate the complete sentence immediately
                if (speechFinal) {
                  await this.flushAccumulatedSentence();
                } else {
                  // Safety timer: If continuous speech goes on without a long pause, flush every 4 seconds
                  // so the listener gets word-for-word translation in real-time without excessive lag
                  this.resetSafetyFlushTimer();
                }
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
    }, 3500);
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
