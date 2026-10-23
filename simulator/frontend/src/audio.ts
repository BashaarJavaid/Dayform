// Mic capture (16 kHz PCM16 via AudioWorklet) and playback of Alexa's voice (24 kHz PCM16) with a level meter.
// Wire format per packages/contracts/src/events.ts: base64 PCM16 mono. Playback scheduling as in smoke/nova-sonic/index.html.
import workletUrl from "./mic-worklet.js?url";

const toB64 = (buf: ArrayBuffer) => {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

export class Speaker {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private next = 0;
  private sources: AudioBufferSourceNode[] = [];
  private bins = new Uint8Array(256);

  /** Create or resume the context; call from a user gesture so autoplay rules allow sound. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 24000 });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  play(b64: string) {
    this.unlock();
    const ctx = this.ctx!;
    const bin = atob(b64);
    const n = bin.length >> 1;
    if (!n) return;
    const buf = ctx.createBuffer(1, n, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      if (v >= 32768) v -= 65536;
      ch[i] = v / 32768;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser!);
    this.next = Math.max(this.next, ctx.currentTime + 0.05);
    src.start(this.next);
    this.next += buf.duration;
    this.sources.push(src);
    src.onended = () => (this.sources = this.sources.filter((x) => x !== src));
  }

  /** Barge-in: drop everything queued. */
  stop() {
    for (const s of this.sources) try { s.stop(); } catch {}
    this.sources = [];
    this.next = 0;
  }

  get playing() {
    return this.sources.length > 0;
  }

  /** 0..1 loudness of what is playing now. */
  level() {
    if (!this.analyser || !this.sources.length) return 0;
    this.analyser.getByteTimeDomainData(this.bins);
    let sum = 0;
    for (const b of this.bins) sum += ((b - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / this.bins.length) * 4);
  }
}

export class Mic {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  /** Called with each 32 ms frame (base64 PCM16 16 kHz) and its RMS level. */
  onFrame: (b64: string, rms: number) => void = () => {};

  get on() {
    return !!this.stream;
  }

  async start() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 16000 }); // Chrome resamples the mic to 16 kHz
      await this.ctx.audioWorklet.addModule(workletUrl);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "mic-capture");
    this.node.port.onmessage = (e) => this.onFrame(toB64(e.data.pcm), e.data.rms);
    src.connect(this.node);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node?.disconnect();
    this.stream = null;
    this.node = null;
  }
}
