import { Rng } from '../sim/math';
import { computeBuild, sanitizeSize } from './items';
import { randomBot, type BotSpec } from './loadout';
import { SCHEMES, contrastingPaint, paintsContrast, type Paint } from './paint';

/**
 * Cups and championships on the world map. Each one is a short ladder of AI opponents, fought one
 * after another in that event's own arena: win them all and the title is yours, lose one and the
 * run starts over from the first round (titles you have already won are kept).
 */

/** Where an event is fought. 'grand' is the indoor arena that quick fights and online use. */
export type ArenaId = 'grand' | 'harbor' | 'grove' | 'island' | 'rooftop' | 'falls';

export interface EventDef {
  id: string;
  name: string;
  kind: 'cup' | 'championship';
  arena: ArenaId;
  /** The venue's own name, shown on the event card. */
  venue: string;
  /** City, the wild country round it, or out at sea. */
  region: 'City' | 'Wilds' | 'Island';
  blurb: string;
  /** The ladder: each round's opponent name, toughest last. */
  rivals: string[];
  /** How strong the first and the last rival are, against the player's own power. */
  power: [number, number];
  /** Paint scheme names for the rivals (cycled). */
  paints: string[];
  /** Titles needed (from other events) before this one opens. */
  needs?: number;
  /** The event's colour: its pin, its beacon on the map, its card. */
  color: number;
  seed: number;
}

export const EVENTS: EventDef[] = [
  {
    id: 'harbor',
    name: 'Harbor Cup',
    kind: 'cup',
    arena: 'harbor',
    venue: 'Pier 9 Container Yard',
    region: 'City',
    blurb: 'Under the gantry cranes, on a deck of stacked containers, as the sun sinks into the bay.',
    rivals: ['Rusty Anchor', 'Dockhand Duke', 'Crane King'],
    power: [0.9, 1.0],
    paints: ['Navy', 'Army', 'Copperhead'],
    color: 0xffb03a,
    seed: 9101,
  },
  {
    id: 'grove',
    name: 'Lantern Grove Cup',
    kind: 'cup',
    arena: 'grove',
    venue: 'The Lantern Grove',
    region: 'Wilds',
    blurb: 'A forest clearing strung with paper lanterns, where the old shrine gate stands in the cedars.',
    rivals: ['Moss Golem', 'Lantern Fox', 'Old Cedar'],
    power: [0.93, 1.03],
    paints: ['Emerald', 'Sakura', 'Desert'],
    color: 0x8dff6a,
    seed: 9202,
  },
  {
    id: 'island',
    name: 'Coral Island Cup',
    kind: 'cup',
    arena: 'island',
    venue: 'Coral Beach Ring',
    region: 'Island',
    blurb: 'A ferry ride out past the reef: a ring on the sand, bamboo stands and nothing but sea all round.',
    rivals: ['Coral Crab', 'Riptide', 'Tiki Titan'],
    power: [0.95, 1.06],
    paints: ['Bubblegum', 'Tide', 'Lava'],
    color: 0x3ff0ff,
    seed: 9303,
  },
  {
    id: 'rooftop',
    name: 'Neon Heights Championship',
    kind: 'championship',
    arena: 'rooftop',
    venue: 'Skydeck 88',
    region: 'City',
    blurb: 'Eighty-eight floors up on a downtown tower, ringed by holo signs and the lights of the whole city.',
    rivals: ['Holo Ronin', 'Skyline Viper', 'Static Duke', 'Neon Kingpin'],
    power: [0.98, 1.12],
    paints: ['Synthwave', 'Ultraviolet', 'Stealth', 'Chrome'],
    color: 0xff3fa4,
    seed: 9404,
  },
  {
    id: 'falls',
    name: 'Cascade Championship',
    kind: 'championship',
    arena: 'falls',
    venue: 'Cascade Falls Dam',
    region: 'Wilds',
    blurb: 'High in the hills on the crest of the old dam, with the waterfall roaring beside the ring.',
    rivals: ['Riverstone', 'Mist Walker', 'Torrent', 'Cascade Colossus'],
    power: [1.0, 1.14],
    paints: ['Glacier', 'Frost', 'Toxic', 'Emerald'],
    color: 0x9fd8ff,
    seed: 9505,
  },
  {
    id: 'grand',
    name: 'Grand Championship',
    kind: 'championship',
    arena: 'grand',
    venue: 'The Grand Arena',
    region: 'City',
    blurb: 'The big one, in the dome downtown in front of a sold-out house. Win three other titles to get in.',
    rivals: ['Iron Duke', 'Titan Mk-9', 'Omega Knox', 'Chrome Reaper', 'The Champion'],
    power: [1.03, 1.22],
    paints: ['Racer', 'Graphite', 'Inferno', 'Royal', 'Gold Rush'],
    needs: 3,
    color: 0xffd24a,
    seed: 9606,
  },
];

export const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

/** A player's standing in one event: rounds won in the current run, and titles won. */
export interface EventProgress {
  run: number;
  titles: number;
}

export type EventsRecord = Record<string, EventProgress>;

/** Saved event progress from anywhere (this device or the cloud) made safe. */
export function sanitizeEvents(raw: unknown): EventsRecord {
  const out: EventsRecord = {};
  if (!raw || typeof raw !== 'object') return out;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  for (const e of EVENTS) {
    const p = (raw as Record<string, unknown>)[e.id] as Partial<Record<keyof EventProgress, unknown>> | undefined;
    if (!p || typeof p !== 'object') continue;
    const run = Math.min(n(p.run), e.rivals.length - 1);
    const titles = n(p.titles);
    if (run || titles) out[e.id] = { run, titles };
  }
  return out;
}

export const progressOf = (rec: EventsRecord, id: string): EventProgress => rec[id] ?? { run: 0, titles: 0 };

/** How many different titles the player holds. */
export const titlesHeld = (rec: EventsRecord) => EVENTS.filter((e) => progressOf(rec, e.id).titles > 0).length;

/** An event the player can't enter yet: how many more titles it needs (0 when open). */
export function titlesNeeded(rec: EventsRecord, e: EventDef) {
  if (!e.needs) return 0;
  const held = EVENTS.filter((o) => o.id !== e.id && progressOf(rec, o.id).titles > 0).length;
  return Math.max(0, e.needs - held);
}

/** How strong round `round`'s rival is, as a multiple of the player's power. */
export function rivalPower(e: EventDef, round: number) {
  const t = e.rivals.length > 1 ? round / (e.rivals.length - 1) : 1;
  return e.power[0] + (e.power[1] - e.power[0]) * t;
}

/**
 * The rival for one round. Its name and paint never change; its parts are picked fresh to land
 * near the target power, so the ladder keeps pace as the player's bot gets better.
 */
export function rival(e: EventDef, round: number, player: BotSpec): BotSpec {
  const rng = new Rng(e.seed * 31 + round * 977);
  const target = computeBuild(player.loadout, player.size).rating * rivalPower(e, round);
  const last = round === e.rivals.length - 1;
  let best: BotSpec | null = null;
  let bestD = Infinity;
  for (let i = 0; i < 48; i++) {
    const b = randomBot(rng, rng.next());
    // the final boss of a championship is big
    if (last && e.kind === 'championship') b.size = sanitizeSize(1.08 + rng.next() * 0.12);
    const d = Math.abs(computeBuild(b.loadout, b.size).rating - target);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  const out = best!;
  out.name = e.rivals[round];
  const want = SCHEMES.find((s) => s.name === e.paints[round % e.paints.length]);
  out.paint = want && paintsContrast(want.paint, player.paint) ? { ...want.paint } : pickPaint(player.paint, rng);
  return out;
}

function pickPaint(mine: Paint, rng: Rng): Paint {
  return contrastingPaint(mine, rng);
}
