import type { Game } from '../game/game';
import type { BotSpec } from '../game/loadout';
import type { Record_ } from '../game/saves';
import { credits } from '../game/career';
import {
  bestOf,
  byShowOrder,
  clock,
  DUPE_SHARDS,
  exchange,
  featured,
  featuredIn,
  freeIn,
  FREE_EVERY,
  giftReady,
  HARD_PITY,
  now,
  ownedCounts,
  ownsSkin,
  pityLeft,
  pullSkins,
  PULL_COST,
  RATES,
  SHARD_PRICE,
  SOFT_PITY,
  SOFT_STEP,
  TEN_COST,
  type PullResult,
  type SkinState,
} from '../game/gacha';
import { EPIC, RARE, SKIN_RARITY_COL, SKIN_RARITY_NAME, SKINS, skinById, skinOf, skinsOfRarity, type SkinDef } from '../game/skins';
import type { GachaSoundId } from '../audio/gachaSound';
import { button, el, esc } from './dom';
import { ICON } from './icons';
import { coins } from './careerUi';
import { CapsuleView, Gl2D, rgb, SkinOrb } from './vaultGl';
import './vault.css';

/** What the vault needs from the App. */
export interface VaultHost {
  game: Game;
  record(): Record_;
  player(): BotSpec;
  tap(kind?: 'tap' | 'select' | 'back' | 'start'): void;
  /** Save the record (the collection lives in it, beside the career's credits). */
  save(): void;
  /** Put a skin the player owns on their bot for good ('' for the plain paint), painted on. */
  wear(id: string): void;
  /** Show a bot on the lift (a skin on trial), or the player's own again (null). */
  show(spec: BotSpec | null): void;
  modal(title: string, fill: (box: HTMLElement) => void): void;
  home(): void;
}

const ease = { back: 'cubic-bezier(0.34, 1.56, 0.64, 1)', out: 'cubic-bezier(0.2, 0.8, 0.2, 1)', quadOut: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' };
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mixRgb = (a: number[], b: number[], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const RCOL = SKIN_RARITY_COL.map((c) => rgb(c));

// ------------------------------------------------------------------ a skin as a card

/**
 * A skin as a card: its turning swatch, its name and rarity, and a badge (NEW, the shards a
 * duplicate gave, the copies owned, a price). Face down it shows the vault's emblem with its edge
 * glowing the colour of what's under it.
 */
export class SkinCard {
  readonly el: HTMLButtonElement;
  readonly orb: SkinOrb;
  private badge: HTMLElement;
  private nameEl: HTMLElement;
  private tierEl: HTMLElement;
  faceUp = true;

  constructor(
    public skin: SkinDef | null,
    opts: { veiled?: boolean; fps?: number; spin?: number } = {},
  ) {
    this.el = el('button', 'skin-card') as HTMLButtonElement;
    this.el.innerHTML = '<span class="sc-face"></span><span class="sc-back"><i></i></span>';
    this.orb = new SkinOrb(skin, { veiled: opts.veiled, fps: opts.fps ?? 24, spin: opts.spin ?? 0.03 });
    this.el.querySelector('.sc-face')!.appendChild(this.orb.el);
    this.nameEl = el('b', 'sc-name', '', this.el.querySelector('.sc-face')!);
    this.tierEl = el('small', 'sc-tier', '', this.el.querySelector('.sc-face')!);
    this.badge = el('span', 'sc-badge', '', this.el);
    el('span', 'sc-worn', ICON.check, this.el);
    this.set(skin, opts.veiled);
    // each card's rays and shine start at their own place, so a grid doesn't move as one
    this.el.style.setProperty('--seed', `${(Math.random() * -10).toFixed(2)}s`);
  }

  set(s: SkinDef | null, veiled = false) {
    this.skin = s;
    this.orb.setSkin(s, veiled);
    this.el.style.setProperty('--rc', s ? SKIN_RARITY_COL[s.r] : '#9aa6b8');
    this.el.dataset.tier = String(s ? s.r : 0);
    this.el.classList.toggle('veiled', veiled);
    this.el.classList.toggle('plain', !s);
    this.nameEl.textContent = s ? s.name : 'Plain paint';
    this.tierEl.textContent = s ? SKIN_RARITY_NAME[s.r] : 'Your paint';
  }

  /** A badge in the top corner ('' hides it): amber for NEW, or quiet glass. */
  setBadge(text: string, kind: 'new' | 'glass' | 'shards' = 'new') {
    this.badge.innerHTML = text;
    this.badge.className = `sc-badge ${kind}${text ? ' on' : ''}`;
  }

  setWorn(on: boolean) {
    this.el.classList.toggle('worn', on);
  }

  setFace(up: boolean) {
    this.faceUp = up;
    this.el.classList.toggle('down', !up);
  }

  /** How bright the card is lit (a reveal flares it). */
  setGlow(k: number) {
    this.el.style.setProperty('--glow', k.toFixed(3));
  }
}

// ------------------------------------------------------------------ the vault screen

const FILTERS: [number, string][] = [
  [-1, 'All'],
  [0, 'Common'],
  [1, 'Rare'],
  [2, 'Epic'],
];

/**
 * The Skin Vault: where skins are won. The player's bot stands on the workshop lift on the right
 * (drag to turn it); the panel on the left has two tabs.
 *   Vault: today's featured Epic turning in its halo, the rates and how close the Epic pity is,
 *   the capsule waiting over its pool of light, the free pull (or when it's back), and the pulls
 *   (one, or ten with a Rare or better in them), paid in career credits. The first visit has a
 *   free 10-pull waiting.
 *   Collection: every skin as a card (the ones not owned yet veiled), by rarity. Tapping one
 *   paints it onto the bot with a sweep of light: one owned goes on for good, one not owned is
 *   only tried on, with the shards it costs.
 * Credits and shards sit top right. Pulls play out in PullShow.
 */
export class VaultScreen {
  readonly root: HTMLElement;
  tab: 'vault' | 'collection' = 'vault';
  private filter = -1;
  private show: PullShow | null = null;
  /** The skin the collection has picked (null: the plain paint) and whether it's only tried on. */
  private picked: SkinDef | null = null;
  private trial = false;
  private wallet: HTMLElement;
  private tabs: HTMLElement;
  private body: HTMLElement;
  private wearing: HTMLButtonElement;
  private toastEl: HTMLElement;
  private clockT = 0;
  private live: {
    featClock: HTMLElement;
    pityText: HTMLElement;
    pityBar: HTMLElement;
    free: HTMLButtonElement;
    freeText: HTMLElement;
    one: HTMLButtonElement;
    ten: HTMLButtonElement;
    cap: CapsuleView;
    capWrap: HTMLElement;
    pool: HTMLElement;
  } | null = null;
  private strip: { name: HTMLElement; info: HTMLElement; btn: HTMLButtonElement } | null = null;
  private capT = 0;
  private capKick = 0;

  constructor(private host: VaultHost) {
    const s = (this.root = el('div', 'screen vault'));
    const top = el('div', 'vault-top', '', s);
    const homeBtn = button('home-btn', `${ICON.back}${ICON.home}<span>Home</span>`, () => {
      host.tap('back');
      host.home();
    }, top);
    homeBtn.title = 'Back to home';
    el('div', 'vault-title', 'SKIN VAULT', top);
    this.wallet = el('div', 'vault-wallet', '', s);
    const panel = el('div', 'vault-panel interactive', '', s);
    this.tabs = el('div', 'seg vault-tabs', '', panel);
    this.body = el('div', 'vault-body', '', panel);
    this.wearing = button('vault-wearing', '', () => {
      host.tap('select');
      this.setTab('collection');
    }, s);
    this.toastEl = el('div', 'vault-toast', '', s);
  }

  private get g(): SkinState {
    return this.host.record().skins;
  }

  enter() {
    this.picked = null;
    this.trial = false;
    this.refresh();
  }

  exit() {
    this.dropTrial(false);
    this.closeShow();
  }

  refresh() {
    const g = this.g;
    this.wallet.innerHTML = `<span class="cr-chip" title="Career credits: win career fights to earn more">${coins(this.host.record().career.credits)}</span><span class="cr-chip shards" title="Shards: from duplicate skins. Spend them in the Collection">${ICON.star}<b>${g.shards}</b></span>`;
    const worn = skinOf(this.host.player());
    this.wearing.innerHTML = `${ICON.paint}<span>Wearing ${esc(worn ? worn.name : 'plain paint')}</span>`;
    this.wearing.style.setProperty('--rc', worn ? SKIN_RARITY_COL[worn.r] : 'transparent');
    this.tabs.innerHTML = '';
    for (const [id, label] of [
      ['vault', 'Vault'],
      ['collection', `Collection <span class="muted">${Object.keys(g.owned).length}/${SKINS.length}</span>`],
    ] as const) {
      button(this.tab === id ? 'on' : '', label, () => {
        if (this.tab === id) return;
        this.host.tap('select');
        this.setTab(id);
      }, this.tabs);
    }
    this.tabs.style.gridTemplateColumns = 'repeat(2, 1fr)';
    this.body.innerHTML = '';
    this.live = null;
    this.strip = null;
    if (this.tab === 'vault') this.drawVault();
    else this.drawCollection();
  }

  setTab(t: 'vault' | 'collection') {
    this.tab = t;
    if (t !== 'collection') this.dropTrial();
    this.refresh();
  }

  // ------------------------------------------------------------ the vault tab

  private drawVault() {
    const g = this.g;
    const f = featured();
    const card = el('div', 'vault-feat', '', this.body);
    card.style.setProperty('--fc', SKIN_RARITY_COL[EPIC]);
    const orb = new SkinOrb(f, { fps: 60, spin: 0.07, cls: 'feat-orb' });
    orb.setHalo(0.8);
    card.appendChild(orb.el);
    const col = el('div', 'vf-text', '', card);
    el('div', 'vf-kicker', 'Featured Epic', col);
    el('div', 'vf-name', esc(f.name), col);
    el('div', 'vf-blurb', esc(f.blurb), col);
    const featClock = el('div', 'vf-clock', '', col);
    const owns = ownsSkin(g, f.id);
    el('div', `vf-own${owns ? ' yes' : ''}`, owns ? `${ICON.check}Owned` : 'Half of all Epics pulled today are this one', col);

    // the rates, and the details behind them
    const rates = el('div', 'vault-rates', '', this.body);
    for (const r of [2, 1, 0]) {
      el('span', 'rate', `<i></i>${SKIN_RARITY_NAME[r]} ${Math.round(RATES[r] * 100)}%`, rates).style.setProperty('--rc', SKIN_RARITY_COL[r]);
    }
    button('btn small', 'Details', () => this.details(), rates);

    // the pity: how close an Epic is
    const pity = el('div', 'vault-pity', '', this.body);
    const pityText = el('div', 'vp-text', '', pity);
    const pityBar = el('div', 'vp-bar', '<i></i>', pity);

    // the capsule, waiting: hovering over a pool of light, its seam breathing through the rarity
    // colours (tap it: the free pull if one's waiting)
    const stage = el('div', 'vault-stage', '', this.body);
    const pool = el('div', 'vs-pool', '', stage);
    const cap = new CapsuleView();
    const capWrap = button('vs-cap', '', () => {
      if (giftReady(this.g)) this.freePull();
      else {
        this.host.tap('tap');
        this.capKick = 1;
      }
    }, stage);
    capWrap.appendChild(cap.el);
    capWrap.title = 'The vault';

    // the free pull (or the welcome gift), then the paid pulls
    const free = button('btn primary vault-free', '', () => this.freePull(), this.body);
    const freeText = el('div', 'vault-free-text', '', this.body);
    const pulls = el('div', 'vault-pulls', '', this.body);
    const one = this.pullButton(pulls, 'Pull', PULL_COST, '', () => this.pull(1));
    const ten = this.pullButton(pulls, 'Pull ×10', TEN_COST, 'Rare or better inside', () => this.pull(10), true);
    this.live = { featClock, pityText, pityBar, free, freeText, one, ten, cap, capWrap, pool };
    this.tickClocks();
  }

  private pullButton(into: HTMLElement, text: string, cost: number, sub: string, go: () => void, ten = false) {
    return button(`vault-pull${ten ? ' ten' : ''}`, `<b>${text}</b>${coins(cost)}${sub ? `<small>${sub}</small>` : ''}`, go, into);
  }

  private tickClocks() {
    const l = this.live;
    if (!l || !l.free.isConnected) return;
    const g = this.g;
    l.featClock.textContent = `New featured skin in ${clock(featuredIn())}`;
    const left = pityLeft(g);
    l.pityText.innerHTML = left > 1 ? `An Epic in at most <b>${left}</b> pulls` : '<b>Your next pull is an Epic</b>';
    (l.pityBar.firstChild as HTMLElement).style.width = `${((g.sinceEpic / HARD_PITY) * 100).toFixed(1)}%`;
    if (!g.welcome) {
      l.free.style.display = '';
      l.free.innerHTML = `${ICON.star}Welcome gift: a free ×10 pull`;
      l.freeText.textContent = 'On the house, to start your collection';
    } else if (freeIn(g) <= 0) {
      l.free.style.display = '';
      l.free.innerHTML = `${ICON.star}Free pull ready`;
      l.freeText.textContent = 'A new one every 4 hours';
    } else {
      l.free.style.display = 'none';
      l.freeText.textContent = `Next free pull in ${clock(freeIn(g))}`;
    }
    const cr = this.host.record().career.credits;
    l.one.classList.toggle('short', cr < PULL_COST);
    l.ten.classList.toggle('short', cr < TEN_COST);
  }

  /** Every frame while the vault is up. */
  tick(dt: number) {
    this.clockT -= dt;
    if (this.clockT <= 0) {
      this.clockT = 0.5;
      this.tickClocks();
    }
    // the sounds are made a few at a time before they're needed
    this.host.game.sfx?.gachaWarm();
    this.capTick(dt);
  }

  /** The idle capsule: a slow bob and tilt, the seam breathing and drifting Common, Rare, Epic. */
  private capTick(dt: number) {
    const l = this.live;
    if (!l || this.show) return;
    this.capT += dt;
    this.capKick = Math.max(0, this.capKick - dt * 2.5);
    const ph = (this.capT * 0.25) % 3;
    const i = Math.floor(ph);
    const col = mixRgb(RCOL[i], RCOL[(i + 1) % 3], smooth(0.75, 1, ph - i));
    const ready = giftReady(this.g);
    l.cap.seam = col;
    l.cap.charge = (ready ? 0.32 : 0.16) + 0.1 * Math.sin(this.capT * 2.2) + this.capKick * 0.4;
    const rot = Math.sin(this.capT * 0.9) * 0.05 + Math.sin(this.capT * 30) * 0.06 * this.capKick;
    const bob = Math.sin(this.capT * 1.4) * 3;
    l.capWrap.style.transform = `translateY(${bob.toFixed(2)}%) rotate(${rot.toFixed(4)}rad)`;
    const css = `rgb(${col.map((v) => Math.round(v * 255)).join(' ')} / ${(0.5 + 0.2 * Math.sin(this.capT * 2.2)).toFixed(3)})`;
    l.pool.style.setProperty('--pool', css);
  }

  // ------------------------------------------------------------ pulling

  private freePull() {
    const g = this.g;
    if (!g.welcome) {
      g.welcome = true;
      this.open(10, false);
    } else if (freeIn(g) <= 0) {
      g.freeAt = now() + FREE_EVERY;
      this.open(1, false);
    }
  }

  /** Pay for `n` pulls in credits and play them out (or say why not). */
  pull(n: 1 | 10) {
    const cost = n === 1 ? PULL_COST : TEN_COST;
    const c = this.host.record().career;
    if (c.credits < cost) {
      this.host.tap('back');
      this.toast('Not enough credits. Win career fights to earn more');
      const b = n === 1 ? this.live?.one : this.live?.ten;
      b?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 200 });
      return;
    }
    c.credits -= cost;
    this.open(n, true);
  }

  private open(n: number, paid: boolean) {
    const results = pullSkins(this.g, n);
    this.host.save();
    this.closeShow();
    const cost = n === 1 ? PULL_COST : TEN_COST;
    const again = `${n === 1 ? 'Pull again' : 'Pull ×10 again'} · ${credits(cost)}`;
    this.show = new PullShow(this.host, results, again, this.host.record().career.credits >= cost, (action, data) => {
      if (action === 'again') {
        this.host.tap('select');
        this.pull(n === 1 ? 1 : 10);
      } else if (action === 'wear') {
        this.host.tap('select');
        this.closeShow();
        this.wear(data!);
      } else {
        this.host.tap('back');
        this.closeShow();
      }
      this.refresh();
    });
    void paid;
    document.body.appendChild(this.show.root);
    this.refresh();
  }

  private closeShow() {
    const s = this.show;
    if (!s) return;
    this.show = null;
    this.host.game.sfx?.gachaStop();
    s.close();
  }

  /** A pull is playing over everything (the App leaves keys and taps to it). */
  get busy() {
    return !!this.show;
  }

  /** Put a skin on the bot for good ('' for the plain paint), painted on with a sweep. */
  wear(id: string) {
    this.dropTrial(false);
    this.host.wear(id);
    this.sound('paint', 0.7);
    this.picked = skinById(id);
    this.refresh();
  }

  private sound(id: GachaSoundId, gain = 1, rate = 1) {
    this.host.game.sfx?.gacha(id, gain, rate);
  }

  toast(text: string) {
    const t = this.toastEl;
    t.textContent = text;
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
  }

  /** The rules, plainly (rates, pity, the featured skin, shards, the free pull). */
  private details() {
    this.host.tap('tap');
    this.host.modal('How the vault works', (box) => {
      box.classList.add('vault-rules');
      const lines = [
        `Every pull is one skin: Epic ${RATES[2] * 100}%, Rare ${RATES[1] * 100}%, Common ${RATES[0] * 100}%.`,
        'Every 10th pull without a Rare or better gives you one, so a ×10 pull always has one.',
        `After ${SOFT_PITY} pulls without an Epic, the Epic chance rises ${Math.round(SOFT_STEP * 100)}% a pull, and pull ${HARD_PITY} is always an Epic.`,
        "Half of all Epics pulled are today's featured skin. It changes every day.",
        `A skin you already have turns into shards: Common ${DUPE_SHARDS[0]}, Rare ${DUPE_SHARDS[1]}, Epic ${DUPE_SHARDS[2]}.`,
        `Shards buy any skin in the Collection: Common ${SHARD_PRICE[0]}, Rare ${SHARD_PRICE[1]}, Epic ${SHARD_PRICE[2]}.`,
        'One free pull every 4 hours. Skins are only paint: they never change how a bot fights.',
      ];
      el('ul', 'vault-rule-list', lines.map((l) => `<li>${esc(l)}</li>`).join(''), box);
    });
  }

  // ------------------------------------------------------------ the collection

  private drawCollection() {
    const g = this.g;
    const counts = ownedCounts(g);
    const seg = el('div', 'seg seg4 vault-filter', '', this.body);
    for (const [r, label] of FILTERS) {
      const text = r < 0 ? label : `${label} <span>${counts[r]}/${skinsOfRarity(r).length}</span>`;
      button(this.filter === r ? 'on' : '', text, () => {
        if (this.filter === r) return;
        this.host.tap('tap');
        this.filter = r;
        this.refresh();
      }, seg);
    }
    const scroll = el('div', 'vault-grid scroll', '', this.body);
    const worn = skinOf(this.host.player());
    const list: (SkinDef | null)[] = byShowOrder(g, this.filter < 0 ? SKINS : skinsOfRarity(this.filter));
    if (this.filter < 0) list.unshift(null);
    for (const s of list) {
      const owned = !s || ownsSkin(g, s.id);
      const c = new SkinCard(s, { veiled: !owned, fps: owned ? 24 : 8 });
      if (s && owned) {
        const n = g.owned[s.id];
        if (g.fresh.includes(s.id)) c.setBadge('NEW');
        else if (n > 1) c.setBadge(`×${n}`, 'glass');
      } else if (s) c.setBadge(`${ICON.star}${SHARD_PRICE[s.r]}`, 'shards');
      c.setWorn(s ? worn?.id === s.id : !worn);
      c.el.classList.toggle('picked', this.trial && !!s && this.picked?.id === s.id);
      c.el.addEventListener('click', () => this.pick(s));
      scroll.appendChild(c.el);
    }
    // the strip under the grid: what's picked and what can be done with it
    const strip = el('div', 'vault-strip', '', this.body);
    const tv = el('div', 'vs-text', '', strip);
    const name = el('b', '', '', tv);
    const info = el('span', '', '', tv);
    const btn = button('btn primary small', '', () => this.stripAction(), strip);
    this.strip = { name, info, btn };
    this.syncStrip();
    // what's been looked at isn't new any more
    if (g.fresh.length && this.filter < 0) {
      g.fresh = [];
      this.host.save();
    }
  }

  /** A card tapped: an owned skin goes on; one not owned is tried on. */
  private pick(s: SkinDef | null) {
    const g = this.g;
    this.picked = s;
    if (!s || ownsSkin(g, s.id)) {
      this.host.tap('select');
      const worn = skinOf(this.host.player());
      if ((s?.id ?? null) === (worn?.id ?? null)) {
        this.dropTrial();
        this.refresh();
        return;
      }
      this.wear(s ? s.id : '');
      return;
    }
    this.host.tap('tap');
    this.tryOn(s);
    this.refresh();
  }

  private tryOn(s: SkinDef) {
    const game = this.host.game;
    const was = game.shown?.skin;
    const spec: BotSpec = { ...structuredClone(this.host.player()), skin: s.id };
    this.trial = true;
    this.host.show(spec);
    game.paintOn(was);
    game.garagePulse();
    this.sound('paint', 0.5, 1.15);
  }

  private dropTrial(restore = true) {
    if (!this.trial) return;
    this.trial = false;
    if (restore) this.host.show(null);
  }

  private syncStrip() {
    const st = this.strip;
    if (!st) return;
    const g = this.g;
    const worn = skinOf(this.host.player());
    const s = this.picked ?? (this.trial ? null : worn);
    if (!s) {
      st.name.textContent = 'Plain paint';
      st.name.style.color = '';
      st.info.textContent = 'Your own paint job, as the Paint tab in the garage has it.';
      st.btn.style.display = 'none';
      return;
    }
    st.name.textContent = s.name;
    st.name.style.color = `color-mix(in srgb, ${SKIN_RARITY_COL[s.r]} 60%, white)`;
    const price = SHARD_PRICE[s.r];
    st.btn.disabled = false;
    if (ownsSkin(g, s.id)) {
      const n = g.owned[s.id];
      st.info.textContent = `${SKIN_RARITY_NAME[s.r]} · ${s.blurb}${n > 1 ? ` · ${n} copies` : ''}`;
      st.btn.style.display = worn?.id === s.id ? 'none' : '';
      st.btn.innerHTML = `${ICON.paint}Wear`;
    } else {
      st.info.textContent = `${SKIN_RARITY_NAME[s.r]} · trying it on · ${price} shards (you have ${g.shards})`;
      st.btn.style.display = '';
      st.btn.innerHTML = `${ICON.star}Get it · ${price}`;
      st.btn.disabled = g.shards < price;
    }
  }

  private stripAction() {
    const s = this.picked;
    if (!s) return;
    const g = this.g;
    if (ownsSkin(g, s.id)) {
      this.wear(s.id);
      return;
    }
    if (exchange(g, s)) {
      this.host.save();
      this.sound(`chime${s.r}` as GachaSoundId, 0.7);
      this.wear(s.id);
      this.toast(`${s.name} is yours`);
    }
  }
}

// ------------------------------------------------------------------ a pull, played out

/** When the capsule lands, and how long it charges for each best rarity. */
const LAND = 0.72;
const CHARGE = [1.2, 1.85, 2.6];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  spin: number;
  damp: number;
  col: string;
}

/** One-shot bursts of glowing sparks (and, for a Rare or an Epic, slower tumbling confetti), on a 2D canvas. */
class Bursts {
  private sparks: Particle[] = [];
  private confetti: Particle[] = [];
  private sparkCol = [1, 1, 1];
  private dot: HTMLCanvasElement;

  constructor(private ctx: CanvasRenderingContext2D, private k: number) {
    // a soft round dot, drawn once
    this.dot = document.createElement('canvas');
    this.dot.width = this.dot.height = 48;
    const d = this.dot.getContext('2d')!;
    const gr = d.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = gr;
    d.fillRect(0, 0, 48, 48);
  }

  spark(x: number, y: number, n: number, col: number[]) {
    const k = this.k;
    this.sparkCol = col;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (260 + Math.random() * 840) * k;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 1.5 * (0.6 + Math.random() * 0.4), size: (0.25 + Math.random() * 0.65) * 48 * k, rot: 0, spin: 0, damp: (40 + Math.random() * 120) * k, col: '' });
    }
  }

  confettiAt(x: number, y: number, n: number, col: string) {
    const k = this.k;
    const cols = [col, '#ff73bf', '#59d9ff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (200 + Math.random() * 500) * k;
      this.confetti.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 2.6 * (0.7 + Math.random() * 0.3), size: (0.5 + Math.random() * 0.5) * k, rot: Math.random() * 6, spin: ((Math.random() * 2 - 1) * 540 * Math.PI) / 180, damp: (40 + Math.random() * 120) * k, col: cols[i % 4] });
    }
  }

  get alive() {
    return this.sparks.length + this.confetti.length > 0;
  }

  step(dt: number, w: number, h: number) {
    const c = this.ctx;
    c.clearRect(0, 0, w, h);
    const move = (p: Particle, g: number) => {
      p.age += dt;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 0) {
        const s = Math.max(0, sp - p.damp * dt) / sp;
        p.vx *= s;
        p.vy *= s;
      }
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    };
    // a size curve: full, easing to 70%, then gone
    const curve = (t: number) => (t < 0.7 ? 1 - (t / 0.7) * 0.3 : 0.7 * (1 - (t - 0.7) / 0.3));
    c.globalCompositeOperation = 'lighter';
    const [r, g, b] = this.sparkCol;
    this.sparks = this.sparks.filter((p) => {
      move(p, 620 * this.k);
      const t = p.age / p.life;
      if (t >= 1) return false;
      // white, then the rarity's colour, fading out
      const k = Math.min(1, t / 0.3);
      const cr = Math.round((1 + (r - 1) * k) * 255), cg = Math.round((1 + (g - 1) * k) * 255), cb = Math.round((1 + (b - 1) * k) * 255);
      c.globalAlpha = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
      const s = p.size * curve(t);
      c.filter = 'none';
      c.drawImage(this.tinted(cr, cg, cb), p.x - s / 2, p.y - s / 2, s, s);
      return true;
    });
    c.globalCompositeOperation = 'source-over';
    this.confetti = this.confetti.filter((p) => {
      move(p, 380 * this.k);
      const t = p.age / p.life;
      if (t >= 1) return false;
      const s = curve(t);
      c.globalAlpha = 1;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      // a flake turning over: narrower as it tumbles
      c.scale(Math.cos(p.rot * 1.7) * s * p.size, s * p.size);
      c.fillStyle = p.col;
      c.fillRect(-7, -11, 14, 22);
      c.restore();
      return true;
    });
    c.globalAlpha = 1;
  }

  private tints = new Map<string, HTMLCanvasElement>();
  /** The dot in a colour (cached by a coarse key, so a burst makes a handful). */
  private tinted(r: number, g: number, b: number) {
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    let t = this.tints.get(key);
    if (!t) {
      t = document.createElement('canvas');
      t.width = t.height = 48;
      const x = t.getContext('2d')!;
      x.drawImage(this.dot, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = `rgb(${r},${g},${b})`;
      x.fillRect(0, 0, 48, 48);
      this.tints.set(key, t);
    }
    return t;
  }
}

/**
 * A pull, played out (the Skin Vault's big moment). The screen falls dark and a paint capsule
 * drops into a pool of light. It charges, its seam leaking light: a Common's cool blue; a Rare
 * cracks it over to violet; an Epic holds, shakes and blows through to gold. It bursts in a flash,
 * a ring of light and a shower of sparks, and what was inside comes out:
 *   one pull: the skin's swatch rises, its rarity, its name, NEW or the shards a copy gave;
 *   ten: ten cards fan out face down, each edge already glowing its colour, and turn over one
 *   by one (an Epic holds its breath first). A card tapped afterwards opens on its own.
 * A tap before the burst skips to it; a tap while the cards turn turns the rest. `done` says
 * what the player picked: 'done', 'again' (the same pull again) or 'wear' (with the id).
 */
class PullShow {
  readonly root: HTMLElement;
  private gl: Gl2D | null = null;
  private glCanvas: HTMLCanvasElement;
  private fx: CanvasRenderingContext2D;
  private bursts: Bursts;
  private stage: HTMLElement;
  private ui: HTMLElement;
  private best: PullResult;
  private tier: number;
  private t = 0;
  private phase: 'in' | 'charge' | 'burst' | 'dealt' = 'in';
  private raf = 0;
  private lastT = 0;
  private vw = 0;
  private vh = 0;
  private scale = 1;
  private cap = { x: 0, y: 0, w: 0, h: 0, sx: 1, sy: 1, rot: 0, visible: true };
  private halves: { x: number; y: number; dx: number; dy: number; rot: number; rot1: number; a: number; half: number; t: number }[] = [];
  private seam: [number, number, number];
  private shownTier = 0;
  private charge = 0;
  private crack = 0;
  private power = 0;
  private rays = 0;
  private bgAlpha = 0;
  private bgAt: [number, number] = [0.5, 0.47];
  private tint: [number, number, number];
  private shake = 0;
  private flash = 0;
  private ring = -1;
  private cracked = [false, false];
  private cards: SkinCard[] = [];
  private timers: number[] = [];
  private detail: HTMLElement | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (this.detail) this.closeDetail();
    else if (this.phase === 'dealt' || (this.phase === 'burst' && this.results.length === 1)) this.done('done');
    else this.skip();
  };

  constructor(
    private host: VaultHost,
    private results: PullResult[],
    private againText: string,
    private againOk: boolean,
    private done: (action: 'done' | 'again' | 'wear', id?: string) => void,
  ) {
    this.best = bestOf(results);
    this.tier = this.best.skin.r;
    this.seam = [...RCOL[0]];
    this.tint = [...RCOL[0]];
    const r = (this.root = el('div', 'pull-show'));
    this.stage = el('div', 'ps-stage', '', r);
    this.glCanvas = el('canvas', 'ps-gl', '', this.stage) as HTMLCanvasElement;
    const fxc = el('canvas', 'ps-fx', '', this.stage) as HTMLCanvasElement;
    this.ui = el('div', 'ps-ui', '', r);
    el('div', 'ps-hint', 'Tap to skip', this.ui);
    try {
      this.gl = new Gl2D(this.glCanvas);
      this.gl.warm(['bg', 'capsule', 'orb']);
    } catch {
      this.gl = null;
    }
    this.vw = innerWidth;
    this.vh = innerHeight;
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    this.scale = dpr;
    this.glCanvas.width = fxc.width = Math.round(this.vw * dpr);
    this.glCanvas.height = fxc.height = Math.round(this.vh * dpr);
    this.fx = fxc.getContext('2d')!;
    this.fx.scale(dpr, dpr);
    this.bursts = new Bursts(this.fx, this.vh / 720);
    this.cap.h = this.vh * 0.62;
    this.cap.w = this.cap.h * 0.75;
    this.cap.x = this.vw * 0.5;
    this.cap.y = -this.cap.h * 0.5;
    r.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.skip();
    });
    window.addEventListener('keydown', this.onKey);
    host.tap('start');
    this.lastT = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private sound(id: GachaSoundId, gain = 1, rate = 1) {
    this.host.game.sfx?.gacha(id, gain, rate);
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const t of this.timers) clearTimeout(t);
    window.removeEventListener('keydown', this.onKey);
    this.root.style.pointerEvents = 'none';
    const a = this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
    a.onfinish = () => {
      this.root.remove();
      (this.gl?.gl.getExtension('WEBGL_lose_context') as WEBGL_lose_context | null)?.loseContext();
    };
  }

  // ------------------------------------------------------------ the timeline

  private frame(now: number) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.t += dt;
    const chargeLen = CHARGE[this.tier];
    const burstAt = LAND + chargeLen;
    if (this.phase === 'in' || this.phase === 'charge') {
      this.bgAlpha = Math.min(1, this.t / 0.3);
      if (this.t < LAND) {
        // the drop: falling faster and faster into the light
        const k = Math.min(1, Math.max(0, (this.t - 0.12) / (LAND - 0.12)));
        this.cap.y = -this.cap.h * 0.5 + (this.vh * 0.47 + this.cap.h * 0.5) * k * k;
        this.cap.sx = k > 0 ? 0.94 : 1;
        this.cap.sy = k > 0 ? 1.08 : 1;
      } else {
        if (this.phase === 'in') {
          this.phase = 'charge';
          this.shake = 14;
          this.host.game.sfx?.thud(0.9);
          this.sound('riser', 0.9, 1.9 / chargeLen);
        }
        this.chargeStep((this.t - LAND) / chargeLen, dt);
      }
      if (this.t >= burstAt) this.burst();
    }
    // the burst's afterglow, the ring rushing out, the halves flying apart
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.6);
    if (this.ring >= 0) {
      this.ring += dt * 1.5;
      if (this.ring > 2.5) this.ring = -1;
    }
    for (const h of this.halves) h.t += dt;
    // the shake settles
    this.shake = Math.max(0, this.shake - dt * 30);
    const s = (this.shake * this.vh) / 720;
    this.stage.style.transform = s > 0.05 ? `translate(${((Math.random() * 2 - 1) * s).toFixed(1)}px, ${((Math.random() * 2 - 1) * s).toFixed(1)}px)` : '';
    this.draw();
    this.bursts.step(dt, this.vw, this.vh);
  }

  private chargeStep(k: number, dt: number) {
    k = Math.min(1, Math.max(0, k));
    // the tease: violet breaks through for a Rare or better, then gold for an Epic
    if (this.tier >= 1 && k > 0.42 && !this.cracked[0]) {
      this.cracked[0] = true;
      this.shake = 10;
      this.sound('crack', 0.8, 1);
      this.shownTier = 1;
    }
    if (this.tier >= 2 && k > 0.72 && !this.cracked[1]) {
      this.cracked[1] = true;
      this.shake = 18;
      this.flash = 0.35;
      this.sound('crack', 1, 1.35);
      this.shownTier = 2;
    }
    this.seam = mixRgb(this.seam, RCOL[this.shownTier], Math.min(1, dt * 10));
    this.tint = this.seam;
    // it comes to life: a pulse quickening, the light growing, a shudder building
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (8 + k * 30));
    const power = 0.15 + k * 0.7 + pulse * 0.15 * k;
    this.charge = power;
    this.crack = smooth(0.55, 1, k) * (0.4 + 0.3 * this.shownTier);
    this.power = power * (0.6 + 0.2 * this.shownTier);
    this.rays = k * (0.3 + 0.35 * this.shownTier);
    this.shake = Math.max(this.shake, k * k * (3 + 4 * this.shownTier));
    this.cap.rot = Math.sin(this.t * 37) * 0.02 * k * (1 + this.shownTier);
    // landed: a squash that springs back
    const since = this.t - LAND;
    const sq = Math.exp(-since * 9) * Math.cos(since * 26) * 0.12;
    const grow = 1 + k * 0.04 + pulse * 0.015 * k;
    this.cap.sx = (1 + sq) * grow;
    this.cap.sy = (1 - sq) * grow;
    this.cap.y = this.vh * 0.47;
  }

  private draw() {
    const g = this.gl;
    if (!g) return;
    const gl = g.gl;
    const W = this.glCanvas.width, H = this.glCanvas.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const k = this.scale;
    g.draw('bg', W, H, [W / 2, H / 2, W, H], {
      uAt: this.bgAt,
      uTint: this.tint,
      uPower: this.power,
      uRays: this.rays,
      uRing: this.ring,
      uFlash: this.flash * this.flash,
      uAlpha: this.bgAlpha,
      uAspect: W / H,
    });
    const c = this.cap;
    if (c.visible) {
      g.draw('capsule', W, H, [c.x * k, c.y * k, c.w * k, c.h * k], { uSeam: this.seam, uCharge: this.charge, uCrack: this.crack, uHalf: 0, uAspect: 0.75, uAlpha: 1 }, c.rot, c.sx, c.sy);
    }
    for (const h of this.halves) {
      // flying apart, tumbling, and fading
      const m = Math.min(1, h.t / 0.8);
      const e = 1 - (1 - m) * (1 - m);
      const a = 1 - Math.min(1, Math.max(0, (h.t - 0.15) / 0.6));
      if (a <= 0) continue;
      g.draw('capsule', W, H, [(h.x + h.dx * e) * k, (h.y + h.dy * e) * k, c.w * k, c.h * k], { uSeam: this.seam, uCharge: 0, uCrack: 0, uHalf: h.half, uAspect: 0.75, uAlpha: a }, h.rot + (h.rot1 - h.rot) * m);
    }
  }

  private burst() {
    if (this.phase === 'burst' || this.phase === 'dealt') return;
    this.phase = 'burst';
    this.shownTier = this.tier;
    this.seam = [...RCOL[this.tier]];
    this.tint = this.seam;
    this.flash = 1;
    this.ring = 0;
    this.shake = 22 + 8 * this.tier;
    this.host.game.sfx?.gachaStop();
    this.sound('burst', 0.9);
    this.sound(`chime${this.tier}` as GachaSoundId, 0.8);
    this.power = 0.5 + 0.2 * this.tier;
    this.rays = 0.5 + 0.3 * this.tier;
    this.charge = 0;
    this.crack = 0;
    this.ui.querySelector('.ps-hint')?.remove();
    // the capsule splits: the halves fly apart, tumbling, and fade
    const c = this.cap;
    c.visible = false;
    for (const half of [1, 2]) {
      const dir = half === 1 ? [-0.6, -1] : [0.7, 1];
      this.halves.push({ x: c.x, y: c.y, dx: dir[0] * this.vh * 0.7, dy: dir[1] * this.vh * 0.7, rot: 0, rot1: half === 1 ? -0.9 : 1.1, a: 1, half, t: 0 });
    }
    const col = SKIN_RARITY_COL[this.tier];
    this.bursts.spark(c.x, c.y, 110 + 70 * this.tier, RCOL[this.tier]);
    if (this.tier >= 1) this.bursts.confettiAt(c.x, c.y, this.tier === 1 ? 50 : 110, col);
    if (this.results.length === 1) this.later(120, () => this.reveal(this.results[0], false));
    else this.later(100, () => this.deal());
  }

  // ------------------------------------------------------------ one skin

  /**
   * The skin comes out: its swatch rising in its halo, its rarity, its name, what it gave. On its
   * own (`detail` false: the single pull's result) or opened from a 10-pull card.
   */
  private reveal(r: PullResult, detail: boolean) {
    const s = r.skin;
    const box = el('div', `ps-reveal${detail ? ' detail' : ''}`, '', this.ui);
    box.style.setProperty('--rc', SKIN_RARITY_COL[s.r]);
    if (detail) this.detail = box;
    this.tint = [...RCOL[s.r]];
    const word = el('div', 'pr-word', SKIN_RARITY_NAME[s.r].toUpperCase(), box);
    const orbWrap = el('div', 'pr-orb', '', box);
    const orb = new SkinOrb(s, { fps: 60, spin: 0.08 });
    orbWrap.appendChild(orb.el);
    const tag = el('div', `pr-tag${r.new ? ' new' : ''}`, r.new ? 'NEW SKIN' : `DUPLICATE · +${r.shards} SHARDS`, orbWrap);
    const name = el('div', 'pr-name', esc(s.name), box);
    const blurb = el('div', 'pr-blurb', esc(s.blurb), box);
    const row = el('div', 'pr-buttons', '', box);
    button('btn primary', `${ICON.paint}Wear it`, () => this.done('wear', s.id), row);
    if (detail) button('btn', `${ICON.back}Back`, () => this.closeDetail(), row);
    else {
      if (this.againText) button('btn', `${ICON.refresh}${esc(this.againText)}`, () => this.done('again'), row).disabled = !this.againOk;
      button('btn', `${ICON.check}Done`, () => this.done('done'), row);
    }
    // in they come: the swatch springs up out of the burst, the words after it
    orbWrap.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 750, easing: ease.back, fill: 'both' });
    const t0 = performance.now();
    const target = 0.35 + 0.3 * s.r;
    const halo = () => {
      const k = Math.min(1, (performance.now() - t0) / 1400);
      orb.setHalo(1.6 + (target - 1.6) * (1 - (1 - k) * (1 - k)));
      if (k < 1 && orb.el.isConnected) requestAnimationFrame(halo);
    };
    halo();
    [word, name, blurb, row].forEach((c, i) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, delay: 250 + i * 120, fill: 'both' }));
    word.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 450, delay: 250, easing: ease.back, fill: 'both' });
    // the tag stamps down
    tag.animate([{ opacity: 0, transform: 'rotate(-7deg) scale(2.2)' }, { opacity: 1, transform: 'rotate(-7deg) scale(1)' }], { duration: 280, delay: 700, easing: ease.back, fill: 'both' });
    if (r.new && !detail) {
      this.later(800, () => {
        this.shake = 6;
        this.sound('coin', 0.6);
      });
    }
  }

  private closeDetail() {
    const d = this.detail;
    if (!d) return;
    this.host.tap('back');
    this.detail = null;
    d.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).onfinish = () => d.remove();
    this.tint = [...RCOL[this.tier]];
  }

  // ------------------------------------------------------------ ten

  /** Ten cards fan out of the burst into two rows, face down, their edges glowing what's under. */
  private deal() {
    const vw = this.vw, vh = this.vh;
    const gap = vh * 0.025;
    const ch = Math.min((vh * 0.7 - gap) * 0.5, ((vw * 0.86 - gap * 4) / 5) * 1.4);
    const cw = ch / 1.4;
    const x0 = (vw - (cw * 5 + gap * 4)) * 0.5;
    const y0 = vh * 0.08;
    const grid = el('div', 'ps-cards', '', this.ui);
    grid.style.setProperty('--cw', `${cw}px`);
    this.results.forEach((r, i) => {
      const c = new SkinCard(r.skin, { fps: 30, spin: 0.05 });
      c.setFace(false);
      c.el.classList.add('dealt');
      const tx = x0 + (i % 5) * (cw + gap), ty = y0 + Math.floor(i / 5) * (ch + gap);
      Object.assign(c.el.style, { left: `${tx}px`, top: `${ty}px`, width: `${cw}px`, height: `${ch}px` });
      grid.appendChild(c.el);
      this.cards.push(c);
      // out of the burst: from the capsule, small and spinning
      const fx = this.cap.x - cw / 2 - tx, fy = this.cap.y - ch / 2 - ty;
      const rot = (Math.random() * 2.4 - 1.2).toFixed(2);
      c.el.animate(
        [
          { transform: `translate(${fx}px, ${fy}px) scale(0.2) rotate(${rot}rad)`, opacity: 0 },
          { opacity: 1, offset: 0.3 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 500, delay: i * 55, easing: ease.back, fill: 'backwards' },
      );
      this.later(i * 55, () => this.sound('flip', 0.35, 1.3));
      c.el.addEventListener('click', () => this.openCard(i));
    });
    this.bgAt = [0.5, 0.42];
    this.power = 0.25;
    this.rays = 0.25;
    // then they turn over, one by one
    let at = 500 + this.results.length * 55;
    this.results.forEach((r, i) => {
      if (r.skin.r === EPIC) {
        // an Epic holds its breath: it trembles and its edge flares before it turns
        const c = this.cards[i];
        this.later(at, () => {
          this.sound('riser', 0.5, 3.4);
          c.el.classList.add('tremble');
        });
        at += 450;
      }
      this.later(at, () => this.flip(i));
      at += r.skin.r === 0 ? 160 : 320;
    });
    this.later(at, () => this.dealt());
  }

  private flip(i: number) {
    const c = this.cards[i];
    if (c.faceUp) return;
    c.faceUp = true;
    const r = this.results[i];
    const t = r.skin.r;
    c.el.classList.remove('tremble');
    const a = c.el.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 80, easing: 'ease-in' });
    a.onfinish = () => {
      c.setFace(true);
      c.setGlow(1);
      if (r.new) c.setBadge('NEW');
      else c.setBadge(`+${r.shards}`, 'glass');
      const frames = t >= RARE ? [{ transform: 'scaleX(0)' }, { transform: 'scale(1.12)', offset: 0.4 }, { transform: 'scale(1)' }] : [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }];
      c.el.animate(frames, { duration: t >= RARE ? 440 : 120, easing: t >= RARE ? ease.back : 'ease-out' });
    };
    this.sound('flip', 0.6);
    if (t === RARE) this.sound('chime1', 0.45);
    else if (t === EPIC) {
      this.sound('chime2', 0.75);
      this.shake = 12;
      this.flash = 0.45;
      this.tint = [...RCOL[2]];
      const b = c.el.getBoundingClientRect();
      this.bursts.spark(b.left + b.width / 2, b.top + b.height / 2, 120, RCOL[2]);
    }
  }

  /** Every card is up: the buttons, and the cards open on a tap. */
  private dealt() {
    if (this.phase === 'dealt') return;
    this.phase = 'dealt';
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (let i = 0; i < this.cards.length; i++) this.flip(i);
    for (const c of this.cards) c.el.classList.add('open');
    const foot = el('div', 'ps-foot', '<div class="ps-hint2">Tap a card to look closer</div>', this.ui);
    const row = el('div', 'pr-buttons', '', foot);
    if (this.againText) button('btn', `${ICON.refresh}${esc(this.againText)}`, () => this.done('again'), row).disabled = !this.againOk;
    button('btn primary', `${ICON.check}Done`, () => this.done('done'), row);
    foot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'both' });
  }

  private openCard(i: number) {
    if (this.phase !== 'dealt' || this.detail) return;
    this.host.tap('select');
    this.reveal(this.results[i], true);
  }

  // ------------------------------------------------------------ taps

  private skip() {
    if (this.phase === 'in' || this.phase === 'charge') {
      // straight to the burst
      this.t = LAND + CHARGE[this.tier];
      this.cap.y = this.vh * 0.47;
      this.burst();
    } else if (this.phase === 'burst' && this.cards.length) {
      // turn the rest over at once
      this.dealt();
    }
  }
}
