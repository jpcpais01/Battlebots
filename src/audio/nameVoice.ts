import { nameKey, type NameCut } from './booth';

/**
 * Player-voiced bot names: the booth records the name a player gave their bot (up to
 * five a day), and the clips live on this device so the caller can shout it in every fight.
 */
export interface VoicedName {
  name: string;
  /** Each cut as base64 mp3 and its length in seconds. */
  clips: Partial<Record<NameCut, [b64: string, dur: number]>>;
  at: number;
}

const KEY = 'bb.nameVoices';
const DAY = 'bb.nameVoiceDay';
/** Names kept on the device (oldest go first); each is ~60 KB of audio. */
const KEEP = 12;
/** Recordings a player can make each day. */
export const PER_DAY = 5;

function readAll(): Record<string, VoicedName> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, VoicedName>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, VoicedName>) {
  const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
  for (const k of keys.slice(KEEP)) delete all[k];
  // a full storage drops the oldest until the newest fits
  while (true) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
      return;
    } catch {
      const ks = Object.keys(all).sort((a, b) => all[a].at - all[b].at);
      if (ks.length <= 1) return;
      delete all[ks[0]];
    }
  }
}

export const voicedNames = (): VoicedName[] => Object.values(readAll());
export const isVoiced = (name: string) => !!readAll()[nameKey(name)];

const today = () => new Date().toDateString();

/** Recordings used today. Stored as `<date>|<count>`; an older plain date means one. */
function usedToday() {
  try {
    const [day, n] = (localStorage.getItem(DAY) ?? '').split('|');
    return day === today() ? Number(n ?? 1) || 1 : 0;
  } catch {
    return 0;
  }
}

/** Recordings the player has left today. */
export const voicesLeftToday = () => Math.max(0, PER_DAY - usedToday());
export const canVoiceToday = () => voicesLeftToday() > 0;

export function bytesOf(b64: string): ArrayBuffer {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** Records the commentators saying this name, keeps it, and uses up one of today's recordings. */
export async function voiceName(name: string): Promise<VoicedName> {
  const r = await fetch('/api/voice-name', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }).catch(() => null);
  const body = r ? ((await r.json().catch(() => ({}))) as { clips?: Record<string, string>; error?: string }) : {};
  if (!r?.ok || !body.clips) throw new Error(body.error ?? 'Could not reach the studio. Check your connection.');
  const decoder = new OfflineAudioContext(1, 1, 24000);
  const clips: VoicedName['clips'] = {};
  for (const [cut, b64] of Object.entries(body.clips) as [NameCut, string][]) {
    const buf = await decoder.decodeAudioData(bytesOf(b64)).catch(() => null);
    if (buf) clips[cut] = [b64, buf.duration];
  }
  if (!Object.keys(clips).length) throw new Error('The recording came back empty. Try again.');
  const v: VoicedName = { name, clips, at: Date.now() };
  const all = readAll();
  all[nameKey(name)] = v;
  writeAll(all);
  try {
    localStorage.setItem(DAY, `${today()}|${usedToday() + 1}`);
  } catch {
    /* ignore */
  }
  return v;
}
