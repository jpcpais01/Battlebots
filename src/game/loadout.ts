import { Rng } from '../sim/math';
import { COMPANIES, COMPANY_BY_ID, ITEM_BY_ID, MAX_RARITY, SIZE_MAX, SIZE_MIN, SLOTS, equip, sanitizeSize, itemsForSlot, type Loadout, type Rarity, type StatKey } from './items';
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
  // about half of all bots are loyal to one maker and wear mostly its parts (often enough for a set
  // bonus). A diesel fan goes all the way, since diesel parts only run on a full diesel bot; nobody
  // else bolts a lone diesel part on.
  const fan = rng.chance(0.45) ? rng.pick(COMPANIES) : null;
  for (const slot of SLOTS) {
    // every part is made at one rarity: roll the rarity, then pick a part made at it
    const r = rollRarity(rng, tier);
    const made = itemsForSlot(slot).filter((it) => it.tier === r);
    const all = made.filter((it) => !COMPANY_BY_ID.get(it.maker)!.needsFull);
    const theirs = fan && (fan.needsFull || rng.chance(0.75)) ? made.filter((it) => it.maker === fan.id) : [];
    out[slot] = equip(rng.pick(theirs.length ? theirs : all));
  }
  return out as Loadout;
}

export interface BotSpec {
  name: string;
  loadout: Loadout;
  paint: Paint;
  /** Celebrations and taunts equipped in the garage; missing = the bot picks its own. */
  emotes?: EmotePicks;
  /** Frame size, SIZE_MIN..SIZE_MAX on 5% steps; missing = 1 (standard). */
  size?: number;
  /** Walk-on music (audio/walkOn.ts); missing = the one that goes with its name. */
  walkOn?: string;
  /** A skin from the Skin Vault (game/skins.ts) over the plating; missing = the plain paint. Cosmetic: the sim never reads it. */
  skin?: string;
  /** The fighting style its corner picked (sim/brain.ts FIGHT_STYLES); missing = the bot picks its own from its build. */
  style?: string;
  /**
   * Stat lines on top of its parts (items.ts computeBuild), from the Android app's Gauntlet:
   * the run's picks on the player's bot, a stage's on its rival. Missing = none.
   */
  boost?: Partial<Record<StatKey, number>>;
}

/** A random frame size: mostly near standard, now and then a giant or a tiddler. */
export function randomSize(rng: Rng): number {
  const r = (rng.next() + rng.next()) * 0.5;
  return sanitizeSize(SIZE_MIN + (SIZE_MAX - SIZE_MIN) * r);
}

/** A random bot in one of the ready-made paint schemes (never exactly `avoid`). */
export function randomBot(rng: Rng, tier = 0.35, avoid?: Paint): BotSpec {
  let i = rng.int(0, SCHEMES.length - 1);
  if (avoid && samePaint(SCHEMES[i].paint, avoid)) i = (i + 1 + rng.int(0, SCHEMES.length - 2)) % SCHEMES.length;
  return { name: randomName(rng), loadout: randomLoadout(rng, tier), paint: { ...SCHEMES[i].paint }, size: randomSize(rng) };
}

export const DEFAULT_PLAYER: BotSpec = {
  name: 'Atom Jack',
  paint: { ...DEFAULT_PAINT },
  size: 1,
  loadout: {
    head: equip(ITEM_BY_ID.get('tianyan')!),
    fist: equip(ITEM_BY_ID.get('colosseo')!),
    core: equip(ITEM_BY_ID.get('cell')!),
    chest: equip(ITEM_BY_ID.get('greatwall')!),
    legs: equip(ITEM_BY_ID.get('longma')!),
    kick: equip(ITEM_BY_ID.get('afterburner')!),
  },
};
