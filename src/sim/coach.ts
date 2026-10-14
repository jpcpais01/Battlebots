/**
 * Coach calls: the player shouts an instruction from the corner and their bot leans that
 * way for a while. A call doesn't script anything. It nudges the numbers the fight brain
 * already decides with (aggression, caution, how fast the urge to go builds, how long
 * combinations run, which plans and after-combo choices look good), so the bot still
 * fights like itself, just hungrier, warier or head-hunting.
 *
 * Calls are inputs to a deterministic sim, so they are applied at an exact step: offline
 * at the next one, online a little ahead so both phones apply it on the same step (see
 * Match.queueCoach), and replays repeat them from Match.coachLog.
 */

export type CoachKind = 'go' | 'allIn' | 'defend' | 'head';
export const COACH_KINDS: CoachKind[] = ['go', 'allIn', 'defend', 'head'];

/** Seconds a call lasts. */
export const COACH_TIME = 10;
/** Seconds from one call until the next can be made (any button). */
export const COACH_COOLDOWN = 15;

/** A call as it happened: applied at the start of step `frame`, for fighter `side`. */
export interface CoachCall {
  frame: number;
  side: number;
  kind: CoachKind;
}

/** How a call shifts the brain. Neutral is all zeros and ones. */
export interface CoachFx {
  /** Added to effective aggression and caution (0..1 scales). */
  agg: number;
  cau: number;
  /** Multiplies how fast tempo (the urge to go) builds. */
  tempo: number;
  /** Added to the bar a fresh attack has to clear (lower = throws sooner). */
  wait: number;
  /** Added to combination appetite when picking how long a combo runs. */
  combo: number;
  /** Multiplies the breather after a combination. */
  calm: number;
  /** Plan utilities: pressure, outbox, counter, circle, retreat, swarm. */
  plan: [number, number, number, number, number, number];
  /** After a combination: stay, back, pivot, cover. */
  after: [number, number, number, number];
  /** Meeting an opponent who steps in, and committing to break a stand-off. */
  meet: number;
  commit: number;
  /** Shot choice: bonus for the head, penalty for everything else. */
  head: number;
  /** Shell up whenever they're in range. */
  guard: boolean;
  /** Defensive responses: block, footwork (back/side step), roll with it and trade. */
  block: number;
  feet: number;
  trade: number;
  /** Added to the urge to clinch and shoot for takedowns (and to stay busy in the clinch). */
  grab: number;
}

export const NO_COACH: CoachFx = {
  agg: 0,
  cau: 0,
  tempo: 1,
  wait: 0,
  combo: 0,
  calm: 1,
  plan: [0, 0, 0, 0, 0, 0],
  after: [0, 0, 0, 0],
  meet: 0,
  commit: 0,
  head: 0,
  guard: false,
  block: 1,
  feet: 1,
  trade: 1,
  grab: 0,
};

export const COACH_FX: Record<CoachKind, CoachFx> = {
  // Go in! More often, stays in the pocket after a combination
  go: {
    ...NO_COACH,
    agg: 0.25,
    cau: -0.1,
    tempo: 1.8,
    wait: -6,
    combo: 0.2,
    calm: 0.6,
    plan: [0.9, -0.3, -0.3, 0, -1, 0],
    after: [0.6, -0.3, 0, -0.2],
    meet: 0.5,
    commit: 0.8,
    trade: 1.2,
    grab: 0.3,
  },
  // All in!!! Non-stop: right back in after every combination, longer combinations, trades
  allIn: {
    ...NO_COACH,
    agg: 0.55,
    cau: -0.35,
    tempo: 3.2,
    wait: -14,
    combo: 0.7,
    calm: 0.25,
    plan: [1.6, -1, -1, -0.5, -3, 1.2],
    after: [1.6, -0.8, -0.3, -0.6],
    meet: 1.2,
    commit: 2,
    block: 0.8,
    feet: 0.5,
    trade: 1.6,
    grab: 0.6,
  },
  // Defend: hands up, make them come, block and move, only take what's given
  defend: {
    ...NO_COACH,
    agg: -0.3,
    cau: 0.45,
    tempo: 0.45,
    wait: 8,
    combo: -0.3,
    calm: 1.5,
    plan: [-1, 1, 0.6, 0.6, 0.6, -0.5],
    after: [-0.6, 0.6, 0.2, 0.6],
    meet: -0.3,
    commit: -1,
    guard: true,
    block: 1.6,
    feet: 1.4,
    trade: 0.5,
    grab: -0.6,
  },
  // For the head! Busier, and headhunting
  head: {
    ...NO_COACH,
    agg: 0.2,
    tempo: 1.5,
    wait: -4,
    combo: 0.1,
    calm: 0.8,
    plan: [0.5, 0, 0, 0, -0.5, 0],
    after: [0.3, 0, 0, 0],
    commit: 0.5,
    head: 14,
    grab: -0.4,
  },
};

export const COACH_LABEL: Record<CoachKind, string> = {
  go: 'Go in!',
  allIn: 'All in!!!',
  defend: 'Defend.',
  head: 'For the head!',
};
