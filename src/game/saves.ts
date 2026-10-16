import { ITEM_BY_ID, SLOTS, currentItemId, equip, inPlay, sanitizeSize } from './items';
import { DEFAULT_PLAYER, type BotSpec } from './loadout';
import { sanitizePaint } from './paint';
import { EMOTE_KIND, MAX_PICKS, type EmoteKind } from '../sim/emote';
import { WALK_ON_NAME } from './walkOns';
import { sanitizeEvents, type EventsRecord } from './events';
import { sanitizeCareer, type CareerState } from './career';

/** What a save holds, made safe wherever it came from (this device, the cloud, another player). */

export interface Record_ {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  best: number;
  /** Progress in the world map's cups and championships. */
  events: EventsRecord;
  /** Career mode: credits, fame, the parts earned and the Parts Market's shelf. */
  career: CareerState;
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
    // parts from before the maker rework move over to the part that replaced them
    const id = e && typeof e.id === 'string' ? currentItemId(e.id) : undefined;
    const item = id && ITEM_BY_ID.get(id);
    // the part decides its own rarity (older saves could set any rarity on any part)
    if (item && item.slot === slot && inPlay(item)) out.loadout[slot] = equip(item);
  }
  const em = (p.emotes && typeof p.emotes === 'object' ? p.emotes : {}) as Partial<Record<EmoteKind, unknown>>;
  const picks = (kind: EmoteKind) => {
    const ids = Array.isArray(em[kind]) ? (em[kind] as unknown[]) : [];
    const ok = ids.filter((id): id is string => typeof id === 'string' && EMOTE_KIND[id] === kind);
    return [...new Set(ok)].slice(0, MAX_PICKS);
  };
  const win = picks('win'), taunt = picks('taunt'), finish = picks('finish'), entrance = picks('entrance');
  if (win.length || taunt.length || finish.length || entrance.length) out.emotes = { win, taunt, finish, entrance };
  if (typeof p.walkOn === 'string' && WALK_ON_NAME[p.walkOn]) out.walkOn = p.walkOn;
  return out;
}

/** A win record from anywhere (saved, or the cloud copy) made safe: counts are whole and not negative. */
export function sanitizeRecord(raw: unknown): Record_ {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Record_, unknown>>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const events = sanitizeEvents(r.events);
  return { wins: n(r.wins), losses: n(r.losses), draws: n(r.draws), streak: n(r.streak), best: n(r.best), events, career: sanitizeCareer(r.career, events) };
}

/** Saved loadouts: whole bots (name, parts, paint, emotes) the player can switch between. */
export const MAX_SAVES = 8;
