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
  | 'iaido';

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
export type CompanyId = 'bastion' | 'kestrel' | 'vulkan' | 'halcyon' | 'kensei';

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
  motto: string;
  /** What the maker's parts are good at, in a few words. */
  focus: string;
  /** Brand colour (CSS). */
  color: string;
  sets: [SetBonus, SetBonus];
}

/**
 * The five robot makers. Every part comes from one of them, and each builds to its own idea of a
 * fighter: you can see it in the shapes (Bastion bolts slabs on, Kestrel sweeps them back, Vulkan
 * leaves the pistons out, Halcyon lights everything up, Kensei laces plates together) and feel it
 * in the stats. Wearing three or six parts from one maker unlocks its set bonus.
 */
export const COMPANIES: CompanyDef[] = [
  {
    id: 'bastion',
    name: 'Bastion Heavy Industries',
    short: 'Bastion',
    motto: 'Built like a bunker.',
    focus: 'Armour and staying power',
    color: '#ffb020',
    sets: [
      { at: 3, stats: { hp: 80, armor: 0.03 }, text: '+80 Health, +3% Armor' },
      { at: 6, stats: { toughness: 0.15 }, passives: [['unstoppable', 0.15]], text: '+15% Durability, hit-stun 15% shorter' },
    ],
  },
  {
    id: 'kestrel',
    name: 'Kestrel Dynamics',
    short: 'Kestrel',
    motto: 'Gone before you swing.',
    focus: 'Speed and footwork',
    color: '#46d5ff',
    sets: [
      { at: 3, stats: { moveSpeed: 0.05, agility: 0.05 }, text: '+5% Move Speed, +5% Agility' },
      { at: 6, stats: { punchSpeed: 0.06, reaction: 0.1 }, text: '+6% Punch Speed, +10% Reflexes' },
    ],
  },
  {
    id: 'vulkan',
    name: 'Vulkan Forgeworks',
    short: 'Vulkan',
    motto: 'Forged to hit.',
    focus: 'Raw striking power',
    color: '#ff6a2a',
    sets: [
      { at: 3, stats: { punchPower: 0.05, kickPower: 0.05 }, text: '+5% Punch and Kick Power' },
      { at: 6, passives: [['heavyStrike', 0.15], ['furnace', 0.02]], text: 'Power strikes break poise 15% faster, and every clean hit in a row adds 2% damage' },
    ],
  },
  {
    id: 'halcyon',
    name: 'Halcyon Voltaics',
    short: 'Halcyon',
    motto: 'Power that never runs dry.',
    focus: 'Energy, shields and self-repair',
    color: '#a98bff',
    sets: [
      { at: 3, stats: { staminaRegen: 0.15, stamina: 10 }, text: '+15% Stamina Regen, +10 Stamina' },
      { at: 6, passives: [['nanoRepair', 3]], text: 'Self-repair: +3 health a second after 3s untouched' },
    ],
  },
  {
    id: 'kensei',
    name: 'Kensei Precision',
    short: 'Kensei',
    motto: 'One clean cut.',
    focus: 'Precision and counters',
    color: '#ff3d5e',
    sets: [
      { at: 3, stats: { accuracy: 0.06, crit: 0.04 }, text: '+6% Accuracy, +4% Crit Chance' },
      { at: 6, stats: { punchPower: 0.05 }, passives: [['retaliate', 0.15], ['iaido', 0.15]], text: '+5% Punch Power; counter hits and the first strike after a pause deal 15% more' },
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
  // ---------------- HEAD ----------------
  {
    id: 'sentinel',
    slot: 'head',
    name: 'Sentinel Visor',
    maker: 'kensei',
    tagline: 'Balanced sensor suite with a calm mind.',
    stats: { reaction: 0.1, accuracy: 0.05, hp: 40 },
    passive: { id: 'composure', name: 'Composure', value: 0.25, text: 'Gets up {v} faster after knockdowns.' },
    look: 0,
  },
  {
    id: 'hawkeye',
    slot: 'head',
    name: 'Hawkeye Optic',
    maker: 'kestrel',
    tagline: 'Precision targeting finds the gaps.',
    stats: { accuracy: 0.12, crit: 0.05 },
    passive: { id: 'weakSpot', name: 'Weak Spot', value: 0.3, text: 'Critical hits deal {v} extra damage.' },
    look: 1,
  },
  {
    id: 'oracle',
    slot: 'head',
    name: 'Oracle Dome',
    maker: 'halcyon',
    tagline: 'Sees punches before they are thrown.',
    stats: { reaction: 0.22, accuracy: 0.02 },
    passive: { id: 'precog', name: 'Precog', value: 0.14, text: '{v} chance to read an attack the instant it starts.' },
    look: 2,
  },
  {
    id: 'bulwark',
    slot: 'head',
    name: 'Bulwark Helm',
    maker: 'bastion',
    tagline: 'Heavy plating for a granite chin.',
    stats: { hp: 90, headGuard: 0.1, stability: 0.06 },
    passive: { id: 'ironChin', name: 'Iron Chin', value: 0.12, text: 'Takes {v} less damage to the head.' },
    look: 3,
  },
  {
    id: 'berserker',
    slot: 'head',
    name: 'Berserker Crest',
    maker: 'vulkan',
    tagline: 'Every hit taken fuels the fire.',
    stats: { crit: 0.04, punchPower: 0.05 },
    passive: { id: 'rage', name: 'Rage', value: 0.04, text: '+{v} damage per hit taken (stacks 5x).' },
    look: 4,
  },
  // ---------------- FIST ----------------
  {
    id: 'brawler',
    slot: 'fist',
    name: 'Brawler Knuckles',
    maker: 'vulkan',
    tagline: 'Honest iron for honest violence.',
    stats: { punchPower: 0.08, punchSpeed: 0.04 },
    passive: { id: 'heavyStrike', name: 'Heavy Hands', value: 0.1, text: 'Power punches break poise {v} faster.' },
    ability: 'haymaker',
    look: 0,
  },
  {
    id: 'piston',
    slot: 'fist',
    name: 'Piston Jabbers',
    maker: 'kensei',
    tagline: 'Pneumatic speed, relentless volume.',
    stats: { punchSpeed: 0.14, punchPower: -0.04 },
    passive: { id: 'whiplash', name: 'Whiplash', value: 0.12, text: 'Combo punches are {v} faster.' },
    ability: 'flurry',
    look: 1,
  },
  {
    id: 'thunder',
    slot: 'fist',
    name: 'Thunder Gauntlets',
    maker: 'halcyon',
    tagline: 'Capacitors charged for a jolt.',
    stats: { punchPower: 0.06, punchSpeed: 0.06 },
    passive: { id: 'heavyStrike', name: 'Conductive', value: 0.08, text: 'Power punches break poise {v} faster.' },
    ability: 'shockUpper',
    look: 2,
  },
  {
    id: 'rocket',
    slot: 'fist',
    name: 'Rocket Fists',
    maker: 'kestrel',
    tagline: 'Telescoping forearms with boosters.',
    stats: { reach: 0.08, punchPower: 0.04 },
    passive: { id: 'afterburner', name: 'Afterburner', value: 0.1, text: 'Straight punches deal {v} more damage.' },
    ability: 'rocketPunch',
    look: 3,
  },
  {
    id: 'titan',
    slot: 'fist',
    name: 'Titan Hammers',
    maker: 'bastion',
    tagline: 'Slow. Enormous. Final.',
    stats: { punchPower: 0.18, punchSpeed: -0.08 },
    passive: { id: 'heavyStrike', name: 'Crusher', value: 0.18, text: 'Power punches break poise {v} faster.' },
    ability: 'hammer',
    look: 4,
  },
  // ---------------- CORE ----------------
  {
    id: 'fusion',
    slot: 'core',
    name: 'Fusion Core',
    maker: 'kestrel',
    tagline: 'Endless clean energy.',
    stats: { staminaRegen: 0.18, stamina: 10 },
    passive: { id: 'secondWind', name: 'Second Wind', value: 0.5, text: 'Stamina regen +{v} when below 30%.' },
    look: 0,
  },
  {
    id: 'overdrive',
    slot: 'core',
    name: 'Overdrive Core',
    maker: 'vulkan',
    tagline: 'Redlines when the fight turns ugly.',
    stats: { punchPower: 0.03 },
    passive: { id: 'overdrive', name: 'Overdrive', value: 0.18, text: 'Below 35% health: +{v} speed and damage.' },
    look: 1,
  },
  {
    id: 'aegis',
    slot: 'core',
    name: 'Aegis Core',
    maker: 'bastion',
    tagline: 'A hard-light barrier on a timer.',
    stats: { hp: 30 },
    passive: { id: 'aegis', name: 'Aegis Shield', value: 13, text: 'Every {v}s a shield absorbs the next hit.', flat: true, inverse: true },
    look: 2,
  },
  {
    id: 'leech',
    slot: 'core',
    name: 'Leech Core',
    maker: 'kensei',
    tagline: 'Drinks the sparks of its enemies.',
    stats: { hp: 20 },
    passive: { id: 'siphon', name: 'Siphon', value: 0.12, text: 'Heals {v} of damage dealt.' },
    look: 3,
  },
  {
    id: 'static',
    slot: 'core',
    name: 'Static Core',
    maker: 'halcyon',
    tagline: 'Touch it and regret it.',
    stats: { armor: 0.03 },
    passive: { id: 'static', name: 'Static Charge', value: 14, text: 'Attackers that land a hit take {v} shock damage.', flat: true },
    look: 4,
  },
  // ---------------- CHEST ----------------
  {
    id: 'plated',
    slot: 'chest',
    name: 'Plated Torso',
    maker: 'vulkan',
    tagline: 'Layered steel, no surprises.',
    stats: { hp: 120, armor: 0.07 },
    passive: { id: 'plating', name: 'Deflection', value: 0.35, text: 'Blocked hits deal {v} less chip damage.' },
    look: 0,
  },
  {
    id: 'reactive',
    slot: 'chest',
    name: 'Reactive Frame',
    maker: 'halcyon',
    tagline: 'Blocks feed the machine.',
    stats: { hp: 60, armor: 0.05 },
    passive: { id: 'reactiveGuard', name: 'Reactive Guard', value: 6, text: 'Blocking restores {v} stamina.', flat: true },
    look: 1,
  },
  {
    id: 'juggernaut',
    slot: 'chest',
    name: 'Juggernaut Hull',
    maker: 'bastion',
    tagline: 'A walking bank vault.',
    stats: { hp: 220, armor: 0.05, stability: 0.18, moveSpeed: -0.06 },
    passive: { id: 'unstoppable', name: 'Unstoppable', value: 0.25, text: 'Hit-stun is {v} shorter.' },
    look: 2,
    bulky: true,
  },
  {
    id: 'aero',
    slot: 'chest',
    name: 'Aero Shell',
    maker: 'kestrel',
    tagline: 'Light alloy, built to move.',
    stats: { hp: 40, punchSpeed: 0.05, moveSpeed: 0.06, agility: 0.06 },
    passive: { id: 'slipstream', name: 'Slipstream', value: 0.5, text: 'Dodges cost {v} less stamina.' },
    look: 3,
  },
  {
    id: 'counter',
    slot: 'chest',
    name: 'Counter Plate',
    maker: 'kensei',
    tagline: 'Built for the exchange.',
    stats: { hp: 80, armor: 0.04 },
    passive: { id: 'retaliate', name: 'Retaliate', value: 0.18, text: 'Counter hits deal {v} more damage.' },
    look: 4,
  },
  // ---------------- LEGS ----------------
  {
    id: 'strider',
    slot: 'legs',
    name: 'Strider Legs',
    maker: 'kensei',
    tagline: 'Dependable all-terrain stride.',
    stats: { moveSpeed: 0.07, agility: 0.07, stability: 0.07 },
    passive: { id: 'footwork', name: 'Footwork', value: 0.06, text: '+{v} movement speed while circling.' },
    look: 0,
  },
  {
    id: 'hopper',
    slot: 'legs',
    name: 'Hopper Struts',
    maker: 'kestrel',
    tagline: 'Spring-loaded and twitchy.',
    stats: { moveSpeed: 0.15, agility: 0.16, stability: -0.08 },
    passive: { id: 'lightFeet', name: 'Light Feet', value: 0.15, text: 'Dodges are {v} quicker.' },
    look: 1,
  },
  {
    id: 'anchor',
    slot: 'legs',
    name: 'Anchor Pillars',
    maker: 'bastion',
    tagline: 'Plant. Never fall.',
    stats: { stability: 0.28, moveSpeed: -0.06, hp: 40 },
    passive: { id: 'rooted', name: 'Rooted', value: 0.3, text: 'Knockback reduced by {v}.' },
    look: 2,
  },
  {
    id: 'hydraulic',
    slot: 'legs',
    name: 'Hydraulic Legs',
    maker: 'vulkan',
    tagline: 'Pressure lines straight to the hips.',
    stats: { kickPower: 0.14, moveSpeed: 0.04, stability: 0.05 },
    passive: { id: 'pistonDrive', name: 'Piston Drive', value: 0.2, text: 'Lunging attacks travel {v} farther.' },
    look: 3,
    rams: true,
  },
  {
    id: 'phantom',
    slot: 'legs',
    name: 'Phantom Stride',
    maker: 'halcyon',
    tagline: 'There, then not there.',
    stats: { agility: 0.22, moveSpeed: 0.09 },
    passive: { id: 'afterimage', name: 'Afterimage', value: 0.25, text: 'After a dodge, the next hit deals +{v}.' },
    look: 4,
  },
  // ---------------- KICK ----------------
  {
    id: 'snap',
    slot: 'kick',
    name: 'Snap Boots',
    maker: 'kensei',
    tagline: 'A teep that ends arguments.',
    stats: { kickPower: 0.06, stability: 0.04 },
    passive: { id: 'trip', name: 'Shove', value: 0.25, text: 'Kick knockback +{v}.' },
    ability: 'pushKick',
    look: 0,
  },
  {
    id: 'whip',
    slot: 'kick',
    name: 'Whip Shins',
    maker: 'kestrel',
    tagline: 'Head-height, out of nowhere.',
    stats: { kickPower: 0.1 },
    passive: { id: 'heavyStrike', name: 'Whip Crack', value: 0.12, text: 'Power strikes break poise {v} faster.' },
    ability: 'roundhouse',
    look: 1,
  },
  {
    id: 'sweeper',
    slot: 'kick',
    name: 'Sweeper Greaves',
    maker: 'bastion',
    tagline: 'Takes the floor out from under you.',
    stats: { kickPower: 0.06, agility: 0.04 },
    passive: { id: 'trip', name: 'Trip Wire', value: 0.25, text: 'Sweeps are {v} more likely to drop.' },
    ability: 'sweep',
    look: 2,
  },
  {
    id: 'comet',
    slot: 'kick',
    name: 'Comet Heels',
    maker: 'halcyon',
    tagline: 'A full turn of pure momentum.',
    stats: { kickPower: 0.12, stability: -0.03 },
    passive: { id: 'meteor', name: 'Meteor', value: 0.15, text: 'Spinning strikes deal {v} more damage.' },
    ability: 'spinKick',
    look: 3,
  },
  {
    id: 'jet',
    slot: 'kick',
    name: 'Jet Knees',
    maker: 'vulkan',
    tagline: 'Thrusters for closing distance.',
    stats: { kickPower: 0.08, moveSpeed: 0.03 },
    passive: { id: 'pistonDrive', name: 'Jet Assist', value: 0.2, text: 'Lunging attacks travel {v} farther.' },
    ability: 'flyingKnee',
    look: 4,
  },
  // ======================================================= THE NEW LINES
  // Each maker's signature range, one part per slot. Look 5 + the maker's index picks the model.

  // ---------------- BASTION HEAVY INDUSTRIES: slabs, rivets, hazard stripes ----------------
  {
    id: 'rampart',
    slot: 'head',
    name: 'Rampart Helm',
    maker: 'bastion',
    tagline: 'A pillbox with a viewing slit.',
    stats: { hp: 110, headGuard: 0.12, stability: 0.05, reaction: -0.06 },
    passive: { id: 'ironChin', name: 'Blast Visor', value: 0.1, text: 'Takes {v} less damage to the head.' },
    look: 5,
  },
  {
    id: 'breaker',
    slot: 'fist',
    name: 'Breaker Mauls',
    maker: 'bastion',
    tagline: 'Demolition-grade knuckles.',
    stats: { punchPower: 0.12, stability: 0.06, toughness: 0.2, punchSpeed: -0.07 },
    passive: { id: 'heavyStrike', name: 'Wrecking Weight', value: 0.14, text: 'Power punches break poise {v} faster.' },
    ability: 'hammer',
    look: 5,
  },
  {
    id: 'bunker',
    slot: 'core',
    name: 'Bunker Core',
    maker: 'bastion',
    tagline: 'An armoured heart behind a blast shutter.',
    stats: { hp: 60, armor: 0.03, staminaRegen: -0.05 },
    passive: { id: 'bulwark', name: 'Blast Shield', value: 0.12, text: 'Body hits deal {v} less damage.' },
    look: 5,
  },
  {
    id: 'citadel',
    slot: 'chest',
    name: 'Citadel Hull',
    maker: 'bastion',
    tagline: 'Twelve tons of opinion.',
    stats: { hp: 180, armor: 0.07, toughness: 0.25, moveSpeed: -0.07, agility: -0.05 },
    passive: { id: 'unstoppable', name: 'Immovable', value: 0.2, text: 'Hit-stun is {v} shorter.' },
    look: 5,
    bulky: true,
  },
  {
    id: 'pylon',
    slot: 'legs',
    name: 'Pylon Legs',
    maker: 'bastion',
    tagline: 'Driven into the floor like piles.',
    stats: { stability: 0.24, hp: 50, toughness: 0.25, moveSpeed: -0.06 },
    passive: { id: 'rooted', name: 'Pile Driver', value: 0.25, text: 'Knockback reduced by {v}.' },
    look: 5,
    rams: true,
  },
  {
    id: 'battering',
    slot: 'kick',
    name: 'Battering Boots',
    maker: 'bastion',
    tagline: 'Opens doors. And robots.',
    stats: { kickPower: 0.1, stability: 0.06, toughness: 0.2 },
    passive: { id: 'trip', name: 'Ram', value: 0.3, text: 'Kick knockback +{v}.' },
    ability: 'pushKick',
    look: 5,
  },
  // ---------------- KESTREL DYNAMICS: swept fins, slim shells, intakes ----------------
  {
    id: 'peregrine',
    slot: 'head',
    name: 'Peregrine Canopy',
    maker: 'kestrel',
    tagline: 'A cockpit with a hooked beak.',
    stats: { reaction: 0.16, agility: 0.06, toughness: -0.1 },
    passive: { id: 'precog', name: 'Raptor Eye', value: 0.1, text: '{v} chance to read an attack the instant it starts.' },
    look: 6,
  },
  {
    id: 'talon',
    slot: 'fist',
    name: 'Talon Strikers',
    maker: 'kestrel',
    tagline: 'Three hits before the first one lands.',
    stats: { punchSpeed: 0.16, accuracy: 0.04, punchPower: -0.02, toughness: -0.1 },
    passive: { id: 'whiplash', name: 'Wingbeat', value: 0.12, text: 'Combo punches are {v} faster.' },
    ability: 'flurry',
    look: 6,
  },
  {
    id: 'turbine',
    slot: 'core',
    name: 'Turbine Core',
    maker: 'kestrel',
    tagline: 'Spins up, never winds down.',
    stats: { staminaRegen: 0.12, moveSpeed: 0.04 },
    passive: { id: 'slipstream', name: 'Bypass Flow', value: 0.4, text: 'Dodges cost {v} less stamina.' },
    look: 6,
  },
  {
    id: 'skyframe',
    slot: 'chest',
    name: 'Skyframe Shell',
    maker: 'kestrel',
    tagline: 'Carbon ribs and not much else.',
    stats: { hp: 50, moveSpeed: 0.08, agility: 0.08, punchSpeed: 0.05, toughness: -0.1 },
    passive: { id: 'lightFeet', name: 'Airframe', value: 0.12, text: 'Dodges are {v} quicker.' },
    look: 6,
  },
  {
    id: 'swift',
    slot: 'legs',
    name: 'Swift Runners',
    maker: 'kestrel',
    tagline: 'Built for the long way round.',
    stats: { moveSpeed: 0.14, agility: 0.12, stability: -0.06, toughness: -0.1 },
    passive: { id: 'footwork', name: 'Crosswind', value: 0.1, text: '+{v} movement speed while circling.' },
    look: 6,
  },
  {
    id: 'gale',
    slot: 'kick',
    name: 'Gale Blades',
    maker: 'kestrel',
    tagline: 'You hear it after it lands.',
    stats: { kickPower: 0.09, agility: 0.05 },
    passive: { id: 'tailwind', name: 'Tailwind', value: 0.15, text: 'Kicks come out {v} faster.' },
    ability: 'roundhouse',
    look: 6,
  },
  // ---------------- VULKAN FORGEWORKS: open pistons, cooling fins, furnace glow ----------------
  {
    id: 'crucible',
    slot: 'head',
    name: 'Crucible Mask',
    maker: 'vulkan',
    tagline: 'Stares like an open furnace.',
    stats: { punchPower: 0.03, crit: 0.04, hp: 30 },
    passive: { id: 'weakSpot', name: "Smelter's Eye", value: 0.25, text: 'Critical hits deal {v} extra damage.' },
    look: 7,
  },
  {
    id: 'anvil',
    slot: 'fist',
    name: 'Anvil Breakers',
    maker: 'vulkan',
    tagline: 'Forged hot, swung hotter.',
    stats: { punchPower: 0.12, crit: 0.02, punchSpeed: -0.07 },
    passive: { id: 'furnace', name: 'Furnace', value: 0.04, text: '+{v} damage for each clean hit in a row (up to 5). Getting hit cools it.' },
    ability: 'haymaker',
    look: 7,
  },
  {
    id: 'magma',
    slot: 'core',
    name: 'Magma Core',
    maker: 'vulkan',
    tagline: 'Runs hot. Hits hotter.',
    stats: { punchPower: 0.04, kickPower: 0.04, staminaRegen: -0.08 },
    passive: { id: 'shatter', name: 'Slag Edge', value: 0.2, text: 'Strikes wear down parts {v} faster.' },
    look: 7,
  },
  {
    id: 'foundry',
    slot: 'chest',
    name: 'Foundry Plate',
    maker: 'vulkan',
    tagline: 'Cast in a single pour.',
    stats: { hp: 90, armor: 0.03, punchPower: 0.03, moveSpeed: -0.04 },
    passive: { id: 'heavyStrike', name: 'Cast Iron', value: 0.12, text: 'Power strikes break poise {v} faster.' },
    look: 7,
  },
  {
    id: 'steamhammer',
    slot: 'legs',
    name: 'Steamhammer Legs',
    maker: 'vulkan',
    tagline: 'Every step a stamp.',
    stats: { kickPower: 0.13, stability: 0.08, moveSpeed: -0.04 },
    passive: { id: 'pistonDrive', name: 'Steam Drive', value: 0.2, text: 'Lunging attacks travel {v} farther.' },
    look: 7,
    rams: true,
  },
  {
    id: 'firebrand',
    slot: 'kick',
    name: 'Firebrand Greaves',
    maker: 'vulkan',
    tagline: 'Leaves scorch marks at head height.',
    stats: { kickPower: 0.1, crit: 0.03, stability: -0.04 },
    passive: { id: 'meteor', name: 'Ember Spin', value: 0.15, text: 'Spinning strikes deal {v} more damage.' },
    ability: 'spinKick',
    look: 7,
  },
  // ---------------- HALCYON VOLTAICS: smooth shells, halos, hex light ----------------
  {
    id: 'seraph',
    slot: 'head',
    name: 'Seraph Halo',
    maker: 'halcyon',
    tagline: 'A calm mind under a ring of light.',
    stats: { reaction: 0.14, stamina: 10, accuracy: 0.03 },
    passive: { id: 'composure', name: 'Reboot', value: 0.3, text: 'Gets up {v} faster after knockdowns.' },
    look: 8,
  },
  {
    id: 'arc',
    slot: 'fist',
    name: 'Arc Emitters',
    maker: 'halcyon',
    tagline: 'Plasma knuckles, cold to the touch.',
    stats: { punchPower: 0.06, punchSpeed: 0.06, staminaRegen: 0.06 },
    passive: { id: 'siphon', name: 'Drain Field', value: 0.08, text: 'Heals {v} of damage dealt.' },
    ability: 'shockUpper',
    look: 8,
  },
  {
    id: 'zenith',
    slot: 'core',
    name: 'Zenith Cell',
    maker: 'halcyon',
    tagline: 'A small star in a gimbal.',
    stats: { staminaRegen: 0.12, hp: 30 },
    passive: { id: 'nanoRepair', name: 'Nanite Bloom', value: 5, text: 'Repairs {v} health a second after 3s without being hit.', flat: true },
    look: 8,
  },
  {
    id: 'lattice',
    slot: 'chest',
    name: 'Lattice Frame',
    maker: 'halcyon',
    tagline: 'Hard-light hex plating.',
    stats: { hp: 80, armor: 0.05, stamina: 10 },
    passive: { id: 'static', name: 'Charged Lattice', value: 10, text: 'Attackers that land a hit take {v} shock damage.', flat: true },
    look: 8,
  },
  {
    id: 'drift',
    slot: 'legs',
    name: 'Drift Glides',
    maker: 'halcyon',
    tagline: 'Hover jets in the heels.',
    stats: { agility: 0.14, moveSpeed: 0.07, staminaRegen: 0.05 },
    passive: { id: 'afterimage', name: 'Phase Step', value: 0.2, text: 'After a dodge, the next hit deals +{v}.' },
    look: 8,
  },
  {
    id: 'nova',
    slot: 'kick',
    name: 'Nova Spurs',
    maker: 'halcyon',
    tagline: 'Lands with a flash.',
    stats: { kickPower: 0.08, reaction: 0.05 },
    passive: { id: 'secondWind', name: 'Flash Charge', value: 0.4, text: 'Stamina regen +{v} when below 30%.' },
    ability: 'flyingKnee',
    look: 8,
  },
  // ---------------- KENSEI PRECISION: laced lamellar, crests, clean edges ----------------
  {
    id: 'kabuto',
    slot: 'head',
    name: 'Kabuto Helm',
    maker: 'kensei',
    tagline: 'A crescent crest and a patient stare.',
    stats: { accuracy: 0.08, reaction: 0.08, crit: 0.03, hp: 40 },
    passive: { id: 'iaido', name: 'Iaido', value: 0.25, text: 'The first strike after 2s without attacking deals +{v}.' },
    look: 9,
  },
  {
    id: 'kote',
    slot: 'fist',
    name: 'Kote Gauntlets',
    maker: 'kensei',
    tagline: 'Lacquered splints for a clean thrust.',
    stats: { accuracy: 0.07, punchPower: 0.1, crit: 0.05 },
    passive: { id: 'retaliate', name: 'Counter Cut', value: 0.15, text: 'Counter hits deal {v} more damage.' },
    ability: 'rocketPunch',
    look: 9,
  },
  {
    id: 'zen',
    slot: 'core',
    name: 'Zen Core',
    maker: 'kensei',
    tagline: 'Breathe. Then strike.',
    stats: { reaction: 0.08, staminaRegen: 0.08, punchPower: 0.03 },
    passive: { id: 'precog', name: 'Mushin', value: 0.1, text: '{v} chance to read an attack the instant it starts.' },
    look: 9,
  },
  {
    id: 'lamellar',
    slot: 'chest',
    name: 'Lamellar Do',
    maker: 'kensei',
    tagline: 'A hundred plates, each laced by hand.',
    stats: { hp: 120, armor: 0.06, agility: 0.04 },
    passive: { id: 'plating', name: 'Laced Plates', value: 0.3, text: 'Blocked hits deal {v} less chip damage.' },
    look: 9,
  },
  {
    id: 'hakama',
    slot: 'legs',
    name: 'Hakama Legs',
    maker: 'kensei',
    tagline: 'Low stance, long reach.',
    stats: { agility: 0.1, stability: 0.1, kickPower: 0.07 },
    passive: { id: 'lightFeet', name: 'Suriashi', value: 0.12, text: 'Dodges are {v} quicker.' },
    look: 9,
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
    look: 9,
  },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemsForSlot = (slot: Slot) => ITEMS.filter((i) => i.slot === slot);

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
 * What a frame size does to the stats, as fractions per unit of size away from 1 (hp 0.45
 * at size 1.2 is +9% HP). A big frame has more HP and armour, hits harder and is hard to
 * knock down, but is slow to move and to react; a small one is quick, sharp and accurate.
 * Reach and target size come from the body itself (the sim scales it): a giant out-reaches
 * and lands head shots from above, a small bot gets inside and works the body. Tuned with
 * mirrored sim fights so 0.8 vs 1.2 comes out roughly even.
 */
export const SIZE_EFFECT = {
  hp: 0.45,
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
  for (const slot of SLOTS) {
    const eq = loadout[slot];
    const item = ITEM_BY_ID.get(eq.id)!;
    rating += 100 * RARITIES[eq.rarity].mult;
    for (const [k, v] of Object.entries(item.stats) as [StatKey, number][]) {
      if (k === 'toughness') continue;
      pct[k] = (pct[k] ?? 0) + scaledStat(v, eq.rarity);
    }
    tough[slot] = item.stats.toughness ? scaledStat(item.stats.toughness, eq.rarity) : 0;
    addPassive(item.passive.id, scaledPassive(item.passive, eq.rarity));
    if (item.slot === 'fist' && item.ability) fistAbility = item.ability;
    if (item.slot === 'kick' && item.ability) kickAbility = item.ability;
  }
  // set bonuses: flat, whatever the rarity
  const sets = setsOf(loadout).sort((a, b) => b.count - a.count);
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
  return { stats: s, passives, fistAbility, kickAbility, loadout, tough, sets, rating: Math.round(rating), size };
}
