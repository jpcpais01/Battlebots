export type MoveId =
  | 'jab'
  | 'cross'
  | 'leadHook'
  | 'rearHook'
  | 'leadUpper'
  | 'rearUpper'
  | 'haymaker'
  | 'flurry'
  | 'shockUpper'
  | 'rocketPunch'
  | 'hammer'
  | 'pushKick'
  | 'roundhouse'
  | 'sweep'
  | 'spinKick'
  | 'flyingKnee'
  | 'lowKick'
  | 'shove'
  | 'clinchKnee'
  | 'tieUp'
  | 'shoot';

export type Zone = 'head' | 'body' | 'legs';
export type Path =
  | 'straight'
  | 'hook'
  | 'upper'
  | 'overhand'
  | 'hammer'
  | 'frontKick'
  | 'roundKick'
  | 'sweepKick'
  | 'backKick'
  | 'knee'
  | 'push'
  | 'tie'
  | 'shoot';

export interface MoveDef {
  id: MoveId;
  name: string;
  /** grab: reaches for the opponent's body (a clinch, a takedown); contact starts a Grapple. */
  kind: 'punch' | 'kick' | 'grab';
  limb: 'lead' | 'rear';
  path: Path;
  striker: 'hand' | 'foot' | 'knee';
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  poise: number;
  knockback: number;
  stamina: number;
  hitstun: number;
  /** Root-to-root distance band where the strike connects cleanly (AI's prior; physics decides). */
  range: [number, number];
  zones: Zone[];
  /** Torso rotation through the strike (radians, positive = drive rear shoulder forward). */
  twist: number;
  lean: number;
  crouch: number;
  /** Forward travel during windup + active. */
  lunge: number;
  power: boolean;
  ability?: 'fist' | 'kick';
  cooldown?: number;
  stun?: number;
  trip?: number;
  guardBreak?: boolean;
  extend?: number;
  multi?: number;
  spin?: boolean;
  jump?: number;
  vfx?: 'shock' | 'rocket' | 'jet' | 'fire' | 'spin';
  /** Only thrown from inside a clinch. */
  clinch?: boolean;
}

/**
 * Strike tempo. The table below is authored at a snappy arcade pace; these stretch
 * every move towards human fight timing (a visible load, a committed swing and an
 * unhurried return to guard). The AI reads the scaled values, so it stays in sync.
 */
const TEMPO = { windup: 1.42, active: 1.3, recovery: 1.48 };
const M = (d: MoveDef): MoveDef => ({
  ...d,
  windup: d.windup * TEMPO.windup,
  active: d.active * TEMPO.active,
  recovery: d.recovery * TEMPO.recovery,
});

export const MOVES: Record<MoveId, MoveDef> = {
  jab: M({
    id: 'jab', name: 'Jab', kind: 'punch', limb: 'lead', path: 'straight', striker: 'hand',
    windup: 0.12, active: 0.12, recovery: 0.18, damage: 26, poise: 9, knockback: 0.55, stamina: 4, hitstun: 0.16,
    range: [0.7, 1.24], zones: ['head', 'body'], twist: 0.25, lean: 0.12, crouch: 0, lunge: 0.08, power: false,
  }),
  cross: M({
    id: 'cross', name: 'Cross', kind: 'punch', limb: 'rear', path: 'straight', striker: 'hand',
    windup: 0.17, active: 0.13, recovery: 0.24, damage: 44, poise: 17, knockback: 1.1, stamina: 7, hitstun: 0.24,
    range: [0.72, 1.3], zones: ['head', 'body'], twist: 0.9, lean: 0.2, crouch: 0.02, lunge: 0.1, power: true,
  }),
  leadHook: M({
    id: 'leadHook', name: 'Hook', kind: 'punch', limb: 'lead', path: 'hook', striker: 'hand',
    windup: 0.17, active: 0.14, recovery: 0.25, damage: 40, poise: 18, knockback: 0.9, stamina: 7, hitstun: 0.24,
    range: [0.5, 1.05], zones: ['head', 'body'], twist: -0.85, lean: 0.08, crouch: 0.04, lunge: 0.05, power: true,
  }),
  rearHook: M({
    id: 'rearHook', name: 'Rear Hook', kind: 'punch', limb: 'rear', path: 'hook', striker: 'hand',
    windup: 0.2, active: 0.15, recovery: 0.28, damage: 48, poise: 22, knockback: 1.1, stamina: 8, hitstun: 0.27,
    range: [0.5, 1.05], zones: ['head', 'body'], twist: 1.05, lean: 0.08, crouch: 0.04, lunge: 0.06, power: true,
  }),
  leadUpper: M({
    id: 'leadUpper', name: 'Uppercut', kind: 'punch', limb: 'lead', path: 'upper', striker: 'hand',
    windup: 0.16, active: 0.13, recovery: 0.25, damage: 36, poise: 16, knockback: 0.6, stamina: 6, hitstun: 0.22,
    range: [0.45, 0.95], zones: ['head', 'body'], twist: -0.5, lean: 0.05, crouch: 0.1, lunge: 0.04, power: false,
  }),
  rearUpper: M({
    id: 'rearUpper', name: 'Rear Uppercut', kind: 'punch', limb: 'rear', path: 'upper', striker: 'hand',
    windup: 0.19, active: 0.14, recovery: 0.28, damage: 50, poise: 24, knockback: 0.8, stamina: 8, hitstun: 0.3,
    range: [0.45, 1.0], zones: ['head', 'body'], twist: 0.7, lean: 0.06, crouch: 0.12, lunge: 0.05, power: true,
  }),

  // ---- fist abilities ----
  haymaker: M({
    id: 'haymaker', name: 'Haymaker', kind: 'punch', limb: 'rear', path: 'overhand', striker: 'hand',
    windup: 0.42, active: 0.17, recovery: 0.45, damage: 120, poise: 70, knockback: 2.2, stamina: 18, hitstun: 0.5,
    range: [0.7, 1.4], zones: ['head'], twist: 1.25, lean: 0.32, crouch: 0.06, lunge: 0.35, power: true,
    ability: 'fist', cooldown: 8, vfx: 'fire',
  }),
  flurry: M({
    id: 'flurry', name: 'Piston Rush', kind: 'punch', limb: 'lead', path: 'straight', striker: 'hand',
    windup: 0.07, active: 0.08, recovery: 0.07, damage: 19, poise: 7, knockback: 0.35, stamina: 16, hitstun: 0.2,
    range: [0.6, 1.22], zones: ['head', 'body'], twist: 0.55, lean: 0.16, crouch: 0.02, lunge: 0.06, power: false,
    ability: 'fist', cooldown: 9, multi: 6, vfx: 'rocket',
  }),
  shockUpper: M({
    id: 'shockUpper', name: 'Shock Uppercut', kind: 'punch', limb: 'rear', path: 'upper', striker: 'hand',
    windup: 0.3, active: 0.15, recovery: 0.38, damage: 75, poise: 40, knockback: 1.0, stamina: 15, hitstun: 0.35,
    range: [0.45, 1.05], zones: ['head'], twist: 0.8, lean: 0.08, crouch: 0.18, lunge: 0.12, power: true,
    ability: 'fist', cooldown: 9, stun: 0.9, vfx: 'shock',
  }),
  rocketPunch: M({
    id: 'rocketPunch', name: 'Rocket Punch', kind: 'punch', limb: 'rear', path: 'straight', striker: 'hand',
    windup: 0.34, active: 0.16, recovery: 0.42, damage: 85, poise: 42, knockback: 2.4, stamina: 16, hitstun: 0.4,
    range: [0.9, 2.1], zones: ['head', 'body'], twist: 1.0, lean: 0.22, crouch: 0.02, lunge: 0.15, power: true,
    ability: 'fist', cooldown: 8, extend: 0.85, vfx: 'rocket',
  }),
  hammer: M({
    id: 'hammer', name: 'Guard Breaker', kind: 'punch', limb: 'rear', path: 'hammer', striker: 'hand',
    windup: 0.38, active: 0.17, recovery: 0.45, damage: 95, poise: 60, knockback: 1.2, stamina: 18, hitstun: 0.45,
    range: [0.6, 1.2], zones: ['head'], twist: 0.7, lean: 0.3, crouch: 0.12, lunge: 0.2, power: true,
    ability: 'fist', cooldown: 9, guardBreak: true, vfx: 'fire',
  }),

  // ---- kick abilities ----
  pushKick: M({
    id: 'pushKick', name: 'Push Kick', kind: 'kick', limb: 'lead', path: 'frontKick', striker: 'foot',
    windup: 0.22, active: 0.15, recovery: 0.3, damage: 42, poise: 26, knockback: 4.2, stamina: 12, hitstun: 0.32,
    range: [0.75, 1.48], zones: ['body'], twist: 0.15, lean: -0.28, crouch: 0, lunge: 0.12, power: true,
    ability: 'kick', cooldown: 5,
  }),
  roundhouse: M({
    id: 'roundhouse', name: 'Roundhouse', kind: 'kick', limb: 'rear', path: 'roundKick', striker: 'foot',
    windup: 0.3, active: 0.17, recovery: 0.38, damage: 92, poise: 46, knockback: 1.7, stamina: 16, hitstun: 0.38,
    range: [0.7, 1.32], zones: ['head', 'body'], twist: 1.3, lean: -0.15, crouch: -0.06, lunge: 0.1, power: true,
    ability: 'kick', cooldown: 7,
  }),
  sweep: M({
    id: 'sweep', name: 'Low Sweep', kind: 'kick', limb: 'rear', path: 'sweepKick', striker: 'foot',
    windup: 0.27, active: 0.17, recovery: 0.36, damage: 36, poise: 30, knockback: 0.8, stamina: 14, hitstun: 0.3,
    range: [0.65, 1.35], zones: ['legs'], twist: 1.2, lean: 0.15, crouch: 0.32, lunge: 0.1, power: true,
    ability: 'kick', cooldown: 7, trip: 0.3,
  }),
  spinKick: M({
    id: 'spinKick', name: 'Spinning Heel', kind: 'kick', limb: 'rear', path: 'backKick', striker: 'foot',
    windup: 0.38, active: 0.17, recovery: 0.42, damage: 115, poise: 60, knockback: 3.0, stamina: 20, hitstun: 0.45,
    range: [0.8, 1.45], zones: ['body', 'head'], twist: 0, lean: -0.2, crouch: 0, lunge: 0, power: true,
    ability: 'kick', cooldown: 9, spin: true, vfx: 'spin',
  }),
  flyingKnee: M({
    id: 'flyingKnee', name: 'Jet Knee', kind: 'kick', limb: 'rear', path: 'knee', striker: 'knee',
    windup: 0.3, active: 0.2, recovery: 0.4, damage: 100, poise: 55, knockback: 2.0, stamina: 20, hitstun: 0.42,
    range: [1.1, 2.5], zones: ['head', 'body'], twist: 0.4, lean: 0.1, crouch: 0.1, lunge: 1.25, power: true,
    ability: 'kick', cooldown: 9, jump: 0.38, vfx: 'jet',
  }),

  // ---- basic kick (everyone has it) ----
  // a short rear-leg roundhouse into the thigh and knee: it can't be blocked with the
  // hands, so it's on a cooldown, and it chops away at the legs over a fight
  lowKick: M({
    id: 'lowKick', name: 'Low Kick', kind: 'kick', limb: 'rear', path: 'roundKick', striker: 'foot',
    windup: 0.21, active: 0.14, recovery: 0.3, damage: 30, poise: 14, knockback: 0.5, stamina: 9, hitstun: 0.22,
    range: [0.65, 1.25], zones: ['legs'], twist: 1.0, lean: -0.08, crouch: 0.04, lunge: 0.06, power: false,
    cooldown: 1.8,
  }),

  // ---- MMA: everyone can push, tie up and shoot ----
  // both hands to the chest, shoulders square: little damage, but it moves them, and a
  // body already off balance goes over
  shove: M({
    id: 'shove', name: 'Shove', kind: 'punch', limb: 'rear', path: 'push', striker: 'hand',
    windup: 0.14, active: 0.12, recovery: 0.24, damage: 10, poise: 38, knockback: 3.3, stamina: 8, hitstun: 0.3,
    range: [0.45, 1.08], zones: ['body'], twist: 0.36, lean: 0.24, crouch: 0.07, lunge: 0.16, power: false,
    cooldown: 2.6,
  }),
  // a short knee driven up from the clinch, pulling them down onto it
  clinchKnee: M({
    id: 'clinchKnee', name: 'Clinch Knee', kind: 'kick', limb: 'rear', path: 'knee', striker: 'knee',
    windup: 0.2, active: 0.14, recovery: 0.26, damage: 34, poise: 22, knockback: 0.45, stamina: 9, hitstun: 0.26,
    range: [0.25, 0.95], zones: ['body', 'head'], twist: 0.2, lean: 0.04, crouch: 0.05, lunge: 0, power: true,
    clinch: true,
  }),
  // both hands reach for the neck and shoulders: contact ties them up in a clinch
  tieUp: M({
    id: 'tieUp', name: 'Clinch', kind: 'grab', limb: 'lead', path: 'tie', striker: 'hand',
    windup: 0.15, active: 0.15, recovery: 0.28, damage: 0, poise: 0, knockback: 0, stamina: 6, hitstun: 0,
    range: [0.3, 1.02], zones: ['head'], twist: 0, lean: 0.22, crouch: 0.05, lunge: 0.2, power: false,
    cooldown: 4,
  }),
  // drop the level, then drive through the hips: a double-leg takedown, or a pin on the ropes
  shoot: M({
    id: 'shoot', name: 'Takedown', kind: 'grab', limb: 'lead', path: 'shoot', striker: 'hand',
    windup: 0.2, active: 0.3, recovery: 0.5, damage: 0, poise: 0, knockback: 0, stamina: 15, hitstun: 0,
    range: [0.75, 2.05], zones: ['legs'], twist: 0, lean: 0, crouch: 0.36, lunge: 1.2, power: true,
    cooldown: 11,
  }),
};

export const BASIC_PUNCHES: MoveId[] = ['jab', 'cross', 'leadHook', 'rearHook', 'leadUpper', 'rearUpper'];
