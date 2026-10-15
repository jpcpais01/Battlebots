import * as THREE from 'three';
import type { Game } from '../game/game';
import { EVENTS, EVENT_BY_ID, defenceOf, progressOf, titlesHeld, titlesNeeded, type EventDef, type EventsRecord } from '../game/events';
import { RARITIES } from '../game/items';
import { credits, epicOdds, purse, rankOf, titleBonus, type CareerState } from '../game/career';
import type { BotSpec } from '../game/loadout';
import { coins, rivalCard } from './careerUi';
import { button, el, esc, hex } from './dom';
import { ICON } from './icons';
import './mapScreen.css';

/**
 * The world map screen: the 3D map under a layer that takes drags, pinches and wheel zooms, a pin
 * over every venue (its progress on it), and a card for the event picked, with its ladder and the
 * button to fight the next round.
 */

export interface MapHooks {
  game: Game;
  events: () => EventsRecord;
  career: () => CareerState;
  player: () => BotSpec;
  /** The rival waiting in an event's round (with its gear for the player's title defences). */
  rival: (e: EventDef, round: number) => BotSpec;
  market: () => void;
  trophies: () => void;
  tap: (kind?: 'tap' | 'select' | 'back' | 'start') => void;
  back: () => void;
  fight: (e: EventDef) => void;
}

const _v = new THREE.Vector3();

/** Where the camera settles to look at each venue (distance), and the map's opening view. */
const VIEW_DIST: Record<string, number> = { rooftop: 640, grand: 520, harbor: 400, grove: 420, falls: 460, island: 420 };
const HOME_VIEW = { x: 40, z: 40, d: 1500 };

export class MapScreen {
  readonly root: HTMLElement;
  private touch: HTMLElement;
  private pinLayer: HTMLElement;
  private pins = new Map<string, HTMLButtonElement>();
  private card: HTMLElement;
  private loading: HTMLElement;
  private bar: HTMLElement;
  private chip: HTMLElement;
  private cash: HTMLElement;
  private rank: HTMLElement;
  private title: HTMLElement;
  private timeBtn: HTMLButtonElement;
  private picked: string | null = null;
  private attached = false;
  private opened = false;
  private visible = false;

  constructor(private h: MapHooks) {
    const s = (this.root = el('div', 'screen map'));
    this.touch = el('div', 'map-touch interactive', '', s);
    this.pinLayer = el('div', 'map-pins', '', s);
    const bar = el('div', 'topbar', '', s);
    const left = el('div', 'brand', '', bar);
    button('icon-btn', ICON.back, () => {
      h.tap('back');
      h.back();
    }, left).title = 'Back';
    this.title = el('div', 'map-title', '', left);
    const chips = el('div', 'map-chips', '', bar);
    this.cash = el('div', 'map-chip cash', '', chips);
    this.chip = el('div', 'map-chip', '', chips);
    // bottom left: the career rank, the Parts Market and the trophy room
    const dock = el('div', 'map-dock', '', s);
    this.rank = el('div', 'map-rank', '', dock);
    const row = el('div', 'map-dock-row', '', dock);
    button('btn small', `${ICON.market}Parts Market`, () => {
      h.tap('select');
      h.market();
    }, row);
    button('btn small', `${ICON.trophy}Trophies`, () => {
      h.tap('select');
      h.trophies();
    }, row);
    const zoom = el('div', 'map-zoom', '', s);
    this.timeBtn = button('icon-btn map-time', ICON.moon, () => {
      const w = this.h.game.worldMap;
      if (!w) return;
      h.tap('select');
      w.setNight(!w.isNight);
      this.drawTime();
    }, zoom);
    button('icon-btn', ICON.plus, () => this.h.game.worldMap?.cam.zoomBy(0.6), zoom).title = 'Zoom in';
    button('icon-btn', ICON.minus, () => this.h.game.worldMap?.cam.zoomBy(1.6), zoom).title = 'Zoom out';
    this.card = el('div', 'map-card interactive', '', s);
    this.loading = el('div', 'map-loading', '<span class="kicker">Drawing the map</span>', s);
    this.bar = el('i', '', '', el('div', 'map-bar', '', this.loading));
    for (const e of EVENTS) {
      const pin = button('map-pin', '', () => this.pick(e.id), this.pinLayer);
      pin.style.setProperty('--c', hex(e.color));
      this.pins.set(e.id, pin);
    }
    window.addEventListener('keydown', (e) => {
      if (!this.visible || e.key !== 'Escape') return;
      if (this.picked) this.pick(null);
      else h.back();
    });
  }

  /** The screen is coming up: build the map if it isn't yet, then fly in. */
  show() {
    this.visible = true;
    this.refresh();
    const g = this.h.game;
    const ready = !!g.worldMap;
    this.loading.classList.toggle('on', !ready);
    void g
      .loadWorld((k) => (this.bar.style.width = `${Math.round(k * 100)}%`))
      .then((w) => {
        this.loading.classList.remove('on');
        if (!this.attached) {
          this.attached = true;
          w.cam.attach(this.touch);
          w.cam.onTap = () => this.picked && this.pick(null);
        }
        if (!this.opened) {
          // the first time: sweep in from out over the sea
          this.opened = true;
          w.cam.set(_v.set(HOME_VIEW.x + 260, 3, HOME_VIEW.z + 700), 2100);
          w.cam.flyTo(_v.set(HOME_VIEW.x, 3, HOME_VIEW.z), HOME_VIEW.d, 2.6);
        }
        if (this.picked) w.sites.highlight(this.picked);
        this.drawTime();
      })
      .catch((e) => {
        console.error('map failed', e);
        this.loading.innerHTML = '<span class="kicker">The map could not be drawn on this device</span>';
      });
  }

  hide() {
    this.visible = false;
  }

  /** The day/night button shows what it switches to. */
  private drawTime() {
    const night = !!this.h.game.worldMap?.isNight;
    this.timeBtn.innerHTML = night ? ICON.sun : ICON.moon;
    this.timeBtn.title = night ? 'Day' : 'Night';
    this.timeBtn.classList.toggle('on', night);
  }

  /** Pins and the card from the saved progress. */
  refresh() {
    const rec = this.h.events();
    const c = this.h.career();
    const rank = rankOf(c.fame);
    this.title.innerHTML = `<span class="kicker">Career · ${esc(rank.name)}</span><b>Cups &amp; Championships</b>`;
    this.cash.innerHTML = coins(c.credits);
    this.cash.title = 'Credits: win fights to earn them, spend them at the Parts Market';
    this.chip.innerHTML = `${ICON.crown}<b>${titlesHeld(rec)}</b><span>/ ${EVENTS.length} titles</span>`;
    this.rank.innerHTML = `<div class="rk"><span>${ICON.rank}<b>${esc(rank.name)}</b></span><em>${rank.next ? `${credits(rank.toNext)} fame to ${esc(rank.next)}` : 'Top of the sport'}</em></div><i class="bar"><i style="--k:${rank.k.toFixed(3)}"></i></i>`;
    for (const e of EVENTS) {
      const pin = this.pins.get(e.id)!;
      const p = progressOf(rec, e.id);
      const locked = titlesNeeded(rec, e) > 0;
      const icon = locked ? ICON.lock : p.titles ? ICON.crown : ICON.trophy;
      // (just the icon: names over the map hid the city; the card has the name and the run)
      pin.innerHTML = `<span class="pin-head">${icon}</span><span class="pin-stem"></span>`;
      pin.setAttribute('aria-label', e.name);
      pin.title = e.name;
      pin.classList.toggle('locked', locked);
      pin.classList.toggle('won', p.titles > 0);
      pin.classList.toggle('picked', this.picked === e.id);
    }
    if (this.picked) this.drawCard(EVENT_BY_ID.get(this.picked)!);
  }

  /** Open an event's card (and fly to it), or close it. */
  pick(id: string | null) {
    this.h.tap(id ? 'select' : 'back');
    this.picked = id;
    const w = this.h.game.worldMap;
    w?.sites.highlight(id);
    this.card.classList.toggle('on', !!id);
    for (const [k, p] of this.pins) p.classList.toggle('picked', k === id);
    if (!id) return;
    const e = EVENT_BY_ID.get(id)!;
    this.drawCard(e);
    const a = w?.sites.anchors[id];
    if (w && a) {
      // the venue goes in the middle of the map the card leaves showing
      const [x, y] = this.openCentre();
      w.cam.frame(a, VIEW_DIST[id] ?? 450, x, y, 1.3);
    }
  }

  /**
   * The middle of the part of the map not covered by the card and the top bar, in the camera's
   * normalised screen coordinates. Laid-out sizes, not the card's slide-in transform.
   */
  private openCentre(): [number, number] {
    const W = window.innerWidth, H = window.innerHeight;
    // (the screen fills the window, and offsets ignore its fade-in scale)
    const right = this.card.classList.contains('on') ? this.card.offsetLeft : W;
    const top = this.card.offsetTop - 8;
    const x = Math.max(0, Math.min(W, right)) / 2, y = (Math.max(0, Math.min(H * 0.4, top)) + H) / 2;
    return [(x / W) * 2 - 1, 1 - (y / H) * 2];
  }

  private drawCard(e: EventDef) {
    const rec = this.h.events();
    const p = progressOf(rec, e.id);
    const need = titlesNeeded(rec, e);
    const def = defenceOf(rec, e);
    const c = this.card;
    c.replaceChildren();
    c.style.setProperty('--c', hex(e.color));
    const head = el('div', 'mc-head', '', c);
    const kind = e.kind === 'cup' ? 'Cup' : 'Championship';
    el('div', 'mc-title', `<span class="kicker">${kind} · ${e.region}${def ? ` · Title defence ${def}` : ''}</span><h2>${esc(e.name)}</h2><span class="mc-venue">${ICON.map}${esc(e.venue)}</span>`, head);
    button('icon-btn small', ICON.close, () => this.pick(null), head).title = 'Close';
    el('p', 'mc-blurb', esc(e.blurb), c);
    const ladder = el('ol', 'mc-ladder', '', c);
    e.rivals.forEach((r, i) => {
      const state = i < p.run ? 'done' : i === p.run && !need ? 'next' : '';
      const tag = i < p.run ? ICON.check : i === e.rivals.length - 1 ? '<em>Final</em>' : i === p.run && !need ? '<em>Next</em>' : '';
      el('li', state, `<span class="n">${i + 1}</span><b>${esc(r.name)}<small>${esc(r.style)}</small></b>${tag}`, ladder);
    });
    if (!need) {
      // who's next, and what beating them pays
      const round = p.run;
      const last = round === e.rivals.length - 1;
      const odds = Math.round(epicOdds(e, def) * 100);
      const crate = odds >= 100 ? `${RARITIES[2].name} crate` : odds ? `crate (${odds}% ${RARITIES[2].name})` : `${RARITIES[1].name} crate`;
      const pays = `<span>${coins(purse(e, round, def))} purse</span>${last ? `<span class="crate" style="--rc:${RARITIES[odds >= 50 ? 2 : 1].color}">${ICON.crate}Title: ${credits(titleBonus(e, def))} + ${crate}</span>` : ''}`;
      rivalCard(c, e.rivals[round], this.h.rival(e, round), this.h.player(), pays);
    }
    const foot = el('div', 'mc-foot', '', c);
    if (p.titles) el('span', 'mc-won', `${ICON.crown}Won ${p.titles === 1 ? 'once' : `${p.titles} times`}`, foot);
    else el('span', 'mc-won muted', `${e.rivals.length} rounds, one loss ends the run`, foot);
    if (need) {
      const b = button('btn', `${ICON.lock}Win ${need} more title${need > 1 ? 's' : ''}`, () => {}, foot);
      b.disabled = true;
    } else {
      const label = p.run ? `Round ${p.run + 1}` : p.titles ? 'Defend the title' : 'Fight';
      button('btn primary', `${ICON.swords}${label}`, () => this.h.fight(e), foot);
    }
  }

  /** Keep every pin over its venue. */
  tick() {
    const w = this.h.game.worldMap;
    if (!w || !this.visible) return;
    const cam = this.h.game.stage.camera;
    const W = window.innerWidth, H = window.innerHeight;
    for (const [id, pin] of this.pins) {
      const a = w.sites.anchors[id];
      if (!a) continue;
      _v.copy(a).project(cam);
      const off = _v.z > 1 || _v.x < -1.2 || _v.x > 1.2 || _v.y < -1.2 || _v.y > 1.3;
      pin.style.visibility = off ? 'hidden' : '';
      if (off) continue;
      const x = (_v.x * 0.5 + 0.5) * W, y = (0.5 - _v.y * 0.5) * H;
      pin.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }
}
