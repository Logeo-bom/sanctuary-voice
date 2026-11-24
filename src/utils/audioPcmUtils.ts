export const TARGET_SAMPLE_RATE = 16000;
export const DEFAULT_VAD_RMS_THRESHOLD = 0.006;

/**
 * Downsamples mono Float32 PCM from the browser's hardware rate (typically 44.1kHz or 48kHz)
 * down to 16kHz using box-averaging to prevent aliasing while cutting upload bandwidth by ~3x.
 */
export function downsampleTo16kHz(
  samples: Float32Array,
  inputSampleRate: number,
  targetSampleRate = TARGET_SAMPLE_RATE
): Float32Array {
  if (samples.length === 0) return new Float32Array(0);
  if (inputSampleRate <= 0 || targetSampleRate <= 0 || inputSampleRate === targetSampleRate) {
    return new Float32Array(samples);
  }
  if (inputSampleRate < targetSampleRate) {
    return new Float32Array(samples);
  }

  const sampleRateRatio = inputSampleRate / targetSampleRate;
  const newLength = Math.floor(samples.length / sampleRateRatio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < samples.length; i++) {
      accum += samples[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/**
 * Converts normalized Float32 audio samples [-1.0, 1.0] into 16-bit signed linear PCM (little-endian).
 */
export function float32ToInt16Pcm(samples: Float32Array): Int16Array {
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return int16;
}

/**
 * Computes root-mean-square (RMS) energy of a Float32 PCM buffer.
 */
export function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
}

/**
 * Lightweight client-side Voice Activity Detection (VAD) energy gate.
 * Skips uploading silent or near-silent room-hum chunks to save bandwidth and API cost.
 */
export function hasSpeechActivity(
  samples: Float32Array,
  rmsThreshold = DEFAULT_VAD_RMS_THRESHOLD
): boolean {
  if (samples.length === 0) return false;
  // Check overall RMS or peak-window RMS so brief spoken words inside a 3.5s chunk are never dropped
  if (calculateRms(samples) >= rmsThreshold) {
    return true;
  }
  const windowSize = Math.min(samples.length, 3200); // ~200ms at 16kHz
  for (let start = 0; start < samples.length; start += windowSize) {
    const end = Math.min(start + windowSize, samples.length);
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += samples[i] * samples[i];
    }
    const windowRms = Math.sqrt(sum / (end - start));
    if (windowRms >= rmsThreshold * 1.4) {
      return true;
    }
  }
  return false;
}

/**
 * Scans audio after `minSamples` for a natural speech pause (RMS below `threshold`)
 * and returns its centre sample index, or `maxSamples` if no pause occurs before the cap.
 */
export function findSilenceCutIndex(
  samples: Float32Array,
  minSamples: number,
  maxSamples: number,
  windowSamples = 4800,
  threshold = 0.004
): number | null {
  if (minSamples <= 0 || samples.length < minSamples) {
    return null;
  }

  for (let start = minSamples; start < samples.length; start += windowSamples) {
    const end = Math.min(start + windowSamples, samples.length);
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / (end - start));
    if (rms < threshold) {
      return Math.floor((start + end) / 2);
    }
  }

  if (samples.length >= maxSamples) {
    return maxSamples;
  }

  return null;
}

/**
 * Encodes mono Float32 PCM samples into a standard 44-byte RIFF/WAVE 16-bit PCM ArrayBuffer.
 */
export function encodeWavBuffer(
  samples: Float32Array,
  sampleRate = TARGET_SAMPLE_RATE
): ArrayBuffer {
  const byteLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + byteLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + byteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeString(36, 'data');
  view.setUint32(40, byteLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

/**
 * Encodes mono Float32 PCM samples into a standalone audio/wav Blob.
 */
export function encodeWav16kHz(
  samples: Float32Array,
  sampleRate = TARGET_SAMPLE_RATE
): Blob {
  const buffer = encodeWavBuffer(samples, sampleRate);
  return new Blob([buffer], { type: 'audio/wav' });
}
