import { Rng } from '../sim/math';
import { ITEM_BY_ID, MAX_RARITY, RARITIES, SLOTS, type ItemDef, type Rarity } from './items';
import { EARNABLE, commonOf, equipped, rarityOf } from './catalogue';
import { EVENTS, progressOf, titlesHeld, type EventDef, type EventsRecord } from './events';
import type { BotSpec } from './loadout';

/**
 * Career mode: the money, the fame and the gear around the world map's cups and championships.
 *
 * Every round pays prize money (more in the later rounds, at the bigger events and for a
 * finish), every title pays a bonus and hands over a crate with a Rare or Epic part in it, and
 * now and then a beaten rival leaves a part behind. Credits buy parts at the Parts Market, whose
 * stock turns over every few fights. Fame from wins climbs the ranks from Rookie to Legend.
 * Common parts belong to everybody; Rare and Epic ones have to be earned.
 */

export interface CareerState {
  credits: number;
  /** Career points: they only ever go up, and set the rank. */
  fame: number;
  /** The Rare and Epic parts the player has (item ids). */
  owned: string[];
  /** Parts won or bought that haven't been looked at yet (they wear a NEW tag). */
  fresh: string[];
  /** The Parts Market: what's on the shelf comes from `seed`; `left` fights until it restocks. */
  shop: { seed: number; left: number; sold: string[] };
  /** Lifetime credits won (not counting what was spent). */
  earned: number;
  /** Lifetime parts won (crates and salvage). */
  found: number;
}

/** Credits a new career starts with. */
const START_CREDITS = 250;
/** Career fights between Parts Market restocks. */
export const SHOP_EVERY = 3;
export const SHOP_SIZE = 6;
/** What a fresh shelf costs, any time. */
export const RESTOCK_PRICE = 60;
/** Titles held before the Parts Market sells Epic parts. */
export const EPIC_TITLES = 2;
/** A part's price at the Parts Market, by tier (the deal of the day is 30% off). */
const PRICE = [0, 450, 1500, 4000, 9000];
/** Credits for a part the player already has (it goes for scrap). */
const SCRAP = [0, 120, 400, 1000, 2000];

export const RANKS = [
  { name: 'Rookie', fame: 0 },
  { name: 'Prospect', fame: 60 },
  { name: 'Contender', fame: 200 },
  { name: 'Pro', fame: 450 },
  { name: 'Star', fame: 800 },
  { name: 'Champion', fame: 1300 },
  { name: 'Legend', fame: 2400 },
] as const;

const whole = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
const round5 = (v: number) => Math.round(v / 5) * 5;
const freshSeed = () => (Math.random() * 2 ** 32) >>> 0;

/**
 * A career from anywhere (this device, the cloud, or nothing at all) made safe. A save from
 * before career mode starts one, with back pay for the titles already won on the map.
 */
export function sanitizeCareer(raw: unknown, events: EventsRecord): CareerState {
  if (!raw || typeof raw !== 'object') return newCareer(events);
  const r = raw as Partial<Record<keyof CareerState, unknown>>;
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string' && ITEM_BY_ID.has(id)))] : []);
  const owned = ids(r.owned).filter((id) => rarityOf(ITEM_BY_ID.get(id)!) > 0);
  const s = (r.shop && typeof r.shop === 'object' ? r.shop : {}) as Partial<Record<keyof CareerState['shop'], unknown>>;
  return {
    credits: whole(r.credits),
    fame: whole(r.fame),
    owned,
    fresh: ids(r.fresh).filter((id) => owned.includes(id)),
    shop: { seed: whole(s.seed) >>> 0, left: Math.min(SHOP_EVERY, whole(s.left)), sold: ids(s.sold) },
    earned: whole(r.earned),
    found: whole(r.found),
  };
}

/** The career made last, from a save that had none (not saved: it only matters at launch). */
let born: CareerState | null = null;
export const isNewCareer = (c: CareerState) => c === born;

/** A new career keeps the better parts the player already wears (from before career mode). */
export function adoptWorn(c: CareerState, bots: BotSpec[]) {
  for (const bot of bots)
    for (const slot of SLOTS) {
      const item = ITEM_BY_ID.get(bot.loadout[slot].id);
      if (item && rarityOf(item) > 0 && !c.owned.includes(item.id)) c.owned.push(item.id);
    }
}

function newCareer(events: EventsRecord): CareerState {
  // titles won on the map before career mode came in are paid for, and count for fame
  let credits = START_CREDITS;
  let fame = 0;
  for (const e of EVENTS) {
    const t = progressOf(events, e.id).titles;
    credits += t * titleBonus(e, 0);
    fame += t * titleFame(e);
  }
  const c: CareerState = { credits, fame, owned: [], fresh: [], shop: { seed: freshSeed(), left: SHOP_EVERY, sold: [] }, earned: credits - START_CREDITS, found: 0 };
  born = c;
  return c;
}

// ------------------------------------------------------------------ ranks
export function rankOf(fame: number) {
  let i = 0;
  while (i + 1 < RANKS.length && fame >= RANKS[i + 1].fame) i++;
  const next = i + 1 < RANKS.length ? RANKS[i + 1] : null;
  const k = next ? (fame - RANKS[i].fame) / (next.fame - RANKS[i].fame) : 1;
  return { i, name: RANKS[i].name, next: next?.name ?? null, toNext: next ? next.fame - fame : 0, k };
}

// ------------------------------------------------------------------ gear
/** Does the player have this part? Every Common part, and the better ones they've earned. */
export const owns = (c: CareerState, item: ItemDef) => rarityOf(item) === 0 || c.owned.includes(item.id);

/** Parts the player has, by tier, out of how many there are to earn. */
export function collection(c: CareerState) {
  const tiers = RARITIES.slice(1, MAX_RARITY + 1).map((r, i) => {
    const all = EARNABLE.filter((it) => rarityOf(it) === i + 1);
    return { rarity: (i + 1) as Rarity, name: r.name, color: r.color, have: all.filter((it) => c.owned.includes(it.id)).length, of: all.length };
  });
  return { tiers, have: c.owned.length, of: EARNABLE.length };
}

/**
 * Take off any part the player doesn't have (an old save, a saved bot, a random roll) and fit
 * the Common version of it instead. Returns whether anything changed.
 */
export function fitOwned(bot: BotSpec, c: CareerState): boolean {
  let changed = false;
  for (const slot of SLOTS) {
    const item = ITEM_BY_ID.get(bot.loadout[slot].id);
    if (!item || owns(c, item)) continue;
    bot.loadout[slot] = equipped(commonOf(item));
    changed = true;
  }
  return changed;
}

/** Put a part in the player's collection. False when they already had it. */
function grant(c: CareerState, item: ItemDef, found = true): boolean {
  if (owns(c, item)) return false;
  c.owned.push(item.id);
  c.fresh.push(item.id);
  if (found) c.found++;
  return true;
}

/** The player has seen these parts (in the garage): drop their NEW tags. */
export function markSeen(c: CareerState, ids: string[]) {
  const before = c.fresh.length;
  c.fresh = c.fresh.filter((id) => !ids.includes(id));
  return c.fresh.length !== before;
}

// ------------------------------------------------------------------ prize money
/** A round's prize money. */
export const purse = (e: EventDef, round: number, defence: number) => round5(e.purse * (1 + 0.25 * round) * (1 + 0.25 * defence));
/** The bonus for winning the title. */
export const titleBonus = (e: EventDef, defence: number) => round5(e.purse * (e.kind === 'cup' ? 4 : 5) * (1 + 0.25 * defence));
const titleFame = (e: EventDef) => 40 * (e.tier + 1);
const winFame = (e: EventDef, round: number) => 10 + 6 * e.tier + 3 * round;

/** How likely the title crate holds an Epic part rather than a Rare one. */
export const epicOdds = (e: EventDef, defence: number) => (MAX_RARITY < 2 ? 0 : Math.min(1, [0, 0.1, 0.25, 0.45, 0.65, 1][e.tier] + 0.15 * defence));
/** How likely a beaten rival leaves one of its better parts behind. */
export const salvageOdds = (e: EventDef) => 0.22 + 0.04 * e.tier;

export interface Drop {
  item: ItemDef;
  /** The player had it already: it went for scrap. */
  dupe: boolean;
  scrap: number;
  /** A title's crate, or a part off the beaten rival. */
  how: 'crate' | 'salvage';
}

export interface Reward {
  lines: { label: string; credits: number }[];
  credits: number;
  fame: number;
  drop: Drop | null;
  /** The rank before and after, when this fight moved it. */
  rank: { from: number; to: number } | null;
}

export interface Bout {
  e: EventDef;
  round: number;
  defence: number;
  won: boolean;
  draw: boolean;
  /** How it ended: 'KO', 'TKO', 'Dismantled', 'Decision' or 'Draw'. */
  kind: string | null;
  /** This win took the title. */
  title: boolean;
  /** The beaten (or winning) rival's bot. */
  rival: BotSpec;
}

/** Pay out a career fight: credits, fame and any part, all put in the career. */
export function settle(c: CareerState, b: Bout, rng: Rng): Reward {
  const lines: Reward['lines'] = [];
  const base = purse(b.e, b.round, b.defence);
  let fame = 0;
  let drop: Drop | null = null;
  if (b.won) {
    lines.push({ label: b.title ? 'Final purse' : 'Prize money', credits: base });
    if (b.kind === 'KO' || b.kind === 'TKO') lines.push({ label: `${b.kind} bonus`, credits: round5(base * 0.25) });
    else if (b.kind === 'Dismantled') lines.push({ label: 'Dismantled bonus', credits: round5(base * 0.5) });
    if (b.title) lines.push({ label: b.defence ? 'Title defended' : b.e.kind === 'cup' ? 'Cup winner' : 'Champion', credits: titleBonus(b.e, b.defence) });
    fame = winFame(b.e, b.round) + (b.title ? titleFame(b.e) * (b.defence ? 0.5 : 1) : 0);
    drop = b.title ? crate(c, b, rng) : rng.chance(salvageOdds(b.e)) ? salvage(c, b.rival, rng) : null;
    if (drop?.dupe) lines.push({ label: 'Scrap value', credits: drop.scrap });
  } else {
    lines.push({ label: b.draw ? 'Split purse' : 'Appearance fee', credits: round5(base * (b.draw ? 0.5 : 0.3)) });
    fame = b.draw ? 4 : 2;
  }
  fame = Math.round(fame);
  const credits = lines.reduce((s, l) => s + l.credits, 0);
  const from = rankOf(c.fame).i;
  c.credits += credits;
  c.earned += credits;
  c.fame += fame;
  const to = rankOf(c.fame).i;
  // every career fight brings the market's restock closer
  tickShop(c);
  return { lines, credits, fame, drop, rank: to !== from ? { from, to } : null };
}

/** Pick one of these parts, the ones the player hasn't got first. */
function pickPart(c: CareerState, pool: ItemDef[], rng: Rng): ItemDef | null {
  if (!pool.length) return null;
  const fresh = pool.filter((it) => !owns(c, it));
  return rng.pick(fresh.length ? fresh : pool);
}

function give(c: CareerState, item: ItemDef, how: Drop['how']): Drop {
  const dupe = !grant(c, item);
  return { item, dupe, scrap: dupe ? SCRAP[rarityOf(item)] : 0, how };
}

/** The title's crate: a Rare or an Epic part, one the player hasn't got if there is one. */
function crate(c: CareerState, b: Bout, rng: Rng): Drop | null {
  const want: Rarity = rng.chance(epicOdds(b.e, b.defence)) ? 2 : 1;
  const tier = (r: number) => EARNABLE.filter((it) => rarityOf(it) === r);
  // nothing new left in that tier: try the other one before handing over a duplicate
  const pool = tier(want).some((it) => !owns(c, it)) ? tier(want) : EARNABLE.some((it) => !owns(c, it)) ? EARNABLE : tier(want);
  const item = pickPart(c, pool, rng);
  return item ? give(c, item, 'crate') : null;
}

/** A part off the beaten rival: one of its better ones (nothing if it was all Common). */
function salvage(c: CareerState, rival: BotSpec, rng: Rng): Drop | null {
  const parts = SLOTS.map((s) => ITEM_BY_ID.get(rival.loadout[s].id)).filter((it): it is ItemDef => !!it && rarityOf(it) > 0);
  const item = pickPart(c, parts, rng);
  return item ? give(c, item, 'salvage') : null;
}

// ------------------------------------------------------------------ the Parts Market
export interface Offer {
  item: ItemDef;
  price: number;
  /** The deal of the day: 30% off. */
  deal: boolean;
  sold: boolean;
  /** Why it can't be bought yet (Epic parts wait for titles). */
  locked: string | null;
}

/** What's on the market's shelf: Rares and a couple of Epics the player hasn't got. */
export function stock(c: CareerState, events: EventsRecord): Offer[] {
  const rng = new Rng(c.shop.seed);
  const need = Math.max(0, EPIC_TITLES - titlesHeld(events));
  const pool = (r: number) => EARNABLE.filter((it) => rarityOf(it) === r && (!owns(c, it) || c.shop.sold.includes(it.id)));
  const take = (list: ItemDef[], n: number) => {
    const out: ItemDef[] = [];
    const left = [...list];
    while (out.length < n && left.length) out.push(left.splice(Math.floor(rng.next() * left.length), 1)[0]);
    return out;
  };
  const epics = take(pool(2), MAX_RARITY >= 2 ? 2 : 0);
  const rares = take(pool(1), SHOP_SIZE - epics.length);
  const items = [...rares, ...epics];
  const deal = items.length ? Math.floor(rng.next() * items.length) : -1;
  return items.map((item, i) => {
    const r = rarityOf(item);
    const price = round5(PRICE[r] * (i === deal ? 0.7 : 1));
    return { item, price, deal: i === deal, sold: c.shop.sold.includes(item.id), locked: r >= 2 && need ? `Win ${need} more title${need > 1 ? 's' : ''}` : null };
  });
}

/** Buy an offer. False if it can't be bought (locked, sold, or not enough credits). */
export function buy(c: CareerState, o: Offer): boolean {
  if (o.locked || o.sold || owns(c, o.item) || c.credits < o.price) return false;
  c.credits -= o.price;
  c.shop.sold.push(o.item.id);
  grant(c, o.item, false);
  return true;
}

/** A fresh shelf: after SHOP_EVERY career fights, or paid for. */
export function restock(c: CareerState, paid: boolean): boolean {
  if (paid) {
    if (c.credits < RESTOCK_PRICE) return false;
    c.credits -= RESTOCK_PRICE;
  }
  c.shop = { seed: freshSeed(), left: SHOP_EVERY, sold: [] };
  return true;
}

function tickShop(c: CareerState) {
  c.shop.left = Math.max(0, c.shop.left - 1);
  if (!c.shop.left) restock(c, false);
}

/** "1,250" */
export const credits = (n: number) => Math.round(n).toLocaleString('en-US');
