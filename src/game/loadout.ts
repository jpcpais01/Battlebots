import { Rng } from '../sim/math';
import { SLOTS, itemsForSlot, type Loadout, type Rarity } from './items';
import type { EmotePicks } from '../sim/emote';

export interface Palette {
  name: string;
  primary: number;
  secondary: number;
  accent: number;
}

export const PALETTES: Palette[] = [
  { name: 'Blaze', primary: 0xff7a1a, secondary: 0xf2efe8, accent: 0xffc23d },
  { name: 'Tide', primary: 0x14b8c4, secondary: 0x1d2433, accent: 0x6ff7ff },
  { name: 'Crimson', primary: 0xd9283e, secondary: 0x22252d, accent: 0xff5a5a },
  { name: 'Volt', primary: 0xf4d21b, secondary: 0x23272f, accent: 0xfff36b },
  { name: 'Frost', primary: 0xe8eef5, secondary: 0x2d6cdf, accent: 0x7cc4ff },
  { name: 'Jade', primary: 0x22b866, secondary: 0xe9ece8, accent: 0x7dffb0 },
  { name: 'Royal', primary: 0x5b3fd6, secondary: 0xe8e2ff, accent: 0xb59cff },
  { name: 'Graphite', primary: 0x3a404c, secondary: 0xff6b2c, accent: 0xff9a55 },
  { name: 'Sakura', primary: 0xf06aa0, secondary: 0x2a2433, accent: 0xffb3d1 },
  { name: 'Desert', primary: 0xc9a46a, secondary: 0x3b3229, accent: 0xffd27a },
];

const PREFIX = ['Iron', 'Steel', 'Atomic', 'Turbo', 'Mega', 'Neon', 'Titan', 'Rust', 'Chrome', 'Nova', 'Thunder', 'Hyper', 'Diesel', 'Quantum', 'Cobalt', 'Magma', 'Static', 'Omega', 'Rapid', 'Brass'];
const SUFFIX = ['Jack', 'Fang', 'Fist', 'Duke', 'Viper', 'Rhino', 'Bolt', 'Hammer', 'Knox', 'Ranger', 'Brute', 'Comet', 'Hornet', 'Kong', 'Rook', 'Grizzly', 'Spark', 'Mauler', 'Ace', 'Reaper'];

export function randomName(rng: Rng): string {
  const name = `${rng.pick(PREFIX)} ${rng.pick(SUFFIX)}`;
  return rng.chance(0.25) ? `${name} ${rng.pick(['II', 'X', 'MK-3', 'V', 'Zero', '9'])}` : name;
}

/** Weighted rarity roll. `tier` shifts the distribution upwards (0..1). */
export function rollRarity(rng: Rng, tier = 0.35): Rarity {
  const w = [1.0 - tier * 0.6, 0.75, 0.42 + tier * 0.3, 0.2 + tier * 0.3, 0.07 + tier * 0.2];
  const sum = w.reduce((a, b) => a + b, 0);
  let r = rng.next() * sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i as Rarity;
  }
  return 0;
}

export function randomLoadout(rng: Rng, tier = 0.35): Loadout {
  const out: Partial<Loadout> = {};
  for (const slot of SLOTS) {
    const item = rng.pick(itemsForSlot(slot));
    out[slot] = { id: item.id, rarity: rollRarity(rng, tier) };
  }
  return out as Loadout;
}

export interface BotSpec {
  name: string;
  loadout: Loadout;
  palette: number;
  /** Celebrations and taunts equipped in the garage; missing = the bot picks its own. */
  emotes?: EmotePicks;
}

export function randomBot(rng: Rng, tier = 0.35, avoidPalette = -1): BotSpec {
  let palette = rng.int(0, PALETTES.length - 1);
  if (palette === avoidPalette) palette = (palette + 1 + rng.int(0, PALETTES.length - 2)) % PALETTES.length;
  return { name: randomName(rng), loadout: randomLoadout(rng, tier), palette };
}

export const DEFAULT_PLAYER: BotSpec = {
  name: 'Atom Jack',
  palette: 0,
  loadout: {
    head: { id: 'sentinel', rarity: 1 },
    fist: { id: 'brawler', rarity: 1 },
    core: { id: 'fusion', rarity: 1 },
    chest: { id: 'plated', rarity: 1 },
    legs: { id: 'strider', rarity: 1 },
    kick: { id: 'whip', rarity: 1 },
  },
};
