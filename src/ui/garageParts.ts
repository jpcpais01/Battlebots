import { MOVES, type MoveId } from '../sim/moves';
import {
  COMPANIES,
  computeBuild,
  formatPassive,
  ITEM_BY_ID,
  itemsForSlot,
  scaledStat,
  setsOf,
  SLOTS,
  STAT_LABEL,
  type CompanyDef,
  type ItemDef,
  type Loadout,
  type Rarity,
  type Slot,
  type StatKey,
} from '../game/items';
import type { BotSpec } from '../game/loadout';
import { button, el, esc } from './dom';
import { ABILITY_ICON, COMPANY_ICON, ICON, PASSIVE_ICON, SLOT_ICON } from './icons';
import './garageParts.css';

/** What the parts menu needs from the app around it. */
export interface PartsHost {
  /** The saved bot. */
  player(): BotSpec;
  thumb(item: ItemDef, rarity: Rarity): string;
  tap(kind?: 'tap' | 'select' | 'back'): void;
  /** Put this bot on the lift without saving it (null: back to the saved bot). */
  showTrial(spec: BotSpec | null): void;
  /** Fit the part for real and save the bot. */
  equip(slot: Slot, id: string): void;
  previewMove(id: MoveId): void;
  /** Redraw the garage around the menu (title, rail, diagnostics). */
  redraw(): void;
}

/** A maker's logo, or its initial while a new maker has no logo drawn yet. */
export const makerLogo = (co: CompanyDef) => (COMPANY_ICON as Partial<Record<string, string>>)[co.id] || `<b class="mono">${esc(co.short.slice(0, 1))}</b>`;

/** "+8%", "+40", "+6cm": a stat amount without its label. */
function amount(k: StatKey, v: number) {
  const a = Math.abs(v);
  const n = k === 'hp' || k === 'stamina' ? Math.round(a) : Math.round(a * 100);
  return { n, text: `${n}${k === 'hp' || k === 'stamina' ? '' : k === 'reach' ? 'cm' : '%'}` };
}

/**
 * The garage's part picker, one maker at a time.
 *
 * A row of maker tabs (each logo carries how many of the bot's parts that maker built), the
 * maker's banner (what it builds for and how close the bot is to its set bonuses), its parts for
 * this slot as tiles, and the highlighted part in full beside them. Highlighting a part puts it
 * on the bot on trial, so the bot, the diagnostics and the set bonuses all show what it would
 * change; Equip (or tapping the tile again) fits it. Leaving the slot drops the trial.
 */
export class PartsMenu {
  /** The part on trial: highlighted but not fitted. */
  private trial: { slot: Slot; id: string } | null = null;

  constructor(private host: PartsHost) {}

  /** The loadout with the part on trial fitted, or null when nothing is on trial. */
  trialLoadout(): Loadout | null {
    const t = this.trial;
    if (!t) return null;
    const p = this.host.player();
    return { ...p.loadout, [t.slot]: { id: t.id, rarity: p.loadout[t.slot].rarity } };
  }

  /** Forget the part on trial (the app puts the saved bot back on the lift). */
  clear() {
    this.trial = null;
  }

  /** The highlighted part in a slot: the one on trial, else the fitted one. */
  private picked(slot: Slot): ItemDef {
    const p = this.host.player();
    const id = this.trial?.slot === slot ? this.trial.id : p.loadout[slot].id;
    return ITEM_BY_ID.get(id)!;
  }

  /** Makers with parts for this slot, in catalogue order. */
  private makers(slot: Slot) {
    const items = itemsForSlot(slot);
    return COMPANIES.map((co) => ({ co, items: items.filter((it) => it.maker === co.id) })).filter((m) => m.items.length);
  }

  /** Highlight a part: on trial if it isn't the fitted one. */
  private pick(slot: Slot, item: ItemDef, watch = true) {
    const p = this.host.player();
    const fitted = p.loadout[slot].id === item.id;
    if (item.id === this.picked(slot).id) return;
    this.host.tap();
    this.trial = fitted ? null : { slot, id: item.id };
    const lo = this.trialLoadout();
    this.host.showTrial(lo ? { ...p, loadout: lo } : null);
    this.host.redraw();
    if (watch && item.ability) setTimeout(() => this.host.previewMove(item.ability!), 220);
  }

  private fit(slot: Slot, item: ItemDef) {
    if (this.host.player().loadout[slot].id === item.id) return;
    this.host.tap('select');
    this.trial = null;
    this.host.equip(slot, item.id);
  }

  /** Arrow keys and Enter, like a pad: ←/→ makers, ↑/↓ parts, Enter fits. Returns whether it used the key. */
  key(slot: Slot, e: KeyboardEvent): boolean {
    const makers = this.makers(slot);
    const cur = this.picked(slot);
    const mi = makers.findIndex((m) => m.co.id === cur.maker);
    const m = makers[mi];
    if (!m) return false;
    if (e.key === 'Enter' || e.key === ' ') {
      this.fit(slot, cur);
      return true;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const next = makers[(mi + (e.key === 'ArrowRight' ? 1 : makers.length - 1)) % makers.length];
      this.pick(slot, this.firstOf(slot, next.items), false);
      return true;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const i = m.items.findIndex((it) => it.id === cur.id);
      const next = m.items[(i + (e.key === 'ArrowDown' ? 1 : m.items.length - 1)) % m.items.length];
      this.pick(slot, next, false);
      return true;
    }
    return false;
  }

  /** Which of a maker's parts to land on: the fitted one if it's theirs, else their first. */
  private firstOf(slot: Slot, items: ItemDef[]) {
    const id = this.host.player().loadout[slot].id;
    return items.find((it) => it.id === id) ?? items[0];
  }

  render(root: HTMLElement, slot: Slot) {
    if (this.trial && this.trial.slot !== slot) this.trial = null;
    const p = this.host.player();
    const eq = p.loadout[slot];
    const fitted = ITEM_BY_ID.get(eq.id)!;
    const cur = this.picked(slot);
    const trialLo = this.trialLoadout() ?? p.loadout;
    const own = new Map(setsOf(p.loadout).map((s) => [s.company.id, s.count]));
    const tried = new Map(setsOf(trialLo).map((s) => [s.company.id, s.count]));
    const makers = this.makers(slot);
    const m = makers.find((x) => x.co.id === cur.maker) ?? makers[0];
    const co = m.co;

    const keepTiles = root.querySelector('.pm-tiles')?.scrollTop ?? 0;
    const keepTabs = root.querySelector('.pm-makers')?.scrollLeft ?? 0;
    root.replaceChildren();

    // maker tabs: logos; the open one spells out its name
    const tabs = el('div', 'pm-makers scroll', '', root);
    for (const x of makers) {
      const n = own.get(x.co.id) ?? 0;
      const here = x.co.id === fitted.maker;
      const b = button(
        `pm-mk${x === m ? ' on' : ''}${here ? ' here' : ''}`,
        `<span class="lg">${makerLogo(x.co)}${n ? `<i>${n}</i>` : ''}</span><b>${esc(x.co.short)}</b>`,
        () => this.pick(slot, this.firstOf(slot, x.items), false),
        tabs,
      );
      b.style.setProperty('--mc', x.co.color);
      b.title = `${x.co.name}${n ? ` · ${n} of your parts` : ''}${here ? ' · makes the part you have fitted' : ''}`;
    }
    tabs.scrollLeft = keepTabs;

    // the maker: who they are, and how close the bot is to their set bonuses
    const n0 = own.get(co.id) ?? 0;
    const n1 = tried.get(co.id) ?? 0;
    const segs = Array.from({ length: SLOTS.length }, (_, k) => {
      const cls = k < Math.min(n0, n1) ? 'on' : k < n1 ? 'gain' : k < n0 ? 'lose' : '';
      const notch = co.sets.some((s) => s.at === k + 1) ? ' notch' : '';
      return `<i class="${cls}${notch}"></i>`;
    }).join('');
    const bonuses = co.sets
      .map((s) => {
        const state = n1 >= s.at ? (n0 >= s.at ? 'on' : 'gain') : n0 >= s.at ? 'lose' : '';
        const note = state === 'gain' ? '<em>Unlocks</em>' : state === 'lose' ? '<em>Lost</em>' : '';
        return `<span class="${state}"><b>${s.at}</b>${esc(s.text)}${note}</span>`;
      })
      .join('');
    const brand = el(
      'div',
      'pm-brand',
      `<div class="lg">${makerLogo(co)}</div>
      <div class="nm"><b>${esc(co.name)}</b><span>${esc(co.motto)} <em>${esc(co.focus)}</em></span></div>
      <div class="meter" title="${n1} of ${SLOTS.length} parts from ${esc(co.short)}">${segs}</div>
      <div class="bon">${bonuses}</div>`,
      root,
    );
    brand.style.setProperty('--mc', co.color);

    const body = el('div', 'pm-body', '', root);
    body.style.setProperty('--mc', co.color);

    // the maker's parts for this slot
    const tiles = el('div', 'pm-tiles scroll', '', body);
    const rating = computeBuild(p.loadout).rating;
    for (const item of m.items) {
      const on = item.id === cur.id;
      const fit = item.id === eq.id;
      const src = this.host.thumb(item, eq.rarity);
      const pic = src ? `<img src="${src}" alt="">` : (item.ability && ABILITY_ICON[item.ability]) || SLOT_ICON[item.slot];
      const delta = fit ? 0 : computeBuild({ ...p.loadout, [slot]: { id: item.id, rarity: eq.rarity } }).rating - rating;
      const badge = fit ? `<span class="fit">${ICON.check}</span>` : delta ? `<span class="dl${delta > 0 ? ' up' : ' down'}">${delta > 0 ? '+' : '−'}${Math.abs(delta)}</span>` : '';
      const t = button(
        `pm-tile${on ? ' on' : ''}${fit ? ' fitted' : ''}`,
        `<div class="pic">${pic}</div><b>${esc(item.name)}</b>${badge}`,
        () => (on ? this.fit(slot, item) : this.pick(slot, item)),
        tiles,
      );
      t.title = fit ? `${item.name} (fitted)` : on ? `Tap again to fit ${item.name}` : item.name;
    }
    tiles.scrollTop = keepTiles;

    this.detail(el('div', 'pm-detail scroll', '', body), slot, cur, fitted, rating);
  }

  /** The highlighted part in full: what it does, and what it changes against the fitted one. */
  private detail(box: HTMLElement, slot: Slot, item: ItemDef, fitted: ItemDef, rating: number) {
    const p = this.host.player();
    const r = p.loadout[slot].rarity;
    const isFit = item.id === fitted.id;
    const delta = isFit ? 0 : computeBuild({ ...p.loadout, [slot]: { id: item.id, rarity: r } }).rating - rating;

    const head = el('div', 'dt-head', `<b>${esc(item.name)}</b>`, box);
    if (isFit) el('span', 'dt-badge fit', `${ICON.check}Fitted`, head);
    else if (delta) el('span', `dt-badge ${delta > 0 ? 'up' : 'down'}`, `${delta > 0 ? '+' : '−'}${Math.abs(delta)} Power`, head);
    el('div', 'dt-tag', esc(item.tagline), box);

    // stat lines, with the change against the fitted part
    const keys = [...new Set([...Object.keys(item.stats), ...(isFit ? [] : Object.keys(fitted.stats))])] as StatKey[];
    const rows = keys
      .map((k) => {
        const v = scaledStat(item.stats[k] ?? 0, r);
        const f = scaledStat(fitted.stats[k] ?? 0, r);
        const val = v ? `${v > 0 ? '+' : '−'}${amount(k, v).text}` : '—';
        const d = amount(k, v - f);
        const cmp = isFit || !d.n ? '' : `<i>${v > f ? '▲' : '▼'} ${d.text}</i>`;
        const cls = isFit || !d.n ? (v < 0 ? ' neg' : '') : v > f ? ' up' : ' down';
        return `<div class="sr${cls}"><span>${STAT_LABEL[k]}</span><b>${val}</b>${cmp}</div>`;
      })
      .join('');
    el('div', 'dt-stats', rows, box);

    if (item.ability) {
      const mv = MOVES[item.ability];
      const row = el(
        'div',
        'dt-move',
        `<span class="ic">${ABILITY_ICON[item.ability] ?? ICON.bolt}</span><div><small>Special move</small><b>${esc(mv.name)}</b>${mv.cooldown ? `<span>${mv.cooldown}s cooldown</span>` : ''}</div>`,
        box,
      );
      button('dt-watch', `${ICON.play}<span>Watch</span>`, () => {
        this.host.tap();
        this.host.previewMove(item.ability!);
      }, row);
    }
    el(
      'div',
      'dt-pass',
      `<span class="ic">${PASSIVE_ICON[item.passive.id] ?? ICON.shield}</span><div><small>Passive</small><b>${esc(item.passive.name)}</b><span>${esc(formatPassive(item.passive, r))}</span></div>`,
      box,
    );

    const foot = el('div', 'dt-foot', '', box);
    if (isFit) el('div', 'dt-on', `${ICON.check}<span>Fitted to your bot</span>`, foot);
    else {
      button('btn primary dt-eq', `${ICON.wrench}Equip`, () => this.fit(slot, item), foot);
      el('span', 'dt-hint', `On trial · replaces ${esc(fitted.name)}`, foot);
    }
  }
}
