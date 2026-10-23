/**
 * The Android app's Gauntlet (godot/app/gauntlet/gauntlet.gd) on the web sim: whole runs with
 * random boost picks and no coach calls, printing how many stages each run cleared. The boosts
 * and the rival rules below mirror gauntlet.gd's constants: change both together.
 *   node --experimental-transform-types --import ./godot/tools/node/register.mjs scripts/gauntlet.ts [runs] [seed]
 * Knobs (env): H0/HS a rival's grade (GRADE_0/GRADE_STEP), F random boosts a stage (FOE_BOOSTS),
 * BB a boss's extra boosts, BS a boss's frame size.
 */
import { Match, SIM_DT } from '../src/sim/match';
import { randomBot, type BotSpec } from '../src/game/loadout';
import { computeBuild } from '../src/game/items';
import { Rng } from '../src/sim/math';
import { FIGHT_STYLES } from '../src/sim/brain';
import { contrastingPaint } from '../src/game/paint';

const B: Record<string, { tier: number; stats: Record<string, number> }> = {
  heavy_hands: { tier: 0, stats: { punchPower: 0.08 } },
  snap_kicks: { tier: 0, stats: { kickPower: 0.12 } },
  plating: { tier: 0, stats: { armor: 0.025 } },
  frame: { tier: 0, stats: { hp: 100 } },
  quick_hands: { tier: 0, stats: { punchSpeed: 0.06 } },
  light_feet: { tier: 0, stats: { moveSpeed: 0.06, agility: 0.06 } },
  iron_jaw: { tier: 0, stats: { headGuard: 0.04 } },
  low_center: { tier: 0, stats: { stability: 0.12 } },
  gas_tank: { tier: 0, stats: { stamina: 12, staminaRegen: 0.1 } },
  sights: { tier: 0, stats: { accuracy: 0.035 } },
  instinct: { tier: 0, stats: { crit: 0.03 } },
  reflexes: { tier: 0, stats: { reaction: 0.1 } },
  welds: { tier: 0, stats: { toughness: 0.12 } },
  long_arms: { tier: 0, stats: { reach: 0.05 } },
  glass_cannon: { tier: 1, stats: { punchPower: 0.16, kickPower: 0.16, hp: -90 } },
  juggernaut: { tier: 1, stats: { hp: 220, armor: 0.03, moveSpeed: -0.05 } },
  berserker: { tier: 1, stats: { punchSpeed: 0.1, crit: 0.045, headGuard: -0.03 } },
  ghost: { tier: 1, stats: { agility: 0.14, reaction: 0.14, hp: -60 } },
  fortress: { tier: 1, stats: { armor: 0.04, headGuard: 0.04, toughness: 0.1, punchSpeed: -0.04 } },
  overdrive: { tier: 1, stats: { punchPower: 0.06, kickPower: 0.06, punchSpeed: 0.05 } },
};
const IDS = Object.keys(B);
const statsOf = (ids: string[]) => { const o: Record<string, number> = {}; for (const id of ids) for (const [k, v] of Object.entries(B[id].stats)) o[k] = (o[k] ?? 0) + v; return o; };
const roll = (rng: Rng, held: string[], rare: number, not: string[] = []) => {
  const want = rng.next() < rare ? 1 : 0;
  let pool = IDS.filter((id) => B[id].tier === want && held.filter((h) => h === id).length < 3 && !not.includes(id));
  if (!pool.length) pool = IDS.filter((id) => held.filter((h) => h === id).length < 3 && !not.includes(id));
  return pool[Math.floor(rng.next() * pool.length) % pool.length];
};
const boss = (s: number) => s % 5 === 0;
const F = Number(process.env.F ?? 0.6);
const H0 = Number(process.env.H0 ?? -0.42), HS = Number(process.env.HS ?? 0.035);
const foeCount = (s: number) => Math.round(F * (s - 1)) + (boss(s) ? Number(process.env.BB ?? 1) : 0);
function fight(a: BotSpec, b: BotSpec, seed: number): number {
  const m = new Match(a, b, seed);
  m.skipIntro();
  let g = 0;
  while (m.phase !== 'end' && g++ < 140 * 120) m.step(SIM_DT);
  return m.winner?.index === 0 ? 1 : m.winner?.index === 1 ? 0 : 0.5;
}
const rng = new Rng(Number(process.argv[3] ?? 5));
const RUNS = Number(process.argv[2] ?? 6);
const reached: number[] = [];
for (let r = 0; r < RUNS; r++) {
  const player = randomBot(rng, 0.5);
  const mine = computeBuild(player.loadout).rating;
  const held: string[] = [];
  let stage = 1;
  for (; stage < 40; stage++) {
    const target = mine;
    let best = randomBot(rng, rng.next(), player.paint), bd = 1e9;
    for (let i = 0; i < 40; i++) { const b = randomBot(rng, rng.next(), player.paint); const d = Math.abs(computeBuild(b.loadout).rating - target); if (d < bd) { bd = d; best = b; } }
    best.paint = contrastingPaint(player.paint, rng);
    best.style = FIGHT_STYLES[Math.floor(rng.next() * 5) % 5];
    if (boss(stage)) best.size = Number(process.env.BS ?? 1.1);
    const fids: string[] = [];
    for (let i = 0; i < foeCount(stage); i++) fids.push(roll(rng, fids, 0.12));
    const bo = statsOf(fids); const p = H0 + HS * stage;
    for (const k of ['punchPower', 'kickPower']) bo[k] = (bo[k] ?? 0) + p;
    bo.hp = (bo.hp ?? 0) + 1300 * p;
    best.boost = bo;
    const me = { ...player, boost: statsOf(held) };
    let res = 0.5, tries = 0;
    while (res === 0.5 && tries++ < 3) res = fight(me, best, rng.int(0, 1e9));
    if (res < 1) break;
    const offer: string[] = [];
    for (let i = 0; i < 3; i++) offer.push(roll(rng, held, boss(stage) && i === 0 ? 1 : 0.22, offer));
    held.push(offer[Math.floor(rng.next() * 3)]);
  }
  reached.push(stage - 1);
  process.stderr.write(`run ${r}: cleared ${stage - 1} (power ${mine})\n`);
}
reached.sort((a, b) => a - b);
console.log('cleared', reached.join(' '), 'median', reached[Math.floor(reached.length / 2)]);
