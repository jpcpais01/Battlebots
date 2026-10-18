import type { BotSpec } from './loadout';
import { EPIC, RARE, COMMON, SKINS, SKIN_BY_ID, skinById, skinsOfRarity, type SkinDef, type SkinRarity } from './skins';

/**
 * The Skin Vault's rules and the player's collection (kept in the record as `skins`, so it
 * follows a login to the cloud): the skins pulled (and how many copies), the shards duplicates
 * turned into, the pity counters, the free pull's timer and the one-time welcome pull. The same
 * rules as the Android app (godot/app/gacha/gacha.gd).
 *
 * Rates: Epic 4%, Rare 21%, Common 75%. Every 10th pull without a Rare or better is a Rare or
 * better, so a 10-pull always holds one. From the 31st pull without an Epic the Epic chance climbs
 * 6 points a pull, and the 50th is always an Epic. Half the Epics drawn are the featured one (a
 * new one every day). A copy of a skin already owned turns into shards; shards buy any skin
 * outright in the collection. Everything here is cosmetic: the sim never sees a skin, and the
 * rolls are the UI's own (never a fight's seeded Rng).
 */

export const RATES = [0.75, 0.21, 0.04] as const;
export const PULL_COST = 100;
export const TEN_COST = 900;
/** A free single pull this often (s). */
export const FREE_EVERY = 4 * 3600;
export const RARE_EVERY = 10;
export const SOFT_PITY = 30;
export const SOFT_STEP = 0.06;
export const HARD_PITY = 50;
/** The featured Epic's share of the Epics drawn. */
export const FEATURED_SHARE = 0.5;
/** Shards from a duplicate, and what a skin costs in shards, per rarity. */
export const DUPE_SHARDS = [10, 40, 150] as const;
export const SHARD_PRICE = [60, 220, 700] as const;

export interface SkinState {
  /** Skin id -> copies pulled. */
  owned: Record<string, number>;
  shards: number;
  pulls: number;
  sinceEpic: number;
  sinceRare: number;
  /** When the free pull is ready (unix seconds). */
  freeAt: number;
  /** The welcome 10-pull has been opened. */
  welcome: boolean;
  /** Skins won but not looked at yet (NEW badges). */
  fresh: string[];
}

export interface PullResult {
  skin: SkinDef;
  new: boolean;
  shards: number;
}

export const now = () => Date.now() / 1000;

/** A fresh collection: nothing pulled, the free pull ready, the welcome 10-pull waiting. */
export const freshSkins = (): SkinState => ({ owned: {}, shards: 0, pulls: 0, sinceEpic: 0, sinceRare: 0, freeAt: 0, welcome: false, fresh: [] });

/** A saved collection made safe (unknown skins dropped, counts whole and in range). */
export function sanitizeSkins(raw: unknown): SkinState {
  const out = freshSkins();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<Record<keyof SkinState, unknown>>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  if (r.owned && typeof r.owned === 'object') {
    for (const [id, c] of Object.entries(r.owned as Record<string, unknown>)) if (SKIN_BY_ID.has(id)) out.owned[id] = Math.max(1, n(c));
  }
  out.shards = n(r.shards);
  out.pulls = n(r.pulls);
  out.sinceEpic = Math.min(n(r.sinceEpic), HARD_PITY - 1);
  out.sinceRare = Math.min(n(r.sinceRare), RARE_EVERY - 1);
  // (a clock wound back a long way would otherwise lock the free pull for ages)
  out.freeAt = typeof r.freeAt === 'number' && Number.isFinite(r.freeAt) ? Math.min(r.freeAt, now() + FREE_EVERY) : 0;
  out.welcome = r.welcome === true;
  if (Array.isArray(r.fresh)) out.fresh = [...new Set(r.fresh.filter((id): id is string => typeof id === 'string' && id in out.owned))];
  return out;
}

export const ownsSkin = (g: SkinState, id: unknown) => typeof id === 'string' && id in g.owned;

/** Seconds until the free pull is ready (0: ready now). */
export const freeIn = (g: SkinState) => Math.max(0, g.freeAt - now());

/** A pull waiting for nothing: the welcome 10-pull or the free pull (the home button's dot). */
export const giftReady = (g: SkinState) => !g.welcome || freeIn(g) <= 0;

/** "3h 12m", "12m 05s", "45s". */
export function clock(s: number) {
  const t = Math.ceil(s);
  const two = (v: number) => String(v).padStart(2, '0');
  if (t >= 3600) return `${Math.floor(t / 3600)}h ${two(Math.floor((t % 3600) / 60))}m`;
  if (t >= 60) return `${Math.floor(t / 60)}m ${two(t % 60)}s`;
  return `${t}s`;
}

/** Pulls left until an Epic is certain. */
export const pityLeft = (g: SkinState) => HARD_PITY - g.sinceEpic;

/** The chance the next pull is an Epic (with the soft pity). */
export function epicChance(g: SkinState) {
  const n = g.sinceEpic + 1;
  if (n >= HARD_PITY) return 1;
  if (n > SOFT_PITY) return Math.min(1, RATES[2] + SOFT_STEP * (n - SOFT_PITY));
  return RATES[2];
}

/** Today's featured Epic (the same for everyone on a day, a new one at midnight UTC). */
export function featured(): SkinDef {
  const epics = skinsOfRarity(EPIC);
  const day = Math.floor(now() / 86400);
  return epics[(((day * 5 + 3) % epics.length) + epics.length) % epics.length];
}

/** Seconds until the next featured Epic. */
export const featuredIn = () => 86400 - (now() % 86400);

function rollRarity(g: SkinState, forceRare: boolean): SkinRarity {
  const r = Math.random();
  const e = epicChance(g);
  if (r < e) return EPIC;
  if (forceRare || g.sinceRare + 1 >= RARE_EVERY) return RARE;
  // what's left of the roll shares Rare and Common in their own proportion
  const rareK = RATES[1] / (RATES[0] + RATES[1]);
  return (r - e) / Math.max(1e-6, 1 - e) < rareK ? RARE : COMMON;
}

function pick(r: SkinRarity): SkinDef {
  if (r === EPIC && Math.random() < FEATURED_SHARE) return featured();
  const pool = skinsOfRarity(r);
  return pool[Math.floor(Math.random() * pool.length) % pool.length];
}

/**
 * Pull `n` skins (1 or 10) into the collection, in the order they come out. A 10-pull always
 * holds a Rare or better (the pity counters see to it). Doesn't pay.
 */
export function pullSkins(g: SkinState, n: number): PullResult[] {
  const out: PullResult[] = [];
  let rareSeen = false;
  for (let i = 0; i < n; i++) {
    const force = n >= 10 && i === n - 1 && !rareSeen;
    const r = rollRarity(g, force);
    const s = pick(r);
    g.pulls++;
    g.sinceEpic = r === EPIC ? 0 : g.sinceEpic + 1;
    g.sinceRare = r >= RARE ? 0 : g.sinceRare + 1;
    if (r >= RARE) rareSeen = true;
    const isNew = !(s.id in g.owned);
    let shards = 0;
    if (isNew) {
      g.owned[s.id] = 1;
      if (!g.fresh.includes(s.id)) g.fresh.push(s.id);
    } else {
      g.owned[s.id]++;
      shards = DUPE_SHARDS[r];
      g.shards += shards;
    }
    out.push({ skin: s, new: isNew, shards });
  }
  return out;
}

/** The best of a pull (highest rarity, new before old), for the capsule's colour. */
export function bestOf(results: PullResult[]): PullResult {
  let best = results[0];
  const score = (x: PullResult) => x.skin.r * 2 + (x.new ? 1 : 0);
  for (const x of results) if (score(x) > score(best)) best = x;
  return best;
}

/** Buy a skin outright with shards: whether it worked. */
export function exchange(g: SkinState, s: SkinDef): boolean {
  const price = SHARD_PRICE[s.r];
  if (ownsSkin(g, s.id) || g.shards < price) return false;
  g.shards -= price;
  g.owned[s.id] = 1;
  if (!g.fresh.includes(s.id)) g.fresh.push(s.id);
  return true;
}

/** How many of each rarity are owned: [common, rare, epic]. */
export function ownedCounts(g: SkinState): [number, number, number] {
  const n: [number, number, number] = [0, 0, 0];
  for (const id of Object.keys(g.owned)) {
    const s = SKIN_BY_ID.get(id);
    if (s) n[s.r]++;
  }
  return n;
}

/**
 * A bot wearing a skin the collection doesn't hold takes it off (an edited save, a cloud copy
 * from before): whether anything changed.
 */
export function checkWorn(g: SkinState, bot: BotSpec): boolean {
  if (bot.skin === undefined) return false;
  if (skinById(bot.skin) && ownsSkin(g, bot.skin)) return false;
  delete bot.skin;
  return true;
}

/**
 * A skin for an AI opponent now and then (cosmetic): its paint shows through most of the time,
 * a Common sometimes, a Rare now and then, an Epic rarely.
 */
export function opponentSkin(rand: () => number): string | undefined {
  const r = rand();
  const tier = r < 0.03 ? EPIC : r < 0.12 ? RARE : r < 0.32 ? COMMON : -1;
  if (tier < 0) return undefined;
  const pool = skinsOfRarity(tier);
  return pool[Math.floor(rand() * pool.length) % pool.length].id;
}

/** A title's last rival comes out in an Epic skin, the one before in a Rare, the same one every time. */
export function rivalSkin(eventId: string, round: number, rounds: number): string | undefined {
  const left = rounds - 1 - round;
  if (left > 1) return undefined;
  const pool = skinsOfRarity(left === 0 ? EPIC : RARE);
  let h = 0;
  for (let i = 0; i < eventId.length; i++) h = (h * 31 + eventId.charCodeAt(i)) | 0;
  return pool[Math.abs(h + round) % pool.length].id;
}

/** The skins in a list's order of display: rarest first, owned before not. */
export function byShowOrder(g: SkinState, list: readonly SkinDef[] = SKINS) {
  return list.slice().sort((a, b) => (a.r !== b.r ? b.r - a.r : Number(ownsSkin(g, b.id)) - Number(ownsSkin(g, a.id))));
}
