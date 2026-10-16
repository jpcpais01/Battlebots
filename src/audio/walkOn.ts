import { ENTRY } from '../sim/entrance';

/**
 * Walk-on music: a short, produced-sounding theme for each bot's corner entrance,
 * synthesized (no audio files) into a buffer once, in an OfflineAudioContext, the first time
 * a fight needs it.
 *
 * Every theme is cut to the entrance: a build-up while the lift rides up, the drop on the
 * beat the lift locks at the top (ENTRY.arrive), four bars of the tune, and a final hit that
 * rings out. The next bot's theme (or the countdown) fades it out wherever it is.
 *
 * The kit below is a small studio: ADSR synth voices with filter envelopes and vibrato,
 * detuned stacks (supersaws, brass, strings), a guitar amp, bass saturation, two reverbs, a
 * ping-pong delay, layered drums, and a master chain with the music ducking under every kick
 * (the sidechain pump), a bus compressor and a soft clip. Themes are written as scores against
 * a beat grid where beat 0 is the drop.
 */

export { WALK_ONS, WALK_ON_NAME, walkOnFor, type WalkOnInfo } from '../game/walkOns';

/** The build: from the doors opening to the lift locking at the top, where every drop lands (s). */
const BUILD = ENTRY.arrive - ENTRY.start;
/** The longest a theme may run (s): a cap on render time and memory. */
const MAX_LENGTH = 13;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));

/** Beats from the drop (negative in the build) to seconds into the buffer. */
type Clock = (beat: number) => number;

interface VoiceOpts {
  /** ADSR (s, and the sustain level as a fraction of the peak). */
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  /** Lowpass cutoff: fixed, or [at the start, settling to] over fTime (a filter envelope). */
  lp?: number | [number, number];
  q?: number;
  fTime?: number;
  hp?: number;
  /** Where it goes (default: the music bus, which pumps under the kick). */
  to?: AudioNode;
  pan?: number;
  detune?: number;
  /** Seconds the pitch takes to glide from f0 to f1 (default: the whole note). */
  glide?: number;
  /** Vibrato [rate Hz, depth cents], fading in over vibIn seconds. */
  vib?: [number, number];
  vibIn?: number;
  wave?: PeriodicWave;
  /** Send levels into the long hall, the short room and the delay. */
  hall?: number;
  room?: number;
  echo?: number;
}

interface StackOpts extends VoiceOpts {
  /** Detuned voices per note, spread over +-spread cents and +-width of the stereo field. */
  voices?: number;
  spread?: number;
  width?: number;
  /** A trance gate: chop the sound at this many seconds per step. */
  gate?: number;
}

type Seq = [beat: number, len: number, note: number][];

/** A synthetic reverb tail: decorrelated noise with a few early reflections, darker as it fades. */
function impulse(ctx: BaseAudioContext, seconds: number, tone: number) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const early = i < sr * 0.035 ? (Math.random() > 0.93 ? 2.5 : 0.25) : 1;
      const w = (Math.random() * 2 - 1) * early * Math.exp(-6.9 * u);
      lp += (w - lp) * tone * (1 - 0.6 * u);
      d[i] = lp;
    }
  }
  return buf;
}

/** The studio: buses, effects, synth voices and drums, wired into an offline context. */
class Kit {
  /** Drums, risers and anything else that must not pump. */
  readonly drums: GainNode;
  /** Everything musical: ducked by every kick (the sidechain pump). */
  readonly music: GainNode;
  /** Guitar amp: distortion into a speaker-ish tone filter. */
  readonly drive: GainNode;
  /** Bass saturation: adds harmonics so subs carry on phone speakers. */
  readonly sat: GainNode;
  /** Long hall reverb send. */
  readonly hall: GainNode;
  /** Short room reverb send (drums). */
  readonly room: GainNode;
  /** Dotted-eighth ping-pong delay send. */
  readonly echo: GainNode;
  /** The music's level under a kick (1: no pump). */
  pump = 0.55;
  /** Beats from the drop to seconds. */
  readonly T: Clock;
  private readonly pumpNode: GainNode;
  private readonly ducks: number[] = [];
  private readonly noise: AudioBuffer;
  private readonly waves = new Map<number, PeriodicWave>();

  constructor(readonly ctx: OfflineAudioContext, readonly beat: number) {
    this.T = (b) => BUILD + b * beat;
    const sr = ctx.sampleRate;
    // master: highpass, bus compressor, limiter, a trim and a soft clip
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 38;
    hp.Q.value = 0.7;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 5000;
    air.gain.value = 3;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 2.2;
    comp.attack.value = 0.012;
    comp.release.value = 0.25;
    const trim = ctx.createGain();
    trim.gain.value = 0.5;
    const clip = ctx.createWaveShaper();
    clip.curve = this.curve((x) => Math.tanh(x * 1.3) / Math.tanh(1.3));
    clip.oversample = '2x';
    hp.connect(air).connect(comp).connect(trim).connect(clip).connect(ctx.destination);
    const out = ctx.createGain();
    out.connect(hp);
    this.drums = ctx.createGain();
    this.drums.connect(out);
    this.pumpNode = ctx.createGain();
    this.pumpNode.connect(out);
    this.music = ctx.createGain();
    this.music.connect(this.pumpNode);
    // the guitar amp: tighten the lows, clip hard, then the cabinet
    const pre = ctx.createBiquadFilter();
    pre.type = 'highpass';
    pre.frequency.value = 90;
    const amp = ctx.createWaveShaper();
    amp.curve = this.curve((x) => Math.tanh(x * 5) * 0.7);
    amp.oversample = '2x';
    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = 4600;
    cab.Q.value = 0.8;
    const cabMid = ctx.createBiquadFilter();
    cabMid.type = 'peaking';
    cabMid.frequency.value = 2400;
    cabMid.Q.value = 0.9;
    cabMid.gain.value = 4;
    const cabLow = ctx.createBiquadFilter();
    cabLow.type = 'peaking';
    cabLow.frequency.value = 160;
    cabLow.Q.value = 1;
    cabLow.gain.value = 3;
    this.drive = ctx.createGain();
    this.drive.connect(pre).connect(amp).connect(cab).connect(cabMid).connect(cabLow).connect(this.music);
    // bass saturation
    const satShaper = ctx.createWaveShaper();
    satShaper.curve = this.curve((x) => Math.tanh(x * 2.5) * 0.8);
    this.sat = ctx.createGain();
    this.sat.connect(satShaper).connect(this.music);
    // reverbs
    const hallVerb = ctx.createConvolver();
    hallVerb.buffer = impulse(ctx, 2.2, 0.35);
    this.hall = ctx.createGain();
    this.hall.connect(hallVerb).connect(this.music);
    const roomVerb = ctx.createConvolver();
    roomVerb.buffer = impulse(ctx, 0.45, 0.7);
    this.room = ctx.createGain();
    this.room.connect(roomVerb).connect(out);
    // ping-pong delay on the dotted eighth
    this.echo = ctx.createGain();
    const dA = ctx.createDelay(1);
    const dB = ctx.createDelay(1);
    dA.delayTime.value = Math.min(0.99, beat * 0.75);
    dB.delayTime.value = Math.min(0.99, beat * 0.75);
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.value = 3200;
    const fb2 = ctx.createGain();
    fb2.gain.value = 0.42;
    const pA = ctx.createStereoPanner();
    pA.pan.value = -0.6;
    const pB = ctx.createStereoPanner();
    pB.pan.value = 0.6;
    this.echo.connect(dA);
    dA.connect(pA).connect(this.music);
    dA.connect(fb).connect(fbLp).connect(dB);
    dB.connect(pB).connect(this.music);
    dB.connect(fb2).connect(dA);
    // white noise for everything hissy
    this.noise = ctx.createBuffer(1, sr * 2, sr);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  private curve(f: (x: number) => number) {
    const c = new Float32Array(2048);
    for (let i = 0; i < c.length; i++) c[i] = f((i / (c.length - 1)) * 2 - 1);
    return c;
  }

  /** A pulse wave with this duty cycle (chiptune). */
  pulse(duty: number) {
    let w = this.waves.get(duty);
    if (!w) {
      const n = 48;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(duty, w);
    }
    return w;
  }

  // ------------------------------------------------------------- plumbing

  /** Gate envelope: attack, decay to the sustain level, release when the gate closes at t + dur. */
  private adsr(t: number, dur: number, peak: number, o: VoiceOpts): [GainNode, number] {
    const a = o.attack ?? 0.005;
    const d = o.decay ?? 0.1;
    const s = o.sustain ?? 0.7;
    const r = o.release ?? 0.08;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (s < 1) g.gain.setTargetAtTime(peak * s, t + a, d / 3);
    const off = t + Math.max(dur, a + 0.002);
    g.gain.setTargetAtTime(0, off, r / 4);
    return [g, off + r * 2 + 0.03];
  }

  /** Percussive envelope: a quick attack and an exponential decay that is gone by t + dur. */
  private fall(t: number, dur: number, peak: number, attack = 0.001): [GainNode, number] {
    const a = Math.min(attack, dur - 0.002);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0, t + a, Math.max(0.003, dur - a) / 6);
    return [g, t + dur + 0.03];
  }

  private filters(node: AudioNode, t: number, o: VoiceOpts): AudioNode {
    if (o.hp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = o.hp;
      node = node.connect(f);
    }
    if (o.lp !== undefined) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = o.q ?? 0.9;
      if (typeof o.lp === 'number') f.frequency.value = o.lp;
      else {
        f.frequency.setValueAtTime(o.lp[0], t);
        f.frequency.setTargetAtTime(o.lp[1], t, (o.fTime ?? 0.25) / 3);
      }
      node = node.connect(f);
    }
    return node;
  }

  /** Into the bus, panned, with its sends. */
  private route(g: AudioNode, o: VoiceOpts) {
    let n = g;
    if (o.pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp1(o.pan);
      n = g.connect(p);
    }
    n.connect(o.to ?? this.music);
    for (const [lvl, bus] of [[o.hall, this.hall], [o.room, this.room], [o.echo, this.echo]] as [number | undefined, GainNode][]) {
      if (!lvl) continue;
      const s = this.ctx.createGain();
      s.gain.value = lvl;
      n.connect(s).connect(bus);
    }
  }

  private osc(type: OscillatorType, t: number, end: number, f0: number, f1: number, o: VoiceOpts) {
    const ctx = this.ctx;
    const v = ctx.createOscillator();
    if (o.wave) v.setPeriodicWave(o.wave);
    else v.type = type;
    if (o.detune) v.detune.value = o.detune;
    v.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) v.frequency.exponentialRampToValueAtTime(f1, t + Math.min(o.glide ?? end - t, end - t));
    if (o.vib) this.lfo(t, end, o.vib, o.vibIn).connect(v.detune);
    v.start(t);
    v.stop(end);
    return v;
  }

  private lfo(t: number, end: number, vib: [number, number], vibIn = 0.25) {
    const l = this.ctx.createOscillator();
    l.frequency.value = vib[0];
    const depth = this.ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(vib[1], t + vibIn);
    l.connect(depth);
    l.start(t);
    l.stop(end);
    return depth;
  }

  // -------------------------------------------------------------- voices

  /** A sustained synth note (ADSR), gliding from f0 to f1 if they differ. */
  voice(type: OscillatorType, t: number, dur: number, gain: number, f0: number, f1 = f0, o: VoiceOpts = {}) {
    const [g, end] = this.adsr(t, dur, gain, o);
    const v = this.osc(type, t, end, f0, f1, o);
    this.filters(v, t, o).connect(g);
    this.route(g, o);
  }

  /** A percussive synth note: it decays away over dur. */
  perc(type: OscillatorType, t: number, dur: number, gain: number, f0: number, f1 = f0, o: VoiceOpts = {}) {
    const [g, end] = this.fall(t, dur, gain, o.attack);
    const v = this.osc(type, t, end, f0, f1, o);
    this.filters(v, t, o).connect(g);
    this.route(g, o);
  }

  /** Detuned voices of each note through one filter and envelope: supersaws, brass, strings, pads. */
  stack(type: OscillatorType, t: number, dur: number, gain: number, notes: number[], o: StackOpts = {}) {
    const ctx = this.ctx;
    const voices = o.voices ?? 3;
    const spread = o.spread ?? 10;
    const width = o.width ?? 0.6;
    const [g, end] = this.adsr(t, dur, gain, o);
    const mix = ctx.createGain();
    mix.gain.value = 1 / Math.pow(voices * notes.length, 0.7);
    const vib = o.vib ? this.lfo(t, end, o.vib, o.vibIn) : null;
    for (const n of notes) {
      for (let v = 0; v < voices; v++) {
        const u = voices === 1 ? 0 : (v / (voices - 1)) * 2 - 1;
        const osc = ctx.createOscillator();
        if (o.wave) osc.setPeriodicWave(o.wave);
        else osc.type = type;
        osc.detune.value = (o.detune ?? 0) + u * spread;
        osc.frequency.value = midi(n);
        if (vib) vib.connect(osc.detune);
        const p = ctx.createStereoPanner();
        p.pan.value = clamp1((o.pan ?? 0) + u * width);
        osc.connect(p).connect(mix);
        osc.start(t);
        osc.stop(end);
      }
    }
    let node = this.filters(mix, t, o);
    if (o.gate) {
      // a square LFO opening and closing the gate on the grid
      const gate = ctx.createGain();
      gate.gain.value = 0.5;
      const l = ctx.createOscillator();
      l.type = 'square';
      l.frequency.value = 1 / o.gate;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      l.connect(depth).connect(gate.gain);
      l.start(t);
      l.stop(end);
      node = node.connect(gate);
    }
    node.connect(g);
    this.route(g, { ...o, pan: 0 });
  }

  /** Filtered noise: type, cutoff f0 sweeping to f1, resonance q, attack; peaks at gain then falls away by t + dur. */
  hiss(t: number, dur: number, gain: number, type: BiquadFilterType, f0: number, f1 = f0, q = 0.8, attack = 0.002, to: AudioNode = this.drums, pan = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const [g, end] = this.fall(t, dur, gain, attack);
    src.connect(f).connect(g);
    this.route(g, { to, pan });
    src.start(t, Math.random() * 1.5);
    src.stop(end);
  }

  /**
   * A chiptune channel: one oscillator stepping through a sequence of notes (beats from the
   * drop, lengths in beats), each with a quick decay. Far cheaper than a voice per note.
   */
  chip(seq: Seq, gain: number, o: VoiceOpts & { type?: OscillatorType; shift?: number } = {}) {
    if (!seq.length) return;
    const ctx = this.ctx;
    const shift = o.shift ?? 0;
    const t0 = this.T(seq[0][0] + shift);
    const last = seq[seq.length - 1];
    const end = this.T(last[0] + last[1] + shift) + 0.1;
    const v = ctx.createOscillator();
    if (o.wave) v.setPeriodicWave(o.wave);
    else v.type = o.type ?? 'square';
    if (o.vib) this.lfo(t0, end, o.vib, o.vibIn).connect(v.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    for (const [b, len, n] of seq) {
      const t = this.T(b + shift);
      v.frequency.setValueAtTime(midi(n), t);
      g.gain.setValueAtTime(gain, t);
      g.gain.setTargetAtTime(gain * 0.55, t + 0.03, 0.12);
      g.gain.setValueAtTime(0, Math.max(t + 0.01, this.T(b + len + shift) - 0.012));
    }
    v.connect(g);
    this.route(g, o);
    v.start(t0);
    v.stop(end);
  }

  /** A chiptune arpeggio: one oscillator cycling a chord's notes every `rate` seconds, from beat b for len beats. */
  arp(b: number, len: number, notes: number[], rate: number, gain: number, o: VoiceOpts = {}) {
    const ctx = this.ctx;
    const t0 = this.T(b);
    const t1 = this.T(b + len);
    const v = ctx.createOscillator();
    if (o.wave) v.setPeriodicWave(o.wave);
    else v.type = 'square';
    const steps = Math.floor((t1 - t0) / rate);
    for (let s = 0; s < steps; s++) v.frequency.setValueAtTime(midi(notes[s % notes.length]), t0 + s * rate);
    const [g, end] = this.adsr(t0, t1 - t0 - 0.02, gain, { attack: 0.004, decay: 0.3, sustain: 0.7, release: 0.03, ...o });
    this.filters(v, t0, o).connect(g);
    this.route(g, o);
    v.start(t0);
    v.stop(end);
  }

  // --------------------------------------------------------------- drums

  /** A layered kick: sub body with a pitch drop, the beater's knock, a click. Ducks the music. */
  kick(t: number, o: { gain?: number; f0?: number; f1?: number; dur?: number; click?: number; to?: AudioNode; duck?: boolean } = {}) {
    const gain = o.gain ?? 1;
    const f0 = o.f0 ?? 170;
    const f1 = o.f1 ?? 50;
    const dur = o.dur ?? 0.3;
    const to = o.to ?? this.drums;
    this.perc('sine', t, dur, gain, f0, f1, { glide: 0.04, to });
    this.perc('triangle', t, 0.05, gain * 0.5, f0 * 1.6, f1 * 1.6, { glide: 0.03, to });
    if (o.click !== 0) this.hiss(t, 0.008, gain * 0.5 * (o.click ?? 1), 'highpass', 2500, 2500, 0.7, 0.0005, to);
    if (o.duck !== false) this.ducks.push(t);
  }

  /** A snare: tonal body, the crack of the wires, a snap on top, a little room. `gate` adds the 80s gated-reverb bed. */
  snare(t: number, gain = 0.7, o: { tone?: number; dur?: number; snap?: number; room?: number; gate?: number } = {}) {
    const tone = o.tone ?? 190;
    const dur = o.dur ?? 0.2;
    this.perc('triangle', t, 0.09, gain * 0.7, tone * 1.5, tone, { glide: 0.04, to: this.drums });
    this.hiss(t, dur, gain * 0.9, 'bandpass', 1800, 1200, 0.7, 0.001);
    this.hiss(t, 0.07, gain * 0.8 * (o.snap ?? 1), 'highpass', 4500, 4500, 0.7, 0.0005);
    this.hiss(t, 0.12, gain * 0.35 * (o.snap ?? 1), 'highpass', 7000, 7000, 0.7, 0.0005);
    this.hiss(t, dur * 1.8, gain * (o.room ?? 0.35), 'bandpass', 1500, 900, 0.8, 0.002, this.room);
    if (o.gate) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1000;
      f.Q.value = 0.5;
      const [g, end] = this.adsr(t, o.gate, gain * 0.5, { attack: 0.004, decay: o.gate, sustain: 0.6, release: 0.012 });
      src.connect(f).connect(g).connect(this.drums);
      src.start(t, Math.random() * 1.5);
      src.stop(end);
    }
  }

  /** A clap: a flurry of hits, then the room. */
  clap(t: number, gain = 0.6) {
    for (const d of [0, 0.009, 0.019, 0.031]) this.hiss(t + d, 0.03, gain * 0.7, 'bandpass', 1400, 1400, 1.5, 0.001);
    this.hiss(t + 0.03, 0.22, gain * 0.6, 'bandpass', 1200, 900, 1.2);
    this.hiss(t + 0.03, 0.45, gain * 0.5, 'bandpass', 1200, 900, 1.2, 0.002, this.room);
  }

  /** A whole arena clapping: claps scattered around the beat. */
  crowdClap(t: number, gain = 0.7) {
    for (let i = 0; i < 5; i++) {
      const d = (i - 2) * 0.012 + (Math.random() - 0.5) * 0.01;
      this.hiss(t + d, 0.04, gain * (0.25 + Math.random() * 0.2), 'bandpass', 1100 + Math.random() * 600, 1300, 1.2, 0.001, this.drums, (i - 2) * 0.35);
    }
    this.hiss(t + 0.02, 0.3, gain * 0.5, 'bandpass', 1200, 800, 1, 0.003);
    this.hiss(t + 0.02, 0.7, gain * 0.6, 'bandpass', 1300, 700, 1, 0.003, this.hall);
  }

  hat(t: number, gain = 0.2, open = false, pan = 0.15) {
    this.hiss(t, open ? 0.3 : 0.05, gain * 1.6, 'highpass', 8000, open ? 7000 : 9000, 0.8, 0.001, this.drums, pan);
    this.hiss(t, open ? 0.2 : 0.03, gain * 0.8, 'bandpass', 10500, 10500, 3, 0.001, this.drums, pan);
  }

  crash(t: number, gain = 0.5, dur = 2.4) {
    this.hiss(t, dur, gain * 1.3, 'highpass', 4000, 6500, 0.5, 0.003, this.drums, -0.15);
    this.hiss(t, dur * 0.6, gain * 0.6, 'bandpass', 6000, 3500, 0.6, 0.003, this.room, 0.15);
    for (const f of [3150, 4720, 6310]) this.perc('sine', t, dur * 0.6, gain * 0.05, f * (0.99 + Math.random() * 0.02), f, { to: this.drums });
  }

  /** A tom (or a synth tom): a sine dropping onto its pitch, with a thump. */
  tom(t: number, f: number, gain = 0.6, dur = 0.35) {
    this.perc('sine', t, dur, gain, f * 1.5, f, { glide: 0.05, to: this.drums, room: 0.3 });
    this.hiss(t, 0.08, gain * 0.3, 'lowpass', 1200, 400, 0.7, 0.001);
  }

  /** Timpani: a tuned drum with a soft mallet, in the hall. */
  timp(t: number, n: number, gain = 0.6) {
    const f = midi(n);
    this.perc('sine', t, 1.3, gain, f * 1.04, f, { glide: 0.08, attack: 0.003, to: this.drums, hall: 0.3, room: 0.2 });
    this.perc('sine', t, 0.5, gain * 0.3, f * 1.5, f * 1.5, { to: this.drums });
    this.hiss(t, 0.12, gain * 0.25, 'lowpass', 800, 250, 0.7, 0.001);
  }

  /** A struck anvil: inharmonic partials ringing, a bright strike. */
  anvil(t: number, gain = 0.4, f = 1400) {
    const parts: [number, number, number][] = [[1, 1, 1.0], [2.76, 0.55, 0.55], [5.4, 0.3, 0.35], [8.93, 0.15, 0.22], [11.3, 0.08, 0.15]];
    parts.forEach(([r, k, d], i) => this.perc('sine', t, d, gain * k, f * r, f * r * 0.996, { to: this.drums, room: i === 0 ? 0.4 : 0, hall: i === 0 ? 0.2 : 0 }));
    this.hiss(t, 0.03, gain * 0.5, 'highpass', 5000, 5000, 1, 0.0005);
  }

  /**
   * The 808: a long sub with a pitch drop, saturated so it reads on small speakers, with an
   * optional slide to another note over its second half. Ducks the music.
   */
  sub808(t: number, n: number, dur: number, gain = 0.9, slideTo?: number) {
    const ctx = this.ctx;
    const f = midi(n);
    const v = ctx.createOscillator();
    v.type = 'sine';
    v.frequency.setValueAtTime(f * 1.8, t);
    v.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    if (slideTo !== undefined) {
      v.frequency.setValueAtTime(f, t + dur * 0.55);
      v.frequency.exponentialRampToValueAtTime(midi(slideTo), t + dur * 0.9);
    }
    const [g, end] = this.adsr(t, dur, gain, { attack: 0.002, decay: 0.3, sustain: 0.75, release: 0.12 });
    v.connect(g);
    g.connect(this.sat);
    const clean = ctx.createGain();
    clean.gain.value = 0.35;
    g.connect(clean).connect(this.music);
    v.start(t);
    v.stop(end);
    this.hiss(t, 0.006, gain * 0.3, 'highpass', 2000, 2000, 0.7, 0.0005);
    this.ducks.push(t);
  }

  // ------------------------------------------------------------ transitions

  /** Noise sweeping up and getting louder from t0 to t1, with a pitched glide on top if asked. */
  riser(t0: number, t1: number, gain = 0.3, o: { from?: number; to?: number } = {}) {
    const d = t1 - t0;
    this.hiss(t0, d, gain, 'bandpass', 300, 9000, 2, d * 0.92);
    this.hiss(t0, d, gain * 0.5, 'highpass', 1000, 12000, 0.7, d * 0.95);
    if (o.from && o.to) this.voice('sawtooth', t0, d - 0.01, gain * 0.3, o.from, o.to, { attack: d * 0.9, release: 0.01, lp: [500, 6000], fTime: d, to: this.drums, hall: 0.3 });
  }

  /** A cymbal played backwards: a swell that cuts off at t1. */
  reverseCrash(t0: number, t1: number, gain = 0.3) {
    const d = t1 - t0;
    this.hiss(t0, d, gain, 'highpass', 2000, 7000, 0.6, d * 0.97);
    this.hiss(t0, d, gain * 0.6, 'bandpass', 3000, 6000, 1, d * 0.97, this.hall);
  }

  /** The sub drop: a sine falling through the floor into the downbeat. */
  subDrop(t: number, dur = 0.6, gain = 0.8) {
    this.perc('sine', t, dur, gain, 160, 28, { glide: dur * 0.9, to: this.drums });
  }

  /** The hit on the drop: a deep boom with a crack on top. */
  boom(t: number, gain = 1) {
    this.perc('sine', t, 1.4, gain, 95, 32, { glide: 0.7, to: this.drums });
    this.hiss(t, 0.8, gain * 0.4, 'lowpass', 2500, 200, 0.7);
    this.hiss(t, 1.4, gain * 0.25, 'lowpass', 2000, 300, 0.7, 0.003, this.room);
  }

  /** Tubular bell: a few partials ringing in the hall. */
  chime(t: number, n: number, gain = 0.3) {
    const f = midi(n);
    const parts: [number, number, number][] = [[1, 1, 2.2], [2.76, 0.4, 1.3], [5.4, 0.18, 0.7]];
    for (const [r, k, d] of parts) this.perc('sine', t, d, gain * k, f * r, f * r, { hall: 0.5 });
  }

  /** Wire the sidechain pump: the music dips at every kick and recovers before the next. */
  finish() {
    const g = this.pumpNode.gain;
    g.setValueAtTime(1, 0);
    if (this.pump >= 1) return;
    const ts = [...new Set(this.ducks.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      const gap = (ts[i + 1] ?? Infinity) - t;
      const rel = Math.min(this.beat * 0.65, gap - 0.015);
      if (rel < 0.03) continue;
      g.setValueAtTime(this.pump, t);
      g.setValueAtTime(this.pump, t + 0.025);
      g.linearRampToValueAtTime(1, t + rel);
    }
  }
}

interface Theme {
  /** Beats in the build (sets the tempo: the build is 2.03 s). */
  grid: number;
  /** Bars after the drop. */
  bars: number;
  /** Seconds the last hit rings for. */
  tail: number;
  score: (k: Kit, T: Clock) => void;
}

/** Each theme writes itself into the kit. Beat 0 is the drop; the build is the beats before it. */
const THEMES: Record<string, Theme> = {
  // ---------------------------------------------------------------- Steel Anthem
  anthem: {
    grid: 4,
    bars: 4,
    tail: 2.6,
    score(k, T) {
      const b = k.beat;
      k.pump = 0.8;
      const E = 40, G = 43, A = 45, C = 48, D = 50;
      // the rhythm guitar, double-tracked: one take hard left, one hard right
      const gtr = (at: number, len: number, root: number, mute = false) => {
        for (const side of [-1, 1]) {
          k.stack('sawtooth', T(at), b * len - 0.025, mute ? 0.5 : 0.62, [root, root + 7, root + 12], {
            voices: 1, pan: side * 0.8, detune: side * 6 + 3, to: k.drive,
            lp: mute ? [2600, 700] : [4800, 3200], fTime: mute ? 0.08 : 0.4,
            attack: 0.003, decay: 0.35, sustain: 0.75, release: 0.04,
          });
        }
        k.hiss(T(at), 0.015, 0.12, 'highpass', 3500, 3500, 1, 0.0005, k.drive);
      };
      const bass = (at: number, len: number, root: number) => {
        k.voice('sawtooth', T(at), b * len - 0.03, 0.5, midi(root - 12), midi(root - 12), { to: k.sat, lp: [900, 400], fTime: 0.2, decay: 0.2, sustain: 0.8, release: 0.05 });
        k.voice('sine', T(at), b * len - 0.03, 0.18, midi(root - 12), midi(root - 12), { to: k.sat, decay: 0.2, sustain: 0.8, release: 0.05 });
      };
      const lead = (at: number, len: number, n: number, from = n) => {
        k.voice('sawtooth', T(at), b * len - 0.04, 0.42, midi(from), midi(n), {
          glide: 0.07, to: k.drive, lp: 3000, attack: 0.01, decay: 0.2, sustain: 0.85, release: 0.06,
          vib: [5.5, 26], vibIn: 0.25, echo: 0.25, hall: 0.2,
        });
      };

      // build: stomp, stomp, clap from the whole arena, feedback screaming up into the drop
      for (const s of [-4, -2]) {
        for (const d of [0, 0.5]) {
          k.kick(T(s + d), { gain: 0.7, f0: 130, f1: 45, dur: 0.32, duck: false });
          k.tom(T(s + d), 85, 0.35, 0.3);
        }
        k.crowdClap(T(s + 1), 0.7);
      }
      k.voice('sawtooth', T(-4), b * 4 - 0.06, 0.4, midi(59), midi(64), { glide: b * 2.5, attack: b * 3.2, release: 0.03, to: k.drive, lp: [800, 3500], fTime: b * 3, vib: [6, 30], vibIn: b * 2, hall: 0.3 });
      k.stack('sawtooth', T(-2), b * 2 - 0.06, 0.4, [E, E + 7], { voices: 1, attack: b * 1.7, release: 0.03, to: k.drive, lp: [600, 2500], fTime: b * 1.5, width: 0.8 });
      k.riser(T(-2), T(-0.06), 0.2, { from: 110, to: 440 });
      [-1, -0.75, -0.5, -0.25, -0.125].forEach((s, i) => k.snare(T(s), 0.3 + i * 0.1));

      // the drop: a riff in E, drums driving under it
      k.boom(T(0), 0.9);
      k.crash(T(0), 0.6);
      const riff: [number, number, number, boolean?][] = [
        [0, 0.5, E], [0.5, 0.5, E, true], [1, 0.5, E, true], [1.5, 0.5, E, true], [2, 0.5, E], [2.5, 0.5, E, true], [3, 0.5, G], [3.5, 1, A],
        [4.5, 0.5, A, true], [5, 0.5, A, true], [5.5, 0.5, C], [6, 1.5, D], [7.5, 0.5, D, true],
        [8, 1.5, E], [9.5, 0.5, E, true], [10, 0.5, E, true], [10.5, 0.5, G], [11, 1, A],
        [12, 1, C], [13, 1, D], [14, 2, E],
      ];
      for (const [at, len, root, mute] of riff) {
        gtr(at, len, root, mute);
        bass(at, len, root);
      }
      for (let bar = 0; bar < 4; bar++) {
        const o = bar * 4;
        for (const kb of [0, 2, 2.5]) k.kick(T(o + kb), { gain: kb === 2.5 ? 0.7 : 1, f0: 150, f1: 48, dur: 0.35 });
        if (bar % 2) k.kick(T(o + 3.5), { gain: 0.7, f0: 150, f1: 48, dur: 0.3 });
        k.snare(T(o + 1), 0.75);
        k.snare(T(o + 3), 0.75);
        for (let h = 0; h < 8; h++) k.hat(T(o + h / 2), h % 2 ? 0.1 : 0.15, h === 7);
        if (bar % 2 === 0) k.crash(T(o), 0.4);
        if (bar % 2) {
          k.snare(T(o + 3.25), 0.45);
          k.tom(T(o + 3.5), 150, 0.6);
          k.tom(T(o + 3.75), 105, 0.65);
        }
      }
      // the lead guitar sings over bars 3 and 4
      const solo: [number, number, number, number?][] = [
        [8, 1, 83, 81], [9, 0.5, 86], [9.5, 0.5, 83], [10, 1, 81], [11, 0.5, 79], [11.5, 0.5, 81],
        [12, 1.5, 83], [13.5, 0.5, 81], [14, 2, 88, 86],
      ];
      for (const [at, len, n, from] of solo) lead(at, len, n, from);
      // and out on a huge ringing E
      k.boom(T(16), 1);
      k.crash(T(16), 0.7, 2.6);
      k.kick(T(16), { gain: 1 });
      for (const side of [-1, 1]) k.stack('sawtooth', T(16), 2, 0.7, [E, E + 7, E + 12, E + 19], { voices: 1, pan: side * 0.8, detune: side * 7, to: k.drive, lp: [5000, 2500], fTime: 1.5, attack: 0.004, decay: 0.6, sustain: 0.8, release: 0.3 });
      bass(16, 2 / b, E);
      k.voice('sawtooth', T(16), 1.9, 0.4, midi(88), midi(88), { to: k.drive, lp: 3000, attack: 0.01, release: 0.3, vib: [5.5, 30], vibIn: 0.3, echo: 0.3, hall: 0.3 });
    },
  },

  // ----------------------------------------------------------------- Neon Drive
  neon: {
    grid: 4,
    bars: 4,
    tail: 2.6,
    score(k, T) {
      const b = k.beat;
      k.pump = 0.4;
      const chords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]]; // Am F C G
      const roots = [45, 41, 36, 43];
      const lead = (at: number, len: number, n: number, from = n) => {
        for (const [d, p] of [[-7, -0.3], [7, 0.3]]) {
          k.voice('sawtooth', T(at), b * len - 0.04, 0.3, midi(from), midi(n), {
            glide: 0.06, detune: d, pan: p, lp: [3500, 2200], fTime: 0.3, attack: 0.015, decay: 0.3, sustain: 0.8, release: 0.1,
            vib: [5, 18], vibIn: 0.3, echo: 0.35, hall: 0.3,
          });
        }
      };

      // build: a gated pad opening up, the arpeggio climbing through it, toms tumbling into the drop
      k.stack('sawtooth', T(-4), b * 4 - 0.08, 0.5, chords[0], { voices: 3, spread: 12, width: 0.8, attack: 0.3, release: 0.05, lp: [400, 3000], fTime: b * 3, gate: b / 4, hall: 0.3 });
      for (let s = 0; s < 16; s++) {
        const n = [57, 60, 64, 69, 72, 76][s % 6] + (s >= 8 ? 12 : 0);
        k.voice('sawtooth', T(-4 + s / 4), b * 0.22, 0.16, midi(n), midi(n), { lp: 500 + s * 350, q: 3, decay: 0.08, sustain: 0.4, release: 0.03, pan: s % 2 ? 0.5 : -0.5, echo: 0.2 });
      }
      [-2, -1.5, -1, -0.75, -0.5, -0.25].forEach((s, i) => k.snare(T(s), 0.3 + i * 0.09, { tone: 210, gate: 0.12 }));
      [260, 200, 150, 110].forEach((f, i) => k.tom(T(-1 + i / 4), f, 0.6, 0.3));
      k.riser(T(-4), T(-0.07), 0.25, { from: 220, to: 880 });
      k.reverseCrash(T(-1.5), T(-0.05), 0.3);
      k.subDrop(T(-0.12), 0.45, 0.7);

      // the drop
      k.crash(T(0), 0.5);
      for (let bar = 0; bar < 4; bar++) {
        const o = bar * 4;
        const ch = chords[bar];
        const root = roots[bar];
        k.stack('sawtooth', T(o), b * 4 - 0.05, 0.5, ch, { voices: 5, spread: 16, width: 0.8, attack: 0.02, decay: 0.4, sustain: 0.85, release: 0.12, lp: [2200, 4500], fTime: 1.2, hall: 0.25 });
        for (let e = 0; e < 8; e++) {
          const n = root + (e === 3 || e === 7 ? 12 : 0);
          k.voice('sawtooth', T(o + e / 2), b * 0.45, 0.55, midi(n), midi(n), { to: k.sat, lp: [1500, 250], fTime: 0.12, decay: 0.12, sustain: 0.5, release: 0.03 });
        }
        const arpNotes = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[1] + 24];
        for (let s = 0; s < 16; s++) {
          const n = arpNotes[s % 4];
          k.voice('sawtooth', T(o + s / 4), b * 0.2, 0.13, midi(n), midi(n), { lp: 4500, q: 2, decay: 0.06, sustain: 0.5, release: 0.03, pan: s % 2 ? 0.55 : -0.55, echo: 0.25 });
        }
        for (let beat = 0; beat < 4; beat++) {
          k.kick(T(o + beat), { gain: 1, f0: 160, f1: 46, dur: 0.4 });
          k.hat(T(o + beat + 0.5), 0.16, true);
          k.hat(T(o + beat), 0.08);
          if (beat % 2) {
            k.snare(T(o + beat), 0.7, { tone: 200, gate: 0.16 });
            k.clap(T(o + beat), 0.45);
          }
        }
      }
      const tune: [number, number, number][] = [
        [0, 1.5, 76], [1.5, 0.5, 81], [2, 1, 79], [3, 1, 76],
        [4, 1, 77], [5, 1, 81], [6, 1.5, 84], [7.5, 0.5, 81],
        [8, 1.5, 79], [9.5, 0.5, 76], [10, 0.5, 79], [10.5, 0.5, 81], [11, 1, 83],
        [12, 1.5, 86], [13.5, 0.5, 83], [14, 1, 79], [15, 0.5, 83], [15.5, 0.5, 84],
      ];
      let prev = 76;
      for (const [at, len, n] of tune) {
        lead(at, len, n, prev);
        prev = n;
      }
      // out on Am, the pad closing down and the arpeggio echoing away
      k.kick(T(16), { gain: 1 });
      k.crash(T(16), 0.5, 2.4);
      k.stack('sawtooth', T(16), 2.1, 0.55, chords[0], { voices: 5, spread: 16, width: 0.8, attack: 0.02, release: 0.4, lp: [3000, 500], fTime: 2, hall: 0.4 });
      k.voice('sawtooth', T(16), 2, 0.5, midi(45), midi(45), { to: k.sat, lp: [1200, 200], fTime: 1.5, release: 0.3 });
      lead(16, 2 / b, 76, 84);
      [81, 84, 88, 93].forEach((n, i) => k.voice('sawtooth', T(16 + i / 4), b * 0.2, 0.12, midi(n), midi(n), { lp: 4500, q: 2, decay: 0.06, sustain: 0.5, release: 0.03, pan: i % 2 ? 0.55 : -0.55, echo: 0.5 }));
    },
  },

  // ------------------------------------------------------------------ Iron Forge
  forge: {
    grid: 4,
    bars: 4,
    tail: 2.6,
    score(k, T) {
      const b = k.beat;
      k.pump = 0.5;
      const D = 38, Eb = 39, F = 41;
      const indKick = (at: number, g = 1) => {
        k.kick(T(at), { gain: g, f0: 120, f1: 40, dur: 0.38, to: k.drive });
        k.kick(T(at), { gain: g * 0.7, f0: 120, f1: 40, dur: 0.3, duck: false });
      };
      const indSnare = (at: number, g = 0.8) => {
        k.snare(T(at), g, { tone: 170, dur: 0.22 });
        k.anvil(T(at), g * 0.35, 1750);
        k.hiss(T(at), 0.25, g * 0.35, 'bandpass', 800, 500, 2, 0.001, k.drive);
      };
      const stab = (at: number, len: number, root: number) => {
        for (const side of [-1, 1]) k.stack('sawtooth', T(at), b * len - 0.03, 0.6, [root, root + 7, root + 12], { voices: 1, pan: side * 0.7, detune: side * 7, to: k.drive, lp: [3500, 1500], fTime: 0.2, attack: 0.003, decay: 0.3, sustain: 0.7, release: 0.05 });
      };

      // build: the factory. A drone swelling, a conveyor ticking, the anvil, steam, a klaxon
      k.stack('sawtooth', T(-4), b * 4 - 0.05, 0.45, [D - 12, D], { voices: 2, spread: 8, attack: b * 3, release: 0.03, to: k.drive, lp: [120, 2200], fTime: b * 3.5 });
      for (let s = 0; s < 16; s++) k.hiss(T(-4 + s / 4), 0.02, s % 4 ? 0.12 : 0.2, 'bandpass', s % 2 ? 5300 : 3800, s % 2 ? 5300 : 3800, 4, 0.0005, k.drums, s % 2 ? 0.5 : -0.5);
      for (let i = 0; i < 4; i++) k.anvil(T(-4 + i), 0.2 + i * 0.1, 1250 + i * 40);
      k.hiss(T(-3.5), 0.4, 0.2, 'highpass', 3000, 6000, 0.6, 0.02, k.drums, -0.4);
      k.hiss(T(-1.5), 0.35, 0.25, 'highpass', 3000, 6000, 0.6, 0.02, k.drums, 0.4);
      for (let s = 0; s < 4; s++) k.voice('square', T(-2 + s / 2), b * 0.42, 0.22, midi(s % 2 ? 63 : 62), midi(s % 2 ? 63 : 62), { lp: 1800, attack: 0.01, release: 0.03, pan: s % 2 ? 0.4 : -0.4, hall: 0.2 });
      k.riser(T(-2.5), T(-0.06), 0.22, { from: 73, to: 294 });
      k.reverseCrash(T(-1), T(-0.04), 0.3);

      // the drop
      k.boom(T(0), 1);
      k.anvil(T(0), 0.7, 950);
      k.crash(T(0), 0.5);
      const riffA = [D, D, D, Eb, D, D, F, Eb];
      const riffB = [D, F, Eb, D, D + 12, F, Eb, D];
      for (let bar = 0; bar < 4; bar++) {
        const o = bar * 4;
        for (const kb of [0, 0.75, 2, 2.75, 3.5]) indKick(o + kb, kb === 3.5 ? 0.7 : 1);
        indSnare(o + 2);
        if (bar % 2) indSnare(o + 3.75, 0.35);
        const hats = bar < 2 ? 8 : 16;
        for (let h = 0; h < hats; h++) k.hiss(T(o + (h * 4) / hats), 0.04, h % 2 ? 0.14 : 0.22, 'highpass', 7000, 7000, 0.8, 0.0005, k.drums, h % 2 ? 0.3 : -0.3);
        k.anvil(T(o + 1.5), 0.28, 1175);
        k.anvil(T(o + 3), 0.22, 880);
        k.anvil(T(o + 3.5), 0.28, 1245);
        const riff = bar < 2 ? riffA : riffB;
        for (let s = 0; s < 16; s++) {
          const n = riff[s % 8];
          const accent = s % 8 === 0 || s % 8 === 3 || s % 8 === 6;
          k.voice('sawtooth', T(o + s / 4), b * 0.22, accent ? 0.6 : 0.45, midi(n), midi(n), { to: k.drive, lp: [accent ? 2200 : 900, 300], fTime: 0.08, decay: 0.1, sustain: 0.6, release: 0.02 });
        }
        k.voice('sine', T(o), b * 4 - 0.05, 0.2, midi(D), midi(D), { to: k.sat, attack: 0.01, release: 0.05 });
        if (bar % 2 === 0) stab(o + 1.5, 0.5, Eb);
        else {
          stab(o + 1.5, 0.5, F);
          for (const d of [0, 0.04, 0.09]) k.hiss(T(o + 3.5) + d, 0.04, 0.3, 'bandpass', 3000, 3000, 1, 0.0005, k.drums, 0.3);
          k.hiss(T(o + 3.5), 0.3, 0.2, 'bandpass', 3000, 2000, 1, 0.002, k.room);
        }
      }
      // a siren winding up and down over bars 3 and 4
      k.voice('sawtooth', T(8), b * 3.5, 0.25, midi(62), midi(69), { to: k.drive, lp: 2500, attack: 0.05, release: 0.05, vib: [7, 15], hall: 0.3 });
      k.voice('sawtooth', T(11.5), b * 4.4, 0.25, midi(69), midi(62), { to: k.drive, lp: 2500, attack: 0.05, release: 0.1, vib: [7, 15], hall: 0.3 });
      // out: the press comes down
      k.boom(T(16), 1);
      k.anvil(T(16), 0.8, 950);
      k.crash(T(16), 0.5);
      indKick(16);
      k.stack('sawtooth', T(16), 2.2, 0.45, [D - 12, D], { voices: 2, spread: 10, attack: 0.01, release: 0.4, to: k.drive, lp: [2000, 150], fTime: 2 });
      k.voice('sawtooth', T(16), 2.2, 0.3, midi(D), midi(D - 1), { glide: 2, to: k.drive, lp: [1500, 200], fTime: 1.8, release: 0.3 });
    },
  },

  // -------------------------------------------------------------------- Bass Drop
  drop: {
    grid: 5, // 148 BPM: a pickup beat and a bar
    bars: 4,
    tail: 2.6,
    score(k, T) {
      const b = k.beat;
      k.pump = 0.55;
      const braam = (at: number, notes: number[], len = 2.5) => {
        k.stack('sawtooth', T(at), b * len, 0.55, notes, { voices: 3, spread: 22, width: 0.8, attack: 0.09, decay: 1.2, sustain: 0.5, release: 0.3, lp: [250, 2000], fTime: 0.5, to: k.drive, hall: 0.4 });
      };
      const bell = (at: number, len: number, n: number) => {
        k.voice('sine', T(at), b * len - 0.03, 0.4, midi(n), midi(n), { attack: 0.003, decay: 0.5, sustain: 0.3, release: 0.3, echo: 0.4, hall: 0.35 });
        k.voice('triangle', T(at), b * len * 0.6, 0.12, midi(n + 12), midi(n + 12), { attack: 0.003, decay: 0.2, sustain: 0.2, release: 0.15, echo: 0.3 });
      };

      // build: a dark pad, a snare roll tightening to a blur, a riser, then a breath before the drop
      k.stack('sawtooth', T(-5), b * 5 - 0.1, 0.45, [53, 56, 60, 65], { voices: 3, spread: 12, width: 0.7, attack: b * 2, release: 0.05, lp: [500, 2600], fTime: b * 4, hall: 0.35 });
      const roll: number[] = [];
      for (let x = -5; x < -3; x += 0.5) roll.push(x);
      for (let x = -3; x < -2; x += 0.25) roll.push(x);
      for (let x = -2; x < -1; x += 0.125) roll.push(x);
      for (let x = -1; x < -0.4; x += 0.0625) roll.push(x);
      roll.forEach((x, i) => k.snare(T(x), 0.25 + (0.5 * i) / roll.length, { tone: 220 + (40 * i) / roll.length, dur: 0.12, room: 0.2 }));
      k.riser(T(-5), T(-0.08), 0.3, { from: 174, to: 1397 });
      k.reverseCrash(T(-2.5), T(-0.06), 0.35);
      k.subDrop(T(-0.9), b * 0.9, 0.7);

      // the drop
      k.crash(T(0), 0.6, 2.5);
      braam(0, [41, 48, 53]);
      braam(4, [41, 48, 53]);
      braam(8, [37, 44, 49]);
      braam(12, [39, 46, 51]);
      const eights: [number, number, number, number?][] = [
        [0, 1.5, 29], [1.5, 1, 32, 29], [2.75, 0.75, 36], [3.5, 0.5, 37],
        [4, 1.5, 29], [5.5, 1, 29], [6.5, 0.75, 39], [7.25, 0.75, 36],
        [8, 1.5, 37], [9.5, 1, 37, 32], [10.75, 0.75, 36], [11.5, 0.5, 32],
        [12, 1.5, 39], [13.5, 1, 39], [14.5, 0.75, 34], [15.25, 0.75, 36],
      ];
      for (const [at, len, n, slide] of eights) {
        k.sub808(T(at), n, b * len, 0.95, slide);
        k.kick(T(at), { gain: 0.7, f0: 170, f1: 55, dur: 0.18, duck: false });
      }
      for (let bar = 0; bar < 4; bar++) {
        const o = bar * 4;
        k.snare(T(o + 2), 0.8, { tone: 200, dur: 0.22 });
        k.clap(T(o + 2), 0.6);
        if (bar % 2) k.clap(T(o + 3.75), 0.4);
        for (let h = 0; h < 8; h++) k.hat(T(o + h / 2), h % 2 ? 0.14 : 0.2, h === 7 && bar % 2 === 1);
        for (let r = 1; r < 4; r++) k.hat(T(o + 1.5 + r / 8), 0.14);
        const trip = bar < 2 ? 3 : 6;
        for (let r = 1; r < trip; r++) k.hat(T(o + 3.5 + r / (2 * trip)), 0.13);
      }
      const tune: [number, number, number][] = [
        [0.5, 0.5, 84], [1, 0.5, 80], [1.5, 1.5, 77], [3, 0.5, 80], [3.5, 0.5, 82],
        [4, 1.5, 84], [5.5, 0.5, 87], [6, 1, 84], [7, 0.5, 80], [7.5, 0.5, 77],
        [8.5, 0.5, 84], [9, 0.5, 80], [9.5, 1.5, 77], [11, 0.5, 80], [11.5, 0.5, 82],
        [12, 1, 85], [13, 1, 84], [14, 1, 80], [15, 1, 77],
      ];
      for (const [at, len, n] of tune) bell(at, len, n);
      // out: one long 808 sliding into the floor
      k.sub808(T(16), 29, 2.3, 1, 27);
      k.kick(T(16), { gain: 0.8, f0: 170, f1: 55, dur: 0.2, duck: false });
      k.crash(T(16), 0.6, 2.6);
      k.clap(T(16), 0.6);
      braam(16, [41, 48, 53], 2.2 / b);
      for (let h = 0; h < 4; h++) k.hat(T(16 + h / 2), 0.12 - h * 0.02);
    },
  },

  // --------------------------------------------------------------- Champion's Call
  fanfare: {
    grid: 4,
    bars: 4,
    tail: 2.9,
    score(k, T) {
      const b = k.beat;
      k.pump = 1;
      const brass = (at: number, len: number, notes: number[], g = 0.5, o: StackOpts = {}) => {
        k.stack('sawtooth', T(at), b * len - 0.05, g, notes, {
          voices: 2, spread: 7, width: 0.5, attack: 0.04, decay: 0.25, sustain: 0.8, release: 0.12,
          lp: [700, 4200], fTime: 0.12, q: 1.2, vib: [5, 9], vibIn: 0.35, hall: 0.4, room: 0.1, ...o,
        });
      };
      const trumpet = (at: number, len: number, n: number) => brass(at, len, [n], 0.55, { lp: [800, 5000], width: 0.2 });
      const low = (at: number, len: number, n: number, g = 0.5) => {
        k.stack('sawtooth', T(at), b * len - 0.05, g, [n, n + 12], { voices: 2, spread: 5, attack: 0.05, decay: 0.3, sustain: 0.85, release: 0.15, lp: [300, 1400], fTime: 0.15, to: k.sat, hall: 0.3 });
      };
      const strings = (at: number, len: number, notes: number[], g = 0.3, attack = 0.25) => {
        k.stack('sawtooth', T(at), b * len - 0.05, g, notes, { voices: 3, spread: 14, width: 0.9, attack, decay: 0.5, sustain: 0.9, release: 0.4, lp: [1500, 5000], fTime: 0.8, vib: [4.5, 12], vibIn: 0.5, hall: 0.5 });
      };
      const military = (o: number) => {
        for (const s of [1.5, 1.75]) k.snare(T(o + s), 0.28, { tone: 230, dur: 0.1, room: 0.15 });
        for (const s of [3, 3.25, 3.5, 3.75]) k.snare(T(o + s), s === 3 ? 0.42 : 0.3, { tone: 230, dur: 0.1, room: 0.15 });
      };

      // build: a timpani roll and a cymbal swell, strings trembling on the dominant, brass pickup
      for (let s = 0; s < 12; s++) k.timp(T(-4 + s / 4), 43, 0.08 + s * 0.03);
      for (let s = 0; s < 8; s++) k.timp(T(-1 + s / 8), 43, 0.4 + s * 0.05);
      k.hiss(T(-4), b * 4 - 0.05, 0.35, 'highpass', 3500, 8000, 0.5, b * 3.7);
      k.hiss(T(-4), b * 4 - 0.05, 0.3, 'highpass', 3500, 8000, 0.5, b * 3.7, k.hall);
      strings(-4, 4, [55, 59, 62, 67], 0.25, b * 3.5);
      low(-2, 2, 43, 0.3);
      [67, 72, 76].forEach((n, i) => trumpet(-1 + i / 3, 1 / 3, n));

      // the fanfare
      k.crash(T(0), 0.6);
      k.timp(T(0), 36, 1);
      k.chime(T(0), 84, 0.35);
      const tune: [number, number, number][] = [
        [0, 0.75, 72], [0.75, 0.25, 72], [1, 0.5, 72], [1.5, 0.5, 76], [2, 2, 79],
        [4, 0.5, 81], [4.5, 0.5, 79], [5, 0.5, 77], [5.5, 0.5, 76], [6, 1, 74], [7, 1, 67],
        [8, 0.75, 77], [8.75, 0.25, 77], [9, 0.5, 81], [9.5, 0.5, 84], [10, 1.5, 83], [11.5, 0.5, 79],
        [12, 0.75, 81], [12.75, 0.25, 81], [13, 0.5, 83], [13.5, 0.5, 84], [14, 1.5, 86], [15.5, 0.5, 86],
      ];
      for (const [at, len, n] of tune) trumpet(at, len, n);
      const harmony: [number, number[], number][] = [
        [0, [55, 60, 64], 36], [2, [55, 60, 64], 36],
        [4, [57, 60, 64], 33], [6, [55, 59, 62], 31],
        [8, [53, 57, 60], 29], [10, [55, 59, 62], 31],
        [12, [57, 60, 64], 33], [14, [55, 59, 62, 65], 31],
      ];
      for (const [at, ch, root] of harmony) {
        brass(at, 2, ch, 0.35);
        strings(at, 2, ch.map((n) => n + 12), 0.28);
        low(at, 1.5, root, 0.5);
        low(at + 1, 1, root, 0.4);
      }
      for (let bar = 0; bar < 4; bar++) {
        const o = bar * 4;
        k.timp(T(o), 36, 0.65);
        k.timp(T(o + 2), 43, 0.55);
        military(o);
        if (bar % 2) for (let s = 0; s < 4; s++) k.timp(T(o + 3 + s / 4), bar === 3 ? 36 : 43, 0.35 + s * 0.08);
      }
      k.crash(T(8), 0.5);
      k.chime(T(8), 89, 0.3);
      // a choir swelling under bars 3 and 4
      k.stack('sawtooth', T(8), b * 8 - 0.1, 0.22, [60, 64, 67, 72], { voices: 3, spread: 10, width: 0.9, attack: 0.5, decay: 1, sustain: 0.9, release: 0.3, lp: [700, 900], fTime: 1, vib: [4.5, 10], vibIn: 0.6, hall: 0.6 });
      // the final chord: everyone
      k.crash(T(16), 0.7, 2.8);
      for (let s = 0; s < 6; s++) k.timp(T(16) + s * 0.07, 36, 0.5);
      k.timp(T(16) + 0.45, 36, 1);
      brass(16, 2.4 / b, [60, 64, 67, 72], 0.55);
      trumpet(16, 2.4 / b, 84);
      low(16, 2.4 / b, 36, 0.55);
      strings(16, 2.6 / b, [72, 76, 79, 84], 0.3);
      k.chime(T(16), 84, 0.35);
      k.chime(T(16), 91, 0.2);
    },
  },

  // ------------------------------------------------------------------ Arcade Boss
  arcade: {
    grid: 6, // 177 BPM: a half-bar pickup and a bar
    bars: 6,
    tail: 2.1,
    score(k, T) {
      const b = k.beat;
      k.pump = 1;
      const p25 = k.pulse(0.25);
      const p12 = k.pulse(0.125);
      const ck = (at: number, g = 0.9) => {
        k.perc('triangle', T(at), 0.09, g, 200, 45, { glide: 0.05, to: k.drums });
        k.hiss(T(at), 0.012, g * 0.5, 'lowpass', 3000, 3000, 0.7, 0.0005);
      };
      const cs = (at: number, g = 0.55) => {
        k.hiss(T(at), 0.09, g, 'bandpass', 2400, 1500, 0.8, 0.0005);
        k.perc('triangle', T(at), 0.04, g * 0.4, 330, 180, { glide: 0.03, to: k.drums });
      };
      const ch = (at: number, g = 0.12) => k.hiss(T(at), 0.02, g, 'highpass', 9000, 9000, 0.7, 0.0005, k.drums, 0.3);

      // build: coins climbing, the charge, a siren, the alarm
      [69, 72, 76, 81, 84, 88, 93, 96, 100, 105].forEach((n, i) => k.voice('square', T(-6 + i * 0.25), b * 0.2, 0.13, midi(n), midi(n), { wave: p25, attack: 0.002, decay: 0.05, sustain: 0.6, release: 0.03, pan: i % 2 ? 0.4 : -0.4, echo: 0.25 }));
      k.hiss(T(-5), b * 5 - 0.05, 0.25, 'bandpass', 400, 6000, 1.5, b * 4.8);
      k.voice('square', T(-3.5), b * 3, 0.14, 440, 1760, { glide: b * 3, wave: p12, lp: 5000, attack: 0.01, release: 0.02, hall: 0.2 });
      for (let s = 0; s < 4; s++) k.voice('square', T(-2 + s * 0.5), b * 0.25, 0.18, midi(s % 2 ? 89 : 88), midi(s % 2 ? 89 : 88), { pan: s % 2 ? 0.5 : -0.5 });
      k.riser(T(-3), T(-0.05), 0.15);

      // the boss theme
      k.hiss(T(0), 0.45, 0.5, 'highpass', 4000, 7000, 0.6, 0.001);
      const tune: Seq = [
        [0, 0.5, 81], [0.5, 0.5, 81], [1, 0.5, 84], [1.5, 0.5, 83], [2, 1, 81], [3, 0.5, 79], [3.5, 0.5, 81],
        [4, 0.5, 76], [4.5, 0.5, 76], [5, 0.5, 79], [5.5, 0.5, 77], [6, 1, 76], [7, 0.5, 74], [7.5, 0.5, 76],
        [8, 0.5, 77], [8.5, 0.5, 77], [9, 0.5, 81], [9.5, 0.5, 79], [10, 1, 77], [11, 0.5, 76], [11.5, 0.5, 74],
        [12, 1, 80], [13, 1, 83], [14, 0.5, 88], [14.5, 0.5, 86], [15, 0.5, 84], [15.5, 0.5, 83],
        [16, 0.5, 81], [16.5, 0.5, 88], [17, 0.5, 81], [17.5, 0.5, 88], [18, 0.5, 81], [18.5, 0.5, 88], [19, 0.5, 84], [19.5, 0.5, 88],
        [20, 0.5, 86], [20.5, 0.5, 84], [21, 0.5, 83], [21.5, 0.5, 81], [22, 1, 80], [23, 1, 83],
      ];
      k.chip(tune, 0.3, { wave: p25, vib: [6, 12], vibIn: 0.08, pan: -0.15, echo: 0.15 });
      // the echo channel: the same tune an eighth late, quieter, on the other side
      k.chip(tune, 0.12, { type: 'square', shift: 0.5, pan: 0.45 });
      const chords = [[57, 60, 64], [60, 64, 67], [62, 65, 69], [64, 68, 71], [57, 60, 64]];
      const bassRoots = [45, 48, 50, 52, 45];
      for (let bar = 0; bar < 6; bar++) {
        const o = bar * 4;
        if (bar < 5) k.arp(o, 4, chords[bar], b / 6, 0.14, { pan: 0.35, lp: 6000 });
        else {
          k.arp(o, 2, [62, 65, 69], b / 6, 0.14, { pan: 0.35, lp: 6000 });
          k.arp(o + 2, 2, [64, 68, 71], b / 6, 0.14, { pan: 0.35, lp: 6000 });
        }
        const root = bar < 5 ? bassRoots[bar] : 50;
        const walk = bar === 3 ? [52, 52, 56, 56, 59, 59, 64, 59] : bar === 5 ? [50, 62, 50, 62, 52, 64, 56, 59] : null;
        for (let e = 0; e < 8; e++) {
          const n = walk ? walk[e] : root + (e % 2 ? 12 : 0);
          k.voice('triangle', T(o + e / 2), b * 0.45, 0.38, midi(n), midi(n), { to: k.sat, decay: 0.1, sustain: 0.7, release: 0.02 });
        }
        ck(o);
        ck(o + 2);
        ck(o + 2.5);
        cs(o + 1);
        cs(o + 3);
        for (let h = 0; h < 8; h++) ch(o + h / 2, h % 2 ? 0.08 : 0.12);
        if (bar === 3 || bar === 5) {
          cs(o + 3.5, 0.4);
          cs(o + 3.75, 0.5);
        }
      }
      // victory jingle, then the machine powers down
      [81, 84, 88, 93].forEach((n, i) => k.voice('square', T(24 + i * 0.25), i === 3 ? 1.1 : b * 0.23, 0.22, midi(n), midi(n), { wave: p25, vib: i === 3 ? [7, 20] : undefined, vibIn: 0.1, echo: 0.3, release: 0.05 }));
      k.voice('triangle', T(24), 1.3, 0.5, midi(45), midi(45), { to: k.sat, release: 0.1 });
      k.hiss(T(24), 0.5, 0.45, 'highpass', 4000, 7000, 0.6, 0.001);
      ck(24);
      k.voice('square', T(24) + 1.1, 0.7, 0.15, 880, 110, { glide: 0.65, wave: p12, release: 0.05, echo: 0.2 });
    },
  },
};

/** How long a theme's buffer is (s). */
function themeLength(th: Theme) {
  const beat = BUILD / th.grid;
  return Math.min(MAX_LENGTH, BUILD + th.bars * 4 * beat + th.tail);
}

/** Render a walk-on theme to a stereo buffer. */
export async function renderWalkOn(id: string, sampleRate: number): Promise<AudioBuffer> {
  const OAC = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const th = THEMES[id] ?? THEMES.anthem;
  const ctx = new OAC(2, Math.ceil(themeLength(th) * sampleRate), sampleRate);
  const kit = new Kit(ctx, BUILD / th.grid);
  th.score(kit, kit.T);
  kit.finish();
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
