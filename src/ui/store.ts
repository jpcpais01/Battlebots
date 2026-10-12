import { ITEM_BY_ID, SLOTS } from '../game/items';
import { DEFAULT_PLAYER, PALETTES, type BotSpec } from '../game/loadout';
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

/** Any bot description (saved, or sent by another player) made safe: unknown items, rarities and paints fall back to defaults. */
export function sanitizeBot(raw: unknown): BotSpec {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<BotSpec>;
  const out = clone(DEFAULT_PLAYER);
  if (typeof p.name === 'string' && p.name.trim()) out.name = p.name.trim().slice(0, 20);
  if (Number.isInteger(p.palette) && p.palette! >= 0 && p.palette! < PALETTES.length) out.palette = p.palette!;
  for (const slot of SLOTS) {
    const e = p.loadout?.[slot];
    const item = e && typeof e.id === 'string' && ITEM_BY_ID.get(e.id);
    if (item && item.slot === slot && Number.isInteger(e.rarity) && e.rarity >= 0 && e.rarity <= 4) out.loadout[slot] = { id: e.id, rarity: e.rarity };
  }
  const em = (p.emotes && typeof p.emotes === 'object' ? p.emotes : {}) as Partial<Record<EmoteKind, unknown>>;
  const picks = (kind: EmoteKind) => {
    const ids = Array.isArray(em[kind]) ? (em[kind] as unknown[]) : [];
    const ok = ids.filter((id): id is string => typeof id === 'string' && EMOTE_KIND[id] === kind);
    return [...new Set(ok)].slice(0, MAX_PICKS);
  };
  const win = picks('win'), taunt = picks('taunt');
  if (win.length || taunt.length) out.emotes = { win, taunt };
  return out;
}

/** Load the player's bot, repairing anything stale (removed items, bad palette). */
export const loadPlayer = (): BotSpec => sanitizeBot(read<unknown>('bb.player', null));

export const savePlayer = (p: BotSpec) => write('bb.player', p);

export const loadRecord = (): Record_ => ({ wins: 0, losses: 0, draws: 0, streak: 0, best: 0, ...read<Partial<Record_>>('bb.record', {}) });
export const saveRecord = (r: Record_) => write('bb.record', r);

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
