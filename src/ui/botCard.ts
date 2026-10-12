import type { Game } from '../game/game';
import { ITEM_BY_ID, RARITIES, SLOTS, type FighterBuild } from '../game/items';
import type { BotSpec } from '../game/loadout';
import { hexColor } from '../game/paint';
import { MOVES, type MoveId } from '../sim/moves';
import { esc } from './dom';
import { ABILITY_ICON, SLOT_ICON } from './icons';

export interface BotCardOpts {
  /** Which screen edge the card hugs: sets the accent colour and mirrors the layout. */
  side: 'l' | 'r';
  /** Small caps label above the name. */
  tag: string;
  /** Delay before the first part tile pops in, in seconds. */
  delay?: number;
}

/** Paint colour of a bot as CSS hex. */
export const paintOf = (spec: BotSpec) => hexColor(spec.paint.primary);

/**
 * Inner HTML of a bot card: tag and power, name, both moves, and the six fitted parts as real
 * renders in the bot's paint, each on a tile glowing in its rarity colour. Goes inside an element
 * with class `bcard l|r` and `--paint` set (see `botCardHtml`).
 */
export function botCardInner(game: Game, spec: BotSpec, build: FighterBuild, o: BotCardOpts) {
  const move = (id: MoveId) => `<span>${ABILITY_ICON[id] ?? ''}${esc(MOVES[id].name)}</span>`;
  const d0 = o.delay ?? 0.35;
  const gear = SLOTS.map((slot, k) => {
    const eq = spec.loadout[slot];
    const item = ITEM_BY_ID.get(eq.id)!;
    let src = '';
    try {
      src = game.thumbs.get(item, eq.rarity, spec.paint, spec.loadout);
    } catch {
      // no WebGL thumbnail: fall back to the slot icon
    }
    return `<div class="g" style="--rc:${RARITIES[eq.rarity].color};--d:${(d0 + k * 0.05).toFixed(2)}s" title="${esc(item.name)} (${RARITIES[eq.rarity].name})">${src ? `<img src="${src}" alt="">` : SLOT_ICON[slot]}</div>`;
  }).join('');
  return `<div class="cap"><span class="tag">${esc(o.tag)}</span><span class="pwr"><small>PWR</small>${build.rating}</span></div>
    <div class="name">${esc(spec.name)}</div>
    <div class="moves">${move(build.fistAbility)}${move(build.kickAbility)}</div>
    <div class="gear">${gear}</div>`;
}

/** A whole bot card element as HTML. */
export function botCardHtml(game: Game, spec: BotSpec, build: FighterBuild, o: BotCardOpts) {
  return `<div class="bcard ${o.side}" style="--paint:${paintOf(spec)}">${botCardInner(game, spec, build, o)}</div>`;
}
