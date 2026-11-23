import type { AudioMeterSnapshot, AudioProcessingConfig } from '../types/translator';
import {
  TARGET_SAMPLE_RATE,
  downsampleTo16kHz,
  encodeWav16kHz,
  float32ToInt16Pcm,
  hasSpeechActivity,
} from '../utils/audioPcmUtils';

export type AudioChunkCallback = (audioBlob: Blob, mimeType: string, durationMs: number) => void;
export type AudioStreamingSliceCallback = (pcm16Buffer: ArrayBuffer) => void;
export type MeterUpdateCallback = (snapshot: AudioMeterSnapshot) => void;
export type StreamEndedCallback = () => void;

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
  private chunkStartTime = 0;
  private meterFrameId: number | null = null;
  private isRunning = false;
  private config: AudioProcessingConfig;
  private onAudioChunk: AudioChunkCallback;
  private onMeterUpdate: MeterUpdateCallback;
  private onStreamEnded?: StreamEndedCallback;
  private onStreamingSlice?: AudioStreamingSliceCallback;

  constructor(
    config: AudioProcessingConfig,
    onAudioChunk: AudioChunkCallback,
    onMeterUpdate: MeterUpdateCallback,
    onStreamEnded?: StreamEndedCallback,
    onStreamingSlice?: AudioStreamingSliceCallback
  ) {
    this.config = { ...config };
    this.onAudioChunk = onAudioChunk;
    this.onMeterUpdate = onMeterUpdate;
    this.onStreamEnded = onStreamEnded;
    this.onStreamingSlice = onStreamingSlice;
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
    this.chunkStartTime = performance.now();

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

    // 3. Accumulate 16kHz samples for REST watchdog WAV chunks with 0.5s tail overlap
    // Overlap ensures words spoken across chunk boundaries are never sliced in half
    this.pcm16kChunks.push(downsampled16k);
    this.pcm16kSampleCount += downsampled16k.length;

    const targetDurationSec = this.config.chunkDurationSec || 4.5;
    const targetSamples16k = Math.round(targetDurationSec * TARGET_SAMPLE_RATE);
    const overlapSamples16k = Math.round(0.5 * TARGET_SAMPLE_RATE); // 8,000 samples (0.5s)

    if (this.pcm16kSampleCount >= targetSamples16k) {
      const merged = new Float32Array(this.pcm16kSampleCount);
      let offset = 0;
      for (const piece of this.pcm16kChunks) {
        merged.set(piece, offset);
        offset += piece.length;
      }

      const duration = Math.round(performance.now() - this.chunkStartTime);

      // Retain final 0.5s as overlap prefix for the next chunk
      const tailStart = Math.max(0, merged.length - overlapSamples16k);
      const overlapTail = merged.slice(tailStart);
      this.pcm16kChunks = overlapTail.length > 0 ? [overlapTail] : [];
      this.pcm16kSampleCount = overlapTail.length;
      this.chunkStartTime = performance.now();

      // 4. Client-side VAD energy gate: skip uploading silent/empty chunks to save bandwidth & cost
      if (hasSpeechActivity(merged)) {
        const wavBlob = encodeWav16kHz(merged, TARGET_SAMPLE_RATE);
        this.onAudioChunk(wavBlob, 'audio/wav', duration);
      }
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
