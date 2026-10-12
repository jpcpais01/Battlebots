/**
 * Procedural metal impact synthesis (no audio files). Each call renders one
 * variation into a Float32Array: a dense set of damped, inharmonic plate modes
 * (heavy armour, not a bell), a low body thump, a contact click, gritty crunch
 * noise, and a rattle of loose parts settling after the hit, all pushed through
 * a soft clipper. Different seeds give different sounds, so hits never repeat.
 */

export type ImpactKind = 'punch' | 'kick' | 'head' | 'block' | 'heavy' | 'thud' | 'step';

interface Recipe {
  dur: number;
  /** Lowest plate mode (Hz). */
  f0: [number, number];
  modes: number;
  /** Highest mode as a multiple of f0. */
  spread: number;
  /** Decay time constant of the lowest mode (s); higher modes die faster. */
  tau: [number, number];
  /** Level fall-off of higher modes. */
  tilt: number;
  modeGain: number;
  body: number;
  bodyHz: [number, number];
  bodyTau: number;
  click: number;
  crunch: number;
  crunchTau: number;
  crunchHz: [number, number];
  /** Loose-part micro impacts after the hit. */
  rattle: [number, number];
  rattleGain: number;
  drive: number;
}

const RECIPES: Record<ImpactKind, Recipe> = {
  punch: { dur: 0.5, f0: [140, 240], modes: 16, spread: 28, tau: [0.045, 0.085], tilt: 0.35, modeGain: 0.55, body: 0.9, bodyHz: [70, 95], bodyTau: 0.06, click: 0.5, crunch: 0.4, crunchTau: 0.03, crunchHz: [1500, 3200], rattle: [1, 3], rattleGain: 0.25, drive: 2.2 },
  kick: { dur: 0.6, f0: [95, 165], modes: 16, spread: 32, tau: [0.055, 0.1], tilt: 0.4, modeGain: 0.5, body: 1.15, bodyHz: [50, 70], bodyTau: 0.09, click: 0.45, crunch: 0.5, crunchTau: 0.04, crunchHz: [900, 2200], rattle: [2, 4], rattleGain: 0.3, drive: 2.6 },
  head: { dur: 0.55, f0: [250, 420], modes: 14, spread: 22, tau: [0.07, 0.13], tilt: 0.3, modeGain: 0.65, body: 0.55, bodyHz: [90, 130], bodyTau: 0.045, click: 0.6, crunch: 0.3, crunchTau: 0.025, crunchHz: [2500, 4500], rattle: [1, 3], rattleGain: 0.25, drive: 2 },
  block: { dur: 0.38, f0: [300, 520], modes: 12, spread: 18, tau: [0.03, 0.065], tilt: 0.25, modeGain: 0.6, body: 0.35, bodyHz: [110, 150], bodyTau: 0.03, click: 0.8, crunch: 0.22, crunchTau: 0.015, crunchHz: [3000, 5500], rattle: [0, 2], rattleGain: 0.2, drive: 1.8 },
  heavy: { dur: 1, f0: [70, 120], modes: 22, spread: 40, tau: [0.11, 0.2], tilt: 0.45, modeGain: 0.5, body: 1.3, bodyHz: [40, 55], bodyTau: 0.14, click: 0.5, crunch: 0.6, crunchTau: 0.045, crunchHz: [700, 1800], rattle: [3, 6], rattleGain: 0.35, drive: 2.6 },
  thud: { dur: 0.8, f0: [60, 110], modes: 14, spread: 30, tau: [0.05, 0.1], tilt: 0.5, modeGain: 0.35, body: 1.3, bodyHz: [38, 55], bodyTau: 0.12, click: 0.25, crunch: 0.5, crunchTau: 0.04, crunchHz: [500, 1400], rattle: [4, 7], rattleGain: 0.4, drive: 2.2 },
  step: { dur: 0.22, f0: [180, 320], modes: 8, spread: 14, tau: [0.018, 0.035], tilt: 0.5, modeGain: 0.35, body: 0.8, bodyHz: [60, 85], bodyTau: 0.035, click: 0.3, crunch: 0.12, crunchTau: 0.01, crunchHz: [1500, 3000], rattle: [0, 1], rattleGain: 0.15, drive: 1.5 },
};

/** Small seeded PRNG (mulberry32). */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adds a damped sinusoid (one vibration mode) into out from sample `start`. */
function addMode(out: Float32Array, sr: number, start: number, freq: number, amp: number, tau: number) {
  if (freq >= sr * 0.45 || amp <= 0) return;
  const w = (2 * Math.PI * freq) / sr;
  const r = Math.exp(-1 / (tau * sr));
  const c1 = 2 * r * Math.cos(w);
  const c2 = r * r;
  // stop once the mode has decayed below -80 dB of its start
  const len = Math.min(out.length - start, Math.ceil(tau * sr * 9.2));
  let y2 = 0;
  let y1 = amp * Math.sin(w);
  if (len > 1) out[start + 1] += y1;
  for (let n = 2; n < len; n++) {
    const y = c1 * y1 - c2 * y2;
    out[start + n] += y;
    y2 = y1;
    y1 = y;
  }
}

/** Renders one metal impact. Same kind + seed always gives the same sound. */
export function renderImpact(kind: ImpactKind, seed: number, sr: number): Float32Array {
  const R = RECIPES[kind];
  const rnd = prng(seed * 7919 + kind.length * 104729);
  const between = (a: [number, number]) => a[0] + (a[1] - a[0]) * rnd();
  const n = Math.ceil(R.dur * sr);
  const out = new Float32Array(n);

  // --- plate modes: dense, inharmonic, quickly damped
  const modes = new Float32Array(n);
  const f0 = between(R.f0);
  const tau0 = between(R.tau);
  for (let k = 0; k < R.modes; k++) {
    const ratio = (1 + (R.spread - 1) * Math.pow(k / (R.modes - 1), 1.6)) * (0.93 + rnd() * 0.14);
    const f = f0 * ratio;
    const amp = (0.3 + rnd() * 0.7) * Math.pow(ratio, -R.tilt);
    const tau = Math.max(0.005, tau0 * Math.pow(ratio, -0.6) * (0.7 + rnd() * 0.6));
    addMode(modes, sr, 0, f, amp, tau);
    // the lower modes come in slightly detuned pairs: the shimmer of real sheet metal
    if (k < 4) addMode(modes, sr, 0, f * (1.004 + rnd() * 0.012), amp * (0.5 + rnd() * 0.5), tau * (0.8 + rnd() * 0.4));
  }

  // --- rattle: loose plates and bolts clattering just after the hit
  const rattles = Math.round(between(R.rattle));
  let t = 0.012 + rnd() * 0.02;
  for (let i = 0; i < rattles; i++) {
    const at = Math.floor(t * sr);
    if (at >= n) break;
    const g = R.rattleGain * Math.pow(0.65, i) * (0.6 + rnd() * 0.4);
    for (let m = 0; m < 3; m++) addMode(modes, sr, at, 1800 + rnd() * 5200, g * (0.4 + rnd() * 0.6), 0.006 + rnd() * 0.014);
    for (let s = 0; s < 40 && at + s < n; s++) modes[at + s] += g * 0.6 * (rnd() * 2 - 1) * Math.exp(-s / 12);
    t += (0.012 + rnd() * 0.04) * (1 + i * 0.3);
  }

  // --- body thump, click and crunch, sample by sample
  const bodyHz = between(R.bodyHz);
  const crunchHz = between(R.crunchHz);
  // state-variable bandpass for the crunch noise
  const fc = 2 * Math.sin((Math.PI * Math.min(crunchHz, sr * 0.2)) / sr);
  const q = 0.9;
  let low = 0, band = 0;
  let hp = 0, prev = 0;
  let phase = 0;
  let grain = 0, grainGain = 1;
  for (let i = 0; i < n; i++) {
    const ts = i / sr;
    // pitch drops as the impact energy spreads out
    const f = bodyHz * (1 + 1.6 * Math.exp(-ts / 0.012));
    phase += (2 * Math.PI * f) / sr;
    const body = R.body * Math.sin(phase) * (1 - Math.exp(-ts / 0.0015)) * Math.exp(-ts / R.bodyTau);
    const white = rnd() * 2 - 1;
    hp = 0.86 * (hp + white - prev);
    prev = white;
    const click = R.click * hp * Math.exp(-ts / 0.0018);
    // crunch: band-limited noise chopped into random grains (crackle)
    if (--grain <= 0) {
      grain = Math.floor(sr * (0.0015 + rnd() * 0.0045));
      grainGain = 0.2 + rnd() * 0.8;
    }
    low += fc * band;
    const high = white - low - q * band;
    band += fc * high;
    const crunch = R.crunch * band * grainGain * (1 - Math.exp(-ts / 0.001)) * Math.exp(-ts / R.crunchTau);
    out[i] = modes[i] * R.modeGain + body + click + crunch;
  }

  // --- saturate for grit, remove DC, normalise, fade out
  const k = Math.tanh(R.drive);
  let peak = 0;
  let dcx = 0, dcy = 0;
  const dcR = 1 - (2 * Math.PI * 25) / sr;
  for (let i = 0; i < n; i++) {
    const s = Math.tanh(out[i] * R.drive) / k;
    dcy = s - dcx + dcR * dcy;
    dcx = s;
    out[i] = dcy;
    peak = Math.max(peak, Math.abs(dcy));
  }
  const norm = peak > 0 ? 0.9 / peak : 0;
  const fade = Math.floor(sr * 0.015);
  for (let i = 0; i < n; i++) {
    out[i] *= norm * (i > n - fade ? (n - i) / fade : 1);
  }
  return out;
}

/** How many variations of each kind to keep around. */
export const BANK: Record<ImpactKind, number> = { punch: 6, kick: 6, head: 5, block: 6, heavy: 4, thud: 4, step: 6 };
