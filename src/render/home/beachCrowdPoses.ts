import { pose, type HandDef, type Pose } from './puppet';

/**
 * Poses for the other robots on the beach (src/render/home/beachCrowd.ts), in the puppet's robot
 * frame: x to its right, y up, z ahead, the root on whatever it's on (sand, a chair's base, the
 * sea bed).
 */

export type SlotKind = 'lie' | 'lieHands' | 'prop' | 'sit' | 'hug' | 'chair' | 'stand' | 'hips' | 'chat' | 'kid' | 'float' | 'swim';

const ARMS_DOWN: readonly [HandDef, HandDef] = [
  { at: [0.37, 0.05, -0.12], in: 'root', pole: [0.8, 0.2, 0], roll: 1 },
  { at: [0.37, 0.05, -0.12], in: 'root', pole: [0.8, 0.2, 0], roll: 1 },
];

/** Flat on its back, feet towards +z, arms by its sides, one knee up. */
const LIE = pose({
  pelvis: [0, 0.17, 0.05],
  hips: [-1.47, 0, 0],
  head: [0.28, 0, 0],
  hands: ARMS_DOWN,
  feet: [
    { at: [0.16, 0.08, 0.98], pole: [0, 1, 0.2], air: 1, flex: 0.55 },
    { at: [0.12, 0.02, 0.6], pole: [0.15, 1, 0.3], yaw: 0.05 },
  ],
});

/** On its back, hands behind its head, ankles crossed. */
const LIE_HANDS = pose({
  pelvis: [0, 0.17, 0.05],
  hips: [-1.45, 0, 0],
  head: [0.32, 0, 0],
  hands: [
    { at: [0.13, 0.03, -0.1], in: 'head', pole: [0.6, 0.85, -0.2], roll: -0.4 },
    { at: [0.13, 0.03, -0.1], in: 'head', pole: [0.6, 0.85, -0.2], roll: -0.4 },
  ],
  feet: [
    { at: [0.02, 0.1, 1.0], pole: [0, 1, 0], air: 1, flex: 0.5 },
    { at: [-0.02, 0.17, 0.96], pole: [0, 1, 0], air: 1, flex: 0.5 },
  ],
});

/** Propped up on its elbows, looking out to sea over its feet. */
const PROP = pose({
  pelvis: [0, 0.17, 0.05],
  hips: [-1.12, 0, 0],
  head: [-0.55, 0, 0],
  hands: [
    { at: [0.3, 0.06, -0.12], in: 'root', pole: [0.4, -0.3, -1], roll: 1 },
    { at: [0.3, 0.06, -0.12], in: 'root', pole: [0.4, -0.3, -1], roll: 1 },
  ],
  feet: [
    { at: [0.17, 0.08, 1.0], pole: [0, 1, 0.2], air: 1, flex: 0.5 },
    { at: [0.12, 0.08, 0.96], pole: [0, 1, 0.2], air: 1, flex: 0.4 },
  ],
});

/** Sitting on the sand, knees up, leaning back on its hands. */
const SIT = pose({
  pelvis: [0, 0.16, 0],
  hips: [-0.42, 0, 0],
  head: [0.12, 0, 0],
  hands: [
    { at: [0.3, 0.05, -0.36], in: 'root', pole: [0.3, -0.3, -1], roll: 1 },
    { at: [0.3, 0.05, -0.36], in: 'root', pole: [0.3, -0.3, -1], roll: 1 },
  ],
  feet: [
    { at: [0.17, 0, 0.66], pole: [0.1, 1, 0.4], yaw: 0.2 },
    { at: [0.15, 0, 0.6], pole: [0.1, 1, 0.4], yaw: 0.2 },
  ],
});

/** Sitting with its arms round its knees. */
const HUG = pose({
  pelvis: [0, 0.16, 0],
  hips: [0.05, 0, 0],
  spine: [0.15, 0, 0],
  head: [0.0, 0, 0],
  hands: [
    { at: [0.06, 0.4, 0.5], in: 'root', pole: [1, 0, 0.2], roll: 0 },
    { at: [0.06, 0.36, 0.52], in: 'root', pole: [1, 0, 0.2], roll: 0 },
  ],
  feet: [
    { at: [0.12, 0, 0.42], pole: [0.1, 1, 0.3], yaw: 0.1 },
    { at: [0.1, 0, 0.4], pole: [0.1, 1, 0.3], yaw: 0.1 },
  ],
});

/** Lying back in a low deck chair (the chair's base at the root), feet out on the sand. */
const CHAIR = pose({
  pelvis: [0, 0.36, -0.02],
  hips: [-0.62, 0, 0],
  head: [0.3, 0, 0],
  hands: [
    { at: [0.13, 0.03, -0.1], in: 'head', pole: [0.6, 0.85, -0.2], roll: -0.4 },
    { at: [0.1, -0.32, 0.22], pole: [1, -0.4, -0.4], roll: 0.4 },
  ],
  feet: [
    { at: [0.19, 0, 0.78], pole: [0.1, 1, 0.5], yaw: 0.25 },
    { at: [0.15, 0, 0.7], pole: [0.1, 1, 0.5], yaw: 0.2 },
  ],
});

const STAND_FEET = [
  { at: [0.15, 0, 0.03], pole: [0.15, 0.2, 1], yaw: 0.14 },
  { at: [0.17, 0, -0.05], pole: [0.15, 0.2, 1], yaw: 0.2 },
] as const;

/** Standing easy, arms hanging. */
const STAND = pose({
  pelvis: [0, 0.88, 0],
  hips: [0.02, 0, 0.03],
  head: [0.05, 0, 0],
  hands: [
    { at: [0.3, -0.38, 0.08], pole: [0.4, -0.2, -1], roll: 0.3 },
    { at: [0.29, -0.4, 0.06], pole: [0.4, -0.2, -1], roll: 0.3 },
  ],
  feet: STAND_FEET,
});

/** Hands on hips, looking out to sea. */
const HIPS = pose({
  pelvis: [0, 0.88, 0],
  hips: [0.0, 0, -0.03],
  head: [-0.05, 0, 0],
  hands: [
    { at: [0.24, -0.33, 0.02], pole: [1, 0.1, -0.4], roll: 0.9 },
    { at: [0.24, -0.33, 0.02], pole: [1, 0.1, -0.4], roll: 0.9 },
  ],
  feet: [
    { at: [0.2, 0, 0.02], pole: [0.2, 0.2, 1], yaw: 0.25 },
    { at: [0.2, 0, -0.02], pole: [0.2, 0.2, 1], yaw: 0.25 },
  ],
});

/** Mid-story: one hand out, explaining something. */
const CHAT = pose({
  pelvis: [0, 0.88, 0],
  hips: [0.03, 0.1, 0],
  head: [0.05, -0.1, 0],
  hands: [
    { at: [0.3, -0.38, 0.06], pole: [0.4, -0.2, -1], roll: 0.3 },
    { at: [0.16, -0.08, 0.36], pole: [0.6, -1, -0.2], roll: -0.6 },
  ],
  feet: STAND_FEET,
});

/** Sitting on its heels by its sandcastle, patting the sand. */
const KID = pose({
  pelvis: [0, 0.3, -0.1],
  hips: [0.35, 0, 0],
  spine: [0.15, 0, 0],
  head: [0.35, 0, 0],
  hands: [
    { at: [-0.12, 0.08, 0.42], in: 'root', pole: [0.6, -0.6, -0.4], roll: 1 },
    { at: [-0.08, 0.1, 0.46], in: 'root', pole: [0.6, -0.6, -0.4], roll: 1 },
  ],
  feet: [
    { at: [0.16, 0, 0.12], pole: [0.1, 0.3, 1], yaw: 0.1, heel: 0.9 },
    { at: [0.16, 0, 0.08], pole: [0.1, 0.3, 1], yaw: 0.1, heel: 0.9 },
  ],
});

/** Sitting back in a ring float, legs over the front of it, arms along it. */
const FLOAT = pose({
  pelvis: [0, 0.02, -0.08],
  hips: [-0.75, 0, 0],
  head: [0.35, 0, 0],
  hands: [
    { at: [0.5, 0.2, -0.05], in: 'root', pole: [0.6, -0.4, -0.6], roll: 1 },
    { at: [0.5, 0.2, -0.05], in: 'root', pole: [0.6, -0.4, -0.6], roll: 1 },
  ],
  feet: [
    { at: [0.15, 0.06, 0.82], pole: [0, 1, 0.2], air: 1, flex: 0.4 },
    { at: [0.12, 0.08, 0.78], pole: [0, 1, 0.2], air: 1, flex: 0.3 },
  ],
});

/** Treading water: the root is on the sea bed, the chest at the surface. */
const SWIM = pose({
  pelvis: [0, 0.82, 0],
  hips: [0.12, 0, 0],
  head: [-0.1, 0, 0],
  hands: [
    { at: [0.42, -0.12, 0.2], pole: [0.6, -0.8, -0.2], roll: 1 },
    { at: [0.42, -0.12, 0.2], pole: [0.6, -0.8, -0.2], roll: 1 },
  ],
  feet: [
    { at: [0.16, 0.05, 0.12], pole: [0, 0.4, 1], air: 1, flex: 0.4 },
    { at: [0.14, 0.12, -0.12], pole: [0, 0.4, 1], air: 1, flex: 0.4 },
  ],
});

export const POSES: Record<SlotKind, Pose> = {
  lie: LIE,
  lieHands: LIE_HANDS,
  prop: PROP,
  sit: SIT,
  hug: HUG,
  chair: CHAIR,
  stand: STAND,
  hips: HIPS,
  chat: CHAT,
  kid: KID,
  float: FLOAT,
  swim: SWIM,
};

/** Arms for the volleyball players (laid over the live fighter's, relative to its chest). */
export const READY = pose({
  pelvis: [0, 0.88, 0],
  hands: [
    { at: [0.2, -0.3, 0.3], pole: [0.6, -1, -0.2], roll: -0.4 },
    { at: [0.2, -0.3, 0.3], pole: [0.6, -1, -0.2], roll: -0.4 },
  ],
  feet: STAND_FEET,
});
/** An overhead set: both hands up over the forehead. */
export const SET = pose({
  pelvis: [0, 0.88, 0],
  hands: [
    { at: [0.1, 0.6, 0.22], pole: [0.9, 0.1, -0.2], roll: -1 },
    { at: [0.1, 0.6, 0.22], pole: [0.9, 0.1, -0.2], roll: -1 },
  ],
  feet: STAND_FEET,
});
/** A spike: right arm high and forward, left arm thrown down. */
export const SPIKE = pose({
  pelvis: [0, 0.88, 0],
  hands: [
    { at: [0.3, -0.3, 0.12], pole: [0.6, -0.6, -0.4], roll: 0 },
    { at: [0.1, 0.55, 0.2], pole: [0.9, 0.3, -0.4], roll: -1 },
  ],
  feet: STAND_FEET,
});

/** Standing on a paddleboard (the hands go to the paddle, set each frame). */
export const PADDLE = pose({
  pelvis: [0, 0.84, -0.02],
  hips: [0.22, 0, 0],
  head: [-0.15, 0, 0],
  hands: [
    { at: [0.2, 0.1, 0.35], pole: [0.6, -0.6, -0.4] },
    { at: [0.2, -0.3, 0.35], pole: [0.6, -0.6, -0.4] },
  ],
  feet: [
    { at: [0.17, 0, 0.02], pole: [0.1, 0.2, 1], yaw: 0.1 },
    { at: [0.17, 0, 0.02], pole: [0.1, 0.2, 1], yaw: 0.1 },
  ],
});

/** Windsurfing: feet wide along the board, leaning back against the sail (hands on the boom, set each frame). */
export const SURF = pose({
  pelvis: [0, 0.8, -0.08],
  hips: [-0.28, 0, 0],
  spine: [0.1, 0, 0],
  head: [0.1, 0, 0],
  hands: [
    { at: [0.25, 0.1, 0.4], pole: [0.6, -0.6, -0.4] },
    { at: [0.25, 0.1, 0.4], pole: [0.6, -0.6, -0.4] },
  ],
  feet: [
    { at: [0.36, 0, 0.0], pole: [0.4, 0.2, 1], yaw: 0.6 },
    { at: [0.36, 0, 0.05], pole: [0.4, 0.2, 1], yaw: 0.6 },
  ],
});
