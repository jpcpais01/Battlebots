import type { Game } from '../game/game';
import { computeBuild } from '../game/items';
import type { BotSpec } from '../game/loadout';
import { CODE_LEN, NetError, normalizeCode } from '../net/link';
import { OnlineSession } from '../net/session';
import { simFingerprint } from '../net/fingerprint';
import { botCardInner, paintOf } from './botCard';
import { button, el, esc } from './dom';
import { ICON } from './icons';

/** What the room screen needs from the app around it. */
export interface OnlineHost {
  game: Game;
  player(): BotSpec;
  tap(kind?: 'tap' | 'select' | 'back' | 'start'): void;
  home(): void;
  garage(): void;
  /** A session started a fight. */
  fight(session: OnlineSession, a: BotSpec, b: BotSpec, seed: number): void;
  /** The session changed while the player is somewhere else (fight, results). */
  changed(): void;
  /** The session ended while the player is somewhere else. */
  ended(why: string): void;
}

type Busy = '' | 'create' | 'join';

/**
 * The online room screen: create a room (and share its code), or type a friend's code to
 * join theirs; then both bots face off here until the host starts the fight. Host on the
 * left, guest on the right, the same corners they fight from.
 */
export class OnlineScreen {
  readonly root: HTMLElement;
  session: OnlineSession | null = null;
  visible = false;
  private busy: Busy = '';
  private error = '';
  /** What's in the code box, kept across redraws. */
  private typed = '';
  private cards: HTMLElement;
  private side: HTMLElement;
  private shown = ['', ''];
  private msgEl: HTMLElement | null = null;
  private timer = 0;

  constructor(private host: OnlineHost) {
    const s = el('div', 'screen online');
    this.root = s;
    const top = el('div', 'online-top', '', s);
    button('icon-btn', ICON.back, () => {
      this.host.tap('back');
      this.leave();
      this.host.home();
    }, top);
    el('div', 'online-title', `${ICON.globe}<span>Online</span>`, top);
    const body = el('div', 'online-body', '', s);
    this.cards = el('div', 'online-cards', '', body);
    this.side = el('div', 'online-side interactive', '', body);
  }

  get active() {
    return !!this.session && !this.session.closed;
  }

  show() {
    this.visible = true;
    this.shown = ['', ''];
    // work out this phone's sim fingerprint while the screen fades in, not on the first tap
    setTimeout(() => simFingerprint(), 60);
    this.render();
    // keep the ping fresh
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      const s = this.session;
      if (this.msgEl && s && !s.blocker && !s.peerLost) this.msgEl.textContent = this.status(s);
    }, 1500);
  }

  hide() {
    this.visible = false;
    clearInterval(this.timer);
  }

  // ------------------------------------------------------------------ actions
  private async create() {
    if (this.busy) return;
    this.host.tap('select');
    this.busy = 'create';
    this.error = '';
    this.render();
    try {
      this.adopt(await OnlineSession.host(this.host.player()));
    } catch (e) {
      this.error = e instanceof NetError ? e.message : "Couldn't open a room. Try again.";
    }
    this.busy = '';
    this.render();
  }

  async join(raw: string) {
    const code = normalizeCode(raw);
    this.typed = code;
    if (this.busy) return;
    if (code.length !== CODE_LEN) {
      this.error = `Room codes are ${CODE_LEN} letters.`;
      this.render();
      return;
    }
    this.busy = 'join';
    this.error = '';
    this.render();
    try {
      this.adopt(await OnlineSession.join(code, this.host.player()));
    } catch (e) {
      this.error = e instanceof NetError ? e.message : "Couldn't join that room. Try again.";
    }
    this.busy = '';
    this.render();
  }

  private adopt(s: OnlineSession) {
    this.session?.close();
    this.session = s;
    s.onChange = () => (this.visible ? this.render() : this.host.changed());
    s.onStart = (a, b, seed) => this.host.fight(s, a, b, seed);
    s.onEnd = (why) => {
      this.session = null;
      this.error = why;
      if (this.visible) this.render();
      else this.host.ended(why);
    };
  }

  /** Close the room (or leave the one we're in). */
  leave() {
    this.session?.close();
    this.session = null;
    this.error = '';
  }

  private invite() {
    return `${location.origin}${location.pathname}?room=${this.session!.code}`;
  }

  private async copy(btn: HTMLElement) {
    this.host.tap();
    const link = this.invite();
    try {
      await navigator.clipboard.writeText(link);
      btn.innerHTML = `${ICON.copy}Copied`;
    } catch {
      btn.innerHTML = `${ICON.copy}${esc(link.replace(/^https?:\/\//, ''))}`;
    }
  }

  private async share() {
    this.host.tap();
    try {
      await navigator.share({ title: 'Battlebots', text: `Fight my bot! Room ${this.session!.code}`, url: this.invite() });
    } catch {
      /* closed the share sheet */
    }
  }

  // ------------------------------------------------------------------ view
  render() {
    if (!this.visible) return;
    const s = this.session;
    // the corners: host left, guest right. Before a room exists you stand on the left.
    const me = this.host.player();
    const left = !s || s.role === 'host' ? me : s.peerBot;
    const right = s && s.role === 'host' ? s.peerBot : s ? me : null;
    this.card(0, left, s?.role === 'guest' ? 'Host' : 'You');
    this.card(1, right, s?.role === 'guest' ? 'You' : 'Opponent');
    this.renderSide();
  }

  private card(i: number, spec: BotSpec | null, tag: string) {
    const key = spec ? JSON.stringify(spec) + tag : `empty${this.session ? 1 : 0}`;
    if (this.shown[i] === key) return;
    this.shown[i] = key;
    let c = this.cards.children[i * 2] as HTMLElement | undefined;
    if (!c) {
      if (i === 1) el('div', 'online-vs', '<b>VS</b>', this.cards);
      c = el('div', '', '', this.cards);
    }
    c.className = `bcard ${i ? 'r' : 'l'}${spec ? '' : ' ghost'}`;
    if (spec) {
      c.style.setProperty('--paint', paintOf(spec));
      c.innerHTML = botCardInner(this.host.game, spec, computeBuild(spec.loadout), { side: i ? 'r' : 'l', tag, delay: 0.05 });
    } else {
      c.style.removeProperty('--paint');
      c.innerHTML = this.session
        ? '<div class="ghost-in"><div class="dots"><i></i><i></i><i></i></div><span>Waiting for a challenger</span></div>'
        : '<div class="ghost-in"><span>Your opponent</span></div>';
    }
  }

  private renderSide() {
    const side = this.side;
    const s = this.session;
    side.replaceChildren();
    this.msgEl = null;
    if (!s) {
      // no room yet: make one or join one
      el('p', 'online-lede', 'Fight a friend. One of you opens a room, the other types its code.', side);
      button('btn primary', `${ICON.swords}${this.busy === 'create' ? 'Opening…' : 'Create room'}`, () => void this.create(), side).disabled = !!this.busy;
      el('div', 'online-or', '<span>or join one</span>', side);
      const row = el('form', 'code-row', '', side);
      const input = el('input', 'code-in', '', row);
      input.maxLength = CODE_LEN;
      input.placeholder = 'CODE';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('autocapitalize', 'characters');
      input.setAttribute('aria-label', 'Room code');
      input.value = this.typed;
      input.addEventListener('input', () => {
        const v = normalizeCode(input.value);
        if (v !== input.value) input.value = v;
        this.typed = v;
      });
      const go = button('btn cyan', this.busy === 'join' ? 'Joining…' : 'Join', () => void this.join(input.value), row);
      go.disabled = !!this.busy;
      row.addEventListener('submit', (e) => {
        e.preventDefault();
        void this.join(input.value);
      });
      if (this.error) el('p', 'online-msg bad', esc(this.error), side);
      return;
    }

    // in a room
    const codeBox = el('div', 'room-code', `<span>Room code</span><b>${esc(s.code)}</b>`, side);
    if (s.role === 'host') {
      const links = el('div', 'room-links', '', codeBox);
      const copy = button('btn small', `${ICON.copy}Copy link`, () => void this.copy(copy), links);
      if ('share' in navigator) button('btn small', `${ICON.share}Share`, () => void this.share(), links);
    }
    const msg = s.blocker || (s.peerLost ? 'Connection is shaky…' : this.status(s));
    this.msgEl = el('p', `online-msg${s.blocker ? ' bad' : s.peerLost ? ' warn' : ''}`, esc(msg), side);
    if (s.role === 'host') {
      const fight = button('btn primary big', `${ICON.swords}Fight`, () => {
        this.host.tap('start');
        s.startFight();
      }, side);
      fight.disabled = !s.canFight;
    }
    button('btn small', `${ICON.wrench}Garage`, () => {
      this.host.tap('select');
      this.host.garage();
    }, side);
  }

  private status(s: OnlineSession) {
    if (!s.connected) return s.note;
    if (!s.peerBot) return 'Connecting…';
    const ping = `${Math.round(s.rtt)} ms`;
    return s.role === 'host' ? `${s.peerBot.name} is in. Ping ${ping}` : `Waiting for ${s.peerBot.name} to start the fight. Ping ${ping}`;
  }
}
