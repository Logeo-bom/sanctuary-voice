import { SUPPORTED_LANGUAGES } from '../constants/languages';
import type { SpeechOutputConfig } from '../types/translator';

interface QueuedSpeechItem {
  text: string;
  targetLanguageCode: string;
  apiKey?: string;
  isLastClause?: boolean;
  onEnded?: () => void;
}

export class EarphoneSpeechEngine {
  private config: SpeechOutputConfig;
  private voices: SpeechSynthesisVoice[] = [];
  private queue: QueuedSpeechItem[] = [];
  private isPlaying = false;
  private stopGeneration = 0;
  private currentAudio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private currentSourceNode: AudioBufferSourceNode | null = null;

  constructor(config: SpeechOutputConfig) {
    this.config = {
      voiceEngine: 'neural-cloud',
      geminiVoiceName: 'Aoede',
      ...config,
    };
    this.loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
      };
    }
  }

  private loadVoices(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.voices = window.speechSynthesis.getVoices();
  }

  public updateConfig(partial: Partial<SpeechOutputConfig>): void {
    this.config = { ...this.config, ...partial };
    if (partial.enabled === false) {
      this.stopAll();
    }
  }

  public speakTranslation(
    text: string,
    targetLanguageCode: string,
    forcePlay = false,
    apiKey?: string,
    onEndedCallback?: () => void
  ): void {
    if (!forcePlay && !this.config.enabled) {
      if (onEndedCallback) onEndedCallback();
      return;
    }
    const cleaned = text.trim();
    if (!cleaned) {
      if (onEndedCallback) onEndedCallback();
      return;
    }

    // Do NOT stop existing audio if it's currently speaking; queue it smoothly!
    // If the queue has gotten more than 3 items behind, drop older items to keep up with live speech
    if (this.queue.length > 3) {
      this.queue = this.queue.slice(-2);
    }

    // Split into natural clauses for fast streaming
    const clauses = this.splitIntoClauses(cleaned, 175);
    for (let i = 0; i < clauses.length; i++) {
      this.queue.push({
        text: clauses[i],
        targetLanguageCode,
        apiKey,
        isLastClause: i === clauses.length - 1,
        onEnded: i === clauses.length - 1 ? onEndedCallback : undefined,
      });
    }

    if (!this.isPlaying) {
      void this.processQueue();
    }
  }

  public stopAll(): void {
    this.stopGeneration++;
    this.queue = [];
    this.isPlaying = false;

    if (this.currentAudio) {
      try {
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
      } catch {
        // Ignore
      }
      this.currentAudio = null;
    }

    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.onended = null;
        this.currentSourceNode.stop();
      } catch {
        // Ignore
      }
      this.currentSourceNode = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isPlaying) return;
    this.isPlaying = true;
    const gen = this.stopGeneration;

    while (this.queue.length > 0 && this.stopGeneration === gen) {
      const item = this.queue.shift()!;
      const catchupBoost =
        this.queue.length >= 2 ? 0.14 : this.queue.length === 1 ? 0.06 : 0;
      const effectiveRate = Math.min(
        1.5,
        Math.max(0.8, this.config.speechRate + catchupBoost)
      );

      const engineMode = this.config.voiceEngine || 'neural-cloud';

      let playedSuccessfully = false;

      // 1. If user explicitly chose Gemini Studio Voice, attempt Gemini Studio
      if (engineMode === 'gemini-studio' && item.apiKey && this.stopGeneration === gen) {
        playedSuccessfully = await this.playGeminiStudioVoice(
          item.text,
          item.apiKey,
          effectiveRate
        );
      }

      // 2. Play Cloud Neural TTS (Default, or fallback if Gemini Studio call fails or returns 404)
      if (!playedSuccessfully && this.stopGeneration === gen) {
        playedSuccessfully = await this.playCloudNeuralAudio(
          item.text,
          item.targetLanguageCode,
          effectiveRate
        );
      }

      // 3. Fallback to browser speech if cloud audio is blocked
      if (!playedSuccessfully && this.stopGeneration === gen) {
        await this.playBrowserSpeechSynthesis(
          item.text,
          item.targetLanguageCode,
          effectiveRate
        );
      }

      if (item.onEnded && this.stopGeneration === gen) {
        try {
          item.onEnded();
        } catch {}
      }
    }

    if (this.stopGeneration === gen) {
      this.isPlaying = false;
    }
  }

  private async playCloudNeuralAudio(
    text: string,
    langCode: string,
    rate: number
  ): Promise<boolean> {
    const tlMap: Record<string, string> = {
      no: 'no',
      en: 'en',
      fr: 'fr',
      es: 'es',
      de: 'de',
      pt: 'pt-BR',
      uk: 'uk',
      tl: 'tl',
      ko: 'ko',
      sw: 'sw',
      ar: 'ar',
      zh: 'zh-CN',
    };
    const tl = tlMap[langCode] || langCode;
    const proxyUrl = `/api/neural-tts?tl=${encodeURIComponent(
      tl
    )}&q=${encodeURIComponent(text)}`;

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const done = (success: boolean) => {
        if (!resolved) {
          resolved = true;
          this.currentAudio = null;
          resolve(success);
        }
      };

      const audio = new Audio(proxyUrl);
      this.currentAudio = audio;
      audio.volume = this.config.volume;
      audio.playbackRate = rate;

      if ('preservesPitch' in audio) {
        audio.preservesPitch = true;
      }

      audio.onended = () => {
        done(true);
      };

      audio.onerror = () => {
        done(false);
      };

      audio.play().catch(() => {
        done(false);
      });
    });
  }

  private async playGeminiStudioVoice(
    text: string,
    apiKey: string,
    rate: number
  ): Promise<boolean> {
    try {
      const voiceName = this.config.geminiVoiceName || 'Aoede';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(
        apiKey.trim()
      )}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Read this translated church sermon phrase warmly and clearly: ${text}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
        }),
      });

      if (!res.ok) return false;
      const data = await res.json();
      const base64Pcm =
        data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Pcm) return false;

      // Decode 24kHz 16-bit mono PCM returned by Gemini TTS
      const binaryString = window.atob(base64Pcm);
      const byteLength = binaryString.length;
      const bytes = new Uint8Array(byteLength);
      for (let i = 0; i < byteLength; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      if (!this.audioCtx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.audioCtx = new AudioCtx();
      }

      const audioBuffer = this.audioCtx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      return new Promise<boolean>((resolve) => {
        if (!this.audioCtx) {
          resolve(false);
          return;
        }
        const source = this.audioCtx.createBufferSource();
        const gainNode = this.audioCtx.createGain();
        gainNode.gain.value = this.config.volume;

        source.buffer = audioBuffer;
        source.playbackRate.value = rate;
        source.connect(gainNode).connect(this.audioCtx.destination);
        this.currentSourceNode = source;

        source.onended = () => {
          this.currentSourceNode = null;
          resolve(true);
        };

        source.start(0);
      });
    } catch {
      return false;
    }
  }

  private playBrowserSpeechSynthesis(
    text: string,
    targetLanguageCode: string,
    rate: number
  ): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }

      this.loadVoices();
      const utterance = new SpeechSynthesisUtterance(text);
      const langMeta = SUPPORTED_LANGUAGES.find(
        (l) => l.code === targetLanguageCode
      );
      utterance.lang = langMeta?.bcp47 || targetLanguageCode;

      const prefix = targetLanguageCode.toLowerCase();
      const bcpPrefix = langMeta?.bcp47.split('-')[0].toLowerCase() || prefix;

      const matching = this.voices.filter((v) => {
        const vl = v.lang.toLowerCase();
        return vl.startsWith(prefix) || vl.startsWith(bcpPrefix);
      });

      // Strict filter: Exclude any male desktop robotic voices (David, Mark, George, Richard)
      const nonMaleVoices = matching.filter((v) => {
        const n = v.name.toLowerCase();
        return (
          !n.includes('david') &&
          !n.includes('mark') &&
          !n.includes('george') &&
          !n.includes('richard') &&
          !n.includes('male')
        );
      });

      const voicePool = nonMaleVoices.length > 0 ? nonMaleVoices : matching;

      if (voicePool.length > 0) {
        // Prioritize natural/online voices AND specifically female voices (Zira, Jenny, Ava, Natural, Google, Female)
        const ranked = [...voicePool].sort((a, b) => {
          const score = (v: SpeechSynthesisVoice) => {
            const n = v.name.toLowerCase();
            let pts = 0;
            if (n.includes('natural')) pts += 100;
            if (n.includes('online')) pts += 80;
            if (n.includes('google')) pts += 70;
            if (
              n.includes('zira') ||
              n.includes('jenny') ||
              n.includes('ava') ||
              n.includes('female') ||
              n.includes('samantha') ||
              n.includes('victoria') ||
              n.includes('hazel') ||
              n.includes('susan')
            ) {
              pts += 60;
            }
            if (!v.localService) pts += 20;
            return pts;
          };
          return score(b) - score(a);
        });
        utterance.voice = ranked[0];
      }

      utterance.rate = rate;
      // Pitch set to 1.15 to guarantee a clear, natural feminine tone
      utterance.pitch = 1.15;
      utterance.volume = this.config.volume;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  private splitIntoClauses(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const parts = text.split(/(?<=[.!?।;:,—])\s+/);
    const result: string[] = [];
    let current = '';

    for (const part of parts) {
      if ((current + ' ' + part).trim().length <= maxLen) {
        current = (current + ' ' + part).trim();
      } else {
        if (current) result.push(current);
        current = part.slice(0, maxLen);
      }
    }
    if (current) result.push(current);
    return result;
  }
}
