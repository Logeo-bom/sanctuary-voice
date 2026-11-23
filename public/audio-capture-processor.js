/**
 * Off-main-thread AudioWorkletProcessor for SanctuaryVoice.
 * Captures mono Float32 PCM frames from the DSP graph and forwards batched
 * ~2048-sample blocks to the main thread without UI jank on mobile devices.
 */
class SanctuaryPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 2048;
    this._buffer = new Float32Array(this._bufferSize);
    this._writeIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writeIndex++] = channelData[i];
      if (this._writeIndex >= this._bufferSize) {
        const out = this._buffer;
        this.port.postMessage(out, [out.buffer]);
        this._buffer = new Float32Array(this._bufferSize);
        this._writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('sanctuary-pcm-processor', SanctuaryPcmProcessor);
