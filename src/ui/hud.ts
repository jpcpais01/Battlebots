import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Match, HitInfo, DetachInfo, FinishKind, WearInfo } from '../sim/match';
import { DETACHABLE, LOOSE, P, PART_COUNT, PART_NAME, type LossReason } from '../sim/damage';
import type { Fighter } from '../sim/fighter';
import type { BrainEvent } from '../sim/brain';
import { MOVES, type MoveId } from '../sim/moves';
import { J } from '../sim/body';
import { ITEM_BY_ID } from '../game/items';
import { PALETTES } from '../game/loadout';
import { button, el, esc } from './dom';
import { ABILITY_ICON, ICON, SLOT_ICON } from './icons';
import { saveZoom, type Zoom } from './store';
import { botCardHtml } from './botCard';

const _p = new THREE.Vector3();

interface BarEls {
  root: HTMLElement;
  lag: HTMLElement;
  fill: HTMLElement;
  st: HTMLElement;
  abs: { el: HTMLElement; cd: HTMLElement; move?: MoveId; core?: boolean }[];
  lagV: number;
  shownHp: number;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const luma = (c: number) => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;

/**
 * Two bar colours from a bot's paint: its main and second colour, with any colour too
 * dark to read on the bar's dark track swapped for the bright trim colour. Returns
 * [leading edge, outer end].
 */
export function barColors(palette: number): [string, string] {
  const p = PALETTES[palette % PALETTES.length];
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
 * callouts, referee count, KO/TKO finisher, floating damage numbers and a running
 * commentary line.
 */
export class Hud {
  readonly root: HTMLElement;
  private bars: BarEls[] = [];
  private timer!: HTMLElement;
  private calloutEl: HTMLElement;
  private countEl: HTMLElement;
  private finishEl: HTMLElement;
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
  private commentary: HTMLElement;
  private vs: HTMLElement | null = null;
  private speedBtn!: HTMLButtonElement;
  private zoomBtn!: HTMLButtonElement;
  private match: Match | null = null;
  /** Online fight: which side is this player's (null offline). */
  private online: { me: number } | null = null;
  private netEl!: HTMLElement;
  private unsub: (() => void) | null = null;
  private lastCount = -1;
  private commentT = 0;
  private commentPri = 0;
  private lastCalloutAt = 0;
  private lowWarned = [false, false];
  private tenWarned = false;
  private hpPrev = [0, 0];
  private healAcc = [0, 0];
  private dmgCount = 0;
  private xrays: XrayEls[] = [];
  onPause: () => void = () => {};

  constructor(private game: Game, parent: HTMLElement) {
    this.root = el('div', 'screen hud', '', parent);
    this.dmgLayer = el('div', 'dmg-layer', '', this.root);
    this.calloutEl = el('div', 'callout', '', this.root);
    this.countEl = el('div', 'count', '', this.root);
    this.finishEl = el('div', 'finish', '', this.root);
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
    this.commentary = el('div', 'commentary', '', this.root);
  }

  // ----------------------------------------------------------------- setup
  attach(match: Match, online: { me: number } | null = null) {
    this.detach();
    this.match = match;
    this.online = online;
    this.lastCount = -1;
    this.ref = null;
    this.refEl.className = 'refcount';
    this.kdSeen = [0, 0];
    this.finishing = false;
    this.pendingFinish = null;
    this.finishEl.className = 'finish';
    this.finishEl.innerHTML = '';
    this.root.classList.remove('finished');
    this.lowWarned = [false, false];
    this.tenWarned = false;
    this.commentPri = 0;
    this.commentary.classList.remove('on');
    this.dmgLayer.innerHTML = '';
    this.hpPrev = match.fighters.map((f) => f.hp);
    this.healAcc = [0, 0];
    this.build(match);
    this.showVs(match);
    this.unsub = match.on((t, d) => this.onEvent(t, d));
  }

  detach() {
    this.unsub?.();
    this.unsub = null;
    this.match = null;
    this.vs?.remove();
    this.vs = null;
  }

  private build(m: Match) {
    this.root.querySelector('.hud-top')?.remove();
    this.root.querySelector('.hud-bl')?.remove();
    this.root.querySelector('.hud-br')?.remove();
    for (const x of this.root.querySelectorAll('.xray')) x.remove();
    const top = el('div', 'hud-top', '', this.root);
    this.bars = [];
    this.kdEls = [];
    const mk = (i: number) => {
      const f = m.fighters[i];
      const spec = m.specs[i];
      const right = i === 1;
      const root = el('div', `fbar ${right ? 'right' : 'p1'}`);
      const [ca, cb] = barColors(spec.palette);
      root.style.setProperty('--c1', ca);
      root.style.setProperty('--c2', cb);
      // the referee count and finisher pick up the same colours
      this.root.style.setProperty(`--bot${i}`, ca);
      const nm = el('div', 'nm', right ? `<small>PWR ${f.build.rating}</small>${esc(spec.name)}` : `${esc(spec.name)}<small>PWR ${f.build.rating}</small>`, root);
      this.kdEls.push(el('span', 'kd', '<i></i><i></i><i></i>', nm));
      const hp = el('div', 'hp', '', root);
      const lag = el('i', 'lag', '', hp);
      const fill = el('i', 'fill', '', hp);
      const stw = el('div', 'st', '', root);
      const st = el('i', '', '', stw);
      const abil = el('div', 'abil', '', root);
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
      addAb(SLOT_ICON.core, core.passive.name, undefined, true);
      if (right) abil.style.flexDirection = 'row-reverse';
      this.bars.push({ root, lag, fill, st, abs, lagV: 1, shownHp: 1 });
      return root;
    };
    top.appendChild(mk(0));
    this.timer = el('div', 'timer', '99', top);
    top.appendChild(mk(1));

    this.xrays = [0, 1].map((i) => {
      const root = el(
        'div',
        `xray ${i ? 'p2' : 'p1'}`,
        `<div class="xr-head"><i></i>Condition</div><svg viewBox="0 0 64 126">${XRAY_SHAPES.map((sh) => sh.replace('/>', ' class="xp"/>')).join('')}${XRAY_BONES}</svg>`,
        this.root,
      );
      root.title = `${m.fighters[i].name}: condition of each part`;
      const shapes = [...root.querySelectorAll<SVGElement>('.xp')];
      shapes.forEach((sh) => sh.style.setProperty('--pc', condColor(1)));
      return { root, shapes, shown: new Float32Array(PART_COUNT).fill(1) };
    });

    const bl = el('div', 'hud-bl', '', this.root);
    button('icon-btn', this.online ? ICON.menu : ICON.pause, () => this.onPause(), bl);
    this.netEl = el('div', 'net-pill', '', bl);
    this.netEl.hidden = !this.online;
    const br = el('div', 'hud-br', '', this.root);
    this.zoomBtn = button('icon-btn zoom', '', () => this.cycleZoom(), br);
    this.syncZoom();
    // both phones play an online fight at the same pace, so it has no speed control
    this.speedBtn = button('icon-btn speed', '1×', () => this.cycleSpeed(), br);
    this.speedBtn.hidden = !!this.online;
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

  private showVs(m: Match) {
    const on = this.online;
    const tag = (i: number) => (on ? (i === on.me ? 'You' : 'Opponent') : i ? 'Challenger' : 'Your bot');
    const card = (i: number) => botCardHtml(this.game, m.specs[i], m.fighters[i].build, { side: i ? 'r' : 'l', tag: tag(i) });
    this.vs = el('div', `vs${on ? '' : ' interactive'}`, `${card(0)}${card(1)}<div class="mid"><i></i><b>VS</b><i></i></div>`, this.root);
    // tapping skips the intro, except online, where both phones have to show the same moment
    if (!on) this.vs.addEventListener('click', () => this.match?.skipIntro());
  }

  // ----------------------------------------------------------------- per frame
  update(dt: number) {
    const m = this.match;
    if (!m) return;
    if (this.vs && m.phase !== 'intro') {
      const v = this.vs;
      this.vs = null;
      v.style.transition = 'opacity .3s';
      v.style.opacity = '0';
      setTimeout(() => v.remove(), 320);
    }
    // countdown
    if (m.phase === 'countdown') {
      const n = 3 - Math.floor(m.phaseTime);
      if (n !== this.lastCount && n >= 1) {
        this.lastCount = n;
        this.count(String(n));
        this.game.sfx?.ui('tap');
      }
    }
    this.timer.textContent = String(Math.ceil(m.clock));
    this.timer.classList.toggle('hurry', m.clock <= 10 && m.phase === 'fight');
    if (!this.tenWarned && m.clock <= 10 && m.phase === 'fight') {
      this.tenWarned = true;
      this.comment('Ten seconds left on the clock!', 2);
    }

    for (let i = 0; i < 2; i++) {
      const f = m.fighters[i];
      const b = this.bars[i];
      const hp = Math.max(0, f.hpRatio);
      b.shownHp += (hp - b.shownHp) * Math.min(1, dt * 18);
      // the white "recent damage" bar waits a moment then drains
      if (m.time - f.lastHitTime > 0.6 || hp > b.lagV) b.lagV += (hp - b.lagV) * Math.min(1, dt * 3);
      b.fill.style.transform = `scaleX(${b.shownHp})`;
      b.lag.style.transform = `scaleX(${Math.max(b.lagV, b.shownHp)})`;
      b.fill.parentElement!.classList.toggle('low', hp < 0.25 && hp > 0);
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
      // healing popups (siphon)
      const dh = f.hp - this.hpPrev[i];
      if (dh > 0) this.healAcc[i] += dh;
      this.hpPrev[i] = f.hp;
      if (this.healAcc[i] >= 12) {
        this.floatAt(f.body.pos[J.Chest], `+${Math.round(this.healAcc[i])}`, 'heal');
        this.healAcc[i] = 0;
      }
      if (!this.lowWarned[i] && hp < 0.25 && m.phase === 'fight') {
        this.lowWarned[i] = true;
        this.comment(`${f.name} is running on fumes!`, 2);
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

    this.commentT -= dt;
    if (this.commentT <= 0 && this.commentary.classList.contains('on')) {
      this.commentary.classList.remove('on');
      this.commentPri = 0;
    }
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
        break;
      case 'hit': {
        const h = data as HitInfo;
        if (h.shielded) {
          this.floatAt(h.point, 'SHIELD', 'blk');
          break;
        }
        const dmg = Math.round(h.damage);
        if (h.blocked) {
          if (dmg >= 4) this.floatAt(h.point, String(dmg), 'blk');
          if (h.guardBreak) this.callout('GUARD BREAK', 'small cyan');
          else if (h.move.ability) this.comment(`${h.defender.name} eats the ${h.move.name} on the guard.`, 0);
          break;
        }
        this.floatAt(h.point, h.crit ? `${dmg}!` : String(dmg), h.crit ? 'crit' : '');
        if (h.knockdown) break; // handled below
        if (h.counter && dmg >= 30) {
          this.callout('COUNTER!', 'small');
          this.comment(this.pick([`Beautiful counter ${h.move.name.toLowerCase()} from ${h.attacker.name}!`, `${h.attacker.name} times it perfectly!`, `${h.attacker.name} makes them pay!`]), 1);
        } else if (h.crit) {
          this.callout('CRITICAL', 'small');
          this.comment(this.pick([`Massive ${h.move.name.toLowerCase()} lands clean!`, `${h.attacker.name} finds the gap!`]), 1);
        } else if (h.move.ability) {
          this.comment(this.pick([`${h.move.name} connects!`, `${h.attacker.name} lands the ${h.move.name}!`]), 1);
        } else if (dmg >= 55) {
          this.comment(this.pick([`Huge ${h.move.name.toLowerCase()}!`, `${h.defender.name} felt that one.`, `What a shot from ${h.attacker.name}!`]), 1);
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
          this.comment(this.pick([`${h.attacker.name} sweeps the legs!`, `${d.name} gets tripped up!`]), 2);
          break;
        }
        this.kdSeen[d.index] = d.knockdowns;
        this.markKnockdowns(d);
        this.callout('KNOCKDOWN!', 'red');
        this.comment(this.pick([`Down goes ${d.name}!`, `${h.attacker.name} drops them with a ${h.move.name.toLowerCase()}!`, `${d.name} hits the canvas!`]), 3);
        this.startCount(d, m.time);
        break;
      }
      case 'stagger': {
        const h = data as HitInfo;
        this.callout('STAGGERED', 'small');
        this.comment(this.pick([`${h.defender.name} is wobbled!`, `${h.defender.name}'s legs are gone!`, `${h.attacker.name} has them hurt!`]), 2);
        break;
      }
      case 'dodge': {
        const d = data as { f: Fighter; from: Fighter; s: { move: { name: string; ability?: string } } };
        if (m.time - this.lastCalloutAt > 1.2) this.callout('DODGE', 'small cyan', 700);
        this.comment(this.pick([`${d.f.name} slips the ${d.s.move.name.toLowerCase()}!`, `${d.f.name} makes ${d.from.name} miss!`, `Slick defense from ${d.f.name}.`]), d.s.move.ability ? 1 : 0);
        break;
      }
      case 'whiff': {
        const d = data as { f: Fighter; s: { move: { name: string; ability?: string } } };
        if (d.s.move.ability) this.comment(`${d.f.name} swings the ${d.s.move.name} at air.`, 0);
        break;
      }
      case 'strikeStart': {
        const d = data as { f: Fighter; s: { feint: boolean; move: { ability?: string; name: string } } };
        if (d.s.move.ability && !d.s.feint && m.phase === 'fight') this.abilityTag(d.f, d.s.move.name);
        break;
      }
      case 'shieldUp':
        break;
      case 'detach': {
        const d = data as DetachInfo;
        const what = d.part === P.Head ? 'HEAD' : d.part === P.UpL || d.part === P.UpR ? 'ARM' : d.part === P.ForeL || d.part === P.ForeR ? 'FOREARM' : 'LEG';
        this.callout(`${what} RIPPED OFF!`, 'red', 1500);
        this.comment(
          d.fatal
            ? d.fatal === 'head'
              ? `${d.by.name} takes ${d.f.name}'s head clean off!`
              : d.fatal === 'leg'
                ? `${d.f.name}'s ${PART_NAME[d.part].split(' ')[0]} leg is gone! It can't stand!`
                : `${d.f.name} has no arms left to fight with!`
            : this.pick([`${d.by.name} tears off ${d.f.name}'s ${PART_NAME[d.part]}!`, `The ${PART_NAME[d.part]} goes flying! ${d.f.name} fights on one-armed!`]),
          4,
        );
        break;
      }
      case 'wear': {
        const w = data as WearInfo;
        if (m.phase !== 'fight') break;
        const name = w.f.name;
        const part = PART_NAME[w.part];
        const side = part.split(' ')[0];
        let text = '';
        if (w.level === 1) {
          if (w.part === P.Head) text = `${name}'s head is hanging by a thread!`;
          else if (w.part === P.Chest) text = `${name}'s chest plate is caving in. The core is leaking!`;
          else if (w.part === P.Torso) text = `${name}'s waist is buckling!`;
          else if (DETACHABLE[w.part] && w.part >= P.ThighL) text = `${name}'s ${side} leg is barely holding on!`;
          else if (DETACHABLE[w.part]) text = `${name}'s ${side} arm is coming apart!`;
          else text = `${name}'s ${part} is cracked!`;
        } else if (w.level === 2) {
          if (w.part === P.FistL || w.part === P.FistR) text = `${name}'s ${part} is shattered!`;
          else if (w.part === P.FootL || w.part === P.FootR) text = `${name}'s ${part} is crushed!`;
          else if (!DETACHABLE[w.part]) text = `${name}'s ${part} is wrecked!`;
        }
        if (text) this.comment(text, w.part === P.Head ? 3 : 1);
        break;
      }
      case 'getUp': {
        const f = (data as { f: Fighter }).f;
        if (f.state !== 'ko') this.comment(this.pick([`${f.name} beats the count!`, `${f.name} is back up!`, `${f.name} wants more!`]), 2);
        break;
      }
      case 'ropes':
        break;
      case 'brain': {
        const e = data as BrainEvent;
        this.comment(e.text, 0);
        break;
      }
      case 'ko': {
        const d = data as { winner: Fighter; loser: Fighter; kind: FinishKind; reason: LossReason | null };
        this.endCount();
        if (d.kind === 'TKO') this.markKnockdowns(d.loser);
        if (d.kind !== 'Dismantled') this.calloutEl.className = 'callout';
        this.pendingFinish = { kind: d.kind, winner: d.winner, reason: d.reason };
        if (d.kind !== 'Dismantled') this.comment(d.kind === 'TKO' ? `Three knockdowns. ${d.winner.name} wins by TKO!` : `${d.loser.name} is out cold!`, 5);
        break;
      }
      case 'decision': {
        const d = data as { winner: Fighter | null };
        this.endCount();
        this.callout('TIME!', '', 1800);
        this.comment(d.winner ? `${d.winner.name} takes it on the cards.` : 'Dead even. It is a draw!', 5);
        break;
      }
    }
  }

  // ----------------------------------------------------------------- bits
  private pick<T>(a: T[]): T {
    return a[Math.floor(Math.random() * a.length)];
  }

  private comment(text: string, priority: number) {
    if (this.commentary.classList.contains('on') && priority < this.commentPri && this.commentT > 0.6) return;
    this.commentary.textContent = text;
    this.commentary.classList.add('on');
    this.commentT = 2.4 + priority * 0.4;
    this.commentPri = priority;
  }

  private callout(text: string, cls = '', ms = 1100) {
    const c = this.calloutEl;
    c.className = 'callout';
    void c.offsetWidth; // restart animation
    c.className = `callout go ${cls}`;
    c.style.animationDuration = `${ms}ms`;
    c.textContent = text;
    this.lastCalloutAt = this.match?.time ?? 0;
  }

  private count(text: string, go = false) {
    const c = this.countEl;
    c.className = 'count';
    void c.offsetWidth;
    c.className = `count go${go ? ' fight' : ''}`;
    c.textContent = text;
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
    if (r.f.state === 'down') {
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
    const sub = ko
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
