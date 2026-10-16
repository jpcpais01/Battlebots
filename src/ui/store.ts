import { sanitizeBot, sanitizeRecord, MAX_SAVES, type Record_ } from '../game/saves';
import type { BotSpec } from '../game/loadout';

export { sanitizeBot, sanitizeRecord, MAX_SAVES, type Record_ };

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

/** Load the player's bot, repairing anything stale (removed items, bad palette). */
export const loadPlayer = (): BotSpec => sanitizeBot(read<unknown>('bb.player', null));

/** Told after the bot or the record is saved (the account sends them to the cloud). */
let onSaved: (() => void) | null = null;
export const setOnSaved = (fn: () => void) => (onSaved = fn);

export function savePlayer(p: BotSpec) {
  write('bb.player', p);
  onSaved?.();
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

export const loadSaves = (): BotSpec[] => {
  const raw = read<unknown>('bb.saves', []);
  return Array.isArray(raw) ? raw.slice(0, MAX_SAVES).map(sanitizeBot) : [];
};
export const saveSaves = (s: BotSpec[]) => write('bb.saves', s.slice(0, MAX_SAVES));
