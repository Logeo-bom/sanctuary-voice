import type { AudioMeterSnapshot, AudioProcessingConfig } from '../types/translator';

export type AudioChunkCallback = (audioBlob: Blob, mimeType: string, durationMs: number) => void;
export type MeterUpdateCallback = (snapshot: AudioMeterSnapshot) => void;

export class ChurchAudioEngine {
  private audioContext: AudioContext | null = null;
  private rawStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highPassNode: BiquadFilterNode | null = null;
  private synthNotchNode: BiquadFilterNode | null = null;
  private vocalPresenceNode: BiquadFilterNode | null = null;
  private preAmpGainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private chunkIntervalId: number | null = null;
  private meterFrameId: number | null = null;
  private isRunning = false;
  private config: AudioProcessingConfig;
  private onAudioChunk: AudioChunkCallback;
  private onMeterUpdate: MeterUpdateCallback;
  private hadVoiceInCurrentWindow = false;
  private chunkStartTime = 0;

  constructor(
    config: AudioProcessingConfig,
    onAudioChunk: AudioChunkCallback,
    onMeterUpdate: MeterUpdateCallback
  ) {
    this.config = { ...config };
    this.onAudioChunk = onAudioChunk;
    this.onMeterUpdate = onMeterUpdate;
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

  public async start(): Promise<void> {
    if (this.isRunning) return;

    // Crucial for Android Church Back-Row Capture:
    // Disabling OS noiseSuppression & autoGainControl stops Android from treating
    // distant PA loudspeakers or reverberant sanctuary speech as "background noise".
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: !this.config.bypassOsProcessing,
      noiseSuppression: !this.config.bypassOsProcessing,
      autoGainControl: !this.config.bypassOsProcessing,
      channelCount: 1,
      sampleRate: 16000,
    };

    if (this.config.selectedDeviceId && this.config.selectedDeviceId !== 'default') {
      audioConstraints.deviceId = { exact: this.config.selectedDeviceId };
    }

    this.rawStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioCtx({ sampleRate: 16000 });

    this.sourceNode = this.audioContext.createMediaStreamSource(this.rawStream);

    // 1. High-Pass Filter (cuts stage rumble, AC hum, and synth sub-bass below 85Hz-120Hz)
    this.highPassNode = this.audioContext.createBiquadFilter();
    this.highPassNode.type = 'highpass';
    this.highPassNode.frequency.value = this.config.highPassHz;
    this.highPassNode.Q.value = 0.707;

    // 2. Synth Pad Cut Filter (attenuates warm worship pad mud around 280Hz)
    this.synthNotchNode = this.audioContext.createBiquadFilter();
    this.synthNotchNode.type = 'peaking';
    this.synthNotchNode.frequency.value = 280;
    this.synthNotchNode.Q.value = 1.2;
    this.synthNotchNode.gain.value = this.config.synthPadFilterEnabled ? -6.5 : 0;

    // 3. Vocal Formant Presence Boost (boosts 2.4kHz human consonant clarity over music)
    this.vocalPresenceNode = this.audioContext.createBiquadFilter();
    this.vocalPresenceNode.type = 'peaking';
    this.vocalPresenceNode.frequency.value = 2400;
    this.vocalPresenceNode.Q.value = 1.0;
    this.vocalPresenceNode.gain.value = this.config.synthPadFilterEnabled ? 5.5 : 0;

    // 4. Back-Row Pre-Amp Gain Boost (0 dB to +24 dB linear conversion)
    this.preAmpGainNode = this.audioContext.createGain();
    this.preAmpGainNode.gain.value = this.dbToLinear(this.config.preAmpGainDb);

    // 5. Dynamic Range Compressor (levels quiet prayers vs loud preaching)
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = this.config.dynamicCompressorEnabled ? -30 : -6;
    this.compressorNode.knee.value = 20;
    this.compressorNode.ratio.value = this.config.dynamicCompressorEnabled ? 6 : 1.5;
    this.compressorNode.attack.value = 0.004;
    this.compressorNode.release.value = 0.22;

    // 6. Analyser for live dB meter & vocal formant detection
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.65;

    // 7. Destination stream carrying the DSP-boosted audio to the AI recorder
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    // Connect DSP graph
    this.sourceNode
      .connect(this.highPassNode)
      .connect(this.synthNotchNode)
      .connect(this.vocalPresenceNode)
      .connect(this.preAmpGainNode)
      .connect(this.compressorNode)
      .connect(this.analyserNode);

    this.compressorNode.connect(this.destinationNode);

    this.isRunning = true;
    this.startMeterLoop();
    this.startSegmentedRecorder();
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

    if (this.chunkIntervalId !== null) {
      window.clearInterval(this.chunkIntervalId);
      this.chunkIntervalId = null;
    }

    if (this.meterFrameId !== null) {
      window.cancelAnimationFrame(this.meterFrameId);
      this.meterFrameId = null;
    }

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

  private startSegmentedRecorder(): void {
    if (!this.destinationNode || !this.isRunning) return;

    const mimeType = this.getSupportedMimeType();
    const recordSegment = () => {
      if (!this.isRunning || !this.destinationNode) return;

      const chunks: BlobPart[] = [];
      this.hadVoiceInCurrentWindow = false;
      this.chunkStartTime = performance.now();

      try {
        const recorder = mimeType
          ? new MediaRecorder(this.destinationNode.stream, { mimeType, audioBitsPerSecond: 32000 })
          : new MediaRecorder(this.destinationNode.stream);

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            chunks.push(ev.data);
          }
        };

        recorder.onstop = () => {
          const durationMs = Math.round(performance.now() - this.chunkStartTime);
          if (chunks.length > 0 && this.hadVoiceInCurrentWindow) {
            const actualMime = recorder.mimeType || mimeType || 'audio/webm';
            const blob = new Blob(chunks, { type: actualMime });
            if (blob.size > 400) {
              this.onAudioChunk(blob, actualMime, durationMs);
            }
          }
        };

        this.mediaRecorder = recorder;
        recorder.start();
      } catch (err) {
        console.error('Failed to start segmented audio recorder:', err);
      }
    };

    recordSegment();

    const intervalMs = Math.max(2500, Math.min(8000, this.config.chunkDurationSec * 1000));
    this.chunkIntervalId = window.setInterval(() => {
      if (!this.isRunning) return;
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        try {
          this.mediaRecorder.stop();
        } catch {
          // Ignore stop race condition
        }
      }
      recordSegment();
    }, intervalMs);
  }

  private restartSegmentedRecorder(): void {
    if (this.chunkIntervalId !== null) {
      window.clearInterval(this.chunkIntervalId);
      this.chunkIntervalId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignore
      }
    }
    this.startSegmentedRecorder();
  }

  private startMeterLoop(): void {
    if (!this.analyserNode) return;
    const timeDomain = new Float32Array(this.analyserNode.fftSize);
    const freqDomain = new Uint8Array(this.analyserNode.frequencyBinCount);

    const update = () => {
      if (!this.isRunning || !this.analyserNode) return;

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

      const isVoiceDetected = rmsDb > this.config.silenceGateDb && vocalBandAvg > 26;
      if (isVoiceDetected) {
        this.hadVoiceInCurrentWindow = true;
      }

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
