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
  | 'staminaRegen';

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
  | 'afterburner';

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

export interface ItemDef {
  id: string;
  slot: Slot;
  name: string;
  tagline: string;
  stats: Partial<Record<StatKey, number>>;
  passive: PassiveDef;
  ability?: MoveId;
  /** Visual variant index used by the model builder. */
  look: number;
}

export const ITEMS: ItemDef[] = [
  // ---------------- HEAD ----------------
  {
    id: 'sentinel',
    slot: 'head',
    name: 'Sentinel Visor',
    tagline: 'Balanced sensor suite with a calm mind.',
    stats: { reaction: 0.1, accuracy: 0.05, hp: 40 },
    passive: { id: 'composure', name: 'Composure', value: 0.25, text: 'Gets up {v} faster after knockdowns.' },
    look: 0,
  },
  {
    id: 'hawkeye',
    slot: 'head',
    name: 'Hawkeye Optic',
    tagline: 'Precision targeting finds the gaps.',
    stats: { accuracy: 0.12, crit: 0.05 },
    passive: { id: 'weakSpot', name: 'Weak Spot', value: 0.3, text: 'Critical hits deal {v} extra damage.' },
    look: 1,
  },
  {
    id: 'oracle',
    slot: 'head',
    name: 'Oracle Dome',
    tagline: 'Sees punches before they are thrown.',
    stats: { reaction: 0.22, accuracy: 0.02 },
    passive: { id: 'precog', name: 'Precog', value: 0.14, text: '{v} chance to read an attack the instant it starts.' },
    look: 2,
  },
  {
    id: 'bulwark',
    slot: 'head',
    name: 'Bulwark Helm',
    tagline: 'Heavy plating for a granite chin.',
    stats: { hp: 90, headGuard: 0.1, stability: 0.06 },
    passive: { id: 'ironChin', name: 'Iron Chin', value: 0.12, text: 'Takes {v} less damage to the head.' },
    look: 3,
  },
  {
    id: 'berserker',
    slot: 'head',
    name: 'Berserker Crest',
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
    tagline: 'Endless clean energy.',
    stats: { staminaRegen: 0.18, stamina: 10 },
    passive: { id: 'secondWind', name: 'Second Wind', value: 0.5, text: 'Stamina regen +{v} when below 30%.' },
    look: 0,
  },
  {
    id: 'overdrive',
    slot: 'core',
    name: 'Overdrive Core',
    tagline: 'Redlines when the fight turns ugly.',
    stats: { punchPower: 0.03 },
    passive: { id: 'overdrive', name: 'Overdrive', value: 0.18, text: 'Below 35% health: +{v} speed and damage.' },
    look: 1,
  },
  {
    id: 'aegis',
    slot: 'core',
    name: 'Aegis Core',
    tagline: 'A hard-light barrier on a timer.',
    stats: { hp: 30 },
    passive: { id: 'aegis', name: 'Aegis Shield', value: 13, text: 'Every {v}s a shield absorbs the next hit.', flat: true, inverse: true },
    look: 2,
  },
  {
    id: 'leech',
    slot: 'core',
    name: 'Leech Core',
    tagline: 'Drinks the sparks of its enemies.',
    stats: { hp: 20 },
    passive: { id: 'siphon', name: 'Siphon', value: 0.12, text: 'Heals {v} of damage dealt.' },
    look: 3,
  },
  {
    id: 'static',
    slot: 'core',
    name: 'Static Core',
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
    tagline: 'Layered steel, no surprises.',
    stats: { hp: 120, armor: 0.07 },
    passive: { id: 'plating', name: 'Deflection', value: 0.35, text: 'Blocked hits deal {v} less chip damage.' },
    look: 0,
  },
  {
    id: 'reactive',
    slot: 'chest',
    name: 'Reactive Frame',
    tagline: 'Blocks feed the machine.',
    stats: { hp: 60, armor: 0.05 },
    passive: { id: 'reactiveGuard', name: 'Reactive Guard', value: 6, text: 'Blocking restores {v} stamina.', flat: true },
    look: 1,
  },
  {
    id: 'juggernaut',
    slot: 'chest',
    name: 'Juggernaut Hull',
    tagline: 'A walking bank vault.',
    stats: { hp: 220, armor: 0.05, stability: 0.18, moveSpeed: -0.06 },
    passive: { id: 'unstoppable', name: 'Unstoppable', value: 0.25, text: 'Hit-stun is {v} shorter.' },
    look: 2,
  },
  {
    id: 'aero',
    slot: 'chest',
    name: 'Aero Shell',
    tagline: 'Light alloy, built to move.',
    stats: { hp: 40, punchSpeed: 0.05, moveSpeed: 0.06, agility: 0.06 },
    passive: { id: 'slipstream', name: 'Slipstream', value: 0.5, text: 'Dodges cost {v} less stamina.' },
    look: 3,
  },
  {
    id: 'counter',
    slot: 'chest',
    name: 'Counter Plate',
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
    tagline: 'Dependable all-terrain stride.',
    stats: { moveSpeed: 0.07, agility: 0.07, stability: 0.07 },
    passive: { id: 'footwork', name: 'Footwork', value: 0.06, text: '+{v} movement speed while circling.' },
    look: 0,
  },
  {
    id: 'hopper',
    slot: 'legs',
    name: 'Hopper Struts',
    tagline: 'Spring-loaded and twitchy.',
    stats: { moveSpeed: 0.15, agility: 0.16, stability: -0.08 },
    passive: { id: 'lightFeet', name: 'Light Feet', value: 0.15, text: 'Dodges are {v} quicker.' },
    look: 1,
  },
  {
    id: 'anchor',
    slot: 'legs',
    name: 'Anchor Pillars',
    tagline: 'Plant. Never fall.',
    stats: { stability: 0.28, moveSpeed: -0.06, hp: 40 },
    passive: { id: 'rooted', name: 'Rooted', value: 0.3, text: 'Knockback reduced by {v}.' },
    look: 2,
  },
  {
    id: 'hydraulic',
    slot: 'legs',
    name: 'Hydraulic Legs',
    tagline: 'Pressure lines straight to the hips.',
    stats: { kickPower: 0.14, moveSpeed: 0.04, stability: 0.05 },
    passive: { id: 'pistonDrive', name: 'Piston Drive', value: 0.2, text: 'Lunging attacks travel {v} farther.' },
    look: 3,
  },
  {
    id: 'phantom',
    slot: 'legs',
    name: 'Phantom Stride',
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
    tagline: 'Thrusters for closing distance.',
    stats: { kickPower: 0.08, moveSpeed: 0.03 },
    passive: { id: 'pistonDrive', name: 'Jet Assist', value: 0.2, text: 'Lunging attacks travel {v} farther.' },
    ability: 'flyingKnee',
    look: 4,
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

export interface FighterBuild {
  stats: Stats;
  passives: Map<PassiveId, number>;
  fistAbility: MoveId;
  kickAbility: MoveId;
  loadout: Loadout;
  /** Rough power rating for UI. */
  rating: number;
}

export function computeBuild(loadout: Loadout): FighterBuild {
  const s: Stats = { ...BASE_STATS };
  const pct: Partial<Record<StatKey, number>> = {};
  const passives = new Map<PassiveId, number>();
  let fistAbility: MoveId = 'haymaker';
  let kickAbility: MoveId = 'pushKick';
  let rating = 0;
  for (const slot of SLOTS) {
    const eq = loadout[slot];
    const item = ITEM_BY_ID.get(eq.id)!;
    rating += 100 * RARITIES[eq.rarity].mult;
    for (const [k, v] of Object.entries(item.stats) as [StatKey, number][]) {
      pct[k] = (pct[k] ?? 0) + scaledStat(v, eq.rarity);
    }
    const pv = scaledPassive(item.passive, eq.rarity);
    passives.set(item.passive.id, (passives.get(item.passive.id) ?? 0) + pv);
    if (item.slot === 'fist' && item.ability) fistAbility = item.ability;
    if (item.slot === 'kick' && item.ability) kickAbility = item.ability;
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
  return { stats: s, passives, fistAbility, kickAbility, loadout, rating: Math.round(rating) };
}
