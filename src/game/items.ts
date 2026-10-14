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
 * Highest rarity in play. Rolls, saved bots and bots from other players are capped to it, and the
 * garage only offers tiers up to it. 0 = Common only for now; raise it to bring the better tiers
 * (their stats, colours and part looks are all still here) back.
 */
export const MAX_RARITY: Rarity = 0;
export const capRarity = (r: number): Rarity => Math.max(0, Math.min(MAX_RARITY, Math.floor(r))) as Rarity;

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
  name: string;
  tagline: string;
  stats: Partial<Record<StatKey, number>>;
  passive: PassiveDef;
  ability?: MoveId;
  /** Who makes it. */
  maker: CompanyId;
  /** Visual variant index used by the model builder. */
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
    look: 0,
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
    look: 1,
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
    look: 2,
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
    look: 3,
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
    look: 4,
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
    look: 5,
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
export const itemsForSlot = (slot: Slot) => ITEMS.filter((i) => i.slot === slot);
/** A part id from any version of the game: today's id, or the part that replaced an old one. */
export const currentItemId = (id: string): string | undefined => (ITEM_BY_ID.has(id) ? id : LEGACY_ITEMS[id]);

export interface Equipped {
  id: string;
  rarity: Rarity;
}
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
export function partTint(item: ItemDef, rarity: Rarity) {
  return MAX_RARITY ? RARITIES[rarity].color : COMPANY_BY_ID.get(item.maker)!.color;
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
 * What a frame size does to the stats, as fractions per unit of size away from 1 (hp 0.4
 * at size 1.2 is +8% HP). A big frame has more HP and armour, hits harder and is hard to
 * knock down, but is slow to move and to react; a small one is quick, sharp and accurate.
 * Reach and target size come from the body itself (the sim scales it): a giant out-reaches
 * and lands head shots from above, a small bot gets inside and works the body. Tuned with
 * mirrored sim fights so 0.8 vs 1.2 comes out roughly even.
 */
export const SIZE_EFFECT = {
  hp: 0.4,
  armor: 0.1,
  /**
   * Part durability. Small frames are compact (short levers, plates close to the frame),
   * so their parts hold together a little longer; a giant's head is up where every shot lands.
   */
  tough: -0.4,
  power: 0.25,
  stability: 1.2,
  moveSpeed: -0.8,
  agility: -1.4,
  punchSpeed: -0.8,
  reaction: -1.0,
  accuracy: -0.6,
  staminaRegen: -0.4,
};

export function computeBuild(loadout: Loadout, size = 1): FighterBuild {
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
    rating += 100 * RARITIES[eq.rarity].mult;
    for (const [k, v] of Object.entries(item.stats) as [StatKey, number][]) {
      if (k === 'toughness') continue;
      pct[k] = (pct[k] ?? 0) + scaledStat(v, eq.rarity);
    }
    if (item.stats.toughness) tough[slot] = scaledStat(item.stats.toughness, eq.rarity);
    addPassive(item.passive.id, scaledPassive(item.passive, eq.rarity));
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
