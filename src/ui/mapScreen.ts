import * as THREE from 'three';
import type { Game } from '../game/game';
import { EVENTS, EVENT_BY_ID, progressOf, titlesHeld, titlesNeeded, type EventDef, type EventsRecord } from '../game/events';
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
    el('div', 'map-title', '<span class="kicker">World</span><b>Cups &amp; Championships</b>', left);
    this.chip = el('div', 'map-chip', '', bar);
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
    this.chip.innerHTML = `${ICON.crown}<b>${titlesHeld(rec)}</b><span>/ ${EVENTS.length} titles</span>`;
    for (const e of EVENTS) {
      const pin = this.pins.get(e.id)!;
      const p = progressOf(rec, e.id);
      const locked = titlesNeeded(rec, e) > 0;
      const dots = e.rivals.map((_, i) => `<i class="${i < p.run ? 'on' : ''}"></i>`).join('');
      const icon = locked ? ICON.lock : p.titles ? ICON.crown : ICON.trophy;
      pin.innerHTML = `<span class="pin-head">${icon}</span><span class="pin-label"><b>${esc(e.name)}</b><span class="pin-dots">${dots}</span></span><span class="pin-stem"></span>`;
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
      // look a little past the venue, so it sits left of the card
      w.cam.flyTo(_v.set(a.x + 60, 3, a.z), VIEW_DIST[id] ?? 450, 1.3);
    }
  }

  private drawCard(e: EventDef) {
    const rec = this.h.events();
    const p = progressOf(rec, e.id);
    const need = titlesNeeded(rec, e);
    const c = this.card;
    c.replaceChildren();
    c.style.setProperty('--c', hex(e.color));
    const head = el('div', 'mc-head', '', c);
    el('div', 'mc-title', `<span class="kicker">${e.kind === 'cup' ? 'Cup' : 'Championship'} · ${e.region}</span><h2>${esc(e.name)}</h2><span class="mc-venue">${ICON.map}${esc(e.venue)}</span>`, head);
    button('icon-btn small', ICON.close, () => this.pick(null), head).title = 'Close';
    el('p', 'mc-blurb', esc(e.blurb), c);
    const ladder = el('ol', 'mc-ladder', '', c);
    e.rivals.forEach((name, i) => {
      const state = i < p.run ? 'done' : i === p.run && !need ? 'next' : '';
      const tag = i < p.run ? ICON.check : i === e.rivals.length - 1 ? '<em>Final</em>' : i === p.run && !need ? '<em>Next</em>' : '';
      el('li', state, `<span class="n">${i + 1}</span><b>${esc(name)}</b>${tag}`, ladder);
    });
    const foot = el('div', 'mc-foot', '', c);
    if (p.titles) el('span', 'mc-won', `${ICON.crown}Won ${p.titles === 1 ? 'once' : `${p.titles} times`}`, foot);
    else el('span', 'mc-won muted', `${e.rivals.length} rounds, one loss ends the run`, foot);
    if (need) {
      const b = button('btn', `${ICON.lock}Win ${need} more title${need > 1 ? 's' : ''}`, () => {}, foot);
      b.disabled = true;
    } else {
      button('btn primary', `${ICON.swords}${p.run ? `Round ${p.run + 1}` : 'Fight'}`, () => this.h.fight(e), foot);
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
