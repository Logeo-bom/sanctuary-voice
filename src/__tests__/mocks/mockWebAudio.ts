import { vi } from 'vitest';

export class TrackedAudioParam {
  value: number;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  history: Array<{ type: string; value: number; time?: number }> = [];

  constructor(initial = 0) {
    this.value = initial;
    this.defaultValue = initial;
    this.minValue = -100;
    this.maxValue = 100;
  }

  setValueAtTime = vi.fn().mockImplementation((val: number, time?: number) => {
    this.value = val;
    this.history.push({ type: 'setValueAtTime', value: val, time });
  });

  linearRampToValueAtTime = vi.fn().mockImplementation((val: number, time?: number) => {
    this.value = val;
    this.history.push({ type: 'linearRampToValueAtTime', value: val, time });
  });

  exponentialRampToValueAtTime = vi.fn().mockImplementation((val: number, time?: number) => {
    this.value = val;
    this.history.push({ type: 'exponentialRampToValueAtTime', value: val, time });
  });

  setTargetAtTime = vi.fn().mockImplementation((val: number, time?: number) => {
    this.value = val;
    this.history.push({ type: 'setTargetAtTime', value: val, time });
  });
}

export class TrackedAudioNode {
  connectedTo: any[] = [];

  connect = vi.fn().mockImplementation((target: any) => {
    this.connectedTo.push(target);
    return target;
  });

  disconnect = vi.fn().mockImplementation(() => {
    this.connectedTo = [];
  });
}

export class TrackedBiquadFilterNode extends TrackedAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency: TrackedAudioParam = new TrackedAudioParam(350);
  Q: TrackedAudioParam = new TrackedAudioParam(1);
  gain: TrackedAudioParam = new TrackedAudioParam(0);
}

export class TrackedGainNode extends TrackedAudioNode {
  gain: TrackedAudioParam = new TrackedAudioParam(1);
}

export class TrackedDynamicsCompressorNode extends TrackedAudioNode {
  threshold: TrackedAudioParam = new TrackedAudioParam(-24);
  knee: TrackedAudioParam = new TrackedAudioParam(30);
  ratio: TrackedAudioParam = new TrackedAudioParam(12);
  attack: TrackedAudioParam = new TrackedAudioParam(0.003);
  release: TrackedAudioParam = new TrackedAudioParam(0.25);
}

export class TrackedAnalyserNode extends TrackedAudioNode {
  fftSize = 256;
  frequencyBinCount = 128;
  minDecibels = -100;
  maxDecibels = -30;
  smoothingTimeConstant = 0.8;

  customTimeDomainData?: Float32Array;
  customFreqData?: Uint8Array;

  getByteFrequencyData = vi.fn().mockImplementation((array: Uint8Array) => {
    if (this.customFreqData) {
      array.set(this.customFreqData);
    } else {
      array.fill(100);
    }
  });

  getFloatTimeDomainData = vi.fn().mockImplementation((array: Float32Array) => {
    if (this.customTimeDomainData) {
      array.set(this.customTimeDomainData);
    } else {
      array.fill(0.05);
    }
  });
}

export class TrackedMediaStreamDestinationNode extends TrackedAudioNode {
  stream: MediaStream;
  constructor() {
    super();
    this.stream = {
      getTracks: () => [],
      getAudioTracks: () => [],
    } as unknown as MediaStream;
  }
}

export class TrackedScriptProcessorNode extends TrackedAudioNode {
  bufferSize: number;
  inputChannels: number;
  outputChannels: number;
  onaudioprocess: ((e: any) => void) | null = null;

  constructor(bufferSize: number, inputChannels: number, outputChannels: number) {
    super();
    this.bufferSize = bufferSize;
    this.inputChannels = inputChannels;
    this.outputChannels = outputChannels;
  }
}

export class TrackedAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'running';
  sampleRate: number = 44100;
  currentTime: number = 0;
  destination: TrackedAudioNode = new TrackedAudioNode();

  createdBiquads: TrackedBiquadFilterNode[] = [];
  createdGains: TrackedGainNode[] = [];
  createdCompressors: TrackedDynamicsCompressorNode[] = [];
  createdAnalysers: TrackedAnalyserNode[] = [];
  createdScriptProcessors: TrackedScriptProcessorNode[] = [];

  createBiquadFilter = vi.fn().mockImplementation(() => {
    const node = new TrackedBiquadFilterNode();
    this.createdBiquads.push(node);
    return node;
  });

  createGain = vi.fn().mockImplementation(() => {
    const node = new TrackedGainNode();
    this.createdGains.push(node);
    return node;
  });

  createDynamicsCompressor = vi.fn().mockImplementation(() => {
    const node = new TrackedDynamicsCompressorNode();
    this.createdCompressors.push(node);
    return node;
  });

  createAnalyser = vi.fn().mockImplementation(() => {
    const node = new TrackedAnalyserNode();
    this.createdAnalysers.push(node);
    return node;
  });

  createMediaStreamSource = vi.fn().mockImplementation(() => new TrackedAudioNode());

  createMediaStreamDestination = vi.fn().mockImplementation(() => new TrackedMediaStreamDestinationNode());

  createScriptProcessor = vi.fn().mockImplementation((buf: number, inCh: number, outCh: number) => {
    const node = new TrackedScriptProcessorNode(buf, inCh, outCh);
    this.createdScriptProcessors.push(node);
    return node;
  });

  resume = vi.fn().mockResolvedValue(undefined);
  suspend = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}
