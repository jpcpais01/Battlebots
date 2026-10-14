import { J } from './body';
import { DM } from './dmath';
import { RARITIES, type Loadout, type Slot } from '../game/items';

/**
 * Locational damage.
 *
 * Every robot is fifteen parts. Hits wear down the part they land on (the head, the chest
 * plate, the lower torso, or a leg); blocked shots wear down the forearm or upper arm that
 * took them and the fist or foot that was thrown into the guard. Worn parts make the robot
 * worse at what they do, and once a limb, or the head, is badly enough damaged a strong hit
 * can tear it off. Losing the head ends the fight, and so does losing both arms or both legs.
 * A robot that loses one leg fights on, hopping on the other (see Fighter.legLost).
 *
 * Overall HP is unchanged: a part's condition is its own pool, on top of it.
 * Everything here is deterministic (the match's seeded RNG decides tear-offs).
 */
export const enum P {
  Head = 0,
  Chest,
  Torso,
  UpL,
  ForeL,
  FistL,
  UpR,
  ForeR,
  FistR,
  ThighL,
  ShinL,
  FootL,
  ThighR,
  ShinR,
  FootR,
}
export const PART_COUNT = 15;

export const PART_NAME = [
  'head',
  'chest',
  'lower torso',
  'left upper arm',
  'left forearm',
  'left fist',
  'right upper arm',
  'right forearm',
  'right fist',
  'left thigh',
  'left shin',
  'left foot',
  'right thigh',
  'right shin',
  'right foot',
];

/** Parts whose upper (L) / forearm / fist index is base + 0/1/2 for side 0 (left) or 1 (right). */
export const armPart = (side: number, seg: 0 | 1 | 2) => P.UpL + side * 3 + seg;
export const legPart = (side: number, seg: 0 | 1 | 2) => P.ThighL + side * 3 + seg;

/** A torn-off part takes everything further down the limb with it. */
export const CARRIES: number[][] = [
  [P.Head],
  [],
  [],
  [P.UpL, P.ForeL, P.FistL],
  [P.ForeL, P.FistL],
  [],
  [P.UpR, P.ForeR, P.FistR],
  [P.ForeR, P.FistR],
  [],
  [P.ThighL, P.ShinL, P.FootL],
  [P.ShinL, P.FootL],
  [],
  [P.ThighR, P.ShinR, P.FootR],
  [P.ShinR, P.FootR],
  [],
];
/**
 * The part each detachable part hangs from: tearing a part off wrenches its socket, so the
 * part it was attached to loses a share of what it had left.
 */
export const SOCKET: number[] = [P.Chest, -1, -1, P.Chest, P.UpL, -1, P.Chest, P.UpR, -1, P.Torso, P.ThighL, -1, P.Torso, P.ThighR, -1];
/** Share of its remaining condition the socket part loses when the part on it is torn off. */
export const SOCKET_WRENCH = 0.3;

/** Can a hit tear this part off? (Fists and feet shatter in place instead; the trunk can't come off.) */
export const DETACHABLE = CARRIES.map((c) => c.length > 0);

/** Physics particles that come loose with the part (the rest of the body keeps its shape). */
export const CUT_JOINTS: number[][] = [
  [J.Head],
  [],
  [],
  [J.ElL, J.HandL],
  [J.HandL],
  [],
  [J.ElR, J.HandR],
  [J.HandR],
  [],
  [J.KneeL, J.FootL],
  [J.FootL],
  [],
  [J.KneeR, J.FootR],
  [J.FootR],
  [],
];

/** Which loadout slot armours each part (its rarity makes the part a little tougher). */
const PART_SLOT: Slot[] = ['head', 'chest', 'legs', 'chest', 'fist', 'fist', 'chest', 'fist', 'fist', 'legs', 'kick', 'kick', 'legs', 'kick', 'kick'];

/**
 * How much damage each part soaks from pristine to wrecked, in the same units as HP.
 * A fight's worth of head shots is a little over the head's pool, so a long, even fight leaves
 * heads cracked and a lopsided one can see a head come off before the HP runs out.
 */
const DURABILITY = [620, 980, 720, 300, 250, 250, 300, 250, 250, 300, 220, 220, 300, 220, 220];

/** Below this condition a strong hit can tear the part off. */
export const LOOSE = 0.4;

/** Why a robot was dismantled ('leg': both of them). */
export type LossReason = 'head' | 'leg' | 'arms';

export class Parts {
  /** 1 = pristine, 0 = wrecked. */
  readonly cond = new Float32Array(PART_COUNT).fill(1);
  /** Torn off (directly or along with a part above it). */
  readonly off = new Uint8Array(PART_COUNT);
  readonly durability: Float32Array;
  /** Parts torn off so far, in order (the part that was hit, not the ones it carried). */
  readonly lost: number[] = [];

  /** `tough`: extra durability per armouring slot (heavy makers' parts take more wear before they give). */
  constructor(loadout?: Loadout, tough?: Partial<Record<Slot, number>>) {
    this.durability = new Float32Array(PART_COUNT);
    for (let i = 0; i < PART_COUNT; i++) {
      const r = loadout ? RARITIES[loadout[PART_SLOT[i]].rarity].mult : 1;
      const t = Math.max(-0.4, tough?.[PART_SLOT[i]] ?? 0);
      this.durability[i] = DURABILITY[i] * (0.85 + 0.15 * r) * (1 + t);
    }
  }

  wear(p: number) {
    return 1 - this.cond[p];
  }

  /** Wear part p by `amount` damage. Returns the new condition. */
  damage(p: number, amount: number) {
    if (this.off[p] || amount <= 0) return this.cond[p];
    this.cond[p] = Math.max(0, this.cond[p] - amount / this.durability[p]);
    return this.cond[p];
  }

  /** Tear part p off (and everything below it). Returns the socket part it wrenched, or -1. */
  detach(p: number) {
    for (const q of CARRIES[p]) {
      this.off[q] = 1;
      this.cond[q] = 0;
    }
    this.lost.push(p);
    const s = SOCKET[p];
    if (s >= 0 && !this.off[s]) this.cond[s] *= 1 - SOCKET_WRENCH;
    return s;
  }

  /** Chance (0..1) that a hit of this strength tears part p off. */
  tearChance(p: number, strength: number) {
    if (!DETACHABLE[p] || this.off[p]) return 0;
    const c = this.cond[p];
    if (c >= LOOSE) return 0;
    const weak = DM.pow((LOOSE - c) / LOOSE, 1.5);
    const force = Math.min(1.3, Math.max(0, (strength - 18) / 85));
    // the neck is the best-braced joint; a hip takes some shifting
    const brace = p === P.Head ? 0.5 : p === P.ThighL || p === P.ThighR ? 0.7 : 1;
    return Math.min(0.95, weak * force * brace);
  }

  armOut(side: number) {
    return !!this.off[armPart(side, 0)] || !!this.off[armPart(side, 1)];
  }

  legOut(side: number) {
    return !!this.off[legPart(side, 0)] || !!this.off[legPart(side, 1)];
  }

  /** The leg torn off when only one has been (0 left, 1 right); -1 with both legs on, or both gone. */
  lostLeg() {
    const a = this.legOut(0), b = this.legOut(1);
    return a === b ? -1 : a ? 0 : 1;
  }

  get armsLost() {
    return (this.armOut(0) ? 1 : 0) + (this.armOut(1) ? 1 : 0);
  }

  /** Why this robot can't fight on, if it can't. */
  lossReason(): LossReason | null {
    if (this.off[P.Head]) return 'head';
    if (this.legOut(0) && this.legOut(1)) return 'leg';
    if (this.armOut(0) && this.armOut(1)) return 'arms';
    return null;
  }

  // ------------------------------------------------------------ penalties
  /** Strike speed with an arm: a battered elbow and shoulder slow every punch it throws. */
  armSpeed(side: number) {
    const w = this.wear(armPart(side, 1)) * 0.6 + this.wear(armPart(side, 0)) * 0.4;
    return 1 - 0.3 * DM.pow(w, 1.2);
  }

  /** Punch damage with a fist: a cracked fist hits soft, a shattered one barely at all. */
  fistPower(side: number) {
    const c = this.cond[armPart(side, 2)];
    return c <= 0 ? 0.55 : 1 - 0.35 * DM.pow(1 - c, 1.3);
  }

  /** Kick damage with a foot. */
  footPower(side: number) {
    const c = this.cond[legPart(side, 2)];
    return c <= 0 ? 0.55 : 1 - 0.35 * DM.pow(1 - c, 1.3);
  }

  /** How worn a leg is overall (thigh and shin carry the weight, the foot plants it). */
  legWear(side: number) {
    return this.wear(legPart(side, 0)) * 0.45 + this.wear(legPart(side, 1)) * 0.4 + this.wear(legPart(side, 2)) * 0.15;
  }

  /** Kick speed with a leg. */
  legSpeed(side: number) {
    return 1 - 0.25 * DM.pow(this.legWear(side), 1.2);
  }

  /** Move speed and footwork: the worse leg decides most of it. Hopping on one leg, it's mostly gone. */
  mobility() {
    const lost = this.lostLeg();
    if (lost >= 0) return 0.6 * (1 - 0.38 * DM.pow(this.legWear(1 - lost), 1.15));
    const a = this.legWear(0), b = this.legWear(1);
    const w = Math.max(a, b) * 0.65 + Math.min(a, b) * 0.35;
    return 1 - 0.38 * DM.pow(w, 1.15);
  }

  /** Reaction time multiplier: a rattled head perceives late. */
  reflexes() {
    return 1 + 0.75 * DM.pow(this.wear(P.Head), 1.2);
  }

  /** Stamina regen: the chest houses the core, and a cracked one leaks power. */
  regen() {
    return 1 - 0.38 * DM.pow(this.wear(P.Chest), 1.2);
  }

  /** Balance: the lower torso holds the robot together, a bent one rocks easier. */
  balance() {
    return 1 - 0.32 * DM.pow(this.wear(P.Torso), 1.2);
  }
}
