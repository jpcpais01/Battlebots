/**
 * The Skin Vault's own sounds, synthesized once on first use (no clips to ship), the same as the
 * Android app's (godot/app/gacha/gacha_sound.gd): the capsule's rising charge, the seam's crack
 * and burst, a chime per rarity (a bell for a Common, a bright run up for a Rare, a full
 * shimmering chord for an Epic), a card flipping, the paint-on hiss and a coin; and the gumball
 * machine's: its crank ratcheting round, its chute's flap clunking open, a capsule popping.
 */
export type GachaSoundId = 'crank' | 'chute' | 'pop' | 'riser' | 'crack' | 'burst' | 'chime0' | 'chime1' | 'chime2' | 'flip' | 'paint' | 'coin';
export const GACHA_SOUNDS: GachaSoundId[] = ['crank', 'chute', 'pop', 'riser', 'crack', 'burst', 'chime0', 'chime1', 'chime2', 'flip', 'paint', 'coin'];
export const GACHA_RATE = 22050;

const TAU = Math.PI * 2;
const buf = (secs: number): Float32Array<ArrayBuffer> => new Float32Array(Math.floor(secs * GACHA_RATE));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A small LCG, so a sound is the same every time it's made. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s;
  };
}
const noiseOf = (v: number) => (v / 0x7fffffff) * 2 - 1;

/** A swell: a tone sweeping up an octave and a half over breathy noise, a quickening tremolo, cut at its peak. */
function riser(secs: number) {
  const d = buf(secs);
  const rnd = lcg(1234567);
  let ph = 0, ph2 = 0, lp = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / GACHA_RATE;
    const k = t / secs;
    const f = 110 * Math.pow(2, k * 2.6);
    ph += (TAU * f) / GACHA_RATE;
    ph2 += (TAU * f * 1.503) / GACHA_RATE;
    lp += (noiseOf(rnd()) - lp) * (0.05 + k * 0.4);
    const trem = 0.75 + 0.25 * Math.sin(TAU * (4 + k * 22) * t);
    const env = k * k * (1 - smooth(0.96, 1, k));
    d[i] = (Math.sin(ph) * 0.35 + Math.sin(ph2) * 0.15 + lp * 0.5) * env * trem * 0.8;
  }
  return d;
}

/** The seam cracking open: a sharp click and a short metallic ring. */
function crack() {
  const d = buf(0.5);
  const rnd = lcg(98765);
  for (let i = 0; i < d.length; i++) {
    const t = i / GACHA_RATE;
    const click = noiseOf(rnd()) * Math.exp(-t * 90);
    const ring = (Math.sin(TAU * 1870 * t) + Math.sin(TAU * 2630 * t) * 0.6) * Math.exp(-t * 14) * 0.25;
    d[i] = (click * 0.8 + ring) * 0.9;
  }
  return d;
}

/** The capsule bursting: a deep boom under a bright shower of noise. */
function burst() {
  const d = buf(1.6);
  const rnd = lcg(424242);
  let hp = 0, last = 0, ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / GACHA_RATE;
    const n = noiseOf(rnd());
    hp = 0.92 * (hp + n - last);
    last = n;
    ph += (TAU * (40 + 90 * Math.exp(-t * 9))) / GACHA_RATE;
    const boom = Math.sin(ph) * Math.exp(-t * 3.5);
    const shower = hp * Math.exp(-t * 2.2) * (0.6 + 0.4 * Math.sin(TAU * 31 * t));
    d[i] = boom * 0.75 + shower * 0.35;
  }
  return d;
}

/** A bell-like chord, each note `stagger` s after the last, ringing `secs`; a shimmer of fast high partials over it when `sparkle`. */
function chord(freqs: number[], stagger: number, secs: number, gain: number, sparkle = false) {
  const d = buf(secs + stagger * freqs.length);
  freqs.forEach((f, j) => {
    const start = Math.floor(stagger * j * GACHA_RATE);
    for (let i = start; i < d.length; i++) {
      const t = (i - start) / GACHA_RATE;
      const env = Math.min(1, t * 200) * Math.exp((-t * 3.2) / secs);
      // a bell: the fundamental, an inharmonic partial and the octave
      const v = Math.sin(TAU * f * t) + Math.sin(TAU * f * 2.756 * t) * 0.25 * Math.exp(-t * 6) + Math.sin(TAU * f * 2 * t) * 0.3;
      d[i] += ((v * env * gain) / freqs.length) * 1.6;
    }
  });
  if (sparkle) {
    const rnd = lcg(777);
    for (let i = 0; i < d.length; i++) {
      const t = i / GACHA_RATE;
      const s = rnd();
      if (s % 900 !== 0) continue;
      const f = 2400 + (s % 2400);
      for (let k = i; k < Math.min(i + 2200, d.length); k++) {
        const u = (k - i) / GACHA_RATE;
        d[k] += Math.sin(TAU * f * u) * Math.exp(-u * 30) * 0.08 * Math.exp(-t * 1.2);
      }
    }
  }
  return d;
}

/** A card turning over: a soft swish and a tap. */
function flip() {
  const d = buf(0.18);
  const rnd = lcg(31337);
  let lp = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / GACHA_RATE;
    lp += (noiseOf(rnd()) - lp) * 0.3;
    const swish = lp * Math.sin(Math.PI * Math.min(1, t / 0.12));
    const tap = t >= 0.1 ? Math.sin(TAU * 900 * t) * Math.exp(-(t - 0.1) * 120) * 0.4 : 0;
    d[i] = (swish * 0.5 + tap) * 0.7;
  }
  return d;
}

/** A spray of paint going on (the sweep up the robot). */
function paint() {
  const d = buf(1.1);
  const rnd = lcg(2468);
  let bp = 0, bp2 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / GACHA_RATE;
    // a rough band-pass, rising as it sweeps up
    const k = 0.25 + 0.5 * (t / 1.1);
    bp += (noiseOf(rnd()) - bp) * k;
    bp2 += (bp - bp2) * k;
    const env = Math.sin(Math.PI * Math.min(1, t / 1.1)) * (0.8 + 0.2 * Math.sin(TAU * 13 * t));
    d[i] = (bp - bp2) * env * 0.9;
  }
  return d;
}

/** The machine's crank turning: a ratchet's clicks closing up as it speeds up, over a low mechanical rumble. */
function crank(secs: number) {
  const d = buf(secs);
  const rnd = lcg(5150);
  let lp = 0;
  let tc = 0;
  let gap = 0.11;
  while (tc < secs - 0.05) {
    const start = Math.floor(tc * GACHA_RATE);
    const f = 1500 + (Math.floor(tc * 1000) % 3) * 180;
    for (let i = start; i < Math.min(start + Math.floor(0.05 * GACHA_RATE), d.length); i++) {
      const u = (i - start) / GACHA_RATE;
      const n = noiseOf(rnd());
      d[i] += (n * Math.exp(-u * 260) * 0.7 + Math.sin(TAU * f * u) * Math.exp(-u * 90) * 0.35) * 0.75;
    }
    tc += gap;
    gap = Math.max(0.055, gap * 0.93);
  }
  for (let i = 0; i < d.length; i++) {
    const t = i / GACHA_RATE;
    const n = noiseOf(rnd());
    lp += (n - lp) * 0.02;
    const env = Math.min(1, t * 6) * (1 - smooth(secs - 0.25, secs, t));
    d[i] = d[i] * (1 - smooth(secs - 0.2, secs, t)) + (lp * 1.6 + Math.sin(TAU * 55 * t) * 0.08) * env * 0.5;
  }
  return d;
}

/** The chute's flap swinging open: a heavy clunk, then the whoosh of the capsule rolling out. */
function chute() {
  const d = buf(0.9);
  const rnd = lcg(8080);
  let bp = 0, bp2 = 0, ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / GACHA_RATE;
    const n = noiseOf(rnd());
    ph += (TAU * (90 + 60 * Math.exp(-t * 30))) / GACHA_RATE;
    const clunk = (Math.sin(ph) * 0.8 + n * 0.3 * Math.exp(-t * 80)) * Math.exp(-t * 16);
    const k = 0.04 + 0.2 * smooth(0.1, 0.6, t);
    bp += (n - bp) * k;
    bp2 += (bp - bp2) * k;
    const whoosh = (bp - bp2) * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.08) / 0.8))) * 2.2;
    d[i] = clunk * 0.8 + whoosh * 0.45;
  }
  return d;
}

/** A capsule popping open: a cork's pop, a bright squeak up and a fizz of sparkle. */
function pop() {
  const d = buf(0.6);
  const rnd = lcg(6060);
  let hp = 0, last = 0, ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / GACHA_RATE;
    const n = noiseOf(rnd());
    hp = 0.85 * (hp + n - last);
    last = n;
    ph += (TAU * (320 + 900 * smooth(0, 0.07, t))) / GACHA_RATE;
    const p = Math.sin(ph) * Math.exp(-t * 28);
    const click = n * Math.exp(-t * 400);
    const fizz = hp * Math.exp(-t * 7) * (0.5 + 0.5 * Math.sin(TAU * 47 * t)) * smooth(0, 0.03, t);
    d[i] = p * 0.7 + click * 0.6 + fizz * 0.25;
  }
  return d;
}

/** One sound's samples (mono, GACHA_RATE). */
export function makeGachaSound(id: GachaSoundId): Float32Array<ArrayBuffer> {
  switch (id) {
    case 'crank':
      return crank(1.5);
    case 'chute':
      return chute();
    case 'pop':
      return pop();
    case 'riser':
      return riser(1.9);
    case 'crack':
      return crack();
    case 'burst':
      return burst();
    case 'chime0':
      return chord([523.25, 783.99], 0, 0.9, 0.5);
    case 'chime1':
      return chord([587.33, 739.99, 880, 1174.66], 0.07, 1.4, 0.55);
    case 'chime2':
      return chord([523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98], 0.06, 2.6, 0.6, true);
    case 'flip':
      return flip();
    case 'paint':
      return paint();
    case 'coin':
      return chord([1318.5, 1975.5], 0.05, 0.5, 0.35);
  }
}
