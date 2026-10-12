import type { Game, Place } from '../game/game';
import { resScaleChoices, type Quality, type ResScale } from '../render/stage';
import { enterLandscape } from '../fullscreen';
import { Rng } from '../sim/math';
import { MOVES } from '../sim/moves';
import type { Fighter } from '../sim/fighter';
import {
  computeBuild,
  formatPassive,
  formatStatLine,
  ITEM_BY_ID,
  itemsForSlot,
  RARITIES,
  scaledStat,
  SLOT_LABEL,
  SLOTS,
  type ItemDef,
  type Rarity,
  type Slot,
  type StatKey,
} from '../game/items';
import { hourLabel, PATCH_NOTES } from '../patchNotes';
import { PALETTES, randomBot, randomName, type BotSpec } from '../game/loadout';
import { button, el, esc, hex } from './dom';
import { Hud, pipsHtml } from './hud';
import { PerfOverlay } from './perfOverlay';
import { ABILITY_ICON, ICON, SLOT_ICON } from './icons';
import { forceUpdate } from '../update';
import { loadPlayer, loadQuality, loadRecord, loadZoom, savePlayer, saveQuality, saveRecord, saveZoom, type Record_, type Zoom } from './store';

type ScreenId = 'home' | 'garage' | 'fight';

/** Garage camera close-ups: target x, y, z and distance per slot, and the whole-robot view. */
const OVERVIEW: [number, number, number, number] = [0, 1.02, 0, 4.7];
const FOCUS: Record<Slot, [number, number, number, number]> = {
  head: [0, 1.7, 0.05, 2.3],
  fist: [0, 1.38, 0.2, 2.5],
  core: [0, 1.36, 0.12, 2.2],
  chest: [0, 1.32, 0, 2.8],
  legs: [0, 0.72, 0, 3.2],
  kick: [0, 0.38, 0.05, 2.5],
};

/** Screens, navigation and persistence around the 3D game. */
export class App {
  private ui: HTMLElement;
  private player: BotSpec;
  private record: Record_;
  private opponent: BotSpec | null = null;
  private screens: Record<ScreenId, HTMLElement>;
  private current: ScreenId = 'home';
  private hud: Hud;
  private perf: PerfOverlay;
  private modal: HTMLElement | null = null;
  private results: HTMLElement | null = null;
  private rng = new Rng((Math.random() * 2 ** 32) >>> 0);
  private slot: Slot = 'fist';
  private garageEls: {
    name: HTMLElement;
    power: HTMLElement;
    swatches: HTMLElement;
    stats: HTMLElement;
    rail: HTMLElement;
    title: HTMLElement;
    rar: HTMLElement;
    items: HTMLElement;
    view: HTMLElement;
  } | null = null;
  /** Slot the garage camera is looking closely at (null: the whole robot). */
  private focus: Slot | null = null;
  private prewarm = false;
  private spin = { dragging: false, vel: 0, idle: 0 };
  private fade: HTMLElement;
  private placeTimer = 0;
  private homeCard: HTMLElement | null = null;
  private homeRecord: HTMLElement | null = null;
  private soundBtns: HTMLButtonElement[] = [];

  constructor(private game: Game, private quality: Quality) {
    this.ui = document.getElementById('ui')!;
    this.player = loadPlayer();
    this.record = loadRecord();
    game.director.zoom = loadZoom();
    this.hud = new Hud(game, this.ui);
    this.perf = new PerfOverlay(game);
    this.hud.onPause = () => this.pause();
    this.screens = {
      home: this.buildHome(),
      garage: this.buildGarage(),
      fight: this.hud.root,
    };
    this.ui.appendChild(this.screens.home);
    this.ui.appendChild(this.screens.garage);
    el('div', 'rotate', `<div>${ICON.rotate}<p>Turn your phone sideways<br><span class="muted">Battlebots plays in landscape</span></p></div>`, this.ui);
    this.fade = el('div', 'scene-fade');
    this.ui.prepend(this.fade);
    game.cb.onFrame = (dt) => {
      if (this.current === 'fight') this.hud.update(dt);
      else if (this.current === 'garage') this.garageTick(dt);
    };
    game.cb.onMatchEvent = (type) => {
      if (type === 'end') setTimeout(() => this.showResults(), 700);
    };
    this.setupGarageDrag();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.current === 'fight' && this.game.match && this.game.match.phase !== 'end' && !this.modal) this.pause();
    });
    this.go('home');
  }

  // ------------------------------------------------------------ navigation
  private go(id: ScreenId) {
    this.current = id;
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('show', k === id);
    if (id === 'home') {
      this.game.endMatch();
      this.hud.detach();
      this.game.showBot(this.player);
      this.refreshHome();
    } else if (id === 'garage') {
      this.focus = null;
      this.refreshGarage();
    }
    // the garage is its own place: switching to or from it dips through black
    const place: Place = id === 'garage' ? 'garage' : 'arena';
    clearTimeout(this.placeTimer);
    const apply = () => {
      const moved = this.game.place !== place;
      this.game.setPlace(place);
      this.camera(id);
      if (moved) this.game.director.snap();
      this.fade.classList.remove('on');
    };
    if (place === this.game.place) apply();
    else {
      this.fade.classList.add('on');
      this.placeTimer = window.setTimeout(apply, 170);
    }
  }

  /** Camera and ambience for a screen. */
  private camera(id: ScreenId) {
    const d = this.game.director;
    if (id === 'home') {
      d.mode = 'menu';
      d.shiftX = 0;
      this.game.sfx?.ambience(0.25);
    } else if (id === 'garage') {
      d.mode = 'garage';
      d.garageYaw = 0.45;
      d.shiftX = 0.27;
      this.spin.vel = 0;
      this.spin.idle = 0;
      this.setFocus(null);
      // the arena crowd is far away from the workshop
      this.game.sfx?.ambience(0.04);
    } else {
      d.shiftX = 0;
      this.game.sfx?.ambience(1);
    }
  }

  private tap(kind: 'tap' | 'select' | 'back' | 'start' = 'tap') {
    this.game.sfx?.unlock();
    this.game.sfx?.ui(kind);
  }

  // ------------------------------------------------------------ home
  private buildHome() {
    const s = el('div', 'screen home');
    const left = el('div', 'home-left', '', s);
    const logo = el('div', 'logo', `<span class="l1">BATTLE</span><span class="l2">BOTS</span><span class="tag">ROBOT BOXING ARENA</span>`, left);
    this.patchBtn(logo);
    this.homeCard = el('div', 'botcard interactive', '', left);
    this.homeCard.addEventListener('click', () => {
      this.tap('select');
      this.go('garage');
    });

    const tr = el('div', 'home-top-right', '', s);
    this.soundBtns.push(button('icon-btn', '', () => this.toggleSound(), tr));
    const refresh = button('icon-btn', ICON.refresh, () => {
      refresh.classList.add('spinning');
      void forceUpdate();
    }, tr);
    refresh.title = 'Check for updates';
    button('icon-btn', ICON.gear, () => this.settings(), tr);
    this.syncSound();

    const right = el('div', 'home-right', '', s);
    this.homeRecord = el('div', 'record', '', right);
    button('btn small', `${ICON.wrench}Garage`, () => {
      this.tap('select');
      this.go('garage');
    }, right);
    button('btn primary big', `${ICON.swords}Fight`, () => this.fight(), right);
    return s;
  }

  private refreshHome() {
    const p = this.player;
    const b = computeBuild(p.loadout);
    this.homeCard!.innerHTML = `
      <div class="name">${esc(p.name)}</div>
      <div class="sub"><span>Power <b>${b.rating}</b></span><span>${MOVES[b.fistAbility].name}</span><span>${MOVES[b.kickAbility].name}</span></div>
      <div class="pips">${pipsHtml(p)}</div>`;
    const r = this.record;
    this.homeRecord!.innerHTML = `W <b>${r.wins}</b> · L <b>${r.losses}</b>${r.draws ? ` · D <b>${r.draws}</b>` : ''}${r.streak > 1 ? ` · Streak <b>${r.streak}</b>` : ''}`;
  }

  private toggleSound() {
    const sfx = this.game.sfx;
    if (!sfx) return;
    sfx.unlock();
    sfx.setMuted(!sfx.muted);
    this.syncSound();
    sfx.ui('tap');
  }

  private syncSound() {
    const muted = this.game.sfx?.muted ?? false;
    for (const b of this.soundBtns) b.innerHTML = muted ? ICON.mute : ICON.sound;
  }

  // ------------------------------------------------------------ garage
  private buildGarage() {
    const s = el('div', 'screen garage');
    const top = el('div', 'garage-top', '', s);
    button('icon-btn', ICON.back, () => {
      this.tap('back');
      this.go('home');
    }, top);
    const id = el('div', 'garage-id', '', top);
    const name = button('name', '', () => this.rename(), id);
    const power = el('div', 'gpower', '', id);
    const swatches = el('div', 'swatches', '', s);
    const stats = el('div', 'statbox', '', s);
    const view = button('view-btn', '', () => {
      this.tap();
      this.setFocus(this.focus ? null : this.slot);
    }, s);
    const panel = el('div', 'garage-panel', '', s);
    const rail = el('div', 'rail', '', panel);
    const main = el('div', 'gmain', '', panel);
    const head = el('div', 'ghead', '', main);
    const title = el('div', 'gtitle', '', head);
    const rar = el('div', 'rarities', '', head);
    const items = el('div', 'items scroll', '', main);
    const actions = el('div', 'garage-actions', '', main);
    button('btn small', `${ICON.dice}Random`, () => {
      this.tap('select');
      const b = randomBot(this.rng, this.rng.range(0.2, 0.8));
      this.player = { ...b, name: this.player.name };
      this.commitPlayer();
      this.game.garagePulse();
    }, actions);
    button('btn small primary', `${ICON.swords}Fight`, () => this.fight(), actions);
    this.garageEls = { name, power, swatches, stats, rail, title, rar, items, view };
    return s;
  }

  private rename() {
    this.tap();
    const n = prompt('Name your bot', this.player.name);
    if (n && n.trim()) {
      this.player.name = n.trim().slice(0, 20);
      this.commitPlayer(false);
    }
  }

  private randomizeName() {
    this.player.name = randomName(this.rng);
  }

  /** Persist the player and refresh whatever shows it. */
  private commitPlayer(rebuildModel = true) {
    savePlayer(this.player);
    if (rebuildModel) this.game.showBot(this.player);
    this.refreshGarage();
  }

  /** Camera close-up on one slot's part, or the whole robot (null). */
  private setFocus(slot: Slot | null) {
    this.focus = slot;
    const f = slot ? FOCUS[slot] : OVERVIEW;
    const d = this.game.director;
    d.garageTarget.set(f[0], f[1], f[2]);
    d.garageDist = f[3];
    this.garageEls!.view.innerHTML = slot ? `${ICON.expand}<span>Whole bot</span>` : `${ICON.zoom}<span>Inspect ${SLOT_LABEL[this.slot]}</span>`;
  }

  /** Picture of the real part an item fits, at a rarity, in the player's paint. */
  private thumb(item: ItemDef, rarity: Rarity) {
    try {
      return this.game.thumbs.get(item, rarity, this.player.palette, this.player.loadout);
    } catch {
      return '';
    }
  }

  private refreshGarage() {
    const g = this.garageEls!;
    const p = this.player;
    const build = computeBuild(p.loadout);
    g.name.innerHTML = `${esc(p.name)} <span class="muted">✎</span>`;
    g.power.innerHTML = `<span>Power</span><b>${build.rating}</b>`;
    this.game.garageBot(p.name, build.rating, p.palette);

    g.swatches.innerHTML = '';
    PALETTES.forEach((pal, i) => {
      const sw = button(`swatch${i === p.palette ? ' on' : ''}`, '', () => {
        if (p.palette === i) return;
        this.tap();
        p.palette = i;
        this.commitPlayer();
        this.game.garagePulse();
      }, g.swatches);
      sw.style.background = `linear-gradient(135deg, ${hex(pal.primary)} 50%, ${hex(pal.secondary)} 50%)`;
      sw.title = pal.name;
    });

    this.renderStats();

    // the loadout rail: each slot shows the part it has fitted
    g.rail.innerHTML = '';
    for (const slot of SLOTS) {
      const eq = p.loadout[slot];
      const item = ITEM_BY_ID.get(eq.id)!;
      const src = this.thumb(item, eq.rarity);
      const t = button(`slot${slot === this.slot ? ' on' : ''}`, `${src ? `<img src="${src}" alt="">` : SLOT_ICON[slot]}<span>${SLOT_LABEL[slot]}</span>`, () => {
        this.tap();
        if (slot === this.slot) this.setFocus(this.focus ? null : slot);
        else {
          this.slot = slot;
          this.setFocus(slot);
          this.refreshGarage();
        }
      }, g.rail);
      t.style.setProperty('--rc', RARITIES[eq.rarity].color);
    }

    const eq = p.loadout[this.slot];
    const cur = ITEM_BY_ID.get(eq.id)!;
    g.title.innerHTML = `<b>${SLOT_LABEL[this.slot]}</b><span>${esc(cur.name)} · <i style="color:${RARITIES[eq.rarity].color}">${RARITIES[eq.rarity].name}</i></span>`;
    if (this.focus) this.setFocus(this.slot);
    else this.setFocus(null);

    g.rar.innerHTML = '';
    RARITIES.forEach((r, i) => {
      const b = button(`rar${i === eq.rarity ? ' on' : ''}`, r.name, () => {
        if (eq.rarity === i) return;
        this.tap();
        eq.rarity = i as Rarity;
        this.commitPlayer();
        this.game.garagePulse();
      }, g.rar);
      b.style.setProperty('--rc', r.color);
    });

    const scroll = g.items.scrollTop;
    g.items.innerHTML = '';
    for (const item of itemsForSlot(this.slot)) {
      const on = item.id === eq.id;
      const delta = on ? 0 : computeBuild({ ...p.loadout, [this.slot]: { id: item.id, rarity: eq.rarity } }).rating - build.rating;
      const card = button(`item${on ? ' on' : ''}`, this.itemHtml(item, eq.rarity, on, delta), () => {
        if (item.id !== eq.id) {
          this.tap('select');
          eq.id = item.id;
          this.commitPlayer();
          this.game.garagePulse();
        }
        if (item.ability) setTimeout(() => this.game.previewMove(item.ability!), 120);
      }, g.items);
      card.style.setProperty('--rc', RARITIES[eq.rarity].color);
    }
    g.items.scrollTop = scroll;
    this.prewarmThumbs();
  }

  /** Draw the other slots' pictures in idle moments, so switching tabs never waits on them. */
  private prewarmThumbs() {
    if (this.prewarm) return;
    const todo: [ItemDef, Rarity][] = [];
    for (const slot of SLOTS) for (const item of itemsForSlot(slot)) todo.push([item, this.player.loadout[slot].rarity]);
    const idle = (cb: () => void) => ((window as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 60)))(cb);
    const step = () => {
      const next = todo.shift();
      if (!next || this.current !== 'garage') {
        this.prewarm = false;
        return;
      }
      this.thumb(next[0], next[1]);
      idle(step);
    };
    this.prewarm = true;
    idle(step);
  }

  private itemHtml(item: ItemDef, rarity: Rarity, on: boolean, delta: number) {
    const chips = (Object.entries(item.stats) as [StatKey, number][])
      .map(([k, v]) => {
        const sv = scaledStat(v, rarity);
        return `<span class="chip${sv < 0 ? ' neg' : ''}">${formatStatLine(k, sv)}</span>`;
      })
      .join('');
    const ab = item.ability ? `<span class="chip skill">${MOVES[item.ability].name}${MOVES[item.ability].cooldown ? ` · ${MOVES[item.ability].cooldown}s` : ''}</span>` : '';
    const src = this.thumb(item, rarity);
    const pic = src ? `<img src="${src}" alt="">` : (item.ability && ABILITY_ICON[item.ability]) || SLOT_ICON[item.slot];
    const tag = on ? '<span class="eq">Fitted</span>' : delta ? `<span class="delta${delta > 0 ? ' up' : ' down'}">${delta > 0 ? '+' : '−'}${Math.abs(delta)}</span>` : '';
    return `<div class="pic">${pic}</div>
      <div class="t"><b>${esc(item.name)}</b>${tag}</div>
      <div class="tag">${esc(item.tagline)}</div>
      <div class="chips">${ab}${chips}</div>
      <div class="passive"><em>${esc(item.passive.name)}</em> · ${esc(formatPassive(item.passive, rarity))}</div>`;
  }

  private renderStats() {
    const b = computeBuild(this.player.loadout);
    const s = b.stats;
    const rows: [string, number, string][] = [
      ['Health', (s.maxHp - 1100) / 800, String(Math.round(s.maxHp))],
      ['Strike', ((s.punchPower + s.kickPower) / 2 - 0.85) / 0.9, `${Math.round(((s.punchPower + s.kickPower) / 2) * 100)}`],
      ['Speed', (s.punchSpeed - 0.9) / 0.6, `${Math.round(s.punchSpeed * 100)}`],
      ['Defense', (s.armor + s.headGuard * 0.5) / 0.35, `${Math.round(s.armor * 100)}%`],
      ['Footwork', ((s.moveSpeed / 2.1) * s.agility - 0.9) / 0.8, `${Math.round((s.moveSpeed / 2.1) * s.agility * 100)}`],
      ['Reflexes', (0.15 / s.reaction - 0.9) / 0.9, `${Math.round(s.reaction * 1000)}ms`],
    ];
    const g = this.garageEls!;
    g.stats.innerHTML =
      `<div class="sh"><span>Diagnostics</span><span class="muted">${MOVES[b.fistAbility].name} · ${MOVES[b.kickAbility].name}</span></div>` +
      rows
        .map(([l, k, v]) => `<span class="lbl">${l}</span><div class="bar"><i style="width:${Math.round(Math.max(0.04, Math.min(1, k)) * 100)}%"></i></div><span class="val">${v}</span>`)
        .join('');
  }

  /** Drag to turn the robot (it keeps spinning a little when let go), and drift slowly when left alone. */
  private setupGarageDrag() {
    const canvas = this.game.stage.renderer.domElement;
    let lastX = 0;
    let lastT = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.current !== 'garage') return;
      this.spin.dragging = true;
      this.spin.vel = 0;
      lastX = e.clientX;
      lastT = performance.now();
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.spin.dragging) return;
      const now = performance.now();
      const d = (e.clientX - lastX) * 0.012;
      this.game.director.garageYaw -= d;
      const dt = Math.max(1, now - lastT) / 1000;
      this.spin.vel = this.spin.vel * 0.5 + (-d / dt) * 0.5;
      lastX = e.clientX;
      lastT = now;
      this.spin.idle = 0;
    });
    const up = () => {
      if (!this.spin.dragging) return;
      this.spin.dragging = false;
      if (performance.now() - lastT > 80) this.spin.vel = 0;
      this.spin.idle = 0;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private garageTick(dt: number) {
    const s = this.spin;
    if (s.dragging) return;
    s.idle += dt;
    s.vel *= Math.exp(-3.5 * dt);
    if (Math.abs(s.vel) > 6) s.vel = Math.sign(s.vel) * 6;
    // showroom drift once nobody has touched it for a while
    const drift = s.idle > 5 ? Math.min(1, (s.idle - 5) / 3) * 0.06 : 0;
    this.game.director.garageYaw += (s.vel + drift) * dt;
  }

  // ------------------------------------------------------------ fight
  /** Random-gear opponent whose power rating lands near the player's. */
  private makeOpponent(): BotSpec {
    const target = computeBuild(this.player.loadout).rating * this.rng.range(0.9, 1.1);
    let best: BotSpec | null = null;
    let bestD = Infinity;
    for (let i = 0; i < 40; i++) {
      const b = randomBot(this.rng, this.rng.next(), this.player.palette);
      const d = Math.abs(computeBuild(b.loadout).rating - target);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    best!.palette = this.contrastingPalette(this.player.palette);
    return best!;
  }

  /** A random palette that reads clearly against the player's at fight distance. */
  private contrastingPalette(mine: number) {
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const dist = (a: number, b: number) => {
      const x = rgb(a), y = rgb(b);
      return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    };
    const pm = PALETTES[mine];
    const ok = PALETTES.map((_, i) => i).filter((i) => {
      if (i === mine) return false;
      const p = PALETTES[i];
      return Math.min(dist(p.primary, pm.primary), dist(p.secondary, pm.primary) * 1.4, dist(p.primary, pm.secondary) * 1.4) > 150;
    });
    return ok.length ? this.rng.pick(ok) : (mine + 5) % PALETTES.length;
  }

  private fight(sameOpponent = false) {
    this.tap('start');
    void enterLandscape();
    this.closeResults();
    if (!sameOpponent || !this.opponent) this.opponent = this.makeOpponent();
    const m = this.game.startMatch(this.player, this.opponent, (Math.random() * 2 ** 32) >>> 0);
    this.hud.resetSpeed();
    this.hud.attach(m);
    this.go('fight');
  }

  private pause() {
    if (this.modal || !this.game.match) return;
    this.tap();
    this.game.paused = true;
    this.openModal('Paused', (box) => {
      button('btn primary', `${ICON.play}Resume`, () => this.closeModal(), box);
      this.soundRow(box);
      button('btn small', 'Forfeit', () => {
        this.closeModal();
        if (this.game.match && this.game.match.phase !== 'end') this.tally(false, false);
        this.go('home');
      }, box);
    }, () => {
      this.game.paused = false;
    });
  }

  private settings() {
    this.tap();
    this.openModal('Settings', (box) => {
      this.soundRow(box);
      el('div', 'muted', 'Graphics quality', box);
      const seg = el('div', 'seg', '', box);
      const saved = loadQuality();
      for (const q of ['low', 'med', 'high'] as Quality[]) {
        button(q === this.quality ? 'on' : '', q === 'med' ? 'Medium' : q[0].toUpperCase() + q.slice(1), () => {
          if (q === this.quality) return;
          saveQuality(q);
          location.reload();
        }, seg);
      }
      el('div', 'muted', 'Camera zoom', box);
      const zoomSeg = el('div', 'seg', '', box);
      for (const z of ['close', 'normal', 'wide'] as Zoom[]) {
        const b = button(z === this.game.director.zoom ? 'on' : '', z[0].toUpperCase() + z.slice(1), () => {
          this.game.director.zoom = z;
          saveZoom(z);
          this.hud.syncZoom();
          for (const o of zoomSeg.children) o.classList.toggle('on', o === b);
          this.tap();
        }, zoomSeg);
      }
      if (saved) button('btn small', 'Auto-detect quality', () => {
        saveQuality(null);
        location.reload();
      }, box);
      this.resolutionRow(box);
      const perfBtn = button('btn small', '', () => {
        this.perf.setVisible(!this.perf.visible);
        syncPerf();
      }, box);
      const syncPerf = () => (perfBtn.textContent = `Performance stats ${this.perf.visible ? 'on' : 'off'}`);
      syncPerf();
      button('btn small', 'Reset record', () => {
        this.record = { wins: 0, losses: 0, draws: 0, streak: 0, best: 0 };
        saveRecord(this.record);
        this.refreshHome();
        this.closeModal();
      }, box);
      button('btn cyan', 'Done', () => this.closeModal(), box);
    });
  }

  /** Render resolution: Auto (adapts to keep the frame rate) or a fixed pixel ratio, applied at once. */
  private resolutionRow(box: HTMLElement) {
    const stage = this.game.stage;
    const label = el('div', 'muted', '', box);
    const seg = el('div', 'seg seg4', '', box);
    const opts: { value: ResScale; text: string }[] = [
      { value: null, text: 'Auto' },
      ...resScaleChoices().map((c) => ({ value: c.value, text: c.native ? 'Native' : `${c.value}x` })),
    ];
    const native = resScaleChoices().at(-1)!.value;
    const btns = opts.map((o) =>
      button('', o.text, () => {
        this.tap();
        stage.setResScale(o.value);
        sync();
      }, seg),
    );
    const sync = () => {
      const cur = stage.resScale;
      opts.forEach((o, i) => btns[i].classList.toggle('on', o.value === cur));
      const pr = stage.renderer.getPixelRatio();
      label.textContent = `Render resolution: ${cur === null ? `auto, now ${+pr.toFixed(2)}x` : `fixed at ${cur}x`} (screen is ${native}x)`;
    };
    sync();
  }

  // ------------------------------------------------------------ patch notes
  private patchBtn(parent: HTMLElement) {
    const latest = PATCH_NOTES[0] ? `${PATCH_NOTES[0].hour}|${PATCH_NOTES[0].title}|${PATCH_NOTES[0].notes.length}` : '';
    let seen = '';
    try {
      seen = localStorage.getItem('bb.notesSeen') ?? '';
    } catch {}
    const b = button(`notes-btn${latest && seen !== latest ? ' new' : ''}`, 'Patch notes', () => {
      b.classList.remove('new');
      try {
        localStorage.setItem('bb.notesSeen', latest);
      } catch {}
      this.patchNotes();
    }, parent);
  }

  private patchNotes() {
    this.tap();
    this.openModal('Patch notes', (box) => {
      box.classList.add('notes');
      const list = el('div', 'notes-list', '', box);
      for (const p of PATCH_NOTES) {
        el('div', 'note', `<div class="note-head"><b>${esc(p.title)}</b><span>${esc(hourLabel(p.hour))}</span></div><ul>${p.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`, list);
      }
      button('btn cyan', 'Close', () => this.closeModal(), box);
    });
  }

  private soundRow(box: HTMLElement) {
    const b = button('btn small', '', () => {
      this.toggleSound();
      sync();
    }, box);
    const sync = () => (b.innerHTML = `${this.game.sfx?.muted ? ICON.mute : ICON.sound}Sound ${this.game.sfx?.muted ? 'off' : 'on'}`);
    sync();
  }

  private openModal(title: string, fill: (box: HTMLElement) => void, onClose?: () => void) {
    this.closeModal();
    const m = el('div', 'modal screen show interactive', '', this.ui);
    const box = el('div', 'box', `<h2>${esc(title)}</h2>`, m);
    fill(box);
    this.modal = m;
    (m as HTMLElement & { _close?: () => void })._close = onClose;
  }

  private closeModal() {
    const m = this.modal as (HTMLElement & { _close?: () => void }) | null;
    if (!m) return;
    m._close?.();
    m.remove();
    this.modal = null;
  }

  // ------------------------------------------------------------ results
  private tally(won: boolean, draw: boolean) {
    const r = this.record;
    if (draw) r.draws++;
    else if (won) {
      r.wins++;
      r.streak++;
      r.best = Math.max(r.best, r.streak);
    } else {
      r.losses++;
      r.streak = 0;
    }
    saveRecord(r);
  }

  private showResults() {
    const m = this.game.match;
    if (!m || this.current !== 'fight' || this.results) return;
    const [a, b] = m.fighters;
    const draw = !m.winner;
    const won = m.winner === a;
    this.tally(won, draw);
    const verdict = draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
    const how = m.result === 'Decision' ? 'on points' : m.result === 'TKO' ? 'by TKO' : m.result === 'KO' ? 'by knockout' : '';
    const who = draw ? 'Split down the middle' : `<b>${esc(m.winner!.name)}</b> wins ${how}`;
    const acc = (f: Fighter) => (f.stats.thrown ? `${Math.round((f.stats.landed / f.stats.thrown) * 100)}%` : '–');
    const row = (label: string, va: number | string, vb: number | string, higher = true) => {
      const na = typeof va === 'number' ? va : parseFloat(va);
      const nb = typeof vb === 'number' ? vb : parseFloat(vb);
      const wa = !isNaN(na) && !isNaN(nb) && (higher ? na > nb : na < nb);
      const wb = !isNaN(na) && !isNaN(nb) && (higher ? nb > na : nb < na);
      return `<span class="a${wa ? ' w' : ''}">${va}</span><span class="l">${label}</span><span class="b${wb ? ' w' : ''}">${vb}</span>`;
    };
    const res = el('div', 'results screen show', '', this.ui);
    res.innerHTML = `
      <div class="head"><div class="verdict${won || draw ? '' : ' lose'}">${verdict}</div><div class="who">${who}</div></div>
      <div class="stats-table">
        <span class="h a">${esc(a.name)}</span><span class="h l">${Math.round(m.time - m.introLength - 3)}s</span><span class="h b">${esc(b.name)}</span>
        ${row('Damage', Math.round(a.stats.dealt), Math.round(b.stats.dealt))}
        ${row('Landed', `${a.stats.landed}/${a.stats.thrown}`, `${b.stats.landed}/${b.stats.thrown}`)}
        ${row('Accuracy', acc(a), acc(b))}
        ${row('Blocks', a.stats.blocked, b.stats.blocked)}
        ${row('Dodges', a.stats.dodged, b.stats.dodged)}
        ${row('Knockdowns', a.stats.knockdowns, b.stats.knockdowns)}
        ${row('Best shot', a.stats.biggest ? `${Math.round(a.stats.biggest)}` : '–', b.stats.biggest ? `${Math.round(b.stats.biggest)}` : '–')}
      </div>`;
    const actions = el('div', 'actions', '', res);
    button('btn primary', `${ICON.swords}Next fight`, () => this.fight(), actions);
    button('btn', 'Rematch', () => this.fight(true), actions);
    button('btn', `${ICON.wrench}Garage`, () => {
      this.tap('select');
      this.closeResults();
      this.go('home');
      this.go('garage');
    }, actions);
    button('btn small', ICON.back, () => {
      this.tap('back');
      this.closeResults();
      this.go('home');
    }, actions).title = 'Home';
    this.results = res;
    this.game.director.shiftX = 0.2;
  }

  private closeResults() {
    this.game.director.shiftX = 0;
    this.results?.remove();
    this.results = null;
  }

  /** Pick a random name on first launch so every player starts with their own bot. */
  firstRunName() {
    try {
      if (localStorage.getItem('bb.player')) return;
    } catch {
      return;
    }
    this.randomizeName();
    savePlayer(this.player);
    this.refreshHome();
  }
}
