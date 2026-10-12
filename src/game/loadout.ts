import { Rng } from '../sim/math';
import { MAX_RARITY, SLOTS, capRarity, itemsForSlot, type Loadout, type Rarity } from './items';
import type { EmotePicks } from '../sim/emote';
import { DEFAULT_PAINT, SCHEMES, samePaint, type Paint } from './paint';

const PREFIX = ['Iron', 'Steel', 'Atomic', 'Turbo', 'Mega', 'Neon', 'Titan', 'Rust', 'Chrome', 'Nova', 'Thunder', 'Hyper', 'Diesel', 'Quantum', 'Cobalt', 'Magma', 'Static', 'Omega', 'Rapid', 'Brass'];
const SUFFIX = ['Jack', 'Fang', 'Fist', 'Duke', 'Viper', 'Rhino', 'Bolt', 'Hammer', 'Knox', 'Ranger', 'Brute', 'Comet', 'Hornet', 'Kong', 'Rook', 'Grizzly', 'Spark', 'Mauler', 'Ace', 'Reaper'];

export function randomName(rng: Rng): string {
  const name = `${rng.pick(PREFIX)} ${rng.pick(SUFFIX)}`;
  return rng.chance(0.25) ? `${name} ${rng.pick(['II', 'X', 'MK-3', 'V', 'Zero', '9'])}` : name;
}

/** Weighted rarity roll up to MAX_RARITY. `tier` shifts the distribution upwards (0..1). */
export function rollRarity(rng: Rng, tier = 0.35): Rarity {
  const w = [1.0 - tier * 0.6, 0.75, 0.42 + tier * 0.3, 0.2 + tier * 0.3, 0.07 + tier * 0.2].slice(0, MAX_RARITY + 1);
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
  paint: Paint;
  /** Celebrations and taunts equipped in the garage; missing = the bot picks its own. */
  emotes?: EmotePicks;
}

/** A random bot in one of the ready-made paint schemes (never exactly `avoid`). */
export function randomBot(rng: Rng, tier = 0.35, avoid?: Paint): BotSpec {
  let i = rng.int(0, SCHEMES.length - 1);
  if (avoid && samePaint(SCHEMES[i].paint, avoid)) i = (i + 1 + rng.int(0, SCHEMES.length - 2)) % SCHEMES.length;
  return { name: randomName(rng), loadout: randomLoadout(rng, tier), paint: { ...SCHEMES[i].paint } };
}

export const DEFAULT_PLAYER: BotSpec = {
  name: 'Atom Jack',
  paint: { ...DEFAULT_PAINT },
  loadout: {
    head: { id: 'sentinel', rarity: capRarity(1) },
    fist: { id: 'brawler', rarity: capRarity(1) },
    core: { id: 'fusion', rarity: capRarity(1) },
    chest: { id: 'plated', rarity: capRarity(1) },
    legs: { id: 'strider', rarity: capRarity(1) },
    kick: { id: 'whip', rarity: capRarity(1) },
  },
};
