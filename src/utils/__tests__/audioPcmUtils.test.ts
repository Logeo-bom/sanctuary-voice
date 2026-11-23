import { describe, expect, it } from 'vitest';
import {
  TARGET_SAMPLE_RATE,
  calculateRms,
  downsampleTo16kHz,
  encodeWavBuffer,
  float32ToInt16Pcm,
  hasSpeechActivity,
} from '../audioPcmUtils';

describe('audioPcmUtils', () => {
  it('downsamples 48kHz PCM to 16kHz cleanly (exact 3:1 ratio)', () => {
    const input = new Float32Array(4800);
    for (let i = 0; i < input.length; i++) {
      input[i] = 0.5;
    }
    const downsampled = downsampleTo16kHz(input, 48000, TARGET_SAMPLE_RATE);
    expect(downsampled.length).toBe(1600);
    expect(downsampled[0]).toBeCloseTo(0.5, 4);
    expect(downsampled[1599]).toBeCloseTo(0.5, 4);
  });

  it('converts normalized Float32 samples into clamped 16-bit signed PCM', () => {
    const samples = new Float32Array([-1.5, -1.0, 0, 0.5, 1.0, 1.5]);
    const pcm = float32ToInt16Pcm(samples);
    expect(pcm[0]).toBe(-32768);
    expect(pcm[1]).toBe(-32768);
    expect(pcm[2]).toBe(0);
    expect(pcm[3]).toBe(16384);
    expect(pcm[4]).toBe(32767);
    expect(pcm[5]).toBe(32767);
  });

  it('produces a valid 44-byte RIFF/WAVE header for 16kHz mono PCM', () => {
    const samples = new Float32Array(1600);
    const buffer = encodeWavBuffer(samples, 16000);
    const view = new DataView(buffer);

    const readStr = (offset: number, len: number) =>
      String.fromCharCode(...new Uint8Array(buffer, offset, len));

    expect(buffer.byteLength).toBe(44 + 1600 * 2);
    expect(readStr(0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 1600 * 2);
    expect(readStr(8, 4)).toBe('WAVE');
    expect(readStr(12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // Mono
    expect(view.getUint32(24, true)).toBe(16000); // Sample rate
    expect(view.getUint32(28, true)).toBe(32000); // Byte rate
    expect(view.getUint16(34, true)).toBe(16); // Bits per sample
    expect(readStr(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(1600 * 2);
  });

  it('detects silence vs speech activity via VAD energy gate', () => {
    const silence = new Float32Array(16000);
    const quietHum = new Float32Array(16000).fill(0.001);
    const speech = new Float32Array(16000);
    for (let i = 0; i < speech.length; i++) {
      speech[i] = Math.sin(i * 0.1) * 0.15;
    }

    expect(calculateRms(silence)).toBe(0);
    expect(hasSpeechActivity(silence)).toBe(false);
    expect(hasSpeechActivity(quietHum)).toBe(false);
    expect(hasSpeechActivity(speech)).toBe(true);
  });

  it('triggers VAD when a brief spoken phrase appears inside a mostly quiet chunk', () => {
    const mostlyQuiet = new Float32Array(16000 * 3);
    // Inject a 300ms spoken burst
    for (let i = 10000; i < 14800; i++) {
      mostlyQuiet[i] = Math.sin(i * 0.2) * 0.08;
    }
    expect(hasSpeechActivity(mostlyQuiet)).toBe(true);
  });
});
