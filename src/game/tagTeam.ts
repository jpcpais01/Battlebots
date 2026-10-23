import { Rng } from '../sim/math';
import { computeBuild } from './items';
import { randomBot, randomName, type BotSpec } from './loadout';
import { contrastingPaint, paintsContrast, samePaint, SCHEMES, type Paint } from './paint';
import { opponentSkin } from './gacha';

/**
 * Tag team's side of the menus that isn't a screen: the rival teams (two AI bots matched to the
 * player's pair, in one team livery), a partner made up for a player with no saved bots (in the
 * player's colours turned round), and the teams' names.
 */

/** Team names: an adjective and a noun (the player's pair always gets the same one). */
const FIRST = ['Iron', 'Neon', 'Midnight', 'Atomic', 'Chrome', 'Thunder', 'Rust', 'Voltage', 'Scrap', 'Titan', 'Hex', 'Nitro', 'Crimson', 'Static', 'Molten', 'Cobalt', 'Savage', 'Hyper'];
const SECOND = ['Wolves', 'Hammers', 'Syndicate', 'Crushers', 'Vipers', 'Dynamos', 'Wreckers', 'Furnace', 'Brigade', 'Outlaws', 'Riot', 'Pistons', 'Jackals', 'Avalanche', 'Cartel', 'Comets', 'Reapers', 'Twins'];

/** A bot's fight rating (its power). */
export const power = (spec: BotSpec) => computeBuild(spec.loadout, spec.size ?? 1).rating;

/** A random bot whose power is close to `target` (the best of 40 tries, as the one-on-one opponent). */
function near(rng: Rng, target: number, avoid?: Paint) {
  let best: BotSpec | null = null;
  let bestD = Infinity;
  for (let i = 0; i < 40; i++) {
    const b = randomBot(rng, rng.next(), avoid);
    const d = Math.abs(power(b) - target);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best!;
}

/**
 * The same scheme turned round for a teammate: main and second colour swapped, same glow, finish
 * and frame (a team reads as one, each bot still its own).
 */
export const teammatePaint = (p: Paint): Paint => ({ ...p, primary: p.secondary, secondary: p.primary });

/** Whether paint `p` stands out against every one of `others` (both ways). */
const contrasts = (p: Paint, others: Paint[]) => others.every((o) => paintsContrast(p, o) && paintsContrast(o, p));

/** A team livery against the player's pair: [the starter's paint, the partner's]. */
function rivalPaints(mine: Paint[], rng: Rng): [Paint, Paint] {
  const ok = SCHEMES.filter((s) => contrasts(s.paint, mine));
  const lead = { ...(ok.length ? rng.pick(ok).paint : contrastingPaint(mine[0], rng)) };
  let mate = teammatePaint(lead);
  if (!contrasts(mate, mine)) {
    // (turned round it's too close to one of ours: a second scheme that isn't)
    const rest = ok.filter((s) => !samePaint(s.paint, lead));
    mate = { ...(rest.length ? rng.pick(rest).paint : lead) };
  }
  return [lead, mate];
}

/**
 * Two rivals for the player and `partner`: each about as strong as the bot it lines up against
 * (90 to 110%), in one team's livery, maybe in a skin.
 */
export function makeRivals(player: BotSpec, partner: BotSpec, rng: Rng): [BotSpec, BotSpec] {
  const paints = rivalPaints([player.paint, partner.paint], rng);
  const out = [player, partner].map((against, k) => {
    const b = near(rng, power(against) * rng.range(0.9, 1.1), paints[k]);
    b.paint = paints[k];
    const skin = opponentSkin(() => rng.next());
    if (skin) b.skin = skin;
    return b;
  }) as [BotSpec, BotSpec];
  // (two bots of one team never share a name)
  while (out[1].name === out[0].name) out[1].name = randomName(rng);
  return out;
}

/** A partner for a player with no saved bots: about as strong as their bot (a touch weaker), in its colours turned round. */
export function makePartner(player: BotSpec, rng: Rng): BotSpec {
  const p = near(rng, power(player) * rng.range(0.9, 1), player.paint);
  p.paint = teammatePaint(player.paint);
  while (p.name === player.name) p.name = randomName(rng);
  return p;
}

/** A team's name ("The Neon Wreckers"). */
export const teamName = (rng: Rng) => `The ${rng.pick(FIRST)} ${rng.pick(SECOND)}`;

/** The player's pair's name: always the same for the same two bots. */
export function ourName(a: BotSpec, b: BotSpec) {
  let h = 2166136261;
  for (const c of `${a.name}+${b.name}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return teamName(new Rng(h >>> 0));
}
