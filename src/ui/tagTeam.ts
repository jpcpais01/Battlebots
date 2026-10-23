import { Rng } from '../sim/math';
import { MOVES } from '../sim/moves';
import { computeBuild } from '../game/items';
import type { BotSpec } from '../game/loadout';
import { hexColor } from '../game/paint';
import { makePartner, makeRivals, ourName, power, teamName } from '../game/tagTeam';
import { button, el, esc } from './dom';
import { ICON } from './icons';
import { loadTagPartner, loadTagTally, saveTagPartner } from './store';
import './tagTeam.css';

/** A tag team match as set up: the player's partner, the rival pair, and both teams' names. */
export interface TagSetup {
  partner: BotSpec;
  rivals: [BotSpec, BotSpec];
  names: [string, string];
}

export interface TagTeamHost {
  player: () => BotSpec;
  saves: () => BotSpec[];
  tap: (k?: 'tap' | 'select' | 'back' | 'start') => void;
  home: () => void;
  fight: (setup: TagSetup) => void;
  /** The last tag team match set up (its rivals stay up for a rematch from here). */
  last: () => TagSetup | null;
}

/**
 * The Tag Team screen: the team sheet before a two-a-side fight, over the ring (the menu camera
 * orbiting the player's bot). The player's team on the left, the rivals on the right, a VS
 * between (stacked, on a narrow screen).
 *   Your team: the player's bot as its captain (it starts in the ring) and a partner on the
 *   apron, picked from the garage's saved bots; with none saved, a made-up recruit in the
 *   player's colours turned round (the dice makes another). The pair's team name.
 *   Rivals: two AI bots, each about as strong as the bot it lines up against, in one team
 *   livery, with a team name. New rivals rolls another team.
 */
export class TagTeamScreen {
  readonly root: HTMLElement;
  /** The partner: one of the saved bots (its index in candidates) or the made-up recruit (-1). */
  private pick = -1;
  private partner: BotSpec | null = null;
  private recruit: BotSpec | null = null;
  private rivals: [BotSpec, BotSpec] | null = null;
  private names: [string, string] = ['', ''];
  private rng = new Rng();
  /** What the rivals were rolled against (the player's bot and partner): a change rolls new ones. */
  private rolledFor = '';
  private tallyEl: HTMLElement;
  private ours: HTMLElement;
  private theirs: HTMLElement;
  private vs: HTMLElement;
  private fightBtn: HTMLButtonElement;

  constructor(private host: TagTeamHost) {
    const s = el('div', 'screen tagteam');
    this.root = s;
    const top = el('div', 'tt-top', '', s);
    button('home-btn', `${ICON.back}${ICON.home}<span>Home</span>`, () => {
      this.host.tap('back');
      this.host.home();
    }, top);
    el('div', 'tt-title', 'TAG TEAM', top);
    this.tallyEl = el('div', 'tt-tally', '', top);
    const body = el('div', 'tt-body scroll interactive', '', s);
    const versus = el('div', 'tt-versus', '', body);
    this.ours = el('div', 'tt-team ours', '', versus);
    this.vs = el('div', 'tt-vs', '<b>VS</b>', versus);
    this.theirs = el('div', 'tt-team theirs', '', versus);
    el('p', 'tt-rules', 'Two bots a side, one in the ring at a time. Tag your partner in at your corner; a knocked-out bot is out, and the last bot standing wins it for its team.', body);
    this.fightBtn = button('btn primary big tt-fight', `${ICON.swords}Fight`, () => this.fight(), body);
  }

  /** The saved bots that can be partners (not a copy of the player's own bot). */
  private candidates() {
    const me = JSON.stringify(this.host.player());
    return this.host.saves().filter((s) => JSON.stringify(s) !== me);
  }

  /** Make saved bot `idx` the partner (-1: the recruit), and roll rivals for the new pair. */
  private choose(idx: number) {
    const c = this.candidates();
    this.pick = idx < c.length ? idx : -1;
    if (this.pick < 0) {
      if (!this.recruit) this.recruit = makePartner(this.host.player(), this.rng);
      this.partner = this.recruit;
      saveTagPartner('');
    } else {
      this.partner = c[this.pick];
      saveTagPartner(this.partner.name);
    }
    this.syncRivals();
    this.show();
  }

  private syncRivals() {
    const key = JSON.stringify([this.host.player(), this.partner]);
    if (key !== this.rolledFor || !this.rivals) this.roll();
  }

  /** A new rival team for the player's pair. */
  private roll() {
    this.rivals = makeRivals(this.host.player(), this.partner!, this.rng);
    this.names[0] = ourName(this.host.player(), this.partner!);
    do this.names[1] = teamName(this.rng);
    while (this.names[1] === this.names[0]);
    this.rolledFor = JSON.stringify([this.host.player(), this.partner]);
  }

  /** One bot of a team: its colours, its role, its name and power, its moves and frame. */
  private member(spec: BotSpec, role: string) {
    const b = computeBuild(spec.loadout, spec.size ?? 1);
    const z = spec.size ?? 1;
    const meta = [MOVES[b.fistAbility].name, MOVES[b.kickAbility].name].join(' · ') + (z !== 1 ? ` · ${Math.round(z * 100)}% frame` : '');
    return `<div class="tt-member" style="--paint:${hexColor(spec.paint.primary)};--accent:${hexColor(spec.paint.accent)}">${swatch(spec)}
      <div class="tt-info"><div class="tt-cap"><span class="tt-role">${esc(role)}</span><span class="tt-pwr">${ICON.bolt}${b.rating}</span></div>
      <b class="tt-name">${esc(spec.name)}</b><span class="tt-meta">${esc(meta)}</span></div></div>`;
  }

  /** Redraw both teams (and the partner choices). */
  private show() {
    const p = this.partner;
    const r = this.rivals;
    if (!p || !r) return;
    const me = this.host.player();
    this.names[0] = ourName(me, p);
    this.ours.innerHTML = `<div class="tt-head"><span class="tt-kick"><i></i>Your team</span><b class="tt-tname">${esc(this.names[0])}</b></div>
      ${this.member(me, 'Captain · starts in the ring')}${this.member(p, 'Partner · on the apron')}
      <div class="tt-kick sub">Choose your partner</div><div class="tt-picker"></div><p class="tt-hint"></p>`;
    const picker = this.ours.querySelector<HTMLElement>('.tt-picker')!;
    const c = this.candidates();
    const choice = (spec: BotSpec, idx: number) => {
      const on = idx === this.pick || (idx < 0 && this.pick < 0);
      const b = button(`tt-choice${on ? ' on' : ''}`, `${idx < 0 ? ICON.dice : ''}${swatch(spec, 'small')}<span>${esc(spec.name)}</span><small>${Math.round(power(spec))}</small>`, () => {
        this.host.tap('select');
        // the recruit again: another one
        if (idx < 0 && this.pick < 0) this.recruit = makePartner(me, this.rng);
        this.choose(idx);
      }, picker);
      b.title = idx < 0 ? 'Sign up a recruit' : `Bring in ${spec.name}`;
    };
    c.forEach((s, i) => choice(s, i));
    if (!this.recruit) this.recruit = makePartner(me, this.rng);
    choice(this.recruit, -1);
    this.ours.querySelector('.tt-hint')!.textContent = c.length ? 'Saved bots from your garage. The dice signs up a recruit.' : 'Save bots in the garage to bring them in as partners. The dice signs up a recruit.';
    this.theirs.innerHTML = `<div class="tt-head"><span class="tt-kick"><i></i>Rivals</span><b class="tt-tname">${esc(this.names[1])}</b></div>
      ${this.member(r[0], 'Starts in the ring')}${this.member(r[1], 'On the apron')}`;
    button('btn small tt-reroll', `${ICON.dice}New rivals`, () => {
      this.host.tap('select');
      this.roll();
      this.show();
      this.theirs.classList.remove('in');
      void this.theirs.offsetWidth;
      this.theirs.classList.add('in');
    }, this.theirs);
    const t = loadTagTally();
    this.tallyEl.innerHTML = `${ICON.team}<span>Record ${t.wins}–${t.losses}${t.draws > 0 ? `–${t.draws}` : ''}</span>`;
  }

  /** Fight: the tag team match, these two against those two. */
  private fight() {
    if (!this.partner || !this.rivals) return;
    this.host.tap('start');
    this.host.fight({ partner: structuredClone(this.partner), rivals: structuredClone(this.rivals), names: [...this.names] });
  }

  enter() {
    // the partner last picked, if it's still saved
    const c = this.candidates();
    const want = loadTagPartner();
    let idx = -1;
    if (this.pick >= 0 && this.pick < c.length && this.partner && JSON.stringify(c[this.pick]) === JSON.stringify(this.partner)) idx = this.pick;
    else if (want) idx = c.findIndex((s) => s.name === want);
    else if (this.pick < 0 && !this.partner && c.length) idx = 0;
    // (the rivals faced last stay up for a rematch from here)
    const last = this.host.last();
    if (last && !this.rivals) {
      this.rivals = structuredClone(last.rivals);
      this.names[1] = last.names[1];
      this.rolledFor = JSON.stringify([this.host.player(), last.partner]);
    }
    this.choose(idx);
    // the teams slide in from their sides, the VS pops between them
    for (const e of [this.ours, this.vs, this.theirs, this.fightBtn]) {
      e.classList.remove('in');
      void e.offsetWidth;
      e.classList.add('in');
    }
  }

  /** The player's bot changed (the garage, a save): the sheet follows. */
  refresh() {
    if (!this.partner) return;
    this.syncRivals();
    this.show();
  }
}

/** A bot's colours as a round badge: its main colour, its second colour below, a ring of its glow. */
function swatch(spec: BotSpec, cls = '') {
  const p = spec.paint;
  return `<i class="tt-sw ${cls}" style="--p1:${hexColor(p.primary)};--p2:${hexColor(p.secondary)};--p3:${hexColor(p.accent)}"></i>`;
}
