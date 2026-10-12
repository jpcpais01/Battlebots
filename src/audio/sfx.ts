import { BANK, renderImpact, type ImpactKind } from './impacts';
import { Crowd, type CrowdState } from './crowd';

const MASTER = 0.7;

/**
 * Tiny synthesized sound kit (WebAudio, no assets): metallic impacts, whooshes,
 * a live crowd that reacts to the fight (crowd.ts), bell, and UI blips. Impacts come from a bank of
 * procedurally rendered metal hits (see impacts.ts), played back with random
 * variation, pitch and pan so no two punches sound the same.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private crowd: Crowd | null = null;
  private crowdLevel = 0;
  muted = false;
  private lastStep = [0, 0];
  private bank: Partial<Record<ImpactKind, AudioBuffer[]>> = {};
  private lastPick: Partial<Record<ImpactKind, AudioBuffer>> = {};

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
    // compressor to even out the mix, then a soft clipper: stacked hits (a KO is five sounds at once)
    // used to push the output past full scale, which the speaker plays as a harsh crackle
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    // the shaper only sees -1..1, so feed it half level and let its curve cover peaks up to 2:
    // unity below 0.7, then a smooth knee that never quite reaches full scale
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) {
      const u = ((i / (curve.length - 1)) * 2 - 1) * 2;
      const a = Math.abs(u);
      curve[i] = Math.sign(u) * (a < 0.7 ? a : 0.7 + 0.29 * Math.tanh((a - 0.7) / 0.29));
    }
    clip.curve = curve;
    clip.oversample = '2x';
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    this.master.connect(comp).connect(pre).connect(clip).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.buildBank();
    this.crowd = new Crowd(ctx, this.master);
    this.crowd.ambience(this.crowdLevel);
  }

  /**
   * Renders the impact bank: one of each kind right away, the remaining
   * variations a few at a time in idle moments so the first tap stays snappy.
   */
  private buildBank() {
    const ctx = this.ctx!;
    const seed = (Math.random() * 1e6) | 0;
    const jobs: [ImpactKind, number][] = [];
    for (const k of Object.keys(BANK) as ImpactKind[]) for (let v = 0; v < BANK[k]; v++) jobs.push([k, v]);
    jobs.sort((a, b) => a[1] - b[1]);
    const make = ([k, v]: [ImpactKind, number]) => {
      const data = renderImpact(k, seed + v * 131 + k.length, ctx.sampleRate);
      const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.getChannelData(0).set(data);
      (this.bank[k] ??= []).push(buf);
    };
    while (jobs.length && jobs[0][1] === 0) make(jobs.shift()!);
    const idle = (fn: () => void) =>
      'requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 30);
    const step = () => {
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 8) make(jobs.shift()!);
      if (jobs.length) idle(step);
    };
    idle(step);
  }

  /** Plays a random variation of an impact (never the same one twice in a row). */
  private impact(kind: ImpactKind, gain: number, rate: number, pan = 0, when = 0) {
    const list = this.bank[kind];
    if (!list?.length) return;
    let buf = list[(Math.random() * list.length) | 0];
    if (buf === this.lastPick[kind] && list.length > 1) buf = list[(list.indexOf(buf) + 1) % list.length];
    this.lastPick[kind] = buf;
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = gain;
    let out: AudioNode = src.connect(g);
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      out = out.connect(p);
    }
    out.connect(this.master!);
    src.start(t);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('bb.muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.05);
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

  /** An enveloped oscillator sweep, optionally through a low-pass that moves from lp0 to lp1 (Hz). */
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when = 0, lp0 = 0, lp1 = lp0) {
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
    let src: AudioNode = o;
    if (lp0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(lp0, t);
      f.frequency.exponentialRampToValueAtTime(lp1, t + dur);
      src = o.connect(f);
    }
    src.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /**
   * A landed strike. kind is the move type ('punch' or 'kick'); pan places it
   * left/right in the stereo field (-1..1).
   */
  hit(damage: number, zone: string, crit: boolean, kind = 'punch', pan = 0) {
    if (!this.ok) return;
    const k = Math.min(1, damage / 100);
    const big = crit || k > 0.5;
    // bigger hits land lower and fatter
    const rate = 1.1 - k * 0.25;
    this.impact(zone === 'head' ? 'head' : kind === 'kick' ? 'kick' : 'punch', 0.5 + k * 0.5, rate, pan);
    if (big) {
      this.impact('heavy', 0.35 + k * 0.45, 0.85 + Math.random() * 0.2, pan * 0.6);
      this.tone('sine', 62, 34, 0.3, 0.25 + k * 0.25);
    } else if (Math.random() < 0.35) {
      // a second, brighter plate somewhere on the frame
      this.impact('block', 0.12 + k * 0.12, 1.15 + Math.random() * 0.25, pan, 0.008 + Math.random() * 0.02);
    }
  }

  block(damage: number, pan = 0, guardBreak = false) {
    if (!this.ok) return;
    const k = Math.min(1, damage / 120);
    this.impact('block', 0.45 + k * 0.35, 1.05 + Math.random() * 0.1 - k * 0.15, pan);
    if (guardBreak) this.impact('heavy', 0.45, 0.95, pan);
    else if (k > 0.35) this.impact('punch', 0.2 + k * 0.2, 1.2, pan);
  }

  whoosh(power: boolean, kick: boolean, vol = 1) {
    if (!this.ok) return;
    const dur = kick ? 0.22 : power ? 0.16 : 0.11;
    this.noise(dur, 'bandpass', kick ? 500 : 900, 1.2, (power ? 0.22 : 0.12) * vol, 0, kick ? 1500 : 2400);
    // a short servo whine from the limb's actuators
    this.tone('sawtooth', kick ? 140 : 190, kick ? 300 : 420, dur * 0.8, (power ? 0.016 : 0.01) * vol);
  }

  charge(kick: boolean) {
    if (!this.ok) return;
    // actuators spinning up: a rising whine, no hiss
    this.tone('sawtooth', kick ? 120 : 160, kick ? 420 : 640, 0.32, 0.04, 0, 1800);
    this.tone('sine', kick ? 240 : 320, kick ? 840 : 1280, 0.3, 0.035);
  }

  step(index: number) {
    if (!this.ok) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastStep[index] < 0.08) return;
    this.lastStep[index] = now;
    this.impact('step', 0.1 + Math.random() * 0.05, 0.9 + Math.random() * 0.25, index === 0 ? -0.15 : 0.15);
  }

  /** A body slamming into the canvas (k: 0..1 impact strength). */
  thud(k: number, pan = 0) {
    if (!this.ok) return;
    this.impact('thud', 0.35 + 0.55 * k, 1.05 - k * 0.15, pan);
    this.tone('sine', 70, 30, 0.3, 0.2 + 0.3 * k);
  }

  ropes() {
    if (!this.ok) return;
    this.tone('sine', 70, 55, 0.35, 0.18);
    this.noise(0.25, 'bandpass', 300, 3, 0.12);
  }

  shield() {
    if (!this.ok) return;
    this.tone('sine', 900, 1400, 0.2, 0.15);
    this.tone('triangle', 1800, 2600, 0.25, 0.05);
    this.noise(0.25, 'bandpass', 1600, 1.5, 0.06);
  }

  shieldUp() {
    if (!this.ok) return;
    this.tone('sine', 500, 1200, 0.25, 0.06);
  }

  zap() {
    if (!this.ok) return;
    // an electric thrum: buzzing low saws under a closing filter, instead of a burst of static
    this.tone('sawtooth', 110, 92, 0.16, 0.07, 0, 2600, 300);
    this.tone('sawtooth', 113.5, 95, 0.16, 0.06, 0, 2600, 300);
    this.tone('sine', 1300, 520, 0.09, 0.05);
  }

  bell(times = 1) {
    if (!this.ok) return;
    for (let i = 0; i < times; i++) {
      for (const r of [1, 2.4, 3.9, 5.2]) this.tone('sine', 820 * r, 818 * r, 1.4 / r, 0.12 / r, i * 0.32);
    }
  }

  ko() {
    if (!this.ok) return;
    this.impact('heavy', 1, 0.72);
    this.impact('kick', 0.6, 0.8, 0, 0.01);
    this.impact('thud', 0.5, 0.85, 0, 0.12);
    this.tone('sine', 110, 28, 1.0, 0.7);
    this.noise(0.6, 'lowpass', 1200, 0.5, 0.35, 0, 200);
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

  // ------------------------------------------------------------------ crowd
  /** Crowd volume (0 silent, ~0.25 menus, 1 during fights). */
  ambience(level: number) {
    this.crowdLevel = level;
    this.crowd?.ambience(level);
  }

  /** Match events the crowd reacts to (hits, knockdowns, KOs...). */
  crowdEvent(type: string, data?: unknown) {
    this.crowd?.event(type, data);
  }

  /** Per-frame crowd update; state is null outside a fight. */
  crowdTick(dt: number, state: CrowdState | null) {
    this.crowd?.tick(dt, state);
  }
}
