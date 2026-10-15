import { Rng } from '../sim/math';
import { COMPANY_BY_ID, COMPANIES, MAX_RARITY, SLOTS, sanitizeSize, type CompanyId, type Loadout, type Rarity, type Slot } from './items';
import { equipped, itemAt } from './catalogue';
import type { BotSpec } from './loadout';
import { SCHEMES, contrastingPaint, paintsContrast, type Paint } from './paint';

/**
 * Cups and championships on the world map. Each one is a short ladder of AI opponents, fought one
 * after another in that event's own arena: win them all and the title is yours, lose one and the
 * run starts over from the first round (titles you have already won are kept).
 */

/** Where an event is fought. 'grand' is the indoor arena that quick fights and online use. */
export type ArenaId = 'grand' | 'harbor' | 'grove' | 'island' | 'rooftop' | 'falls';
export const ARENAS: readonly ArenaId[] = ['grand', 'harbor', 'grove', 'island', 'rooftop', 'falls'];

/** A named opponent on an event's ladder: their own bot, their maker and their personality. */
export interface RivalDef {
  name: string;
  /** The maker they're loyal to: most of their parts (all of them in a final) come from it. */
  maker: CompanyId;
  /** Their frame size. */
  size: number;
  /** A few words on how they fight. */
  style: string;
  bio: string;
  /** What they say before the fight, after beating you, and after you beat them. */
  taunt: string;
  win: string;
  lose: string;
}

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
  /** The ladder: each round's rival, toughest last. */
  rivals: RivalDef[];
  /** Where the event sits in a career, 0 (the first cup) to 5 (the Grand Championship). */
  tier: number;
  /**
   * How well geared the first and the last rival are: the average rarity of their six parts
   * (0 all Common, 1 all Rare, 2 all Epic). Each title defence adds a third of a tier.
   */
  gear: [number, number];
  /** Prize money for the first round, in credits (later rounds and the title pay more). */
  purse: number;
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
    rivals: [
      { name: 'Rusty Anchor', maker: 'ironhorse', size: 1.06, style: 'Dock brawler', bio: 'A tugboat winch that grew legs. Slow, stubborn and leaking diesel on every step.', taunt: "I've hauled heavier than you before breakfast.", win: 'Back to the scrapyard with you.', lose: 'Bah. Rust never sleeps, kid.' },
      { name: 'Dockhand Duke', maker: 'longwei', size: 1.0, style: 'Night-shift grinder', bio: 'Works the night shift, fights the day shift, and has never once clocked out early.', taunt: "Clock's running. Let's get you unloaded.", win: 'Shift over.', lose: 'Overtime? I never signed up for overtime.' },
      { name: 'Crane King', maker: 'martelli', size: 1.15, style: 'King of the yard', bio: 'Rules Pier 9 from forty metres up and swings like the wrecking ball he used to carry.', taunt: 'Everything on this pier answers to me.', win: 'Long live the King.', lose: 'The crane... falls.' },
    ],
    tier: 0,
    gear: [0, 0.34],
    purse: 90,
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
    rivals: [
      { name: 'Moss Golem', maker: 'martelli', size: 1.12, style: 'Sleeping giant', bio: 'Stood so long among the cedars that the moss grew over it. It wakes up angry.', taunt: 'Hrrmm. You woke me.', win: 'Now let me sleep.', lose: 'A hundred more years... of sleep.' },
      { name: 'Lantern Fox', maker: 'strix', size: 0.88, style: 'Trickster', bio: 'Quick as a flicker of lantern light, and gone before you can swing at it.', taunt: 'Catch me if you can even see me!', win: 'Too slow, too slow!', lose: 'My flame... went out.' },
      { name: 'Old Cedar', maker: 'kensei', size: 1.08, style: 'Keeper of the grove', bio: 'Fights like the old masters: patient, still, then sudden as a falling branch.', taunt: 'A thousand challengers have bowed at this gate. Bow.', win: 'Come back when your roots run deeper.', lose: 'The sapling... outgrows the tree.' },
    ],
    tier: 1,
    gear: [0.17, 0.67],
    purse: 130,
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
    rivals: [
      { name: 'Coral Crab', maker: 'longwei', size: 0.92, style: 'Shell fortress', bio: 'Sideways shuffle, iron shell, and a pinch like a hydraulic vice.', taunt: 'Snip snip.', win: 'Back in your shell.', lose: 'Ow. My claw.' },
      { name: 'Riptide', maker: 'strix', size: 0.96, style: 'Undertow', bio: 'Pulls you in, drags you under. Nobody has ever swum out of its reach.', taunt: 'Feel the current pulling?', win: 'Swept away.', lose: 'The tide... turned.' },
      { name: 'Tiki Titan', maker: 'ironhorse', size: 1.18, style: 'Island idol', bio: 'Carved from a beach-bar sign and a ship engine, and worshipped by the whole island.', taunt: 'The island demands a challenger!', win: 'The idol is pleased.', lose: 'The gods... are angry.' },
    ],
    tier: 2,
    gear: [0.34, 0.84],
    purse: 170,
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
    rivals: [
      { name: 'Holo Ronin', maker: 'kensei', size: 1.0, style: 'Masterless blade', bio: 'Drifts through the neon looking for a worthy fight. Half of it is hologram; the half that hits you is not.', taunt: 'Which one of me is real?', win: 'Steel is real.', lose: 'Flicker... out.' },
      { name: 'Skyline Viper', maker: 'strix', size: 0.9, style: 'Ledge runner', bio: 'Lives on the ledges of the tallest towers and strikes from angles that should not exist.', taunt: "Long way down, isn't it?", win: 'Mind the drop.', lose: 'Lost my footing...' },
      { name: 'Static Duke', maker: 'lumen', size: 1.02, style: 'Live wire', bio: 'Charged to the eyeballs and smelling of ozone. Every touch bites.', taunt: 'Feel that tingle?', win: "Shocking, isn't it?", lose: 'Short... circuit.' },
      { name: 'Neon Kingpin', maker: 'martelli', size: 1.15, style: 'Boss of the Heights', bio: 'Owns half the signs on the skyline and the deck you are standing on.', taunt: "You're standing on my roof.", win: "Rent's due.", lose: 'Nobody takes the Heights... from me.' },
    ],
    tier: 3,
    gear: [0.67, 1.25],
    purse: 240,
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
    rivals: [
      { name: 'Riverstone', maker: 'longwei', size: 1.1, style: 'Unbreakable', bio: 'Worn smooth by a hundred years of water. Nothing gets through.', taunt: 'Water breaks on me. So will you.', win: 'Unmoved.', lose: 'Cracked... at last.' },
      { name: 'Mist Walker', maker: 'lumen', size: 0.95, style: 'Ghost in the spray', bio: 'Steps out of the spray, lands a shot and is gone again before you can turn.', taunt: "You can't hit what you can't see.", win: 'Lost in the mist.', lose: 'The mist... clears.' },
      { name: 'Torrent', maker: 'ironhorse', size: 1.08, style: 'Pressure engine', bio: 'A dam turbine that walked off the job. All pressure, no brakes.', taunt: 'Open the floodgates!', win: 'Washed out.', lose: "Pressure's... dropping." },
      { name: 'Cascade Colossus', maker: 'martelli', size: 1.2, style: 'Guardian of the dam', bio: 'Built into the dam wall to hold back the river. It has waited years for a challenger.', taunt: 'I have held back a river. You are a trickle.', win: 'The dam holds.', lose: 'The dam... breaks.' },
    ],
    tier: 4,
    gear: [0.84, 1.5],
    purse: 300,
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
    rivals: [
      { name: 'Iron Duke', maker: 'longwei', size: 1.05, style: 'Gatekeeper', bio: "The dome's gatekeeper. If you can't get past the Duke, you don't belong here.", taunt: 'Prove you belong in this dome.', win: 'Not ready. Come back.', lose: "Go on, then. You've earned it." },
      { name: 'Titan Mk-9', maker: 'ironhorse', size: 1.15, style: 'Ninth of its line', bio: 'The first eight are in museums. The ninth has no plans to retire.', taunt: 'Mark Nine. No mistakes this time.', win: 'Unit performing to spec.', lose: 'Recommend... a Mark Ten.' },
      { name: 'Omega Knox', maker: 'strix', size: 1.0, style: 'The silent streak', bio: 'Unbeaten in its last forty fights, and quiet about it.', taunt: '...', win: 'Forty-one.', lose: "So that's what losing feels like." },
      { name: 'Chrome Reaper', maker: 'kensei', size: 1.04, style: 'Mirror finish', bio: 'Polished to a mirror. Ends fights early and leaves before the applause.', taunt: 'Look into the chrome. See your end.', win: 'Reaped.', lose: 'My reflection... cracked.' },
      { name: 'The Champion', maker: 'lumen', size: 1.12, style: 'Undefeated', bio: "Has never lost in the dome. The crowd chants its name before it's out of the lift.", taunt: 'Welcome to my house.', win: 'Still the Champion.', lose: 'The new Champion... Look after the belt.' },
    ],
    tier: 5,
    gear: [1.17, 2],
    purse: 420,
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

/** Title defences that toughen an event's rivals (and raise its prizes). */
export const MAX_DEFENCE = 3;
export const defenceOf = (rec: EventsRecord, e: EventDef) => Math.min(MAX_DEFENCE, progressOf(rec, e.id).titles);

/** How well geared a round's rival is: the average rarity of its parts, 0..MAX_RARITY. */
export function rivalGear(e: EventDef, round: number, defence = 0) {
  const t = e.rivals.length > 1 ? round / (e.rivals.length - 1) : 1;
  return Math.max(0, Math.min(MAX_RARITY, e.gear[0] + (e.gear[1] - e.gear[0]) * t + defence / 3));
}

/** Each slot's rarity for a rival with this much gear: whole tiers, the spare thirds spread at random. */
function rarities(level: number, rng: Rng): Record<Slot, Rarity> {
  const points = Math.round(level * SLOTS.length);
  const base = Math.floor(points / SLOTS.length);
  const order = SLOTS.map((s) => [s, rng.next()] as const).sort((a, b) => a[1] - b[1]);
  const out = {} as Record<Slot, Rarity>;
  order.forEach(([slot], i) => (out[slot] = Math.min(MAX_RARITY, base + (i < points - base * SLOTS.length ? 1 : 0)) as Rarity));
  return out;
}

/**
 * The rival for one round. Its name, maker, frame and paint never change, and neither does its
 * bot: the same parts every time you meet it, in better tiers in the later rounds and each time
 * you come back to defend the title.
 */
export function rival(e: EventDef, round: number, player: BotSpec, defence = 0): BotSpec {
  const def = e.rivals[round];
  const rng = new Rng(e.seed * 31 + round * 977);
  const co = COMPANY_BY_ID.get(def.maker)!;
  const last = round === e.rivals.length - 1;
  // loyal: a diesel bot is all diesel, a final boss wears the full set, the rest four of six
  const own = co.needsFull || last ? SLOTS.length : 4;
  const mine = new Set(SLOTS.map((s) => [s, rng.next()] as const).sort((a, b) => a[1] - b[1]).slice(0, own).map(([s]) => s));
  const others = COMPANIES.filter((c) => c.id !== co.id && !c.needsFull);
  const tier = rarities(rivalGear(e, round, defence), rng);
  const loadout = {} as Loadout;
  for (const slot of SLOTS) {
    const maker = mine.has(slot) ? co.id : rng.pick(others).id;
    loadout[slot] = equipped(itemAt(slot, maker, tier[slot]));
  }
  const want = SCHEMES.find((s) => s.name === e.paints[round % e.paints.length]);
  const paint = want && paintsContrast(want.paint, player.paint) ? { ...want.paint } : pickPaint(player.paint, rng);
  return { name: def.name, loadout, paint, size: sanitizeSize(def.size) };
}

function pickPaint(mine: Paint, rng: Rng): Paint {
  return contrastingPaint(mine, rng);
}
