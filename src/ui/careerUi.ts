import { MOVES } from '../sim/moves';
import { COMPANIES, COMPANY_BY_ID, ITEM_BY_ID, RARITIES, SLOT_LABEL, SLOTS, computeBuild, formatPassive, formatStatLine, scaledStat, type ItemDef, type Rarity, type StatKey } from '../game/items';
import { EARNABLE, equipped, rarityOf } from '../game/catalogue';
import { EVENTS, progressOf, titlesHeld, type EventDef, type RivalDef } from '../game/events';
import {
  RANKS,
  RESTOCK_PRICE,
  buy,
  collection,
  credits,
  owns,
  rankOf,
  restock,
  stock,
  type CareerState,
  type Offer,
  type Reward,
} from '../game/career';
import type { BotSpec } from '../game/loadout';
import type { Record_ } from './store';
import { button, el, esc, hex } from './dom';
import { ABILITY_ICON, ICON, PASSIVE_ICON, SLOT_ICON } from './icons';
import { makerLogo } from './garageParts';
import './careerUi.css';

/**
 * Career mode's screens and pieces: the Parts Market, the trophy shelf, a rival's card, and the
 * prize money and parts a fight pays out on the results.
 */

export interface CareerHost {
  record(): Record_;
  player(): BotSpec;
  thumb(item: ItemDef, rarity: Rarity): string;
  tap(kind?: 'tap' | 'select' | 'back' | 'start'): void;
  /** Save the record (credits and parts changed). */
  save(): void;
  /** Fit a part to the player's bot and save it. */
  fit(item: ItemDef): void;
}

const rarityName = (r: Rarity) => RARITIES[r].name;
const rarityColor = (r: Rarity) => RARITIES[r].color;

/** A part's picture, or its slot's icon while the picture is still being drawn. */
function pic(host: CareerHost, item: ItemDef) {
  const src = host.thumb(item, rarityOf(item));
  return src ? `<img src="${src}" alt="">` : (item.ability && ABILITY_ICON[item.ability]) || SLOT_ICON[item.slot];
}

/** A credits amount with the coin in front. */
export const coins = (n: number, sign = false) => `<span class="cr-coins">${ICON.coin}<b>${sign && n > 0 ? '+' : ''}${credits(n)}</b></span>`;

/** Six little squares, one per part, in each part's tier colour. */
export function gearPips(bot: BotSpec) {
  return `<span class="cr-pips">${SLOTS.map((s) => {
    const it = ITEM_BY_ID.get(bot.loadout[s].id);
    const r = it ? rarityOf(it) : 0;
    return `<i style="--rc:${rarityColor(r)}" title="${esc(SLOT_LABEL[s])}: ${esc(it?.name ?? '')} (${rarityName(r)})"></i>`;
  }).join('')}</span>`;
}

// ------------------------------------------------------------------ the rival card (on the map)
/** The next rival: who they are, what they say, what they fight in, and what beating them pays. */
export function rivalCard(parent: HTMLElement, def: RivalDef, bot: BotSpec, mine: BotSpec, pays: string) {
  const co = COMPANY_BY_ID.get(def.maker)!;
  const theirs = computeBuild(bot.loadout, bot.size).rating;
  const yours = computeBuild(mine.loadout, mine.size).rating;
  const edge = theirs - yours;
  const odds = edge > 40 ? 'tough' : edge > 10 ? 'even-ish' : edge < -40 ? 'soft' : 'even';
  const word = { tough: 'Out-gunned', 'even-ish': 'Slight edge to them', even: 'Even fight', soft: 'You have the edge' }[odds];
  const c = el('div', 'cr-rival', '', parent);
  c.style.setProperty('--mc', co.color);
  c.innerHTML = `
    <div class="rv-top"><span class="lg">${makerLogo(co)}</span><div><b>${esc(def.name)}</b><span>${esc(def.style)} · ${esc(co.short)}${def.size >= 1.1 ? ' · Giant' : def.size <= 0.9 ? ' · Compact' : ''}</span></div></div>
    <p class="rv-bio">${esc(def.bio)}</p>
    <q>${esc(def.taunt)}</q>
    <div class="rv-gear">${gearPips(bot)}<span class="rv-pw ${odds}"><b>${theirs}</b> vs your ${yours} · ${word}</span></div>
    <div class="rv-pays">${pays}</div>`;
  return c;
}

// ------------------------------------------------------------------ results
/**
 * What a career fight paid: each line of prize money counting up, the fame and any rank-up, the
 * part that came with it (with a button to fit it), and the rival's last word.
 */
export function rewardView(parent: HTMLElement, rw: Reward, host: CareerHost, rival: RivalDef | null, rivalWon: boolean, onFit: () => void) {
  const c = host.record().career;
  const box = el('div', 'cr-reward', '', parent);
  const lines = el('div', 'cr-lines', '', box);
  rw.lines.forEach((l, i) => {
    const row = el('div', 'cr-line', `<span>${esc(l.label)}</span>${coins(l.credits, true)}`, lines);
    row.style.setProperty('--d', `${0.25 + i * 0.18}s`);
  });
  const rank = rankOf(c.fame);
  const total = el(
    'div',
    'cr-total',
    `<div class="tt">${coins(0, true)}<span class="bal">Balance ${credits(c.credits)}</span></div>
    <div class="fm"><span class="kicker">${ICON.rank}${esc(rank.name)}</span><i class="bar"><i style="--k:${rank.k.toFixed(3)}"></i></i><span>+${rw.fame} fame</span></div>`,
    box,
  );
  countUp(total.querySelector('.tt b')!, rw.credits, 0.35 + rw.lines.length * 0.18);
  if (rw.rank) el('div', 'cr-rankup', `${ICON.rank}<div><small>Promoted</small><b>${esc(RANKS[rw.rank.to].name)}</b></div>`, box);
  const d = rw.drop;
  if (d) {
    const r = rarityOf(d.item);
    const co = COMPANY_BY_ID.get(d.item.maker)!;
    const card = el(
      'div',
      `cr-drop r${r}${d.dupe ? ' dupe' : ''}`,
      `<div class="pic">${pic(host, d.item)}</div>
      <div class="tx"><small>${d.how === 'crate' ? 'Title crate' : 'Salvaged'} · <em>${rarityName(r)}</em></small><b>${esc(d.item.name)}</b>
      <span>${d.dupe ? `Already yours: scrapped for ${credits(d.scrap)}` : `${esc(co.short)} ${esc(SLOT_LABEL[d.item.slot])} · new`}</span></div>`,
      box,
    );
    card.style.setProperty('--rc', rarityColor(r));
    card.style.setProperty('--d', `${0.6 + rw.lines.length * 0.18}s`);
    const fitted = host.player().loadout[d.item.slot].id === d.item.id;
    if (!d.dupe && !fitted) {
      const b = button('btn small primary', `${ICON.wrench}Fit it`, () => {
        host.tap('select');
        host.fit(d.item);
        b.disabled = true;
        b.innerHTML = `${ICON.check}Fitted`;
        onFit();
      }, card);
      b.title = `Fit ${d.item.name} to your bot`;
    }
  }
  if (rival) el('div', 'cr-quote', `<q>${esc(rivalWon ? rival.win : rival.lose)}</q><span>${esc(rival.name)}</span>`, box);
  return box;
}

/** Roll a number up from zero. */
function countUp(b: Element, to: number, delay: number) {
  const t0 = performance.now() + delay * 1000;
  const dur = 900;
  const step = (now: number) => {
    const k = Math.max(0, Math.min(1, (now - t0) / dur));
    const e = 1 - (1 - k) * (1 - k) * (1 - k);
    b.textContent = `+${credits(to * e)}`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------------ the Parts Market
/** The market's shelf and the highlighted part in full; buying puts it in the collection. */
export function marketView(box: HTMLElement, host: CareerHost, close: () => void) {
  let picked: string | null = null;
  box.classList.add('cr-market');
  const draw = () => {
    const rec = host.record();
    const c = rec.career;
    const offers = stock(c, rec.events);
    if (!picked || !offers.some((o) => o.item.id === picked)) picked = offers.find((o) => !o.sold)?.item.id ?? offers[0]?.item.id ?? null;
    box.replaceChildren();
    const head = el('div', 'set-head', `<h2>${ICON.market}Parts Market</h2>`, box);
    const right = el('div', 'mk-right', `<span class="cr-chip">${coins(c.credits)}</span>`, head);
    button('icon-btn', ICON.close, close, right).title = 'Close';
    const sub = el('div', 'mk-sub', `<span>New stock in ${c.shop.left} fight${c.shop.left === 1 ? '' : 's'}</span>`, box);
    const re = button('btn small', `${ICON.refresh}Restock · ${credits(RESTOCK_PRICE)}`, () => {
      if (!restock(c, true)) return;
      host.tap('select');
      host.save();
      picked = null;
      draw();
    }, sub);
    re.disabled = c.credits < RESTOCK_PRICE;
    const col = collection(c);
    el('span', 'mk-col', col.tiers.map((t) => `<span style="--rc:${t.color}"><i></i>${t.have}/${t.of} ${t.name}</span>`).join(''), sub);

    const body = el('div', 'mk-body', '', box);
    if (!offers.length) {
      el('p', 'muted', EARNABLE.length ? 'You own every part there is. The market has nothing left to sell you.' : 'Nothing on the shelf yet.', body);
      return;
    }
    const grid = el('div', 'mk-grid', '', body);
    for (const o of offers) {
      const r = rarityOf(o.item);
      const t = button(
        `mk-tile r${r}${o.item.id === picked ? ' on' : ''}${o.sold ? ' sold' : ''}${o.locked ? ' locked' : ''}`,
        `<div class="pic">${pic(host, o.item)}</div><b>${esc(o.item.name)}</b>
        <span class="pr">${o.sold ? `${ICON.check}Bought` : o.locked ? `${ICON.lock}${esc(o.locked)}` : coins(o.price)}</span>${o.deal && !o.sold ? '<em class="deal">−30%</em>' : ''}`,
        () => {
          if (picked === o.item.id) return;
          host.tap();
          picked = o.item.id;
          draw();
        },
        grid,
      );
      t.style.setProperty('--rc', rarityColor(r));
    }
    const o = offers.find((x) => x.item.id === picked);
    if (o) offerDetail(el('div', 'mk-detail scroll', '', body), o, host, c, draw);
  };
  draw();
}

function offerDetail(box: HTMLElement, o: Offer, host: CareerHost, c: CareerState, redraw: () => void) {
  const item = o.item;
  const r = rarityOf(item);
  const co = COMPANY_BY_ID.get(item.maker)!;
  const me = host.player();
  const fitted = ITEM_BY_ID.get(me.loadout[item.slot].id)!;
  const now = computeBuild(me.loadout, me.size).rating;
  const then = computeBuild({ ...me.loadout, [item.slot]: equipped(item) }, me.size).rating;
  box.style.setProperty('--rc', rarityColor(r));
  box.style.setProperty('--mc', co.color);
  el(
    'div',
    'od-head',
    `<span class="lg">${makerLogo(co)}</span><div><small><em>${rarityName(r)}</em> · ${esc(co.short)} ${esc(SLOT_LABEL[item.slot])}</small><b>${esc(item.name)}</b></div>`,
    box,
  );
  el('div', 'od-tag', esc(item.tagline), box);
  const stats = (Object.entries(item.stats) as [StatKey, number][]).map(([k, v]) => {
    const s = scaledStat(v, r);
    return `<span class="${s < 0 ? 'neg' : ''}">${esc(formatStatLine(k, s))}</span>`;
  });
  el('div', 'od-stats', stats.join(''), box);
  if (item.ability) el('div', 'od-line', `${ABILITY_ICON[item.ability] ?? ICON.bolt}<span><small>Special move</small><b>${esc(MOVES[item.ability].name)}</b></span>`, box);
  el('div', 'od-line', `${PASSIVE_ICON[item.passive.id] ?? ICON.shield}<span><small>${esc(item.passive.name)}</small>${esc(formatPassive(item.passive, r))}</span>`, box);
  const d = then - now;
  el('div', `od-cmp${d > 0 ? ' up' : d < 0 ? ' down' : ''}`, `In place of your ${esc(fitted.name)}: <b>${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} Power</b>`, box);
  const foot = el('div', 'od-foot', '', box);
  if (o.sold || owns(c, item)) {
    if (fitted.id === item.id) el('span', 'od-own', `${ICON.check}Fitted to your bot`, foot);
    else
      button('btn primary', `${ICON.wrench}Fit it`, () => {
        host.tap('select');
        host.fit(item);
        redraw();
      }, foot);
  } else {
    const b = button('btn primary', o.locked ? `${ICON.lock}${esc(o.locked)}` : `${ICON.coin}Buy · ${credits(o.price)}`, () => {
      if (!buy(c, o)) return;
      host.tap('start');
      host.save();
      redraw();
    }, foot);
    b.disabled = !!o.locked || c.credits < o.price;
    if (!o.locked && c.credits < o.price) el('span', 'od-short', `${credits(o.price - c.credits)} short`, foot);
  }
}

// ------------------------------------------------------------------ the trophy shelf
let artId = 0;

/** A cup (for a cup) or a belt (for a championship), in the event's colour. */
export function trophyArt(e: EventDef) {
  const id = `tg${artId++}`;
  const c = hex(e.color);
  const gold = `<linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#6d470c"/><stop offset=".32" stop-color="#ffe9a8"/><stop offset=".55" stop-color="#e3a62e"/><stop offset="1" stop-color="#5e3d0a"/></linearGradient>`;
  if (e.kind === 'cup')
    return `<svg viewBox="0 0 120 120" class="tr-art"><defs>${gold}</defs>
      <path d="M36 30H23c0 16 7 24 18 26M84 30h13c0 16-7 24-18 26" fill="none" stroke="url(#${id})" stroke-width="5" stroke-linecap="round"/>
      <path d="M34 16h52v24c0 19-11 31-26 33-15-2-26-14-26-33z" fill="url(#${id})"/>
      <path d="M34 25h52v6H34z" fill="${c}" opacity=".95"/>
      <circle cx="60" cy="46" r="7" fill="${c}" stroke="#fff3c4" stroke-width="2"/>
      <path d="M54 73h12v13H54z" fill="url(#${id})"/>
      <path d="M41 86h38l4 9H37z" fill="url(#${id})"/>
      <rect x="31" y="95" width="58" height="10" rx="2.5" fill="#20242e"/><rect x="31" y="95" width="58" height="3" rx="1.5" fill="${c}" opacity=".9"/></svg>`;
  return `<svg viewBox="0 0 120 120" class="tr-art"><defs>${gold}</defs>
    <path d="M4 46h112v28H4z" rx="6" fill="#1b1f29"/><path d="M4 49h112M4 71h112" stroke="${c}" stroke-width="1.6" stroke-dasharray="3 3"/>
    <path d="M14 42h18v36H14zM88 42h18v36H88z" fill="url(#${id})"/>
    <path d="M36 32h48l6 10v36l-6 10H36l-6-10V42z" fill="url(#${id})"/>
    <path d="M42 40h36l4 7v26l-4 7H42l-4-7V47z" fill="#2a1d05" opacity=".35"/>
    <path d="M60 44l12 8v14l-12 8-12-8V52z" fill="${c}" stroke="#fff3c4" stroke-width="2"/>
    <circle cx="23" cy="60" r="3" fill="${c}"/><circle cx="97" cy="60" r="3" fill="${c}"/></svg>`;
}

/** Titles won, the rank, and the gear collected, maker by maker. */
export function trophyView(box: HTMLElement, host: CareerHost, close: () => void) {
  box.replaceChildren();
  box.classList.add('cr-shelf');
  const rec = host.record();
  const c = rec.career;
  const head = el('div', 'set-head', `<h2>${ICON.trophy}Trophy room</h2>`, box);
  button('icon-btn', ICON.close, close, head).title = 'Close';
  const body = el('div', 'sh-body scroll', '', box);

  const shelf = el('div', 'sh-shelf', '', body);
  for (const e of EVENTS) {
    const p = progressOf(rec.events, e.id);
    const t = el('div', `sh-tr${p.titles ? ' won' : ''}`, '', shelf);
    t.style.setProperty('--c', hex(e.color));
    t.innerHTML = `${trophyArt(e)}<b>${esc(e.name)}</b><span>${
      p.titles ? `${e.kind === 'cup' ? 'Won' : 'Champion'}${p.titles > 1 ? ` ×${p.titles}` : ''}${p.titles > 1 ? ` · defended ${p.titles - 1}` : ''}` : e.needs && titlesHeld(rec.events) < e.needs ? `${ICON.lock}Needs ${e.needs} titles` : 'Not won yet'
    }</span>`;
  }

  const rank = rankOf(c.fame);
  const stats = el('div', 'sh-stats', '', body);
  el(
    'div',
    'sh-rank',
    `<span class="kicker">Career rank</span><b>${ICON.rank}${esc(rank.name)}</b><i class="bar"><i style="--k:${rank.k.toFixed(3)}"></i></i>
    <span>${rank.next ? `${credits(rank.toNext)} fame to ${esc(rank.next)}` : 'The top of the sport'}</span>`,
    stats,
  );
  const n = (v: number | string, label: string) => `<div><b>${v}</b><span>${label}</span></div>`;
  el('div', 'sh-nums', n(`${titlesHeld(rec.events)}/${EVENTS.length}`, 'Titles') + n(credits(c.fame), 'Fame') + n(credits(c.earned), 'Credits won') + n(c.found, 'Parts found'), stats);

  const col = collection(c);
  if (col.of) {
    el('div', 'kicker sh-k', `Collection · ${col.have} of ${col.of}`, body);
    const makers = el('div', 'sh-makers', '', body);
    for (const co of COMPANIES) {
      const mine = EARNABLE.filter((it) => it.maker === co.id).sort((a, b) => rarityOf(a) - rarityOf(b) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
      if (!mine.length) continue;
      const have = mine.filter((it) => owns(c, it)).length;
      const row = el(
        'div',
        'sh-mk',
        `<span class="lg">${makerLogo(co)}</span><b>${esc(co.short)}</b><span class="dots">${mine
          .map((it) => `<i class="${owns(c, it) ? 'on' : ''}" style="--rc:${rarityColor(rarityOf(it))}" title="${esc(it.name)} (${rarityName(rarityOf(it))})"></i>`)
          .join('')}</span><em>${have}/${mine.length}</em>`,
        makers,
      );
      row.style.setProperty('--mc', co.color);
    }
  }
}
