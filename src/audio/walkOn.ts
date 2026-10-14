import { ENTRY } from '../sim/entrance';

/**
 * Walk-on music: a short theme for each bot's corner entrance, synthesized (no audio files)
 * into a buffer once, in an OfflineAudioContext, the first time a fight needs it.
 *
 * Every theme is cut to the entrance: one bar of build-up while the lift rides up, the drop
 * on the beat the lift locks at the top (ENTRY.arrive), two bars of groove, and a final hit
 * that rings out. The next bot's theme (or the countdown) fades it out wherever it is.
 */

export interface WalkOnInfo {
  id: string;
  name: string;
  blurb: string;
}

export const WALK_ONS: readonly WalkOnInfo[] = [
  { id: 'anthem', name: 'Steel Anthem', blurb: 'Stomp, stomp, clap. Stadium rock with big guitars.' },
  { id: 'neon', name: 'Neon Drive', blurb: 'Synthwave: a racing arpeggio and a four-on-the-floor kick.' },
  { id: 'forge', name: 'Iron Forge', blurb: 'Industrial: anvils, a growling drone, distorted drums.' },
  { id: 'drop', name: 'Bass Drop', blurb: 'A snare roll, a riser, then 808s that shake the seats.' },
  { id: 'fanfare', name: "Champion's Call", blurb: 'Brass fanfare over thundering timpani.' },
  { id: 'arcade', name: 'Arcade Boss', blurb: 'Chiptune: fast, bright and a little bit evil.' },
];
const IDS = new Set(WALK_ONS.map((w) => w.id));
export const WALK_ON_NAME: Record<string, string> = Object.fromEntries(WALK_ONS.map((w) => [w.id, w.name]));

/** A bot's theme: its own pick, or one that always goes with its name. */
export function walkOnFor(spec: { name: string; walkOn?: string }): string {
  if (spec.walkOn && IDS.has(spec.walkOn)) return spec.walkOn;
  let h = 2166136261;
  for (let i = 0; i < spec.name.length; i++) h = Math.imul(h ^ spec.name.charCodeAt(i), 16777619);
  return WALK_ONS[(h >>> 0) % WALK_ONS.length].id;
}

/** The drop lands on the reveal: one bar of build-up from the start of the entrance. */
const BAR = ENTRY.arrive - ENTRY.start;
const BEAT = BAR / 4;
/** Build, two bars of groove, the last hit and its tail. */
const LENGTH = BAR * 3 + 1.9;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** A tiny synth kit wired into an offline context. Times are in seconds from the start. */
class Kit {
  readonly out: GainNode;
  /** Distortion bus (guitars, industrial bass). */
  readonly drive: GainNode;
  /** Room reverb send. */
  readonly room: GainNode;
  private noise: AudioBuffer;

  constructor(readonly ctx: OfflineAudioContext) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.15;
    comp.connect(ctx.destination);
    this.out = ctx.createGain();
    this.out.connect(comp);
    // a short synthetic hall
    const sr = ctx.sampleRate;
    const ir = ctx.createBuffer(2, Math.floor(sr * 1.6), sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    this.room = ctx.createGain();
    this.room.gain.value = 0.22;
    this.room.connect(verb).connect(this.out);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 6) * 0.8;
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    this.drive = ctx.createGain();
    this.drive.connect(shaper).connect(tone);
    tone.connect(this.out);
    tone.connect(this.room);
    this.noise = ctx.createBuffer(1, sr * 2, sr);
    const n = this.noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  }

  private env(t: number, peak: number, attack: number, dur: number, to: AudioNode, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(to);
    } else g.connect(to);
    return g;
  }

  /** Filtered noise: type, centre/cutoff (sweeping to f1), q. */
  hiss(t: number, dur: number, gain: number, type: BiquadFilterType, f0: number, f1 = f0, q = 0.8, attack = 0.002, to: AudioNode = this.out, pan = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(f).connect(this.env(t, gain, attack, dur, to, pan));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** An oscillator note with a pitch glide (f0 to f1), an attack and an exponential release. */
  osc(type: OscillatorType, t: number, dur: number, gain: number, f0: number, f1 = f0, o: { attack?: number; lp?: [number, number]; q?: number; to?: AudioNode; detune?: number; glide?: number; pan?: number } = {}) {
    const ctx = this.ctx;
    const v = ctx.createOscillator();
    v.type = type;
    v.detune.value = o.detune ?? 0;
    v.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) v.frequency.exponentialRampToValueAtTime(f1, t + (o.glide ?? dur));
    let node: AudioNode = v;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = o.q ?? 1;
      f.frequency.setValueAtTime(o.lp[0], t);
      f.frequency.exponentialRampToValueAtTime(o.lp[1], t + dur);
      node = v.connect(f);
    }
    node.connect(this.env(t, gain, o.attack ?? 0.004, dur, o.to ?? this.out, o.pan ?? 0));
    v.start(t);
    v.stop(t + dur + 0.05);
  }

  /** Several detuned voices of one note (pads, brass, guitars). */
  stack(type: OscillatorType, t: number, dur: number, gain: number, notes: number[], o: { attack?: number; lp?: [number, number]; q?: number; to?: AudioNode; spread?: number } = {}) {
    const sp = o.spread ?? 9;
    for (const n of notes) {
      for (const d of [-sp, sp]) this.osc(type, t, dur, gain / notes.length, midi(n), midi(n), { ...o, detune: d, pan: d > 0 ? 0.25 : -0.25 });
    }
  }

  kick(t: number, gain = 1, f0 = 150, f1 = 42, dur = 0.42, to: AudioNode = this.out) {
    this.osc('sine', t, dur, gain, f0, f1, { glide: 0.12, to });
    this.hiss(t, 0.02, gain * 0.25, 'highpass', 3000, 3000, 0.7, 0.001, to);
  }

  snare(t: number, gain = 0.6, tone = 190) {
    this.osc('triangle', t, 0.12, gain * 0.6, tone * 1.4, tone, { glide: 0.05 });
    this.hiss(t, 0.2, gain, 'bandpass', 2200, 1500, 0.6);
    this.hiss(t, 0.25, gain * 0.35, 'bandpass', 2200, 1500, 0.6, 0.002, this.room);
  }

  clap(t: number, gain = 0.6) {
    for (const d of [0, 0.011, 0.023]) this.hiss(t + d, 0.03, gain * 0.7, 'bandpass', 1300, 1300, 1.5);
    this.hiss(t + 0.03, 0.22, gain * 0.6, 'bandpass', 1200, 900, 1.2);
    this.hiss(t + 0.03, 0.4, gain * 0.4, 'bandpass', 1200, 900, 1.2, 0.002, this.room);
  }

  hat(t: number, gain = 0.18, open = false) {
    this.hiss(t, open ? 0.26 : 0.045, gain, 'highpass', 7500, 9000, 0.7, 0.001, this.out, 0.2);
  }

  crash(t: number, gain = 0.5, dur = 2.2) {
    this.hiss(t, dur, gain, 'highpass', 3500, 6000, 0.5, 0.003, this.out, -0.15);
    this.hiss(t, dur * 0.8, gain * 0.5, 'bandpass', 5200, 3200, 0.6, 0.003, this.room, 0.15);
  }

  /** Noise sweeping up from t0 to t1, getting louder: the lift climbing. */
  riser(t0: number, t1: number, gain = 0.3) {
    const d = t1 - t0;
    this.hiss(t0, d, gain, 'bandpass', 250, 7000, 2.5, d * 0.9);
    this.osc('sawtooth', t0, d, gain * 0.25, 110, 880, { attack: d * 0.9, lp: [400, 5000] });
  }

  /** The hit on the drop: a deep boom with a crack on top. */
  boom(t: number, gain = 1) {
    this.osc('sine', t, 1.4, gain, 90, 30, { glide: 0.8 });
    this.hiss(t, 0.8, gain * 0.4, 'lowpass', 2500, 200, 0.7);
    this.hiss(t, 1.4, gain * 0.25, 'lowpass', 2000, 300, 0.7, 0.003, this.room);
  }

  /** A struck piece of metal (an anvil): inharmonic, ringing. */
  anvil(t: number, gain = 0.4, f = 1400) {
    for (const [r, k, d] of [[1, 1, 0.9], [2.76, 0.5, 0.5], [5.4, 0.3, 0.3], [8.9, 0.15, 0.2]]) this.osc('sine', t, d, gain * k, f * r, f * r * 0.995, { attack: 0.001 });
    this.hiss(t, 0.04, gain * 0.5, 'highpass', 5000, 5000, 1, 0.001);
    this.osc('sine', t, 1.1, gain * 0.25, f, f, { attack: 0.001, to: this.room });
  }

  /** Timpani: a tuned drum with a soft mallet. */
  timp(t: number, n: number, gain = 0.6) {
    this.osc('sine', t, 1.2, gain, midi(n) * 1.06, midi(n), { glide: 0.06, attack: 0.003 });
    this.osc('sine', t, 0.6, gain * 0.3, midi(n) * 1.5, midi(n) * 1.5);
    this.hiss(t, 0.1, gain * 0.25, 'lowpass', 900, 300, 0.7);
  }

  /** The 808: a long sub sine with a pitch drop, driven a touch. */
  sub808(t: number, n: number, dur: number, gain = 0.9) {
    this.osc('sine', t, dur, gain, midi(n) * 2.2, midi(n), { glide: 0.06 });
    this.osc('sine', t, dur * 0.7, gain * 0.18, midi(n) * 2.2, midi(n), { glide: 0.06, to: this.drive });
  }
}

const B = (bar: number, beat = 0) => bar * BAR + beat * BEAT;

/** Each theme writes itself into the kit. Bar 0 is the build, the drop is B(1). */
const THEMES: Record<string, (k: Kit) => void> = {
  anthem(k) {
    // stomp, stomp, clap on the way up, a power chord swelling under it
    for (let b = 0; b < 4; b += 2) {
      k.kick(B(0, b), 0.9, 120, 40, 0.3);
      k.kick(B(0, b + 0.5), 0.9, 120, 40, 0.3);
      k.clap(B(0, b + 1), 0.7);
    }
    k.stack('sawtooth', B(0, 2), BEAT * 2, 0.5, [40, 47, 52], { attack: BEAT * 1.8, to: k.drive });
    k.riser(B(0, 1), B(1), 0.18);
    k.boom(B(1), 0.8);
    k.crash(B(1), 0.55);
    // the drop: driving rock beat under chugging power chords (E5 G5 A5 | C5 D5 E5)
    const riff: [number, number, number][] = [[0, 1.5, 40], [1.5, 0.5, 43], [2, 2, 45], [4, 1, 48], [5, 1, 50], [6, 2, 52]];
    for (const [at, len, n] of riff) {
      for (let e = 0; e < len; e += 0.5) k.stack('sawtooth', B(1, at + e), BEAT * 0.48, 0.55, [n, n + 7, n + 12], { to: k.drive, spread: 12 });
    }
    for (let b = 0; b < 8; b++) {
      k.kick(B(1, b), b % 2 ? 0.6 : 1, 130, 45, 0.3);
      if (b % 2) k.snare(B(1, b), 0.65);
      for (const h of [0, 0.5]) k.hat(B(1, b + h), 0.12);
    }
    k.crash(B(2), 0.4);
    // and out on a big ringing E
    k.kick(B(3), 1);
    k.crash(B(3), 0.6, 2.5);
    k.stack('sawtooth', B(3), 1.8, 0.75, [40, 47, 52, 59], { to: k.drive, spread: 14 });
  },

  neon(k) {
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
    // a filtered arpeggio opening up as the lift climbs
    for (let s = 0; s < 16; s++) {
      const ch = prog[0];
      const n = ch[s % 3] + (s % 6 < 3 ? 12 : 24);
      k.osc('sawtooth', B(0, s / 4), BEAT * 0.24, 0.14, midi(n), midi(n), { lp: [300 + s * 220, 300 + s * 220], q: 6 });
    }
    // snare roll into the drop
    for (let s = 0; s < 8; s++) k.snare(B(0, 2 + s / 4), 0.12 + s * 0.05, 210);
    k.riser(B(0), B(1), 0.16);
    k.crash(B(1), 0.5);
    k.boom(B(1), 0.6);
    for (let bar = 1; bar < 3; bar++) {
      for (let b = 0; b < 4; b++) {
        const beat = (bar - 1) * 4 + b;
        k.kick(B(1, beat), 1, 150, 45, 0.32);
        if (b % 2) k.clap(B(1, beat), 0.5);
        k.hat(B(1, beat + 0.5), 0.15, true);
        const ch = prog[Math.floor(beat / 2) % 4];
        // octave bass, eighths
        for (const e of [0, 0.5]) k.osc('square', B(1, beat + e), BEAT * 0.45, 0.32, midi(ch[0] - 24 + (e ? 12 : 0)), midi(ch[0] - 24 + (e ? 12 : 0)), { lp: [1400, 300], q: 3 });
        // the arp, bright now
        for (let s = 0; s < 4; s++) {
          const n = ch[(beat * 4 + s) % 3] + 24;
          k.osc('sawtooth', B(1, beat + s / 4), BEAT * 0.22, 0.12, midi(n), midi(n), { lp: [5000, 2000], q: 2 });
        }
        if (b % 2 === 0) k.stack('sawtooth', B(1, beat), BEAT * 2, 0.32, ch, { attack: 0.15, lp: [2200, 1200], spread: 14 });
      }
    }
    k.kick(B(3), 1);
    k.crash(B(3), 0.5, 2.4);
    k.stack('sawtooth', B(3), 1.8, 0.45, [45, 57, 60, 64], { attack: 0.02, lp: [3000, 600], spread: 16 });
  },

  forge(k) {
    // a growling drone and the anvil, harder each blow
    k.osc('sawtooth', B(0), BAR + 0.1, 0.35, midi(26), midi(26), { attack: BAR * 0.8, to: k.drive, lp: [200, 1800] });
    for (let b = 0; b < 4; b++) k.anvil(B(0, b), 0.18 + b * 0.08, 1350);
    k.anvil(B(0, 3.5), 0.3, 1350);
    k.riser(B(0, 1), B(1), 0.2);
    k.boom(B(1), 1);
    k.anvil(B(1), 0.55, 1180);
    k.crash(B(1), 0.4);
    for (let beat = 0; beat < 8; beat++) {
      const t = B(1, beat);
      k.kick(t, 1, 110, 38, 0.36, k.drive);
      k.kick(t, 0.6, 110, 38, 0.3);
      if (beat % 4 === 2) k.kick(B(1, beat - 0.25), 0.7, 110, 38, 0.25, k.drive);
      if (beat % 2) {
        k.snare(t, 0.75, 160);
        k.hiss(t, 0.3, 0.3, 'bandpass', 900, 600, 2);
      }
      k.anvil(B(1, beat + 0.5), 0.16, beat % 2 ? 1700 : 1350);
      // gated distorted bass, eighths
      for (const e of [0, 0.5]) k.osc('sawtooth', B(1, beat + e), BEAT * 0.4, 0.4, midi(beat % 4 === 3 && e ? 29 : 26), midi(26), { to: k.drive, lp: [900, 200] });
    }
    k.boom(B(3), 1);
    k.anvil(B(3), 0.6, 1180);
    k.osc('sawtooth', B(3), 1.8, 0.4, midi(26), midi(25), { to: k.drive, lp: [1500, 150] });
  },

  drop(k) {
    // a snare roll that speeds up, a riser, and a breath before the drop
    const roll = [0, 1, 2, 2.5, 3, 3.25, 3.5, 3.625, 3.75, 3.8125, 3.875];
    roll.forEach((b, i) => k.snare(B(0, b), 0.18 + i * 0.045, 230 + i * 8));
    k.riser(B(0), B(0, 3.9), 0.25);
    k.osc('sine', B(0, 2), BEAT * 1.9, 0.2, midi(60), midi(84), { attack: BEAT * 1.6 });
    // the drop: half-time, 808s, rattling hats
    k.crash(B(1), 0.5);
    k.boom(B(1), 0.7);
    const bass: [number, number, number][] = [[0, 1.5, 33], [1.5, 1.25, 33], [2.75, 1.25, 36], [4, 1.5, 31], [5.5, 1.25, 31], [6.75, 1.25, 28]];
    for (const [at, len, n] of bass) {
      k.sub808(B(1, at), n, BEAT * len, 0.95);
      k.kick(B(1, at), 0.6, 160, 50, 0.2);
    }
    for (const b of [2, 6]) k.clap(B(1, b), 0.75);
    for (let s = 0; s < 32; s++) {
      const b = s / 4;
      k.hat(B(1, b), s % 2 ? 0.08 : 0.13);
      // a triplet rattle before each clap
      if (s === 6 || s === 22) for (let r = 1; r < 3; r++) k.hat(B(1, b + r / 12), 0.1);
    }
    // a brassy stab on top
    for (const b of [0, 4]) k.stack('sawtooth', B(1, b), BEAT * 0.9, 0.3, [57, 60, 64], { lp: [3000, 500], spread: 18 });
    k.sub808(B(3), 33, 1.8, 1);
    k.crash(B(3), 0.5);
    k.clap(B(3), 0.6);
  },

  fanfare(k) {
    // a timpani roll swelling under a cymbal
    for (let s = 0; s < 16; s++) k.timp(B(0, s / 4), 43, 0.12 + s * 0.035);
    k.hiss(B(0), BAR, 0.25, 'highpass', 4000, 7000, 0.5, BAR * 0.9);
    // pickup: a brass triplet into the downbeat
    const brass = (t: number, dur: number, notes: number[], g = 0.5) => {
      k.stack('sawtooth', t, dur, g, notes, { attack: 0.03, lp: [700, 2600], q: 1.5, spread: 7 });
      k.stack('sawtooth', t, dur * 1.1, g * 0.3, notes, { attack: 0.05, lp: [1500, 900], to: k.room });
    };
    [67, 72, 76].forEach((n, i) => brass(B(0, 3 + i / 3), BEAT / 3, [n], 0.4));
    k.crash(B(1), 0.55);
    k.timp(B(1), 36, 0.9);
    const line: [number, number, number[]][] = [
      [0, 1.5, [60, 64, 67, 72]],
      [1.5, 0.5, [62, 65, 69, 74]],
      [2, 2, [65, 69, 72, 77]],
      [4, 1, [67, 71, 74, 79]],
      [5, 0.5, [65, 69, 72, 77]],
      [5.5, 0.5, [67, 71, 74, 79]],
      [6, 2, [64, 67, 72, 76]],
    ];
    for (const [at, len, ch] of line) brass(B(1, at), BEAT * len * 0.95, ch, 0.55);
    for (let b = 0; b < 8; b++) {
      k.timp(B(1, b), b % 2 ? 43 : 36, 0.55);
      // a military snare under it
      for (const s of [0, 0.5, 0.75]) k.snare(B(1, b + s), s ? 0.2 : 0.32, 240);
    }
    k.crash(B(3), 0.6, 2.6);
    for (let s = 0; s < 6; s++) k.timp(B(3, s / 6), 36, 0.6);
    brass(B(3), 1.9, [48, 60, 64, 67, 72], 0.7);
  },

  arcade(k) {
    // a square run climbing two octaves on the way up
    const scale = [0, 2, 3, 5, 7, 8, 11, 12];
    for (let s = 0; s < 16; s++) {
      const n = 57 + scale[s % 8] + (s >= 8 ? 12 : 0);
      k.osc('square', B(0, s / 4), BEAT * 0.22, 0.11, midi(n), midi(n));
    }
    for (let s = 0; s < 8; s++) k.hiss(B(0, 2 + s / 4), 0.06, 0.08 + s * 0.03, 'bandpass', 3000, 3000, 0.8);
    k.osc('square', B(0, 3), BEAT, 0.1, midi(69), midi(93), { attack: BEAT * 0.9 });
    // the boss theme
    k.crash(B(1), 0.35);
    k.boom(B(1), 0.5);
    const tune: [number, number, number][] = [
      [0, 0.5, 81], [0.5, 0.5, 76], [1, 0.5, 81], [1.5, 0.5, 84], [2, 1, 83], [3, 0.5, 79], [3.5, 0.5, 80],
      [4, 0.5, 81], [4.5, 0.5, 76], [5, 0.5, 81], [5.5, 0.5, 88], [6, 1.5, 87], [7.5, 0.5, 83],
    ];
    for (const [at, len, n] of tune) {
      k.osc('square', B(1, at), BEAT * len * 0.9, 0.16, midi(n), midi(n));
      k.osc('square', B(1, at + 0.25), BEAT * len * 0.8, 0.05, midi(n), midi(n), { to: k.room });
    }
    for (let b = 0; b < 8; b++) {
      const root = b < 4 ? 45 : b < 6 ? 41 : 44;
      for (const e of [0, 0.5]) k.osc('triangle', B(1, b + e), BEAT * 0.45, 0.4, midi(root + (e ? 12 : 0)), midi(root + (e ? 12 : 0)));
      k.osc('square', B(1, b), 0.08, 0.3, 200, 45, { glide: 0.06 });
      if (b % 2) k.hiss(B(1, b), 0.09, 0.3, 'bandpass', 2600, 1800, 0.8);
      k.hiss(B(1, b + 0.5), 0.03, 0.12, 'highpass', 8000, 8000, 0.7);
    }
    // victory jingle
    [69, 73, 76, 81].forEach((n, i) => k.osc('square', B(3, i / 4), i === 3 ? 1.2 : BEAT * 0.22, 0.18, midi(n), midi(n)));
    k.osc('triangle', B(3), 1.2, 0.4, midi(45), midi(45));
  },
};

/** Render a walk-on theme to a stereo buffer. */
export async function renderWalkOn(id: string, sampleRate: number): Promise<AudioBuffer> {
  const OAC = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(LENGTH * sampleRate), sampleRate);
  const kit = new Kit(ctx);
  (THEMES[id] ?? THEMES.anthem)(kit);
  const buf = await ctx.startRendering();
  // even the themes out: every one peaks at the same level
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0) {
    const k = 0.9 / peak;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }
  return buf;
}
