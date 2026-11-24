import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Web Audio API
class MockAudioNode {
  connect = vi.fn().mockReturnValue(this);
  disconnect = vi.fn();
}

class MockAudioParam {
  value: number;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  constructor(initial = 0) {
    this.value = initial;
    this.defaultValue = initial;
    this.minValue = -100;
    this.maxValue = 100;
  }
  setValueAtTime = vi.fn().mockImplementation((val: number) => {
    this.value = val;
  });
  linearRampToValueAtTime = vi.fn().mockImplementation((val: number) => {
    this.value = val;
  });
  exponentialRampToValueAtTime = vi.fn().mockImplementation((val: number) => {
    this.value = val;
  });
  setTargetAtTime = vi.fn().mockImplementation((val: number) => {
    this.value = val;
  });
}

class MockBiquadFilterNode extends MockAudioNode {
  type: string = 'lowpass';
  frequency: MockAudioParam = new MockAudioParam(350);
  Q: MockAudioParam = new MockAudioParam(1);
  gain: MockAudioParam = new MockAudioParam(0);
}

class MockGainNode extends MockAudioNode {
  gain: MockAudioParam = new MockAudioParam(1);
}

class MockDynamicsCompressorNode extends MockAudioNode {
  threshold: MockAudioParam = new MockAudioParam(-24);
  knee: MockAudioParam = new MockAudioParam(30);
  ratio: MockAudioParam = new MockAudioParam(12);
  attack: MockAudioParam = new MockAudioParam(0.003);
  release: MockAudioParam = new MockAudioParam(0.25);
}

class MockAnalyserNode extends MockAudioNode {
  fftSize = 2048;
  frequencyBinCount = 1024;
  minDecibels = -100;
  maxDecibels = -30;
  smoothingTimeConstant = 0.8;
  getByteFrequencyData = vi.fn((array: Uint8Array) => {
    array.fill(128);
  });
  getByteTimeDomainData = vi.fn((array: Uint8Array) => {
    array.fill(128);
  });
  getFloatTimeDomainData = vi.fn((array: Float32Array) => {
    array.fill(0);
  });
}

class MockMediaStreamAudioSourceNode extends MockAudioNode {
  mediaStream: MediaStream;
  constructor(stream: MediaStream) {
    super();
    this.mediaStream = stream;
  }
}

class MockScriptProcessorNode extends MockAudioNode {
  onaudioprocess: ((e: any) => void) | null = null;
  bufferSize: number;
  constructor(bufferSize: number) {
    super();
    this.bufferSize = bufferSize;
  }
}

class MockAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'running';
  sampleRate: number = 44100;
  currentTime: number = 0;
  destination: MockAudioNode = new MockAudioNode();

  createBiquadFilter = vi.fn(() => new MockBiquadFilterNode());
  createGain = vi.fn(() => new MockGainNode());
  createDynamicsCompressor = vi.fn(() => new MockDynamicsCompressorNode());
  createAnalyser = vi.fn(() => new MockAnalyserNode());
  createMediaStreamSource = vi.fn((stream: MediaStream) => new MockMediaStreamAudioSourceNode(stream));
  createScriptProcessor = vi.fn((bufferSize: number) => new MockScriptProcessorNode(bufferSize));

  resume = vi.fn().mockImplementation(async () => {
    this.state = 'running';
  });
  suspend = vi.fn().mockImplementation(async () => {
    this.state = 'suspended';
  });
  close = vi.fn().mockImplementation(async () => {
    this.state = 'closed';
  });
}

// Assign to window
if (typeof window !== 'undefined') {
  (window as any).AudioContext = MockAudioContext;
  (window as any).webkitAudioContext = MockAudioContext;

  // Mock SpeechSynthesis
  const mockSpeechSynthesis = {
    speaking: false,
    paused: false,
    pending: false,
    onvoiceschanged: null,
    getVoices: vi.fn().mockReturnValue([
      { name: 'Google US English', lang: 'en-US', default: true },
      { name: 'Google Español', lang: 'es-ES', default: false },
    ]),
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  Object.defineProperty(window, 'speechSynthesis', {
    value: mockSpeechSynthesis,
    writable: true,
  });

  // Mock SpeechSynthesisUtterance
  (window as any).SpeechSynthesisUtterance = class {
    text: string;
    lang: string = 'en-US';
    rate: number = 1.0;
    pitch: number = 1.0;
    volume: number = 1.0;
    onend: (() => void) | null = null;
    onerror: ((e: any) => void) | null = null;
    constructor(text = '') {
      this.text = text;
    }
  };

  // Mock navigator.mediaDevices
  if (!navigator.mediaDevices) {
    (navigator as any).mediaDevices = {};
  }
  navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [
      {
        stop: vi.fn(),
        kind: 'audio',
        enabled: true,
      },
    ],
    getAudioTracks: () => [
      {
        stop: vi.fn(),
        kind: 'audio',
        enabled: true,
      },
    ],
  });

  // Mock ResizeObserver
  (window as any).ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
}

// Mock @capacitor/app
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn().mockResolvedValue({
      remove: vi.fn(),
    }),
    removeAllListeners: vi.fn(),
    exitApp: vi.fn(),
  },
}));
