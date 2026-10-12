import type { Rng } from '../sim/math';

/**
 * A robot's paint job: two plating colours, the glow colour of its lights and trim, the
 * finish of the paint and the metal of its bare frame (joints, axles, under-plates).
 */
export interface Paint {
  primary: number;
  secondary: number;
  accent: number;
  /** Index into FINISHES. */
  finish: number;
  /** Index into FRAMES. */
  frame: number;
}

/** How the plating catches the light: metalness and roughness for the main and second paint. */
export interface Finish {
  name: string;
  blurb: string;
  metal: number;
  rough: number;
  metal2: number;
  rough2: number;
}

export const FINISHES: Finish[] = [
  { name: 'Satin', blurb: 'Soft factory sheen', metal: 0.25, rough: 0.34, metal2: 0.35, rough2: 0.42 },
  { name: 'Gloss', blurb: 'Wet clear coat', metal: 0.05, rough: 0.12, metal2: 0.1, rough2: 0.18 },
  { name: 'Matte', blurb: 'Flat, no shine', metal: 0, rough: 0.82, metal2: 0.05, rough2: 0.78 },
  { name: 'Metallic', blurb: 'Flaked car paint', metal: 0.62, rough: 0.28, metal2: 0.55, rough2: 0.34 },
  { name: 'Anodized', blurb: 'Dyed bare metal', metal: 0.92, rough: 0.36, metal2: 0.88, rough2: 0.42 },
  { name: 'Chrome', blurb: 'Coloured mirror', metal: 1, rough: 0.07, metal2: 1, rough2: 0.12 },
];

/** The bare metal of the frame: main metal, joints and the dark under-plates. */
export interface Frame {
  name: string;
  metal: number;
  joint: number;
  dark: number;
  /** Metalness and roughness of the main metal. */
  m: number;
  r: number;
}

export const FRAMES: Frame[] = [
  { name: 'Gunmetal', metal: 0x4a505a, joint: 0x2b3039, dark: 0x16191f, m: 0.85, r: 0.34 },
  { name: 'Blackout', metal: 0x24272d, joint: 0x17191e, dark: 0x0b0c0f, m: 0.8, r: 0.4 },
  { name: 'Titanium', metal: 0x9aa0aa, joint: 0x5d636d, dark: 0x22252b, m: 0.9, r: 0.28 },
  { name: 'Gold', metal: 0xd1a344, joint: 0x7d5c24, dark: 0x1d1913, m: 1, r: 0.24 },
  { name: 'Copper', metal: 0xbf6f42, joint: 0x6e3d22, dark: 0x1d1512, m: 1, r: 0.3 },
  { name: 'Ceramic', metal: 0xdfe2e7, joint: 0x9aa0aa, dark: 0x2a2d33, m: 0.15, r: 0.4 },
];

/** Plating colours: ten hues in vivid, deep and light, then a row of neutrals. */
export const PAINT_COLORS: number[] = [
  // vivid
  0xe8253a, 0xff7a1a, 0xf4d21b, 0x9bdc28, 0x22b866, 0x14b8c4, 0x2d9cff, 0x2d55df, 0x7a3fe0, 0xf04a9a,
  // deep
  0x8f1522, 0xb4470e, 0xb08a12, 0x557a14, 0x10663a, 0x0c6e78, 0x135a9a, 0x1c2c7a, 0x45208a, 0x8a1c55,
  // light
  0xff9aa5, 0xffc08f, 0xfff0a0, 0xd6f59a, 0xa6efc4, 0x9cf0f2, 0xa8d4ff, 0xb3c0ff, 0xd2b8ff, 0xffb3d1,
  // neutrals
  0xf2efe8, 0xc6ccd4, 0x8a919c, 0x3a404c, 0x1d2129, 0xe7d9bc, 0xc9a46a, 0x6b4a2e, 0x5c6436, 0x1f2a44,
];

/** Glow colours for the lights, visor and trim. */
export const GLOW_COLORS: number[] = [
  0xff5a5a, 0xff8a3d, 0xffc23d, 0xfff36b, 0xb6ff4a, 0x7dffb0, 0x3cffd8, 0x6ff7ff,
  0x7cc4ff, 0x4f7bff, 0x9c6bff, 0xd36bff, 0xff5fd2, 0xffb3d1, 0xffffff, 0xffe2b0,
];

export interface PaintScheme {
  name: string;
  paint: Paint;
}

const sch = (name: string, primary: number, secondary: number, accent: number, finish = 0, frame = 0): PaintScheme => ({
  name,
  paint: { primary, secondary, accent, finish, frame },
});

/**
 * Ready-made paint jobs. The first ten are the original palettes in their original order:
 * saved bots and bots from older versions stored an index into this list.
 */
export const SCHEMES: PaintScheme[] = [
  sch('Blaze', 0xff7a1a, 0xf2efe8, 0xffc23d),
  sch('Tide', 0x14b8c4, 0x1d2433, 0x6ff7ff),
  sch('Crimson', 0xd9283e, 0x22252d, 0xff5a5a),
  sch('Volt', 0xf4d21b, 0x23272f, 0xfff36b),
  sch('Frost', 0xe8eef5, 0x2d6cdf, 0x7cc4ff),
  sch('Jade', 0x22b866, 0xe9ece8, 0x7dffb0),
  sch('Royal', 0x5b3fd6, 0xe8e2ff, 0xb59cff),
  sch('Graphite', 0x3a404c, 0xff6b2c, 0xff9a55),
  sch('Sakura', 0xf06aa0, 0x2a2433, 0xffb3d1),
  sch('Desert', 0xc9a46a, 0x3b3229, 0xffd27a),
  sch('Stealth', 0x1d2129, 0x3a404c, 0xff5a5a, 2, 1),
  sch('Gold Rush', 0xd8a93a, 0x1d2129, 0xffc23d, 5, 1),
  sch('Racer', 0x2d55df, 0xf2efe8, 0xff8a3d, 1, 2),
  sch('Toxic', 0x9bdc28, 0x1d2129, 0xb6ff4a, 1, 1),
  sch('Glacier', 0xf2efe8, 0xa8d4ff, 0x6ff7ff, 4, 2),
  sch('Inferno', 0xe8253a, 0xff7a1a, 0xffc23d, 3, 1),
  sch('Synthwave', 0xf04a9a, 0x45208a, 0x3cffd8, 3, 0),
  sch('Copperhead', 0xbf6f42, 0x0c6e78, 0x3cffd8, 4, 4),
  sch('Ghost', 0xdfe2e7, 0xc6ccd4, 0x7cc4ff, 1, 5),
  sch('Army', 0x5c6436, 0xc9a46a, 0xffc23d, 2, 0),
  sch('Navy', 0x1f2a44, 0xc6ccd4, 0x4f7bff, 3, 2),
  sch('Bubblegum', 0xffb3d1, 0x9cf0f2, 0xff5fd2, 1, 5),
  sch('Ultraviolet', 0x45208a, 0x1d2129, 0xd36bff, 4, 1),
  sch('Lava', 0x1d2129, 0x8f1522, 0xff8a3d, 2, 1),
  sch('Chrome', 0xc6ccd4, 0x3a404c, 0x6ff7ff, 5, 2),
  sch('Emerald', 0x10663a, 0xd1a344, 0x7dffb0, 4, 3),
];

export const DEFAULT_PAINT: Paint = { ...SCHEMES[0].paint };

export const samePaint = (a: Paint, b: Paint) =>
  a.primary === b.primary && a.secondary === b.secondary && a.accent === b.accent && a.finish === b.finish && a.frame === b.frame;

/** The scheme this paint matches exactly, if any. */
export const schemeOf = (p: Paint) => SCHEMES.find((s) => samePaint(s.paint, p));

/** A short stable string for caches. */
export const paintKey = (p: Paint) => `${p.primary.toString(16)}.${p.secondary.toString(16)}.${p.accent.toString(16)}.${p.finish}.${p.frame}`;

export const hexColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const isColor = (c: unknown): c is number => Number.isInteger(c) && (c as number) >= 0 && (c as number) <= 0xffffff;

/**
 * Any stored or received paint made safe. Accepts a paint object, or the old palette index
 * (saved bots and older messages), and falls back to the default scheme.
 */
export function sanitizePaint(paint: unknown, legacyPalette?: unknown): Paint {
  if (paint && typeof paint === 'object') {
    const p = paint as Partial<Paint>;
    const base = { ...DEFAULT_PAINT };
    if (isColor(p.primary)) base.primary = p.primary;
    if (isColor(p.secondary)) base.secondary = p.secondary;
    if (isColor(p.accent)) base.accent = p.accent;
    if (Number.isInteger(p.finish) && p.finish! >= 0 && p.finish! < FINISHES.length) base.finish = p.finish!;
    if (Number.isInteger(p.frame) && p.frame! >= 0 && p.frame! < FRAMES.length) base.frame = p.frame!;
    return base;
  }
  if (Number.isInteger(legacyPalette) && (legacyPalette as number) >= 0 && (legacyPalette as number) < 10) return { ...SCHEMES[legacyPalette as number].paint };
  return { ...DEFAULT_PAINT };
}

const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const dist = (a: number, b: number) => {
  const x = rgb(a), y = rgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** Whether two paint jobs read as different robots at fight distance. */
export function paintsContrast(a: Paint, b: Paint) {
  return Math.min(dist(a.primary, b.primary), dist(a.secondary, b.primary) * 1.4, dist(a.primary, b.secondary) * 1.4) > 150;
}

/** A scheme that reads clearly against `mine` (random among those that do, when `rng` is given). */
export function contrastingPaint(mine: Paint, rng?: Rng): Paint {
  const ok = SCHEMES.filter((s) => !samePaint(s.paint, mine) && paintsContrast(s.paint, mine));
  const pick = ok.length ? (rng ? rng.pick(ok) : ok[0]) : SCHEMES[(SCHEMES.indexOf(schemeOf(mine) ?? SCHEMES[0]) + 5) % SCHEMES.length];
  return { ...pick.paint };
}
