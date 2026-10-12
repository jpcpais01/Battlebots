/**
 * Tiny synthesized sound kit (WebAudio, no assets): metallic impacts, whooshes,
 * crowd bed with swells, bell, and UI blips.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private crowdLevel = 0;
  muted = false;
  private lastStep = [0, 0];

  constructor() {
    try {
      this.muted = localStorage.getItem('bb.muted') === '1';
    } catch {
      /* ignore */
    }
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startCrowd();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('bb.muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private get ok() {
    return !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  private noise(dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, when = 0, freqEnd?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Metallic ring: a few inharmonic partials. */
  private clang(base: number, dur: number, gain: number) {
    for (const r of [1, 2.76, 5.4]) this.tone('triangle', base * r, base * r * 0.98, dur / (r * 0.7), gain / r);
  }

  hit(damage: number, zone: string, crit: boolean) {
    if (!this.ok) return;
    const k = Math.min(1, damage / 100);
    this.tone('sine', 140 - k * 50, 40, 0.18 + k * 0.15, 0.55 + k * 0.4);
    this.noise(0.09 + k * 0.08, 'lowpass', 2600, 0.7, 0.5 + k * 0.4);
    this.clang(zone === 'head' ? 420 + Math.random() * 60 : 300 + Math.random() * 40, 0.25 + k * 0.2, 0.08 + k * 0.08);
    if (crit) this.clang(880, 0.4, 0.08);
    this.crowd(0.15 + k * 0.4);
  }

  block(damage: number) {
    if (!this.ok) return;
    this.noise(0.06, 'bandpass', 1800, 1.5, 0.35);
    this.clang(620 + Math.random() * 80, 0.18, 0.06 + Math.min(0.06, damage / 400));
    this.tone('sine', 110, 60, 0.08, 0.25);
  }

  whoosh(power: boolean, kick: boolean, vol = 1) {
    if (!this.ok) return;
    const dur = kick ? 0.22 : power ? 0.16 : 0.11;
    this.noise(dur, 'bandpass', kick ? 500 : 900, 1.2, (power ? 0.22 : 0.12) * vol, 0, kick ? 1500 : 2400);
  }

  charge(kick: boolean) {
    if (!this.ok) return;
    this.tone('sawtooth', kick ? 120 : 160, kick ? 420 : 640, 0.32, 0.05);
    this.noise(0.3, 'highpass', 3000, 0.7, 0.05, 0, 7000);
  }

  step(index: number) {
    if (!this.ok) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastStep[index] < 0.08) return;
    this.lastStep[index] = now;
    this.tone('sine', 85 + Math.random() * 20, 50, 0.07, 0.07);
    this.noise(0.03, 'highpass', 2500, 0.5, 0.025);
  }

  thud(k: number) {
    if (!this.ok) return;
    this.tone('sine', 90, 32, 0.35, 0.5 * k + 0.2);
    this.noise(0.25, 'lowpass', 600, 0.5, 0.35 * k + 0.1);
    this.clang(180, 0.35, 0.05);
  }

  ropes() {
    if (!this.ok) return;
    this.tone('sine', 70, 55, 0.35, 0.18);
    this.noise(0.25, 'bandpass', 300, 3, 0.12);
  }

  shield() {
    if (!this.ok) return;
    this.tone('sine', 900, 1400, 0.2, 0.15);
    this.noise(0.3, 'highpass', 4000, 0.7, 0.15);
  }

  shieldUp() {
    if (!this.ok) return;
    this.tone('sine', 500, 1200, 0.25, 0.06);
  }

  zap() {
    if (!this.ok) return;
    this.tone('square', 1800, 300, 0.12, 0.05);
    this.noise(0.12, 'highpass', 5000, 0.5, 0.12);
  }

  bell(times = 1) {
    if (!this.ok) return;
    for (let i = 0; i < times; i++) {
      for (const r of [1, 2.4, 3.9, 5.2]) this.tone('sine', 820 * r, 818 * r, 1.4 / r, 0.12 / r, i * 0.32);
    }
  }

  ko() {
    if (!this.ok) return;
    this.tone('sine', 120, 30, 1.0, 0.8);
    this.noise(0.6, 'lowpass', 1200, 0.5, 0.5, 0, 200);
    this.clang(260, 0.9, 0.12);
    this.crowd(1.5);
  }

  ui(kind: 'tap' | 'select' | 'back' | 'start' = 'tap') {
    if (!this.ok) return;
    if (kind === 'start') {
      this.tone('square', 440, 880, 0.12, 0.05);
      this.tone('square', 660, 1320, 0.16, 0.04, 0.08);
    } else if (kind === 'select') this.tone('triangle', 720, 980, 0.08, 0.09);
    else if (kind === 'back') this.tone('triangle', 600, 380, 0.08, 0.08);
    else this.tone('triangle', 880, 900, 0.05, 0.07);
  }

  // ------------------------------------------------------------- crowd bed
  private startCrowd() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    this.crowdGain = g;
    this.crowdFilter = f;
  }

  /** Base crowd ambience level (0 menus, ~1 during fights). */
  ambience(level: number) {
    if (!this.ctx || !this.crowdGain) return;
    this.crowdLevel = level;
    this.crowdGain.gain.setTargetAtTime(0.03 * level, this.ctx.currentTime, 0.5);
  }

  crowd(swell: number) {
    if (!this.ctx || !this.crowdGain || !this.crowdFilter) return;
    const t = this.ctx.currentTime;
    const base = 0.03 * this.crowdLevel;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setTargetAtTime(base + 0.06 * swell, t, 0.05);
    this.crowdGain.gain.setTargetAtTime(base, t + 0.4 + swell * 0.6, 0.6);
    this.crowdFilter.frequency.setTargetAtTime(700 + swell * 400, t, 0.1);
    this.crowdFilter.frequency.setTargetAtTime(700, t + 0.6, 0.6);
  }
}
