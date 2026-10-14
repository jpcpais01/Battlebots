import type { Game } from '../game/game';
import type { Match } from '../sim/match';
import { SIM_DT } from '../sim/match';
import { matchHash } from '../sim/hash';
import type { BotSpec } from '../game/loadout';
import { sanitizeBot } from '../ui/store';
import { simFingerprint } from './fingerprint';
import { joinRoom, Link, Room, type NetMsg } from './link';

/** Bump when the messages change shape. */
const PROTOCOL = 1;
/** Steps between state hashes (half a second of fight). */
const HASH_EVERY = 60;
/** Seconds between step-count updates during a fight. */
const TICK_EVERY = 0.1;
const STEPS_PER_S = 1 / SIM_DT;

export type Role = 'host' | 'guest';
export type Outcome = { winner: number; kind: Match['result'] };

/**
 * One online room, from either side.
 *
 * Fights are lockstep-free: the host picks a seed and sends it with both bots, and each
 * phone then runs the whole fight itself. The sim is deterministic (scripts/check-sim.mjs
 * keeps it that way), so both screens show the same punches landing. What crosses the
 * wire during a fight is just pacing (each side's step count, so a phone that stalled or
 * went to the background catches up) and a state hash every half second, which proves the
 * two fights are still the same one. If they ever drift apart the host's result stands.
 */
export class OnlineSession {
  readonly role: Role;
  /** Fighter index this player controls: the host is on the left, the guest on the right. */
  readonly me: 0 | 1;
  code = '';
  peerBot: BotSpec | null = null;
  /** Why the two can't fight together, if they can't (different game versions). */
  blocker = '';
  /** Status line for the room screen. */
  note = '';
  /** Both sides' "rematch" taps after a fight. */
  rematch = [false, false];
  /** The fight on screen drifted from the other player's. */
  desynced = false;
  /** The other player left mid-fight (the fight still plays out here). */
  peerLeft = false;
  /** The host's word on how the fight ended, for when the fights drifted apart. */
  hostOutcome: Outcome | null = null;
  closed = false;

  /** Something on the room screen changed. */
  onChange: () => void = () => {};
  /** Start a fight between these bots with this seed (host left, guest right). */
  onStart: (a: BotSpec, b: BotSpec, seed: number) => void = () => {};
  /** The room is over (left, closed by the host, or the link died). */
  onEnd: (why: string) => void = () => {};

  private link: Link | null = null;
  private room: Room | null = null;
  private fp = 0;
  private peerFp = 0;
  private match: Match | null = null;
  private game: Game | null = null;
  private peerN = -1;
  /** Smoothed step gap to the other phone (+ = they're ahead). */
  private lag = 0;
  private peerAt = 0;
  private tickT = 0;
  private mine = new Map<number, number>();
  private theirs = new Map<number, number>();

  private constructor(role: Role, public myBot: BotSpec) {
    this.role = role;
    this.me = role === 'host' ? 0 : 1;
    this.fp = simFingerprint();
  }

  get connected() {
    return !!this.link && !this.link.closed;
  }
  get peerLost() {
    return !!this.link?.lost;
  }
  get rtt() {
    return this.link?.rtt ?? 0;
  }
  get canFight() {
    return this.connected && !!this.peerBot && !this.blocker;
  }

  /** Open a room and wait for someone to join with its code. */
  static async host(me: BotSpec): Promise<OnlineSession> {
    const s = new OnlineSession('host', me);
    const room = await Room.open();
    s.room = room;
    s.code = room.code;
    s.note = 'Waiting for a challenger';
    room.onGuest = (link) => s.attach(link);
    return s;
  }

  /** Join the room with this code. */
  static async join(code: string, me: BotSpec): Promise<OnlineSession> {
    const s = new OnlineSession('guest', me);
    s.code = code;
    s.attach(await joinRoom(code));
    return s;
  }

  private attach(link: Link) {
    this.link = link;
    this.peerBot = null;
    this.blocker = '';
    this.rematch = [false, false];
    this.peerLeft = false;
    this.note = 'Connecting';
    link.onMessage = (m) => this.receive(m);
    link.onLost = () => this.onChange();
    link.onBack = () => this.onChange();
    link.onClose = () => this.dropped(link.saidBye);
    link.send({ t: 'hello', v: PROTOCOL, fp: this.fp, bot: this.myBot });
    this.onChange();
  }

  private dropped(bye: boolean) {
    this.link = null;
    this.peerLeft = true;
    this.rematch = [false, false];
    if (this.closed) return;
    if (this.role === 'host') {
      // the room stays open: anyone (or the same player again) can come back in on the code
      const name = this.peerBot?.name;
      this.peerBot = null;
      this.blocker = '';
      this.note = name ? `${name} left. Waiting for a challenger` : 'Waiting for a challenger';
      this.onChange();
    } else {
      this.close();
      this.onEnd(bye ? 'The host closed the room.' : 'Lost the connection to the room.');
    }
  }

  private receive(m: NetMsg) {
    switch (m.t) {
      case 'hello': {
        this.peerBot = sanitizeBot(m.bot);
        this.peerFp = Number(m.fp) >>> 0;
        this.blocker =
          m.v !== PROTOCOL || this.peerFp !== this.fp
            ? 'You are on different versions of the game. Both tap ⟳ on the home screen to update, then try again.'
            : '';
        this.note = this.role === 'host' ? `${this.peerBot.name} joined` : 'Connected';
        this.onChange();
        break;
      }
      case 'bot':
        this.peerBot = sanitizeBot(m.bot);
        this.onChange();
        break;
      case 'full':
        this.close();
        this.onEnd('That room already has two players.');
        break;
      case 'start': {
        if (this.role !== 'guest') break;
        const seed = Number(m.seed) >>> 0;
        this.begin(sanitizeBot(m.a), sanitizeBot(m.b), seed);
        break;
      }
      case 'tick':
        this.peerN = Number(m.n) || 0;
        this.peerAt = performance.now();
        break;
      case 'hash': {
        const n = Number(m.n), h = Number(m.h) >>> 0;
        const mine = this.mine.get(n);
        if (mine === undefined) this.theirs.set(n, h);
        else this.compare(n, mine, h);
        break;
      }
      case 'result':
        this.hostOutcome = { winner: Number(m.w), kind: (m.r as Match['result']) ?? null };
        break;
      case 'rematch':
        this.rematch[1 - this.me] = true;
        this.onChange();
        this.maybeRematch();
        break;
    }
  }

  /** Our own bot changed (the player went to the garage from the room). */
  setBot(bot: BotSpec) {
    this.myBot = bot;
    this.link?.send({ t: 'bot', bot });
    this.onChange();
  }

  /** Host: start a fight with a fresh seed. */
  startFight() {
    if (this.role !== 'host' || !this.canFight) return;
    const a = sanitizeBot(this.myBot);
    const b = sanitizeBot(this.peerBot);
    // each bot fights in its owner's own paint, even when both look alike
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const seed = r[0];
    this.link!.send({ t: 'start', seed, a, b });
    this.begin(a, b, seed);
  }

  private begin(a: BotSpec, b: BotSpec, seed: number) {
    this.rematch = [false, false];
    this.desynced = false;
    this.hostOutcome = null;
    this.peerN = -1;
    this.lag = 0;
    this.mine.clear();
    this.theirs.clear();
    this.onStart(a, b, seed);
  }

  /** After a fight: this player wants another one. The host starts it once both do. */
  voteRematch() {
    if (!this.connected) return;
    this.rematch[this.me] = true;
    this.link!.send({ t: 'rematch' });
    this.onChange();
    this.maybeRematch();
  }

  private maybeRematch() {
    if (this.role === 'host' && this.rematch[0] && this.rematch[1]) this.startFight();
  }

  // ------------------------------------------------------------------ the fight
  /** Follow this match: pace it against the other phone and compare hashes. */
  watch(game: Game, m: Match) {
    this.game = game;
    this.match = m;
    game.onStep = (mm) => this.stepped(mm);
  }

  unwatch() {
    if (this.game) {
      this.game.speed = 1;
      if (this.game.onStep) this.game.onStep = null;
    }
    this.match = null;
    this.game = null;
  }

  private stepped(m: Match) {
    if (m !== this.match || m.frame % HASH_EVERY !== 0) return;
    const h = matchHash(m);
    const n = m.frame;
    this.mine.set(n, h);
    this.link?.send({ t: 'hash', n, h });
    const theirs = this.theirs.get(n);
    if (theirs !== undefined) {
      this.theirs.delete(n);
      this.compare(n, h, theirs);
    }
    // only recent history matters
    this.mine.delete(n - HASH_EVERY * 40);
  }

  private compare(n: number, mine: number, theirs: number) {
    if (mine === theirs || this.desynced) return;
    this.desynced = true;
    console.warn(`[online] fights drifted apart at step ${n}: ${mine.toString(16)} vs ${theirs.toString(16)}`);
    this.onChange();
  }

  private sentResult: Match | null = null;
  private sendResult(m: Match) {
    if (this.sentResult === m) return;
    this.sentResult = m;
    this.link?.send({ t: 'result', w: m.winner ? m.winner.index : -1, r: m.result });
  }

  /** How the fight ended, by the host's word if the two fights drifted apart. */
  outcome(m: Match): Outcome {
    if (this.role === 'guest' && this.desynced && this.hostOutcome) return this.hostOutcome;
    return { winner: m.winner ? m.winner.index : -1, kind: m.result };
  }

  /**
   * Called every frame during a fight: tell the other side where we are. The guest runs a
   * little faster or slower to show the same moment as the host, and either phone that fell
   * well behind (it was in the background, or stalled) catches up at once, silently.
   */
  frame(dt: number) {
    const m = this.match, g = this.game;
    if (!m || !g) return;
    if (m.phase === 'end') {
      g.speed = 1;
      if (this.role === 'host') this.sendResult(m);
      return;
    }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = TICK_EVERY;
      this.link?.send({ t: 'tick', n: m.frame });
    }
    const silent = (performance.now() - this.peerAt) / 1000;
    if (!this.connected || this.peerN < 0 || silent > 1) {
      // no fresh word from them: play on at normal speed, they'll catch up
      g.speed = 1;
      return;
    }
    const est = this.peerN + (silent + this.rtt / 2000) * STEPS_PER_S * m.slowmo;
    const diff = est - m.frame;
    if (diff > 90) {
      // way behind (this phone stalled or was in the background): jump, silently
      g.fastForward(Math.min(Math.round(diff), 240));
      this.lag = 0;
      g.speed = 1;
      return;
    }
    // the host keeps the beat; the guest follows it. (One steering side can't drift: two
    // would both read a slow network as "the other one is ahead" and speed up together.)
    if (this.role === 'host') {
      g.speed = 1;
      return;
    }
    // frame times and message timing are noisy: steer on a smoothed gap, gently
    this.lag += (diff - this.lag) * Math.min(1, dt * 3);
    const gap = Math.abs(this.lag) < 4 ? 0 : this.lag;
    g.speed = Math.min(1.35, Math.max(diff < -90 ? 0 : 0.65, 1 + gap / 60));
  }

  // ------------------------------------------------------------------ teardown
  close() {
    if (this.closed) return;
    this.closed = true;
    this.unwatch();
    const link = this.link;
    this.link = null;
    if (link) {
      link.onClose = () => {};
      link.leave();
    }
    this.room?.close();
    this.room = null;
  }
}
