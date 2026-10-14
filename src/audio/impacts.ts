/**
 * Procedural metal impact synthesis (no audio files). Each call renders one variation into a
 * Float32Array, built the way a struck armour panel actually sounds:
 *
 * - Two plates (the panel that was hit and the frame behind it) ring with the real mode
 *   pattern of a rectangular plate, f ∝ (m/a)² + (n/b)², so the spectrum is dense and
 *   inharmonic like steel, never a tuned bell.
 * - Where the blow lands on the plate decides which modes it excites (a node can't move), and
 *   how long the contact lasts decides how bright it is: a fist is a short, hard contact that
 *   reaches the high modes, a shin or a body slam is longer and duller.
 * - Hard blows bend the plate, so its lowest modes start sharp and sag back to pitch.
 * - Under that: a low body thump with a falling pitch, a contact crack, gritty crunch noise,
 *   loose bolts rattling after the hit, and (for battered parts) metal crumpling.
 *
 * Different seeds give different sounds, so hits never repeat.
 */

export type ImpactKind = 'punch' | 'kick' | 'head' | 'block' | 'heavy' | 'thud' | 'step' | 'clang' | 'crunch' | 'tink';

interface Recipe {
  dur: number;
  /** Lowest mode of the struck plate (Hz). */
  f0: [number, number];
  modes: number;
  /** Side ratio of the plate: changes how the modes pack together. */
  aspect: [number, number];
  /** Decay time constant of the lowest mode (s). */
  tau: [number, number];
  /** How much faster higher modes die (tau ∝ ratio^-damp). */
  damp: number;
  /** Contact time of the blow (s): longer is duller. */
  contact: [number, number];
  modeGain: number;
  /** The frame behind the panel: second plate, as a gain relative to the first (0 = none). */
  frame: number;
  /** Pitch bend of the lowest modes at the moment of impact (fraction). */
  glide: number;
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
  /** Crumpling grains (count range) for dented, failing metal. */
  crumple: [number, number];
  drive: number;
}

const R0: Recipe = {
  dur: 0.5, f0: [150, 240], modes: 18, aspect: [1.15, 1.8], tau: [0.05, 0.09], damp: 0.55, contact: [0.00022, 0.00038],
  modeGain: 0.55, frame: 0.45, glide: 0.04, body: 0.9, bodyHz: [70, 95], bodyTau: 0.06, click: 0.55, crunch: 0.35,
  crunchTau: 0.03, crunchHz: [1500, 3200], rattle: [1, 3], rattleGain: 0.25, crumple: [0, 0], drive: 2.2,
};

const RECIPES: Record<ImpactKind, Recipe> = {
  punch: R0,
  kick: { ...R0, dur: 0.6, f0: [100, 165], tau: [0.06, 0.11], contact: [0.0004, 0.0007], glide: 0.06, body: 1.15, bodyHz: [50, 70], bodyTau: 0.09, click: 0.45, crunch: 0.45, crunchTau: 0.04, crunchHz: [900, 2200], rattle: [2, 4], rattleGain: 0.3, drive: 2.6 },
  head: { ...R0, dur: 0.6, f0: [240, 400], modes: 16, tau: [0.08, 0.14], damp: 0.45, contact: [0.00018, 0.0003], modeGain: 0.65, frame: 0.3, glide: 0.035, body: 0.55, bodyHz: [90, 130], bodyTau: 0.045, click: 0.65, crunch: 0.28, crunchTau: 0.025, crunchHz: [2500, 4500] },
  block: { ...R0, dur: 0.4, f0: [300, 520], modes: 14, tau: [0.035, 0.07], damp: 0.5, contact: [0.00015, 0.00025], modeGain: 0.6, frame: 0.25, glide: 0.02, body: 0.35, bodyHz: [110, 150], bodyTau: 0.03, click: 0.85, crunch: 0.2, crunchTau: 0.015, crunchHz: [3000, 5500], rattle: [0, 2], rattleGain: 0.2, drive: 1.8 },
  heavy: { ...R0, dur: 1.1, f0: [70, 115], modes: 24, tau: [0.12, 0.22], damp: 0.6, contact: [0.0006, 0.001], modeGain: 0.5, frame: 0.6, glide: 0.09, body: 1.3, bodyHz: [40, 55], bodyTau: 0.14, click: 0.5, crunch: 0.55, crunchTau: 0.045, crunchHz: [700, 1800], rattle: [3, 6], rattleGain: 0.35, drive: 2.6 },
  thud: { ...R0, dur: 0.8, f0: [60, 105], modes: 16, tau: [0.05, 0.1], damp: 0.7, contact: [0.0015, 0.003], modeGain: 0.35, frame: 0.5, glide: 0.05, body: 1.3, bodyHz: [38, 55], bodyTau: 0.12, click: 0.25, crunch: 0.5, crunchTau: 0.04, crunchHz: [500, 1400], rattle: [4, 7], rattleGain: 0.4, drive: 2.2 },
  step: { ...R0, dur: 0.22, f0: [180, 320], modes: 9, tau: [0.018, 0.035], damp: 0.7, contact: [0.0008, 0.0014], modeGain: 0.35, frame: 0, glide: 0, body: 0.8, bodyHz: [60, 85], bodyTau: 0.035, click: 0.3, crunch: 0.12, crunchTau: 0.01, crunchHz: [1500, 3000], rattle: [0, 1], rattleGain: 0.15, drive: 1.5 },
  // a big panel left ringing: the long metallic tail under a crushing blow
  clang: { ...R0, dur: 1.7, f0: [105, 175], modes: 22, aspect: [1.3, 2.2], tau: [0.38, 0.6], damp: 0.45, contact: [0.00025, 0.0004], modeGain: 0.8, frame: 0.35, glide: 0.05, body: 0.35, bodyHz: [60, 80], bodyTau: 0.05, click: 0.5, crunch: 0.12, crunchTau: 0.02, crunchHz: [2500, 4000], rattle: [1, 3], rattleGain: 0.15, drive: 1.4 },
  // a battered part giving way: dented plates crumpling and popping
  crunch: { ...R0, dur: 0.45, f0: [180, 300], modes: 10, tau: [0.025, 0.045], damp: 0.6, contact: [0.0005, 0.0009], modeGain: 0.35, frame: 0.2, glide: 0.12, body: 0.5, bodyHz: [55, 80], bodyTau: 0.05, click: 0.4, crunch: 0.8, crunchTau: 0.07, crunchHz: [900, 2600], rattle: [2, 4], rattleGain: 0.35, crumple: [14, 26], drive: 2.8 },
  // a nut or a chip of plating bouncing on the canvas (rendered by its own path below)
  tink: { ...R0, dur: 0.5 },
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
  if (freq >= sr * 0.45 || amp <= 0 || start >= out.length) return;
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

/**
 * A mode whose pitch starts `glide` sharp and sags back with time constant gTau: a plate bent
 * by a hard blow springs back. Runs a rotating phasor, re-aiming it every 16 samples.
 */
function addGlideMode(out: Float32Array, sr: number, freq: number, amp: number, tau: number, glide: number, gTau: number) {
  if (freq * (1 + glide) >= sr * 0.45 || amp <= 0) return;
  const len = Math.min(out.length, Math.ceil(tau * sr * 9.2));
  const decay = Math.exp(-1 / (tau * sr));
  let re = 0, im = amp, c = 1, s = 0;
  for (let n = 0; n < len; n++) {
    if ((n & 15) === 0) {
      const w = (2 * Math.PI * freq * (1 + glide * Math.exp(-n / (gTau * sr)))) / sr;
      c = Math.cos(w);
      s = Math.sin(w);
    }
    const r2 = (re * c - im * s) * decay;
    im = (re * s + im * c) * decay;
    re = r2;
    out[n] += re;
  }
}

/** Mode ratios of a simply supported rectangular plate with side ratio `aspect`, lowest = 1. */
function plateModes(aspect: number, count: number): { ratio: number; m: number; n: number }[] {
  const all: { ratio: number; m: number; n: number }[] = [];
  const b2 = 1 / (aspect * aspect);
  const base = 1 + b2;
  for (let m = 1; m <= 9; m++) for (let n = 1; n <= 9; n++) all.push({ ratio: (m * m + n * n * b2) / base, m, n });
  all.sort((a, b) => a.ratio - b.ratio);
  const out: typeof all = [];
  for (const md of all) {
    // modes closer than 1.5% would just beat as one
    if (out.length && md.ratio / out[out.length - 1].ratio < 1.015) continue;
    out.push(md);
    if (out.length >= count) break;
  }
  return out;
}

/** Rings one plate struck at (sx, sy) on it, adding into `out`. */
function strikePlate(out: Float32Array, sr: number, rnd: () => number, R: Recipe, f0: number, gain: number, count: number) {
  const aspect = R.aspect[0] + (R.aspect[1] - R.aspect[0]) * rnd();
  const sx = 0.12 + rnd() * 0.76, sy = 0.12 + rnd() * 0.76;
  const contact = R.contact[0] + (R.contact[1] - R.contact[0]) * rnd();
  const tau0 = R.tau[0] + (R.tau[1] - R.tau[0]) * rnd();
  const modes = plateModes(aspect, count);
  for (let k = 0; k < modes.length; k++) {
    const { ratio, m, n } = modes[k];
    const f = f0 * ratio * (0.97 + rnd() * 0.06);
    // the blow can't move a node line: modes with one under the fist barely sound
    const shape = 0.15 + 0.85 * Math.abs(Math.sin(m * Math.PI * sx) * Math.sin(n * Math.PI * sy));
    // a contact of length T is a pulse whose spectrum falls away above ~1/T
    const x = f * contact * 1.6;
    const bright = 1 / Math.sqrt(1 + x * x * x * x);
    const amp = gain * shape * bright * (0.55 + rnd() * 0.45) * Math.pow(ratio, -0.25);
    const tau = Math.max(0.004, tau0 * Math.pow(ratio, -R.damp) * (0.75 + rnd() * 0.5));
    if (k < 5 && R.glide > 0) {
      addGlideMode(out, sr, f, amp, tau, R.glide * (1 - k * 0.15), 0.02 + rnd() * 0.02);
      // the lowest modes come in slightly detuned pairs: the shimmer of real sheet metal
      if (k < 3) addMode(out, sr, 0, f * (1.004 + rnd() * 0.012), amp * (0.4 + rnd() * 0.4), tau * (0.8 + rnd() * 0.4));
    } else addMode(out, sr, 0, f, amp, tau);
  }
}

/**
 * A lump of steel (a nut, a bolt, a torn chunk of plate) landing on the canvas: a heavy, dead
 * "tok" that thuds into the padded deck, not a bright ting. A short low body thump, a mid
 * knock of a thick part (low, close modes that die almost at once), a dull scuff of contact
 * noise, and at most one low skip after it.
 */
function renderTink(rnd: () => number, sr: number): Float32Array {
  const n = Math.ceil(0.35 * sr);
  const out = new Float32Array(n);
  // thick, stubby parts: low modes packed close, heavily damped
  const ratios = [1, 1.62, 2.43, 3.3];
  const f0 = 420 + rnd() * 380;
  const bounces = rnd() < 0.55 ? 2 : 1;
  let t = 0;
  let g = 1;
  for (let b = 0; b < bounces; b++) {
    const at = Math.floor(t * sr);
    for (let k = 0; k < ratios.length; k++) {
      addMode(out, sr, at, f0 * ratios[k] * (0.94 + rnd() * 0.12), g * (0.8 - k * 0.17) * (0.6 + rnd() * 0.4), (0.008 + rnd() * 0.01) / (1 + k * 0.5));
    }
    // the deck taking the weight: a low thump that drops in pitch
    const bodyHz = 110 + rnd() * 70;
    let ph = 0;
    for (let s = 0; s < Math.floor(0.06 * sr) && at + s < n; s++) {
      const ts = s / sr;
      ph += (2 * Math.PI * bodyHz * (1 + 0.8 * Math.exp(-ts / 0.006))) / sr;
      out[at + s] += g * 1.1 * Math.sin(ph) * (1 - Math.exp(-ts / 0.0008)) * Math.exp(-ts / 0.018);
    }
    // dull scuff: lowpassed contact noise, no click
    let lp = 0;
    for (let s = 0; s < 220 && at + s < n; s++) {
      lp += 0.18 * (rnd() * 2 - 1 - lp);
      out[at + s] += g * 1.4 * lp * Math.exp(-s / 45);
    }
    t += 0.05 + rnd() * 0.06;
    g *= 0.3 + rnd() * 0.15;
  }
  // a touch of grit, then normalise
  let peak = 0;
  for (let i = 0; i < n; i++) {
    out[i] = Math.tanh(out[i] * 1.8);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const norm = peak > 0 ? 0.9 / peak : 0;
  const fade = Math.floor(sr * 0.02);
  for (let i = 0; i < n; i++) out[i] *= norm * (i > n - fade ? (n - i) / fade : 1);
  return out;
}

/** Renders one metal impact. Same kind + seed always gives the same sound. */
export function renderImpact(kind: ImpactKind, seed: number, sr: number): Float32Array {
  const R = RECIPES[kind];
  const rnd = prng(seed * 7919 + kind.length * 104729 + kind.charCodeAt(0) * 31);
  if (kind === 'tink') return renderTink(rnd, sr);
  const between = (a: [number, number]) => a[0] + (a[1] - a[0]) * rnd();
  const n = Math.ceil(R.dur * sr);
  const out = new Float32Array(n);

  // --- the struck panel, and the frame behind it ringing a little lower or higher
  const modes = new Float32Array(n);
  const f0 = between(R.f0);
  strikePlate(modes, sr, rnd, R, f0, 1, R.modes);
  if (R.frame > 0) strikePlate(modes, sr, rnd, R, f0 * (rnd() < 0.5 ? 0.62 + rnd() * 0.12 : 1.35 + rnd() * 0.4), R.frame, Math.ceil(R.modes * 0.6));

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

  // --- crumple: a run of small pops as dented metal buckles, thick at first then thinning out
  const grains = Math.round(between(R.crumple));
  const span = 0.12 + rnd() * 0.16;
  for (let i = 0; i < grains; i++) {
    const at = Math.floor((0.004 + span * Math.pow(i / grains, 1.7) + rnd() * 0.006) * sr);
    if (at >= n) break;
    const g = 0.5 * (1 - i / grains * 0.7) * (0.4 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1);
    addMode(modes, sr, at, between(R.crunchHz) * (0.6 + rnd() * 1.4), g, 0.0015 + rnd() * 0.004);
    if (rnd() < 0.4) addMode(modes, sr, at, 260 + rnd() * 500, g * 0.7, 0.008 + rnd() * 0.012);
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
export const BANK: Record<ImpactKind, number> = { punch: 7, kick: 6, head: 5, block: 6, heavy: 4, thud: 4, step: 6, clang: 4, crunch: 5, tink: 6 };
