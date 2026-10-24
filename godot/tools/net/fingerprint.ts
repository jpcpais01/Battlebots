/**
 * The web game's sim fingerprint (src/net/fingerprint.ts), for the Android app's online rooms:
 * writes godot/net/fp_data.gd with the hash of the game data part (which GDScript can't rebuild:
 * it is JavaScript's JSON.stringify of the data tables) and the whole fingerprint, which the app
 * finishes itself by running the same short fight (net/fingerprint.gd). Two players can only
 * share a room when their fingerprints match, phone or browser. Re-run after changing the web
 * game's data or sim, with the translator:
 *   THREE_MODULE=<three.module.js> node --experimental-transform-types --no-warnings \
 *     --import ./godot/tools/node/register.mjs godot/tools/net/fingerprint.ts
 */
import { writeFileSync } from 'node:fs';
import { Match } from '../../../src/sim/match';
import { matchHash, SIM_REV } from '../../../src/sim/hash';
import { MOVES } from '../../../src/sim/moves';
import { BASE_STATS, COMPANIES, ITEMS, MAX_RARITY, RARITIES, SIZE_EFFECT, SIZE_MAX, SIZE_MIN } from '../../../src/game/items';
import { randomBot } from '../../../src/game/loadout';
import { FINISHES, FRAMES } from '../../../src/game/paint';
import { Rng } from '../../../src/sim/math';
import { EMOTE_INFO } from '../../../src/sim/emote';
import { FINISH_AT, FINISH_SELF, FINISHERS } from '../../../src/sim/finisher';
import { simFingerprint } from '../../../src/net/fingerprint';

// (the same steps as simFingerprint, stopping after the data)
let h = 0x811c9dc5;
const mix = (v: number) => {
  h = Math.imul(h ^ (v | 0), 0x01000193);
};
const data = JSON.stringify([ITEMS, COMPANIES, MOVES, BASE_STATS, RARITIES, MAX_RARITY, SIZE_EFFECT, SIZE_MIN, SIZE_MAX, FINISHES.length, FRAMES.length, EMOTE_INFO.map((e) => e.id), FINISH_AT, FINISH_SELF, Object.values(FINISHERS).map((f) => [f.id, f.tail, f.steps]), SIM_REV]);
for (let i = 0; i < data.length; i++) mix(data.charCodeAt(i));
const dataHash = h >>> 0;
const rng = new Rng(0xb07b07);
const m = new Match({ ...randomBot(rng, 0.9), style: 'Counter-puncher' }, randomBot(rng, 0.9), 0x5eed);
m.skipIntro();
for (let i = 0; i < 1800 && m.phase !== 'end'; i++) m.step();
mix(matchHash(m));
const full = simFingerprint();
if (h >>> 0 !== full) throw new Error(`fingerprint.ts changed: ${(h >>> 0).toString(16)} here, ${full.toString(16)} there. Update this script to match it.`);
const out = new URL('../../net/fp_data.gd', import.meta.url);
writeFileSync(
  out,
  `## Written by tools/net/fingerprint.ts from the web game (src/net/fingerprint.ts): don't edit.
## DATA is the game data's part of the sim fingerprint; WEB is the web game's whole fingerprint,
## which this app's must equal for players on the two to share a room (tests/net/fingerprint.gd).
class_name FpData
extends RefCounted

const DATA := ${dataHash}
const WEB := ${full}
`,
);
console.log(`data ${dataHash.toString(16)}, fingerprint ${full.toString(16)} -> godot/net/fp_data.gd`);
