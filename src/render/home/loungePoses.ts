import { pose, type Key } from './puppet';

/**
 * The lounge robot's poses, in its own frame on the sofa (root on the floor under the front of
 * its seat cushion, x to its right, z towards the TV). The sofa runs off to its right; its left
 * armrest's inner face is at x -0.55, the seat cushions' top at y 0.46 from z -0.42 to 0.24, and
 * the back cushions lean back from there. The coffee table's top is at y 0.42, z 0.78 to 1.22.
 */
export const SOFA = {
  seatY: 0.46,
  seatZ0: -0.42,
  seatZ1: 0.24,
  armX: -0.55,
  armTop: 0.74,
} as const;

export const TABLE = { y: 0.42, z0: 0.78, z1: 1.22, halfW: 0.5 } as const;

/** Where the mug is set down, in the robot's frame. */
export const MUG_AT = [0.3, TABLE.y, 0.92] as const;

/** Feet up on the coffee table, ankles relaxed. */
const FEET_UP = [
  { at: [0.15, 0.5, 0.86], pole: [0.2, 1, 0.3], air: 1, flex: 0.45 },
  { at: [0.12, 0.49, 0.8], pole: [0.2, 1, 0.3], air: 1, flex: 0.3 },
] as const;

/** Feet down on the rug in front of the sofa. */
const FEET_DOWN = [
  { at: [0.17, 0, 0.44], pole: [0, 0.5, 1], yaw: 0.1 },
  { at: [0.17, 0, 0.4], pole: [0, 0.5, 1], yaw: 0.1 },
] as const;

/** The left hand resting on the armrest. */
const ARMREST = { at: [-0.64, 0.79, -0.06], in: 'root', abs: true, pole: [0.6, -0.6, -0.5], roll: 1 } as const;

/** Slumped deep into the cushions, a mug on its belly, feet up on the table, watching TV. */
export const SLOUCH = pose({
  pelvis: [0, 0.58, -0.05],
  hips: [-0.78, 0, 0],
  spine: [0.06, 0, 0],
  head: [0.66, 0.04, 0],
  hands: [ARMREST, { at: [0.12, -0.3, 0.25], pole: [1, -0.4, -0.4], roll: 0.2 }],
  feet: FEET_UP,
});

/** The mug up to the mouth. */
export const DRINK = pose({
  pelvis: [0, 0.58, -0.05],
  hips: [-0.74, 0, 0],
  spine: [0.08, 0, 0],
  head: [0.5, 0.04, 0],
  hands: [ARMREST, { at: [0.03, -0.08, 0.2], in: 'head', pole: [1, -0.6, -0.1], roll: 0.5 }],
  feet: FEET_UP,
});

/** Head back for a long sip. */
export const SIP = pose({
  pelvis: [0, 0.58, -0.05],
  hips: [-0.76, 0, 0],
  spine: [0.06, 0, 0],
  head: [0.3, 0.04, 0],
  hands: [ARMREST, { at: [0.03, -0.06, 0.18], in: 'head', pole: [1, -0.6, -0.1], roll: 0.6 }],
  feet: FEET_UP,
});

/** The idle loop: watching, and every so often a sip. */
export const IDLE_LEN = 10;
export const IDLE: Key[] = [
  [0, SLOUCH],
  [5.6, SLOUCH],
  [6.5, DRINK],
  [7.1, SIP],
  [7.9, DRINK],
  [8.8, SLOUCH],
  [10, SLOUCH],
];

// ---------------------------------------------------------------- the news

/** The TV cuts to the alert: bolt upright, staring at it, mid-sip. */
const ALERTED = pose({
  pelvis: [0, 0.58, -0.04],
  hips: [-0.32, 0, 0],
  spine: [0.1, 0, 0],
  head: [0.12, 0, 0],
  hands: [ARMREST, { at: [0.12, -0.14, 0.3], pole: [1, -0.5, -0.3], roll: 0.3 }],
  feet: [
    { at: [0.15, 0.5, 0.8], pole: [0.2, 1, 0.4], air: 1, flex: 0.2 },
    { at: [0.12, 0.49, 0.76], pole: [0.2, 1, 0.4], air: 1, flex: 0.1 },
  ],
});

/** A nervous gulp. */
const GULP = pose({
  pelvis: [0, 0.58, -0.04],
  hips: [-0.3, 0, 0],
  spine: [0.04, 0, 0],
  head: [-0.08, 0, 0],
  hands: [ARMREST, { at: [0.03, -0.07, 0.19], in: 'head', pole: [1, -0.6, -0.1], roll: 0.6 }],
  feet: [
    { at: [0.15, 0.5, 0.8], pole: [0.2, 1, 0.4], air: 1, flex: 0.2 },
    { at: [0.12, 0.49, 0.76], pole: [0.2, 1, 0.4], air: 1, flex: 0.1 },
  ],
});

/** ...and out it all comes. */
const SPIT = pose({
  pelvis: [0, 0.58, -0.02],
  hips: [-0.12, 0, 0],
  spine: [0.28, 0, 0],
  head: [0.32, 0, 0],
  hands: [
    { at: [0.22, 0.02, 0.3], pole: [0.6, -0.6, -0.5], roll: 0 },
    { at: [0.3, -0.12, 0.3], pole: [1, -0.5, -0.3], roll: 0.2 },
  ],
  feet: [
    { at: [0.16, 0.56, 0.72], pole: [0.2, 1, 0.4], air: 1, flex: 0.1 },
    { at: [0.13, 0.55, 0.68], pole: [0.2, 1, 0.4], air: 1, flex: 0.1 },
  ],
});

/** Feet down, leaning over to put the mug on the table. */
const LEAN = pose({
  pelvis: [0, 0.58, 0.1],
  hips: [0.78, 0, 0],
  spine: [0.25, 0, 0],
  head: [-0.2, 0, 0],
  hands: [
    { at: [-0.22, 0.62, 0.42], in: 'root', abs: true, pole: [0.5, -1, -0.2] },
    { at: [MUG_AT[0], MUG_AT[1] + 0.08, MUG_AT[2]], in: 'root', abs: true, pole: [0.6, -0.6, -0.4], roll: 0.4 },
  ],
  feet: FEET_DOWN,
});

/** Pushing up off the knees. */
const RISE = pose({
  pelvis: [0, 0.7, 0.28],
  hips: [0.62, 0, 0],
  spine: [0.2, 0, 0],
  head: [-0.25, 0, 0],
  hands: [
    { at: [-0.2, 0.56, 0.5], in: 'root', abs: true, pole: [0.5, -1, -0.2] },
    { at: [0.2, 0.56, 0.5], in: 'root', abs: true, pole: [0.5, -1, -0.2] },
  ],
  feet: FEET_DOWN,
});

/** On its feet between the sofa and the table (the live fighter takes over from here). */
export const STAND_AT = [0, 0, 0.42] as const;
const STAND = pose({
  pelvis: [0, 0.88, 0.42],
  hips: [0.04, 0, 0],
  spine: [0.02, 0, 0],
  head: [0, 0, 0],
  hands: [
    { at: [0.3, -0.36, 0.12], pole: [0.4, -0.2, -1], roll: 0.3 },
    { at: [0.3, -0.36, 0.12], pole: [0.4, -0.2, -1], roll: 0.3 },
  ],
  feet: [
    { at: [0.17, 0, 0.46], pole: [0.2, 0.2, 1], yaw: 0.12 },
    { at: [0.17, 0, 0.4], pole: [0.2, 0.2, 1], yaw: 0.12 },
  ],
});

/** Times (s after Fight) of the news's beats. */
export const NEWS = {
  alarm: 0,
  sitUp: 0.3,
  gulp: 0.75,
  spit: 1.15,
  feet: 1.6,
  lean: 1.95,
  down: 2.2,
  rise: 2.55,
  stand: 3.05,
  live: 3.2,
  emote: 3.45,
  cut: 5.0,
} as const;

export const OUTRO: Key[] = [
  [0, SLOUCH],
  [NEWS.sitUp, ALERTED],
  [0.55, ALERTED],
  [NEWS.gulp, GULP],
  [1.0, GULP],
  [NEWS.spit, SPIT],
  [1.5, SPIT],
  [NEWS.lean, LEAN],
  [NEWS.down, LEAN],
  [NEWS.rise, RISE],
  [NEWS.stand, STAND],
];
