import { Match } from '../sim/match';
import { matchHash } from '../sim/hash';
import { MOVES } from '../sim/moves';
import { BASE_STATS, COMPANIES, ITEMS, MAX_RARITY, RARITIES, SIZE_EFFECT, SIZE_MAX, SIZE_MIN } from '../game/items';
import { randomBot } from '../game/loadout';
import { FINISHES, FRAMES } from '../game/paint';
import { Rng } from '../sim/math';
import { EMOTE_INFO } from '../sim/emote';
import { FINISH_AT, FINISH_SELF, FINISHERS } from '../sim/finisher';

let cached: number | null = null;

/**
 * What this device's fight sim does, boiled down to one number: the game data plus a few
 * seconds of a fixed fight, hashed to the last bit. Two players can only share a fight
 * when theirs match; a different number means a different version of the game (or, in
 * theory, maths that round differently), so the fight would drift apart on their screens.
 */
export function simFingerprint(): number {
  if (cached !== null) return cached;
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v | 0), 0x01000193);
  };
  const data = JSON.stringify([ITEMS, COMPANIES, MOVES, BASE_STATS, RARITIES, MAX_RARITY, SIZE_EFFECT, SIZE_MIN, SIZE_MAX, FINISHES.length, FRAMES.length, EMOTE_INFO.map((e) => e.id), FINISH_AT, FINISH_SELF, Object.values(FINISHERS).map((f) => [f.id, f.tail, f.steps])]);
  for (let i = 0; i < data.length; i++) mix(data.charCodeAt(i));
  const rng = new Rng(0xb07b07);
  // (one corner picks a fighting style, so a build that doesn't know styles can't pair up)
  const m = new Match({ ...randomBot(rng, 0.9), style: 'Counter-puncher' }, randomBot(rng, 0.9), 0x5eed);
  m.skipIntro();
  // the countdown, touching gloves, then a few seconds of fighting
  for (let i = 0; i < 1800 && m.phase !== 'end'; i++) m.step();
  mix(matchHash(m));
  cached = h >>> 0;
  return cached;
}
