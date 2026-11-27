import type { AudioMeterSnapshot, AudioProcessingConfig } from '../types/translator';
import {
  TARGET_SAMPLE_RATE,
  downsampleTo16kHz,
  encodeWav16kHz,
  findSilenceCutIndex,
  float32ToInt16Pcm,
  hasSpeechActivity,
} from '../utils/audioPcmUtils';
import {
  type ModelProgressEvent,
  markOfflineModelDownloading,
  markOfflineModelError,
  markOfflineModelReady,
  removeOfflineModelFiles,
  reportOfflineModelProgress,
} from './offlineReadiness';

export type AudioChunkCallback = (audioBlob: Blob, mimeType: string, durationMs: number) => void;
export type AudioStreamingSliceCallback = (pcm16Buffer: ArrayBuffer) => void;
export type MeterUpdateCallback = (snapshot: AudioMeterSnapshot) => void;
export type StreamEndedCallback = () => void;
export type OfflineTranscriptCallback = (text: string, durationMs: number) => void;

interface WhisperTranscriptionResult {
  text: string;
}

type WhisperTranscriber = (
  audio: Float32Array,
  options?: Record<string, unknown>
) => Promise<WhisperTranscriptionResult | WhisperTranscriptionResult[]>;

// Module-level (not instance-bound) cache, keyed by model id, so a loaded on-device Whisper model
// can be reused by the offline fallback and the Offline Ready panel. Keyed by model id (not a single
// shared promise) because different source languages use different checkpoints - see
// `getWhisperModelIdForLanguage` below.
const whisperPipelinePromises = new Map<string, Promise<WhisperTranscriber>>();

const DEFAULT_WHISPER_MODEL_ID = 'Xenova/whisper-tiny';

// Filipino/Visayan languages (Tagalog, Cebuano/Bisaya, and similar under-resourced regional
// languages) are weak on `whisper-tiny`, which was trained predominantly on high-resource
// languages. No verified, transformers.js-ready (ONNX-converted) Cebuano-specific fine-tune exists
// publicly yet - the only community fine-tune found (`pengyizhou/whisper-fleurs-ceb_ph-small-...`)
// is a raw PyTorch checkpoint trained on ~2.5 hours of audio, not ONNX-converted, so loading it
// directly here would just fail at runtime. Until a verified ONNX checkpoint exists, `whisper-small`
// is a real, already Xenova-hosted/ONNX-converted upgrade: a larger multilingual model with
// meaningfully better low-resource-language coverage than `whisper-tiny`, at the cost of a bigger
// download. This map is intentionally easy to extend/swap once a dedicated Cebuano ONNX checkpoint
// becomes available - just change the model id string here, no other code needs to change.
const FILIPINO_VISAYAN_LANGS = new Set(['tl', 'ceb']);
const FILIPINO_VISAYAN_WHISPER_MODEL_ID = 'Xenova/whisper-small';

/**
 * Selects the on-device Whisper checkpoint to use for a given source language. Exported for
 * testing; see the comment above `FILIPINO_VISAYAN_WHISPER_MODEL_ID` for why this currently maps
 * to a larger generic multilingual model rather than a dedicated Cebuano fine-tune.
 */
export function getWhisperModelIdForLanguage(sourceLang: string): string {
  const baseCode = (sourceLang || '').toLowerCase().trim().split('-')[0];
  return FILIPINO_VISAYAN_LANGS.has(baseCode) ? FILIPINO_VISAYAN_WHISPER_MODEL_ID : DEFAULT_WHISPER_MODEL_ID;
}

async function getWhisperPipeline(modelId: string = DEFAULT_WHISPER_MODEL_ID): Promise<WhisperTranscriber> {
  let pipelinePromise = whisperPipelinePromises.get(modelId);
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      markOfflineModelDownloading(modelId);
      try {
        // Dynamic, non-literal specifier keeps this out of the static TS module graph (no local type
        // declarations exist for this CDN-hosted package) and out of Vite's build-time bundling.
        const transformersModuleUrl = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transformers: any = await import(/* @vite-ignore */ transformersModuleUrl);
        transformers.env.allowLocalModels = false;
        const transcriber = (await transformers.pipeline(
          'automatic-speech-recognition',
          modelId,
          {
            quantized: true,
            progress_callback: (event: ModelProgressEvent) => reportOfflineModelProgress(modelId, event),
          }
        )) as WhisperTranscriber;
        markOfflineModelReady(modelId);
        return transcriber;
      } catch (err) {
        // Drop the failed promise so a later attempt (e.g. the operator tapping "Retry") starts over
        // instead of returning the same cached rejection forever.
        whisperPipelinePromises.delete(modelId);
        markOfflineModelError(modelId, err);
        throw err;
      }
    })();
    whisperPipelinePromises.set(modelId, pipelinePromise);
  }
  return pipelinePromise;
}

/**
 * Loads the on-device Whisper model. The app uses this to warm a model only after the readiness
 * store confirms it was already downloaded; explicit downloads are initiated by the Offline Ready
 * panel. Safe to call repeatedly — it's a no-op once the model is loaded or already loading. Never
 * throws. Pass the selected source language to use the correct checkpoint.
 */
export function preloadWhisperModel(sourceLang?: string): void {
  const modelId = getWhisperModelIdForLanguage(sourceLang || '');
  void getWhisperPipeline(modelId).catch((err) => {
    console.warn('[ChurchAudioEngine] Eager Whisper model pre-cache failed (will retry on demand):', err);
  });
}

/**
 * Same as `preloadWhisperModel`, but returns a promise the "Offline Ready" panel can await. Rejects
 * if the download fails; progress is reported through `offlineReadiness`.
 */
export async function downloadWhisperModel(sourceLang?: string): Promise<void> {
  await getWhisperPipeline(getWhisperModelIdForLanguage(sourceLang || ''));
}

/** Releases the selected Whisper pipeline and removes its cached model files from this device. */
export async function removeWhisperModel(sourceLang?: string): Promise<void> {
  const modelId = getWhisperModelIdForLanguage(sourceLang || '');
  const pipelinePromise = whisperPipelinePromises.get(modelId);
  whisperPipelinePromises.delete(modelId);

  if (pipelinePromise) {
    try {
      const transcriber = await pipelinePromise;
      const disposable = transcriber as WhisperTranscriber & { dispose?: () => void | Promise<void> };
      await disposable.dispose?.();
    } catch {}
  }

  await removeOfflineModelFiles(modelId);
}

export class ChurchAudioEngine {
  private audioContext: AudioContext | null = null;
  private rawStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highPassNode: BiquadFilterNode | null = null;
  private synthNotchNode: BiquadFilterNode | null = null;
  private vocalPresenceNode: BiquadFilterNode | null = null;
  private deEsserNode: BiquadFilterNode | null = null;
  private highCutNode: BiquadFilterNode | null = null;
  private preAmpGainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private workletNode: AudioWorkletNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  private silentGainNode: GainNode | null = null;
  private pcm16kChunks: Float32Array[] = [];
  private pcm16kSampleCount = 0;
  private meterFrameId: number | null = null;
  private isRunning = false;
  private config: AudioProcessingConfig;
  private onAudioChunk: AudioChunkCallback;
  private onMeterUpdate: MeterUpdateCallback;
  private onStreamEnded?: StreamEndedCallback;
  private onStreamingSlice?: AudioStreamingSliceCallback;
  private onOfflineTranscript?: OfflineTranscriptCallback;
  // Automatic connectivity-health override (see `setForceOffline` below): driven by App.tsx's
  // background connectivity probe rather than a manual operator toggle, so the primary pipeline
  // keeps adapting continuously (not just once at service start) to "online but unusable" networks
  // that `navigator.onLine` alone can't detect (missionary/remote-venue use case).
  private forceOffline = false;
  // Currently selected source language, used only to pick the right on-device Whisper checkpoint
  // for the offline fallback (see `getWhisperModelIdForLanguage`/`setSourceLanguageHint`).
  private sourceLanguageHint = '';

  constructor(
    config: AudioProcessingConfig,
    onAudioChunk: AudioChunkCallback,
    onMeterUpdate: MeterUpdateCallback,
    onStreamEnded?: StreamEndedCallback,
    onStreamingSlice?: AudioStreamingSliceCallback,
    onOfflineTranscript?: OfflineTranscriptCallback
  ) {
    this.config = { ...config };
    this.onAudioChunk = onAudioChunk;
    this.onMeterUpdate = onMeterUpdate;
    this.onStreamEnded = onStreamEnded;
    this.onStreamingSlice = onStreamingSlice;
    this.onOfflineTranscript = onOfflineTranscript;
  }

  /**
   * Automatically engaged/disengaged by App.tsx's periodic connectivity health probe (see
   * `forceOffline` above) — no longer a manually operated toggle.
   */
  public setForceOffline(enabled: boolean): void {
    this.forceOffline = enabled;
  }

  /**
   * Updates the source-language hint used to select the on-device Whisper checkpoint for the
   * offline fallback (see `getWhisperModelIdForLanguage`). Call whenever the operator changes the
   * source language, so the correct model is already warm by the time the offline path engages.
   */
  public setSourceLanguageHint(sourceLang: string): void {
    this.sourceLanguageHint = sourceLang || '';
  }

  public static async listAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }

  public async start(sourceOverride?: 'mic' | 'tab'): Promise<void> {
    if (this.isRunning) return;

    const source = sourceOverride || this.config.audioSource || 'mic';

    if (source === 'tab') {
      const isMobile =
        typeof navigator !== 'undefined' &&
        /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent || ''
        );

      if (isMobile) {
        throw new Error(
          'TAB / Online Sermon direct audio capture is only available on Desktop browsers (Chrome, Edge, Brave). On mobile devices, please select "Mic (Room)".'
        );
      }

      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error(
          'Browser tab audio capture is not supported in this browser. Please use Chrome, Edge, or Brave on desktop, or select "Mic (Room)".'
        );
      }

      let displayStream: MediaStream;
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (err) {
        if (err instanceof Error) {
          if (
            err.name === 'NotAllowedError' ||
            err.message.toLowerCase().includes('permission denied') ||
            err.message.toLowerCase().includes('cancelled') ||
            err.message.toLowerCase().includes('canceled')
          ) {
            throw new Error(
              'Tab audio capture was cancelled or denied. Please ensure you are on desktop and select "Share tab audio", or switch to "Mic (Room)".'
            );
          }
        }
        throw err;
      }

      const audioTracks = displayStream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        displayStream.getTracks().forEach((t) => t.stop());
        throw new Error(
          'No tab audio detected. Please select a Chrome/Browser Tab and check "Also share tab audio".'
        );
      }

      // Automatically handle when user clicks "Stop sharing" in browser banner
      displayStream.getTracks().forEach((track) => {
        track.onended = () => {
          if (this.isRunning) {
            this.stop();
            this.onStreamEnded?.();
          }
        };
      });

      this.rawStream = displayStream;
    } else {
      // Crucial for Android Church Back-Row Capture:
      // Disabling OS noiseSuppression & autoGainControl stops Android from treating
      // distant PA loudspeakers or reverberant sanctuary speech as "background noise".
      // Keep hardware echoCancellation=true so the phone's own TTS speaker output
      // never feeds back into the microphone in an infinite loop when earphones aren't plugged in.
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: !this.config.bypassOsProcessing,
        autoGainControl: !this.config.bypassOsProcessing,
        channelCount: 1,
      };

      if (this.config.selectedDeviceId && this.config.selectedDeviceId !== 'default') {
        audioConstraints.deviceId = { exact: this.config.selectedDeviceId };
      }

      this.rawStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // Mobile browsers (Chrome/Safari) work reliably when using the hardware default sampleRate (44100 or 48000)
    this.audioContext = new AudioCtx();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.rawStream);

    // 1. Low Cut / High-Pass Filter (Bard's sheet: cut below 80-85Hz to remove rumble and stage vibration)
    this.highPassNode = this.audioContext.createBiquadFilter();
    this.highPassNode.type = 'highpass';
    this.highPassNode.frequency.value = this.config.highPassHz || 85;
    this.highPassNode.Q.value = 0.707;

    // 2. Synth Pad Cut Filter (attenuates warm worship pad mud around 280Hz)
    this.synthNotchNode = this.audioContext.createBiquadFilter();
    this.synthNotchNode.type = 'peaking';
    this.synthNotchNode.frequency.value = 280;
    this.synthNotchNode.Q.value = 1.2;
    this.synthNotchNode.gain.value = this.config.synthPadFilterEnabled ? -6.0 : 0;

    // 3. Mid Boost / Vocal Formant Presence (Bard's sheet: boost around 2-4kHz for clarity; +2.5dB at 2.8kHz)
    this.vocalPresenceNode = this.audioContext.createBiquadFilter();
    this.vocalPresenceNode.type = 'peaking';
    this.vocalPresenceNode.frequency.value = 2800;
    this.vocalPresenceNode.Q.value = 1.0;
    this.vocalPresenceNode.gain.value = 2.5;

    // 4. De-Esser Notch (Bard & Junie: 5kHz–8kHz notch, -2.5dB at 6.5kHz to soften harsh 's' and 'sh')
    this.deEsserNode = this.audioContext.createBiquadFilter();
    this.deEsserNode.type = 'peaking';
    this.deEsserNode.frequency.value = 6500;
    this.deEsserNode.Q.value = 1.5;
    this.deEsserNode.gain.value = -2.5;

    // 5. High Cut Filter (Bard's sheet: gently cut above 15kHz to reduce harshness/hiss)
    this.highCutNode = this.audioContext.createBiquadFilter();
    this.highCutNode.type = 'lowpass';
    this.highCutNode.frequency.value = 14500;
    this.highCutNode.Q.value = 0.707;

    // 6. Back-Row Pre-Amp Gain Boost (linear gain from dB)
    this.preAmpGainNode = this.audioContext.createGain();
    this.preAmpGainNode.gain.value = this.dbToLinear(this.config.preAmpGainDb);

    // 7. Dynamic Range Compressor (Bard's sheet: Threshold around -20dB, Ratio 3:1, Attack 8ms, Release 80ms)
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = this.config.dynamicCompressorEnabled ? -20 : -6;
    this.compressorNode.knee.value = 12;
    this.compressorNode.ratio.value = this.config.dynamicCompressorEnabled ? 3 : 1.5;
    this.compressorNode.attack.value = 0.008;
    this.compressorNode.release.value = 0.080;

    // 8. Analyser for live dB meter & vocal formant detection
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.65;

    // Studio-grade vocal DSP chain:
    // source -> highPass (85Hz) -> synthNotch (280Hz) -> midBoost (2.8kHz) -> deEsser (6.5kHz) -> highCut (14.5kHz) -> preAmp -> compressor (-20dB 3:1) -> analyser
    this.sourceNode
      .connect(this.highPassNode)
      .connect(this.synthNotchNode)
      .connect(this.vocalPresenceNode)
      .connect(this.deEsserNode)
      .connect(this.highCutNode)
      .connect(this.preAmpGainNode)
      .connect(this.compressorNode)
      .connect(this.analyserNode);

    this.isRunning = true;
    this.startMeterLoop();
    await this.startAudioCapturePipeline();
  }

  public getDspNodeSnapshot(): {
    highPassHz: number;
    synthNotchHz: number;
    synthNotchGainDb: number;
    vocalPresenceHz: number;
    vocalPresenceGainDb: number;
    deEsserHz: number;
    deEsserGainDb: number;
    highCutHz: number;
    compressorThresholdDb: number;
    compressorRatio: number;
  } | null {
    if (
      !this.highPassNode ||
      !this.synthNotchNode ||
      !this.vocalPresenceNode ||
      !this.deEsserNode ||
      !this.highCutNode ||
      !this.compressorNode
    ) {
      return null;
    }
    return {
      highPassHz: this.highPassNode.frequency.value,
      synthNotchHz: this.synthNotchNode.frequency.value,
      synthNotchGainDb: this.synthNotchNode.gain.value,
      vocalPresenceHz: this.vocalPresenceNode.frequency.value,
      vocalPresenceGainDb: this.vocalPresenceNode.gain.value,
      deEsserHz: this.deEsserNode.frequency.value,
      deEsserGainDb: this.deEsserNode.gain.value,
      highCutHz: this.highCutNode.frequency.value,
      compressorThresholdDb: this.compressorNode.threshold.value,
      compressorRatio: this.compressorNode.ratio.value,
    };
  }

  public updateConfig(newConfig: Partial<AudioProcessingConfig>): void {
    const prevBypass = this.config.bypassOsProcessing;
    const prevDevice = this.config.selectedDeviceId;
    const prevChunkSec = this.config.chunkDurationSec;

    this.config = { ...this.config, ...newConfig };

    if (this.highPassNode && newConfig.highPassHz !== undefined) {
      this.highPassNode.frequency.value = newConfig.highPassHz;
    }

    if (this.synthNotchNode && newConfig.synthPadFilterEnabled !== undefined) {
      this.synthNotchNode.gain.value = newConfig.synthPadFilterEnabled ? -6.0 : 0;
    }

    if (this.vocalPresenceNode && newConfig.synthPadFilterEnabled !== undefined) {
      this.vocalPresenceNode.gain.value = newConfig.synthPadFilterEnabled ? 2.5 : 0;
    }

    if (this.deEsserNode) {
      this.deEsserNode.frequency.value = 6500;
      this.deEsserNode.gain.value = -2.5;
    }

    if (this.preAmpGainNode && newConfig.preAmpGainDb !== undefined) {
      this.preAmpGainNode.gain.value = this.dbToLinear(newConfig.preAmpGainDb);
    }

    if (this.compressorNode && newConfig.dynamicCompressorEnabled !== undefined) {
      this.compressorNode.threshold.value = newConfig.dynamicCompressorEnabled ? -20 : -6;
      this.compressorNode.ratio.value = newConfig.dynamicCompressorEnabled ? 3 : 1.5;
    }

    if (this.isRunning && (prevBypass !== this.config.bypassOsProcessing || prevDevice !== this.config.selectedDeviceId)) {
      void this.restart();
    } else if (this.isRunning && prevChunkSec !== this.config.chunkDurationSec) {
      this.pcm16kChunks = [];
      this.pcm16kSampleCount = 0;
    }
  }

  public async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  public stop(): void {
    this.isRunning = false;
    this.pcm16kChunks = [];
    this.pcm16kSampleCount = 0;

    if (this.meterFrameId !== null) {
      window.cancelAnimationFrame(this.meterFrameId);
      this.meterFrameId = null;
    }

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        // Ignore
      }
      this.workletNode = null;
    }

    if (this.scriptProcessorNode) {
      try {
        this.scriptProcessorNode.disconnect();
        this.scriptProcessorNode.onaudioprocess = null;
      } catch {
        // Ignore
      }
      this.scriptProcessorNode = null;
    }

    if (this.silentGainNode) {
      try {
        this.silentGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.silentGainNode = null;
    }

    if (this.rawStream) {
      this.rawStream.getTracks().forEach((track) => track.stop());
      this.rawStream = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }

  public restartContinuousStreamRecorder(): void {
    // No-op: raw linear16 PCM streaming requires no container header reset on reconnect
  }

  private async startAudioCapturePipeline(): Promise<void> {
    if (!this.audioContext || !this.compressorNode || !this.isRunning) return;

    this.pcm16kChunks = [];
    this.pcm16kSampleCount = 0;

    const inputSampleRate = this.audioContext.sampleRate;
    this.silentGainNode = this.audioContext.createGain();
    this.silentGainNode.gain.value = 0;

    // Prefer off-main-thread AudioWorkletNode for glitch-free mobile capture
    if (
      typeof AudioWorkletNode !== 'undefined' &&
      this.audioContext.audioWorklet &&
      typeof this.audioContext.audioWorklet.addModule === 'function'
    ) {
      try {
        await this.audioContext.audioWorklet.addModule('/audio-capture-processor.js');
        if (!this.isRunning || !this.audioContext || !this.compressorNode || !this.silentGainNode) {
          return;
        }
        const worklet = new AudioWorkletNode(this.audioContext, 'sanctuary-pcm-processor');
        worklet.port.onmessage = (ev: MessageEvent<Float32Array>) => {
          if (!this.isRunning || !ev.data) return;
          this.handleRawPcmBlock(ev.data, inputSampleRate);
        };
        this.workletNode = worklet;
        this.compressorNode.connect(worklet);
        worklet.connect(this.silentGainNode);
        this.silentGainNode.connect(this.audioContext.destination);
        return;
      } catch (err) {
        console.warn('[ChurchAudioEngine] AudioWorklet unavailable, falling back to ScriptProcessor:', err);
      }
    }

    // Fallback for environments without AudioWorklet support
    if (!this.isRunning || !this.audioContext || !this.compressorNode || !this.silentGainNode) {
      return;
    }
    this.scriptProcessorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.scriptProcessorNode.onaudioprocess = (e) => {
      if (!this.isRunning) return;
      const inputData = e.inputBuffer.getChannelData(0);
      this.handleRawPcmBlock(new Float32Array(inputData), inputSampleRate);
    };
    this.compressorNode.connect(this.scriptProcessorNode);
    this.scriptProcessorNode.connect(this.silentGainNode);
    this.silentGainNode.connect(this.audioContext.destination);
  }

  private handleRawPcmBlock(rawBlock: Float32Array, inputSampleRate: number): void {
    // 1. Downsample hardware rate (e.g. 48kHz) -> 16kHz mono (cuts bandwidth ~3x)
    const downsampled16k = downsampleTo16kHz(rawBlock, inputSampleRate, TARGET_SAMPLE_RATE);
    if (downsampled16k.length === 0) return;

    // 2. Stream raw 16kHz 16-bit linear PCM directly to Deepgram Live WebSocket (zero MediaRecorder/WebM)
    if (this.onStreamingSlice) {
      const pcm16 = float32ToInt16Pcm(downsampled16k);
      this.onStreamingSlice(pcm16.buffer as ArrayBuffer);
    }

    // 3. Accumulate 16kHz samples and cut at natural speech pauses (2.2s min, 6.0s max, zero overlap)
    this.pcm16kChunks.push(downsampled16k);
    this.pcm16kSampleCount += downsampled16k.length;

    const minSamples = Math.round(2.2 * TARGET_SAMPLE_RATE);
    const maxSamples = Math.round(6.0 * TARGET_SAMPLE_RATE);

    if (this.pcm16kSampleCount >= minSamples) {
      const merged = new Float32Array(this.pcm16kSampleCount);
      let offset = 0;
      for (const piece of this.pcm16kChunks) {
        merged.set(piece, offset);
        offset += piece.length;
      }

      const cut = findSilenceCutIndex(merged, minSamples, maxSamples);
      if (cut !== null) {
        const emitPart = merged.subarray(0, cut);
        const remainder = merged.slice(cut);
        this.pcm16kChunks = remainder.length ? [remainder] : [];
        this.pcm16kSampleCount = remainder.length;

        // 4. Client-side VAD energy gate: skip uploading silent/empty chunks to save bandwidth & cost
        if (hasSpeechActivity(emitPart)) {
          const duration = Math.round(emitPart.length / 16);

          // Offline Whisper fallback (inspired by Church-Cap / GoGospelNow): when the sanctuary's
          // internet connection is down, Deepgram/Gemini are unreachable anyway, so skip the network
          // upload entirely and transcribe this chunk on-device instead, keeping captions flowing.
          const isOffline = this.forceOffline || (typeof navigator !== 'undefined' && navigator.onLine === false);
          if (isOffline && this.onOfflineTranscript) {
            void this.transcribeOffline(emitPart, TARGET_SAMPLE_RATE).then((text) => {
              if (text) {
                this.onOfflineTranscript?.(text, duration);
              }
            });
          } else {
            const wavBlob = encodeWav16kHz(emitPart, TARGET_SAMPLE_RATE);
            this.onAudioChunk(wavBlob, 'audio/wav', duration);
          }
        }
      } else {
        this.pcm16kChunks = [merged];
        this.pcm16kSampleCount = merged.length;
      }
    }
  }

  /**
   * Offline Whisper fallback (inspired by Church-Cap / GoGospelNow's local-first, no-internet-required
   * church captioning apps). Transcribes a chunk of 16kHz float32 PCM entirely on-device, so sermon
   * captions keep flowing even when the sanctuary's Wi-Fi/cellular drops and Deepgram/Gemini are
   * unreachable. Returns an empty string (never throws) if the on-device model fails to load or run.
   */
  public async transcribeOffline(
    samples: Float32Array,
    sampleRate: number = TARGET_SAMPLE_RATE
  ): Promise<string> {
    try {
      const modelId = getWhisperModelIdForLanguage(this.sourceLanguageHint);
      const transcriber = await getWhisperPipeline(modelId);
      const result = await transcriber(samples, {
        sampling_rate: sampleRate,
        chunk_length_s: 8,
        task: 'transcribe',
      });
      const text = Array.isArray(result)
        ? result.map((r) => r.text).join(' ')
        : result?.text || '';
      return text.trim();
    } catch (err) {
      console.warn('[ChurchAudioEngine] Offline Whisper fallback failed:', err);
      return '';
    }
  }

  private startMeterLoop(): void {
    if (!this.analyserNode) return;
    const timeDomain = new Float32Array(this.analyserNode.fftSize);
    const freqDomain = new Uint8Array(this.analyserNode.frequencyBinCount);

    const update = () => {
      if (!this.isRunning || !this.analyserNode) return;

      // Mobile browser resilience: auto-resume AudioContext if TTS or OS focus suspended it
      if (this.audioContext && this.audioContext.state === 'suspended') {
        void this.audioContext.resume();
      }

      this.analyserNode.getFloatTimeDomainData(timeDomain);
      this.analyserNode.getByteFrequencyData(freqDomain);

      let sumSquares = 0;
      let peak = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const sample = Math.abs(timeDomain[i]);
        sumSquares += sample * sample;
        if (sample > peak) peak = sample;
      }

      const rms = Math.sqrt(sumSquares / timeDomain.length);
      const rmsDb = Math.max(-75, 20 * Math.log10(Math.max(rms, 0.0001)));
      const peakDb = Math.max(-75, 20 * Math.log10(Math.max(peak, 0.0001)));

      // Check energy specifically in the human vocal formant band (300Hz - 3400Hz)
      // With 16kHz sampleRate and 256 FFT, each bin is ~62.5Hz. Bins 5..54 correspond to 312Hz..3375Hz.
      let vocalBandSum = 0;
      for (let bin = 5; bin <= 54 && bin < freqDomain.length; bin++) {
        vocalBandSum += freqDomain[bin];
      }
      const vocalBandAvg = vocalBandSum / 50;

      // Relaxed detection for distant TV / distant pulpit speakers (rmsDb > -58 or vocalBandAvg > 12)
      const isVoiceDetected = rmsDb > -58 || vocalBandAvg > 12;

      // Downsample 16 frequency bars for smooth UI visualizer
      const bars: number[] = [];
      const step = Math.floor(freqDomain.length / 16);
      for (let b = 0; b < 16; b++) {
        const val = freqDomain[Math.min(freqDomain.length - 1, b * step + 2)] / 255;
        bars.push(Number(val.toFixed(2)));
      }

      const normalizedLevel = Math.min(1, Math.max(0, (rmsDb + 65) / 65));

      this.onMeterUpdate({
        rmsDb: Math.round(rmsDb),
        peakDb: Math.round(peakDb),
        normalizedLevel,
        isClipping: peakDb > -1.2,
        isVoiceDetected,
        frequencyBins: bars,
      });

      this.meterFrameId = window.requestAnimationFrame(update);
    };

    this.meterFrameId = window.requestAnimationFrame(update);
  }

  private dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  }
}
