// Synthesized sound effects using Web Audio API.
// Zero asset cost: every sound is generated on the fly from oscillators or
// short procedural noise buffers, so the PWA bundle stays small and the
// game works offline immediately.

export class SoundFX {
  private ctx: AudioContext | null = null;
  private rollSource: AudioBufferSourceNode | null = null;
  private rollGain: GainNode | null = null;
  // Default to muted — matches the SDK's "muted by default" semantics so
  // we never play a sound before React has had a chance to sync state.
  private muted = true;

  /**
   * Wire the platform mute toggle. Pass the current `muted` state from
   * `useSound()` in the React layer. When muted, every public method
   * becomes a no-op and any in-flight rolling sound is stopped.
   */
  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stopRoll();
  }

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (this.ctx) return this.ctx;
    type Win = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as Win).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }

  // Short noise burst, lowpass filtered, with a fast decay. Sounds like a
  // wooden clatter. Scale the volume by `intensity` (0..1) to differentiate
  // a glancing nick from a full strike collision.
  pinHit(intensity = 1) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const dur = 0.18;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    const decayRate = ctx.sampleRate * 0.04;
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / decayRate);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1500 + Math.random() * 2000;
    const gain = ctx.createGain();
    gain.gain.value = 0.25 * intensity;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  // Looping low rumble for as long as the ball is rolling. Brown-noise
  // approximation through a one-pole IIR filter, then lowpassed hard.
  startRoll() {
    const ctx = this.ensureCtx();
    if (!ctx || this.rollSource) return;
    const bufSize = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      const v = (last + 0.02 * white) / 1.02;
      last = v;
      data[i] = v * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.05);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    this.rollSource = src;
    this.rollGain = gain;
  }

  stopRoll() {
    const ctx = this.ctx;
    const src = this.rollSource;
    const gain = this.rollGain;
    if (!ctx || !src || !gain) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    src.stop(ctx.currentTime + 0.2);
    this.rollSource = null;
    this.rollGain = null;
  }

  // Ascending C-major arpeggio. Played once on STRIKE.
  strike() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.07;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  // Two-note flourish for SPARE — quieter, shorter than strike.
  spare() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    [659.25, 880.0].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  // Descending sawtooth wail. Played when the ball drops into the gutter.
  gutter() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.55);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.7);
  }

  dispose() {
    this.stopRoll();
    void this.ctx?.close();
    this.ctx = null;
  }
}
