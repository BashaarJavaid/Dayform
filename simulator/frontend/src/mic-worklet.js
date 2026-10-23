// AudioWorklet: mic samples (context runs at 16 kHz) -> 512-sample Int16 frames (32 ms) posted to the main thread.
class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(512);
    this.n = 0;
    this.sum = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const v = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = v * 0x7fff;
      this.sum += v * v;
      if (this.n === this.buf.length) {
        this.port.postMessage({ pcm: this.buf.buffer, rms: Math.sqrt(this.sum / this.n) }, [this.buf.buffer]);
        this.buf = new Int16Array(512);
        this.n = 0;
        this.sum = 0;
      }
    }
    return true;
  }
}
registerProcessor("mic-capture", MicCapture);
