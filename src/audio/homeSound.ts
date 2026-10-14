/**
 * The sound of the animated home screens (synthesized, no assets): the beach's surf, gulls
 * and a little steel-drum tune, the gym's room tone and a beat on a tinny radio, the lounge's
 * rain on the window and lo-fi keys on a record player. Notes are
 * scheduled a little ahead on a timer so the loop keeps time whatever the frame rate.
 */
export type HomeSoundKind = 'beach' | 'gym' | 'lounge';

const AHEAD = 0.35;

// C major pentatonic-ish island tune: chord roots and a melody over 4 bars of 8 eighths
const BEACH_BPM = 104;
const BEACH_ROOTS = [130.81, 110.0, 87.31, 98.0];
const BEACH_TRIADS = [
  [261.63, 329.63, 392.0],
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [196.0, 246.94, 293.66],
];
// semitones above C5, -1 = rest
const BEACH_TUNE = [
  [7, -1, 9, 7, 4, -1, 2, 4],
  [0, -1, 4, -1, 2, 0, -1, -1],
  [5, -1, 4, 5, 9, -1, 7, -1],
  [7, 9, 7, 4, 2, -1, -1, -1],
];

const GYM_BPM = 118;
const GYM_BASS = [55, 55, 65.41, 49];

// a slow ii-V-I-vi in F on electric piano: Gm9, C13, Fmaj9, Dm9
const LOUNGE_BPM = 76;
const LOUNGE_BASS = [98.0, 65.41, 87.31, 73.42];
const LOUNGE_CHORDS = [
  [233.08, 293.66, 349.23, 440.0],
  [164.81, 233.08, 293.66, 440.0],
  [220.0, 261.63, 329.63, 392.0],
  [174.61, 220.0, 261.63, 329.63],
];
// a lazy melody, semitones above F4, -1 = rest
const LOUNGE_TUNE = [
  [-1, -1, 7, -1, 5, 3, -1, -1],
  [2, -1, -1, -1, -1, 0, 2, -1],
  [4, -1, -1, 7, -1, -1, -1, -1],
  [9, -1, 7, -1, 5, -1, -1, -1],
];

export class HomeSound {
  private kind: HomeSoundKind | null = null;
  private bus: GainNode;
  private music: GainNode;
  private nodes: AudioNode[] = [];
  private stops: AudioScheduledSourceNode[] = [];
  private timer = 0;
  private next = 0;
  private step = 0;
  private gullAt = 0;
  /** Lounge: the next drip off the sill, the next roll of thunder. */
  private dripAt = 0;
  private thunderAt = 0;
  private radio: AudioNode | null = null;

  constructor(
    private ctx: AudioContext,
    private dest: AudioNode,
    private noiseBuf: AudioBuffer,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(dest);
    this.music = ctx.createGain();
    this.music.connect(this.bus);
  }

  /** Switch to a place's ambience (null: silence). */
  set(kind: HomeSoundKind | null) {
    if (kind === this.kind) return;
    const t = this.ctx.currentTime;
    this.teardown(t + 0.6);
    this.kind = kind;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    if (!kind) {
      this.bus.gain.setTargetAtTime(0, t, 0.15);
      return;
    }
    // a fresh bus for the new place (the old one fades out on its own)
    const old = this.bus;
    old.gain.setTargetAtTime(0, t, 0.15);
    window.setTimeout(() => old.disconnect(), 1500);
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.gain.setTargetAtTime(1, t + 0.05, 0.4);
    this.bus.connect(this.dest);
    this.music = this.ctx.createGain();
    this.music.connect(this.bus);
    this.next = t + 0.1;
    this.step = 0;
    this.gullAt = t + 1.5;
    this.dripAt = t + 1;
    this.thunderAt = t + 8 + Math.random() * 10;
    if (kind === 'beach') this.beach();
    else if (kind === 'gym') this.gym();
    else this.lounge();
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  /** The tune on or off (it cuts out when the phone rings). */
  setMusic(on: boolean) {
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.3 : 0.08);
  }

  /** Louder or quieter as a whole (the gym door opening drowns it in crowd). */
  level(v: number, tau = 0.3) {
    this.bus.gain.setTargetAtTime(v, this.ctx.currentTime, tau);
  }

  private teardown(at: number) {
    window.clearInterval(this.timer);
    this.timer = 0;
    for (const s of this.stops) {
      try {
        s.stop(at);
      } catch {
        /* already stopped */
      }
    }
    const nodes = this.nodes;
    window.setTimeout(() => nodes.forEach((n) => n.disconnect()), 1500);
    this.stops = [];
    this.nodes = [];
    this.radio = null;
  }

  private loopNoise(rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(this.ctx.currentTime, Math.random() * 1.5);
    this.stops.push(s);
    this.nodes.push(s);
    return s;
  }

  private lfo(freq: number, depth: number, param: AudioParam, phase = 0) {
    const o = this.ctx.createOscillator();
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start(this.ctx.currentTime + phase);
    this.stops.push(o);
    this.nodes.push(o, g);
  }

  private filter(type: BiquadFilterType, f: number, q = 0.7) {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    this.nodes.push(n);
    return n;
  }

  private gain(v: number) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    return g;
  }

  // ------------------------------------------------------------------ beach

  private beach() {
    // the surf: a deep roll and a hissing wash, breathing on slow out-of-step swells
    const roll = this.gain(0.05);
    this.loopNoise(0.5).connect(this.filter('lowpass', 420)).connect(roll).connect(this.bus);
    this.lfo(0.085, 0.04, roll.gain);
    const wash = this.gain(0.018);
    this.loopNoise(1).connect(this.filter('bandpass', 2600, 0.4)).connect(wash).connect(this.bus);
    this.lfo(0.085, 0.016, wash.gain, 2.2);
    // a soft breeze
    const air = this.gain(0.008);
    this.loopNoise(0.8).connect(this.filter('bandpass', 900, 0.3)).connect(air).connect(this.bus);
    this.lfo(0.031, 0.006, air.gain);
  }

  private gull(t: number) {
    const ctx = this.ctx;
    const n = 2 + ((Math.random() * 3) | 0);
    const base = 1300 + Math.random() * 500;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.bus);
    for (let i = 0; i < n; i++) {
      const at = t + i * (0.2 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, at);
      o.frequency.exponentialRampToValueAtTime(base * 1.45, at + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.75, at + 0.17);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = base * 1.6;
      f.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.012, at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      o.connect(f).connect(g).connect(pan);
      o.start(at);
      o.stop(at + 0.2);
    }
    window.setTimeout(() => pan.disconnect(), 3000);
  }

  /** A struck steel pan: a few bright partials that ring out fast. */
  private pan(f: number, at: number, v: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    g.connect(this.music);
    for (const [r, a] of [
      [1, 1],
      [2, 0.45],
      [3.01, 0.18],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * r;
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(g);
      o.start(at);
      o.stop(at + 0.75);
    }
  }

  private pluck(type: OscillatorType, f: number, at: number, dur: number, v: number, lp = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let src: AudioNode = o;
    if (lp) {
      const fl = ctx.createBiquadFilter();
      fl.frequency.value = lp;
      src = o.connect(fl);
    }
    src.connect(g).connect(this.radio ?? this.music);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private tick(at: number, dur: number, v: number, freq: number, type: BiquadFilterType = 'highpass') {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g).connect(this.radio ?? this.music);
    s.start(at, Math.random() * 1.5);
    s.stop(at + dur + 0.02);
  }

  private beachStep(i: number, at: number) {
    const bar = ((i / 8) | 0) % 4;
    const e = i % 8;
    if (e === 0 || e === 3 || e === 4) this.pluck('triangle', BEACH_ROOTS[bar], at, 0.4, 0.07, 600);
    if (e === 2 || e === 6) for (const f of BEACH_TRIADS[bar]) this.pan(f, at, 0.012);
    this.tick(at, e % 2 ? 0.05 : 0.08, e % 2 ? 0.006 : 0.01, 6000);
    const n = BEACH_TUNE[bar][e];
    if (n >= 0) this.pan(523.25 * Math.pow(2, n / 12), at, 0.03);
  }

  // ------------------------------------------------------------------ gym

  private gym() {
    // room tone: ventilation hum and a low rumble
    const room = this.gain(0.022);
    this.loopNoise(0.35).connect(this.filter('lowpass', 260)).connect(room).connect(this.bus);
    const hum = this.ctx.createOscillator();
    hum.frequency.value = 60;
    const hg = this.gain(0.006);
    hum.connect(hg).connect(this.bus);
    hum.start();
    this.stops.push(hum);
    this.nodes.push(hum);
    // the radio on the shelf: everything through a small, boxy speaker
    const lo = this.filter('highpass', 280, 0.8);
    const hi = this.filter('lowpass', 3400, 1.2);
    const box = this.filter('peaking', 1200, 1);
    (box as BiquadFilterNode).gain.value = 5;
    lo.connect(hi).connect(box).connect(this.music);
    this.radio = lo;
  }

  private gymStep(i: number, at: number) {
    const e = i % 8;
    const bar = ((i / 8) | 0) % 4;
    const ctx = this.ctx;
    if (e === 0 || e === 4 || e === 5) {
      // kick
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(140, at);
      o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.16, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      o.connect(g).connect(this.radio ?? this.music);
      o.start(at);
      o.stop(at + 0.25);
    }
    if (e === 2 || e === 6) this.tick(at, 0.16, 0.08, 1800, 'bandpass');
    this.tick(at, 0.04, e % 2 ? 0.02 : 0.03, 7000);
    if (e !== 1 && e !== 5) this.pluck('sawtooth', GYM_BASS[bar] * (e === 7 ? 2 : 1), at, 0.18, 0.06, 500);
    if (e === 3 && bar % 2 === 0) this.pluck('square', GYM_BASS[bar] * 8, at, 0.12, 0.02, 2200);
  }

  // ------------------------------------------------------------------ lounge

  private lounge() {
    // rain on the glass: a soft hiss, the heavier patter under it, both gusting slowly
    const hiss = this.gain(0.022);
    this.loopNoise(1).connect(this.filter('highpass', 2400)).connect(this.filter('lowpass', 9000)).connect(hiss).connect(this.bus);
    this.lfo(0.05, 0.008, hiss.gain);
    const patter = this.gain(0.035);
    this.loopNoise(0.7).connect(this.filter('bandpass', 1100, 0.5)).connect(patter).connect(this.bus);
    this.lfo(0.07, 0.014, patter.gain, 3.1);
    const room = this.gain(0.03);
    this.loopNoise(0.3).connect(this.filter('lowpass', 180)).connect(room).connect(this.bus);
    // the record: warm and a little dull, with crackle riding on it
    const lo = this.filter('highpass', 90, 0.7);
    const hi = this.filter('lowpass', 2300, 0.8);
    lo.connect(hi).connect(this.music);
    this.radio = lo;
    const crackle = this.gain(0.012);
    this.loopNoise(1.3).connect(this.filter('highpass', 5000)).connect(crackle).connect(this.music);
    this.lfo(9.3, 0.01, crackle.gain);
  }

  /** An electric piano note: a soft bell on top of a warm body, wobbling slightly. */
  private keys(f: number, at: number, dur: number, v: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.012);
    g.gain.exponentialRampToValueAtTime(v * 0.35, at + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(this.radio ?? this.music);
    for (const [r, a, d] of [
      [1, 1, dur],
      [2, 0.12, 0.5],
      [7.02, 0.04, 0.12],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * r * (1 + (Math.random() - 0.5) * 0.002);
      const og = ctx.createGain();
      og.gain.setValueAtTime(a, at);
      og.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(og).connect(g);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
  }

  private loungeStep(i: number, at: number) {
    const bar = ((i / 8) | 0) % 4;
    const e = i % 8;
    const ctx = this.ctx;
    const out = this.radio ?? this.music;
    if (e === 0) for (const f of LOUNGE_CHORDS[bar]) this.keys(f, at + Math.random() * 0.02, 2.4, 0.016);
    if (e === 5) for (const f of LOUNGE_CHORDS[bar]) this.keys(f, at, 0.9, 0.009);
    if (e === 0 || e === 3 || e === 6) this.pluck('sine', LOUNGE_BASS[bar] * (e === 6 ? 1.5 : 1), at, 0.5, 0.11, 400);
    // a dusty boom-bap: kick, a soft snare, brushed hats
    if (e === 0 || e === 5) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(110, at);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.12, at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + 0.32);
    }
    if (e === 2 || e === 6) this.tick(at, 0.2, 0.035, 1500, 'bandpass');
    this.tick(at, 0.05, e % 2 ? 0.008 : 0.012, 6500);
    const n = LOUNGE_TUNE[bar][e];
    if (n >= 0) this.keys(349.23 * Math.pow(2, n / 12), at, 1.2, 0.022);
  }

  /** A drop falling off the sill outside. */
  private drip(t: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const f = 1500 + Math.random() * 1400;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.004 + Math.random() * 0.006, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.1);
  }

  /** Far-off thunder rolling round the city. */
  private thunder(t: number, k: number) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = 0.25;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(260, t);
    f.frequency.exponentialRampToValueAtTime(70, t + 4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * k, t + 0.4);
    g.gain.setTargetAtTime(0.05 * k, t + 0.8, 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    s.connect(f).connect(g).connect(this.bus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + 4.6);
  }

  private schedule() {
    if (!this.kind) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const beach = this.kind === 'beach';
    const lounge = this.kind === 'lounge';
    const eighth = 30 / (beach ? BEACH_BPM : lounge ? LOUNGE_BPM : GYM_BPM);
    // after a stall (tab hidden) pick up from now rather than playing the backlog
    if (this.next < now - 0.2) this.next = now + 0.05;
    while (this.next < now + AHEAD) {
      // a little swing on the beach
      const swing = (beach || lounge) && this.step % 2 ? eighth * (lounge ? 0.28 : 0.16) : 0;
      if (beach) this.beachStep(this.step, this.next + swing);
      else if (lounge) this.loungeStep(this.step, this.next + swing);
      else this.gymStep(this.step, this.next);
      this.next += eighth;
      this.step++;
    }
    if (beach && now > this.gullAt) {
      this.gull(now + 0.05);
      this.gullAt = now + 4 + Math.random() * 7;
    }
    if (lounge && now > this.dripAt) {
      this.drip(now + 0.05);
      this.dripAt = now + 0.4 + Math.random() * 2.2;
    }
    if (lounge && now > this.thunderAt) {
      this.thunder(now + 0.05, 0.5 + Math.random() * 0.5);
      this.thunderAt = now + 14 + Math.random() * 18;
    }
  }

  // ------------------------------------------------------------------ one-shots

  /** The phone's ringtone: a bright marimba arpeggio. */
  ring(dest: AudioNode) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = [1046.5, 1318.5, 1568, 2093, 1568, 2093];
    notes.forEach((f, i) => {
      const at = t + i * 0.085;
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const o2 = ctx.createOscillator();
      o2.frequency.value = f * 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.07, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      const g2 = ctx.createGain();
      g2.gain.value = 0.15;
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(dest);
      o.start(at);
      o2.start(at);
      o.stop(at + 0.25);
      o2.stop(at + 0.25);
    });
  }
}
