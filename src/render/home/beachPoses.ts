import { pose, type Key } from './puppet';

/**
 * The beach robot's poses, in its own frame on the sun lounger (root at the foot of the
 * backrest's hinge line, x to its right, z towards the foot end). Lounger: cushion top at
 * y 0.42 from z -0.25 to 1.1, backrest rising back from (z -0.25, y 0.42) at 48 degrees.
 */
export const LOUNGER = {
  seatY: 0.42,
  seatZ0: -0.25,
  seatZ1: 1.1,
  halfW: 0.36,
  backAngle: 0.84,
  backLen: 0.95,
} as const;

/** Where the phone and the coconut sit, in the robot's frame. */
export const PHONE_AT = [-0.74, 0.515, 0.08] as const;
export const TABLE_L = [-0.76, 0, 0.06] as const;
export const TABLE_R = [0.8, 0, -0.1] as const;

const LEGS = [
  { at: [0.15, 0.5, 0.8], pole: [0, 1, 0.3], air: 1, flex: 0.35 },
  { at: [0.13, 0.47, 0.42], pole: [0.35, 1, 0.4], air: 1, flex: 0.2 },
] as const;

/** Lying back, one hand behind the head, the other holding a coconut on its belly, one knee up. */
export const LIE = pose({
  pelvis: [0, 0.6, -0.14],
  hips: [-0.74, 0, 0],
  spine: [0.04, 0, 0],
  head: [0.42, 0.05, 0],
  hands: [
    { at: [0.13, 0.03, -0.1], in: 'head', pole: [0.6, 0.85, -0.2], roll: -0.4 },
    { at: [0.12, -0.32, 0.25], pole: [1, -0.4, -0.4], roll: 0.2 },
  ],
  feet: LEGS,
});

/** The coconut up to the mouth. */
export const DRINK = pose({
  pelvis: [0, 0.6, -0.14],
  hips: [-0.72, 0, 0],
  spine: [0.06, 0, 0],
  head: [0.24, 0.05, 0],
  hands: [
    { at: [0.13, 0.03, -0.1], in: 'head', pole: [0.6, 0.85, -0.2], roll: -0.4 },
    { at: [0.03, -0.08, 0.2], in: 'head', pole: [1, -0.6, -0.1], roll: 0.5 },
  ],
  feet: LEGS,
});

/** Head back for the last of it. */
export const SIP = pose({
  pelvis: [0, 0.6, -0.14],
  hips: [-0.74, 0, 0],
  spine: [0.04, 0, 0],
  head: [0.06, 0.05, 0],
  hands: [
    { at: [0.13, 0.03, -0.1], in: 'head', pole: [0.6, 0.85, -0.2], roll: -0.4 },
    { at: [0.03, -0.06, 0.18], in: 'head', pole: [1, -0.6, -0.1], roll: 0.6 },
  ],
  feet: LEGS,
});

/** The idle loop: lie back, and every so often a drink. */
export const IDLE_LEN = 9;
export const IDLE: Key[] = [
  [0, LIE],
  [5.8, LIE],
  [6.8, DRINK],
  [7.4, SIP],
  [8.0, DRINK],
  [9.0, LIE],
];

// ---------------------------------------------------------------- the call

/** The phone buzzes: the head turns to it. */
const LOOK = pose({
  pelvis: [0, 0.6, -0.14],
  hips: [-0.72, 0, 0],
  spine: [0.08, -0.12, 0.04],
  head: [0.55, -0.55, 0.12],
  hands: [
    { at: [0.13, 0.03, -0.1], in: 'head', pole: [0.6, 0.85, -0.2], roll: -0.4 },
    { at: [0.12, -0.32, 0.25], pole: [1, -0.4, -0.4], roll: 0.2 },
  ],
  feet: LEGS,
});

/** Reaching over for it. */
const REACH = pose({
  pelvis: [0, 0.6, -0.12],
  hips: [-0.52, 0, 0],
  spine: [0.22, -0.3, 0.16],
  head: [0.5, -0.45, 0.1],
  hands: [
    { at: [-PHONE_AT[0], PHONE_AT[1] + 0.04, PHONE_AT[2]], in: 'root', pole: [0.7, -0.4, -0.6], roll: 1 },
    { at: [0.12, -0.3, 0.25], pole: [1, -0.4, -0.4], roll: 0.2 },
  ],
  feet: LEGS,
});

/** Phone at the ear. */
const ANSWER = pose({
  pelvis: [0, 0.6, -0.13],
  hips: [-0.6, 0, 0],
  spine: [0.1, -0.08, 0.05],
  head: [0.28, -0.12, 0.22],
  hands: [
    { at: [0.12, 0.0, 0.02], in: 'head', pole: [1, -0.5, 0.1], roll: -1 },
    { at: [0.12, -0.3, 0.25], pole: [1, -0.4, -0.4], roll: 0.2 },
  ],
  feet: LEGS,
});

/** "Say that again?": a nod, still listening. */
const LISTEN = pose({
  pelvis: [0, 0.6, -0.12],
  hips: [-0.55, 0, 0],
  spine: [0.16, -0.06, 0.05],
  head: [0.4, -0.08, 0.2],
  hands: [
    { at: [0.12, 0.0, 0.02], in: 'head', pole: [1, -0.5, 0.1], roll: -1 },
    { at: [0.12, -0.3, 0.25], pole: [1, -0.4, -0.4], roll: 0.2 },
  ],
  feet: LEGS,
});

/** Sitting up: the phone goes down on the cushion, the coconut arm winds up. */
const WIND = pose({
  pelvis: [0, 0.6, -0.08],
  hips: [-0.25, 0, 0],
  spine: [0.12, 0.1, 0],
  head: [0.1, 0.25, 0],
  hands: [
    { at: [0.32, 0.5, 0.12], in: 'root', pole: [0.5, -1, -0.2] },
    { at: [0.3, -0.12, 0.32], pole: [1, -0.6, -0.2], roll: 0.4 },
  ],
  feet: [
    { at: [0.15, 0.5, 0.78], pole: [0, 1, 0.3], air: 1, flex: 0.3 },
    { at: [0.14, 0.48, 0.5], pole: [0.3, 1, 0.4], air: 1, flex: 0.2 },
  ],
});

/** ...and over the shoulder it goes. */
const TOSS = pose({
  pelvis: [0, 0.6, -0.08],
  hips: [-0.2, 0, 0],
  spine: [0.05, -0.15, 0.05],
  head: [0.02, 0.1, 0],
  hands: [
    { at: [0.32, 0.5, 0.12], in: 'root', pole: [0.5, -1, -0.2] },
    { at: [0.28, 0.6, -0.1], pole: [1, -0.2, -0.5], roll: -0.3 },
  ],
  feet: [
    { at: [0.15, 0.5, 0.78], pole: [0, 1, 0.3], air: 1, flex: 0.3 },
    { at: [0.14, 0.48, 0.5], pole: [0.3, 1, 0.4], air: 1, flex: 0.2 },
  ],
});

/** Upright, looking dead ahead: the shades come off. */
const UPRIGHT = pose({
  pelvis: [0, 0.6, -0.06],
  hips: [-0.12, 0, 0],
  spine: [0.04, 0, 0],
  head: [0.02, 0, 0],
  hands: [
    { at: [0.36, 0.5, 0.18], in: 'root', pole: [0.5, -1, -0.2] },
    { at: [0.36, 0.5, 0.2], in: 'root', pole: [0.5, -1, -0.2] },
  ],
  feet: [
    { at: [0.15, 0.5, 0.8], pole: [0, 1, 0.3], air: 1, flex: 0.3 },
    { at: [0.15, 0.49, 0.62], pole: [0.2, 1, 0.4], air: 1, flex: 0.2 },
  ],
});

/** Legs swing out over the right-hand side. */
const SWING = pose({
  pelvis: [0.12, 0.6, 0.04],
  hips: [-0.18, 0.85, 0],
  spine: [0.06, 0, 0],
  head: [0.0, -0.2, 0],
  hands: [
    { at: [0.1, 0.5, 0.3], in: 'root', abs: true, pole: [0.5, -1, -0.2] },
    { at: [0.42, 0.5, -0.1], in: 'root', abs: true, pole: [0.5, -1, -0.2] },
  ],
  feet: [
    { at: [0.85, 0.45, 0.62], abs: true, pole: [1, 0.6, 0.2], air: 1, flex: 0.2 },
    { at: [0.9, 0.42, 0.3], abs: true, pole: [1, 0.6, 0], air: 1, flex: 0.2 },
  ],
});

/** Sat on the edge, feet in the sand. */
const EDGE = pose({
  pelvis: [0.3, 0.58, 0.16],
  hips: [-0.05, 1.5, 0],
  spine: [0.18, 0, 0],
  head: [-0.05, 0, 0],
  hands: [
    { at: [0.36, 0.48, 0.5], in: 'root', abs: true, pole: [0.5, -1, -0.2] },
    { at: [0.38, 0.48, -0.16], in: 'root', abs: true, pole: [0.5, -1, -0.2] },
  ],
  feet: [
    { at: [0.86, 0, 0.32], abs: true, pole: [1, 0.3, 0], yaw: 0.1 },
    { at: [0.86, 0, 0.02], abs: true, pole: [1, 0.3, 0], yaw: 0.1 },
  ],
});

/** Pushing up off the knees. */
const RISE = pose({
  pelvis: [0.62, 0.72, 0.17],
  hips: [0.5, 1.5, 0],
  spine: [0.35, 0, 0],
  head: [-0.3, 0, 0],
  hands: [
    { at: [0.95, 0.5, 0.36], in: 'root', abs: true, pole: [0.5, -1, -0.2] },
    { at: [0.95, 0.5, -0.02], in: 'root', abs: true, pole: [0.5, -1, -0.2] },
  ],
  feet: [
    { at: [0.9, 0, 0.32], abs: true, pole: [1, 0.3, 0], yaw: 0.1 },
    { at: [0.9, 0, 0.02], abs: true, pole: [1, 0.3, 0], yaw: 0.1 },
  ],
});

/** On its feet beside the lounger, facing out (the live fighter takes over from here). */
export const STAND_AT = [0.95, 0, 0.17] as const;
export const STAND_YAW = Math.PI / 2;
const STAND = pose({
  pelvis: [0.95, 0.88, 0.17],
  hips: [0.04, STAND_YAW, 0],
  spine: [0.02, 0, 0],
  head: [0, 0, 0],
  hands: [
    { at: [0.3, -0.36, 0.12], pole: [0.4, -0.2, -1], roll: 0.3 },
    { at: [0.3, -0.36, 0.12], pole: [0.4, -0.2, -1], roll: 0.3 },
  ],
  feet: [
    { at: [0.97, 0, 0.32], abs: true, pole: [1, 0.2, 0], yaw: 0.12 },
    { at: [0.97, 0, 0.02], abs: true, pole: [1, 0.2, 0], yaw: 0.12 },
  ],
});

/** Times (s after Fight) of the call's beats. */
export const CALL = {
  ring: 0,
  look: 0.45,
  grab: 1.25,
  ear: 1.7,
  putDown: 2.55,
  toss: 2.78,
  shades: 3.0,
  swing: 3.45,
  stand: 4.35,
  live: 4.5,
  emote: 4.75,
  cut: 6.2,
} as const;

export const OUTRO: Key[] = [
  [0, LIE],
  [CALL.look, LOOK],
  [CALL.grab, REACH],
  [CALL.ear, ANSWER],
  [2.1, LISTEN],
  [2.35, ANSWER],
  [2.5, WIND],
  [CALL.toss, TOSS],
  [CALL.shades + 0.1, UPRIGHT],
  [3.3, UPRIGHT],
  [3.75, SWING],
  [4.0, EDGE],
  [4.2, RISE],
  [CALL.stand, STAND],
];
