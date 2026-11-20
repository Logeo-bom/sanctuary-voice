import type { AudioMeterSnapshot, AudioProcessingConfig } from '../types/translator';

export type AudioChunkCallback = (audioBlob: Blob, mimeType: string, durationMs: number) => void;
export type AudioStreamingSliceCallback = (sliceBlob: Blob) => void;
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
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  private continuousStreamingRecorder: MediaRecorder | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private accumulatedSlices: Blob[] = [];
  private segmentStartTime = 0;
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
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: !this.config.bypassOsProcessing,
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

    // 4. De-Esser Notch (Bard's sheet: manual EQ notch around 5-10kHz to soften harsh 's' and 'sh' from PA)
    this.deEsserNode = this.audioContext.createBiquadFilter();
    this.deEsserNode.type = 'peaking';
    this.deEsserNode.frequency.value = 6500;
    this.deEsserNode.Q.value = 1.5;
    this.deEsserNode.gain.value = -2.0;

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

    // 9. Destination stream carrying pristine DSP-boosted audio to the AI recorder
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    // Studio-grade vocal DSP chain:
    // source -> highPass (85Hz) -> synthNotch (280Hz) -> midBoost (2.8kHz) -> deEsser (6.5kHz) -> highCut (14.5kHz) -> preAmp -> compressor (-20dB 3:1) -> analyser -> destination
    this.sourceNode
      .connect(this.highPassNode)
      .connect(this.synthNotchNode)
      .connect(this.vocalPresenceNode)
      .connect(this.deEsserNode)
      .connect(this.highCutNode)
      .connect(this.preAmpGainNode)
      .connect(this.compressorNode)
      .connect(this.analyserNode);

    this.compressorNode.connect(this.destinationNode);

    this.isRunning = true;
    this.startMeterLoop();
    this.startUnifiedRecorder();
  }

  public updateConfig(newConfig: Partial<AudioProcessingConfig>): void {
    const prevBypass = this.config.bypassOsProcessing;
    const prevDevice = this.config.selectedDeviceId;
    const prevChunkSec = this.config.chunkDurationSec;

    this.config = { ...this.config, ...newConfig };

    if (this.highPassNode && newConfig.highPassHz !== undefined) {
      this.highPassNode.frequency.value = newConfig.highPassHz;
    }

    if (this.synthNotchNode && this.vocalPresenceNode && newConfig.synthPadFilterEnabled !== undefined) {
      this.synthNotchNode.gain.value = newConfig.synthPadFilterEnabled ? -6.5 : 0;
      this.vocalPresenceNode.gain.value = newConfig.synthPadFilterEnabled ? 5.5 : 0;
    }

    if (this.preAmpGainNode && newConfig.preAmpGainDb !== undefined) {
      this.preAmpGainNode.gain.value = this.dbToLinear(newConfig.preAmpGainDb);
    }

    if (this.compressorNode && newConfig.dynamicCompressorEnabled !== undefined) {
      this.compressorNode.threshold.value = newConfig.dynamicCompressorEnabled ? -30 : -6;
      this.compressorNode.ratio.value = newConfig.dynamicCompressorEnabled ? 6 : 1.5;
    }

    if (this.isRunning && (prevBypass !== this.config.bypassOsProcessing || prevDevice !== this.config.selectedDeviceId)) {
      void this.restart();
    } else if (this.isRunning && prevChunkSec !== this.config.chunkDurationSec) {
      this.restartSegmentedRecorder();
    }
  }

  public async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  public stop(): void {
    this.isRunning = false;
    this.accumulatedSlices = [];

    if (this.meterFrameId !== null) {
      window.cancelAnimationFrame(this.meterFrameId);
      this.meterFrameId = null;
    }

    if (this.continuousStreamingRecorder && this.continuousStreamingRecorder.state !== 'inactive') {
      try {
        this.continuousStreamingRecorder.stop();
      } catch {
        // Ignore
      }
    }
    this.continuousStreamingRecorder = null;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignore recorder stop errors during teardown
      }
    }
    this.mediaRecorder = null;

    if (this.rawStream) {
      this.rawStream.getTracks().forEach((track) => track.stop());
      this.rawStream = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }

  private getSupportedMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const mime of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return '';
  }

  public restartContinuousStreamRecorder(): void {
    if (!this.isRunning || !this.destinationNode) return;
    if (this.continuousStreamingRecorder && this.continuousStreamingRecorder.state !== 'inactive') {
      try {
        this.continuousStreamingRecorder.ondataavailable = null;
        this.continuousStreamingRecorder.stop();
      } catch {
        // Ignore stop errors
      }
    }
    this.continuousStreamingRecorder = null;
    this.startUnifiedRecorder();
  }

  private startUnifiedRecorder(): void {
    if (!this.destinationNode || !this.isRunning) return;

    const mimeType = this.getSupportedMimeType();
    try {
      const recorder = mimeType
        ? new MediaRecorder(this.destinationNode.stream, { mimeType, audioBitsPerSecond: 64000 })
        : new MediaRecorder(this.destinationNode.stream);

      this.accumulatedSlices = [];
      this.segmentStartTime = performance.now();

      recorder.ondataavailable = (ev) => {
        if (!ev.data || ev.data.size === 0 || !this.isRunning) return;

        // 1. Instant 250ms streaming slice for Live WebSocket
        this.onStreamingSlice?.(ev.data);

        // 2. Accumulate slices for 3.5s watchdog REST chunk
        this.accumulatedSlices.push(ev.data);
        const elapsed = performance.now() - this.segmentStartTime;
        const targetDurationMs = (this.config.chunkDurationSec || 3.5) * 1000;

        if (elapsed >= targetDurationMs) {
          if (this.accumulatedSlices.length > 0) {
            const actualMime = recorder.mimeType || mimeType || 'audio/webm';
            const chunkBlob = new Blob(this.accumulatedSlices, { type: actualMime });
            const duration = Math.round(elapsed);
            this.accumulatedSlices = [];
            this.segmentStartTime = performance.now();
            this.onAudioChunk(chunkBlob, actualMime, duration);
          }
        }
      };

      recorder.onerror = (e) => {
        console.warn('[ChurchAudioEngine] Unified recorder error, restarting:', e);
        if (this.isRunning) {
          window.setTimeout(() => this.startUnifiedRecorder(), 500);
        }
      };

      this.continuousStreamingRecorder = recorder;
      recorder.start(250);
    } catch (err) {
      console.error('[ChurchAudioEngine] Failed to start unified audio recorder:', err);
    }
  }

  private restartSegmentedRecorder(): void {
    this.restartContinuousStreamRecorder();
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
