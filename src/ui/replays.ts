import type { Tape } from '../game/game';
import { COACH_KINDS, type CoachKind } from '../sim/coach';
import type { BoothCue } from '../audio/booth';
import { simFingerprint } from '../net/fingerprint';
import { deleteDoc, listDocs, setDoc } from '../net/firebase';
import type { Account } from '../net/account';
import { sanitizeBot } from './store';
import { ARENAS, type ArenaId } from '../game/events';

/**
 * Saved replays. A replay is only its tape (the two bots, the seed, the intro cut and the
 * coach's calls), a couple of KB, so the player can keep a shelf of them. They live on this
 * device and, when signed in, in the account (users/{uid}/replays/{id}), one document each.
 *
 * A tape only plays back the same fight on the sim that recorded it, so each one keeps the
 * sim fingerprint of the build it was saved on. After a balance change it still plays, but
 * it's marked as made on an older version: the bots may not fight it out the same way.
 */

export const MAX_REPLAYS = 30;
const KEY = 'bb.replays';
/** Ids deleted here that the cloud may still hold. */
const GONE_KEY = 'bb.replaysGone';
/** Longest a replay document may be (the Firestore rules allow up to this). */
const MAX_DATA = 100000;

export interface SavedReplay {
  id: string;
  /** When it was saved, ms since epoch. */
  saved: number;
  /** The sim fingerprint of the build that recorded it. */
  fp: number;
  tape: Tape;
  /** Winner's corner (-1: draw) and how the fight ended, for the list. */
  winner: number;
  kind: string;
  /** Fight length in seconds. */
  secs: number;
  /** Already in the account's cloud. */
  up?: boolean;
}

/** The id a tape is saved under: the same fight saved twice is one replay. */
export const replayId = (t: Tape) => `${(t.seed >>> 0).toString(36)}-${t.end.toString(36)}`;

/** Made on a build whose fight sim differs from this one. */
export const outdated = (r: SavedReplay) => r.fp !== simFingerprint();

const int = (v: unknown, min = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : min);

function sanitizeTape(raw: unknown): Tape | null {
  const t = (raw && typeof raw === 'object' ? raw : null) as Partial<Record<keyof Tape, unknown>> | null;
  if (!t || typeof t.seed !== 'number' || typeof t.end !== 'number' || t.end <= 0) return null;
  const coach = (Array.isArray(t.coach) ? t.coach : [])
    .filter((c): c is { frame: number; side: number; kind: CoachKind } => !!c && typeof c === 'object' && COACH_KINDS.includes((c as { kind: CoachKind }).kind))
    .map((c) => ({ frame: int(c.frame), side: c.side === 1 ? 1 : 0, kind: c.kind }));
  const marks = (Array.isArray(t.marks) ? t.marks : [])
    .filter((k): k is { frame: number; kind: 'kd' | 'tear' | 'ko' } => !!k && typeof k === 'object' && ['kd', 'tear', 'ko'].includes((k as { kind: string }).kind))
    .map((k) => ({ frame: int(k.frame), kind: k.kind }));
  const talk: BoothCue[] = [];
  for (const c of (Array.isArray(t.talk) ? t.talk : []).slice(0, 600)) {
    if (!c || typeof c !== 'object') continue;
    const q = c as Record<string, unknown>;
    if (Array.isArray(q.c)) {
      const clips = q.c.filter((x): x is [string, number, number] => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'number' && typeof x[2] === 'number');
      if (clips.length && (q.v === 'p' || q.v === 'c' || q.v === 'r')) talk.push({ f: int(q.f), c: clips.map(([a, b, g]) => [a.slice(0, 80), b, g]), e: int(q.e), v: q.v, w: typeof q.w === 'number' ? q.w : 0.6 });
    } else if (typeof q.x === 'number') talk.push({ f: int(q.f), x: int(q.x), fade: typeof q.fade === 'number' ? Math.max(0, q.fade) : 0 });
  }
  const out: Tape = { a: sanitizeBot(t.a), b: sanitizeBot(t.b), seed: t.seed >>> 0, cut: int(t.cut, -1), coach, end: int(t.end), marks, talk };
  if (typeof t.arena === 'string' && ARENAS.includes(t.arena as ArenaId)) out.arena = t.arena as ArenaId;
  if (t.online === true) {
    out.online = true;
    out.me = t.me === 1 ? 1 : 0;
  }
  // a tag team match: each side's partner, the TAG button's taps, and the teams' names
  const pt = t.partners as { a?: unknown; b?: unknown } | undefined;
  if (pt && typeof pt === 'object' && pt.a && pt.b) {
    out.partners = { a: sanitizeBot(pt.a), b: sanitizeBot(pt.b) };
    out.tags = (Array.isArray(t.tags) ? t.tags : [])
      .filter((c): c is { frame: number; side: number } => !!c && typeof c === 'object')
      .slice(0, 400)
      .map((c) => ({ frame: int(c.frame), side: c.side === 1 ? 1 : 0 }));
    const tn = Array.isArray(t.teams) ? t.teams : [];
    out.teams = [0, 1].map((k) => (typeof tn[k] === 'string' ? (tn[k] as string).slice(0, 60) : '')) as [string, string];
  }
  return out;
}

function sanitize(raw: unknown): SavedReplay | null {
  const r = (raw && typeof raw === 'object' ? raw : null) as Partial<Record<keyof SavedReplay, unknown>> | null;
  const tape = r && sanitizeTape(r.tape);
  if (!r || !tape) return null;
  return {
    id: replayId(tape),
    saved: int(r.saved),
    fp: typeof r.fp === 'number' ? r.fp >>> 0 : 0,
    tape,
    winner: r.winner === 0 || r.winner === 1 ? r.winner : -1,
    kind: typeof r.kind === 'string' ? r.kind.slice(0, 16) : '',
    secs: int(r.secs),
    up: r.up === true,
  };
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode / quota */
  }
}

/** Newest first. */
export function loadReplays(): SavedReplay[] {
  const raw = read(KEY);
  const out = (Array.isArray(raw) ? raw : []).map(sanitize).filter((r): r is SavedReplay => !!r);
  return out.sort((a, b) => b.saved - a.saved).slice(0, MAX_REPLAYS);
}

const store = (list: SavedReplay[]) => write(KEY, list.sort((a, b) => b.saved - a.saved).slice(0, MAX_REPLAYS));
const loadGone = (): string[] => {
  const g = read(GONE_KEY);
  return Array.isArray(g) ? g.filter((x): x is string => typeof x === 'string').slice(-100) : [];
};
const storeGone = (g: string[]) => write(GONE_KEY, g.slice(-100));

export const isSaved = (t: Tape) => loadReplays().some((r) => r.id === replayId(t));

/** What goes up to the cloud: the replay without its local bookkeeping, as one string. */
const packed = (r: SavedReplay) => JSON.stringify({ ...r, up: undefined });

export class ReplayShelf {
  /** Told when the list changed (a cloud sync added or removed some). */
  onChange: (() => void) | null = null;
  private syncing = false;

  constructor(private account: Account) {}

  get list() {
    return loadReplays();
  }

  get full() {
    return loadReplays().length >= MAX_REPLAYS;
  }

  /** Keep a finished fight. False when the shelf is full. */
  save(t: Tape, m: { winner: number; kind: string; secs: number }): boolean {
    const list = loadReplays();
    const id = replayId(t);
    if (list.some((r) => r.id === id)) return true;
    if (list.length >= MAX_REPLAYS) return false;
    const r: SavedReplay = { id, saved: Date.now(), fp: simFingerprint(), tape: structuredClone(t), winner: m.winner, kind: m.kind, secs: Math.round(m.secs) };
    list.push(r);
    store(list);
    void this.upload(r);
    return true;
  }

  remove(id: string) {
    store(loadReplays().filter((r) => r.id !== id));
    storeGone([...loadGone().filter((g) => g !== id), id]);
    void this.account.cloud(async (t) => {
      await deleteDoc(t, `users/${t.uid}/replays/${id}`);
      storeGone(loadGone().filter((g) => g !== id));
    });
  }

  private async upload(r: SavedReplay) {
    const data = packed(r);
    if (data.length > MAX_DATA) return;
    const ok = await this.account.cloud((t) => setDoc(t, `users/${t.uid}/replays/${r.id}`, { data, saved: new Date(r.saved) }));
    if (ok === null) return;
    const list = loadReplays();
    const mine = list.find((x) => x.id === r.id);
    if (mine) {
      mine.up = true;
      store(list);
    }
  }

  /**
   * Match this device's shelf with the account's: replays saved elsewhere come down, ones
   * saved here offline go up, and ones deleted on either side go from both.
   */
  async sync() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const docs = await this.account.cloud((t) => listDocs(t, `users/${t.uid}/replays`, MAX_REPLAYS * 2));
      if (!docs) return;
      const cloud = new Map<string, SavedReplay>();
      for (const d of docs) {
        let r: SavedReplay | null = null;
        try {
          r = typeof d.data.data === 'string' ? sanitize(JSON.parse(d.data.data)) : null;
        } catch {
          /* unreadable: leave it */
        }
        if (r) cloud.set(d.id, { ...r, up: true });
      }
      let gone = loadGone();
      // deleted here while the cloud couldn't be reached
      for (const id of gone) {
        if (!cloud.has(id)) continue;
        cloud.delete(id);
        void this.account.cloud((t) => deleteDoc(t, `users/${t.uid}/replays/${id}`));
      }
      gone = gone.filter((id) => !cloud.has(id));
      storeGone(gone);
      const before = loadReplays();
      const list: SavedReplay[] = [];
      for (const r of before) {
        if (cloud.has(r.id)) list.push({ ...r, up: true });
        // in the cloud once, and gone from it now: deleted on another device
        else if (!r.up) list.push(r);
      }
      for (const [id, r] of cloud) if (!list.some((x) => x.id === id) && !gone.includes(id)) list.push(r);
      store(list);
      for (const r of loadReplays()) if (!r.up) void this.upload(r);
      if (list.length !== before.length || list.some((r, i) => r.id !== before[i]?.id)) this.onChange?.();
    } finally {
      this.syncing = false;
    }
  }
}
