/**
 * Procedural crowd synthesis (no audio files). A crowd is many small "voices":
 * a glottal buzz plus breath, shaped by two moving formant filters into vowels,
 * chopped into syllables (chatter) or held as shouts, and spread across the
 * stereo field. Claps are short filtered noise bursts. Everything renders into
 * plain Float32Arrays one voice at a time, so the work can be spread over idle
 * frames.
 */

export const CROWD_RATE = 22050;

type Vowel = [number, number];
const V: Record<string, Vowel> = {
  ah: [750, 1200], ae: [660, 1700], eh: [530, 1850], ee: [300, 2200],
  oh: [500, 900], oo: [330, 850], uh: [600, 1170], er: [490, 1350],
};
const CHAT = [V.ah, V.ae, V.eh, V.ee, V.oh, V.oo, V.uh, V.er];

/** Small seeded PRNG (mulberry32). */
export function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Voice {
  start: number;
  end: number;
  f0: number;
  /** Pitch wander per syllable (fraction). */
  inflect: number;
  voiced: number;
  breath: number;
  /** Syllable length range (s). */
  syl: [number, number];
  /** Chance a syllable slot is a pause. */
  gap: number;
  vowels: Vowel[];
  gain: number;
  pan: number;
  /** Extra low-pass for distant voices (0 near .. 1 far). */
  far: number;
  /** Whole-utterance pitch contour (multiplier over 0..1 of the voice's span); null for chatter. */
  contour: ((x: number) => number) | null;
  /** Whole-utterance level envelope; null for chatter. */
  env: ((x: number) => number) | null;
}

/** A render in progress: add voices one by one, then finish. */
export class CrowdRender {
  readonly L: Float32Array;
  readonly R: Float32Array;
  private queue: (() => void)[] = [];
  constructor(readonly seconds: number, readonly sr = CROWD_RATE) {
    const n = Math.ceil(seconds * sr);
    this.L = new Float32Array(n);
    this.R = new Float32Array(n);
  }
  get remaining() {
    return this.queue.length;
  }
  push(fn: () => void) {
    this.queue.push(fn);
  }
  /** Renders the next queued voice; returns false when all are done. */
  step() {
    const fn = this.queue.shift();
    if (!fn) return false;
    fn();
    return this.queue.length > 0;
  }
  runAll() {
    while (this.step());
  }

  voice(v: Voice, rnd: () => number) {
    const { L, R, sr } = this;
    const i0 = Math.max(0, Math.floor(v.start * sr));
    const i1 = Math.min(L.length, Math.floor(v.end * sr));
    if (i1 <= i0) return;
    const gl = Math.sqrt(1 - v.pan) * v.gain, gr = Math.sqrt(v.pan) * v.gain;
    const span = i1 - i0;
    let phase = rnd();
    let f1 = v.vowels[0][0], f2 = v.vowels[0][1];
    let t1 = f1, t2 = f2, pitch = v.f0, tp = v.f0;
    let sylLeft = 0, sylLen = 1, sylAmp = 0, sylOn = false;
    let b1 = 0, l1 = 0, b2 = 0, l2 = 0, glot = 0, lp = 0;
    const farK = 1 - v.far * 0.85;
    const vibF = 4.5 + rnd() * 2, vibA = 0.012 + rnd() * 0.012;
    const q = 0.16;
    const B = 32;
    let envPrev = 0;
    let seed = (rnd() * 4294967296) | 0;
    for (let b0 = i0; b0 < i1; b0 += B) {
      const b1e = Math.min(i1, b0 + B);
      const x = (b0 - i0) / span;
      // control rate: syllables, glides, envelope, filter coefficients
      sylLeft -= B;
      if (sylLeft <= 0) {
        sylLen = Math.max(B, Math.floor((v.syl[0] + rnd() * (v.syl[1] - v.syl[0])) * sr));
        sylLeft = sylLen;
        sylOn = rnd() > v.gap;
        sylAmp = 0.5 + rnd() * 0.5;
        const vw = v.vowels[(rnd() * v.vowels.length) | 0];
        t1 = vw[0] * (0.92 + rnd() * 0.16);
        t2 = vw[1] * (0.92 + rnd() * 0.16);
        tp = v.f0 * (1 + (rnd() - 0.5) * 2 * v.inflect);
      }
      // coarticulation: formants and pitch glide toward their targets
      f1 += (t1 - f1) * 0.06;
      f2 += (t2 - f2) * 0.06;
      pitch += (tp - pitch) * 0.045;
      const sp = 1 - sylLeft / sylLen;
      const syl = Math.pow(Math.sin(Math.PI * sp), 0.7) * sylAmp;
      let env = v.env ? v.env(x) * (0.85 + 0.15 * syl) : sylOn ? syl : 0;
      if (env < 1e-4 && envPrev < 1e-4) {
        b1 *= 0.5; b2 *= 0.5; lp *= 0.5;
        envPrev = 0;
        continue;
      }
      const f = pitch * (v.contour ? v.contour(x) : 1) * (1 + vibA * Math.sin((2 * Math.PI * vibF * b0) / sr));
      const dph = f / sr;
      const c1 = 2 * Math.sin((Math.PI * Math.min(f1, sr / 7)) / sr);
      const c2 = 2 * Math.sin((Math.PI * Math.min(f2, sr / 7)) / sr);
      const dEnv = (env - envPrev) / B;
      let e = envPrev;
      for (let i = b0; i < b1e; i++) {
        phase += dph;
        if (phase >= 1) phase -= 1;
        // softened sawtooth glottal pulse + breath noise
        glot += (2 * phase - 1 - glot) * 0.35;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const exc = v.voiced * glot + v.breath * (seed / 2147483648);
        // two Chamberlin band-pass formants
        l1 += c1 * b1;
        b1 += c1 * (exc - l1 - q * 4 * b1);
        l2 += c2 * b2;
        b2 += c2 * (exc - l2 - q * 4 * b2);
        e += dEnv;
        lp += ((b1 + 0.55 * b2) * e - lp) * farK;
        L[i] += lp * gl;
        R[i] += lp * gr;
      }
      envPrev = env;
    }
  }

  /** Crossfades the tail into the head so the buffer loops seamlessly (call once, renders seconds - fade). */
  loopify(fade: number) {
    const n = Math.floor(fade * this.sr);
    const len = this.L.length - n;
    for (const ch of [this.L, this.R]) {
      for (let i = 0; i < n; i++) {
        const a = i / n;
        ch[i] = ch[i] * Math.sqrt(a) + ch[len + i] * Math.sqrt(1 - a);
      }
    }
    return len;
  }

  /** Scales to a target RMS (with a peak guard) and returns [L, R] trimmed to len samples. */
  finish(len = this.L.length, rms = 0.18): [Float32Array, Float32Array] {
    let sum = 0, peak = 0;
    for (const ch of [this.L, this.R]) {
      for (let i = 0; i < len; i++) {
        sum += ch[i] * ch[i];
        peak = Math.max(peak, Math.abs(ch[i]));
      }
    }
    const cur = Math.sqrt(sum / (2 * len)) || 1;
    // hit the target loudness; the rare peaks above it are rounded off instead of clipping
    const k = rms / cur;
    const out: [Float32Array, Float32Array] = [this.L.slice(0, len), this.R.slice(0, len)];
    for (const ch of out) for (let i = 0; i < len; i++) ch[i] = Math.tanh(ch[i] * k * 1.1) / 1.1;
    void peak;
    return out;
  }
}

const range = (rnd: () => number, a: number, b: number) => a + (b - a) * rnd();

/** Background chatter of a packed arena: many overlapping talkers at different distances. */
export function murmur(seed: number, seconds = 6): { render: CrowdRender; finish: () => [Float32Array, Float32Array] } {
  const rnd = prng(seed);
  const r = new CrowdRender(seconds + 0.6);
  for (let i = 0; i < 26; i++) {
    const male = rnd() < 0.55;
    const far = rnd();
    r.push(() =>
      r.voice(
        {
          start: 0, end: r.seconds, f0: male ? range(rnd, 95, 150) : range(rnd, 170, 250), inflect: 0.18,
          voiced: 0.75, breath: 0.22, syl: [0.09, 0.26], gap: 0.3 + rnd() * 0.25, vowels: CHAT,
          gain: 0.4 + (1 - far) * 0.6, pan: rnd(), far, contour: null, env: null,
        },
        rnd,
      ),
    );
  }
  return { render: r, finish: () => r.finish(r.loopify(0.6), 0.16) };
}

/** Sustained shouting of an excited crowd ("aaah", "yeah", "ooh" held), mixed in when things heat up. */
export function roar(seed: number, seconds = 5): { render: CrowdRender; finish: () => [Float32Array, Float32Array] } {
  const rnd = prng(seed);
  const r = new CrowdRender(seconds + 0.6);
  const shout = [V.ah, V.ae, V.eh, V.oh, V.uh];
  for (let i = 0; i < 30; i++) {
    const male = rnd() < 0.6;
    const far = rnd();
    r.push(() =>
      r.voice(
        {
          start: 0, end: r.seconds, f0: male ? range(rnd, 170, 260) : range(rnd, 280, 420), inflect: 0.22,
          voiced: 0.85, breath: 0.4, syl: [0.35, 1.4], gap: 0.12, vowels: shout,
          gain: 0.4 + (1 - far) * 0.6, pan: rnd(), far: far * 0.8, contour: null, env: null,
        },
        rnd,
      ),
    );
  }
  return { render: r, finish: () => r.finish(r.loopify(0.6), 0.18) };
}

export type Reaction = 'ooh' | 'cheer' | 'boo';

/** A whole crowd reacting at once: a gasp ("ooooh"), a cheer ("yeaaah") or boos. */
export function reaction(kind: Reaction, seed: number): { render: CrowdRender; finish: () => [Float32Array, Float32Array] } {
  const rnd = prng(seed);
  const dur = kind === 'ooh' ? 1.9 : kind === 'cheer' ? 2.8 : 2.6;
  const r = new CrowdRender(dur);
  const n = kind === 'boo' ? 22 : 28;
  for (let i = 0; i < n; i++) {
    const male = rnd() < 0.6;
    const start = rnd() * (kind === 'boo' ? 0.35 : 0.16);
    const len = (kind === 'ooh' ? range(rnd, 0.9, 1.6) : kind === 'cheer' ? range(rnd, 1.4, 2.5) : range(rnd, 1.4, 2.2));
    const end = Math.min(dur, start + len);
    const far = rnd();
    let f0: number, vowels: Vowel[], contour: (x: number) => number, env: (x: number) => number;
    if (kind === 'ooh') {
      f0 = male ? range(rnd, 140, 210) : range(rnd, 230, 330);
      vowels = [V.oo, V.oh];
      // rises with the surprise, then sinks
      contour = (x) => 1 + 0.18 * Math.sin(Math.PI * Math.min(1, x * 2.2)) - 0.3 * Math.max(0, x - 0.35);
      env = (x) => Math.min(1, x * 9) * Math.pow(1 - x, 1.3);
    } else if (kind === 'cheer') {
      f0 = male ? range(rnd, 190, 280) : range(rnd, 300, 450);
      vowels = [V.ae, V.ah, V.eh];
      contour = (x) => 1 + 0.12 * Math.sin(Math.PI * Math.min(1, x * 1.6)) - 0.15 * x;
      env = (x) => Math.min(1, x * 12) * Math.pow(1 - x, 0.8);
    } else {
      f0 = male ? range(rnd, 90, 140) : range(rnd, 160, 220);
      vowels = [V.oo];
      contour = (x) => 1 - 0.08 * x;
      env = (x) => Math.min(1, x * 4) * Math.pow(1 - x, 0.6);
    }
    r.push(() =>
      r.voice(
        {
          start, end, f0, inflect: 0.03, voiced: 0.85, breath: kind === 'cheer' ? 0.45 : 0.3,
          syl: kind === 'boo' ? [0.3, 0.6] : [0.5, 1.2], gap: 0, vowels, gain: 0.45 + (1 - far) * 0.55,
          pan: rnd(), far: far * 0.8, contour, env,
        },
        rnd,
      ),
    );
  }
  return { render: r, finish: () => r.finish(undefined, kind === 'boo' ? 0.16 : 0.2) };
}

/**
 * Applause: lots of people clapping at their own pace. Each clap is a soft-edged noise burst rung
 * through a resonance (the cupped hands), so it reads as a clap rather than a click, and a bed of
 * distant clapping fills the gaps so the whole thing is a dense wash, never a sparse crackle.
 */
export function applause(seed: number, seconds = 4): { render: CrowdRender; finish: () => [Float32Array, Float32Array] } {
  const rnd = prng(seed);
  const r = new CrowdRender(seconds + 0.4);
  const { L, R, sr } = r;
  // distant clapping: band-limited noise with a fast, irregular flutter
  let b1 = 0, b2 = 0, flut = 0;
  const chunk = Math.ceil(L.length / 4);
  for (let c0 = 0; c0 < L.length; c0 += chunk) r.push(() => {
    for (let i = c0; i < Math.min(L.length, c0 + chunk); i++) {
      if ((i & 31) === 0) flut = 0.55 + 0.45 * rnd();
      const w = (rnd() * 2 - 1) * flut;
      // two one-pole stages: high-pass ~600 Hz, low-pass ~3.5 kHz
      b1 += (w - b1) * 0.16;
      b2 += (w - b1 - b2) * 0.62;
      const v = b2 * 0.35;
      L[i] += v * (0.9 + 0.1 * rnd());
      R[i] += v * (0.9 + 0.1 * rnd());
    }
  });
  for (let c = 0; c < 12; c++) {
    // each job adds a group of nearer clappers
    r.push(() => {
      for (let k = 0; k < 11; k++) {
        const rate = range(rnd, 3, 5.2);
        const pan = rnd(), gain = range(rnd, 0.25, 0.8);
        const gl = Math.sqrt(1 - pan) * gain, gr = Math.sqrt(pan) * gain;
        // hand resonance: a state-variable band-pass tuned per person
        const fc = 2 * Math.sin((Math.PI * range(rnd, 800, 2300)) / sr);
        const damp = 1 / range(rnd, 1.6, 3);
        let t = rnd() / rate;
        while (t < r.seconds) {
          const i0 = Math.floor(t * sr);
          const tau = range(rnd, 0.006, 0.013) * sr;
          const atk = Math.max(1, Math.floor(range(rnd, 0.0006, 0.0015) * sr));
          const n = Math.min(L.length - i0, Math.floor(tau * 5));
          const a = range(rnd, 0.6, 1);
          const decay = Math.exp(-1 / tau);
          let lo = 0, bp = 0, env = 1;
          for (let i = 0; i < n; i++) {
            const w = (rnd() * 2 - 1) * env * (i < atk ? i / atk : 1);
            env *= decay;
            const hp = w - lo - damp * bp;
            bp += fc * hp;
            lo += fc * bp;
            const v = (bp * 0.8 + w * 0.2) * a;
            L[i0 + i] += v * gl;
            R[i0 + i] += v * gr;
          }
          t += (1 / rate) * range(rnd, 0.85, 1.15);
        }
      }
    });
  }
  return { render: r, finish: () => r.finish(r.loopify(0.4), 0.14) };
}
