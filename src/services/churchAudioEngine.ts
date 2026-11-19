import type { AudioMeterSnapshot, AudioProcessingConfig } from '../types/translator';

export type AudioChunkCallback = (audioBlob: Blob, mimeType: string, durationMs: number) => void;
export type AudioStreamingSliceCallback = (pcmBuffer: ArrayBuffer) => void;
export type MeterUpdateCallback = (snapshot: AudioMeterSnapshot) => void;
export type StreamEndedCallback = () => void;

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
  private pcmProcessorNode: ScriptProcessorNode | null = null;
  private silentSinkNode: GainNode | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private useSegmentedRecorder = false;
  private accumulatedSlices: Blob[] = [];
  private segmentStartTime = 0;
  private meterFrameId: number | null = null;
  private isRunning = false;
  private isHandlingDeviceChange = false;
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

  public static async findPreferredBuiltInMicId(): Promise<string | null> {
    try {
      const inputs = await ChurchAudioEngine.listAudioInputDevices();
      const headsetPattern = /bluetooth|hands-?free|headset|airpods|buds|earbuds|earphone|tws|sco|hfp/i;
      const builtInPattern = /built-?in|internal|phone|microphone|speakerphone|bottom|main|camcorder/i;

      // Prefer an explicitly labeled built-in phone mic over Bluetooth/earbud mics
      const explicitBuiltIn = inputs.find(
        (d) =>
          d.deviceId &&
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications' &&
          d.label &&
          builtInPattern.test(d.label) &&
          !headsetPattern.test(d.label)
      );
      if (explicitBuiltIn) return explicitBuiltIn.deviceId;

      // Otherwise pick any non-Bluetooth, non-headset concrete input device
      const nonHeadset = inputs.find(
        (d) =>
          d.deviceId &&
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications' &&
          d.label &&
          !headsetPattern.test(d.label)
      );
      return nonHeadset ? nonHeadset.deviceId : null;
    } catch {
      return null;
    }
  }

  private handleDeviceChange = async (): Promise<void> => {
    if (!this.isRunning || this.isHandlingDeviceChange || this.config.audioSource === 'tab') return;
    if (this.config.selectedDeviceId && this.config.selectedDeviceId !== 'default') return;

    const currentTrack = this.rawStream?.getAudioTracks()[0];
    const currentLabel = currentTrack?.label || '';
    const isUsingHeadsetMic = /bluetooth|hands-?free|headset|airpods|buds|earbuds|earphone|tws|sco|hfp/i.test(
      currentLabel
    );

    if (isUsingHeadsetMic) {
      const builtInId = await ChurchAudioEngine.findPreferredBuiltInMicId();
      if (builtInId && builtInId !== currentTrack?.getSettings()?.deviceId) {
        this.isHandlingDeviceChange = true;
        try {
          await this.restart();
        } finally {
          this.isHandlingDeviceChange = false;
        }
      }
    }
  };

  public async start(
    sourceOverride?: 'mic' | 'tab',
    enableSegmentedRecorder = true
  ): Promise<void> {
    if (this.isRunning) return;
    this.useSegmentedRecorder = enableSegmentedRecorder;

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
      } else {
        // Auto-prefer the phone's built-in microphone over Bluetooth/earbud mics
        // so earphones play translated audio while the phone captures the pulpit PA
        const builtInMicId = await ChurchAudioEngine.findPreferredBuiltInMicId();
        if (builtInMicId) {
          audioConstraints.deviceId = { ideal: builtInMicId };
        }
      }

      this.rawStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      if (navigator.mediaDevices?.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
      }
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // Mobile browsers (Chrome/Safari) work reliably when using the hardware default sampleRate (44100 or 48000)
    this.audioContext = new AudioCtx();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.rawStream);

    // 1. High-Pass Filter (cuts stage rumble, AC hum, and synth sub-bass below 85Hz-120Hz)
    this.highPassNode = this.audioContext.createBiquadFilter();
    this.highPassNode.type = 'highpass';
    this.highPassNode.frequency.value = this.config.highPassHz || 90;
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

    // Pristine, ultra-reliable hardware DSP chain:
    // source -> highPass -> synthNotch -> vocalPresence -> preAmp -> compressor -> analyser -> destination
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
    if (this.onStreamingSlice) {
      this.startPcmStreamer();
    }
    if (this.useSegmentedRecorder) {
      this.startSegmentedRecorder();
    }
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
    } else if (this.isRunning && this.useSegmentedRecorder && prevChunkSec !== this.config.chunkDurationSec) {
      this.restartSegmentedRecorder();
    }
  }

  public async restart(): Promise<void> {
    const keepSegmented = this.useSegmentedRecorder;
    this.stop();
    await this.start(undefined, keepSegmented);
  }

  public stop(): void {
    this.isRunning = false;
    this.accumulatedSlices = [];

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange);
    }

    if (this.meterFrameId !== null) {
      window.cancelAnimationFrame(this.meterFrameId);
      this.meterFrameId = null;
    }

    if (this.pcmProcessorNode) {
      try {
        this.pcmProcessorNode.onaudioprocess = null;
        this.pcmProcessorNode.disconnect();
      } catch {
        // Ignore
      }
      this.pcmProcessorNode = null;
    }

    if (this.silentSinkNode) {
      try {
        this.silentSinkNode.disconnect();
      } catch {
        // Ignore
      }
      this.silentSinkNode = null;
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

  /**
   * Streams raw 16kHz mono signed 16-bit PCM (linear16) directly to Deepgram Live WebSocket.
   * Unlike WebM/MediaRecorder, raw PCM has no container headers, so WebSocket reconnects and
   * mid-sermon language switches are 100% seamless with ~85ms frame latency.
   */
  private startPcmStreamer(): void {
    if (!this.audioContext || !this.compressorNode || !this.isRunning || !this.onStreamingSlice) return;

    try {
      const targetSampleRate = 16000;
      const inputSampleRate = this.audioContext.sampleRate;
      const bufferSize = 4096;

      const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      const silentSink = this.audioContext.createGain();
      silentSink.gain.value = 0;

      processor.onaudioprocess = (ev) => {
        if (!this.isRunning || !this.onStreamingSlice) return;
        const inputData = ev.inputBuffer.getChannelData(0);
        const pcm16 = this.downsampleToInt16(inputData, inputSampleRate, targetSampleRate);
        if (pcm16.byteLength > 0) {
          const slice = pcm16.buffer.slice(pcm16.byteOffset, pcm16.byteOffset + pcm16.byteLength) as ArrayBuffer;
          this.onStreamingSlice(slice);
        }
      };

      this.compressorNode.connect(processor);
      processor.connect(silentSink);
      silentSink.connect(this.audioContext.destination);

      this.pcmProcessorNode = processor;
      this.silentSinkNode = silentSink;
    } catch (err) {
      console.warn('Failed to start 16kHz PCM streamer:', err);
    }
  }

  private downsampleToInt16(
    input: Float32Array,
    inputSampleRate: number,
    targetSampleRate: number
  ): Int16Array {
    if (inputSampleRate === targetSampleRate) {
      const out = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return out;
    }

    const ratio = inputSampleRate / targetSampleRate;
    const outputLength = Math.max(1, Math.floor(input.length / ratio));
    const out = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIdx = i * ratio;
      const idx0 = Math.floor(srcIdx);
      const idx1 = Math.min(idx0 + 1, input.length - 1);
      const frac = srcIdx - idx0;
      const sample = input[idx0] * (1 - frac) + input[idx1] * frac;
      const clamped = Math.max(-1, Math.min(1, sample));
      out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    return out;
  }

  private startSegmentedRecorder(): void {
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

        // Accumulate slices for REST / Gemini full-segment translation
        this.accumulatedSlices.push(ev.data);
        const elapsed = performance.now() - this.segmentStartTime;
        const targetDurationMs = (this.config.chunkDurationSec || 3.5) * 1000;

        if (elapsed >= targetDurationMs) {
          if (recorder.state === 'recording') {
            try {
              recorder.stop();
            } catch {}
          }
        }
      };

      recorder.onstop = () => {
        if (this.accumulatedSlices.length > 0) {
          const actualMime = recorder.mimeType || mimeType || 'audio/webm';
          const fullBlob = new Blob(this.accumulatedSlices, { type: actualMime });
          const duration = Math.round(performance.now() - this.segmentStartTime);
          this.accumulatedSlices = [];
          this.onAudioChunk(fullBlob, actualMime, duration);
        }

        // Seamlessly start the next recording segment with a fresh WebM container header
        if (this.isRunning) {
          this.startSegmentedRecorder();
        }
      };

      this.mediaRecorder = recorder;
      recorder.start(250);
    } catch (err) {
      console.error('Failed to start continuous audio recorder:', err);
    }
  }

  private restartSegmentedRecorder(): void {
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
      // Dynamically calculate FFT bins using actual hardware sampleRate (16kHz / 44.1kHz / 48kHz)
      const nyquist = (this.audioContext?.sampleRate || 48000) / 2;
      const binHz = nyquist / freqDomain.length;
      const lowBin = Math.max(1, Math.floor(300 / binHz));
      const highBin = Math.min(freqDomain.length - 1, Math.ceil(3400 / binHz));
      let vocalBandSum = 0;
      const binCount = Math.max(1, highBin - lowBin + 1);
      for (let bin = lowBin; bin <= highBin; bin++) {
        vocalBandSum += freqDomain[bin];
      }
      const vocalBandAvg = vocalBandSum / binCount;

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
