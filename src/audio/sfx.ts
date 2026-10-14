import { BANK, renderImpact, type ImpactKind } from './impacts';
import { Crowd, type CrowdState } from './crowd';
import { Booth, nameKey, type Clip, type NameCut } from './booth';
import { Voice } from './voice';

const MASTER = 0.7;

/**
 * Tiny synthesized sound kit (WebAudio, no assets): metallic impacts, whooshes,
 * a live crowd that reacts to the fight (crowd.ts), bell, and UI blips. Impacts come from a bank of
 * procedurally rendered metal hits (see impacts.ts), played back with random
 * variation, pitch and pan so no two punches sound the same. The commentary
 * booth (booth.ts) talks over all of it with recorded voices (voice.ts).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  /** Where effects, the crowd and the chant go (through the glue compressor). */
  private master: GainNode | null = null;
  /** The final mix: effects and commentary, at master volume (0 when muted). */
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private crowd: Crowd | null = null;
  private crowdLevel = 0;
  muted = false;
  private lastStep = [0, 0];
  /** Until when a valve hiss is still blowing (audio clock). */
  private hissUntil = 0;
  private bank: Partial<Record<ImpactKind, AudioBuffer[]>> = {};
  private lastPick: Partial<Record<ImpactKind, AudioBuffer>> = {};
  private voice: Voice | null = null;
  /** The crowd counting down (3, 2, 1, FIGHT), decoded once audio starts. */
  private chant: Partial<Record<string, AudioBuffer>> = {};
  private chantBus: AudioNode | null = null;
  /** The hall reverb's return: only wired into the mix while the chant rings, so the
   * convolver isn't running on the audio thread for the rest of the game. */
  private chantHall: GainNode | null = null;
  private hallOn = false;
  private hallOff = 0;
  /** Clips of names the player had voiced, handed to the voice once audio starts. */
  private userClips = new Map<string, ArrayBuffer>();
  /** Commentary volume: 1 on, 0.5 quiet, 0 off. */
  commentary = 1;
  /** The commentators. Silent until audio starts and the voice list has loaded. */
  readonly booth = new Booth({
    ready: (f) => !!this.voice?.ready(f),
    want: (f) => this.voice?.want(f),
    prime: (f) => this.voice?.prime(f),
    speak: (clips, energy, within, voice) => this.voice?.speak(clips, energy, within, voice) ?? { done: true, stop() {}, fade() {}, left: () => 0 },
  });

  constructor() {
    try {
      this.muted = localStorage.getItem('bb.muted') === '1';
      const c = localStorage.getItem('bb.commentary');
      if (c !== null) this.commentary = Math.min(1, Math.max(0, +c || 0));
    } catch {
      /* ignore */
    }
    this.booth.enabled = this.commentary > 0;
  }

  setCommentary(v: number) {
    this.commentary = v;
    this.booth.enabled = v > 0;
    this.voice?.setLevel(v);
    try {
      localStorage.setItem('bb.commentary', String(v));
    } catch {
      /* ignore */
    }
  }

  /** A name the player had voiced: the booth calls the bot by it from now on. */
  addName(name: string, clips: Partial<Record<NameCut, [bytes: ArrayBuffer, dur: number]>>) {
    const key = nameKey(name);
    const made: Partial<Record<NameCut, Clip>> = {};
    for (const [cut, c] of Object.entries(clips) as [NameCut, [ArrayBuffer, number]][]) {
      const file = `user/${key}/${cut}`;
      this.userClips.set(file, c[0]);
      this.voice?.add(file, c[0]);
      made[cut] = [file, c[1]];
    }
    this.booth.setCustomName(name, made);
  }

  /** Plays a voiced name the way the caller shouts it at a big moment. */
  previewName(name: string) {
    const file = `user/${nameKey(name)}/scream`;
    if (!this.voice?.ready(file)) return;
    const dur = this.booth.nameClip(name, 'scream')?.[1] ?? 1;
    this.voice.speak([{ clip: [file, dur], gap: 0 }], 4, 0.3, 'p');
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    // a slightly deeper buffer than the minimum: on a phone the audio thread shares the
    // CPU with the renderer, and the smallest buffer is what underruns into clicks and dropouts
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: 'balanced' });
    } catch {
      ctx = new AC();
    }
    this.ctx = ctx;
    // Two buses meet at the output. Effects (hits, crowd, chant) share a glue compressor
    // that evens them out; the commentary has its own (voice.ts), so a heavy hit no longer
    // pumps the voices down mid-word. After them a fast limiter catches stacked peaks (a KO
    // is five sounds at once) and a soft clipper is the last safety: past full scale the
    // speaker plays a harsh crackle.
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.ratio.value = 4;
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : MASTER;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -4;
    limit.knee.value = 2;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.12;
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
    // the limiter keeps the signal in the shaper's straight part, so oversampling it
    // would only cost audio-thread time on every sample of the mix
    clip.oversample = 'none';
    this.master = ctx.createGain();
    this.master.connect(glue).connect(this.out);
    this.out.connect(limit).connect(pre).connect(clip).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.buildBank();
    this.crowd = new Crowd(ctx, this.master);
    this.crowd.ambience(this.crowdLevel);
    const crowd = this.crowd;
    const voice = new Voice(ctx, this.out, this.commentary, (g) => crowd.duck(g));
    this.voice = voice;
    for (const [f, b] of this.userClips) voice.add(f, b);
    void voice.manifest().then((m) => m && this.booth.setManifest(m));
    this.loadChant();
  }

  private loadChant() {
    const ctx = this.ctx!;
    // the hall's impulse response is heavy to build, so do it now in a quiet moment
    // rather than on the first number of the countdown
    const idle = (fn: () => void) =>
      'requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200);
    idle(() => (this.chantBus ??= this.makeChantBus()));
    for (const k of ['3', '2', '1', 'fight']) {
      fetch(`/audio/count/${k}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => b && new Promise<AudioBuffer>((ok, no) => ctx.decodeAudioData(b, ok, no)))
        .then((buf) => {
          if (buf) this.chant[k] = buf;
        })
        .catch(() => {});
    }
  }

  /**
   * The chant comes from the stands, not a speaker: a few layers of it slightly out
   * of step (a house full of voices), dulled by distance and thrown into the hall.
   */
  private playChant(k: string, gain: number) {
    const buf = this.chant[k];
    if (!buf) return false;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const bus = (this.chantBus ??= this.makeChantBus());
    if (!this.hallOn) {
      this.chantHall!.connect(this.master!);
      this.hallOn = true;
    }
    clearTimeout(this.hallOff);
    // unhook the hall once this number and its echo have died away
    this.hallOff = window.setTimeout(() => {
      this.chantHall?.disconnect();
      this.hallOn = false;
    }, (buf.duration / 0.97 + 0.1 + 3) * 1000);
    const layers: [rate: number, delay: number, pan: number, g: number][] = [
      [1, 0, 0, 1],
      [0.985, 0.035, -0.6, 0.5],
      [1.018, 0.06, 0.6, 0.5],
      [0.97, 0.09, -0.25, 0.3],
    ];
    for (const [rate, delay, pan, lg] of layers) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain * lg * 0.62;
      let out: AudioNode = src.connect(g);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        out = out.connect(p);
      }
      out.connect(bus);
      src.start(t + delay);
    }
    return true;
  }

  /** Distance (band-limited, softened) plus a big arena hall for the chant. */
  private makeChantBus(): AudioNode {
    const ctx = this.ctx!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 150;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    hp.connect(lp);
    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    lp.connect(dry).connect(this.master!);
    // a synthetic hall: decorrelated noise in each ear, darkening as it decays
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    const pre = Math.floor(ctx.sampleRate * 0.03);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lpState = 0;
      for (let i = pre; i < len; i++) {
        const x = (i - pre) / (len - pre);
        const a = 0.35 + 0.6 * x; // more smoothing (darker) further into the tail
        lpState += (Math.random() * 2 - 1 - lpState) * (1 - a);
        d[i] = lpState * Math.exp(-x * 5.5);
      }
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.85;
    lp.connect(verb).connect(wet);
    this.chantHall = wet;
    return hp;
  }

  /**
   * The countdown: the whole house shouts the number with the screen, over a deep
   * drum hit that climbs a step each time. 0 is FIGHT!
   */
  countdown(n: number) {
    if (!this.ok) return;
    this.crowd?.event('count', n);
    const k = n > 0 ? String(n) : 'fight';
    const sung = this.playChant(k, n > 0 ? 0.95 : 1.05);
    const f = n > 0 ? 62 + (3 - n) * 9 : 92;
    this.tone('sine', f * 1.6, f * 0.55, 0.55, 0.55);
    this.tone('triangle', f * 3.2, f * 1.1, 0.18, 0.12);
    this.noise(0.22, 'lowpass', 900, 0.7, 0.3, 0, 120);
    // no chant clips: at least a tick on the beat
    if (!sung && n > 0) this.tone('square', 660, 660, 0.06, 0.04, 0.02);
  }

  /** Two robots touching gloves: a bright, ringing clink of metal knuckles. */
  fistBump() {
    if (!this.ok) return;
    this.impact('block', 0.4, 1.35);
    for (const r of [1, 2.76, 5.4]) this.tone('sine', 1250 * r, 1240 * r, 0.5 / r, 0.05 / r, 0.004);
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
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.05);
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

  /**
   * A pressure valve blowing: a clack as it lifts, then a hard, bright hiss of vapour that
   * sputters out over `dur` seconds. k (0..1) is how wrecked the part is.
   */
  hiss(k: number, dur: number, pan = 0) {
    if (!this.ok) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // valves blowing together read as one: don't stack them
    if (t < this.hissUntil) return;
    this.hissUntil = t + 0.18;
    this.tone('square', 1800, 900, 0.03, 0.04 * (0.5 + k), 0, 3000);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.setValueAtTime(6500 + Math.random() * 1500, t);
    bp.frequency.linearRampToValueAtTime(4200, t + dur);
    bp.gain.value = 6;
    const g = ctx.createGain();
    const peak = 0.05 + 0.08 * k;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    g.gain.setValueAtTime(peak, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(peak * 0.3, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    let node: AudioNode = src.connect(hp).connect(bp).connect(g);
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.2);
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
