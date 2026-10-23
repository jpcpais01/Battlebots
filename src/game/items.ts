import type { MoveId } from '../sim/moves';

export type Slot = 'head' | 'fist' | 'core' | 'chest' | 'legs' | 'kick';
export const SLOTS: Slot[] = ['head', 'fist', 'core', 'chest', 'legs', 'kick'];
export const SLOT_LABEL: Record<Slot, string> = {
  head: 'Head',
  fist: 'Fist',
  core: 'Core',
  chest: 'Chest',
  legs: 'Legs',
  kick: 'Kick',
};

export type Rarity = 0 | 1 | 2 | 3 | 4;
export const RARITIES = [
  { name: 'Common', color: '#aab4c3', glow: 0x9aa6b8, mult: 1.0 },
  { name: 'Rare', color: '#3e9dff', glow: 0x2f8cff, mult: 1.15 },
  { name: 'Epic', color: '#b866ff', glow: 0xa54dff, mult: 1.3 },
  { name: 'Legendary', color: '#ffb23d', glow: 0xffa21f, mult: 1.5 },
  { name: 'Mythic', color: '#ff3f74', glow: 0xff2a62, mult: 1.75 },
] as const;

/**
 * Highest rarity in play. Every part is made at one rarity (its `tier`): parts above this one are
 * left out of the garage and of random bots, and saved or online bots wearing one fall back to
 * the default part for that slot.
 */
export const MAX_RARITY: Rarity = 2;

export interface Stats {
  maxHp: number;
  /** Fraction of damage removed. */
  armor: number;
  headGuard: number;
  punchPower: number;
  punchSpeed: number;
  /** Extra punch reach in meters. */
  reach: number;
  kickPower: number;
  moveSpeed: number;
  agility: number;
  stability: number;
  /** Seconds between something happening and the bot perceiving it. */
  reaction: number;
  accuracy: number;
  crit: number;
  stamina: number;
  staminaRegen: number;
}

export const BASE_STATS: Stats = {
  maxHp: 1300,
  armor: 0,
  headGuard: 0,
  punchPower: 1,
  punchSpeed: 1,
  reach: 0,
  kickPower: 1,
  moveSpeed: 2.1,
  agility: 1,
  stability: 1,
  reaction: 0.15,
  accuracy: 0.7,
  crit: 0.05,
  stamina: 100,
  staminaRegen: 16,
};

/**
 * Stat lines. Percent-style keys are fractions (0.1 = +10%).
 * `reaction` is a speed-up fraction (0.2 = perceives 20% faster).
 */
export type StatKey =
  | 'hp'
  | 'armor'
  | 'headGuard'
  | 'punchPower'
  | 'punchSpeed'
  | 'reach'
  | 'kickPower'
  | 'moveSpeed'
  | 'agility'
  | 'stability'
  | 'reaction'
  | 'accuracy'
  | 'crit'
  | 'stamina'
  | 'staminaRegen'
  | 'toughness';

export const STAT_LABEL: Record<StatKey, string> = {
  hp: 'Health',
  armor: 'Armor',
  headGuard: 'Head Guard',
  punchPower: 'Punch Power',
  punchSpeed: 'Punch Speed',
  reach: 'Reach',
  kickPower: 'Kick Power',
  moveSpeed: 'Move Speed',
  agility: 'Agility',
  stability: 'Stability',
  reaction: 'Reflexes',
  accuracy: 'Accuracy',
  crit: 'Crit Chance',
  stamina: 'Stamina',
  staminaRegen: 'Stamina Regen',
  toughness: 'Durability',
};

export type PassiveId =
  | 'composure'
  | 'weakSpot'
  | 'precog'
  | 'ironChin'
  | 'rage'
  | 'secondWind'
  | 'overdrive'
  | 'aegis'
  | 'siphon'
  | 'static'
  | 'plating'
  | 'reactiveGuard'
  | 'unstoppable'
  | 'slipstream'
  | 'retaliate'
  | 'footwork'
  | 'lightFeet'
  | 'rooted'
  | 'pistonDrive'
  | 'afterimage'
  | 'heavyStrike'
  | 'whiplash'
  | 'trip'
  | 'meteor'
  | 'afterburner'
  | 'bulwark'
  | 'tailwind'
  | 'furnace'
  | 'shatter'
  | 'nanoRepair'
  | 'iaido'
  | 'torque';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  /** Base magnitude, scaled by rarity. */
  value: number;
  /** Description with {v} placeholder (formatted as percentage unless `flat`). */
  text: string;
  flat?: boolean;
  /** Lower is better (e.g. cooldown seconds) — rarity divides instead of multiplies. */
  inverse?: boolean;
}

// ======================================================================= COMPANIES
export type CompanyId = 'ironhorse' | 'lumen' | 'longwei' | 'martelli' | 'kensei' | 'strix';

/** A bonus for wearing several parts from one maker (the 6-piece bonus comes on top of the 3-piece one). */
export interface SetBonus {
  at: 3 | 6;
  stats?: Partial<Record<StatKey, number>>;
  passives?: [PassiveId, number][];
  text: string;
}

export interface CompanyDef {
  id: CompanyId;
  name: string;
  /** Badge name. */
  short: string;
  /** Where the maker is from, for the brand card. */
  origin: string;
  motto: string;
  /** What the maker's parts are good at, in a few words. */
  focus: string;
  /** Brand colour (CSS). */
  color: string;
  sets: SetBonus[];
  /**
   * The parts only run on a bot built entirely from this maker's parts: anything less and every
   * one of them stalls (no stats, no passive, no move). Set bonuses still count pieces as usual.
   */
  needsFull?: boolean;
}

/**
 * The six robot makers. Every part comes from one of them, and each builds to its own idea of a
 * fighter you can see from across the arena: Ironhorse bolts a diesel engine into a bot, Lumen
 * machines it from one seamless piece, Longwei engineers it to survive anything, Martelli
 * sculpts it like a gladiator, Kensei laces it like a samurai and Strix shapes it like a stealth
 * jet. Wearing three or six parts from one maker unlocks its set bonus.
 */
export const COMPANIES: CompanyDef[] = [
  {
    id: 'ironhorse',
    name: 'Ironhorse Diesel Works',
    short: 'Ironhorse',
    origin: 'Pittsburgh, USA',
    motto: 'Turn the key. Hold on.',
    focus: 'Brute diesel power, full diesel bots only',
    color: '#ffc21a',
    needsFull: true,
    sets: [
      { at: 6, stats: { hp: 120, armor: 0.03 }, passives: [['unstoppable', 0.1], ['torque', 0.08]], text: '+120 Health, +3% Armor, hit-stun 10% shorter, warm engine +8%' },
    ],
  },
  {
    id: 'lumen',
    name: 'Lumen',
    short: 'Lumen',
    origin: 'Cupertino, USA',
    motto: 'Nothing extra.',
    focus: 'Energy, shields and self-repair',
    color: '#e6edf7',
    sets: [
      { at: 3, stats: { staminaRegen: 0.15, stamina: 10 }, text: '+15% Stamina Regen, +10 Stamina' },
      { at: 6, passives: [['nanoRepair', 3]], text: 'Self-repair: +3 health a second after 3s untouched' },
    ],
  },
  {
    id: 'longwei',
    name: 'Longwei Robotics',
    short: 'Longwei',
    origin: 'Shenzhen, China',
    motto: 'Engineered to outlast.',
    focus: 'Durability and steady pressure',
    color: '#29d3c2',
    sets: [
      { at: 3, stats: { toughness: 0.1, armor: 0.03 }, text: '+10% Durability, +3% Armor' },
      { at: 6, stats: { hp: 100, accuracy: 0.04 }, passives: [['plating', 0.15]], text: '+100 Health, +4% Accuracy, blocked hits chip 15% less' },
    ],
  },
  {
    id: 'martelli',
    name: 'Officine Martelli',
    short: 'Martelli',
    origin: 'Modena, Italy',
    motto: 'Forza e bellezza.',
    focus: 'Heavy power strikes',
    color: '#ff4b3e',
    sets: [
      { at: 3, stats: { punchPower: 0.05, kickPower: 0.05 }, text: '+5% Punch and Kick Power' },
      { at: 6, stats: { crit: 0.03 }, passives: [['heavyStrike', 0.15], ['furnace', 0.02]], text: '+3% Crit, power strikes break poise 15% faster, every clean hit in a row adds 2%' },
    ],
  },
  {
    id: 'kensei',
    name: 'Kensei Precision',
    short: 'Kensei',
    origin: 'Kyoto, Japan',
    motto: 'One clean cut.',
    focus: 'Precision and counters',
    color: '#b18bff',
    sets: [
      { at: 3, stats: { accuracy: 0.06, crit: 0.04 }, text: '+6% Accuracy, +4% Crit Chance' },
      { at: 6, stats: { punchPower: 0.05 }, passives: [['retaliate', 0.15], ['iaido', 0.15]], text: '+5% Punch Power; counter hits and the first strike after a pause deal 15% more' },
    ],
  },
  {
    id: 'strix',
    name: 'Strix Aerospace',
    short: 'Strix',
    origin: 'Mojave, USA',
    motto: 'You never saw it.',
    focus: 'Speed and footwork',
    color: '#7fb2ff',
    sets: [
      { at: 3, stats: { moveSpeed: 0.05, agility: 0.05 }, text: '+5% Move Speed, +5% Agility' },
      { at: 6, stats: { punchSpeed: 0.06, reaction: 0.1 }, passives: [['afterimage', 0.15]], text: '+6% Punch Speed, +10% Reflexes, the hit after a dodge deals 15% more' },
    ],
  },
];
export const COMPANY_BY_ID = new Map(COMPANIES.map((c) => [c.id, c]));

export interface ItemDef {
  id: string;
  slot: Slot;
  /**
   * The rarity it is made at. Every maker builds one part per slot at each tier (Common, Rare,
   * Epic), each its own design; a rarer part scales its stats and passive up (RARITIES.mult).
   */
  tier: Rarity;
  name: string;
  tagline: string;
  stats: Partial<Record<StatKey, number>>;
  passive: PassiveDef;
  ability?: MoveId;
  /** Who makes it. */
  maker: CompanyId;
  /** Its design for the model builder: maker index (COMPANIES order) + 6 × tier. */
  look: number;
  /** Chest: armour stands further out from the frame (the body's collision shape grows to match). */
  bulky?: boolean;
  /** Legs: heavy-bore leg rams. */
  rams?: boolean;
}

export const ITEMS: ItemDef[] = [
  // ---------------- IRONHORSE DIESEL WORKS: engine blocks, exhaust stacks, radiators, rubber hose ----------------
  {
    id: 'locomotive',
    slot: 'head',
    name: 'Locomotive Helm',
    maker: 'ironhorse',
    tagline: 'A headlamp, a cowcatcher and no fear.',
    stats: { hp: 130, headGuard: 0.12, stability: 0.06, toughness: 0.2, reaction: -0.05 },
    passive: { id: 'ironChin', name: 'Cast Jaw', value: 0.15, text: 'Takes {v} less damage to the head.' },
    tier: 0,
    look: 0,
  },
  {
    id: 'piledriver',
    slot: 'fist',
    name: 'Piledriver Fists',
    maker: 'ironhorse',
    tagline: 'Each punch is a fence post going in.',
    stats: { punchPower: 0.2, stability: 0.06, toughness: 0.2, punchSpeed: -0.07 },
    passive: { id: 'heavyStrike', name: 'Piledriver', value: 0.2, text: 'Power punches break poise {v} faster.' },
    ability: 'hammer',
    tier: 0,
    look: 0,
  },
  {
    id: 'turbodiesel',
    slot: 'core',
    name: 'Twin-Turbo V12',
    maker: 'ironhorse',
    tagline: 'Cold start, then it never stops pulling.',
    stats: { punchPower: 0.05, kickPower: 0.05, hp: 50, staminaRegen: -0.04 },
    passive: { id: 'torque', name: 'Warm Engine', value: 0.22, text: 'Hits deal up to {v} more as the engine warms over the first 30s.' },
    tier: 0,
    look: 0,
  },
  {
    id: 'radiator',
    slot: 'chest',
    name: 'Radiator Hull',
    maker: 'ironhorse',
    tagline: 'A tractor grille with a grudge.',
    stats: { hp: 230, armor: 0.08, toughness: 0.25, moveSpeed: -0.07, agility: -0.05 },
    passive: { id: 'unstoppable', name: 'Torque Frame', value: 0.25, text: 'Hit-stun is {v} shorter.' },
    tier: 0,
    look: 0,
    bulky: true,
  },
  {
    id: 'crawler',
    slot: 'legs',
    name: 'Crawler Legs',
    maker: 'ironhorse',
    tagline: 'Built on excavator pistons.',
    stats: { stability: 0.3, hp: 60, kickPower: 0.06, toughness: 0.25, moveSpeed: -0.05 },
    passive: { id: 'rooted', name: 'Dead Weight', value: 0.3, text: 'Knockback reduced by {v}.' },
    tier: 0,
    look: 0,
    rams: true,
  },
  {
    id: 'dozer',
    slot: 'kick',
    name: 'Dozer Boots',
    maker: 'ironhorse',
    tagline: 'Clears the ring at ankle height.',
    stats: { kickPower: 0.14, stability: 0.06, toughness: 0.2 },
    passive: { id: 'trip', name: 'Dozer Blade', value: 0.3, text: 'Sweeps are {v} more likely to drop.' },
    ability: 'sweep',
    tier: 0,
    look: 0,
  },
  // ---- ROADHOG (Rare): a big-rig truck, chrome grille, air horns, stacks and air bags
  {
    id: 'roadhog',
    slot: 'head',
    name: 'Roadhog Cab',
    maker: 'ironhorse',
    tier: 1,
    tagline: 'Air horns, a sun visor and eighteen wheels of attitude.',
    stats: { hp: 110, headGuard: 0.1, stability: 0.08, toughness: 0.2, reaction: -0.04 },
    passive: { id: 'composure', name: 'Jake Brake', value: 0.3, text: '{v} more likely to beat the count.' },
    look: 6,
  },
  {
    id: 'bullbar',
    slot: 'fist',
    name: 'Bull Bar Fists',
    maker: 'ironhorse',
    tier: 1,
    tagline: 'Chrome tube, welded for deer. Works on robots.',
    stats: { punchPower: 0.17, stability: 0.05, toughness: 0.25, punchSpeed: -0.06 },
    passive: { id: 'unstoppable', name: 'Push Bar', value: 0.18, text: 'Hit-stun is {v} shorter.' },
    ability: 'haymaker',
    look: 6,
  },
  {
    id: 'blower',
    slot: 'core',
    name: 'Roots Blower',
    maker: 'ironhorse',
    tier: 1,
    tagline: 'A supercharger sticking out of its chest. Boost on tap.',
    stats: { punchPower: 0.06, kickPower: 0.06, hp: 40, staminaRegen: -0.04 },
    passive: { id: 'overdrive', name: 'Full Boost', value: 0.16, text: 'Below 35% health: +{v} speed and damage.' },
    look: 6,
  },
  {
    id: 'bigrig',
    slot: 'chest',
    name: 'Big Rig Hull',
    maker: 'ironhorse',
    tier: 1,
    tagline: 'A chrome grille, twin stacks and no brakes.',
    stats: { hp: 210, armor: 0.07, toughness: 0.25, punchPower: 0.03, moveSpeed: -0.06, agility: -0.06 },
    passive: { id: 'bulwark', name: 'Sleeper Cab', value: 0.12, text: 'Body hits deal {v} less damage.' },
    look: 6,
    bulky: true,
  },
  {
    id: 'airride',
    slot: 'legs',
    name: 'Air-Ride Legs',
    maker: 'ironhorse',
    tier: 1,
    tagline: 'Rides on air bags, lands like a truck.',
    stats: { stability: 0.24, hp: 50, kickPower: 0.08, toughness: 0.2, agility: -0.03 },
    passive: { id: 'pistonDrive', name: 'Air Bags', value: 0.2, text: 'Lunging attacks travel {v} farther.' },
    look: 6,
    rams: true,
  },
  {
    id: 'mudflap',
    slot: 'kick',
    name: 'Mudflap Boots',
    maker: 'ironhorse',
    tier: 1,
    tagline: 'Twelve-ply treads and a flap that says KEEP BACK.',
    stats: { kickPower: 0.14, stability: 0.08, toughness: 0.2 },
    passive: { id: 'trip', name: 'Keep Back', value: 0.3, text: 'Push kicks knock back {v} more.' },
    ability: 'pushKick',
    look: 6,
  },
  // ---- IRON HORSE (Epic): the steam locomotive, boiler bands, chimneys, driving wheels and side rods
  {
    id: 'smokebox',
    slot: 'head',
    name: 'Smokebox Helm',
    maker: 'ironhorse',
    tier: 2,
    tagline: 'A boiler door for a face and a chimney for a crest.',
    stats: { hp: 120, headGuard: 0.14, stability: 0.05, toughness: 0.25, reaction: -0.05 },
    passive: { id: 'rage', name: 'Head of Steam', value: 0.03, text: '+{v} damage per hit taken (stacks 5x).' },
    look: 12,
  },
  {
    id: 'siderod',
    slot: 'fist',
    name: 'Side-Rod Fists',
    maker: 'ironhorse',
    tier: 2,
    tagline: 'Driving rods and a piston stroke behind every punch.',
    stats: { punchPower: 0.18, reach: 0.06, toughness: 0.2, punchSpeed: -0.06 },
    passive: { id: 'heavyStrike', name: 'Driving Rod', value: 0.18, text: 'Power punches break poise {v} faster.' },
    ability: 'rocketPunch',
    look: 12,
  },
  {
    id: 'firebox',
    slot: 'core',
    name: 'Firebox Boiler',
    maker: 'ironhorse',
    tier: 2,
    tagline: 'Shovel in the coal. It burns hotter every round.',
    stats: { punchPower: 0.05, kickPower: 0.05, hp: 60, staminaRegen: -0.05 },
    passive: { id: 'furnace', name: 'Stoke the Fire', value: 0.03, text: 'Every clean hit in a row adds {v} damage (stacks 5x).' },
    look: 12,
  },
  {
    id: 'boilerplate',
    slot: 'chest',
    name: 'Boiler Plate',
    maker: 'ironhorse',
    tier: 2,
    tagline: 'A locomotive boiler in brass bands, still under pressure.',
    stats: { hp: 240, armor: 0.09, toughness: 0.25, moveSpeed: -0.08, agility: -0.06 },
    passive: { id: 'reactiveGuard', name: 'Safety Valve', value: 4, text: 'Blocking a hit vents {v} stamina back.', flat: true },
    look: 12,
    bulky: true,
  },
  {
    id: 'driver',
    slot: 'legs',
    name: 'Driving Wheels',
    maker: 'ironhorse',
    tier: 2,
    tagline: 'Six-coupled drivers and a coupling rod down each leg.',
    stats: { stability: 0.26, kickPower: 0.1, hp: 70, toughness: 0.25, moveSpeed: -0.06 },
    passive: { id: 'rooted', name: 'Six-Coupled', value: 0.3, text: 'Knockback reduced by {v}.' },
    look: 12,
    rams: true,
  },
  {
    id: 'cowcatcher',
    slot: 'kick',
    name: 'Cowcatcher Boots',
    maker: 'ironhorse',
    tier: 2,
    tagline: 'Clears the line of anything standing on it.',
    stats: { kickPower: 0.15, stability: 0.06, toughness: 0.2 },
    passive: { id: 'shatter', name: 'Pilot Beam', value: 0.2, text: 'Strikes tear armour {v} faster.' },
    ability: 'sweep',
    look: 12,
  },
  // ---------------- LUMEN: one seamless shell, glass faces, a single line of light ----------------
  {
    id: 'vision',
    slot: 'head',
    name: 'Lumen Vision',
    maker: 'lumen',
    tagline: 'A sheet of black glass that sees everything.',
    stats: { reaction: 0.2, accuracy: 0.04, stamina: 10 },
    passive: { id: 'precog', name: 'Foresight', value: 0.12, text: '{v} chance to read an attack the instant it starts.' },
    tier: 0,
    look: 1,
  },
  {
    id: 'touch',
    slot: 'fist',
    name: 'Lumen Touch',
    maker: 'lumen',
    tagline: 'Haptic knuckles. The haptics are electric.',
    stats: { punchPower: 0.06, punchSpeed: 0.07, staminaRegen: 0.06 },
    passive: { id: 'siphon', name: 'Energy Return', value: 0.08, text: 'Heals {v} of damage dealt.' },
    ability: 'shockUpper',
    tier: 0,
    look: 1,
  },
  {
    id: 'cell',
    slot: 'core',
    name: 'Lumen Cell',
    maker: 'lumen',
    tagline: 'All-day battery. All-fight repairs.',
    stats: { staminaRegen: 0.14, hp: 30 },
    passive: { id: 'nanoRepair', name: 'Self Repair', value: 5, text: 'Repairs {v} health a second after 3s without being hit.', flat: true },
    tier: 0,
    look: 1,
  },
  {
    id: 'unibody',
    slot: 'chest',
    name: 'Lumen Unibody',
    maker: 'lumen',
    tagline: 'Milled from a single block. No seams to crack.',
    stats: { hp: 90, armor: 0.05, stamina: 10 },
    passive: { id: 'aegis', name: 'Glass Shield', value: 14, text: 'Every {v}s a shield absorbs the next hit.', flat: true, inverse: true },
    tier: 0,
    look: 1,
  },
  {
    id: 'glide',
    slot: 'legs',
    name: 'Lumen Glide',
    maker: 'lumen',
    tagline: 'Silent steps on magnetic bearings.',
    stats: { agility: 0.14, moveSpeed: 0.07, staminaRegen: 0.05 },
    passive: { id: 'afterimage', name: 'Phase Step', value: 0.2, text: 'After a dodge, the next hit deals +{v}.' },
    tier: 0,
    look: 1,
  },
  {
    id: 'curve',
    slot: 'kick',
    name: 'Lumen Curve',
    maker: 'lumen',
    tagline: 'One perfect arc.',
    stats: { kickPower: 0.09, reaction: 0.05, agility: 0.03 },
    passive: { id: 'secondWind', name: 'Fast Charge', value: 0.4, text: 'Stamina regen +{v} when below 30%.' },
    ability: 'roundhouse',
    tier: 0,
    look: 1,
  },
  // ---- PRO (Rare): squircle glass slabs, diamond-cut aluminium edges and triple lenses
  {
    id: 'lumenpro',
    slot: 'head',
    name: 'Lumen Pro Face',
    maker: 'lumen',
    tier: 1,
    tagline: 'A slab of black glass with a triple camera in the corner.',
    stats: { reaction: 0.14, accuracy: 0.07, crit: 0.03, stamina: 10 },
    passive: { id: 'weakSpot', name: 'Pro Camera', value: 0.25, text: 'Critical hits deal {v} extra damage.' },
    look: 7,
  },
  {
    id: 'watch',
    slot: 'fist',
    name: 'Lumen Watch Fists',
    maker: 'lumen',
    tier: 1,
    tagline: 'A crown, a glass face and a heart-rate on every jab.',
    stats: { punchSpeed: 0.1, accuracy: 0.05, staminaRegen: 0.06 },
    passive: { id: 'whiplash', name: 'Haptic Tap', value: 0.1, text: 'Combo punches are {v} faster.' },
    ability: 'flurry',
    look: 7,
  },
  {
    id: 'procell',
    slot: 'core',
    name: 'Pro Cell',
    maker: 'lumen',
    tier: 1,
    tagline: 'Three lenses, one battery, all day.',
    stats: { staminaRegen: 0.16, stamina: 15 },
    passive: { id: 'slipstream', name: 'Low Power Mode', value: 0.35, text: 'Dodges cost {v} less stamina.' },
    look: 7,
  },
  {
    id: 'proshell',
    slot: 'chest',
    name: 'Lumen Pro Shell',
    maker: 'lumen',
    tier: 1,
    tagline: 'Ceramic shield glass over a titanium frame.',
    stats: { hp: 100, armor: 0.06, staminaRegen: 0.05 },
    passive: { id: 'reactiveGuard', name: 'Ceramic Shield', value: 4, text: 'Blocking a hit gives back {v} stamina.', flat: true },
    look: 7,
  },
  {
    id: 'prostride',
    slot: 'legs',
    name: 'Lumen Pro Stride',
    maker: 'lumen',
    tier: 1,
    tagline: 'Squircle-section, diamond-cut, very fast.',
    stats: { agility: 0.12, moveSpeed: 0.08, stamina: 10 },
    passive: { id: 'lightFeet', name: 'Precision Glide', value: 0.12, text: 'Dodges are {v} quicker.' },
    look: 7,
  },
  {
    id: 'proarc',
    slot: 'kick',
    name: 'Lumen Pro Arc',
    maker: 'lumen',
    tier: 1,
    tagline: 'The curve, now in titanium.',
    stats: { kickPower: 0.1, accuracy: 0.04, agility: 0.04 },
    passive: { id: 'meteor', name: 'Perfect Arc', value: 0.15, text: 'Spinning strikes deal {v} more damage.' },
    ability: 'spinKick',
    look: 7,
  },
  // ---- HALO (Epic): glass orbs and rings of light that float off the body
  {
    id: 'halo',
    slot: 'head',
    name: 'Lumen Halo',
    maker: 'lumen',
    tier: 2,
    tagline: 'A glass orb with a ring of light floating over it.',
    stats: { reaction: 0.18, accuracy: 0.05, stamina: 15, hp: 30 },
    passive: { id: 'precog', name: 'Halo Sense', value: 0.12, text: '{v} chance to read an attack the instant it starts.' },
    look: 13,
  },
  {
    id: 'orbit',
    slot: 'fist',
    name: 'Orbit Touch',
    maker: 'lumen',
    tier: 2,
    tagline: 'Rings that hover round the knuckles and come back charged.',
    stats: { punchPower: 0.08, punchSpeed: 0.06, staminaRegen: 0.06 },
    passive: { id: 'siphon', name: 'Ring Return', value: 0.1, text: 'Heals {v} of damage dealt.' },
    ability: 'shockUpper',
    look: 13,
  },
  {
    id: 'gyro',
    slot: 'core',
    name: 'Halo Gyro',
    maker: 'lumen',
    tier: 2,
    tagline: 'A sun in a gyroscope, and a halo behind the shoulders.',
    stats: { staminaRegen: 0.12, hp: 40, reaction: 0.05 },
    passive: { id: 'nanoRepair', name: 'Gyro Mend', value: 6, text: 'Repairs {v} health a second after 3s without being hit.', flat: true },
    look: 13,
  },
  {
    id: 'aura',
    slot: 'chest',
    name: 'Aura Shell',
    maker: 'lumen',
    tier: 2,
    tagline: 'Touch it and it touches back.',
    stats: { hp: 110, armor: 0.05, stamina: 15 },
    passive: { id: 'static', name: 'Aura Field', value: 8, text: 'Anyone who punches it takes {v} shock damage.', flat: true },
    look: 13,
  },
  {
    id: 'levitas',
    slot: 'legs',
    name: 'Levitas Legs',
    maker: 'lumen',
    tier: 2,
    tagline: 'Floating rings where the joints should be.',
    stats: { moveSpeed: 0.1, agility: 0.1, staminaRegen: 0.05 },
    passive: { id: 'afterimage', name: 'Levitate', value: 0.18, text: 'After a dodge, the next hit deals +{v}.' },
    look: 13,
  },
  {
    id: 'hover',
    slot: 'kick',
    name: 'Hover Kick',
    maker: 'lumen',
    tier: 2,
    tagline: 'Soles that never quite touch the canvas.',
    stats: { kickPower: 0.1, agility: 0.05, reaction: 0.04 },
    passive: { id: 'tailwind', name: 'Anti-Grav', value: 0.14, text: 'Kicks come out {v} faster.' },
    ability: 'flyingKnee',
    look: 13,
  },
  // ---------------- LONGWEI ROBOTICS: precise panel lines, lidar, actuator drums, armoured graphite ----------------
  {
    id: 'tianyan',
    slot: 'head',
    name: 'Tianyan Sensor Head',
    maker: 'longwei',
    tagline: 'Lidar, stereo cameras and a steel brow.',
    stats: { accuracy: 0.08, reaction: 0.08, hp: 50, toughness: 0.1 },
    passive: { id: 'weakSpot', name: 'Lidar Lock', value: 0.25, text: 'Critical hits deal {v} extra damage.' },
    tier: 0,
    look: 2,
  },
  {
    id: 'jingang',
    slot: 'fist',
    name: 'Jingang Fists',
    maker: 'longwei',
    tagline: 'Servo-driven, rated for ten million punches.',
    stats: { punchSpeed: 0.12, punchPower: 0.03, toughness: 0.15 },
    passive: { id: 'whiplash', name: 'Servo Burst', value: 0.12, text: 'Combo punches are {v} faster.' },
    ability: 'flurry',
    tier: 0,
    look: 2,
  },
  {
    id: 'qilin',
    slot: 'core',
    name: 'Qilin Battery',
    maker: 'longwei',
    tagline: 'Solid-state cells in an armoured cradle.',
    stats: { staminaRegen: 0.1, stamina: 10, hp: 40 },
    passive: { id: 'secondWind', name: 'Reserve Cells', value: 0.5, text: 'Stamina regen +{v} when below 30%.' },
    tier: 0,
    look: 2,
  },
  {
    id: 'greatwall',
    slot: 'chest',
    name: 'Great Wall Chassis',
    maker: 'longwei',
    tagline: 'Layered armour, every plate replaceable.',
    stats: { hp: 150, armor: 0.07, toughness: 0.2, moveSpeed: -0.03 },
    passive: { id: 'plating', name: 'Layered Alloy', value: 0.35, text: 'Blocked hits deal {v} less chip damage.' },
    tier: 0,
    look: 2,
  },
  {
    id: 'longma',
    slot: 'legs',
    name: 'Longma Actuators',
    maker: 'longwei',
    tagline: 'Quasi-direct drives. They never miss a step.',
    stats: { moveSpeed: 0.07, agility: 0.07, stability: 0.1, toughness: 0.15 },
    passive: { id: 'footwork', name: 'Gait Control', value: 0.08, text: '+{v} movement speed while circling.' },
    tier: 0,
    look: 2,
  },
  {
    id: 'xuanfeng',
    slot: 'kick',
    name: 'Xuanfeng Boots',
    maker: 'longwei',
    tagline: 'A whirlwind kick with a gyro in the heel.',
    stats: { kickPower: 0.1, stability: 0.04, toughness: 0.1 },
    passive: { id: 'meteor', name: 'Whirlwind', value: 0.15, text: 'Spinning strikes deal {v} more damage.' },
    ability: 'spinKick',
    tier: 0,
    look: 2,
  },
  // ---- TIANGONG (Rare): space station tech, docking rings, gold foil, solar wings, lander struts
  {
    id: 'shenzhou',
    slot: 'head',
    name: 'Shenzhou Capsule',
    maker: 'longwei',
    tier: 1,
    tagline: 'A re-entry capsule with portholes for eyes.',
    stats: { hp: 60, headGuard: 0.08, accuracy: 0.06, toughness: 0.15 },
    passive: { id: 'composure', name: 'Re-entry', value: 0.3, text: '{v} more likely to beat the count.' },
    look: 8,
  },
  {
    id: 'tianbi',
    slot: 'fist',
    name: 'Tianbi Space Arm',
    maker: 'longwei',
    tier: 1,
    tagline: 'A station arm with a docking grapple for a fist.',
    stats: { punchPower: 0.08, reach: 0.08, accuracy: 0.04, toughness: 0.15 },
    passive: { id: 'afterburner', name: 'Long Arm', value: 0.12, text: 'Straight punches deal {v} more damage.' },
    ability: 'rocketPunch',
    look: 8,
  },
  {
    id: 'duijie',
    slot: 'core',
    name: 'Duijie Docking Core',
    maker: 'longwei',
    tier: 1,
    tagline: 'A docking port up front, solar wings behind.',
    stats: { staminaRegen: 0.1, stamina: 10, hp: 50 },
    passive: { id: 'aegis', name: 'Docking Shield', value: 15, text: 'Every {v}s a shield absorbs the next hit.', flat: true, inverse: true },
    look: 8,
  },
  {
    id: 'tiangong',
    slot: 'chest',
    name: 'Tiangong Module',
    maker: 'longwei',
    tier: 1,
    tagline: 'A space station module wrapped in gold foil.',
    stats: { hp: 160, armor: 0.06, toughness: 0.2, staminaRegen: 0.04, moveSpeed: -0.03 },
    passive: { id: 'plating', name: 'Whipple Shield', value: 0.3, text: 'Blocked hits deal {v} less chip damage.' },
    look: 8,
  },
  {
    id: 'change',
    slot: 'legs',
    name: "Chang'e Landing Legs",
    maker: 'longwei',
    tier: 1,
    tagline: 'Lander struts with pads that soak up anything.',
    stats: { stability: 0.16, moveSpeed: 0.05, agility: 0.04, toughness: 0.15 },
    passive: { id: 'rooted', name: 'Landing Struts', value: 0.2, text: 'Knockback reduced by {v}.' },
    look: 8,
  },
  {
    id: 'yutu',
    slot: 'kick',
    name: 'Yutu Rover Boots',
    maker: 'longwei',
    tier: 1,
    tagline: 'Rover wheels on the heels, solar cells on the shins.',
    stats: { kickPower: 0.1, stability: 0.05, accuracy: 0.04, toughness: 0.1 },
    passive: { id: 'trip', name: 'Rover Push', value: 0.3, text: 'Push kicks knock back {v} more.' },
    ability: 'pushKick',
    look: 8,
  },
  // ---- SHENLONG (Epic): the dragon, horns, whiskers, scales, claws and the pearl
  {
    id: 'shenlong',
    slot: 'head',
    name: 'Shenlong Head',
    maker: 'longwei',
    tier: 2,
    tagline: 'Horns, whiskers and two eyes that do not miss.',
    stats: { accuracy: 0.08, reaction: 0.1, hp: 50, crit: 0.03, toughness: 0.1 },
    passive: { id: 'weakSpot', name: 'Dragon Eye', value: 0.25, text: 'Critical hits deal {v} extra damage.' },
    look: 14,
  },
  {
    id: 'longzhua',
    slot: 'fist',
    name: 'Longzhua Claws',
    maker: 'longwei',
    tier: 2,
    tagline: 'Five talons, folded over the knuckles.',
    stats: { punchSpeed: 0.08, punchPower: 0.08, crit: 0.03, toughness: 0.15 },
    passive: { id: 'shatter', name: 'Dragon Claw', value: 0.2, text: 'Strikes tear armour {v} faster.' },
    ability: 'haymaker',
    look: 14,
  },
  {
    id: 'longzhu',
    slot: 'core',
    name: 'Longzhu Pearl',
    maker: 'longwei',
    tier: 2,
    tagline: "The dragon's pearl, held in four claws.",
    stats: { staminaRegen: 0.12, hp: 60, stamina: 10 },
    passive: { id: 'nanoRepair', name: 'Pearl Light', value: 4, text: 'Repairs {v} health a second after 3s without being hit.', flat: true },
    look: 14,
  },
  {
    id: 'longlin',
    slot: 'chest',
    name: 'Longlin Scale Armour',
    maker: 'longwei',
    tier: 2,
    tagline: 'A thousand scales, every one replaceable.',
    stats: { hp: 170, armor: 0.08, toughness: 0.25, moveSpeed: -0.03 },
    passive: { id: 'bulwark', name: 'Dragon Scales', value: 0.12, text: 'Body hits deal {v} less damage.' },
    look: 14,
  },
  {
    id: 'jiaolong',
    slot: 'legs',
    name: 'Jiaolong Legs',
    maker: 'longwei',
    tier: 2,
    tagline: 'Scaled, spurred and always circling.',
    stats: { moveSpeed: 0.06, agility: 0.08, stability: 0.08, kickPower: 0.06, toughness: 0.15 },
    passive: { id: 'footwork', name: 'Coiling Step', value: 0.1, text: '+{v} movement speed while circling.' },
    look: 14,
  },
  {
    id: 'tianlong',
    slot: 'kick',
    name: 'Tianlong Talons',
    maker: 'longwei',
    tier: 2,
    tagline: 'Three talons and a spur. The tail comes round fast.',
    stats: { kickPower: 0.12, stability: 0.04, crit: 0.03, toughness: 0.1 },
    passive: { id: 'tailwind', name: 'Dragon Tail', value: 0.14, text: 'Kicks come out {v} faster.' },
    ability: 'roundhouse',
    look: 14,
  },
  // ---------------- OFFICINE MARTELLI: sculpted cuirass, polished brass, crests and lion faces ----------------
  {
    id: 'centurione',
    slot: 'head',
    name: 'Centurione Helm',
    maker: 'martelli',
    tagline: 'A crest of brass and a face that does not blink.',
    stats: { hp: 60, crit: 0.05, punchPower: 0.04, headGuard: 0.05 },
    passive: { id: 'composure', name: 'Gloria', value: 0.3, text: '{v} more likely to beat the count.' },
    tier: 0,
    look: 3,
  },
  {
    id: 'colosseo',
    slot: 'fist',
    name: 'Colosseo Gauntlets',
    maker: 'martelli',
    tagline: 'Brass-banded, hand-finished, fight-ending.',
    stats: { punchPower: 0.12, crit: 0.03, punchSpeed: -0.06 },
    passive: { id: 'rage', name: 'Furia', value: 0.04, text: '+{v} damage per hit taken (stacks 5x).' },
    ability: 'haymaker',
    tier: 0,
    look: 3,
  },
  {
    id: 'soledoro',
    slot: 'core',
    name: "Sole d'Oro Core",
    maker: 'martelli',
    tagline: 'A golden sun behind a lion medallion.',
    stats: { punchPower: 0.04, kickPower: 0.04, hp: 30 },
    passive: { id: 'overdrive', name: 'Ultimo Round', value: 0.18, text: 'Below 35% health: +{v} speed and damage.' },
    tier: 0,
    look: 3,
  },
  {
    id: 'corazza',
    slot: 'chest',
    name: 'Corazza Cuirass',
    maker: 'martelli',
    tagline: 'Sculpted like marble, cast like a bell.',
    stats: { hp: 120, armor: 0.05, punchPower: 0.03, moveSpeed: -0.04 },
    passive: { id: 'heavyStrike', name: 'Bronze Weight', value: 0.12, text: 'Power strikes break poise {v} faster.' },
    tier: 0,
    look: 3,
  },
  {
    id: 'legionario',
    slot: 'legs',
    name: 'Legionario Greaves',
    maker: 'martelli',
    tagline: 'Twin rams under polished greaves.',
    stats: { kickPower: 0.12, stability: 0.1, moveSpeed: -0.02 },
    passive: { id: 'pistonDrive', name: 'Charge', value: 0.2, text: 'Lunging attacks travel {v} farther.' },
    tier: 0,
    look: 3,
    rams: true,
  },
  {
    id: 'spartano',
    slot: 'kick',
    name: 'Spartano Boots',
    maker: 'martelli',
    tagline: 'The kick that ends at the ropes.',
    stats: { kickPower: 0.12, stability: 0.04, crit: 0.02 },
    passive: { id: 'trip', name: 'Spartan Shove', value: 0.3, text: 'Kick knockback +{v}.' },
    ability: 'pushKick',
    tier: 0,
    look: 3,
  },
  // ---- RINASCIMENTO (Rare): fluted Milanese plate, beak visors, gadlings, pointed sabatons
  {
    id: 'armet',
    slot: 'head',
    name: 'Armet Gotico',
    maker: 'martelli',
    tier: 1,
    tagline: 'A sparrow-beak visor and a fluted skull.',
    stats: { hp: 70, headGuard: 0.08, crit: 0.04, punchPower: 0.03 },
    passive: { id: 'ironChin', name: 'Bellows Visor', value: 0.14, text: 'Takes {v} less damage to the head.' },
    look: 9,
  },
  {
    id: 'gotico',
    slot: 'fist',
    name: 'Gotico Gauntlets',
    maker: 'martelli',
    tier: 1,
    tagline: 'Fluted cuffs and spiked gadlings on every knuckle.',
    stats: { punchPower: 0.13, crit: 0.04, punchSpeed: -0.05 },
    passive: { id: 'shatter', name: 'Gadlings', value: 0.2, text: 'Strikes tear armour {v} faster.' },
    ability: 'hammer',
    look: 9,
  },
  {
    id: 'rosone',
    slot: 'core',
    name: 'Rosone Core',
    maker: 'martelli',
    tier: 1,
    tagline: 'A cathedral rose window, lit from inside.',
    stats: { punchPower: 0.04, kickPower: 0.04, hp: 40, crit: 0.02 },
    passive: { id: 'furnace', name: 'Crescendo', value: 0.025, text: 'Every clean hit in a row adds {v} damage (stacks 5x).' },
    look: 9,
  },
  {
    id: 'rinascimento',
    slot: 'chest',
    name: 'Rinascimento Plate',
    maker: 'martelli',
    tier: 1,
    tagline: 'Milanese plate with shoulders that stand up to meet you.',
    stats: { hp: 140, armor: 0.06, punchPower: 0.04, moveSpeed: -0.04 },
    passive: { id: 'retaliate', name: 'Haute-Piece', value: 0.15, text: 'Counter hits deal {v} more damage.' },
    look: 9,
  },
  {
    id: 'cosciali',
    slot: 'legs',
    name: 'Cosciali Legs',
    maker: 'martelli',
    tier: 1,
    tagline: 'Fluted cuisses and knee cops with fans.',
    stats: { kickPower: 0.12, stability: 0.12, moveSpeed: -0.02 },
    passive: { id: 'heavyStrike', name: 'Fluted Steel', value: 0.12, text: 'Power strikes break poise {v} faster.' },
    look: 9,
    rams: true,
  },
  {
    id: 'poulaine',
    slot: 'kick',
    name: 'Poulaine Sabatons',
    maker: 'martelli',
    tier: 1,
    tagline: 'Toes a hand too long, on purpose.',
    stats: { kickPower: 0.13, crit: 0.03, accuracy: 0.03 },
    passive: { id: 'meteor', name: 'Pointed Toe', value: 0.15, text: 'Spinning strikes deal {v} more damage.' },
    ability: 'spinKick',
    look: 9,
  },
  // ---- LEONE D'ORO (Epic): gilded parade armour, lion manes, lion paws, the winged lion
  {
    id: 'leone',
    slot: 'head',
    name: "Leone d'Oro Helm",
    maker: 'martelli',
    tier: 2,
    tagline: 'A golden mane and a roar to go with it.',
    stats: { hp: 70, crit: 0.05, punchPower: 0.04, headGuard: 0.06 },
    passive: { id: 'rage', name: 'Ruggito', value: 0.04, text: '+{v} damage per hit taken (stacks 5x).' },
    look: 15,
  },
  {
    id: 'zampa',
    slot: 'fist',
    name: 'Zampa Gauntlets',
    maker: 'martelli',
    tier: 2,
    tagline: 'Lion paws with brass claws.',
    stats: { punchPower: 0.15, crit: 0.04, punchSpeed: -0.05 },
    passive: { id: 'weakSpot', name: 'Lion Claws', value: 0.25, text: 'Critical hits deal {v} extra damage.' },
    ability: 'haymaker',
    look: 15,
  },
  {
    id: 'cuore',
    slot: 'core',
    name: 'Cuore di Leone',
    maker: 'martelli',
    tier: 2,
    tagline: 'A lion holding a burning ring in its teeth.',
    stats: { punchPower: 0.05, kickPower: 0.05, hp: 40 },
    passive: { id: 'composure', name: 'Lionheart', value: 0.35, text: '{v} more likely to beat the count.' },
    look: 15,
  },
  {
    id: 'marco',
    slot: 'chest',
    name: 'San Marco Cuirass',
    maker: 'martelli',
    tier: 2,
    tagline: 'Lion-head shoulders and gilded wings on the back.',
    stats: { hp: 150, armor: 0.06, punchPower: 0.04, crit: 0.02, moveSpeed: -0.04 },
    passive: { id: 'heavyStrike', name: 'Winged Lion', value: 0.14, text: 'Power strikes break poise {v} faster.' },
    look: 15,
  },
  {
    id: 'ruggito',
    slot: 'legs',
    name: 'Ruggito Greaves',
    maker: 'martelli',
    tier: 2,
    tagline: 'Gilded greaves with lions on the knees.',
    stats: { kickPower: 0.13, stability: 0.12, hp: 30, moveSpeed: -0.02 },
    passive: { id: 'pistonDrive', name: 'Prowl', value: 0.22, text: 'Lunging attacks travel {v} farther.' },
    look: 15,
    rams: true,
  },
  {
    id: 'artiglio',
    slot: 'kick',
    name: 'Artiglio Boots',
    maker: 'martelli',
    tier: 2,
    tagline: 'Paws that land claws first.',
    stats: { kickPower: 0.14, crit: 0.03, stability: 0.04 },
    passive: { id: 'tailwind', name: 'Pounce', value: 0.12, text: 'Kicks come out {v} faster.' },
    ability: 'flyingKnee',
    look: 15,
  },
  // ---------------- KENSEI PRECISION: laced lamellar, lacquer, crests, clean edges ----------------
  {
    id: 'kabuto',
    slot: 'head',
    name: 'Kabuto Helm',
    maker: 'kensei',
    tagline: 'A crescent crest and a patient stare.',
    stats: { accuracy: 0.08, reaction: 0.08, crit: 0.03, hp: 40 },
    passive: { id: 'iaido', name: 'Iaido', value: 0.25, text: 'The first strike after 2s without attacking deals +{v}.' },
    tier: 0,
    look: 4,
  },
  {
    id: 'kote',
    slot: 'fist',
    name: 'Kote Gauntlets',
    maker: 'kensei',
    tagline: 'Lacquered splints for one committed cut.',
    stats: { accuracy: 0.07, punchPower: 0.1, crit: 0.05 },
    passive: { id: 'retaliate', name: 'Counter Cut', value: 0.15, text: 'Counter hits deal {v} more damage.' },
    ability: 'haymaker',
    tier: 0,
    look: 4,
  },
  {
    id: 'zen',
    slot: 'core',
    name: 'Zen Core',
    maker: 'kensei',
    tagline: 'Breathe. Then strike.',
    stats: { reaction: 0.08, staminaRegen: 0.08, punchPower: 0.03 },
    passive: { id: 'precog', name: 'Mushin', value: 0.1, text: '{v} chance to read an attack the instant it starts.' },
    tier: 0,
    look: 4,
  },
  {
    id: 'lamellar',
    slot: 'chest',
    name: 'Lamellar Do',
    maker: 'kensei',
    tagline: 'A hundred plates, each laced by hand.',
    stats: { hp: 120, armor: 0.06, agility: 0.04 },
    passive: { id: 'plating', name: 'Laced Plates', value: 0.3, text: 'Blocked hits deal {v} less chip damage.' },
    tier: 0,
    look: 4,
  },
  {
    id: 'hakama',
    slot: 'legs',
    name: 'Hakama Legs',
    maker: 'kensei',
    tagline: 'Low stance, long reach.',
    stats: { agility: 0.1, stability: 0.1, kickPower: 0.07 },
    passive: { id: 'lightFeet', name: 'Suriashi', value: 0.12, text: 'Dodges are {v} quicker.' },
    tier: 0,
    look: 4,
  },
  {
    id: 'kama',
    slot: 'kick',
    name: 'Kama Greaves',
    maker: 'kensei',
    tagline: 'Reaps the legs like rice.',
    stats: { kickPower: 0.1, accuracy: 0.05, agility: 0.04 },
    passive: { id: 'trip', name: 'Reaping Cut', value: 0.25, text: 'Sweeps are {v} more likely to drop.' },
    ability: 'sweep',
    tier: 0,
    look: 4,
  },
  // ---- SHINOBI (Rare): wrapped hoods, claws, straps, split-toe tabi
  {
    id: 'shinobi',
    slot: 'head',
    name: 'Shinobi Hood',
    maker: 'kensei',
    tier: 1,
    tagline: 'Wrapped tight. Only the eyes, and only for a moment.',
    stats: { reaction: 0.12, accuracy: 0.06, agility: 0.05, crit: 0.03 },
    passive: { id: 'precog', name: 'Sixth Sense', value: 0.11, text: '{v} chance to read an attack the instant it starts.' },
    look: 10,
  },
  {
    id: 'tekko',
    slot: 'fist',
    name: 'Tekko-Kagi Claws',
    maker: 'kensei',
    tier: 1,
    tagline: 'Three blades over the knuckles, quick and quiet.',
    stats: { punchSpeed: 0.1, crit: 0.06, accuracy: 0.04 },
    passive: { id: 'whiplash', name: 'Claw Rake', value: 0.12, text: 'Combo punches are {v} faster.' },
    ability: 'flurry',
    look: 10,
  },
  {
    id: 'shuriken',
    slot: 'core',
    name: 'Shuriken Core',
    maker: 'kensei',
    tier: 1,
    tagline: 'A spinning star in the chest, a ninjato on the back.',
    stats: { reaction: 0.08, crit: 0.03, staminaRegen: 0.06 },
    passive: { id: 'afterimage', name: 'Vanish', value: 0.18, text: 'After a dodge, the next hit deals +{v}.' },
    look: 10,
  },
  {
    id: 'shozoku',
    slot: 'chest',
    name: 'Shozoku Wrap',
    maker: 'kensei',
    tier: 1,
    tagline: 'Cross-strapped, chain-lined, never where you aimed.',
    stats: { hp: 90, armor: 0.04, agility: 0.08, moveSpeed: 0.04 },
    passive: { id: 'lightFeet', name: 'Shadow Wrap', value: 0.12, text: 'Dodges are {v} quicker.' },
    look: 10,
  },
  {
    id: 'kyahan',
    slot: 'legs',
    name: 'Kyahan Legs',
    maker: 'kensei',
    tier: 1,
    tagline: 'Bound shins and a sash that trails behind.',
    stats: { agility: 0.12, moveSpeed: 0.06, kickPower: 0.05 },
    passive: { id: 'footwork', name: 'Silent Step', value: 0.1, text: '+{v} movement speed while circling.' },
    look: 10,
  },
  {
    id: 'tabi',
    slot: 'kick',
    name: 'Jika-Tabi Boots',
    maker: 'kensei',
    tier: 1,
    tagline: 'Split toes for a grip on the canvas.',
    stats: { kickPower: 0.1, accuracy: 0.06, agility: 0.04 },
    passive: { id: 'tailwind', name: 'Split Toe', value: 0.14, text: 'Kicks come out {v} faster.' },
    ability: 'roundhouse',
    look: 10,
  },
  // ---- SHOGUN (Epic): great armour, antler crest, oni mask, box shoulders, a war banner
  {
    id: 'shogun',
    slot: 'head',
    name: 'Shogun Kabuto',
    maker: 'kensei',
    tier: 2,
    tagline: 'Antler horns, a sun between them and an oni mask.',
    stats: { accuracy: 0.08, reaction: 0.08, crit: 0.04, hp: 50, headGuard: 0.05 },
    passive: { id: 'composure', name: 'Bushido', value: 0.35, text: '{v} more likely to beat the count.' },
    look: 16,
  },
  {
    id: 'oni',
    slot: 'fist',
    name: 'Oni Kote',
    maker: 'kensei',
    tier: 2,
    tagline: "Iron-studded, like a demon's club.",
    stats: { punchPower: 0.14, crit: 0.05, accuracy: 0.03, punchSpeed: -0.04 },
    passive: { id: 'heavyStrike', name: 'Kanabo', value: 0.18, text: 'Power strikes break poise {v} faster.' },
    ability: 'hammer',
    look: 16,
  },
  {
    id: 'hinomaru',
    slot: 'core',
    name: 'Hinomaru Core',
    maker: 'kensei',
    tier: 2,
    tagline: 'A rising sun in front, a war banner behind.',
    stats: { reaction: 0.06, staminaRegen: 0.08, punchPower: 0.04 },
    passive: { id: 'iaido', name: 'Rising Sun', value: 0.22, text: 'The first strike after 2s without attacking deals +{v}.' },
    look: 16,
  },
  {
    id: 'oyoroi',
    slot: 'chest',
    name: 'O-Yoroi',
    maker: 'kensei',
    tier: 2,
    tagline: 'Great armour: box shoulders and a knot at the back.',
    stats: { hp: 150, armor: 0.07, toughness: 0.1, agility: 0.02 },
    passive: { id: 'retaliate', name: 'O-Sode', value: 0.15, text: 'Counter hits deal {v} more damage.' },
    look: 16,
  },
  {
    id: 'daimyo',
    slot: 'legs',
    name: 'Daimyo Haidate',
    maker: 'kensei',
    tier: 2,
    tagline: 'Rows of gold-laced plate down to the knee.',
    stats: { stability: 0.14, agility: 0.06, kickPower: 0.08 },
    passive: { id: 'rooted', name: 'Daimyo Stance', value: 0.22, text: 'Knockback reduced by {v}.' },
    look: 16,
  },
  {
    id: 'raijin',
    slot: 'kick',
    name: 'Raijin Suneate',
    maker: 'kensei',
    tier: 2,
    tagline: 'Thunder-god shin guards. The spin brings the storm.',
    stats: { kickPower: 0.13, accuracy: 0.05, crit: 0.03 },
    passive: { id: 'meteor', name: 'Thunder Spin', value: 0.18, text: 'Spinning strikes deal {v} more damage.' },
    ability: 'spinKick',
    look: 16,
  },
  // ---------------- STRIX AEROSPACE: flat stealth facets, chines, gold canopies, sawtooth edges ----------------
  {
    id: 'nighthawk',
    slot: 'head',
    name: 'Nighthawk Canopy',
    maker: 'strix',
    tagline: 'All facets, no reflection, one gold slit.',
    stats: { reaction: 0.16, agility: 0.06, accuracy: 0.05, toughness: -0.05 },
    passive: { id: 'precog', name: 'Radar Warning', value: 0.1, text: '{v} chance to read an attack the instant it starts.' },
    tier: 0,
    look: 5,
  },
  {
    id: 'sidewinder',
    slot: 'fist',
    name: 'Sidewinder Fists',
    maker: 'strix',
    tagline: 'Fire and forget.',
    stats: { reach: 0.1, punchPower: 0.08, punchSpeed: 0.06, accuracy: 0.03 },
    passive: { id: 'afterburner', name: 'Boost Phase', value: 0.12, text: 'Straight punches deal {v} more damage.' },
    ability: 'rocketPunch',
    tier: 0,
    look: 5,
  },
  {
    id: 'scramjet',
    slot: 'core',
    name: 'Scramjet Core',
    maker: 'strix',
    tagline: 'Breathes air at Mach five.',
    stats: { staminaRegen: 0.14, moveSpeed: 0.04, hp: 30 },
    passive: { id: 'slipstream', name: 'Bypass Flow', value: 0.4, text: 'Dodges cost {v} less stamina.' },
    tier: 0,
    look: 5,
  },
  {
    id: 'wraith',
    slot: 'chest',
    name: 'Wraith Airframe',
    maker: 'strix',
    tagline: 'Radar sees a bird. The bird hits back.',
    stats: { hp: 80, armor: 0.03, moveSpeed: 0.08, agility: 0.08, punchSpeed: 0.05, toughness: -0.05 },
    passive: { id: 'lightFeet', name: 'Low Observable', value: 0.12, text: 'Dodges are {v} quicker.' },
    tier: 0,
    look: 5,
  },
  {
    id: 'raptor',
    slot: 'legs',
    name: 'Raptor Legs',
    maker: 'strix',
    tagline: 'Thrust vectoring in every stride.',
    stats: { moveSpeed: 0.12, agility: 0.12, kickPower: 0.04, stability: -0.03 },
    passive: { id: 'footwork', name: 'Vector Thrust', value: 0.1, text: '+{v} movement speed while circling.' },
    tier: 0,
    look: 5,
  },
  {
    id: 'afterburner',
    slot: 'kick',
    name: 'Afterburner Knees',
    maker: 'strix',
    tagline: 'Lights up, closes in, lands.',
    stats: { kickPower: 0.1, moveSpeed: 0.03, agility: 0.04 },
    passive: { id: 'tailwind', name: 'Supercruise', value: 0.15, text: 'Kicks come out {v} faster.' },
    ability: 'flyingKnee',
    tier: 0,
    look: 5,
  },
  // ---- KESTREL (Rare): VTOL jump jet, bubble canopy, lift fans, swivel nozzles, landing gear
  {
    id: 'kestrel',
    slot: 'head',
    name: 'Kestrel Canopy',
    maker: 'strix',
    tier: 1,
    tagline: 'A bubble canopy and a targeting pod under the chin.',
    stats: { reaction: 0.14, accuracy: 0.05, agility: 0.05, toughness: -0.04 },
    passive: { id: 'weakSpot', name: 'Target Pod', value: 0.22, text: 'Critical hits deal {v} extra damage.' },
    look: 11,
  },
  {
    id: 'vector',
    slot: 'fist',
    name: 'Vector Fists',
    maker: 'strix',
    tier: 1,
    tagline: 'Swivel nozzles on the hands. Uppercuts take off.',
    stats: { punchSpeed: 0.1, punchPower: 0.06, agility: 0.03 },
    passive: { id: 'whiplash', name: 'Thrust Vector', value: 0.12, text: 'Combo punches are {v} faster.' },
    ability: 'shockUpper',
    look: 11,
  },
  {
    id: 'liftfan',
    slot: 'core',
    name: 'Lift Fan Core',
    maker: 'strix',
    tier: 1,
    tagline: 'A fan in the chest, nozzles on the back. It hovers.',
    stats: { moveSpeed: 0.05, agility: 0.06, staminaRegen: 0.08 },
    passive: { id: 'slipstream', name: 'Lift Fan', value: 0.35, text: 'Dodges cost {v} less stamina.' },
    look: 11,
  },
  {
    id: 'hoverjet',
    slot: 'chest',
    name: 'Hoverjet Airframe',
    maker: 'strix',
    tier: 1,
    tagline: 'Canards, cheek intakes and swivel pods on the shoulders.',
    stats: { hp: 90, armor: 0.03, agility: 0.1, moveSpeed: 0.06, toughness: -0.05 },
    passive: { id: 'afterimage', name: 'Hover Hop', value: 0.15, text: 'After a dodge, the next hit deals +{v}.' },
    look: 11,
  },
  {
    id: 'oleo',
    slot: 'legs',
    name: 'Oleo Strut Legs',
    maker: 'strix',
    tier: 1,
    tagline: 'Landing gear: struts, doors and a hop in every step.',
    stats: { moveSpeed: 0.1, agility: 0.08, stability: 0.04 },
    passive: { id: 'lightFeet', name: 'Shock Struts', value: 0.12, text: 'Dodges are {v} quicker.' },
    look: 11,
  },
  {
    id: 'canard',
    slot: 'kick',
    name: 'Canard Boots',
    maker: 'strix',
    tier: 1,
    tagline: 'Little wings on the shins. They steer the kick.',
    stats: { kickPower: 0.1, agility: 0.05, moveSpeed: 0.03 },
    passive: { id: 'tailwind', name: 'Canards', value: 0.14, text: 'Kicks come out {v} faster.' },
    ability: 'roundhouse',
    look: 11,
  },
  // ---- BLACKBIRD (Epic): Mach 3 recon jet, chines, inlet spikes, nacelles, afterburners
  {
    id: 'blackbird',
    slot: 'head',
    name: 'Blackbird Helm',
    maker: 'strix',
    tier: 2,
    tagline: 'A chined nose and inlet spikes. Mach three to the face.',
    stats: { reaction: 0.18, accuracy: 0.06, crit: 0.02, toughness: -0.05 },
    passive: { id: 'precog', name: 'Mach Warning', value: 0.12, text: '{v} chance to read an attack the instant it starts.' },
    look: 17,
  },
  {
    id: 'machfist',
    slot: 'fist',
    name: 'Mach Fists',
    maker: 'strix',
    tier: 2,
    tagline: 'A shock cone on the knuckles, a nacelle on the arm.',
    stats: { reach: 0.08, punchPower: 0.1, punchSpeed: 0.06 },
    passive: { id: 'afterburner', name: 'Shock Cone', value: 0.15, text: 'Straight punches deal {v} more damage.' },
    ability: 'rocketPunch',
    look: 17,
  },
  {
    id: 'ramjet',
    slot: 'core',
    name: 'Ramjet Core',
    maker: 'strix',
    tier: 2,
    tagline: 'An inlet spike in front, shock diamonds behind.',
    stats: { staminaRegen: 0.12, moveSpeed: 0.05, punchSpeed: 0.03 },
    passive: { id: 'overdrive', name: 'Ramjet Light', value: 0.15, text: 'Below 35% health: +{v} speed and damage.' },
    look: 17,
  },
  {
    id: 'mach3',
    slot: 'chest',
    name: 'Mach 3 Airframe',
    maker: 'strix',
    tier: 2,
    tagline: 'Two engine nacelles for shoulders.',
    stats: { hp: 90, armor: 0.04, moveSpeed: 0.08, agility: 0.08, punchSpeed: 0.04, toughness: -0.05 },
    passive: { id: 'footwork', name: 'Mach Turn', value: 0.1, text: '+{v} movement speed while circling.' },
    look: 17,
  },
  {
    id: 'nacelle',
    slot: 'legs',
    name: 'Nacelle Legs',
    maker: 'strix',
    tier: 2,
    tagline: 'Calves that end in afterburners.',
    stats: { moveSpeed: 0.13, agility: 0.1, kickPower: 0.05, stability: -0.03 },
    passive: { id: 'pistonDrive', name: 'Afterburner Stride', value: 0.2, text: 'Lunging attacks travel {v} farther.' },
    look: 17,
  },
  {
    id: 'shockwave',
    slot: 'kick',
    name: 'Shockwave Knees',
    maker: 'strix',
    tier: 2,
    tagline: 'A spike on the knee and a boom behind it.',
    stats: { kickPower: 0.12, moveSpeed: 0.03, agility: 0.04 },
    passive: { id: 'tailwind', name: 'Sonic Boom', value: 0.16, text: 'Kicks come out {v} faster.' },
    ability: 'flyingKnee',
    look: 17,
  },
];

/**
 * Parts from before the makers were reworked, and the part of the new maker that took over
 * each line (Bastion went to Longwei, Kestrel to Strix, Vulkan to Martelli, Halcyon to Lumen).
 * Saved bots, cloud saves and bots from other players are moved over with this.
 */
export const LEGACY_ITEMS: Record<string, string> = Object.fromEntries(
  (
    'sentinel:kabuto piston:kote leech:zen counter:lamellar strider:hakama snap:kama ' +
    'hawkeye:nighthawk peregrine:nighthawk rocket:sidewinder talon:sidewinder fusion:scramjet turbine:scramjet ' +
    'aero:wraith skyframe:wraith hopper:raptor swift:raptor whip:afterburner gale:afterburner ' +
    'oracle:vision seraph:vision thunder:touch arc:touch static:cell zenith:cell ' +
    'reactive:unibody lattice:unibody phantom:glide drift:glide comet:curve nova:curve ' +
    'bulwark:tianyan rampart:tianyan titan:jingang breaker:jingang aegis:qilin bunker:qilin ' +
    'juggernaut:greatwall citadel:greatwall anchor:longma pylon:longma sweeper:xuanfeng battering:xuanfeng ' +
    'berserker:centurione crucible:centurione brawler:colosseo anvil:colosseo overdrive:soledoro magma:soledoro ' +
    'plated:corazza foundry:corazza hydraulic:legionario steamhammer:legionario jet:spartano firebrand:spartano'
  )
    .split(' ')
    .map((p) => p.split(':')),
);

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
/** Parts in play (made at a tier up to MAX_RARITY). */
export const inPlay = (item: ItemDef) => item.tier <= MAX_RARITY;
/** The parts in play for a slot, maker by maker, Common first. */
export const itemsForSlot = (slot: Slot) => ITEMS.filter((i) => i.slot === slot && inPlay(i));
/** Every part matching a filter (all tiers, in play or not), in catalogue order. */
export const itemsOf = (f: { slot?: Slot; maker?: CompanyId; tier?: Rarity } = {}) =>
  ITEMS.filter((i) => (f.slot === undefined || i.slot === f.slot) && (f.maker === undefined || i.maker === f.maker) && (f.tier === undefined || i.tier === f.tier));
/** A part id from any version of the game: today's id, or the part that replaced an old one. */
export const currentItemId = (id: string): string | undefined => (ITEM_BY_ID.has(id) ? id : LEGACY_ITEMS[id]);

export interface Equipped {
  id: string;
  /** Always the item's own `tier` (kept so saves and online bots carry it explicitly). */
  rarity: Rarity;
}
/** A part as worn: its id and its own rarity. */
export const equip = (item: ItemDef): Equipped => ({ id: item.id, rarity: item.tier });
export type Loadout = Record<Slot, Equipped>;

export function scaledPassive(p: PassiveDef, rarity: Rarity): number {
  const m = RARITIES[rarity].mult;
  return p.inverse ? p.value / (1 + (m - 1) * 0.8) : p.value * m;
}

export function formatPassive(p: PassiveDef, rarity: Rarity): string {
  const v = scaledPassive(p, rarity);
  const s = p.flat ? (Math.round(v * 10) / 10).toString() : `${Math.round(v * 100)}%`;
  return p.text.replace('{v}', s);
}

/** Positive lines scale with rarity; negative trade-offs shrink with rarity. */
export function scaledStat(value: number, rarity: Rarity) {
  const m = RARITIES[rarity].mult;
  return value >= 0 ? value * m : value / m;
}

export function formatStatLine(key: StatKey, v: number): string {
  const sign = v >= 0 ? '+' : '−';
  const a = Math.abs(v);
  if (key === 'hp' || key === 'stamina') return `${sign}${Math.round(a)} ${STAT_LABEL[key]}`;
  if (key === 'reach') return `${sign}${Math.round(a * 100)}cm ${STAT_LABEL[key]}`;
  return `${sign}${Math.round(a * 100)}% ${STAT_LABEL[key]}`;
}

export interface PassiveInstance {
  id: PassiveId;
  value: number;
}

/** How many of a loadout's parts each maker made, and which of its set bonuses are on. */
export interface SetState {
  company: CompanyDef;
  count: number;
  /** Set bonuses earned (0, 1 or 2 of `company.sets`). */
  active: number;
}

/**
 * Colour a part's tile glows in: its rarity when tiers are in play, otherwise its maker's brand
 * colour (UI only).
 */
export function partTint(item: ItemDef) {
  return MAX_RARITY ? RARITIES[item.tier].color : COMPANY_BY_ID.get(item.maker)!.color;
}

export function setsOf(loadout: Loadout): SetState[] {
  const n = new Map<CompanyId, number>();
  for (const slot of SLOTS) {
    const item = ITEM_BY_ID.get(loadout[slot].id);
    if (item) n.set(item.maker, (n.get(item.maker) ?? 0) + 1);
  }
  return COMPANIES.filter((c) => n.has(c.id)).map((company) => {
    const count = n.get(company.id)!;
    return { company, count, active: company.sets.filter((b) => count >= b.at).length };
  });
}

export interface FighterBuild {
  stats: Stats;
  passives: Map<PassiveId, number>;
  fistAbility: MoveId;
  kickAbility: MoveId;
  loadout: Loadout;
  /** Extra durability (fraction) of the parts each slot armours, from its item and set bonuses. */
  tough: Record<Slot, number>;
  /** Makers in the loadout, most parts first. */
  sets: SetState[];
  /** Slots whose part is stalled: it needs a whole bot from its maker (diesel) and doesn't have one. */
  stalled: Slot[];
  /** Rough power rating for UI. */
  rating: number;
  /** Frame size (1 = standard): scales the whole body, its reach and how big a target it is. */
  size: number;
}

/** How far a frame can be built down or up from the standard size. */
export const SIZE_MIN = 0.8;
export const SIZE_MAX = 1.2;
/** Any size value made safe: within range, on 5% steps (exact on every device), 1 if missing. */
export function sanitizeSize(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, v)) * 20) / 20;
}

/**
 * What a frame size does to the stats, as fractions per unit of size away from 1 (power 1.0
 * at size 1.2 is +20% strike power, at 0.8 it is -20%). A big frame hits much harder (its
 * blows land ~1.5x as hard as a 0.8 frame's, and knock people down far more), has a bit more
 * HP and is hard to knock down, but is slow to move, to throw and to react, and is an easy
 * target; a small one is quick, sharp and accurate, lands far more shots and has to win on
 * volume. Reach and target size come from the body itself (the sim scales it): a giant
 * out-reaches and lands head shots from above, a small bot gets inside and works the body.
 * Tuned with mirrored sim fights (same loadouts, sizes swapped) so size matchups stay
 * roughly even.
 */
export const SIZE_EFFECT = {
  hp: 0.1,
  armor: 0,
  /**
   * Part durability. Small frames are compact (short levers, plates close to the frame),
   * so their parts hold together a little longer; a giant's head is up where every shot lands.
   */
  tough: -0.4,
  power: 1.0,
  stability: 1.2,
  moveSpeed: -1.0,
  agility: -1.4,
  punchSpeed: -1.0,
  reaction: -1.0,
  accuracy: -0.6,
  staminaRegen: -0.4,
};

/**
 * A bot's stats from its parts, its set bonuses and its frame size. `boost` adds stat lines on
 * top of the parts (the Android app's Gauntlet runs pick them up between fights), in the parts'
 * own units; it never changes the power rating.
 */
export function computeBuild(loadout: Loadout, size = 1, boost?: Partial<Record<StatKey, number>>): FighterBuild {
  const s: Stats = { ...BASE_STATS };
  const pct: Partial<Record<StatKey, number>> = {};
  const passives = new Map<PassiveId, number>();
  const tough = {} as Record<Slot, number>;
  let fistAbility: MoveId = 'haymaker';
  let kickAbility: MoveId = 'pushKick';
  let rating = 0;
  const addPassive = (id: PassiveId, v: number) => passives.set(id, (passives.get(id) ?? 0) + v);
  const sets = setsOf(loadout).sort((a, b) => b.count - a.count);
  const stalled: Slot[] = [];
  for (const slot of SLOTS) {
    const eq = loadout[slot];
    const item = ITEM_BY_ID.get(eq.id)!;
    tough[slot] = 0;
    // a diesel part on a bot that isn't all diesel just sits there: dead weight, no engine
    const co = COMPANY_BY_ID.get(item.maker)!;
    if (co.needsFull && sets.find((st) => st.company === co)!.count < SLOTS.length) {
      stalled.push(slot);
      rating += 30;
      continue;
    }
    // a part is made at one rarity, whatever the loadout says
    const r = item.tier;
    rating += 100 * RARITIES[r].mult;
    for (const [k, v] of Object.entries(item.stats) as [StatKey, number][]) {
      if (k === 'toughness') continue;
      pct[k] = (pct[k] ?? 0) + scaledStat(v, r);
    }
    if (item.stats.toughness) tough[slot] = scaledStat(item.stats.toughness, r);
    addPassive(item.passive.id, scaledPassive(item.passive, r));
    if (item.slot === 'fist' && item.ability) fistAbility = item.ability;
    if (item.slot === 'kick' && item.ability) kickAbility = item.ability;
  }
  // set bonuses: flat, whatever the rarity
  for (const st of sets)
    for (const bonus of st.company.sets.slice(0, st.active)) {
      rating += 20;
      for (const [k, v] of Object.entries(bonus.stats ?? {}) as [StatKey, number][]) {
        if (k === 'toughness') for (const slot of SLOTS) tough[slot] += v;
        else pct[k] = (pct[k] ?? 0) + v;
      }
      for (const [id, v] of bonus.passives ?? []) addPassive(id, v);
    }
  if (boost)
    for (const [k, v] of Object.entries(boost) as [StatKey, number][]) {
      if (k === 'toughness') for (const slot of SLOTS) tough[slot] += v;
      else pct[k] = (pct[k] ?? 0) + v;
    }
  s.maxHp += pct.hp ?? 0;
  s.armor = Math.min(0.4, s.armor + (pct.armor ?? 0));
  s.headGuard = Math.min(0.4, s.headGuard + (pct.headGuard ?? 0));
  s.punchPower *= 1 + (pct.punchPower ?? 0);
  s.punchSpeed *= 1 + (pct.punchSpeed ?? 0);
  s.reach += pct.reach ?? 0;
  s.kickPower *= 1 + (pct.kickPower ?? 0);
  s.moveSpeed *= 1 + (pct.moveSpeed ?? 0);
  s.agility *= 1 + (pct.agility ?? 0);
  s.stability *= 1 + (pct.stability ?? 0);
  s.reaction /= 1 + (pct.reaction ?? 0);
  s.accuracy = Math.min(0.97, s.accuracy + (pct.accuracy ?? 0));
  s.crit = Math.min(0.5, s.crit + (pct.crit ?? 0));
  s.stamina += pct.stamina ?? 0;
  s.staminaRegen *= 1 + (pct.staminaRegen ?? 0);
  size = sanitizeSize(size);
  const d = size - 1;
  if (d !== 0) {
    const E = SIZE_EFFECT;
    s.maxHp *= 1 + E.hp * d;
    s.armor = Math.max(0, Math.min(0.45, s.armor + E.armor * d));
    s.punchPower *= 1 + E.power * d;
    s.kickPower *= 1 + E.power * d;
    s.stability *= 1 + E.stability * d;
    s.moveSpeed *= 1 + E.moveSpeed * d;
    s.agility *= 1 + E.agility * d;
    s.punchSpeed *= 1 + E.punchSpeed * d;
    s.reaction /= 1 + E.reaction * d;
    s.accuracy = Math.min(0.97, s.accuracy + E.accuracy * d);
    s.staminaRegen *= 1 + E.staminaRegen * d;
    for (const slot of SLOTS) tough[slot] += E.tough * d;
  }
  return { stats: s, passives, fistAbility, kickAbility, loadout, tough, sets, stalled, rating: Math.round(rating), size };
}
