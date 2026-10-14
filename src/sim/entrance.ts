import { RING_CORNER } from './body';
import { DM } from './dmath';

/**
 * Corner entrances: each fighter rides a lift up through a hatch in its corner of the
 * ring, one after the other, during the intro. The timeline is shared by the sim (the
 * entrance choreography plays to it) and the renderer (the hatch, the lift, the pyro and
 * the walk-on music), so every beat lands on the same moment.
 *
 * The lift itself is only drawn: the fighter's body stands on the canvas the whole time,
 * and the renderer lowers the robot into the shaft, so the fight is the same either way.
 */

/** Seconds each fighter is presented for in the intro (fighter 0, then fighter 1). */
export const PRESENT = 4.4;

/** Times into a fighter's presentation (s). */
export const ENTRY = {
  /** The entrance choreography and the walk-on music start. */
  start: 0.02,
  /** The hatch doors slide open... */
  open: 0.15,
  opened: 0.75,
  /** ...the lift starts up... */
  rise: 0.7,
  /** ...and locks flush with the canvas: the reveal. */
  arrive: 2.05,
} as const;

/** How far below the canvas the lift waits (m). */
export const LIFT_DEPTH = 2.7;
/** Radius of the hatch in the canvas (m). */
export const HATCH_R = 0.74;
/** How far from the ring centre the hatches sit, along their corner (m). */
export const HATCH_AT = RING_CORNER - 1.3;

/** The corner (index into the octagon's 8, at angle (k + 1/2) * 45 degrees) each fighter comes out of. */
export const CORNER_OF = [0, 4] as const;

/** Centre of fighter i's hatch on the canvas. */
export function hatchXZ(i: number): [number, number] {
  const a = ((CORNER_OF[i] + 0.5) * Math.PI) / 4;
  return [DM.cos(a) * HATCH_AT, DM.sin(a) * HATCH_AT];
}

/** Seconds into fighter i's presentation (negative: not yet; Infinity: the intro is over). */
export function entryTime(phase: string, phaseTime: number, i: number) {
  return phase === 'intro' ? phaseTime - i * PRESENT : Infinity;
}

/** The lift's travel at entry time t: 0 waiting at the bottom, 1 locked at the top. */
export function liftUp(t: number) {
  if (t <= ENTRY.rise) return 0;
  if (t >= ENTRY.arrive) return 1;
  const u = (t - ENTRY.rise) / (ENTRY.arrive - ENTRY.rise);
  // a heavy machine: eases off the stops, quickest through the middle, slows into the lock
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/** How far below the canvas the lift deck is at entry time t (0 = flush), with the clunk as it locks. */
export function liftDrop(t: number) {
  const s = t - ENTRY.arrive;
  const clunk = s > 0 && s < 0.6 ? -0.028 * DM.exp(-s * 9) * DM.sin(s * 34) : 0;
  return -(1 - liftUp(t)) * LIFT_DEPTH + clunk;
}
