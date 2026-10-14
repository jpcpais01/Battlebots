import * as THREE from 'three';
import type { Game } from '../game/game';
import { COUNTDOWN, type Match, type HitInfo, type DetachInfo, type FinishKind, type FinisherInfo } from '../sim/match';
import { DETACHABLE, LOOSE, P, PART_COUNT, type LossReason } from '../sim/damage';
import type { Fighter } from '../sim/fighter';
import { COACH_COOLDOWN, COACH_KINDS, COACH_LABEL, COACH_TIME, type CoachKind } from '../sim/coach';
import { MOVES, type MoveId } from '../sim/moves';
import { J } from '../sim/body';
import { ITEM_BY_ID } from '../game/items';
import type { Paint } from '../game/paint';
import { button, el, esc } from './dom';
import { ABILITY_ICON, ICON, PASSIVE_ICON, SLOT_ICON } from './icons';
import { saveZoom, type Zoom } from './store';
import { botCardHtml, paintOf } from './botCard';
import { ReplayBar } from './replayBar';
import { WALK_ON_NAME, walkOnFor } from '../audio/walkOn';

const _p = new THREE.Vector3();

interface BarEls {
  root: HTMLElement;
  /** The whole health bar: it shakes on big hits and carries the low / dead states. */
  hp: HTMLElement;
  chip: HTMLElement;
  fill: HTMLElement;
  flash: HTMLElement;
  num: HTMLElement;
  /** Damage taken in the current flurry, beside the name while the chip is up. */
  chipN: HTMLElement;
  /** "Finisher ready" tag, lit while this bot's next landed shot would start one. */
  ready: HTMLElement;
  readyOn: boolean;
  st: HTMLElement;
  abs: { el: HTMLElement; cd: HTMLElement; move?: MoveId; core?: boolean }[];
  /** Where the chip segment ends (health ratio), and how fast it's draining. */
  chipV: number;
  chipVel: number;
  shownHp: number;
  lastNum: number;
  lastChipN: number;
}

/** Match time the chip segment holds after the last hit before it drains. */
const CHIP_HOLD = 0.75;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const luma = (c: number) => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;

/**
 * Two bar colours from a bot's paint: its main and second colour, with any colour too
 * dark to read on the bar's dark track swapped for the bright trim colour. Returns
 * [leading edge, outer end].
 */
export function barColors(p: Paint): [string, string] {
  const ok = (c: number) => (luma(c) < 0.3 ? p.accent : c);
  const a = ok(p.primary);
  let b = ok(p.secondary);
  if (b === a) b = p.accent === a ? p.primary : p.accent;
  // the deeper colour leads, so the bar's edge stands out from the white damage trail
  return luma(a) <= luma(b) ? [hex(a), hex(b)] : [hex(b), hex(a)];
}

/**
 * How long the finisher waits after the knockout, in match time. The KO plays in 0.3×
 * slow motion, so this is about 3 real seconds at normal speed: the fall plays out clean
 * first. It's match time so it follows the speed button and pause.
 */
const FINISH_DELAY = 0.9;

/** The finishing word, split into the pieces that slam in one by one. */
const FINISH_WORD: Record<FinishKind, string[]> = { KO: ['K.', 'O.'], TKO: ['T.', 'K.', 'O.'], Dismantled: ['DIS', 'MAN', 'TLED'] };

/** What was lost, for the finisher's subtitle. */
const LOSS_TEXT: Record<LossReason, string> = { head: 'Head torn off', leg: 'Leg torn off', arms: 'Both arms torn off' };

/**
 * The x-ray condition display: a front-on schematic of the robot (its left arm on the right,
 * as you look at it), one shape per body part, coloured by condition. Parts that could be torn
 * off by the next big hit blink, torn-off parts become a dashed ghost.
 */
const XRAY_SHAPES: string[] = [
  '<rect x="25" y="3" width="14" height="14" rx="4"/>',
  '<path d="M17 21h30l-3 23H20z"/>',
  '<path d="M21 47h22l-2 15H23z"/>',
  '<rect x="49" y="22" width="7" height="19" rx="3"/>',
  '<rect x="50" y="43" width="7" height="17" rx="3"/>',
  '<rect x="49.5" y="62" width="8" height="8" rx="2.5"/>',
  '<rect x="8" y="22" width="7" height="19" rx="3"/>',
  '<rect x="7" y="43" width="7" height="17" rx="3"/>',
  '<rect x="6.5" y="62" width="8" height="8" rx="2.5"/>',
  '<rect x="33.5" y="65" width="8" height="23" rx="3"/>',
  '<rect x="34" y="91" width="7" height="24" rx="3"/>',
  '<rect x="33" y="117" width="11" height="6" rx="2"/>',
  '<rect x="22.5" y="65" width="8" height="23" rx="3"/>',
  '<rect x="23" y="91" width="7" height="24" rx="3"/>',
  '<rect x="20" y="117" width="11" height="6" rx="2"/>',
];
/** The frame inside, drawn over the plates like bones on an x-ray. */
const XRAY_BONES =
  '<path class="xr-bone" d="M32 17v45M20 24h24M23 55h18M52.5 24v18M53.5 44v16M11.5 24v18M10.5 44v16M37.5 62v26M37.5 91v24M26.5 62v26M26.5 91v24"/>' +
  '<g class="xr-joint"><circle cx="32" cy="18" r="1.3"/><circle cx="52.5" cy="23" r="1.3"/><circle cx="11.5" cy="23" r="1.3"/><circle cx="53" cy="42.5" r="1.2"/><circle cx="11" cy="42.5" r="1.2"/><circle cx="37.5" cy="64" r="1.3"/><circle cx="26.5" cy="64" r="1.3"/><circle cx="37.5" cy="89.5" r="1.2"/><circle cx="26.5" cy="89.5" r="1.2"/></g>';

/** Condition colour: teal when healthy, through yellow and orange to red. */
function condColor(c: number) {
  const hue = c > 0.5 ? 50 + (c - 0.5) * 2 * 115 : c * 2 * 50;
  return `hsl(${Math.round(hue)}, 95%, ${Math.round(55 + c * 5)}%)`;
}

interface XrayEls {
  root: HTMLElement;
  shapes: SVGElement[];
  shown: Float32Array;
}

/**
 * Fight overlay: health/stamina bars, clock, ability cooldowns, VS card, countdown,
 * callouts, referee count, KO/TKO finisher and floating damage numbers.
 */
/** Button text for each coach call. */
const COACH_BUTTON: Record<CoachKind, string> = {
  go: 'Go in!',
  allIn: 'All in!!!',
  defend: 'Defend',
  head: 'For the head!',
};

export class Hud {
  readonly root: HTMLElement;
  private bars: BarEls[] = [];
  private timer!: HTMLElement;
  private calloutEl: HTMLElement;
  private countEl: HTMLElement;
  private finishEl: HTMLElement;
  private finBan: HTMLElement;
  /** The finisher that ended it, for the knockout's subtitle. */
  private finBy: FinisherInfo | null = null;
  private refEl: HTMLElement;
  private refNum: HTMLElement;
  private refTicks: HTMLElement[];
  private refName: HTMLElement;
  private refState: HTMLElement;
  private refKd: HTMLElement[];
  /** Fighter being counted, when the count started, the number shown, and when they rose (0 = still down). */
  private ref: { f: Fighter; at: number; n: number; upAt: number } | null = null;
  private kdSeen = [0, 0];
  private kdEls: HTMLElement[] = [];
  private finishing = false;
  private pendingFinish: { kind: FinishKind; winner: Fighter; reason: LossReason | null } | null = null;
  private dmgLayer: HTMLElement;
  /** Visor laid over a bot's-eye shot: vignette, scanlines, corner brackets and whose eyes these are. */
  private visor: HTMLElement;
  private visorTag: HTMLElement;
  private visorBy = -1;
  /** The intro: a presentation panel per fighter (card and name banner). */
  private vs: HTMLElement | null = null;
  private presents: HTMLElement[] = [];
  private shownPresent = -1;
  private speedBtn!: HTMLButtonElement;
  private zoomBtn!: HTMLButtonElement;
  private match: Match | null = null;
  /** Online fight: which side is this player's (null offline). */
  private online: { me: number } | null = null;
  private netEl!: HTMLElement;
  private unsub: (() => void) | null = null;
  private lastCount = -1;
  private lastCalloutAt = 0;
  private hpPrev = [0, 0];
  private healAcc = [0, 0];
  private dmgCount = 0;
  private xrays: XrayEls[] = [];
  onPause: () => void = () => {};
  /** The player tapped a coach call. */
  onCoach: (kind: CoachKind) => void = () => {};
  /** The coach's buttons (none in a replay), and the state they last showed. */
  private coachBar: HTMLElement | null = null;
  private coachBtns: { kind: CoachKind; el: HTMLButtonElement }[] = [];
  private coachShown = '';
  /** The call tapped and still waiting for its step (online it's scheduled a little ahead). */
  private coachTapped: CoachKind | null = null;
  /** Watching a replay. */
  private replay = false;
  /** The replay's media controls (kept across the seeks that swap the match underneath). */
  private rbar: ReplayBar | null = null;
  /** The replay's controls asked for the results screen. */
  onReplayResults: () => void = () => {};

  constructor(private game: Game, parent: HTMLElement) {
    this.root = el('div', 'screen hud', '', parent);
    this.visor = el('div', 'pov-visor', '<i class="pv-c"></i><span class="pv-tag"></span>', this.root);
    this.visorTag = this.visor.querySelector('.pv-tag')!;
    this.dmgLayer = el('div', 'dmg-layer', '', this.root);
    this.calloutEl = el('div', 'callout', '', this.root);
    this.countEl = el('div', 'count', '', this.root);
    this.finishEl = el('div', 'finish', '', this.root);
    this.finBan = el('div', 'finban', '', this.root);
    this.refEl = el(
      'div',
      'refcount',
      `<div class="rc-ring">${Array.from({ length: 10 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}<b></b></div>
      <div class="rc-txt"><span class="rc-name"></span><span class="rc-state"></span></div>
      <div class="rc-kd"><span>Knockdowns</span><em></em><em></em><em></em></div>`,
      this.root,
    );
    this.refNum = this.refEl.querySelector('b')!;
    this.refTicks = [...this.refEl.querySelectorAll<HTMLElement>('.rc-ring i')];
    this.refName = this.refEl.querySelector('.rc-name')!;
    this.refState = this.refEl.querySelector('.rc-state')!;
    this.refKd = [...this.refEl.querySelectorAll<HTMLElement>('.rc-kd em')];
  }

  // ----------------------------------------------------------------- setup
  attach(match: Match, online: { me: number } | null = null, replay = false) {
    // (a replay's controls stay up from one seek to the next; dropped below if not wanted)
    this.detach(true);
    this.match = match;
    this.online = online;
    this.replay = replay;
    this.lastCount = -1;
    this.visorBy = -1;
    this.visor.classList.remove('on');
    this.ref = null;
    this.refEl.className = 'refcount';
    this.kdSeen = [0, 0];
    this.finishing = false;
    this.pendingFinish = null;
    this.finishEl.className = 'finish';
    this.finishEl.innerHTML = '';
    this.finBan.className = 'finban';
    this.finBan.innerHTML = '';
    this.finBy = null;
    this.root.classList.remove('finished');
    this.dmgLayer.innerHTML = '';
    this.hpPrev = match.fighters.map((f) => f.hp);
    this.healAcc = [0, 0];
    this.build(match);
    // a replay may be attached mid-fight, after a seek
    if (match.phase === 'intro') this.showVs(match);
    for (const f of match.fighters) {
      this.kdSeen[f.index] = f.knockdowns;
      if (f.knockdowns) this.markKnockdowns(f);
    }
    const tape = this.game.tape;
    if (!replay || !tape) this.closeReplayBar();
    else if (this.rbar?.tape !== tape) {
      this.closeReplayBar();
      this.rbar = new ReplayBar(this.game, tape, this.root);
      this.rbar.onResults = () => this.onReplayResults();
    }
    this.unsub = match.on((t, d) => this.onEvent(t, d));
  }

  /** Take the replay's controls away (its results are up, or it's over). */
  closeReplayBar() {
    this.rbar?.dispose();
    this.rbar = null;
  }

  /** Stop following the match. `keepBar`: a replay seek, which re-attaches when it lands. */
  detach(keepBar = false) {
    if (!keepBar) this.closeReplayBar();
    this.unsub?.();
    this.unsub = null;
    this.match = null;
    this.vs?.remove();
    this.vs = null;
    this.presents = [];
    this.shownPresent = -1;
    this.root.classList.remove('intro');
  }

  private build(m: Match) {
    this.root.querySelector('.hud-top')?.remove();
    this.root.querySelector('.hud-bl')?.remove();
    this.root.querySelector('.hud-br')?.remove();
    this.root.querySelector('.coach-bar')?.remove();
    for (const x of this.root.querySelectorAll('.xray')) x.remove();
    const top = el('div', 'hud-top', '', this.root);
    this.bars = [];
    this.kdEls = [];
    const mk = (i: number) => {
      const f = m.fighters[i];
      const spec = m.specs[i];
      const right = i === 1;
      const root = el('div', `fbar ${right ? 'right' : 'p1'}`);
      const [ca, cb] = barColors(spec.paint);
      root.style.setProperty('--c1', ca);
      root.style.setProperty('--c2', cb);
      // the referee count and finisher pick up the same colours
      this.root.style.setProperty(`--bot${i}`, ca);
      const nm = el('div', 'nm', right ? `<small>PWR ${f.build.rating}</small>${esc(spec.name)}` : `${esc(spec.name)}<small>PWR ${f.build.rating}</small>`, root);
      this.kdEls.push(el('span', 'kd', '<i></i><i></i><i></i>', nm));
      const chipN = el('span', 'chipn', '', nm);
      // frame > bar > chip (recent damage), fill (the bot's paint), the cell notches and a hit flash
      const hp = el('div', 'hp', '', root);
      const bar = el('div', 'hp-bar', '', el('div', 'hp-frame', '', hp));
      const chip = el('i', 'chip', '', bar);
      const fill = el('i', 'fill', '', bar);
      el('i', 'cells', '', bar);
      const flash = el('i', 'flash', '', bar);
      const num = el('b', 'hp-num', String(Math.round(f.hp)), hp);
      const stw = el('div', 'st', '', root);
      const st = el('i', '', '', stw);
      const abil = el('div', 'abil', '', root);
      const ready = el('div', 'finready', `${ICON.bolt}<span>Finisher ready</span>`, root);
      const abs: BarEls['abs'] = [];
      const addAb = (html: string, title: string, move?: MoveId, core = false) => {
        const a = el('div', `ab${core ? ' core' : ''}`, html, abil);
        a.title = title;
        const cd = el('div', 'cd', '', a);
        abs.push({ el: a, cd, move, core });
      };
      const fa = f.build.fistAbility, ka = f.build.kickAbility;
      addAb(ABILITY_ICON[fa] ?? SLOT_ICON.fist, MOVES[fa].name, fa);
      addAb(ABILITY_ICON[ka] ?? SLOT_ICON.kick, MOVES[ka].name, ka);
      const core = ITEM_BY_ID.get(spec.loadout.core.id)!;
      addAb(PASSIVE_ICON[core.passive.id] ?? SLOT_ICON.core, f.build.stalled.includes('core') ? 'Engine stalled' : core.passive.name, undefined, true);
      if (right) abil.style.flexDirection = 'row-reverse';
      const hp0 = Math.max(0, f.hpRatio);
      this.bars.push({ root, hp, chip, fill, flash, num, chipN, ready, readyOn: false, st, abs, chipV: hp0, chipVel: 0, shownHp: hp0, lastNum: Math.round(f.hp), lastChipN: 0 });
      return root;
    };
    top.appendChild(mk(0));
    this.timer = el('div', 'timer', '99', top);
    top.appendChild(mk(1));

    // each condition panel hangs under its robot's bars
    this.xrays = [0, 1].map((i) => {
      const root = el(
        'div',
        `xray ${i ? 'p2' : 'p1'}`,
        `<div class="xr-head"><i></i>Condition</div><svg viewBox="0 0 64 126">${XRAY_SHAPES.map((sh) => sh.replace('/>', ' class="xp"/>')).join('')}${XRAY_BONES}</svg>`,
        this.bars[i].root,
      );
      root.title = `${m.fighters[i].name}: condition of each part`;
      const shapes = [...root.querySelectorAll<SVGElement>('.xp')];
      // (a replay seek attaches with the damage already done)
      const cond = m.fighters[i].parts.cond;
      shapes.forEach((sh, p) => {
        sh.style.setProperty('--pc', condColor(cond[p]));
        if (cond[p] < 1) sh.classList.toggle('loose', DETACHABLE[p] ? cond[p] < LOOSE : cond[p] <= 0);
      });
      return { root, shapes, shown: Float32Array.from(cond) };
    });

    const bl = el('div', 'hud-bl', '', this.root);
    button('icon-btn', this.online ? ICON.menu : ICON.pause, () => this.onPause(), bl);
    this.netEl = el('div', 'net-pill', '', bl);
    this.netEl.hidden = !this.online;
    if (this.replay) el('div', 'replay-pill', 'Replay', bl);
    const br = el('div', 'hud-br', '', this.root);
    this.zoomBtn = button('icon-btn zoom', '', () => this.cycleZoom(), br);
    this.syncZoom();
    // both phones play an online fight at the same pace, so it has no speed control
    this.speedBtn = button('icon-btn speed', '1×', () => this.cycleSpeed(), br);
    // (a replay has its own, in its controls)
    this.speedBtn.hidden = !!this.online || this.replay;

    // the corner: four calls, one shared cooldown. A replay plays its calls back instead
    this.coachBar = null;
    this.coachBtns = [];
    this.coachShown = '';
    this.coachTapped = null;
    if (!this.replay) {
      const bar = el('div', 'coach-bar off', '', this.root);
      this.coachBar = bar;
      for (const kind of COACH_KINDS) {
        const b = button('coach-btn', `<span>${COACH_BUTTON[kind]}</span><i class="cb-left"></i>`, () => this.coach(kind), bar);
        b.dataset.k = kind;
        this.coachBtns.push({ kind, el: b });
      }
    }
  }

  private coach(kind: CoachKind) {
    const m = this.match;
    if (!m || !m.coachReady(this.online?.me ?? 0)) return;
    this.coachTapped = kind;
    this.game.sfx?.ui('tap');
    this.onCoach(kind);
  }

  /** Cooldown sweep, the call that's on and how long it has left. */
  private updateCoach(m: Match) {
    const bar = this.coachBar;
    if (!bar) return;
    const side = this.online?.me ?? 0;
    const br = m.brains[side];
    const live = m.phase === 'fight' && !m.winner;
    const active = br.coach && m.time < br.coachUntil ? br.coach : null;
    const pending = m.coachPending(side);
    if (!pending) this.coachTapped = null;
    const ready = m.coachReady(side);
    const cd = ready || pending ? 0 : Math.max(0, m.coachReadyAt[side] - m.time) / COACH_COOLDOWN;
    const left = active ? (br.coachUntil - m.time) / COACH_TIME : 0;
    const key = `${live}${active}${this.coachTapped}${ready}${cd.toFixed(3)}${left.toFixed(3)}`;
    if (key === this.coachShown) return;
    this.coachShown = key;
    bar.classList.toggle('off', !live);
    bar.classList.toggle('ready', ready);
    bar.style.setProperty('--cd', cd.toFixed(3));
    for (const b of this.coachBtns) {
      const on = b.kind === active;
      b.el.classList.toggle('on', on);
      b.el.classList.toggle('pending', b.kind === this.coachTapped);
      b.el.disabled = !ready;
      if (on) b.el.style.setProperty('--left', left.toFixed(3));
    }
  }

  /** Connection status in an online fight (text, and ok / warn / bad). */
  setNet(text: string, kind: 'ok' | 'warn' | 'bad') {
    if (!this.netEl || (this.netEl.textContent === text && this.netEl.dataset.k === kind)) return;
    this.netEl.textContent = text;
    this.netEl.dataset.k = kind;
  }

  /** Camera zoom: close → normal → wide → close. */
  private cycleZoom() {
    const d = this.game.director;
    const next: Zoom = d.zoom === 'close' ? 'normal' : d.zoom === 'normal' ? 'wide' : 'close';
    d.zoom = next;
    saveZoom(next);
    this.syncZoom();
    this.game.sfx?.ui('tap');
  }

  syncZoom() {
    if (!this.zoomBtn) return;
    const z = this.game.director.zoom;
    this.zoomBtn.innerHTML = `${ICON.zoom}<span>${z === 'close' ? 'Close' : z === 'wide' ? 'Wide' : 'Normal'}</span>`;
  }

  private cycleSpeed() {
    const g = this.game;
    g.speed = g.speed === 1 ? 2 : g.speed === 2 ? 0.5 : 1;
    this.speedBtn.textContent = g.speed === 0.5 ? '½×' : `${g.speed}×`;
    g.sfx?.ui('tap');
  }

  resetSpeed() {
    this.game.speed = 1;
    if (this.speedBtn) this.speedBtn.textContent = '1×';
  }

  /**
   * The intro: a panel per fighter, shown in turn while the camera presents it. Its card
   * slides in on its corner's side, and its name lands big across the other side, under the
   * robot. Offline, a tap skips to the countdown.
   */
  private showVs(m: Match) {
    const on = this.online;
    const tag = (i: number) => (on ? (i === on.me ? 'You' : 'Opponent') : i ? 'Challenger' : 'Your bot');
    const panel = (i: number) => {
      const spec = m.specs[i];
      const card = botCardHtml(this.game, spec, m.fighters[i].build, { side: i ? 'r' : 'l', tag: tag(i), delay: 0.3 });
      const corner = i ? 'And in the orange corner' : 'In the blue corner';
      const style = m.brains[i].traits.style;
      return `<div class="present ${i ? 'r' : 'l'}" style="--paint:${paintOf(spec)}">${card}
        <div class="banner"><span class="corner">${corner}</span><b class="pname">${esc(spec.name)}</b><span class="style">${esc(style)}</span><span class="tune">${esc(WALK_ON_NAME[walkOnFor(spec)])}</span></div></div>`;
    };
    this.vs = el('div', `vs${on ? '' : ' interactive'}`, `${panel(0)}${panel(1)}`, this.root);
    this.presents = [...this.vs.querySelectorAll<HTMLElement>('.present')];
    this.shownPresent = -1;
    // tapping skips the intro, except online, where both phones have to show the same moment
    if (!on) this.vs.addEventListener('click', () => this.skipIntro());
  }

  private skipIntro() {
    const m = this.match;
    if (!m || m.phase !== 'intro') return;
    // A replay must cut the intro at the same step the fight did (a different cut is a
    // different fight), so it runs ahead to there instead.
    if (this.replay) this.game.fastForward(Infinity, (mm) => mm.phase !== 'intro');
    else m.skipIntro();
  }

  // ----------------------------------------------------------------- per frame
  update(dt: number) {
    this.rbar?.update(dt);
    const m = this.match;
    if (!m) return;
    // the intro: each fighter in turn, then the bars come in for the countdown
    const who = m.presenting;
    if (who !== this.shownPresent) {
      if (this.shownPresent >= 0) this.presents[this.shownPresent]?.classList.replace('on', 'off');
      if (who >= 0) this.presents[who]?.classList.add('on');
      this.shownPresent = who;
    }
    this.root.classList.toggle('intro', m.phase === 'intro');
    const pov = this.game.director.pov;
    if (pov !== this.visorBy) {
      this.visorBy = pov;
      this.visor.classList.toggle('on', pov >= 0);
      if (pov >= 0) {
        this.visor.style.setProperty('--pv', `var(--bot${pov})`);
        this.visorTag.innerHTML = `<b></b>${esc(m.specs[pov].name)} <small>CAM</small>`;
      }
    }
    if (this.vs && m.phase !== 'intro') {
      const v = this.vs;
      this.vs = null;
      v.classList.add('gone');
      setTimeout(() => v.remove(), 450);
    }
    // countdown: 3, 2, 1, with the crowd
    if (m.phase === 'countdown') {
      const n = COUNTDOWN - Math.floor(m.phaseTime);
      if (n !== this.lastCount && n >= 1) {
        this.lastCount = n;
        this.count(String(n));
        this.game.sfx?.countdown(n);
      }
    }
    this.updateCoach(m);
    this.timer.textContent = String(Math.ceil(m.clock));
    this.timer.classList.toggle('hurry', m.clock <= 10 && m.phase === 'fight');

    for (let i = 0; i < 2; i++) {
      const f = m.fighters[i];
      const b = this.bars[i];
      const hp = Math.max(0, f.hpRatio);
      const maxHp = f.build.stats.maxHp;
      this.updateHpBar(b, hp, maxHp, m.time - f.lastHitTime, dt);
      b.st.style.transform = `scaleX(${Math.max(0, f.staminaRatio)})`;
      for (const a of b.abs) {
        if (a.move) {
          const cd = f.cooldownLeft(a.move);
          const max = MOVES[a.move].cooldown ?? 1;
          a.cd.style.height = `${Math.min(100, (cd / max) * 100)}%`;
          a.el.classList.toggle('ready', cd <= 0);
        } else {
          const p = f.build.passives;
          let ready = true;
          let frac = 0;
          if (p.has('aegis')) {
            ready = f.shield;
            frac = f.shield ? 0 : Math.max(0, f.shieldTimer) / Math.max(1, p.get('aegis')!);
          } else if (p.has('overdrive')) ready = f.overdrive > 0;
          a.cd.style.height = `${frac * 100}%`;
          a.el.classList.toggle('ready', ready);
        }
      }
      // one clean shot from a finisher
      const ready = m.canFinish(f);
      if (ready !== b.readyOn) {
        b.readyOn = ready;
        b.root.classList.toggle('finready-on', ready);
      }
      // healing popups (siphon)
      const dh = f.hp - this.hpPrev[i];
      if (dh > 0) this.healAcc[i] += dh;
      if (dh < -0.5) this.hpHit(b, -dh / maxHp);
      else if (dh > 0.5 && m.phase === 'fight') this.hpHeal(b);
      this.hpPrev[i] = f.hp;
      if (this.healAcc[i] >= 12) {
        this.floatAt(f.body.pos[J.Chest], `+${Math.round(this.healAcc[i])}`, 'heal');
        this.healAcc[i] = 0;
      }
    }

    for (let i = 0; i < 2; i++) this.updateXray(m.fighters[i], this.xrays[i]);

    this.updateCount(m);
    const pf = this.pendingFinish;
    if (pf && (m.phase !== 'ko' || m.phaseTime >= FINISH_DELAY)) {
      this.pendingFinish = null;
      if (m.phase === 'ko') this.finish(pf.kind, pf.winner, pf.reason);
    }
    if (this.finishing && m.phase === 'end') {
      this.finishing = false;
      this.finishEl.classList.add('out');
      this.root.classList.remove('finished');
    }
  }

  /**
   * The health bar, fighting-game style: the fill snaps down on a hit and the lost health
   * stays behind as a hot "chip" segment. The chip holds while the hits keep coming, then
   * drains away, slowly at first and faster as it goes, and the flurry's total shows by the
   * name until it's gone. Everything moves by transform, so it costs no layout.
   */
  private updateHpBar(b: BarEls, hp: number, maxHp: number, sinceHit: number, dt: number) {
    b.shownHp += (hp - b.shownHp) * Math.min(1, dt * 22);
    if (hp >= b.chipV) {
      b.chipV = hp; // healing pulls the chip along
      b.chipVel = 0;
    } else if (sinceHit > CHIP_HOLD) {
      b.chipVel = Math.min(1.4, b.chipVel + dt * 1.6);
      b.chipV = Math.max(hp, b.chipV - b.chipVel * dt);
    } else b.chipVel = 0;
    // both layers are full-width and slide out of the bar, so the leading edge keeps its colour
    b.fill.style.transform = `translateX(${(b.shownHp - 1) * 100}%)`;
    b.chip.style.transform = `translateX(${(Math.max(b.chipV, b.shownHp) - 1) * 100}%)`;
    const n = Math.ceil(b.shownHp * maxHp - 0.01);
    if (n !== b.lastNum) {
      b.lastNum = n;
      b.num.textContent = String(Math.max(0, n));
    }
    const lost = Math.round((b.chipV - hp) * maxHp);
    if (lost >= 5 && lost !== b.lastChipN) {
      b.chipN.textContent = `-${lost}`;
      if (lost > b.lastChipN) b.chipN.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' });
      b.chipN.classList.add('on');
    } else if (lost < 5 && b.lastChipN >= 5) b.chipN.classList.remove('on');
    b.lastChipN = lost;
    const cls = b.hp.classList;
    cls.toggle('low', hp < 0.25 && hp > 0);
    cls.toggle('dead', hp <= 0);
  }

  /** A hit lands on the bar: a white flash, and a shake that grows with the damage. */
  private hpHit(b: BarEls, frac: number) {
    b.flash.style.background = '#fff';
    b.flash.animate([{ opacity: Math.min(0.9, 0.35 + frac * 6) }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
    if (frac < 0.035) return;
    const a = Math.min(6, 1.5 + frac * 40);
    b.hp.animate(
      [
        { transform: 'none' },
        { transform: `translate(${a}px, ${-a * 0.5}px)` },
        { transform: `translate(${-a * 0.8}px, ${a * 0.3}px)` },
        { transform: `translate(${a * 0.4}px, 0)` },
        { transform: 'none' },
      ],
      { duration: 280, easing: 'ease-out' },
    );
  }

  /** Health coming back (siphon) glows green along the bar. */
  private hpHeal(b: BarEls) {
    if (b.flash.getAnimations().length) return;
    b.flash.style.background = 'linear-gradient(90deg, rgba(90, 255, 170, 0), rgba(90, 255, 170, 0.55))';
    b.flash.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 500, easing: 'ease-out' });
  }

  /** Recolour the x-ray where a part's condition changed; flash it if it just took damage. */
  private updateXray(f: Fighter, x: XrayEls | undefined) {
    if (!x) return;
    const parts = f.parts;
    for (let p = 0; p < PART_COUNT; p++) {
      const c = parts.cond[p];
      const sh = x.shapes[p];
      if (parts.off[p]) {
        if (!sh.classList.contains('off')) {
          sh.classList.remove('loose', 'hit');
          sh.classList.add('off');
        }
        continue;
      }
      if (Math.abs(c - x.shown[p]) < 0.004) continue;
      if (c < x.shown[p] - 0.01) {
        // restart the flash
        sh.classList.remove('hit');
        void sh.getBoundingClientRect();
        sh.classList.add('hit');
      }
      x.shown[p] = c;
      sh.style.setProperty('--pc', condColor(c));
      sh.classList.toggle('loose', DETACHABLE[p] ? c < LOOSE : c <= 0);
    }
  }

  // ----------------------------------------------------------------- events
  private onEvent(type: string, data: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const m = this.match!;
    switch (type) {
      case 'fightStart':
        this.count('FIGHT!', true);
        this.game.sfx?.countdown(0);
        break;
      case 'finisher':
        this.finisher(data as FinisherInfo);
        break;
      case 'hit': {
        const h = data as HitInfo;
        // a finisher plays without numbers: just the moves
        if (h.finisher) break;
        if (h.shielded) {
          this.floatAt(h.point, 'SHIELD', 'blk');
          break;
        }
        const dmg = Math.round(h.damage);
        if (h.blocked) {
          if (dmg >= 4) this.floatAt(h.point, String(dmg), 'blk');
          if (h.guardBreak) this.callout('GUARD BREAK', 'small cyan');
          break;
        }
        this.floatAt(h.point, h.crit ? `${dmg}!` : String(dmg), h.crit ? 'crit' : '');
        if (h.knockdown) break; // handled below
        if (h.counter && dmg >= 30) {
          this.callout('COUNTER!', 'small');
        } else if (h.crit) {
          this.callout('CRITICAL', 'small');
        }
        break;
      }
      case 'knockdown': {
        const h = data as HitInfo;
        const d = h.defender;
        // the finishing blow also reports a knockdown, after 'ko': the finisher already covers it
        if (m.phase !== 'fight' || d.state === 'ko') break;
        if (d.knockdowns <= this.kdSeen[d.index]) {
          // a leg sweep puts them down but doesn't count toward the TKO
          this.callout('SWEPT!', 'small cyan', 900);
          break;
        }
        this.kdSeen[d.index] = d.knockdowns;
        this.markKnockdowns(d);
        this.callout('KNOCKDOWN!', 'red');
        this.startCount(d, m.time);
        break;
      }
      case 'stagger':
        this.callout('STAGGERED', 'small');
        break;
      case 'dodge':
        if (m.time - this.lastCalloutAt > 1.2) this.callout('DODGE', 'small cyan', 700);
        break;
      case 'strikeStart': {
        const d = data as { f: Fighter; s: { feint: boolean; move: { ability?: string; name: string } } };
        if (d.s.move.ability && !d.s.feint && m.phase === 'fight' && !m.fin) this.abilityTag(d.f, d.s.move.name);
        break;
      }
      case 'shieldUp':
        break;
      case 'detach': {
        const d = data as DetachInfo;
        const what = d.part === P.Head ? 'HEAD' : d.part === P.UpL || d.part === P.UpR ? 'ARM' : d.part === P.ForeL || d.part === P.ForeR ? 'FOREARM' : 'LEG';
        this.callout(`${what} RIPPED OFF!`, 'red', 1500);
        break;
      }
      case 'ropes':
        break;
      case 'coach': {
        const d = data as { f: Fighter; kind: CoachKind };
        this.floatAt(d.f.body.pos[J.Head], COACH_LABEL[d.kind], `coach ${d.kind}`);
        break;
      }
      case 'ko': {
        const d = data as { winner: Fighter; loser: Fighter; kind: FinishKind; reason: LossReason | null };
        this.endCount();
        if (d.kind === 'TKO') this.markKnockdowns(d.loser);
        if (d.kind !== 'Dismantled') this.calloutEl.className = 'callout';
        this.pendingFinish = { kind: d.kind, winner: d.winner, reason: d.reason };
        break;
      }
      case 'decision': {
        this.endCount();
        this.callout('TIME!', '', 1800);
        break;
      }
    }
  }

  // ----------------------------------------------------------------- bits
  private callout(text: string, cls = '', ms = 1100) {
    const c = this.calloutEl;
    c.className = 'callout';
    void c.offsetWidth; // restart animation
    c.className = `callout go ${cls}`;
    c.style.animationDuration = `${ms}ms`;
    c.textContent = text;
    this.lastCalloutAt = this.match?.time ?? 0;
  }

  /** A countdown number or FIGHT!: slams in over a ring that bursts outward. */
  private count(text: string, go = false) {
    const c = this.countEl;
    c.className = 'count';
    c.innerHTML = `<i></i><b>${text}</b>`;
    void c.offsetWidth;
    c.className = `count go${go ? ' fight' : ''}`;
  }

  /** Knockdown pips beside the fighter's name: three of them is a TKO. */
  private markKnockdowns(f: Fighter) {
    const kd = this.kdEls[f.index];
    if (!kd) return;
    kd.classList.add('on');
    kd.title = `${f.knockdowns} of 3 knockdowns`;
    [...kd.children].forEach((p, k) => p.classList.toggle('on', k < f.knockdowns));
  }

  // ----------------------------------------------------------------- referee count
  private startCount(f: Fighter, at: number) {
    this.ref = { f, at, n: 0, upAt: 0 };
    this.refEl.className = `refcount on ${f.index ? 'p2' : 'p1'}`;
    this.refName.textContent = f.name;
    this.refState.textContent = 'is down';
    this.refNum.textContent = '';
    for (const t of this.refTicks) t.classList.remove('on');
    this.refKd.forEach((p, k) => p.classList.toggle('on', k < f.knockdowns));
    this.refEl.classList.toggle('last', f.knockdowns >= 2);
  }

  private updateCount(m: Match) {
    const r = this.ref;
    if (!r) return;
    if (r.upAt) {
      if (m.time - r.upAt > 1) this.endCount();
      return;
    }
    // a try that gives out is still on the canvas: the count goes on
    if (r.f.state === 'down' || (r.f.state === 'getup' && r.f.getupFail)) {
      const t = m.time - r.at;
      const n = t < 0.35 ? 0 : Math.min(10, 1 + Math.floor(t - 0.35));
      if (n > r.n) {
        r.n = n;
        this.refNum.textContent = String(n);
        this.restart(this.refNum, 'pop');
        this.refTicks.forEach((tk, k) => tk.classList.toggle('on', k < n));
        this.game.sfx?.ui('tap');
      }
    } else if (r.f.state === 'getup' || r.f.state === 'fight' || r.f.state === 'ready') {
      r.upAt = m.time;
      this.refEl.classList.add('up');
      this.refNum.textContent = 'UP';
      this.restart(this.refNum, 'pop');
      this.refState.textContent = 'beats the count';
    } else this.endCount();
  }

  private endCount() {
    this.ref = null;
    this.refEl.classList.remove('on');
  }

  private restart(e: HTMLElement, cls: string) {
    e.classList.remove(cls);
    void e.offsetWidth;
    e.classList.add(cls);
  }

  // ----------------------------------------------------------------- finisher
  /**
   * The big end-of-fight word: K.O. slams in with a flash; T.K.O. is a quieter sweep.
   * Shown FINISH_DELAY after the knockout; after a beat it docks as a small title at the
   * top so the fall and celebration show.
   */
  private finish(kind: FinishKind, winner: Fighter, reason: LossReason | null = null) {
    const ko = kind === 'KO';
    const dsm = kind === 'Dismantled';
    this.calloutEl.className = 'callout';
    const word = FINISH_WORD[kind].map((p, i) => `<span data-t="${p}" style="--i:${i}">${p}</span>`).join('');
    const fin = this.finBy && this.finBy.f === winner ? this.finBy.name : null;
    const sub = fin && kind !== 'TKO'
      ? `${esc(winner.name)} finishes it · ${esc(fin)}`
      : ko
      ? `${esc(winner.name)} wins by knockout`
      : dsm
        ? `${reason ? LOSS_TEXT[reason] : 'Torn apart'} · ${esc(winner.name)} wins`
        : `Technical knockout · ${esc(winner.name)} wins`;
    const fx = ko || dsm ? '<div class="fx-flash"></div><div class="fx-ring"></div><div class="fx-ring two"></div>' : '';
    this.finishEl.className = 'finish';
    this.finishEl.innerHTML = `<div class="fx-vig"></div><div class="fx-top"></div>${fx}<div class="fx-band"></div><div class="fx-word">${word}</div><div class="fx-sub">${sub}</div>`;
    void this.finishEl.offsetWidth;
    this.finishEl.className = `finish go ${ko ? 'ko' : dsm ? 'ko dsm' : 'tko'} ${winner.index ? 'p2' : 'p1'}`;
    this.root.classList.add('finished');
    this.finishing = true;
  }

  /** The finisher's name sweeps in low across the screen in the finisher's colours. */
  private finisher(d: FinisherInfo) {
    const i = d.f.index;
    const b = this.finBan;
    this.finBy = d;
    b.className = 'finban';
    b.innerHTML = `<i class="fb-edge"></i><div class="fb-band"><small>${ICON.bolt}Finisher</small><b>${esc(d.name.toUpperCase())}</b><em>${esc(d.f.name)}</em></div>`;
    void b.offsetWidth;
    b.className = `finban go ${i ? 'p2' : 'p1'}`;
    this.calloutEl.className = 'callout';
    this.game.sfx?.ui('start');
  }

  /** Little banner under the fighter's bar naming the ability being thrown. */
  private abilityTag(f: Fighter, name: string) {
    const b = this.bars[f.index];
    const tag = el('div', 'abtag', esc(name.toUpperCase()), b.root);
    setTimeout(() => tag.remove(), 1300);
  }

  /** Floating number anchored at a world position. */
  private floatAt(p: THREE.Vector3, text: string, cls: string) {
    if (this.dmgCount > 14) return;
    const cam = this.game.stage.camera;
    _p.copy(p).project(cam);
    if (_p.z > 1) return;
    const r = this.root.getBoundingClientRect();
    const x = ((_p.x + 1) / 2) * r.width + (Math.random() - 0.5) * 18;
    const y = ((1 - _p.y) / 2) * r.height - 10;
    const d = el('div', `dmg ${cls}`, esc(text), this.dmgLayer);
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    this.dmgCount++;
    d.addEventListener('animationend', () => {
      d.remove();
      this.dmgCount--;
    });
  }
}
