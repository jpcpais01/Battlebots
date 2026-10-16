/**
 * Prints the career maths (event rivals, the Parts Market shelf, fight payouts, ranks) for comparing
 * the Godot translation with the web one. The Godot side is godot/tests/career_parity.gd; both must
 * print identical lines.
 */
import { EVENTS, rival, sanitizeEvents } from '../../src/game/events';
import { rankOf, sanitizeCareer, settle, stock, buy, credits } from '../../src/game/career';
import { DEFAULT_PLAYER } from '../../src/game/loadout';
import { Rng } from '../../src/sim/math';
import { SLOTS } from '../../src/game/items';
import { sanitizeBot, sanitizeRecord } from '../../src/game/saves';

const SAVES = "[null, {}, {\"name\": \"  Big Kev  \", \"size\": 1.3, \"palette\": 2, \"loadout\": {\"head\": {\"id\": \"tianyan\", \"rarity\": 4}, \"fist\": {\"id\": \"nope\"}}, \"emotes\": {\"win\": [\"bogus\", \"fistPumps\", \"fistPumps\"], \"taunt\": \"x\"}, \"walkOn\": \"neon\"}, {\"name\": \"x\", \"paint\": {\"primary\": 123, \"secondary\": 456, \"accent\": 789, \"finish\": 1, \"frame\": 0}, \"walkOn\": \"zzz\", \"size\": 0.5}, {\"wins\": 3.7, \"losses\": -2, \"streak\": 2, \"events\": {\"harbor\": {\"run\": 2, \"titles\": 1}}, \"career\": {\"credits\": 900, \"owned\": [\"airride\", \"bogus\", \"tianyan\"], \"shop\": {\"seed\": 5, \"left\": 9, \"sold\": [\"airride\"]}}}]";
const out: string[] = [];
const ev = sanitizeEvents({ harbor: { run: 1, titles: 2 }, grove: { titles: 1 }, falls: { run: 9 } });
out.push(Object.keys(ev).map((k) => `${k}:${ev[k].run}:${ev[k].titles}`).join(','));
const c = sanitizeCareer({ credits: 5000, fame: 300, owned: [], fresh: [], shop: { seed: 4242, left: 2, sold: [] }, earned: 0, found: 0 }, ev);
for (const e of EVENTS)
  for (let r = 0; r < e.rivals.length; r++)
    for (const d of [0, 2]) {
      const b = rival(e, r, DEFAULT_PLAYER, d);
      out.push(`${e.id} ${r} ${d} ${b.name} ${b.size} ${SLOTS.map((s) => b.loadout[s].id + ':' + b.loadout[s].rarity).join(',')} ${b.paint.primary},${b.paint.secondary},${b.paint.accent},${b.paint.finish},${b.paint.frame}`);
    }
const rng = new Rng(77);
for (let i = 0; i < 12; i++) {
  const e = EVENTS[i % EVENTS.length];
  const shelf = stock(c, ev);
  out.push('shelf ' + shelf.map((o) => `${o.item.id}:${o.price}:${o.deal}:${o.sold}:${o.locked}`).join(','));
  if (shelf.length && buy(c, shelf[i % shelf.length])) out.push('bought ' + shelf[i % shelf.length].item.id);
  const rv = rival(e, i % e.rivals.length, DEFAULT_PLAYER, 0);
  const rw = settle(c, { e, round: i % e.rivals.length, defence: i % 2, won: i % 3 !== 0, draw: i % 7 === 0, kind: ['KO', 'TKO', 'Dismantled', 'Decision'][i % 4], title: i % 5 === 4, rival: rv }, rng);
  out.push(`settle ${rw.credits} ${rw.fame} ${rw.lines.map((l) => l.label + '=' + l.credits).join('|')} ${rw.drop ? rw.drop.item.id + ':' + rw.drop.dupe + ':' + rw.drop.scrap + ':' + rw.drop.how : '-'} ${rw.rank ? rw.rank.from + '>' + rw.rank.to : '-'}`);
  // (a restock's seed is random: pin it so both sides stock the same shelf)
  c.shop.seed = 1000 + i;
  out.push(`career ${credits(c.credits)} ${c.fame} ${c.owned.join(',')} ${c.shop.left} ${c.earned} ${c.found}`);
}
for (const f of [0, 59, 60, 799, 5000]) { const k = rankOf(f); out.push(`rank ${f} ${k.i} ${k.name} ${k.next} ${k.toNext} ${k.k.toFixed(6)}`); }
// saves from anywhere made safe (printed as JSON with sorted keys, as Godot prints it)
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v);
for (const x of JSON.parse(SAVES)) {
  out.push(JSON.stringify(sorted(sanitizeBot(x))));
  const r = sanitizeRecord(x);
  r.career.shop.seed = 0;
  out.push(JSON.stringify(sorted(r)));
}
console.log(out.join('\n'));
