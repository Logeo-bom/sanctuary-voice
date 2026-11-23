import { describe, expect, it, vi, afterEach } from 'vitest';
import { ChurchAudioEngine } from '../churchAudioEngine';
import type { AudioProcessingConfig } from '../../types/translator';

function createMockAudioContext() {
  const makeFilter = () => ({
    type: 'peaking',
    frequency: { value: 0 },
    Q: { value: 0 },
    gain: { value: 0 },
    connect(target: unknown) {
      return target;
    },
    disconnect: vi.fn(),
  });

  const makeGain = () => ({
    gain: { value: 1 },
    connect(target: unknown) {
      return target;
    },
    disconnect: vi.fn(),
  });

  const makeCompressor = () => ({
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 1 },
    attack: { value: 0 },
    release: { value: 0 },
    connect(target: unknown) {
      return target;
    },
    disconnect: vi.fn(),
  });

  const makeAnalyser = () => ({
    fftSize: 256,
    frequencyBinCount: 128,
    smoothingTimeConstant: 0.65,
    getFloatTimeDomainData: vi.fn(),
    getByteFrequencyData: vi.fn(),
    connect(target: unknown) {
      return target;
    },
    disconnect: vi.fn(),
  });

  const makeScriptProcessor = () => ({
    onaudioprocess: null as ((e: unknown) => void) | null,
    connect(target: unknown) {
      return target;
    },
    disconnect: vi.fn(),
  });

  return class MockAudioContext {
    public state = 'running';
    public sampleRate = 48000;
    public destination = {};
    public resume = vi.fn().mockResolvedValue(undefined);
    public close = vi.fn().mockResolvedValue(undefined);
    public createMediaStreamSource = vi.fn(() => ({
      connect(target: unknown) {
        return target;
      },
    }));
    public createBiquadFilter = vi.fn(() => makeFilter());
    public createGain = vi.fn(() => makeGain());
    public createDynamicsCompressor = vi.fn(() => makeCompressor());
    public createAnalyser = vi.fn(() => makeAnalyser());
    public createScriptProcessor = vi.fn(() => makeScriptProcessor());
  };
}

describe('ChurchAudioEngine DSP node configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('configures the speech-clarity DSP chain with exact recommended frequencies and compressor settings', async () => {
    const MockCtx = createMockAudioContext();
    const mockTrack = { stop: vi.fn() };
    const mockStream = {
      getTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
    };

    vi.stubGlobal('window', {
      AudioContext: MockCtx,
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    const config: AudioProcessingConfig = {
      bypassOsProcessing: true,
      highPassHz: 85,
      synthPadFilterEnabled: true,
      preAmpGainDb: 12,
      dynamicCompressorEnabled: true,
      silenceGateDb: -55,
      chunkDurationSec: 3.5,
      selectedDeviceId: 'default',
      audioSource: 'mic',
    };

    const engine = new ChurchAudioEngine(config, vi.fn(), vi.fn());
    await engine.start('mic');

    const dsp = engine.getDspNodeSnapshot();
    expect(dsp).not.toBeNull();
    expect(dsp?.highPassHz).toBe(85);
    expect(dsp?.synthNotchHz).toBe(280);
    expect(dsp?.synthNotchGainDb).toBe(-6);
    expect(dsp?.vocalPresenceHz).toBe(2800);
    expect(dsp?.vocalPresenceGainDb).toBe(2.5);
    expect(dsp?.deEsserHz).toBe(6500);
    expect(dsp?.deEsserGainDb).toBe(-2.5);
    expect(dsp?.highCutHz).toBe(14500);
    expect(dsp?.compressorThresholdDb).toBe(-20);
    expect(dsp?.compressorRatio).toBe(3);

    engine.stop();
    expect(mockTrack.stop).toHaveBeenCalledTimes(1);
  });
});
