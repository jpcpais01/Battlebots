import type { Game } from '../game/game';
import type { BotSpec } from '../game/loadout';
import type { Record_ } from '../game/saves';
import { credits } from '../game/career';
import {
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
import { CapsuleView, rgb, SkinOrb } from './vaultGl';
import type { VaultBeat, VaultStage } from '../render/vault/vaultStage';
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
    const face = this.el.querySelector<HTMLElement>('.sc-face')!;
    face.appendChild(this.orb.el);
    this.nameEl = el('b', 'sc-name', '', face);
    this.tierEl = el('small', 'sc-tier', '', face);
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
 * The Skin Vault: where skins are won. The vault is its own place out in space
 * (render/vault/vaultStage.ts): the player's bot on a glowing turntable on the right (drag to turn
 * round it) in front of a giant gumball machine full of capsules; the panel on the left has two tabs.
 *   Vault: today's featured Epic turning in its halo, the rates and how close the Epic pity is,
 *   the capsule waiting over its pool of light, the free pull (or when it's back), and the pulls
 *   (one, or ten with a Rare or better in them), paid in career credits. The first visit has a
 *   free 10-pull waiting.
 *   Collection: every skin as a card (the ones not owned yet veiled), by rarity. Tapping one
 *   paints it onto the bot with a sweep of light: one owned goes on for good, one not owned is
 *   only tried on, with the shards it costs.
 * Credits and shards sit top right. Pulls play out on the machine (PullShow).
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
    this.panelShown(false);
  }

  /** The panel and the wallet out of the way while a pull plays on the machine, or back. */
  private panelShown(on: boolean) {
    this.root.classList.toggle('pulling', !on);
  }

  private closeShow() {
    const s = this.show;
    if (!s) return;
    this.show = null;
    this.host.game.sfx?.gachaStop();
    s.close();
    // the machine at rest again, the player's own bot back on the turntable (a 10-pull's card may
    // have left another skin on it), and the panel back
    const game = this.host.game;
    game.vaultStage?.finish();
    if (game.shown !== this.host.player()) this.host.show(null);
    this.panelShown(true);
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

interface Streak {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  w: number;
  life: number;
}

/**
 * Bursts of sparks off the cards as they turn over on a Rare or better: streaks in the rarity's
 * colour flying out from the card's edge and a ring growing off it, drawn additively on one 2D
 * canvas, each gone in under a second.
 */
class CardSparks {
  private bursts: { rect: DOMRect; col: string; ring: string; t: number; sparks: Streak[] }[] = [];

  constructor(private ctx: CanvasRenderingContext2D) {}

  add(rect: DOMRect, tier: number) {
    const c = rgb(SKIN_RARITY_COL[tier]);
    const css = (k: number) => `rgb(${c.map((v) => Math.round((v + (1 - v) * k) * 255)).join(' ')})`;
    const n = tier <= RARE ? 18 : 34;
    const mx = rect.left + rect.width / 2, my = rect.top + rect.height / 2;
    const sparks: Streak[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      // from the card's edge, roughly: its border along that direction
      const k = Math.min((rect.width * 0.5) / Math.max(Math.abs(dx), 1e-3), (rect.height * 0.5) / Math.max(Math.abs(dy), 1e-3));
      const sp = (0.6 + Math.random() * 0.4) * rect.width * (tier > RARE ? 2.2 : 1.6);
      sparks.push({ x: mx + dx * k * 0.92, y: my + dy * k * 0.92, vx: dx * sp, vy: dy * sp, len: (0.05 + Math.random() * 0.06) * rect.width, w: 1.2 + Math.random() * 1.2, life: (0.55 + Math.random() * 0.45) * 0.85 });
    }
    this.bursts.push({ rect, col: css(0.55), ring: css(0.3), t: 0, sparks });
  }

  get alive() {
    return this.bursts.length > 0;
  }

  step(dt: number, w: number, h: number) {
    const c = this.ctx;
    c.clearRect(0, 0, w, h);
    if (!this.bursts.length) return;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    this.bursts = this.bursts.filter((b) => {
      b.t += dt;
      const k = b.t / 0.85;
      if (k >= 1) return false;
      // the ring off the card's edge
      const g = k * b.rect.width * 0.35;
      c.globalAlpha = (1 - k) * (1 - k) * 0.7;
      c.strokeStyle = b.ring;
      c.lineWidth = 2.5 * (1 - k) + 0.5;
      c.strokeRect(b.rect.left - g, b.rect.top - g, b.rect.width + g * 2, b.rect.height + g * 2);
      c.strokeStyle = b.col;
      for (const s of b.sparks) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const d = 1 - Math.min(1, dt * 3.2);
        s.vx *= d;
        s.vy *= d;
        const f = b.t / s.life;
        if (f >= 1) continue;
        const sp = Math.hypot(s.vx, s.vy) || 1;
        const tl = s.len * (1 - f * 0.5);
        c.globalAlpha = (1 - f) * (1 - f);
        c.lineWidth = s.w;
        c.beginPath();
        c.moveTo(s.x - (s.vx / sp) * tl, s.y - (s.vy / sp) * tl);
        c.lineTo(s.x, s.y);
        c.stroke();
      }
      return true;
    });
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
}

/**
 * A pull, played out (the Skin Vault's big moment), over the vault's own place out in space: the
 * giant gumball machine does the work in 3D (render/vault/vaultStage.ts) and this puts the words,
 * the flashes and the buttons over it. Black bars slide in like a film's while the crank turns.
 *   one pull: a capsule drops out of the chute, rolls out, rises and charges (a Rare teases violet
 *   through its seam, an Epic holds, shakes and blows through to gold) and bursts; the camera cuts
 *   to the robot as a beam paints the skin onto it, and its rarity, name and NEW (or the shards a
 *   copy gave) come in beside it.
 *   ten: ten capsules shoot out of the chute into an arc and pop one by one into lights of their
 *   rarity's colour, a pip lighting along the bottom for each (an Epic trembles first); then ten
 *   cards deal out and turn over, the best last. A card tapped shows that skin on the robot.
 * A tap skips ahead (to the burst, to the lights, the cards all turned). `done` says what the
 * player picked: 'done', 'again' (the same pull again) or 'wear' (with the id).
 */
class PullShow {
  readonly root: HTMLElement;
  private stage: VaultStage | null;
  private phase: 'in' | 'reveal' | 'cards' | 'dealt' = 'in';
  private shade: HTMLElement;
  private veil: HTMLElement;
  private cardBox: HTMLElement;
  private ui: HTMLElement;
  private bars: HTMLElement[] = [];
  private flashEl: HTMLElement;
  private flashA = 0;
  private hint: HTMLElement;
  private pipRow: HTMLElement | null = null;
  private pips: HTMLElement[] = [];
  private fxCanvas: HTMLCanvasElement;
  private sparks: CardSparks;
  private cards: SkinCard[] = [];
  /** Where each card sits once dealt, and seconds since they all turned (they float a little then). */
  private homes: { x: number; y: number; w: number; h: number }[] = [];
  private floatT = -1;
  private flipTimers: number[] = [];
  private timers: number[] = [];
  private detail: HTMLElement | null = null;
  private raf = 0;
  private lastT = 0;
  private onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (this.detail) this.closeDetail();
    else if (this.phase === 'dealt' || this.phase === 'reveal') this.done('done');
    else this.skip();
  };

  constructor(
    private host: VaultHost,
    private results: PullResult[],
    private againText: string,
    private againOk: boolean,
    private done: (action: 'done' | 'again' | 'wear', id?: string) => void,
  ) {
    const r = (this.root = el('div', 'pull-show'));
    // a shade down the left for the words (kept off until there are words), the veil the ten deal out over
    this.shade = el('div', 'ps-shade', '', r);
    this.veil = el('div', 'ps-veil', '', r);
    this.cardBox = el('div', 'ps-cards', '', r);
    this.ui = el('div', 'ps-ui', '', r);
    this.fxCanvas = el('canvas', 'ps-fx', '', r) as HTMLCanvasElement;
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    this.fxCanvas.width = Math.round(innerWidth * dpr);
    this.fxCanvas.height = Math.round(innerHeight * dpr);
    const ctx = this.fxCanvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    this.sparks = new CardSparks(ctx);
    // the film's black bars, and the burst's flash over everything
    for (let i = 0; i < 2; i++) this.bars.push(el('div', `ps-bar ${i === 0 ? 'top' : 'bottom'}`, '', r));
    this.flashEl = el('div', 'ps-flash', '', r);
    this.hint = el('div', 'ps-hint', 'Tap to skip', r);
    if (results.length > 1) this.buildPips();
    // (one frame on, so the bars slide in rather than appear)
    requestAnimationFrame(() => this.barsTo(true));
    r.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.skip();
    });
    window.addEventListener('keydown', this.onKey);
    host.tap('start');
    this.stage = host.game.vaultStage;
    if (this.stage) {
      this.stage.onBeat = (what, data) => this.onBeat(what, data);
      this.stage.play(results, host.player());
    } else {
      // (no vault to play it on: straight to what came out)
      this.later(200, () => (results.length === 1 ? this.onBeat('reveal', results[0]) : this.onBeat('cards')));
    }
    this.lastT = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private sound(id: GachaSoundId, gain = 1, rate = 1) {
    this.host.game.sfx?.gacha(id, gain, rate);
  }

  private later(ms: number, fn: () => void, list = this.timers) {
    list.push(window.setTimeout(fn, ms));
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const t of [...this.timers, ...this.flipTimers]) clearTimeout(t);
    window.removeEventListener('keydown', this.onKey);
    if (this.stage) this.stage.onBeat = null;
    this.root.style.pointerEvents = 'none';
    const a = this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
    a.onfinish = () => this.root.remove();
  }

  private barsTo(on: boolean) {
    for (const b of this.bars) b.classList.toggle('on', on);
    this.hint.classList.toggle('up', on && !!this.pipRow);
  }

  /** Ten pips along the bottom bar, one lighting for each capsule as it pops. */
  private buildPips() {
    this.pipRow = el('div', 'ps-pips', '', this.root);
    for (let i = 0; i < this.results.length; i++) this.pips.push(el('i', '', '', this.pipRow));
  }

  private pip(i: number, tier: number, quiet = false) {
    const p = this.pips[i];
    if (!p || p.classList.contains('lit')) return;
    p.classList.add('lit');
    p.style.setProperty('--rc', SKIN_RARITY_COL[tier]);
    if (!quiet) p.animate([{ transform: `scale(${1.9 + 0.4 * tier})` }, { transform: 'scale(1)' }], { duration: 350, easing: ease.back });
  }

  private flashOf(tier: number, a: number) {
    const c = rgb(SKIN_RARITY_COL[tier]).map((v) => Math.round((v + (1 - v) * 0.5) * 255));
    this.flashEl.style.background = `rgb(${c.join(' ')})`;
    this.flashA = a;
  }

  // ------------------------------------------------------------ the stage's beats

  private frame(now: number) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 2.4);
    this.flashEl.style.opacity = (this.flashA * this.flashA).toFixed(3);
    this.flashEl.style.display = this.flashA > 0 ? '' : 'none';
    if (this.floatT >= 0) {
      this.floatT += dt;
      const k = smooth(0.6, 1.6, this.floatT);
      this.cards.forEach((c, i) => (c.el.style.translate = `0 ${(Math.sin(this.floatT * 1.7 + i * 0.9) * 2.5 * k).toFixed(2)}px`));
    }
    if (this.sparks.alive || this.fxDirty) {
      this.fxDirty = this.sparks.alive;
      this.sparks.step(dt, innerWidth, innerHeight);
    }
  }
  private fxDirty = false;

  private onBeat(what: VaultBeat, data?: unknown) {
    switch (what) {
      case 'burst':
        this.flashOf(data as number, 0.75 + 0.1 * (data as number));
        break;
      case 'reveal':
        this.phase = 'reveal';
        this.hint.style.display = 'none';
        this.reveal(data as PullResult, false);
        break;
      case 'pop': {
        const [i, tier] = data as [number, number];
        this.pip(i, tier);
        if (tier === EPIC) this.flashOf(EPIC, 0.6);
        break;
      }
      case 'cards':
        this.phase = 'cards';
        this.results.forEach((r, i) => this.pip(i, r.skin.r, true));
        this.deal();
        break;
    }
  }

  // ------------------------------------------------------------ one skin

  /**
   * The skin on the robot: its rarity, its name, what it gave and the buttons, in beside it. On its
   * own (`detail` false: the single pull's result) or opened from a 10-pull card.
   */
  private reveal(r: PullResult, detail: boolean) {
    const s = r.skin;
    const box = el('div', 'ps-reveal', '', this.ui);
    box.style.setProperty('--rc', SKIN_RARITY_COL[s.r]);
    if (detail) this.detail = box;
    this.shade.classList.add('on');
    this.barsTo(false);
    const tag = el('div', `pr-tag${r.new ? ' new' : ''}`, r.new ? 'NEW SKIN' : `DUPLICATE &nbsp;+${r.shards} SHARDS`, box);
    const word = el('div', 'pr-word', SKIN_RARITY_NAME[s.r].toUpperCase(), box);
    const name = el('div', 'pr-name', esc(s.name), box);
    const blurb = el('div', 'pr-blurb', esc(s.blurb), box);
    const row = el('div', 'pr-buttons', '', box);
    button('btn primary', `${ICON.paint}Wear it`, () => this.done('wear', s.id), row);
    if (detail) button('btn', `${ICON.back}Back`, () => this.closeDetail(), row);
    else {
      if (this.againText) button('btn', `${ICON.refresh}${esc(this.againText)}`, () => this.done('again'), row).disabled = !this.againOk;
      button('btn', `${ICON.check}Done`, () => this.done('done'), row);
    }
    // in they come: the word slams in, the rest slides after it, the tag stamps down
    [word, name, blurb, row].forEach((c, i) =>
      c.animate([{ opacity: 0, translate: '-40px 0' }, { opacity: 1, translate: '0 0' }], { duration: 450, delay: 350 + i * 100, easing: ease.out, fill: 'both' }),
    );
    word.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 500, delay: 350, easing: ease.back, fill: 'both' });
    tag.animate([{ opacity: 0, transform: 'rotate(-3.4deg) scale(2.2)' }, { opacity: 1, transform: 'rotate(-3.4deg) scale(1)' }], { duration: 280, delay: 850, easing: ease.back, fill: 'both' });
    if (r.new && !detail) this.later(950, () => this.sound('coin', 0.6));
  }

  /** Back from a card's skin on the robot to the ten. */
  private closeDetail() {
    const d = this.detail;
    if (!d) return;
    this.host.tap('back');
    this.detail = null;
    d.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).onfinish = () => d.remove();
    this.shade.classList.remove('on');
    this.stage?.backToOrbs();
    this.cardsShown(true);
  }

  // ------------------------------------------------------------ ten

  /**
   * Ten cards fly up out of the pips into two rows, face down, their edges glowing what's under,
   * and turn over one by one from the Commons up, so the best is always the last to land (an Epic
   * holds its breath first).
   */
  private deal() {
    const vw = innerWidth, vh = innerHeight;
    this.hint.style.display = 'none';
    this.veil.classList.add('on');
    const gap = vh * 0.025;
    // (between the film's bars, clear of the buttons that come up under them)
    const ch = Math.min((vh * 0.62 - gap) * 0.5, ((vw * 0.8 - gap * 4) / 5) * 1.4);
    const cw = ch / 1.4;
    const x0 = (vw - (cw * 5 + gap * 4)) * 0.5;
    const y0 = vh * 0.085 + gap * 1.5;
    this.cardBox.style.setProperty('--cw', `${cw}px`);
    this.results.forEach((r, i) => {
      const c = new SkinCard(r.skin, { fps: 30, spin: 0.05 });
      c.setFace(false);
      c.el.classList.add('dealt');
      const tx = x0 + (i % 5) * (cw + gap), ty = y0 + Math.floor(i / 5) * (ch + gap);
      this.homes.push({ x: tx, y: ty, w: cw, h: ch });
      Object.assign(c.el.style, { left: `${tx}px`, top: `${ty}px`, width: `${cw}px`, height: `${ch}px` });
      this.cardBox.appendChild(c.el);
      this.cards.push(c);
      // out of its pip: small and spinning
      const pb = this.pips[i]?.getBoundingClientRect();
      const fx = (pb ? pb.left + pb.width / 2 : vw / 2) - cw / 2 - tx, fy = (pb ? pb.top + pb.height / 2 : vh / 2) - ch / 2 - ty;
      const rot = (Math.random() * 1.6 - 0.8).toFixed(2);
      c.el.animate(
        [
          { transform: `translate(${fx}px, ${fy}px) scale(0.15) rotate(${rot}rad)`, opacity: 0 },
          { opacity: 1, offset: 0.3 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 500, delay: i * 50, easing: ease.back, fill: 'backwards' },
      );
      this.later(i * 50, () => this.sound('flip', 0.3, 1.3), this.flipTimers);
      c.el.addEventListener('click', () => this.openCard(i));
    });
    // turned over from the Commons up, so the best is always the last one to land
    const order = this.results.map((_, i) => i).sort((a, b) => this.results[a].skin.r - this.results[b].skin.r || a - b);
    let at = 450 + this.results.length * 50;
    for (const i of order) {
      const t = this.results[i].skin.r;
      if (t === EPIC) {
        const c = this.cards[i];
        this.later(at, () => {
          this.sound('riser', 0.45, 3.4);
          c.el.classList.add('tremble');
          const t0 = performance.now();
          const glow = () => {
            const k = Math.min(1, (performance.now() - t0) / 450);
            c.setGlow(1 + 1.6 * k);
            if (k < 1 && !c.faceUp) requestAnimationFrame(glow);
          };
          glow();
        }, this.flipTimers);
        at += 450;
      }
      this.later(at, () => this.flip(i), this.flipTimers);
      at += t === 0 ? 120 : t === RARE ? 300 : 500;
    }
    this.later(at, () => this.dealt(), this.flipTimers);
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
      if (t >= RARE) {
        const h = this.homes[i];
        if (h) this.sparks.add(new DOMRect(h.x, h.y, h.w, h.h), t);
        const t0 = performance.now();
        const to = 0.35 + 0.3 * t;
        const halo = () => {
          const k = Math.min(1, (performance.now() - t0) / 700);
          c.orb.setHalo(1.6 + (to - 1.6) * k);
          if (k < 1 && c.el.isConnected) requestAnimationFrame(halo);
        };
        halo();
      }
      const frames = t >= RARE ? [{ transform: 'scaleX(0)' }, { transform: 'scale(1)', offset: 0.35 }, { transform: 'scale(1.12)', offset: 0.55 }, { transform: 'scale(1)' }] : [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }];
      c.el.animate(frames, { duration: t >= RARE ? 440 : 120, easing: t >= RARE ? ease.out : 'ease-out' });
    };
    this.sound('flip', 0.55);
    if (t === RARE) this.sound('chime1', 0.4);
    else if (t === EPIC) {
      this.sound('chime2', 0.7);
      this.flashOf(EPIC, 0.45);
    }
  }

  /** Every card is up: what the ten came to, the buttons, and the cards open on a tap. */
  private dealt() {
    if (this.phase === 'dealt') return;
    this.phase = 'dealt';
    for (const t of this.flipTimers) clearTimeout(t);
    this.flipTimers = [];
    for (let i = 0; i < this.cards.length; i++) this.flip(i);
    for (const c of this.cards) c.el.classList.add('open');
    this.barsTo(false);
    this.pipRow?.classList.add('gone');
    this.floatT = 0;
    const box = el('div', 'ps-dealt', '', this.cardBox);
    this.summary(box);
    const foot = el('div', 'ps-foot', '<div class="ps-hint2">Tap a card to see it on your robot</div>', box);
    const row = el('div', 'pr-buttons', '', foot);
    if (this.againText) button('btn', `${ICON.refresh}${esc(this.againText)}`, () => this.done('again'), row).disabled = !this.againOk;
    button('btn primary', `${ICON.check}Done`, () => this.done('done'), row);
    box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'both' });
  }

  /** What the ten came to, over the cards: a chip per rarity drawn (best first) and how many are new. */
  private summary(box: HTMLElement) {
    const n = [0, 0, 0];
    let fresh = 0;
    for (const r of this.results) {
      n[r.skin.r]++;
      if (r.new) fresh++;
    }
    const row = el('div', 'ps-summary', '', box);
    for (const t of [EPIC, RARE, 0]) {
      if (!n[t]) continue;
      el('span', 'ps-chip', `${n[t]} ${SKIN_RARITY_NAME[t].toUpperCase()}`, row).style.setProperty('--rc', SKIN_RARITY_COL[t]);
    }
    if (fresh) el('span', 'ps-chip new', `${fresh} NEW`, row);
    const top = this.homes[0]?.y ?? innerHeight * 0.12;
    row.style.top = `${Math.max(4, top * 0.5 - 4)}px`;
  }

  private openCard(i: number) {
    if (this.phase !== 'dealt' || this.detail) return;
    this.host.tap('select');
    this.cardsShown(false);
    this.stage?.showOnRobot(this.results[i].skin.id);
    this.reveal(this.results[i], true);
  }

  /** The cards (and their veil and buttons) out of the way while a skin is shown on the robot, or back. */
  private cardsShown(on: boolean) {
    this.cardBox.classList.toggle('away', !on);
    this.veil.classList.toggle('on', on);
  }

  // ------------------------------------------------------------ taps

  private skip() {
    if (this.phase === 'in') {
      // straight to the burst (one) or the lights (ten)
      this.stage?.skip();
    } else if (this.phase === 'cards') {
      // turn the rest over at once
      this.dealt();
    }
  }
}
