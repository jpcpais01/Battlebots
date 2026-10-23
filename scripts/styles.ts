/**
 * Fighting styles head to head: how often each style beats each other one, and how each does
 * against a bot left to pick its own (Auto). Every pairing is fought both ways round with the
 * same two bots, so the bots' parts cancel out.
 *   npx tsx scripts/styles.ts [fights per pairing=20] [seed] [only pairings with this style]
 */
import { Match, SIM_DT } from '../src/sim/match';
import { randomBot, type BotSpec } from '../src/game/loadout';
import { Rng } from '../src/sim/math';
import { FIGHT_STYLES } from '../src/sim/brain';

const N = Number(process.argv[2] ?? 20);
const rng = new Rng(Number(process.argv[3] ?? 77));
const STYLES = [...FIGHT_STYLES, 'Auto'];
const ONLY = process.argv[4] ?? '';

/** 1 if a wins, 0 if b does, 0.5 a draw. */
function fight(a: BotSpec, b: BotSpec, seed: number): number {
  const m = new Match(a, b, seed);
  m.skipIntro();
  let guard = 0;
  while (m.phase !== 'end' && guard++ < 140 * 120) m.step(SIM_DT);
  return m.winner?.index === 0 ? 1 : m.winner?.index === 1 ? 0 : 0.5;
}

const with_ = (b: BotSpec, s: string): BotSpec => (s === 'Auto' ? { ...b } : { ...b, style: s });
const score = STYLES.map(() => STYLES.map(() => 0));
const games = STYLES.map(() => STYLES.map(() => 0));
for (let i = 0; i < STYLES.length; i++) {
  for (let j = i + 1; j < STYLES.length; j++) {
    if (ONLY && STYLES[i] !== ONLY && STYLES[j] !== ONLY) continue;
    for (let n = 0; n < N; n++) {
      const a = randomBot(rng), b = randomBot(rng);
      const seed = rng.int(0, 1e9);
      const r1 = fight(with_(a, STYLES[i]), with_(b, STYLES[j]), seed);
      const r2 = 1 - fight(with_(a, STYLES[j]), with_(b, STYLES[i]), seed);
      score[i][j] += r1 + r2;
      score[j][i] += 2 - r1 - r2;
      games[i][j] += 2;
      games[j][i] += 2;
    }
    process.stderr.write('.');
  }
}
process.stderr.write('\n');
const pad = (s: string, w = 16) => s.padEnd(w);
console.log(pad('win % (row vs col)') + STYLES.map((s) => pad(s, 9).slice(0, 9)).join(' ') + '  overall');
for (let i = 0; i < STYLES.length; i++) {
  let t = 0, g = 0;
  const cells = STYLES.map((_, j) => {
    if (i === j) return pad('  -', 9);
    t += score[i][j];
    g += games[i][j];
    return pad(((100 * score[i][j]) / games[i][j]).toFixed(0), 9);
  });
  console.log(pad(STYLES[i]) + cells.join(' ') + '  ' + ((100 * t) / g).toFixed(1));
}
console.log(JSON.stringify(score.map((r, i) => r.map((v, j) => (games[i][j] ? +(v / games[i][j]).toFixed(3) : 0.5)))));
