import type { Game, Place, Tape } from '../game/game';
import { resScaleChoices, type Quality, type ResScale } from '../render/stage';
import { loadRT, saveRT } from '../render/rt';
import type { FpsCap } from '../render/pacer';
import { enterLandscape, fullscreenSupported, isFullscreen, onFullscreenChange, toggleFullscreen } from '../fullscreen';
import { Rng } from '../sim/math';
import { MOVES, type MoveId } from '../sim/moves';
import type { Fighter } from '../sim/fighter';
import type { Match } from '../sim/match';
import {
  computeBuild,
  partTint,
  ITEM_BY_ID,
  MAX_RARITY,
  itemsForSlot,
  RARITIES,
  SLOT_LABEL,
  SLOTS,
  SIZE_MAX,
  SIZE_MIN,
  sanitizeSize,
  type ItemDef,
  type Loadout,
  type Rarity,
  type Slot,
} from '../game/items';
import { hourLabel, PATCH_NOTES } from '../patchNotes';
import { EMOTE_INFO, MAX_PICKS, type EmoteInfo, type EmoteKind } from '../sim/emote';
import { randomBot, randomName, type BotSpec } from '../game/loadout';
import { contrastingPaint, FINISHES, FRAMES, GLOW_COLORS, PAINT_COLORS, hexColor, samePaint, schemeOf, SCHEMES, type Paint } from '../game/paint';
import { button, el, esc } from './dom';
import { barColors, Hud } from './hud';
import { paintOf } from './botCard';
import { PerfOverlay } from './perfOverlay';
import { ABILITY_ICON, ICON, SLOT_ICON } from './icons';
import { makerLogo, PartsMenu } from './garageParts';
import { forceUpdate } from '../update';
import { OnlineScreen } from './online';
import type { OnlineSession } from '../net/session';
import { loadPlayer, loadQuality, loadRecord, loadSaves, loadZoom, MAX_SAVES, savePlayer, saveSaves, saveQuality, saveRecord, saveZoom, setOnSaved, type Record_, type Zoom } from './store';
import { bytesOf, canVoiceToday, isVoiced, voicedNames, voiceName } from '../audio/nameVoice';
import { MAX_REPLAYS, ReplayShelf, isSaved, outdated, type SavedReplay } from './replays';
import { Account, PASSWORD_MIN, USERNAME_MAX, type SyncState } from '../net/account';
import { WALK_ONS, walkOnFor } from '../audio/walkOn';
import { EVENT_BY_ID, progressOf, rival, type EventDef } from '../game/events';
import { MapScreen } from './mapScreen';

type PaintPage = 'schemes' | 'primary' | 'secondary' | 'accent' | 'finish';
const PAINT_PAGES: [PaintPage, string][] = [
  ['schemes', 'Schemes'],
  ['primary', 'Main'],
  ['secondary', 'Second'],
  ['accent', 'Glow'],
  ['finish', 'Finish'],
];
const PAINT_HINT: Record<'primary' | 'secondary' | 'accent', string> = {
  primary: 'Main plating: chest, head, shoulders and shins.',
  secondary: 'Second plating: the stripes, guards and trim panels.',
  accent: 'Glow: visor, lights and trim, and the trail of your strikes.',
};

type ScreenId = 'home' | 'garage' | 'fight' | 'online' | 'map';

/** Where the home screen happens: an animated place, or the arena as before. */
type HomePlace = 'beach' | 'gym' | 'lounge' | 'arena';
const HOME_PLACE_NAME: Record<HomePlace, string> = { beach: 'Beach', gym: 'Gym', lounge: 'Lounge', arena: 'Arena' };
function loadHomePlace(): HomePlace {
  try {
    const v = localStorage.getItem('bb.homeScene');
    if (v === 'beach' || v === 'gym' || v === 'lounge' || v === 'arena') return v;
  } catch {
    /* ignore */
  }
  return 'beach';
}

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

/** A word for a frame size. */
const sizeName = (size: number) => (size <= 0.85 ? 'Compact' : size < 1 ? 'Light' : size === 1 ? 'Standard' : size < 1.15 ? 'Heavy' : 'Giant');

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
  /** Which garage tab is open: a part slot, Emotes, Paint or Size. */
  private tab: 'part' | 'emotes' | 'paint' | 'size' = 'part';
  private emoteKind: EmoteKind = 'win';
  /** Which page of the Paint tab is showing. */
  private paintPage: PaintPage = 'schemes';
  private garageEls: {
    name: HTMLElement;
    voice: HTMLButtonElement;
    power: HTMLElement;
    stats: HTMLElement;
    rail: HTMLElement;
    title: HTMLElement;
    rar: HTMLElement;
    items: HTMLElement;
    view: HTMLElement;
  } | null = null;
  /** Slot the garage camera is looking closely at (null: the whole robot). */
  private focus: Slot | null = null;
  /** The part picker; it can put a part on the bot on trial before it is fitted. */
  private parts: PartsMenu;
  /** The bot on the lift is wearing a part on trial, not the saved loadout. */
  private trialShown = false;
  private prewarm = false;
  private spin = { dragging: false, vel: 0, idle: 0 };
  private fade: HTMLElement;
  private placeTimer = 0;
  /** Where the home screen is: an animated place (beach, gym) or the arena. */
  private homePlace: HomePlace = loadHomePlace();
  private sceneBtn: HTMLButtonElement | null = null;
  /** The Fight button's cinematic way out of a home scene is playing. */
  private leaving = false;
  /** An event whose venue is being put up before its fight starts. */
  private venueWait: string | null = null;
  private homeCard: HTMLElement | null = null;
  private homeRecord: HTMLElement | null = null;
  private soundBtns: HTMLButtonElement[] = [];
  private online: OnlineScreen;
  /** The online session the fight on screen belongs to (null for fights against the AI). */
  private netFight: OnlineSession | null = null;
  private resultsNote: HTMLElement | null = null;
  private rematchBtn: HTMLButtonElement | null = null;
  /** The online room the results on screen belong to (rematch votes go to it). */
  private resultsRoom: OnlineSession | null = null;
  /**
   * The last fight against the AI, enough to play it again: the sim is deterministic, so
   * the same two bots, the same seed and the same intro cut give the same fight.
   */
  private lastFight: Tape | null = null;
  /** A replay is seeking to its end to show the results. */
  private resultsAfterSeek = false;
  /** The fight on screen is a replay (it doesn't count towards the record). */
  private replaying = false;
  /** The fight whose results are waiting on the loser's stretcher ride, and its Skip button. */
  private resultsFor: Match | null = null;
  private resultsAt = 0;
  private skipBtn: HTMLElement | null = null;
  private account: Account;
  /** The player's saved replays, and a redraw of their list while it's open. */
  private replays: ReplayShelf;
  private replaysView: (() => void) | null = null;
  private accountBtn: HTMLButtonElement | null = null;
  /** Redraws the account popup while it's open. */
  private accountView: (() => void) | null = null;
  /** The world map screen. */
  private map: MapScreen;
  /** The fight on screen is a round of a map event: which event, and which round. */
  private eventRun: { id: string; round: number } | null = null;

  /** The constructor has run (until then a place is switched without the dip through black). */
  private booted = false;
  /** The saved login has caught up with the cloud at launch (or failed to). */
  synced: Promise<void> = Promise.resolve();

  constructor(private game: Game, private quality: Quality) {
    this.ui = document.getElementById('ui')!;
    this.player = loadPlayer();
    // names the player had voiced on this device: the booth calls their bots by them
    for (const v of voicedNames()) {
      const clips: Parameters<NonNullable<Game['sfx']>['addName']>[1] = {};
      for (const [cut, c] of Object.entries(v.clips)) if (c) clips[cut as keyof typeof clips] = [bytesOf(c[0]), c[1]];
      game.sfx?.addName(v.name, clips);
    }
    this.record = loadRecord();
    game.director.zoom = loadZoom();
    this.account = new Account({
      local: () => ({ bot: this.player, record: this.record }),
      load: (bot, record) => this.adoptCloud(bot, record),
      changed: () => {
        this.refreshAccount();
        this.accountView?.();
      },
      synced: () => void this.replays.sync(),
    });
    this.replays = new ReplayShelf(this.account);
    this.replays.onChange = () => this.replaysView?.();
    setOnSaved(() => this.account.saved());
    this.hud = new Hud(game, this.ui);
    this.perf = new PerfOverlay(game);
    this.parts = new PartsMenu({
      player: () => this.player,
      thumb: (item, rarity) => this.thumb(item, rarity),
      tap: (k) => this.tap(k),
      showTrial: (spec) => {
        this.trialShown = !!spec;
        this.game.showBot(spec ?? this.player);
      },
      equip: (slot, id) => {
        this.player.loadout[slot].id = id;
        this.commitPlayer();
        this.game.garagePulse();
      },
      previewMove: (id) => this.game.previewMove(id),
      redraw: () => this.refreshGarage(),
    });
    this.hud.onPause = () => this.pause();
    this.hud.onCoach = (kind) => {
      const m = this.game.match;
      if (!m) return;
      // online it goes to both phones for one shared step; offline it's the next step
      if (this.netFight) this.netFight.coach(kind);
      else m.queueCoach(0, kind);
    };
    this.online = new OnlineScreen({
      game,
      player: () => this.player,
      tap: (k) => this.tap(k),
      home: () => this.go('home'),
      garage: () => this.go('garage'),
      fight: (session, a, b, seed) => this.fightOnline(session, a, b, seed),
      changed: () => this.netChanged(),
      ended: () => this.netChanged(),
    });
    this.map = new MapScreen({
      game,
      events: () => this.record.events,
      tap: (k) => this.tap(k),
      back: () => this.go('home'),
      fight: (e) => this.fightEvent(e),
    });
    this.screens = {
      home: this.buildHome(),
      garage: this.buildGarage(),
      fight: this.hud.root,
      online: this.online.root,
      map: this.map.root,
    };
    this.ui.appendChild(this.screens.home);
    this.ui.appendChild(this.screens.garage);
    this.ui.appendChild(this.screens.online);
    this.ui.appendChild(this.screens.map);
    el('div', 'rotate', `<div>${ICON.rotate}<p>Turn your phone sideways<span class="muted">Battlebots plays in landscape</span></p></div>`, this.ui);
    this.fade = el('div', 'scene-fade');
    this.ui.prepend(this.fade);
    game.cb.onFrame = (dt) => {
      if (this.current === 'fight') {
        if (this.netFight) this.netFrame(dt);
        this.hud.update(dt);
        if (this.resultsFor) this.awaitResults();
      }
      else if (this.current === 'garage') this.garageTick(dt);
      else if (this.current === 'map') this.map.tick();
      else this.homeTick(dt);
    };
    game.cb.onMatchEvent = (type, data) => {
      // a replay stops on its own last step, with its controls up
      if (this.replaying) return;
      if (type === 'end') this.queueResults();
      this.markMoment(type, data);
    };
    game.cb.onSeek = (done, m) => {
      // the HUD lets go while the sim runs ahead (or starts over), and picks the fight up where it lands
      if (!done) return this.hud.detach(true);
      this.hud.attach(m, null, true);
      if (this.resultsAfterSeek) {
        this.resultsAfterSeek = false;
        this.showResults();
      }
    };
    this.hud.onReplayResults = () => this.replayResults();
    this.setupGarageDrag();
    // the part picker answers a keyboard like a pad: arrows browse, Enter fits
    window.addEventListener('keydown', (e) => {
      if (this.current !== 'garage' || this.tab !== 'part' || this.modal || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea') || ((e.key === 'Enter' || e.key === ' ') && t?.closest('button'))) return;
      if (this.parts.key(this.slot, e)) e.preventDefault();
    });
    document.addEventListener('visibilitychange', () => {
      // (an online fight can't pause: it plays on, and this phone catches up when it's back)
      if (document.hidden && this.current === 'fight' && !this.netFight && this.game.match && this.game.match.phase !== 'end' && !this.modal) this.pause();
    });
    game.cb.onHomeFailed = () => {
      this.endLeaving();
      if (this.current === 'home') this.camera('home');
    };
    if (this.homePlace !== 'arena') game.homeScene(this.homePlace);
    this.go('home');
    this.booted = true;
    this.synced = this.account.start();
  }

  /**
   * After the loading screen, in quiet moments: what the next few minutes will want and that
   * isn't worth holding the start for. The pictures of every part for the garage's picker, the
   * player's walk-on theme for their first entrance, and the code of the world map and venues.
   */
  warmLater() {
    const idle = (fn: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 60));
    const jobs: (() => void)[] = [
      () => this.game.sfx?.primeWalkOn(walkOnFor(this.player)),
      () => this.game.prefetch(),
    ];
    // (drawn with the paint and parts on the bot now: a change later redraws only what it touches)
    for (const slot of SLOTS) for (const item of itemsForSlot(slot)) jobs.push(() => void this.thumb(item, this.player.loadout[slot].rarity));
    const next = () => {
      const t0 = performance.now();
      // one or two at a time: a part's picture is a render and a PNG
      while (jobs.length && performance.now() - t0 < 6) jobs.shift()!();
      if (jobs.length) idle(next);
    };
    idle(next);
  }

  // ------------------------------------------------------------ navigation
  private go(id: ScreenId) {
    if (id !== 'garage') this.dropTrial(false);
    this.endLeaving();
    this.current = id;
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('show', k === id);
    if (id !== 'fight') {
      this.dropSkip();
      this.leaveNetFight();
      this.replaying = false;
    }
    // the home screen is outside any room
    if (id === 'home') this.online.leave();
    if (id === 'online') this.online.show();
    else this.online.hide();
    if (id === 'home' || id === 'online' || id === 'map') {
      this.game.endMatch();
      this.hud.detach();
      this.game.showBot(this.player);
      this.refreshHome();
    } else if (id === 'garage') {
      this.focus = null;
      this.refreshGarage();
    }
    if (id === 'map') this.map.show();
    else this.map.hide();
    // the garage, the map and the home scenes are their own places: switching to or from one dips through black
    const place: Place = id === 'garage' ? 'garage' : id === 'map' ? 'map' : id === 'home' && this.sceneHome() ? 'home' : 'arena';
    clearTimeout(this.placeTimer);
    const apply = () => {
      const moved = this.game.place !== place;
      this.game.setPlace(place);
      this.camera(id);
      if (moved) this.game.director.snap();
      this.fade.classList.remove('on');
    };
    // (at launch there is nothing on screen to dip from: the loading screen covers it)
    if (place === this.game.place || !this.booted) apply();
    else {
      this.fade.classList.add('on');
      this.placeTimer = window.setTimeout(apply, 170);
    }
  }

  /** Camera and ambience for a screen. */
  private camera(id: ScreenId) {
    const d = this.game.director;
    if (id === 'home' && this.game.place === 'home') {
      // the scene runs its own camera (and its own sounds)
      d.mode = 'scene';
      d.shiftX = 0;
      d.menuTurn = 0;
      d.menuLive = false;
      this.spin.vel = 0;
      this.spin.idle = 0;
    } else if (id === 'home' || id === 'online') {
      d.mode = 'menu';
      d.shiftX = 0;
      d.menuTurn = 0;
      d.menuLive = false;
      this.spin.vel = 0;
      this.spin.idle = 0;
      this.game.sfx?.ambience(0.25);
    } else if (id === 'map') {
      // the map flies its own camera (see Game.frame)
      d.mode = 'scene';
      d.shiftX = 0;
      d.menuTurn = 0;
      d.menuLive = false;
      this.game.sfx?.ambience(0.03);
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
    // the player's walk-on theme renders in the background from the first tap, so it is
    // ready for the first fight's entrance
    this.game.sfx?.primeWalkOn(walkOnFor(this.player));
  }

  // ------------------------------------------------------------ home
  private buildHome() {
    const s = el('div', 'screen home');
    // top bar: the wordmark and what's new on the left; account, sound, updates and settings on the right
    const bar = el('div', 'topbar', '', s);
    const brand = el('div', 'brand', '<div class="logo"><span class="l1">BATTLE</span><span class="l2">BOTS</span></div>', bar);
    this.patchBtn(brand);
    const tr = el('div', 'tb-right', '', bar);
    if (this.account.available) {
      this.accountBtn = button('account-btn', '', () => this.accountPopup(), tr);
      this.refreshAccount();
    }
    this.sceneBtn = button('scene-btn', '', () => this.cycleHomePlace(), tr);
    this.sceneBtn.title = 'Home scene';
    this.syncSceneBtn();
    this.soundBtns.push(button('icon-btn', '', () => this.toggleSound(), tr));
    const refresh = button('icon-btn', ICON.refresh, () => {
      refresh.classList.add('spinning');
      void forceUpdate();
    }, tr);
    refresh.title = 'Check for updates';
    if (fullscreenSupported()) {
      const fs = button('icon-btn', '', () => {
        this.tap('select');
        void toggleFullscreen();
      }, tr);
      const sync = () => {
        const on = isFullscreen();
        fs.innerHTML = on ? ICON.shrink : ICON.expand;
        fs.title = on ? 'Exit fullscreen' : 'Fullscreen';
        fs.setAttribute('aria-label', fs.title);
      };
      onFullscreenChange(sync);
      sync();
    }
    button('icon-btn', ICON.gear, () => this.settings(), tr).title = 'Settings';
    this.syncSound();

    // your bot, bottom left: tap its name to open the garage, or a part to open its slot
    this.homeCard = el('div', 'hero interactive', '', s);
    this.homeCard.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-slot], .hero-name');
      if (!t) return;
      this.tap('select');
      if (t.dataset.slot) {
        this.slot = t.dataset.slot as Slot;
        this.tab = 'part';
      }
      this.go('garage');
    });

    // bottom right: the fight, with the garage and online rooms just above it
    const right = el('div', 'home-actions', '', s);
    this.homeRecord = el('div', 'home-record', '', right);
    const sub = el('div', 'home-sub', '', right);
    button('btn', `${ICON.wrench}Garage`, () => {
      this.tap('select');
      this.go('garage');
    }, sub);
    button('btn', `${ICON.globe}Online`, () => {
      this.tap('select');
      this.go('online');
    }, sub);
    button('btn wide map-btn', `${ICON.map}World map`, () => {
      this.tap('select');
      this.go('map');
    }, sub);
    button('btn small wide', `${ICON.replay}Replays`, () => this.replaysMenu(), sub);
    button('btn primary big', `${ICON.swords}Fight`, () => this.fight(), right);
    return s;
  }

  /** The home screen shows an animated place (unless the player picked the arena, or it broke). */
  private sceneHome() {
    return this.homePlace !== 'arena' && !this.game.homeBroken;
  }

  private syncSceneBtn() {
    const b = this.sceneBtn;
    if (!b) return;
    b.innerHTML = `${ICON.scene}<span>${HOME_PLACE_NAME[this.homePlace]}</span>`;
  }

  /** The scene button: beach, gym, lounge, arena, round again. */
  private cycleHomePlace() {
    if (this.leaving) return;
    this.tap('select');
    const order: HomePlace[] = ['beach', 'gym', 'lounge', 'arena'];
    this.homePlace = order[(order.indexOf(this.homePlace) + 1) % order.length];
    try {
      localStorage.setItem('bb.homeScene', this.homePlace);
    } catch {
      /* ignore */
    }
    this.syncSceneBtn();
    // dip through black, change the place, come back up
    this.fade.classList.add('on');
    clearTimeout(this.placeTimer);
    this.placeTimer = window.setTimeout(() => {
      if (this.homePlace !== 'arena') this.game.homeScene(this.homePlace);
      if (this.current === 'home') this.go('home');
      else this.fade.classList.remove('on');
    }, 170);
  }

  /** Back to normal after the way out (or if it was cut off). */
  private endLeaving() {
    if (!this.leaving) return;
    this.leaving = false;
    this.screens?.home?.classList.remove('leaving');
  }

  private refreshHome() {
    const p = this.player;
    const b = computeBuild(p.loadout, p.size);
    const card = this.homeCard!;
    card.style.setProperty('--paint', paintOf(p));
    const move = (id: MoveId) => `<span class="pill">${ABILITY_ICON[id] ?? ''}${esc(MOVES[id].name)}</span>`;
    const sets = b.sets
      .filter((st) => st.active)
      .map((st) => `<span class="pill mk" style="--mc:${st.company.color}">${makerLogo(st.company)}${esc(st.company.name)} ×${st.count}</span>`)
      .join('');
    const z = p.size ?? 1;
    const size = z === 1 ? '' : `<span class="pill sz">${ICON.size}${Math.round(z * 100)}% ${sizeName(z)}</span>`;
    const tiles = SLOTS.map((slot, k) => {
      const eq = p.loadout[slot];
      const item = ITEM_BY_ID.get(eq.id)!;
      const src = this.thumb(item, eq.rarity);
      return `<button class="tile" data-slot="${slot}" style="--rc:${partTint(item, eq.rarity)};--d:${(0.15 + k * 0.04).toFixed(2)}s" title="${esc(SLOT_LABEL[slot])}: ${esc(item.name)}">${src ? `<img src="${src}" alt="">` : SLOT_ICON[slot]}</button>`;
    }).join('');
    card.innerHTML = `<div class="hero-kicker"><span class="kicker">Your bot</span><b>Power ${b.rating}</b></div>
      <button class="hero-name">${esc(p.name)}</button>
      <div class="hero-meta">${move(b.fistAbility)}${move(b.kickAbility)}${sets}${size}</div>
      <div class="hero-tiles">${tiles}</div>`;
    const r = this.record;
    const stat = (n: number, label: string) => `<span><b>${n}</b>${label}</span>`;
    this.homeRecord!.innerHTML = stat(r.wins, 'Wins') + stat(r.losses, 'Losses') + (r.draws ? stat(r.draws, 'Draws') : '') + (r.streak > 1 ? stat(r.streak, 'Streak') : '');
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
    const homeBtn = button('home-btn', `${ICON.back}${ICON.home}<span>Home</span>`, () => {
      this.tap('back');
      this.go(this.online.active ? 'online' : 'home');
    }, top);
    homeBtn.title = 'Back to home';
    const id = el('div', 'garage-id', '', top);
    const nameRow = el('div', 'gname-row', '', id);
    const name = button('name', '', () => this.rename(), nameRow);
    const voice = button('voice-btn', '', () => this.voiceBotName(), nameRow);
    const power = el('div', 'gpower', '', id);
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
      this.player = { ...b, name: this.player.name, emotes: this.player.emotes, walkOn: this.player.walkOn };
      this.commitPlayer();
      this.game.garagePulse();
    }, actions);
    button('btn small', `${ICON.copy}Saves`, () => this.savesMenu(), actions);
    button('btn small primary', `${ICON.swords}Fight`, () => this.fight(), actions);
    this.garageEls = { name, voice, power, stats, rail, title, rar, items, view };
    return s;
  }

  private rename() {
    this.tap();
    this.openModal('Name your bot', (box) => {
      box.classList.add('dialog');
      const form = el('form', 'acct-form', '', box);
      const inp = el('input', 'acct-in', '', form) as HTMLInputElement;
      inp.value = this.player.name;
      inp.maxLength = 20;
      inp.spellcheck = false;
      inp.autocomplete = 'off';
      inp.setAttribute('aria-label', 'Bot name');
      const row = el('div', 'dialog-btns', '', form);
      button('btn small cyan', 'Cancel', () => this.closeModal(), row).type = 'button';
      el('button', 'btn small primary', 'Save', row);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const n = inp.value.trim().slice(0, 20);
        if (!n) return inp.focus();
        this.tap('select');
        this.closeModal();
        if (n !== this.player.name) {
          this.player.name = n;
          this.commitPlayer(false);
        }
      });
      requestAnimationFrame(() => {
        inp.focus();
        inp.select();
      });
    });
  }

  /** A small in-game dialog: a message and buttons; resolves with the button picked (-1 if closed). */
  private ask(title: string, text: string, buttons: [cls: string, label: string][]): Promise<number> {
    return new Promise((done) => {
      let picked = -1;
      this.openModal(title, (box) => {
        box.classList.add('dialog');
        el('p', 'dialog-text', esc(text), box);
        const row = el('div', 'dialog-btns', '', box);
        buttons.forEach(([cls, label], i) => button(`btn small ${cls}`, label, () => {
          picked = i;
          this.closeModal();
        }, row));
      }, () => done(picked));
    });
  }

  /** The voice button by the bot's name: record it, play it back, or wait for tomorrow. */
  private syncVoiceBtn() {
    const b = this.garageEls?.voice;
    if (!b) return;
    const done = isVoiced(this.player.name);
    const busy = b.classList.contains('busy');
    b.classList.toggle('done', done);
    b.innerHTML = busy ? `${ICON.mic}<span>Recording…</span>` : done ? `${ICON.sound}<span>Hear name</span>` : `${ICON.mic}<span>${canVoiceToday() ? 'Voice name' : 'Voice name tomorrow'}</span>`;
    b.disabled = busy || (!done && !canVoiceToday());
  }

  private async voiceBotName() {
    this.tap();
    const b = this.garageEls!.voice;
    const name = this.player.name;
    if (isVoiced(name)) {
      this.game.sfx?.previewName(name);
      return;
    }
    if (!canVoiceToday() || b.classList.contains('busy')) return;
    const go = await this.ask('Voice your bot\'s name', `The commentators will record "${name}" and call it out in your fights. You can record one name a day.`, [['cyan', 'Not now'], ['primary', 'Record it']]);
    if (go !== 1 || this.player.name !== name || b.classList.contains('busy')) return;
    b.classList.add('busy');
    this.syncVoiceBtn();
    try {
      const v = await voiceName(name);
      const clips: Parameters<NonNullable<Game['sfx']>['addName']>[1] = {};
      for (const [cut, c] of Object.entries(v.clips)) if (c) clips[cut as keyof typeof clips] = [bytesOf(c[0]), c[1]];
      this.game.sfx?.addName(v.name, clips);
      this.game.sfx?.previewName(v.name);
    } catch (e) {
      void this.ask('Couldn\'t record the name', (e as Error).message, [['cyan', 'OK']]);
    }
    b.classList.remove('busy');
    this.syncVoiceBtn();
  }

  /** Saved loadouts: switch bots, keep this one, or overwrite a slot. */
  private savesMenu() {
    this.tap();
    const draw = (box: HTMLElement) => {
      box.replaceChildren();
      box.classList.add('saves');
      const backdrop = box.parentElement!;
      backdrop.onclick = (e) => e.target === backdrop && this.closeModal();
      const top = el('div', 'set-head', '<h2>Saved bots</h2>', box);
      button('icon-btn', ICON.close, () => this.closeModal(), top);
      const saves = loadSaves();
      const list = el('div', 'save-list scroll', '', box);
      if (!saves.length) el('p', 'muted', 'No saved bots yet. Save this one to switch back to it any time.', list);
      saves.forEach((bot, i) => {
        const row = el('div', 'save-row', '', list);
        row.style.setProperty('--paint', paintOf(bot));
        el('div', 'save-name', `<b>${esc(bot.name)}</b><span>${isVoiced(bot.name) ? `${ICON.sound} ` : ''}Power ${Math.round(computeBuild(bot.loadout).rating)}</span>`, row);
        button('btn small primary', 'Use', () => {
          this.tap('select');
          this.player = structuredClone(bot);
          this.commitPlayer();
          this.game.garagePulse();
          this.closeModal();
        }, row);
        button('btn small', 'Save here', () => {
          this.tap();
          saves[i] = structuredClone(this.player);
          saveSaves(saves);
          draw(box);
        }, row);
        const del = button('icon-btn small', ICON.close, () => {
          if (!del.classList.contains('armed')) {
            del.classList.add('armed');
            del.title = 'Tap again to delete';
            return;
          }
          saves.splice(i, 1);
          saveSaves(saves);
          draw(box);
        }, row);
        del.title = 'Delete';
      });
      if (saves.length < MAX_SAVES)
        button('btn', `${ICON.copy}Save ${esc(this.player.name)}`, () => {
          this.tap('select');
          saves.push(structuredClone(this.player));
          saveSaves(saves);
          draw(box);
        }, box);
      else el('p', 'muted', `All ${MAX_SAVES} slots are used: save over one or delete one.`, box);
    };
    this.openModal('Saved bots', draw);
  }

  private randomizeName() {
    this.player.name = randomName(this.rng);
  }

  /** Persist the player and refresh whatever shows it. */
  private commitPlayer(rebuildModel = true) {
    savePlayer(this.player);
    this.online.session?.setBot(this.player);
    if (rebuildModel) {
      this.parts.clear();
      this.trialShown = false;
      this.game.showBot(this.player);
    }
    this.refreshGarage();
  }

  /** Take any part on trial off the bot (and put the saved bot back on the lift if asked). */
  private dropTrial(restore = true) {
    this.parts.clear();
    if (this.trialShown && restore) this.game.showBot(this.player);
    this.trialShown = false;
  }

  /** Camera close-up on one slot's part, or the whole robot (null). */
  private setFocus(slot: Slot | null) {
    if (this.tab !== 'part') slot = null;
    this.focus = slot;
    const f = slot ? FOCUS[slot] : OVERVIEW;
    const d = this.game.director;
    // a bigger frame puts every part higher and needs the camera further back
    const z = this.player.size ?? 1;
    d.garageTarget.set(f[0] * z, f[1] * z, f[2] * z);
    d.garageDist = f[3] * z;
    if (this.tab === 'emotes' && this.emoteKind === 'finish') this.game.sparring(true);
    this.garageEls!.view.innerHTML = slot ? `${ICON.whole}<span>Whole bot</span>` : `${ICON.zoom}<span>Inspect ${SLOT_LABEL[this.slot]}</span>`;
  }

  /** Picture of the real part an item fits, at a rarity, in the player's paint. */
  private thumb(item: ItemDef, rarity: Rarity) {
    try {
      return this.game.thumbs.get(item, rarity, this.player.paint, this.player.loadout);
    } catch {
      return '';
    }
  }

  private refreshGarage() {
    const g = this.garageEls!;
    const p = this.player;
    // the sparring dummy only stands in while finishers are on show
    if (!(this.tab === 'emotes' && this.emoteKind === 'finish')) this.game.sparring(false);
    // a part on trial belongs to the part tab it was picked in
    if (this.tab !== 'part') this.dropTrial();
    g.items.className = this.tab === 'part' ? 'items parts' : 'items scroll';
    const build = computeBuild(p.loadout);
    g.name.innerHTML = `${esc(p.name)} <span class="muted">✎</span>`;
    this.syncVoiceBtn();
    g.power.innerHTML = `<span>Power</span><b>${build.rating}</b>`;
    this.game.garageBot(p.name, build.rating, p.paint);

    this.renderStats();

    // the loadout rail: each slot shows the part it has fitted
    g.rail.innerHTML = '';
    for (const slot of SLOTS) {
      const eq = p.loadout[slot];
      const item = ITEM_BY_ID.get(eq.id)!;
      const src = this.thumb(item, eq.rarity);
      const t = button(`slot${slot === this.slot ? ' on' : ''}`, `${src ? `<img src="${src}" alt="">` : SLOT_ICON[slot]}<span>${SLOT_LABEL[slot]}</span>`, () => {
        this.tap();
        if (slot === this.slot && this.tab === 'part') this.setFocus(this.focus ? null : slot);
        else {
          this.dropTrial();
          this.slot = slot;
          this.tab = 'part';
          this.setFocus(slot);
          this.refreshGarage();
        }
      }, g.rail);
      t.style.setProperty('--rc', partTint(item, eq.rarity));
      if (this.tab !== 'part') t.classList.remove('on');
    }
    const picked = (p.emotes?.win.length ?? 0) + (p.emotes?.taunt.length ?? 0) + (p.emotes?.finish?.length ?? 0) + (p.emotes?.entrance?.length ?? 0) + (p.walkOn ? 1 : 0);
    const tabBtn = (tab: 'emotes' | 'paint' | 'size', icon: string, label: string, rc: string) => {
      const b = button(`slot ${tab}${this.tab === tab ? ' on' : ''}`, `${icon}<span>${label}</span>`, () => {
        if (this.tab === tab) return;
        this.tap();
        this.tab = tab;
        g.items.scrollTop = 0;
        this.refreshGarage();
      }, g.rail);
      b.style.setProperty('--rc', rc);
    };
    tabBtn('emotes', ICON.star, 'Emotes', picked ? '#ffc23d' : '#5d6880');
    tabBtn('paint', ICON.paint, 'Paint', hexColor(p.paint.accent));
    tabBtn('size', ICON.size, 'Size', (p.size ?? 1) === 1 ? '#5d6880' : '#2ad8ff');
    g.view.style.display = this.tab === 'part' ? '' : 'none';
    if (this.tab === 'emotes') {
      this.renderEmotes();
      this.prewarmThumbs();
      return;
    }
    if (this.tab === 'paint') {
      this.renderPaint();
      this.prewarmThumbs();
      return;
    }
    if (this.tab === 'size') {
      this.renderSize();
      this.prewarmThumbs();
      return;
    }
    // one tier in play: no rarity picker, no rarity label
    g.rar.className = MAX_RARITY ? 'rarities' : 'rarities none';

    const eq = p.loadout[this.slot];
    const cur = ITEM_BY_ID.get(eq.id)!;
    g.title.innerHTML = `<b>${SLOT_LABEL[this.slot]}</b><span>Fitted: ${esc(cur.name)}${MAX_RARITY ? ` · <i style="color:${RARITIES[eq.rarity].color}">${RARITIES[eq.rarity].name}</i>` : ''}</span>`;
    if (this.focus) this.setFocus(this.slot);
    else this.setFocus(null);

    g.rar.innerHTML = '';
    if (MAX_RARITY) RARITIES.slice(0, MAX_RARITY + 1).forEach((r, i) => {
      const b = button(`rar${i === eq.rarity ? ' on' : ''}`, r.name, () => {
        if (eq.rarity === i) return;
        this.tap();
        eq.rarity = i as Rarity;
        this.commitPlayer();
        this.game.garagePulse();
      }, g.rar);
      b.style.setProperty('--rc', r.color);
    });

    this.parts.render(g.items, this.slot);
    this.prewarmThumbs();
  }

  /** The Paint tab: ready-made schemes, each colour, the finish and the frame metal, all shown live on the bot. */
  private renderPaint() {
    const g = this.garageEls!;
    const paint = this.player.paint;
    const sc = schemeOf(paint);
    g.title.innerHTML = `<b>Paint</b><span>${sc ? esc(sc.name) : 'Custom'} · ${FINISHES[paint.finish].name} · ${FRAMES[paint.frame].name} frame</span>`;
    this.setFocus(null);

    g.rar.className = 'rarities pages';
    g.rar.innerHTML = '';
    for (const [page, label] of PAINT_PAGES) {
      const dot = page === 'schemes' || page === 'finish' ? '' : `<i style="background:${hexColor(paint[page])}"></i>`;
      const b = button(`rar${page === this.paintPage ? ' on' : ''}`, `${dot}${label}`, () => {
        if (this.paintPage === page) return;
        this.tap();
        this.paintPage = page;
        g.items.scrollTop = 0;
        this.refreshGarage();
      }, g.rar);
      b.style.setProperty('--rc', '#2ad8ff');
    }

    const scroll = g.items.scrollTop;
    g.items.innerHTML = '';
    const page = this.paintPage;
    if (page === 'schemes') {
      el('div', 'emote-hint', 'Pick a ready-made paint job, then fine-tune any colour, the finish or the frame.', g.items);
      const grid = el('div', 'pgrid schemes', '', g.items);
      for (const s of SCHEMES) {
        const p = s.paint;
        const b = button(
          `scheme${samePaint(p, paint) ? ' on' : ''}`,
          `<span class="sw" style="--a:${hexColor(p.primary)};--b:${hexColor(p.secondary)};--c:${hexColor(p.accent)}"></span><b>${esc(s.name)}</b><small>${FINISHES[p.finish].name}</small>`,
          () => this.setPaint({ ...p }),
          grid,
        );
        b.title = `${s.name}: ${FINISHES[p.finish].name}, ${FRAMES[p.frame].name} frame`;
      }
    } else if (page === 'finish') {
      el('div', 'psec', 'Finish', g.items);
      const fin = el('div', 'pgrid fins', '', g.items);
      FINISHES.forEach((f, i) => {
        button(
          `fin${i === paint.finish ? ' on' : ''}`,
          `<span class="ball f${i}" style="--c:${hexColor(paint.primary)}"></span><b>${f.name}</b><small>${f.blurb}</small>`,
          () => this.setPaint({ ...paint, finish: i }),
          fin,
        );
      });
      el('div', 'psec', 'Frame metal', g.items);
      const frm = el('div', 'pgrid fins', '', g.items);
      FRAMES.forEach((f, i) => {
        button(
          `fin${i === paint.frame ? ' on' : ''}`,
          `<span class="ball fm" style="--c:${hexColor(f.metal)}"></span><b>${f.name}</b><small>Joints and bare metal</small>`,
          () => this.setPaint({ ...paint, frame: i }),
          frm,
        );
      });
    } else {
      el('div', 'emote-hint', PAINT_HINT[page], g.items);
      const list = page === 'accent' ? GLOW_COLORS : PAINT_COLORS;
      const grid = el('div', `pgrid colors${page === 'accent' ? ' glow' : ''}`, '', g.items);
      const cur = paint[page];
      for (const c of list) {
        const b = button(`pc${c === cur ? ' on' : ''}`, '', () => this.setPaint({ ...paint, [page]: c }), grid);
        b.style.setProperty('--c', hexColor(c));
      }
      // any colour at all, from the system colour picker; previewed live while dragging
      const custom = el('label', `pc custom${list.includes(cur) ? '' : ' on'}`, `${ICON.paint}`, grid);
      custom.style.setProperty('--c', hexColor(cur));
      custom.title = 'Custom colour';
      const inp = el('input', '', '', custom) as HTMLInputElement;
      inp.type = 'color';
      inp.value = hexColor(cur);
      let t = 0;
      inp.addEventListener('input', () => {
        this.player.paint = { ...this.player.paint, [page]: parseInt(inp.value.slice(1), 16) };
        custom.style.setProperty('--c', inp.value);
        clearTimeout(t);
        t = window.setTimeout(() => this.game.showBot(this.player), 80);
      });
      inp.addEventListener('change', () => {
        clearTimeout(t);
        // the live preview already set the colour: save it and redraw the tab
        this.player.paint = { ...this.player.paint, [page]: parseInt(inp.value.slice(1), 16) };
        this.tap('select');
        this.commitPlayer();
        this.game.garagePulse();
      });
    }
    g.items.scrollTop = scroll;
  }

  /** The Size tab: build the frame up to 120% or down to 80%, with what it trades shown live. */
  private renderSize() {
    const g = this.garageEls!;
    this.setFocus(null);
    g.rar.className = 'rarities none';
    g.rar.innerHTML = '';
    const scroll = g.items.scrollTop;
    g.items.innerHTML = '';
    el('div', 'emote-hint', 'A bigger frame reaches further, takes more punishment and hits harder, but it is slower and an easier target. A smaller one is quick, sharp and hard to hit, but has less to give.', g.items);
    const box = el('div', 'sizer', '', g.items);
    const read = el('div', 'sz-read', '', box);
    const inp = el('input', 'sz-range', '', box) as HTMLInputElement;
    inp.type = 'range';
    inp.min = String(Math.round(SIZE_MIN * 100));
    inp.max = String(Math.round(SIZE_MAX * 100));
    inp.step = '5';
    el('div', 'sz-ticks', '<span>Compact</span><span>Standard</span><span>Giant</span>', box);
    const rows = el('div', 'sz-rows', '', g.items);
    const draw = () => {
      const size = this.player.size ?? 1;
      const pct = Math.round(size * 100);
      inp.value = String(pct);
      inp.style.setProperty('--k', String((size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)));
      read.innerHTML = `<b>${pct}%</b><span>${sizeName(size)}</span>`;
      g.title.innerHTML = `<b>Size</b><span>${pct}% · ${sizeName(size)} frame</span>`;
      const a = computeBuild(this.player.loadout, size).stats;
      const o = computeBuild(this.player.loadout, 1).stats;
      const reach = Math.round((size - 1) * 100);
      // [label, change in %, more is better for the bot]
      const lines: [string, number, boolean][] = [
        ['Reach and height', reach, true],
        ['Target size', reach, false],
        ['Health', Math.round((a.maxHp / o.maxHp - 1) * 100), true],
        ['Strike power', Math.round((a.punchPower / o.punchPower - 1) * 100), true],
        ['Knockdown resistance', Math.round((a.stability / o.stability - 1) * 100), true],
        ['Hand speed', Math.round((a.punchSpeed / o.punchSpeed - 1) * 100), true],
        ['Footwork', Math.round(((a.moveSpeed * a.agility) / (o.moveSpeed * o.agility) - 1) * 100), true],
        ['Reflexes', Math.round((o.reaction / a.reaction - 1) * 100), true],
        ['Accuracy', Math.round((a.accuracy - o.accuracy) * 100), true],
      ];
      rows.innerHTML = lines
        .map(([l, v, good]) => {
          const cls = v === 0 ? '' : (v > 0) === good ? ' up' : ' down';
          return `<div class="sz-row${cls}"><span>${l}</span><b>${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%</b></div>`;
        })
        .join('');
      this.renderStats();
    };
    draw();
    let t = 0;
    inp.addEventListener('input', () => {
      this.player.size = sanitizeSize(Number(inp.value) / 100);
      draw();
      // reframe and rebuild the bot as the slider moves (lightly throttled)
      this.setFocus(null);
      clearTimeout(t);
      t = window.setTimeout(() => this.game.showBot(this.player), 60);
    });
    inp.addEventListener('change', () => {
      clearTimeout(t);
      this.tap('select');
      this.commitPlayer();
      this.game.garagePulse();
    });
    g.items.scrollTop = scroll;
  }

  private setPaint(p: Paint) {
    if (samePaint(p, this.player.paint)) return;
    this.tap('select');
    this.player.paint = p;
    this.commitPlayer();
    this.game.garagePulse();
  }

  /** The Emotes tab: equip up to three celebrations and three taunts, tap one to see it. */
  private renderEmotes() {
    const g = this.garageEls!;
    const p = this.player;
    const kind = this.emoteKind;
    const mine = p.emotes?.[kind] ?? [];
    const count = (k: EmoteKind) => p.emotes?.[k]?.length ?? 0;
    const when = kind === 'win' ? 'After a win' : kind === 'taunt' ? 'While they are down' : kind === 'entrance' ? 'Rising out of your corner' : 'When they are almost out';
    g.title.innerHTML = `<b>Emotes</b><span>${when} · ${mine.length ? `${mine.length}/${MAX_PICKS} equipped` : 'bot picks its own'}</span>`;
    this.setFocus(null);
    // finishers need someone to finish: a sparring dummy steps in while they're on show
    this.game.sparring(kind === 'finish');

    g.rar.className = 'rarities kinds';
    g.rar.innerHTML = '';
    const kinds: [EmoteKind, string, string][] = [
      ['win', 'Celebrations', '#ffc23d'],
      ['taunt', 'Taunts', '#ff5a5a'],
      ['finish', 'Finishers', '#ff8a1f'],
      ['entrance', 'Entrances', '#5ad1ff'],
    ];
    for (const [k, label, color] of kinds) {
      const b = button(`rar${k === kind ? ' on' : ''}`, `${label} <small>${count(k)}/${MAX_PICKS}</small>`, () => {
        if (this.emoteKind === k) return;
        this.tap();
        this.emoteKind = k;
        g.items.scrollTop = 0;
        this.refreshGarage();
      }, g.rar);
      b.style.setProperty('--rc', color);
    }

    const scroll = g.items.scrollTop;
    g.items.innerHTML = '';
    el(
      'div',
      'emote-hint',
      kind === 'finish'
        ? `When the other bot is down to 15% and yours still has 40%, your next clean shot becomes a finisher. ${mine.length ? 'Yours picks one of these.' : 'Nothing equipped: your bot picks one to suit its style.'}`
        : kind === 'entrance'
          ? `Your bot rides a lift up out of its corner before the fight, to its own walk-on music. ${mine.length ? 'It makes one of these entrances.' : 'Nothing equipped: it picks an entrance to suit its style.'}`
          : mine.length
          ? `Your bot only performs what you equip here, picking whatever suits the fight.`
          : `Nothing equipped: your bot picks its own. Equip up to ${MAX_PICKS} to choose.`,
      g.items,
    );
    if (kind === 'entrance') this.renderWalkOns(g.items);
    for (const e of EMOTE_INFO) {
      if (e.kind !== kind) continue;
      const n = mine.indexOf(e.id);
      const row = el('div', `emote${n >= 0 ? ' on' : ''}`, '', g.items);
      row.style.setProperty('--rc', kinds.find((x) => x[0] === kind)![2]);
      button('emote-play', this.emoteHtml(e, n), () => {
        this.tap();
        this.game.previewEmote(e.id);
      }, row);
      button('emote-eq', n >= 0 ? `${ICON.close}<span>Remove</span>` : `<span>Equip</span>`, () => this.toggleEmote(e), row);
    }
    g.items.scrollTop = scroll;
  }

  private emoteHtml(e: EmoteInfo, slot: number) {
    const badge = slot >= 0 ? `<i>${slot + 1}</i>` : '';
    return `<div class="pic">${e.kind === 'win' ? ICON.trophy : e.kind === 'finish' ? ICON.bolt : e.kind === 'entrance' ? ICON.star : ICON.flame}${badge}</div>
      <div class="t"><b>${esc(e.name)}</b><span class="play">${ICON.play}</span></div>
      <div class="tag">${esc(e.blurb)}</div>`;
  }

  /** Entrances tab: the bot's walk-on music, one tap to pick and hear it. */
  private renderWalkOns(into: HTMLElement) {
    const p = this.player;
    const now = walkOnFor(p);
    const box = el('div', 'walkons', '', into);
    el('div', 'walkons-h', `<b>Walk-on music</b><span>${p.walkOn ? 'Your pick' : 'Goes with its name'}</span>`, box);
    const row = el('div', 'walkons-row', '', box);
    // render them all now, so a tap plays at once instead of a second or two later
    this.game.sfx?.primeWalkOn(now, ...WALK_ONS.map((w) => w.id));
    for (const w of WALK_ONS) {
      button(`walkon${w.id === now ? ' on' : ''}`, `${ICON.sound}<b>${esc(w.name)}</b><span>${esc(w.blurb)}</span>`, () => {
        this.tap('select');
        this.game.sfx?.walkOn(w.id, 0, 0.8, true);
        if (p.walkOn === w.id) return;
        p.walkOn = w.id;
        // (redraws the tab with the new pick)
        this.commitPlayer(false);
      }, row);
    }
  }

  /** Equip or take off an emote; a fourth pick replaces the oldest. */
  private toggleEmote(e: EmoteInfo) {
    const p = this.player;
    const picks = p.emotes ?? { win: [], taunt: [], finish: [], entrance: [] };
    const list = (picks[e.kind] ??= []);
    const i = list.indexOf(e.id);
    if (i >= 0) {
      this.tap('back');
      list.splice(i, 1);
    } else {
      this.tap('select');
      list.push(e.id);
      if (list.length > MAX_PICKS) list.shift();
      this.game.previewEmote(e.id);
    }
    if (picks.win.length || picks.taunt.length || picks.finish?.length || picks.entrance?.length) p.emotes = picks;
    else delete p.emotes;
    // keep the showcase bot (and its preview) as it is: only the picks changed
    this.commitPlayer(false);
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

  /** The diagnostics box; while a part is on trial it shows what fitting it would add or take away. */
  private renderStats() {
    const trial: Loadout | null = this.tab === 'part' ? this.parts.trialLoadout() : null;
    const rowsOf = (lo: Loadout) => {
      const s = computeBuild(lo, this.player.size).stats;
      const strike = (s.punchPower + s.kickPower) / 2;
      const feet = (s.moveSpeed / 2.1) * s.agility;
      // [label, bar fill (0..1, more is better), readout]
      const rows: [string, number, string][] = [
        ['Health', (s.maxHp - 1100) / 800, String(Math.round(s.maxHp))],
        ['Strike', (strike - 0.85) / 0.9, `${Math.round(strike * 100)}`],
        ['Speed', (s.punchSpeed - 0.9) / 0.6, `${Math.round(s.punchSpeed * 100)}`],
        ['Defense', (s.armor + s.headGuard * 0.5) / 0.35, `${Math.round(s.armor * 100)}%`],
        ['Footwork', (feet - 0.9) / 0.8, `${Math.round(feet * 100)}`],
        ['Reflexes', (0.15 / s.reaction - 0.9) / 0.9, `${Math.round(s.reaction * 1000)}ms`],
      ];
      return rows.map(([l, k, v]) => [l, Math.max(0.04, Math.min(1, k)), v] as const);
    };
    const now = rowsOf(this.player.loadout);
    const next = trial ? rowsOf(trial) : now;
    const b = computeBuild(trial ?? this.player.loadout, this.player.size);
    const pct = (k: number) => `${Math.round(k * 100)}%`;
    const g = this.garageEls!;
    g.stats.innerHTML =
      `<div class="sh"><span>${trial ? '<b class="trial">On trial</b>' : 'Diagnostics'}</span><span class="muted">${MOVES[b.fistAbility].name} · ${MOVES[b.kickAbility].name}</span></div>` +
      next
        .map(([l, k, v], i) => {
          const k0 = now[i][1];
          const d = Math.abs(k - k0) < 0.005 ? '' : k > k0 ? 'up' : 'down';
          // the bar as fitted, with what the trial adds (green) or takes away (outlined)
          const bar = d ? `<i style="width:${pct(Math.min(k, k0))}"></i><u class="${d}" style="left:${pct(Math.min(k, k0))};width:${pct(Math.abs(k - k0))}"></u>` : `<i style="width:${pct(k)}"></i>`;
          return `<span class="lbl">${l}</span><div class="bar">${bar}</div><span class="val${d && ` ${d}`}">${v}</span>`;
        })
        .join('') +
      `<div class="sets">${b.sets
        .map((st) => {
          const next = st.company.sets.find((x) => st.count < x.at);
          const live = st.company.sets.filter((x) => st.count >= x.at).map((x) => esc(x.text)).join(' · ');
          const stalled = st.company.needsFull && st.count < SLOTS.length;
          const hint = stalled
            ? `Stalled: fit all six ${esc(st.company.short)} parts to start the engine`
            : live || (next ? `${next.at - st.count} more for ${esc(next.text)}` : '');
          return `<span class="set${st.active ? ' on' : ''}" style="--mc:${st.company.color}" title="${esc(st.company.name)}">${makerLogo(st.company)}<b>${st.count}</b><span>${hint}</span></span>`;
        })
        .join('')}</div>`;
  }

  /**
   * Drag or swipe sideways to turn the robot (it keeps spinning a little when let go).
   * In the garage it drifts slowly when left alone; on the home screen the camera eases
   * back to its idle orbit a few seconds after the last touch.
   */
  private setupGarageDrag() {
    const canvas = this.game.stage.renderer.domElement;
    let lastX = 0;
    let lastT = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.current === 'fight') return;
      // a tap during the way out to the arena skips to the fight
      if (this.leaving) {
        this.game.homeSkip();
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.spin.dragging = true;
      this.spin.vel = 0;
      lastX = e.clientX;
      lastT = performance.now();
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.spin.dragging) return;
      const now = performance.now();
      const d = (e.clientX - lastX) * 0.012;
      const dir = this.game.director;
      if (this.current === 'garage') dir.garageYaw -= d;
      else {
        dir.menuTurn -= d;
        dir.menuLive = true;
      }
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

  /** Fling spin with inertia (both screens). Returns the turn to apply this frame. */
  private flingStep(dt: number) {
    const s = this.spin;
    s.idle += dt;
    s.vel *= Math.exp(-3.5 * dt);
    if (Math.abs(s.vel) > 6) s.vel = Math.sign(s.vel) * 6;
    return s.vel * dt;
  }

  private garageTick(dt: number) {
    const s = this.spin;
    if (s.dragging) return;
    const turn = this.flingStep(dt);
    // showroom drift once nobody has touched it for a while
    const drift = s.idle > 5 ? Math.min(1, (s.idle - 5) / 3) * 0.06 : 0;
    this.game.director.garageYaw += turn + drift * dt;
  }

  /** Home screen: coast after a swipe, then glide back to the slow showcase orbit. */
  private homeTick(dt: number) {
    const s = this.spin;
    const d = this.game.director;
    if (s.dragging || !d.menuLive || this.leaving) return;
    d.menuTurn += this.flingStep(dt);
    if (s.idle < 3.5) return;
    // the short way home: whole turns don't count
    const TAU = Math.PI * 2;
    d.menuTurn -= Math.round(d.menuTurn / TAU) * TAU;
    d.menuTurn *= Math.exp(-Math.min(1, (s.idle - 3.5) / 1.5) * 1.6 * dt);
    if (Math.abs(d.menuTurn) < 0.002 && Math.abs(s.vel) < 0.01) {
      d.menuTurn = 0;
      d.menuLive = false;
    }
  }

  // ------------------------------------------------------------ fight
  /** Random-gear opponent whose power rating lands near the player's. */
  private makeOpponent(): BotSpec {
    const target = computeBuild(this.player.loadout).rating * this.rng.range(0.9, 1.1);
    let best: BotSpec | null = null;
    let bestD = Infinity;
    for (let i = 0; i < 40; i++) {
      const b = randomBot(this.rng, this.rng.next(), this.player.paint);
      const d = Math.abs(computeBuild(b.loadout).rating - target);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    best!.paint = contrastingPaint(this.player.paint, this.rng);
    return best!;
  }

  private fight(sameOpponent = false) {
    if (!sameOpponent) this.eventRun = null;
    if (this.online.active) {
      // in a room: fights start from there
      this.tap('select');
      this.go('online');
      return;
    }
    if (this.leaving) return;
    this.tap('start');
    void enterLandscape();
    if (this.current === 'home' && this.game.place === 'home') {
      // the robot gets the call (or throws the last punch), then a cut to the arena
      this.leaving = true;
      this.screens.home.classList.add('leaving');
      const d = this.game.director;
      d.menuTurn = 0;
      d.menuLive = false;
      this.spin.vel = 0;
      this.spin.dragging = false;
      this.game.homeOutro(() => {
        if (!this.leaving) return;
        this.fade.classList.add('white', 'on');
        window.setTimeout(() => {
          if (!this.leaving) return this.fade.classList.remove('white', 'on');
          this.startFight(sameOpponent);
          window.setTimeout(() => this.fade.classList.remove('white'), 900);
        }, 280);
      });
      return;
    }
    this.startFight(sameOpponent);
  }

  private startFight(sameOpponent: boolean) {
    this.closeResults();
    if (!sameOpponent || !this.opponent) this.opponent = this.makeOpponent();
    const seed = (Math.random() * 2 ** 32) >>> 0;
    // an event's rounds are fought in its own venue, everything else indoors
    const arena = (this.eventRun && EVENT_BY_ID.get(this.eventRun.id)?.arena) || 'grand';
    // copies, so a later trip to the garage can't change the fight a replay shows
    this.lastFight = { a: structuredClone(this.player), b: structuredClone(this.opponent), seed, cut: -1, coach: [], end: -1, marks: [], arena };
    this.replaying = false;
    this.game.setArena(arena);
    const m = this.game.startMatch(this.player, this.opponent, seed);
    this.hud.resetSpeed();
    this.hud.attach(m);
    this.go('fight');
  }

  /** The next round of a map event: its rival for that round, then into the arena. */
  private fightEvent(e: EventDef) {
    if (this.online.active || this.venueWait) return;
    const round = progressOf(this.record.events, e.id).run;
    this.eventRun = { id: e.id, round };
    this.opponent = rival(e, round, this.player);
    this.tap('start');
    void enterLandscape();
    // the venue is put up first (the first time, its code comes down too), so the walkout is in it
    const from = this.current;
    this.venueWait = e.id;
    const go = () => {
      if (this.venueWait !== e.id) return;
      this.venueWait = null;
      if (this.current === from) this.startFight(true);
    };
    this.game.loadVenue(e.arena).then(go, go);
  }

  /** Watch the last fight again, from the walkout to the celebration. */
  private replay() {
    const r = this.lastFight;
    if (!r || this.venueWait) return;
    if (r.arena && r.arena !== 'grand') {
      // an event's venue goes up first (its code may still have to come down)
      const from = this.current;
      this.venueWait = r.arena;
      const go = () => {
        if (this.venueWait !== r.arena) return;
        this.venueWait = null;
        if (this.current === from && this.lastFight === r) this.playTape(r);
      };
      this.game.loadVenue(r.arena).then(go, go);
      return;
    }
    this.playTape(r);
  }

  private playTape(r: Tape) {
    this.tap('start');
    void enterLandscape();
    this.closeResults();
    // watched on this phone only: the room stays open, and its rematch vote waits on the results
    this.leaveNetFight();
    this.replaying = true;
    this.resultsAfterSeek = false;
    const m = this.game.startReplay(r);
    this.hud.resetSpeed();
    this.hud.attach(m, null, true);
    this.go('fight');
  }

  /** The saved replays: watch one again, or delete it. */
  private replaysMenu() {
    this.tap();
    void this.replays.sync();
    const draw = (box: HTMLElement) => {
      box.replaceChildren();
      box.classList.add('saves');
      const backdrop = box.parentElement!;
      backdrop.onclick = (e) => e.target === backdrop && this.closeModal();
      const top = el('div', 'set-head', '<h2>Replays</h2>', box);
      button('icon-btn', ICON.close, () => this.closeModal(), top);
      const list = this.replays.list;
      const rows = el('div', 'save-list scroll', '', box);
      if (!list.length) el('p', 'muted', 'No saved replays yet. After a fight, tap Save replay on the results to keep it here.', rows);
      for (const r of list) {
        const t = r.tape;
        // this player's bot first (online they may have fought from the right corner)
        const me = t.me ?? 0;
        const [mine, theirs] = me === 1 ? [t.b, t.a] : [t.a, t.b];
        const row = el('div', 'save-row replay-row', '', rows);
        row.style.setProperty('--paint', paintOf(mine));
        const verdict = r.winner < 0 ? 'Draw' : r.winner === me ? 'Win' : 'Loss';
        const how = r.kind && r.kind !== 'Draw' ? ` by ${r.kind === 'Decision' ? 'decision' : r.kind}` : '';
        const date = new Date(r.saved).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const old = outdated(r) ? '<em class="old">Older version</em>' : '';
        const net = t.online ? `${ICON.globe} ` : '';
        el('div', 'save-name', `<b>${esc(mine.name)} vs ${esc(theirs.name)}</b><span class="${r.winner < 0 ? '' : r.winner === me ? 'win' : 'loss'}">${net}${verdict}${how} · ${r.secs}s · ${date}${old}</span>`, row);
        button('btn small primary', `${ICON.play}Watch`, () => void this.watchSaved(r), row);
        const del = button('icon-btn small', ICON.close, () => {
          if (!del.classList.contains('armed')) {
            del.classList.add('armed');
            del.title = 'Tap again to delete';
            return;
          }
          this.replays.remove(r.id);
          draw(box);
        }, row);
        del.title = 'Delete';
      }
      el('p', 'muted small', `${list.length} of ${MAX_REPLAYS} kept${this.account.username ? ', saved to your account' : ''}.`, box);
    };
    this.openModal('Replays', (box) => {
      draw(box);
      this.replaysView = () => draw(box);
    }, () => {
      this.replaysView = null;
    });
  }

  /** Watch a saved replay (asking first when an older version of the game recorded it). */
  private async watchSaved(r: SavedReplay) {
    this.closeModal();
    if (outdated(r)) {
      const go = await this.ask('Older replay', 'This fight was saved on an older version of the game. The bots have changed since, so it may not play out the way it did.', [['cyan', 'Cancel'], ['primary', 'Watch anyway']]);
      if (go !== 1) return;
    }
    this.lastFight = structuredClone(r.tape);
    // Rematch on its results fights the same opponent
    this.opponent = structuredClone(r.tape.me === 1 ? r.tape.a : r.tape.b);
    this.replay();
  }

  /** The replay's results: run it to the end first (it's quick), then show them. */
  private replayResults() {
    const g = this.game;
    const t = g.tape;
    if (!t || !g.match) return;
    if (!g.seeking && g.match.frame >= t.end) return this.showResults();
    this.resultsAfterSeek = true;
    g.seek(t.end);
  }

  /** The big moments of a fight, for the replay's scrubber. */
  private markMoment(type: string, data: unknown) {
    const m = this.game.match;
    const t = this.lastFight;
    if (!m || !t || m.phase === 'end') return;
    const kind = type === 'ko' ? 'ko' : type === 'detach' ? 'tear' : type === 'knockdown' && m.phase === 'fight' ? 'kd' : null;
    if (!kind) return;
    if (kind === 'kd' && (data as { defender: Fighter }).defender.state === 'ko') return;
    t.marks.push({ frame: m.frame, kind });
  }

  private pause() {
    if (this.modal || !this.game.match) return;
    if (this.netFight) return this.netMenu();
    if (this.replaying) return this.replayMenu();
    this.tap();
    this.game.paused = true;
    this.openModal('Paused', (box) => {
      button('btn primary', `${ICON.play}Resume`, () => this.closeModal(), box);
      this.soundRow(box);
      button('btn small danger', `${ICON.exit}Forfeit`, () => {
        this.closeModal();
        if (this.game.match && this.game.match.phase !== 'end') {
          this.tally(false, false);
          // walking out of an event's round ends the run
          this.eventResult(false, false);
        }
        this.go(this.eventRun ? 'map' : 'home');
      }, box);
    }, () => {
      this.game.paused = false;
    });
  }

  private replayMenu() {
    this.tap();
    // the menu holds the replay, and leaves it playing or paused as it was
    const was = this.game.paused;
    this.game.paused = true;
    this.openModal('Replay', (box) => {
      button('btn primary', `${ICON.play}Resume`, () => this.closeModal(), box);
      this.soundRow(box);
      button('btn small', `${ICON.forward}Skip to the result`, () => {
        this.closeModal();
        this.replayResults();
      }, box);
      if (this.lastFight?.online && this.online.session)
        button('btn small', `${ICON.globe}Room`, () => {
          this.closeModal();
          this.go('online');
        }, box);
      button('btn small', `${ICON.exit}Home`, () => {
        this.closeModal();
        this.go('home');
      }, box);
    }, () => {
      this.game.paused = was;
    });
  }

  private settings() {
    this.tap();
    this.openModal('Settings', (box) => {
      box.classList.add('settings');
      box.replaceChildren();
      const backdrop = box.parentElement!;
      backdrop.addEventListener('click', (e) => e.target === backdrop && this.closeModal());
      const top = el('div', 'set-head', '<h2>Settings</h2>', box);
      button('icon-btn', ICON.close, () => this.closeModal(), top);
      const grid = el('div', 'set-grid', '', box);

      const col = (title: string) => {
        const c = el('section', 'set-col', '', grid);
        el('h3', '', title, c);
        return c;
      };

      // Game feel: sound, camera, stats, record.
      const game = col('Game');
      this.segRow(game, 'Sound', () => [
        { text: 'On', on: !this.game.sfx?.muted, pick: () => this.game.sfx?.muted && this.toggleSound() },
        { text: 'Off', on: !!this.game.sfx?.muted, pick: () => !this.game.sfx?.muted && this.toggleSound() },
      ]);
      this.segRow(game, 'Commentary', () =>
        ([['On', 1], ['Quiet', 0.5], ['Off', 0]] as const).map(([text, v]) => ({
          text,
          on: (this.game.sfx?.commentary ?? 1) === v,
          pick: () => this.game.sfx?.setCommentary(v),
        })),
      );
      this.segRow(game, 'Camera zoom', () =>
        (['close', 'normal', 'wide'] as Zoom[]).map((z) => ({
          text: z[0].toUpperCase() + z.slice(1),
          on: z === this.game.director.zoom,
          pick: () => {
            this.game.director.zoom = z;
            saveZoom(z);
            this.hud.syncZoom();
          },
        })),
      );
      this.segRow(game, 'Performance stats', () => [
        { text: 'On', on: this.perf.visible, pick: () => this.perf.setVisible(true) },
        { text: 'Off', on: !this.perf.visible, pick: () => this.perf.setVisible(false) },
      ]);
      const reset = button('set-danger', 'Reset win record', () => {
        if (!reset.classList.contains('armed')) {
          reset.classList.add('armed');
          reset.textContent = 'Tap again to reset';
          return;
        }
        this.record = { wins: 0, losses: 0, draws: 0, streak: 0, best: 0, events: this.record.events };
        saveRecord(this.record);
        this.refreshHome();
        reset.classList.remove('armed');
        reset.textContent = 'Record reset';
        reset.disabled = true;
      }, game);

      // Graphics: quality, resolution, frame rate.
      const gfx = col('Graphics');
      const saved = loadQuality();
      const qName = (q: Quality) => (q === 'med' ? 'Medium' : q[0].toUpperCase() + q.slice(1));
      this.segRow(gfx, saved ? 'Quality' : `Quality <span>Auto picked ${qName(this.quality)}</span>`, () => [
        { text: 'Auto', on: !saved, pick: () => saved && (saveQuality(null), location.reload()) },
        ...(['low', 'med', 'high'] as Quality[]).map((q) => ({
          text: q === 'med' ? 'Med' : qName(q),
          on: !!saved && q === this.quality,
          pick: () => (saved !== q ? (saveQuality(q), location.reload()) : undefined),
        })),
      ]);
      const stage = this.game.stage;
      // ray-traced lighting needs the high-quality pipeline; it rebuilds every shader, so it reloads
      if (this.quality === 'high') {
        const rtSaved = loadRT();
        this.segRow(gfx, rtSaved === null ? `Ray tracing <span>Auto: ${stage.rt ? 'on' : 'off'}</span>` : 'Ray tracing', () => [
          { text: 'Auto', on: rtSaved === null, pick: () => rtSaved !== null && (saveRT(null), location.reload()) },
          { text: 'Off', on: rtSaved === false, pick: () => rtSaved !== false && (saveRT(false), location.reload()) },
          { text: 'On', on: rtSaved === true, pick: () => rtSaved !== true && (saveRT(true), location.reload()) },
        ]);
      }
      const native = resScaleChoices().at(-1)!.value;
      const resOpts: { value: ResScale; text: string }[] = [
        { value: null, text: 'Auto' },
        ...resScaleChoices().map((c) => ({ value: c.value, text: c.native ? 'Native' : `${c.value}x` })),
      ];
      this.segRow(
        gfx,
        () => {
          const cur = stage.resScale;
          const pr = stage.renderer.getPixelRatio();
          return `Resolution <span>${cur === null ? `Auto, now ${+pr.toFixed(2)}x` : `${cur}x`} of ${native}x</span>`;
        },
        () => resOpts.map((o) => ({ text: o.text, on: o.value === stage.resScale, pick: () => stage.setResScale(o.value) })),
      );
      const pacer = this.game.pacer;
      this.segRow(gfx, `Frame rate <span>Screen ${pacer.hz} Hz</span>`, () =>
        (['max', 60, 30] as FpsCap[]).map((o) => ({
          text: o === 'max' ? `Max ${pacer.hz}` : `${o}`,
          on: o === pacer.cap,
          pick: () => pacer.setCap(o),
        })),
      );
    });
  }

  /**
   * One labelled row of segmented choices. `opts` is re-read after every tap so the
   * highlighted choice and the label always reflect live state.
   */
  private segRow(
    parent: HTMLElement,
    label: string | (() => string),
    opts: () => { text: string; on: boolean; pick: () => unknown }[],
  ) {
    const row = el('div', 'set-row', '', parent);
    const lab = el('div', 'set-label', '', row);
    const seg = el('div', 'seg fit', '', row);
    const sync = () => {
      lab.innerHTML = typeof label === 'string' ? label : label();
      const list = opts();
      seg.replaceChildren();
      for (const o of list) {
        button(o.on ? 'on' : '', o.text, () => {
          if (o.on) return;
          this.tap();
          o.pick();
          sync();
        }, seg);
      }
    };
    sync();
  }

  // ------------------------------------------------------------ account
  /** The account's saved bot and record arrived from the cloud: they replace this device's. */
  private adoptCloud(bot: BotSpec, record: Record_) {
    this.player = bot;
    this.record = record;
    savePlayer(bot);
    saveRecord(record);
    this.online.session?.setBot(bot);
    // a fight on screen keeps its bots; the new one shows on the way back
    if (this.current !== 'fight') this.game.showBot(bot);
    this.refreshHome();
    if (this.current === 'garage') this.refreshGarage();
  }

  private refreshAccount() {
    const b = this.accountBtn;
    if (!b) return;
    const name = this.account.username;
    b.classList.toggle('in', !!name);
    b.classList.toggle('offline', !!name && this.account.sync === 'offline');
    b.innerHTML = name ? `${ICON.user}<span>${esc(name)}</span>` : `${ICON.user}<span>Log in</span>`;
  }

  private accountPopup() {
    this.tap();
    let mode: 'login' | 'signup' = 'login';
    let error = '';
    let busy = false;
    const typed = { user: '', pass: '' };
    this.openModal('Account', (box) => {
      box.classList.add('account');
      const draw = () => {
        box.replaceChildren();
        const name = this.account.username;
        if (name) {
          el('h2', '', 'Account', box);
          el('div', 'acct-who', `${ICON.user}<b>${esc(name)}</b>`, box);
          el('p', `acct-sync ${this.account.sync}`, `${ICON.cloud}${esc(syncText(this.account.sync, this.account.syncedAt))}`, box);
          el('p', 'muted', 'Your bot, paint, emotes and win record are saved to your account. Log in on any device to pick up where you left off.', box);
          const row = el('div', 'acct-actions', '', box);
          button('btn small', `${ICON.exit}Log out`, () => {
            this.tap('back');
            this.account.logout();
          }, row);
          button('btn small cyan', 'Close', () => this.closeModal(), row);
          return;
        }
        el('h2', '', mode === 'login' ? 'Log in' : 'Create account', box);
        const seg = el('div', 'seg acct-tabs', '', box);
        for (const [m, text] of [['login', 'Log in'], ['signup', 'Sign up']] as const) {
          button(m === mode ? 'on' : '', text, () => {
            if (m === mode || busy) return;
            this.tap();
            mode = m;
            error = '';
            draw();
          }, seg);
        }
        const form = el('form', 'acct-form', '', box);
        const user = el('input', 'acct-in', '', form);
        user.placeholder = 'Username';
        user.maxLength = USERNAME_MAX;
        user.autocomplete = 'username';
        user.spellcheck = false;
        user.setAttribute('autocapitalize', 'none');
        user.setAttribute('aria-label', 'Username');
        user.value = typed.user;
        const pass = el('input', 'acct-in', '', form);
        pass.type = 'password';
        pass.placeholder = mode === 'signup' ? `Password (${PASSWORD_MIN}+ characters)` : 'Password';
        pass.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
        pass.setAttribute('aria-label', 'Password');
        pass.value = typed.pass;
        user.addEventListener('input', () => (typed.user = user.value));
        pass.addEventListener('input', () => (typed.pass = pass.value));
        if (error) el('p', 'acct-error', esc(error), form);
        const go = el('button', 'btn primary', busy ? 'Wait…' : mode === 'login' ? 'Log in' : 'Create account', form);
        go.type = 'submit';
        go.disabled = busy;
        el('p', 'muted', mode === 'login'
          ? 'Logging in loads your account\'s bot on this device.'
          : 'Your account starts with the bot you have now, and saves it so it follows you to any device.', box);
        button('btn small cyan', 'Close', () => this.closeModal(), box);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (busy) return;
          this.tap('select');
          busy = true;
          error = '';
          draw();
          const job = mode === 'login' ? this.account.login(typed.user, typed.pass) : this.account.register(typed.user.trim(), typed.pass);
          void job.then((err) => {
            busy = false;
            error = err ?? '';
            if (!err) typed.pass = '';
            if (this.accountView === draw) draw();
          });
        });
      };
      this.accountView = draw;
      draw();
    }, () => {
      this.accountView = null;
    });
  }

  // ------------------------------------------------------------ patch notes
  private patchBtn(parent: HTMLElement) {
    const latest = PATCH_NOTES[0] ? `${PATCH_NOTES[0].hour}|${PATCH_NOTES[0].title}|${PATCH_NOTES[0].notes.length}` : '';
    let seen = '';
    try {
      seen = localStorage.getItem('bb.notesSeen') ?? '';
    } catch {}
    const b = button(`notes-btn${latest && seen !== latest ? ' new' : ''}`, "What's new", () => {
      b.classList.remove('new');
      try {
        localStorage.setItem('bb.notesSeen', latest);
      } catch {}
      this.patchNotes();
    }, parent);
  }

  private patchNotes() {
    this.tap();
    this.openModal("What's new", (box) => {
      box.classList.add('notes');
      box.replaceChildren();
      const backdrop = box.parentElement!;
      backdrop.addEventListener('click', (e) => e.target === backdrop && this.closeModal());
      const top = el('div', 'set-head', "<h2>What's new</h2>", box);
      button('icon-btn', ICON.close, () => this.closeModal(), top);
      const list = el('div', 'notes-list', '', box);
      for (const p of PATCH_NOTES) {
        el('div', 'note', `<div class="note-head"><b>${esc(p.title)}</b><span>${esc(hourLabel(p.hour))}</span></div><ul>${p.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`, list);
      }
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

  /** The fight is over: the results come up once the loser has been carried out (or on Skip). */
  private queueResults() {
    const m = this.game.match;
    if (!m) return;
    this.resultsFor = m;
    this.resultsAt = this.game.carrying ? -1 : performance.now() + 700;
    if (this.resultsAt < 0 && !this.skipBtn) {
      this.skipBtn = button('btn small skip-ride', 'Skip', () => {
        this.tap('select');
        this.resultsAt = performance.now();
      }, this.hud.root);
    }
  }

  private awaitResults() {
    const m = this.resultsFor;
    if (!m || this.game.match !== m) return this.dropSkip();
    if (this.resultsAt < 0) {
      if (this.game.carrying) return;
      this.resultsAt = performance.now() + 250;
    }
    if (performance.now() >= this.resultsAt) {
      this.dropSkip();
      this.showResults();
    }
  }

  private dropSkip() {
    this.resultsFor = null;
    this.skipBtn?.remove();
    this.skipBtn = null;
  }

  private showResults() {
    const m = this.game.match;
    if (!m || this.current !== 'fight' || this.results) return;
    this.dropSkip();
    this.hud.closeReplayBar();
    const [a, b] = m.fighters;
    const net = this.netFight;
    const tape = this.lastFight;
    // a replay of an online fight, watched straight after it, still answers to its room
    const room = net ?? (this.replaying && tape?.online ? this.online.session : null);
    // online, this player may be in either corner; offline it's always the left one
    const me = net ? net.me : this.replaying ? (tape?.me ?? 0) : 0;
    const out = net ? net.outcome(m) : { winner: m.winner ? m.winner.index : -1, kind: m.result };
    const draw = out.winner < 0;
    const won = out.winner === me;
    // a round of a map event: how the run stands now
    const ev = !net && !this.replaying && this.eventRun ? this.eventResult(won, draw) : null;
    // the win record is for fights against the AI (and a replay was already counted)
    if (!net && !this.replaying) this.tally(won, draw);
    if (!this.replaying && tape) {
      tape.cut = m.introCut;
      // (online, both corners' calls: they all went through the match)
      tape.coach = m.coachLog.slice();
      tape.talk = this.game.sfx?.booth.said ?? [];
      // the replay runs to here
      tape.end = m.frame;
    }
    const verdict = ev?.title ? (ev.e.kind === 'cup' ? 'CUP WINNER' : 'CHAMPION') : draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
    const kicker = ev ? `${esc(ev.e.name)} · ${ev.round === ev.e.rivals.length - 1 ? 'Final' : `Round ${ev.round + 1} of ${ev.e.rivals.length}`}` : `${Math.round(m.fightTime)} seconds`;
    const how = out.kind === 'Decision' ? 'on points' : out.kind === 'TKO' ? 'by TKO' : out.kind === 'KO' ? 'by knockout' : out.kind === 'Dismantled' ? 'by tearing it apart' : '';
    const who = draw ? 'Split down the middle' : `<b>${esc(m.fighters[out.winner].name)}</b> wins ${how}`;
    const acc = (f: Fighter) => (f.stats.thrown ? `${Math.round((f.stats.landed / f.stats.thrown) * 100)}%` : '–');
    const row = (label: string, va: number | string, vb: number | string, higher = true) => {
      const na = typeof va === 'number' ? va : parseFloat(va);
      const nb = typeof vb === 'number' ? vb : parseFloat(vb);
      const both = !isNaN(na) && !isNaN(nb);
      const wa = both && (higher ? na > nb : na < nb);
      const wb = both && (higher ? nb > na : nb < na);
      // each side's share of the line (the better side's share, for a lower-is-better line)
      const sum = na + nb;
      const k = both && sum > 0 ? (higher ? na / sum : nb / sum) : -1;
      const bar = k < 0 ? '<i class="cmp none"></i>' : `<i class="cmp" style="--k:${k.toFixed(3)}"></i>`;
      return `<span class="a${wa ? ' w' : ''}">${va}</span><span class="l">${label}</span><span class="b${wb ? ' w' : ''}">${vb}</span>${bar}`;
    };
    const res = el('div', 'results screen show', '', this.ui);
    const card = el('div', 'res-card', '', res);
    const [ca] = barColors(m.specs[0].paint);
    const [cb] = barColors(m.specs[1].paint);
    card.style.setProperty('--ca', ca);
    card.style.setProperty('--cb', cb);
    card.innerHTML = `
      <div class="head"><span class="kicker">${kicker}</span><div class="verdict${won || draw ? '' : ' lose'}${ev?.title ? ' title' : ''}">${verdict}</div><div class="who">${who}</div></div>
      <div class="stats-table">
        <span class="h a">${esc(a.name)}</span><span class="h l">vs</span><span class="h b">${esc(b.name)}</span>
        ${row('Damage', Math.round(a.stats.dealt), Math.round(b.stats.dealt))}
        ${row('Landed', `${a.stats.landed}/${a.stats.thrown}`, `${b.stats.landed}/${b.stats.thrown}`)}
        ${row('Accuracy', acc(a), acc(b))}
        ${row('Blocks', a.stats.blocked, b.stats.blocked)}
        ${row('Dodges', a.stats.dodged, b.stats.dodged)}
        ${row('Knockdowns', a.stats.knockdowns, b.stats.knockdowns)}
        ${a.stats.takedowns + b.stats.takedowns ? row('Takedowns', a.stats.takedowns, b.stats.takedowns) : ''}
        ${row('Best shot', a.stats.biggest ? `${Math.round(a.stats.biggest)}` : '–', b.stats.biggest ? `${Math.round(b.stats.biggest)}` : '–')}
      </div>`;
    const actions = el('div', 'actions', '', card);
    this.results = res;
    this.game.director.shiftX = 0.2;
    const keep = () => {
      if (!tape || tape.end <= 0) return;
      button('btn', `${ICON.replay}Replay`, () => this.replay(), actions);
      this.saveReplayBtn(actions, tape, { winner: out.winner, kind: out.kind ?? '', secs: m.fightTime });
    };
    if (room) {
      this.netResults(card, actions, room, keep);
      return;
    }
    if (ev) {
      // the run goes on, starts over, or the title is won
      const e = ev.e;
      const next = progressOf(this.record.events, e.id).run;
      if (ev.title) button('btn primary', `${ICON.map}Map`, () => this.toMap(), actions);
      else {
        const label = draw ? 'Fight again' : won ? `${next === e.rivals.length - 1 ? 'Final' : `Round ${next + 1}`}: ${esc(e.rivals[next])}` : 'Start over';
        button('btn primary', `${ICON.swords}${label}`, () => this.fightEvent(e), actions);
        button('btn', `${ICON.map}Map`, () => this.toMap(), actions);
      }
    } else {
      button('btn primary', `${ICON.swords}Next fight`, () => this.fight(), actions);
      button('btn', `${ICON.refresh}Rematch`, () => this.fight(true), actions);
    }
    keep();
    button('btn', `${ICON.wrench}Garage`, () => {
      this.tap('select');
      this.closeResults();
      this.go('home');
      this.go('garage');
    }, actions);
    button('btn small', `${ICON.home}<span>Home</span>`, () => {
      this.tap('back');
      this.closeResults();
      this.go('home');
    }, actions).title = 'Home';
  }

  /** Back to the map from an event's results. */
  private toMap() {
    this.tap('back');
    this.closeResults();
    this.go('map');
  }

  /**
   * A round of the current map event is over: move the run on (a win), start it over (a loss) or
   * leave it where it is (a draw), and count the title when the last round is won.
   */
  private eventResult(won: boolean, draw: boolean) {
    const r = this.eventRun;
    const e = r && EVENT_BY_ID.get(r.id);
    if (!r || !e) return null;
    const rec = this.record.events;
    const p = { ...progressOf(rec, e.id) };
    let title = false;
    if (won) {
      p.run = r.round + 1;
      if (p.run >= e.rivals.length) {
        p.run = 0;
        p.titles++;
        title = true;
      }
    } else if (!draw) p.run = 0;
    rec[e.id] = p;
    saveRecord(this.record);
    this.map.refresh();
    return { e, round: r.round, title };
  }

  /** Save replay (or Saved, once it's on the shelf). */
  private saveReplayBtn(actions: HTMLElement, tape: Tape, how: { winner: number; kind: string; secs: number }) {
    const keep = button('btn small', '', () => {
      if (keep.disabled) return;
      this.tap('select');
      if (!this.replays.save(tape, how)) {
        void this.ask('Replays full', `You can keep ${MAX_REPLAYS} replays. Delete one from Replays on the home screen to save this fight.`, [['cyan', 'OK']]);
        return;
      }
      mark();
    }, actions);
    const mark = () => {
      const saved = isSaved(tape);
      keep.innerHTML = saved ? `${ICON.check}Saved` : `${ICON.star}Save replay`;
      keep.disabled = saved;
    };
    mark();
  }

  private closeResults() {
    this.resultsRoom = null;
    this.game.director.shiftX = 0;
    this.results?.remove();
    this.results = null;
    this.resultsNote = null;
    this.rematchBtn = null;
  }

  // ------------------------------------------------------------ online
  /** Open the room screen and join the room in an invite link. */
  joinLink(code: string) {
    this.go('online');
    void this.online.join(code);
  }

  private fightOnline(s: OnlineSession, a: BotSpec, b: BotSpec, seed: number) {
    this.tap('start');
    void enterLandscape();
    this.closeModal();
    this.closeResults();
    this.leaveNetFight();
    this.eventRun = null;
    this.game.setArena('grand');
    const m = this.game.startMatch(a, b, seed, true, s.me);
    // the tape for its replay: the coach calls from both corners come from the match's log
    this.lastFight = { a: structuredClone(a), b: structuredClone(b), seed, cut: -1, coach: [], end: -1, marks: [], online: true, me: s.me };
    this.replaying = false;
    this.netFight = s;
    s.watch(this.game, m);
    this.hud.resetSpeed();
    this.hud.attach(m, { me: s.me });
    this.go('fight');
  }

  private leaveNetFight() {
    this.netFight?.unwatch();
    this.netFight = null;
  }

  /** Every frame of an online fight: keep pace with the other phone, show the link's health. */
  private netFrame(dt: number) {
    const s = this.netFight!;
    s.frame(dt);
    const live = this.online.session === s && s.connected;
    if (!live) this.hud.setNet('Opponent left', 'bad');
    else if (s.peerLost) this.hud.setNet('Connection lost', 'warn');
    else if (s.desynced) this.hud.setNet(s.role === 'host' ? 'Out of sync' : "Out of sync · host's result counts", 'warn');
    else this.hud.setNet(`Online · ${Math.round(s.rtt)} ms`, 'ok');
  }

  /** The room changed while the player is watching a fight or its results. */
  private netChanged() {
    if (this.results && this.resultsRoom) this.syncRematch(this.resultsRoom);
  }

  /** Online fights pause for nobody: the menu offers a way out instead. */
  private netMenu() {
    this.tap();
    this.openModal('Online fight', (box) => {
      el('p', 'modal-note', 'The fight keeps going on both screens.', box);
      button('btn primary', `${ICON.play}Back to the fight`, () => this.closeModal(), box);
      this.soundRow(box);
      button('btn small', `${ICON.exit}Leave room`, () => {
        this.closeModal();
        this.go('home');
      }, box);
    });
  }

  private netResults(card: HTMLElement, actions: HTMLElement, net: OnlineSession, extra: () => void) {
    this.resultsRoom = net;
    if (net.desynced && net.role === 'guest' && !this.replaying) card.insertBefore(el('div', 'net-note', "Your screens drifted apart, so the host's result counts."), actions);
    this.resultsNote = card.insertBefore(el('div', 'net-note'), actions);
    this.rematchBtn = button('btn primary', '', () => {
      this.tap('select');
      net.voteRematch();
    }, actions);
    extra();
    button('btn', `${ICON.globe}Room`, () => {
      this.tap('select');
      this.closeResults();
      this.go(this.online.active ? 'online' : 'home');
    }, actions);
    button('btn small', ICON.exit, () => {
      this.tap('back');
      this.closeResults();
      this.go('home');
    }, actions).title = 'Leave room';
    this.syncRematch(net);
  }

  private syncRematch(net: OnlineSession) {
    const btn = this.rematchBtn, note = this.resultsNote;
    if (!btn || !note) return;
    const them = this.game.match?.specs[1 - net.me].name ?? 'Your opponent';
    if (this.online.session !== net || !net.connected) {
      btn.disabled = true;
      btn.innerHTML = `${ICON.swords}Rematch`;
      note.textContent = `${them} left the room.`;
      return;
    }
    const mine = net.rematch[net.me], theirs = net.rematch[1 - net.me];
    btn.disabled = mine;
    btn.innerHTML = `${ICON.swords}${mine ? 'Ready' : 'Rematch'}`;
    note.textContent = theirs && !mine ? `${them} wants a rematch!` : mine ? `Waiting for ${them}…` : '';
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

function syncText(s: SyncState, at: number) {
  switch (s) {
    case 'syncing':
      return 'Saving…';
    case 'offline':
      return 'Offline: your changes go up when you\'re back online.';
    case 'saved':
      return at ? `Saved to your account at ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'Saved to your account.';
    default:
      return 'Saved to your account.';
  }
}
