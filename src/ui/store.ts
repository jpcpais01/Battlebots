import { ITEM_BY_ID, SLOTS, capRarity, sanitizeSize } from '../game/items';
import { DEFAULT_PLAYER, type BotSpec } from '../game/loadout';
import { sanitizePaint } from '../game/paint';
import { EMOTE_KIND, MAX_PICKS, type EmoteKind } from '../sim/emote';

export interface Record_ {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  best: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode / quota: keep going in memory */
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Any bot description (saved, or sent by another player) made safe: unknown items, rarities and paint fall back to defaults. */
export function sanitizeBot(raw: unknown): BotSpec {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<BotSpec>;
  const out = clone(DEFAULT_PLAYER);
  if (typeof p.name === 'string' && p.name.trim()) out.name = p.name.trim().slice(0, 20);
  // older saves and peers sent a palette index instead of a paint job
  out.paint = sanitizePaint(p.paint, (p as { palette?: unknown }).palette);
  // older saves and peers have no size: a standard frame
  out.size = sanitizeSize(p.size);
  for (const slot of SLOTS) {
    const e = p.loadout?.[slot];
    const item = e && typeof e.id === 'string' && ITEM_BY_ID.get(e.id);
    if (item && item.slot === slot && Number.isInteger(e.rarity) && e.rarity >= 0 && e.rarity <= 4) out.loadout[slot] = { id: e.id, rarity: capRarity(e.rarity) };
  }
  const em = (p.emotes && typeof p.emotes === 'object' ? p.emotes : {}) as Partial<Record<EmoteKind, unknown>>;
  const picks = (kind: EmoteKind) => {
    const ids = Array.isArray(em[kind]) ? (em[kind] as unknown[]) : [];
    const ok = ids.filter((id): id is string => typeof id === 'string' && EMOTE_KIND[id] === kind);
    return [...new Set(ok)].slice(0, MAX_PICKS);
  };
  const win = picks('win'), taunt = picks('taunt'), finish = picks('finish');
  if (win.length || taunt.length || finish.length) out.emotes = { win, taunt, finish };
  return out;
}

/** Load the player's bot, repairing anything stale (removed items, bad palette). */
export const loadPlayer = (): BotSpec => sanitizeBot(read<unknown>('bb.player', null));

/** Told after the bot or the record is saved (the account sends them to the cloud). */
let onSaved: (() => void) | null = null;
export const setOnSaved = (fn: () => void) => (onSaved = fn);

export function savePlayer(p: BotSpec) {
  write('bb.player', p);
  onSaved?.();
}

/** A win record from anywhere (saved, or the cloud copy) made safe: counts are whole and not negative. */
export function sanitizeRecord(raw: unknown): Record_ {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Record_, unknown>>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  return { wins: n(r.wins), losses: n(r.losses), draws: n(r.draws), streak: n(r.streak), best: n(r.best) };
}

export const loadRecord = (): Record_ => sanitizeRecord(read<unknown>('bb.record', null));
export function saveRecord(r: Record_) {
  write('bb.record', r);
  onSaved?.();
}

export function loadQuality(): string | null {
  try {
    return localStorage.getItem('bb.quality');
  } catch {
    return null;
  }
}
export function saveQuality(q: string | null) {
  try {
    if (q) localStorage.setItem('bb.quality', q);
    else localStorage.removeItem('bb.quality');
  } catch {
    /* ignore */
  }
}

const ZOOMS = ['close', 'normal', 'wide'] as const;
export type Zoom = (typeof ZOOMS)[number];
export function loadZoom(): Zoom {
  try {
    const z = localStorage.getItem('bb.zoom');
    return (ZOOMS as readonly string[]).includes(z ?? '') ? (z as Zoom) : 'normal';
  } catch {
    return 'normal';
  }
}
export function saveZoom(z: Zoom) {
  try {
    localStorage.setItem('bb.zoom', z);
  } catch {
    /* ignore */
  }
}

/** Saved loadouts: whole bots (name, parts, paint, emotes) the player can switch between. */
export const MAX_SAVES = 8;
export const loadSaves = (): BotSpec[] => {
  const raw = read<unknown>('bb.saves', []);
  return Array.isArray(raw) ? raw.slice(0, MAX_SAVES).map(sanitizeBot) : [];
};
export const saveSaves = (s: BotSpec[]) => write('bb.saves', s.slice(0, MAX_SAVES));
