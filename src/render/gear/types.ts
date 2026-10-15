import type { MatKey, PB } from '../partKit';

/**
 * One Rare or Epic design: the armour it puts on every part of the bot. Each hook gets a builder
 * that already holds that part's bare frame (joint drums, bars, the hand), in the part's own frame
 * (see the frames at the top of partKit.ts), and adds the design's armour over it. The bot bakes
 * every part into one rigidly skinned mesh, so a hook only adds primitives, it never draws.
 *
 * Only `head`, `torso`, `pauldron`, `core`/`reactor` and `pelvis` ride the body; everything else
 * is a limb part shared by both sides (keep it symmetric across X unless the hook gets a side).
 */
export interface GearDesign {
  // ---- head (head item)
  /** Head armour. Origin at the head joint (centre of the skull), facing +Z; the neck socket is built. */
  head(b: PB): void;
  /** Material of the ring round the neck socket under the head. */
  socket?: MatKey;

  // ---- chest item: torso shell and both pauldrons
  /**
   * Chest shell over the shared chassis (waist, inner frame, shoulder drums at (±0.25..0.28, 0.1, 0),
   * collar at (0, 0.21..0.235, -0.015)). Shoulder joints sit at (±0.31, 0.1, 0), neck at (0, 0.22, 0).
   * The shell must cover the inner frame (a loft from y -0.14 (0.32 wide, 0.22 deep) to y 0.185
   * (0.43 wide, 0.23 deep), centred at z -0.01) and leave the neck and shoulder joints clear.
   */
  torso(b: PB): void;
  /** Back surface z of the shell: the core's back reactor mounts 0.03 behind it. */
  torsoBack: number;
  /** Where the shell seats the core unit, [y, z]: z is the front surface of the shell there. */
  coreAt: [number, number];
  /**
   * Pauldron on the upper arm: origin at the shoulder joint, +Y down the arm, +Z forward,
   * `o` = +1 right arm / -1 left arm, so the outside of the shoulder is +X·o. Mirror with `o`.
   */
  pauldron(b: PB, o: number): void;

  // ---- core item: front unit and back reactor (on the torso bone)
  /** The core unit on the chest, centred on (0, y, z) facing +Z, housing included; its light is 'core'. */
  core(b: PB, y: number, z: number): void;
  /** The matching unit on the back, everything at z <= rz (rz is just behind the chest's back). */
  reactor(b: PB, rz: number): void;
  /** Core light colour (0xRRGGBB); default: the maker's. */
  coreColor?: number;

  // ---- fist item: forearm armour and fist
  /** Forearm armour: origin at the elbow, +Y to the wrist (0.33), +Z the back of the arm/hand. */
  forearm(b: PB): void;
  /**
   * Knuckle armour over the bare hand: origin at the hand joint, knuckles +Y (striking face at
   * about y 0.1..0.13), back of the hand +Z, thumb on the `thumb` X side (±1). Built at unit size,
   * then the whole fist is scaled by `fistScale`.
   */
  fist(f: PB, thumb: number): void;
  fistScale: number;

  // ---- legs item: hip armour, thigh, calf
  /** Hip armour on the pelvis: origin at the pelvis joint, hips at (±0.15, -0.07, 0). */
  pelvis(b: PB): void;
  /** Thigh armour: origin at the hip, +Y down to the knee (0.46), +Z the front. */
  thigh(b: PB): void;
  /** Calf armour round the back and sides of the shin: origin at the knee, +Y down to the ankle (0.46). The kick's shin guard covers the front. */
  calf(b: PB): void;

  // ---- kick item: shin guard, foot, toe
  /** Shin guard down the front of the shin (same frame as `calf`), roughly z 0.06..0.11. */
  shinGuard(b: PB): void;
  /** Heel/ankle unit over the base foot: origin at the ankle, sole at y -0.08, toe joint at (0, -0.048, 0.072). `w` = footW. */
  foot(b: PB, w: number): void;
  /** Toe unit over the base toe: origin at the ball of the foot, sole at y about -0.042. */
  toe(b: PB, w: number): void;
  /** Foot width scale (Common feet run 0.9..1.16). */
  footW: number;
}

/** A maker's two new lines. */
export interface MakerGear {
  rare: GearDesign;
  epic: GearDesign;
}
