import type { DetachInfo, HitInfo, Match, WearInfo } from '../sim/match';
import type { Fighter } from '../sim/fighter';
import type { BrainEvent } from '../sim/brain';
import { P } from '../sim/damage';

/**
 * The commentary booth: a play-by-play caller, a colour analyst and a robot
 * co-commentator, voiced from pre-recorded clips (public/voice, made by
 * scripts/voice). This file is the director only: it listens to the fight,
 * decides who says what and when, and hands clips to the audio side. It reads
 * the match and never writes to it.
 *
 * It tries to sound like a live booth rather than a soundboard: replies come in
 * a beat before the last line finishes, a big moment talks over whoever was
 * chatting (they trail off under it instead of being cut dead), and quiet
 * spells fill up with conversation about the fight, the circuit and the gear.
 */

/** A clip: file name in public/voice/c and its length in seconds. */
export type Clip = [file: string, dur: number];

/** p = play-by-play, c = colour, r = the robot. */
export type BoothVoice = 'p' | 'c' | 'r';

export interface VoiceLine {
  id: string;
  /** Trigger (section of the phrase bank). */
  t: string;
  /** Who speaks (who opens, for a conversation). */
  v: BoothVoice;
  /** Energy 1 (calm) .. 4 (screaming). */
  e: number;
  /** Only plays straight after this line (a two-line exchange). */
  r?: string;
  /** Conditions: left/right, ahead/behind, early/late, online/cpu, style matchups. */
  g?: string[];
  /** Takes. */
  f: Clip[];
  /** Turns, when the clip is a whole recorded conversation. */
  n?: number;
}

/** How a bot's name was read: calm, hyped and screamed by the caller, and calmly by the analyst. */
export type NameCut = 'call' | 'hype' | 'scream' | 'ccall';

export interface VoiceManifest {
  v: number;
  lines: VoiceLine[];
  names: Record<string, Partial<Record<NameCut, Clip>>>;
}

/** A line being spoken. */
export interface Speech {
  /** Finished, stopped, or dropped because it couldn't start in time. */
  readonly done: boolean;
  /** Cut it short. */
  stop(): void;
  /** Trail off over this many seconds, as when someone talks over it. */
  fade(secs: number): void;
  /** Seconds of audio still to play (Infinity before it starts). */
  left(): number;
}

/** What the booth needs from the audio side. */
export interface BoothOut {
  /** The clip is downloaded and can start right away. */
  ready(file: string): boolean;
  /** Download these in the background. */
  want(files: string[]): void;
  /** Download and decode these ahead, so they start without a beat of silence. */
  prime?(files: string[]): void;
  /** Plays clips back to back; drops them if they can't start within `within` seconds. */
  speak(clips: { clip: Clip; gap: number }[], energy: number, within: number, voice: BoothVoice): Speech;
}

interface Say {
  /** Triggers to try in order, most specific first. */
  chain: string[];
  prio: number;
  /** The bot the line is about (names, ahead/behind). */
  about?: Fighter | null;
  /** Who should say it. 'c' lets the robot answer instead now and then. */
  voice?: BoothVoice;
  /** Chance of putting the bot's name in front (lines that need a name always get it). */
  name?: number;
  /** A colour line from the same chain afterwards, with this chance. */
  follow?: number;
  /** Generic reply sections tried afterwards (intro.reply, wrap.reply). */
  reply?: { chain: string[]; chance: number };
  /** Arm or leg side that threw it. */
  side?: 'L' | 'R';
  /** A line already picked (bound replies). */
  line?: VoiceLine;
  /** An answer: comes straight in, without waiting for a breath. */
  quick?: boolean;
}

interface Queued {
  say: Say;
  /** Booth time it may start from, and the last moment it's still worth saying. */
  from: number;
  until: number;
  /** Still true when it's time to speak (a count stops mattering once the bot is up). */
  valid?: () => boolean;
}

interface Talking {
  say: Say;
  line: VoiceLine;
  speech: Speech;
  until: number;
  stopped: boolean;
  /** The next speaker has been let in while this one finishes. */
  handed: boolean;
  /** How early the next speaker may come in, in seconds. */
  overlap: number;
}

const HISTORY_KEY = 'bb.booth.heard';
const HISTORY_MAX = 900;
/** Lines per trigger (play-by-play, colour, robot) kept downloaded and ready. The rest get one of each. */
const DECK: Record<string, [number, number, number?]> = {
  'hit.solid': [6, 0],
  'hit.big': [6, 3],
  'hit.jab': [3, 1],
  'hit.straight': [4, 1],
  'hit.hook': [4, 1],
  'hit.uppercut': [3, 1],
  'hit.overhand': [2, 1],
  'hit.body': [4, 2],
  'hit.counter': [4, 2],
  'hit.crit': [3, 2],
  'defence.dodge': [4, 2],
  'defence.block': [3, 1],
  'combo.three': [3, 1],
  'combo.five': [3, 1],
  stagger: [4, 2],
  'knockdown.any': [4, 2],
  'knockdown.first': [3, 1],
  getup: [4, 2],
  'down.count': [2, 2],
  'ropes.pinned': [3, 2],
  'kick.round': [3, 1],
  'kick.low': [3, 2],
  'kick.push': [2, 1],
  'lull.chatter': [2, 4, 2],
  'lull.pair': [2, 2, 1],
  'lull.convo': [3, 2, 1],
  'lull.tournament': [1, 2, 1],
  'lull.gear': [1, 2, 1],
  'lull.fighters': [1, 2, 1],
  'lull.robot': [1, 1, 2],
  'lull.boo': [1, 2],
  'ko.call': [3, 0],
  'finisher.start': [3, 2, 2],
  'finisher.impact': [3, 0, 0],
  'ko.finisher': [2, 2, 1],
  'ko.colour': [0, 3],
  'tko.call': [2, 2],
  'detach.arm': [2, 2],
  'detach.fatal.head': [2, 2],
  'intro.preview': [0, 3],
  'state.dominating': [1, 3],
  'state.close': [1, 2],
  'decision.win': [2, 2],
};

const STYLE_KEY: Record<string, string> = {
  Brawler: 'brawler',
  Swarmer: 'swarmer',
  'Out-fighter': 'outfighter',
  'Counter-puncher': 'counter',
  Boxer: 'boxer',
};
const NAME_TAGS = new Set(['ii', 'x', 'mk-3', 'v', 'zero', '9']);

/** The key a bot's name is stored under: lower case, without a trailing tag like "II". */
export function nameKey(name: string) {
  const w = name.trim().toLowerCase().split(/\s+/);
  if (w.length > 2 && NAME_TAGS.has(w[w.length - 1])) w.pop();
  return w.join(' ');
}

const rnd = Math.random;
const chance = (p: number) => rnd() < p;

export class Booth {
  private out: BoothOut;
  private man: VoiceManifest | null = null;
  private byTrig = new Map<string, VoiceLine[]>();
  /** Bound replies by lead id. */
  private replies = new Map<string, VoiceLine[]>();
  private heard = new Map<string, number>();
  private seq = 0;
  private dirty = 0;
  private t = 0;
  private m: Match | null = null;
  private online = false;
  private used = new Set<string>();
  private cur: Talking | null = null;
  private queue: Queued[] = [];
  private lastEnd = -9;
  /** Until when a question and its answer have the floor (only a knockdown or a finish talks over them). */
  private hold = 0;
  private excite = 0.3;
  // what has happened in this fight
  private sinceLanded = 0;
  private lullSaid = false;
  private landedAny = false;
  private talk = 0;
  private fightT = 0;
  private combo = { who: -1, n: 0, t: -9 };
  private body = [0, 0];
  private kds = [0, 0];
  private worst = [0, 0];
  private once = new Set<string>();
  private nextLook = 0;
  private nextChat = 0;
  private nextRopes = 0;
  private prevClock = 99;
  private intros = 0;
  private lastHit: HitInfo | null = null;
  private koPending: { winner: Fighter; loser: Fighter; kind: string; reason: string | null } | null = null;
  private fatalCalled = false;
  /** The finisher being performed, if any (its id). */
  private fin: string | null = null;
  enabled = true;

  constructor(out: BoothOut) {
    this.out = out;
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[];
      for (const id of h) this.heard.set(id, ++this.seq);
    } catch {
      /* fresh history */
    }
  }

  get loaded() {
    return this.man !== null;
  }

  setManifest(man: VoiceManifest) {
    this.man = man;
    this.byTrig.clear();
    this.replies.clear();
    for (const l of man.lines) {
      if (!l.f.length) continue;
      if (l.r) (this.replies.get(l.r) ?? this.replies.set(l.r, []).get(l.r)!).push(l);
      else (this.byTrig.get(l.t) ?? this.byTrig.set(l.t, []).get(l.t)!).push(l);
    }
    this.restock();
  }

  /**
   * Keeps the freshest few lines of every trigger downloaded, so whatever happens
   * next has something ready to say. Played lines get replaced after each fight.
   */
  private restock() {
    const files: string[] = [];
    for (const [t, lines] of this.byTrig) {
      const [np, nc, nr = 1] = DECK[t] ?? [1, 1, 1];
      for (const [v, n] of [['p', np], ['c', nc], ['r', nr]] as const) {
        if (n <= 0) continue;
        const pool = lines.filter((l) => l.v === v && !this.used.has(l.id));
        pool.sort((a, b) => this.fresh(b) * (0.7 + rnd() * 0.6) - this.fresh(a) * (0.7 + rnd() * 0.6));
        for (const l of pool.slice(0, n)) {
          files.push(l.f[(rnd() * l.f.length) | 0][0]);
          this.thread(l.id, files, 4);
        }
      }
    }
    this.out.want(files);
  }

  /** The replies chained under a line, so a whole exchange is ready to play. */
  private thread(id: string, files: string[], depth: number) {
    if (depth <= 0) return;
    for (const r of this.replies.get(id) ?? []) {
      files.push(r.f[0][0]);
      this.thread(r.id, files, depth - 1);
    }
  }

  /** How much a line wants to be said: lines not heard for a long time win. */
  private fresh(l: VoiceLine) {
    const at = this.heard.get(l.id);
    const age = at === undefined ? 3000 : this.seq - at;
    return Math.pow(Math.min(age, 3000) + 1, 1.6);
  }

  // ------------------------------------------------------------------ match
  begin(m: Match, online: boolean) {
    this.end();
    this.m = m;
    this.online = online;
    this.used.clear();
    this.once.clear();
    this.sinceLanded = 0;
    this.lullSaid = false;
    this.landedAny = false;
    this.talk = 0;
    this.fightT = 0;
    this.combo = { who: -1, n: 0, t: -9 };
    this.body = [0, 0];
    this.kds = [0, 0];
    this.worst = [0, 0];
    this.nextLook = 0;
    this.nextChat = 0;
    this.nextRopes = 0;
    this.prevClock = m.clock;
    this.intros = 0;
    this.lastHit = null;
    this.koPending = null;
    this.fatalCalled = false;
    this.fin = null;
    this.hold = 0;
    const names: string[] = [];
    for (const f of m.fighters) {
      const n = this.names(f);
      if (n) for (const c of Object.values(n)) names.push(c[0]);
    }
    if (this.out.prime) this.out.prime(names);
    else this.out.want(names);
    if (!this.enabled) return;
    this.push(
      {
        chain: ['intro.welcome'],
        prio: 50,
        voice: 'p',
        reply: online && chance(0.6) ? { chain: ['intro.online'], chance: 0.9 } : chance(0.2) ? { chain: ['intro.sponsor'], chance: 0.8 } : { chain: ['intro.reply'], chance: 0.85 },
      },
      0.15,
      2,
    );
  }

  /** The fight is over and its screen is gone: stop talking. */
  end() {
    if (this.cur) this.cut();
    this.queue.length = 0;
    if (this.m) this.restock();
    this.m = null;
    this.save();
  }

  // ------------------------------------------------------------------ events
  event(type: string, data: unknown) {
    const m = this.m;
    if (!m || !this.man || !this.enabled) return;
    switch (type) {
      case 'phase':
        if (data === 'countdown') {
          // the crowd counts it down: the booth lets them
          if (this.cur) this.cut();
          this.queue.length = 0;
          this.hold = 0;
        } else if (data === 'greet') this.push({ chain: ['countdown.start'], prio: 40, voice: 'p' }, 1.4, 2);
        break;
      case 'fightStart':
        this.say({ chain: ['fight.start'], prio: 80, voice: 'p' }, 0.3);
        break;
      case 'hit':
        this.onHit(data as HitInfo);
        break;
      case 'finisher': {
        // the booth goes up for it: the caller names the move over whatever was being
        // said, colour or the robot jumps in on top, and nothing else gets a word in
        // until it's over
        const d = data as { f: Fighter; id: string };
        this.fin = d.id;
        this.queue.length = 0;
        if (this.cur) this.cut('p');
        this.say({ chain: [`finisher.${d.id}`, 'finisher.start', 'hit.big'], prio: 90, voice: 'p', about: d.f, name: 0.45, follow: 0.9 }, 0.6);
        break;
      }
      case 'finisherBlow': {
        // the last blow: a scream on impact, and the knockout call names it once they land
        // (Headhunter's is called off the head coming off, just before this)
        const d = data as { f: Fighter; id: string };
        if (this.fatalCalled) break;
        this.say({ chain: [`finisher.impact.${d.id}`, 'finisher.impact', 'hit.crit'], prio: 100, voice: 'p' }, 0.4);
        break;
      }
      case 'knockdown':
        this.onKnockdown(data as HitInfo);
        break;
      case 'stagger': {
        const h = data as HitInfo;
        if (m.phase !== 'fight') break;
        if (h.blocked) this.say({ chain: ['defence.guardbreak'], prio: 55, voice: 'p', follow: 0.4 }, 0.3);
        else this.say({ chain: ['stagger'], prio: 72, voice: 'p', follow: 0.5, about: h.defender }, 0.3);
        break;
      }
      case 'getUp': {
        const f = (data as { f: Fighter }).f;
        if (f.state === 'ko' || m.phase !== 'fight') break;
        this.say({ chain: f.knockdowns >= 2 ? ['getup.last', 'getup'] : ['getup'], prio: 60, voice: 'p', about: f, name: 0.4, follow: 0.4 }, 0.5);
        break;
      }
      case 'detach': {
        const d = data as DetachInfo;
        if (d.fatal) {
          this.fatalCalled = true;
          const fin = !!this.fin;
          this.say({ chain: [...(fin ? [`finisher.impact.${this.fin}`] : []), `detach.fatal.${d.fatal}`], prio: 100, voice: 'p', about: d.f }, 0.3);
          this.push({ chain: [...(fin ? ['ko.finisher'] : []), `detach.fatal.${d.fatal}`, 'ko.colour'], prio: 96, voice: 'c' }, 0.2, 6);
        } else {
          const arm = d.part === P.UpL || d.part === P.UpR || d.part === P.ForeL || d.part === P.ForeR;
          this.say({ chain: [arm ? 'detach.arm' : 'detach.leg', 'detach.arm'], prio: 85, voice: 'p', follow: 0.7, about: d.f }, 0.3);
        }
        break;
      }
      case 'wear':
        this.onWear(data as WearInfo);
        break;
      case 'ropes': {
        const d = data as { f: Fighter };
        if (m.phase !== 'fight' || this.t < this.nextRopes || !chance(0.3)) break;
        this.nextRopes = this.t + 10;
        this.say({ chain: ['ropes.pinned'], prio: 28, about: d.f }, 0.5);
        break;
      }
      case 'dodge': {
        const d = data as { f: Fighter; s: { move: { ability?: string } } };
        if (m.phase !== 'fight') break;
        if (d.s.move.ability) this.say({ chain: ['defence.dodge.special', 'defence.dodge'], prio: 45, voice: 'p', about: d.f, name: 0.3, follow: 0.5 }, 0.3);
        else if (chance(0.28)) this.say({ chain: ['defence.dodge'], prio: 28, voice: 'p', about: d.f, name: 0.2, follow: 0.12 }, 0.3);
        break;
      }
      case 'whiff': {
        const d = data as { f: Fighter; s: { move: { ability?: string; power: boolean; id: string } } };
        if (m.phase !== 'fight') break;
        if (d.s.move.ability && chance(0.75)) this.say({ chain: ['special.whiff'], prio: 35, about: d.f }, 0.4);
        else if (d.s.move.power && chance(0.12)) this.say({ chain: ['miss.whiff'], prio: 18, about: d.f }, 0.4);
        break;
      }
      case 'brain': {
        const e = data as BrainEvent;
        if (m.phase !== 'fight' || !e.f) break;
        const t = { switch: 'brain.switch', retreat: 'brain.retreat', rally: 'brain.rally', read: 'brain.read', adapt: 'brain.furious', taunt: 'taunt' }[e.kind];
        const p = e.kind === 'rally' ? 42 : e.kind === 'taunt' ? 40 : 30;
        if (t && chance(e.kind === 'taunt' ? 0.75 : 0.5)) this.say({ chain: [t], prio: p, about: e.f, name: 0.5 }, 0.8);
        break;
      }
      case 'ko':
        // the finishing hit is reported right after this, so the call waits for it
        this.koPending = data as Booth['koPending'];
        break;
      case 'decision': {
        const d = data as { winner: Fighter | null };
        this.say({ chain: ['decision.time'], prio: 100, voice: 'p' }, 0.3);
        if (!d.winner) this.push({ chain: ['decision.draw'], prio: 96 }, 0.2, 8);
        else {
          const [a, b] = m.fighters;
          const close = Math.abs(a.hpRatio - b.hpRatio) < 0.1;
          this.winner(d.winner);
          this.push({ chain: close ? ['decision.close', 'decision.win'] : ['decision.win'], prio: 94 }, 0.2, 10);
        }
        break;
      }
      case 'emote': {
        const d = data as { f: Fighter };
        if ((m.phase === 'ko' || m.phase === 'end') && d.f === m.winner && !this.once.has('celebrate')) {
          this.once.add('celebrate');
          if (chance(0.6)) this.push({ chain: ['win.celebrate'], prio: 30, about: d.f, name: 0.3 }, 0.5, 6);
        }
        break;
      }
      case 'end':
        this.push({ chain: ['wrap'], prio: 90, voice: 'p', reply: { chain: ['wrap.reply'], chance: 0.85 } }, 1.8, 8);
        break;
    }
  }

  private onHit(h: HitInfo) {
    const m = this.m!;
    if (this.koPending) {
      this.finish(h);
      return;
    }
    this.lastHit = h;
    if (h.finisher) return;
    const a = h.attacker;
    if (!h.blocked && !h.shielded) {
      this.sinceLanded = 0;
      this.lullSaid = false;
      this.landedAny = true;
      if (h.zone === 'body') this.body[a.index]++;
      if (a.index === this.combo.who && this.t - this.combo.t < 1.6) this.combo.n++;
      else this.combo = { who: a.index, n: 1, t: this.t };
      this.combo.t = this.t;
    }
    if (m.phase !== 'fight' || h.knockdown || h.stagger) return;
    if (h.shielded) {
      if (chance(0.35)) this.say({ chain: ['defence.shield'], prio: 25, about: h.defender }, 0.3);
      return;
    }
    const kick = h.move.kind === 'kick';
    if (h.blocked) {
      if (h.guardBreak) this.say({ chain: ['defence.guardbreak'], prio: 55, voice: 'p', follow: 0.4 }, 0.3);
      else if (kick && chance(0.25)) this.say({ chain: ['kick.blocked', 'defence.block'], prio: 24, about: h.defender }, 0.3);
      else if (chance(0.1)) this.say({ chain: ['defence.block'], prio: 20, about: h.defender }, 0.3);
      return;
    }
    if (m.clock < 5 && !this.once.has('final')) {
      this.once.add('final');
      this.say({ chain: ['clock.final'], prio: 64, voice: 'p' }, 0.3);
      return;
    }
    if (this.combo.n === 3 && chance(0.7)) {
      this.say({ chain: ['combo.three'], prio: 55, voice: 'p', about: a, name: 0.3, follow: 0.3 }, 0.3);
      return;
    }
    if (this.combo.n === 5 || this.combo.n === 8) {
      this.say({ chain: ['combo.five'], prio: 66, voice: 'p', about: a, follow: 0.5 }, 0.3);
      return;
    }
    const id = h.move.id;
    const heavy = h.heavy || h.damage >= 55;
    const special = SPECIAL[id];
    // most specific call first; how likely a call is, and how much it matters, follows the best reason
    const chain: string[] = [];
    let prio = 0;
    let p = 0;
    let follow = 0;
    const add = (t: string, pr: number, ch: number, fo: number) => {
      chain.push(t);
      prio = Math.max(prio, pr);
      p = Math.max(p, ch);
      follow = Math.max(follow, fo);
    };
    if (h.crit) add('hit.crit', 60, 0.8, 0.5);
    if (h.counter) add('hit.counter', 55, 0.7, 0.5);
    if (heavy && chance(0.5)) add('hit.big', 62, 0.9, 0.45);
    if (special) add(special, 58, 0.85, 0.45);
    else if (KICK[id]) add(KICK[id], 45, 0.55, 0.25);
    else if (id === 'jab') add('hit.jab', 25, 0.15, 0.1);
    else {
      if (h.zone === 'body' && chance(0.5)) add('hit.body', 38, 0.45, 0.2);
      if (PUNCH[id]) add(PUNCH[id], 38, 0.4, 0.12);
    }
    if (heavy) add('hit.big', 62, 0.9, 0.45);
    if (id !== 'jab') add('hit.solid', 35, 0.35, 0.12);
    if (!chance(p)) return;
    const side = h.move.limb === 'lead' ? a.leadSide : a.rearSide;
    this.say({ chain, prio, voice: 'p', about: a, name: 0.3, follow, side }, 0.25);
  }

  private onKnockdown(h: HitInfo) {
    const m = this.m!;
    const d = h.defender;
    if (m.phase !== 'fight' || d.state === 'ko') return;
    const counted = d.knockdowns > this.kds[d.index];
    this.kds[d.index] = d.knockdowns;
    if (!counted) {
      this.say({ chain: ['knockdown.sweep'], prio: 60, voice: 'p', follow: 0.4 }, 0.3);
      return;
    }
    const chain: string[] = [];
    if (h.move.kind === 'kick' && chance(0.5)) chain.push('knockdown.kick');
    if (h.counter && chance(0.6)) chain.push('knockdown.counter');
    if (d.knockdowns === 2) chain.push('knockdown.second');
    if (m.fighters[0].knockdowns + m.fighters[1].knockdowns === 1) chain.push('knockdown.first');
    chain.push('knockdown.any');
    this.say({ chain, prio: 90, voice: 'p', follow: 0.6 }, 0.3);
    this.push({ chain: ['down.count'], prio: 45 }, 2.4, 1.6, () => d.state === 'down');
  }

  private onWear(w: WearInfo) {
    if (this.m!.phase !== 'fight') return;
    if (w.level === 0) {
      if (chance(0.3)) this.say({ chain: ['wear.dented'], prio: 22, voice: 'c', about: w.f }, 1);
      return;
    }
    if (w.level === 2) {
      if ((w.part === P.FistL || w.part === P.FistR || w.part === P.FootL || w.part === P.FootR) && chance(0.7))
        this.say({ chain: ['wear.wrecked'], prio: 40, about: w.f, name: 0.4 }, 0.8);
      return;
    }
    const t =
      w.part === P.Head ? 'wear.head'
      : w.part === P.Chest ? 'wear.chest'
      : w.part === P.Torso ? 'wear.torso'
      : w.part >= P.ThighL ? 'wear.leg'
      : 'wear.arm';
    if (chance(0.85)) this.say({ chain: [t], prio: w.part === P.Head ? 58 : 50, about: w.f, name: 0.5, follow: 0.5 }, 0.8);
  }

  /** The finishing call, once the hit that ended it is known. */
  private finish(h: HitInfo | null) {
    const k = this.koPending!;
    this.koPending = null;
    const m = this.m!;
    if (k.kind === 'Dismantled') {
      if (!this.fatalCalled) {
        this.say({ chain: [`detach.fatal.${k.reason}`, 'ko.call'], prio: 100, voice: 'p' }, 0.3);
        this.push({ chain: [`detach.fatal.${k.reason}`, 'ko.colour'], prio: 96, voice: 'c' }, 0.2, 6);
      }
    } else if (k.kind === 'TKO') {
      this.say({ chain: ['tko.call'], prio: 100, voice: 'p' }, 0.3);
      this.push({ chain: ['tko.call', 'ko.colour'], prio: 96, voice: 'c' }, 0.2, 6);
    } else {
      const chain: string[] = [];
      const ft = this.fightT;
      // a finisher's knockout is called for what it was; the usual calls back it up
      if (this.fin) chain.push(`ko.finisher.${this.fin}`, 'ko.finisher');
      if (h && h.move.kind === 'kick' && chance(0.5)) chain.push('ko.kick');
      if (h && h.counter && chance(0.6)) chain.push('ko.counter');
      if (m.clock <= 10 && chance(0.6)) chain.push('ko.late');
      if (ft < 20 && chance(0.6)) chain.push('ko.early');
      if (this.worst[k.winner.index] < -0.25 && chance(0.7)) chain.push('ko.comeback');
      chain.push('ko.call');
      // after a finisher the impact scream may still be ringing out: the call waits for it
      this.say({ chain, prio: 100, voice: 'p' }, this.fin ? 2.5 : 0.3);
      // the specific pools hold colour lines too; the general reaction is the fallback
      this.push({ chain: [...chain.filter((c) => c !== 'ko.call'), 'ko.colour'], prio: 96, voice: 'c' }, 0.2, 6);
    }
    this.winner(k.winner);
  }

  /** "And the winner is..." plus the winner's name, if we have it. */
  private winner(f: Fighter) {
    const n = this.names(f);
    if (!n?.scream) return;
    this.push({ chain: ['name.win'], prio: 95, voice: 'p', about: f, name: 1 }, 0.4, 12);
  }

  // ------------------------------------------------------------------ tick
  tick(dt: number, excite: number, live: boolean) {
    this.t += dt;
    this.excite = excite;
    const m = this.m;
    if (this.koPending && m) this.finish(this.lastHit);
    const c = this.cur;
    if (c) {
      if (m?.phase === 'fight') this.talk += dt;
      if (c.speech.done || this.t > c.until) this.finished();
      // nearly done: let the next voice in now, the way people answer before the
      // last word has quite landed; this line plays out underneath
      else if (!c.handed && c.speech.left() <= c.overlap) this.handOff(c);
    }
    if (!m || !this.man || !this.enabled) return;
    if (live && m.phase === 'fight') {
      this.fightT += dt;
      this.sinceLanded += dt;
      this.watch(m);
    }
    this.drain();
  }

  private finished() {
    const c = this.cur!;
    this.cur = null;
    this.lastEnd = this.t;
    if (!c.stopped && !c.handed) this.answer(c, 0.12);
  }

  /** The next voice comes in over the end of this line, which keeps playing on its own. */
  private handOff(c: Talking) {
    c.handed = true;
    this.cur = null;
    const left = c.speech.left();
    this.lastEnd = this.t + left;
    this.answer(c, 0, left);
  }

  /** Whoever answers a line that has just finished (or is finishing). */
  private answer(c: Talking, after: number, left = 0) {
    if (!this.reply(c, after, left)) this.hold = Math.min(this.hold, this.t + left);
  }

  private reply(c: Talking, after: number, left: number): boolean {
    // a line from the same voice waits for the last one to end; another voice can overlap it
    const when = (v: BoothVoice | undefined) => (v === c.line.v ? left + 0.15 : after);
    const bound = this.replies.get(c.line.id);
    if (bound?.length) {
      const line = bound[(rnd() * bound.length) | 0];
      this.push({ chain: [], line, prio: c.say.prio - 1, quick: true }, when(line.v), 2.5);
    } else if (c.say.reply && chance(c.say.reply.chance)) {
      this.push({ chain: c.say.reply.chain, prio: c.say.prio - 1, voice: 'c', quick: true }, when('c'), 2.5);
    } else if (c.say.follow && c.line.v === 'p' && chance(c.say.follow)) {
      // colour usually; the robot chips in with a reading now and then
      const v: BoothVoice = chance(0.3) && this.has(c.say.chain, 'r') ? 'r' : 'c';
      this.push({ chain: c.say.chain, prio: c.say.prio - 8, voice: v, about: c.say.about, side: c.say.side, quick: true }, when(v) + 0.1, 2);
    } else return false;
    return true;
  }

  /**
   * Waits its turn: someone is answering a question, or a finisher is being called,
   * and this is no knockdown or finish.
   */
  private held(s: Say) {
    return (this.t < this.hold || !!this.m?.fin) && !s.quick && s.prio < 90;
  }

  /** Still talking, or about to: the opening waits for this before the countdown. */
  get busy() {
    return !!this.cur || this.t < this.hold || this.queue.some((q) => q.until >= this.t);
  }

  /** Any line from this voice in these triggers. */
  private has(chain: string[], v: BoothVoice) {
    return chain.some((t) => this.byTrig.get(t)?.some((l) => l.v === v));
  }

  /** Clock calls, the scoreboard, and filling quiet moments. */
  private watch(m: Match) {
    const [a, b] = m.fighters;
    const pc = this.prevClock;
    this.prevClock = m.clock;
    if (pc > 60 && m.clock <= 60) this.say({ chain: ['clock.60'], prio: 38 }, 1.5);
    if (pc > 30 && m.clock <= 30) {
      const lead = a.hpRatio >= b.hpRatio ? a : b;
      this.say({ chain: ['clock.30'], prio: 48, about: chance(0.5) ? lead : lead.opp }, 1.5);
    }
    if (pc > 10 && m.clock <= 10) this.say({ chain: ['clock.10'], prio: 66, voice: 'p' }, 0.6);
    if (this.fightT > 20) {
      for (const f of m.fighters) this.worst[f.index] = Math.min(this.worst[f.index], f.hpRatio - f.opp.hpRatio);
    }
    if (this.sinceLanded > 7 && !this.lullSaid) {
      this.lullSaid = true;
      if (chance(0.7)) this.say({ chain: ['lull.boo'], prio: 25 }, 1.5);
    }
    if (this.cur || this.queue.length || this.t - this.lastEnd < 1.2) return;
    if (this.t >= this.nextLook && this.t - this.lastEnd > 2.2) {
      this.nextLook = this.t + 5 + rnd() * 4;
      const s = this.look(m);
      if (s) {
        this.say(s, 1);
        return;
      }
    }
    // a quiet spell: talk about the fight, the circuit, the gear, anything; a live
    // booth is rarely silent for long, and a big moment just talks over it
    if (this.sinceLanded > 1.5 && this.t - this.lastEnd > 1.6 + rnd() * 1.4 && this.t >= this.nextChat && this.talk < this.fightT * 0.8) {
      this.nextChat = this.t + 2.5 + rnd() * 2.5;
      this.say({ chain: [chat(), 'lull.chatter'], prio: 10 }, 1);
    }
  }

  /** Something worth pointing out about the state of the fight, if anything. */
  private look(m: Match): Say | null {
    const ft = this.fightT;
    const [a, b] = m.fighters;
    const first = (key: string) => (this.once.has(key) ? false : (this.once.add(key), true));
    // early: the matchup and what the bots are about
    if (ft < 25 && this.intros < 2) {
      const opts: Say[] = [];
      for (const f of m.fighters) {
        const style = STYLE_KEY[m.brains[f.index].traits.style];
        if (style && this.names(f) && !this.once.has(`style${f.index}`)) opts.push({ chain: [`intro.style.${style}`], prio: 15, voice: 'c', about: f, name: 1 });
      }
      if (!this.once.has('matchup')) opts.push({ chain: ['intro.matchup'], prio: 15, voice: 'c' });
      if (!this.once.has('preview') && ft < 12) opts.push({ chain: ['intro.preview'], prio: 15, voice: 'c' });
      if (!this.landedAny && ft < 8 && !this.once.has('opening')) opts.push({ chain: ['fight.opening'], prio: 15 });
      if (opts.length && chance(0.8)) {
        const s = opts[(rnd() * opts.length) | 0];
        this.intros++;
        this.once.add(s.chain[0] === 'intro.matchup' ? 'matchup' : s.chain[0] === 'intro.preview' ? 'preview' : s.chain[0] === 'fight.opening' ? 'opening' : `style${s.about!.index}`);
        return s;
      }
    }
    for (const f of m.fighters) {
      if (f.hpRatio < 0.2 && first(`low${f.index}`)) return { chain: ['state.lowhp'], prio: 30, about: f, name: 0.6 };
    }
    if (a.hpRatio < 0.35 && b.hpRatio < 0.35 && first('bothhurt')) return { chain: ['state.bothhurt'], prio: 30 };
    for (const f of m.fighters) {
      if (this.worst[f.index] < -0.25 && f.hpRatio >= f.opp.hpRatio && first(`comeback${f.index}`)) return { chain: ['state.comeback'], prio: 35, about: f, name: 0.7 };
    }
    for (const f of m.fighters) {
      if (this.body[f.index] >= 8 && first(`body${f.index}`)) return { chain: ['state.bodywork'], prio: 20, voice: 'c', about: f, name: 0.5 };
      if (f.staminaRatio < 0.2 && ft > 30 && first(`tired${f.index}`)) return { chain: ['state.tired'], prio: 20, voice: 'c', about: f, name: 0.6 };
      const legs = Math.min(f.parts.cond[P.ThighL] + f.parts.cond[P.ShinL], f.parts.cond[P.ThighR] + f.parts.cond[P.ShinR]) / 2;
      if (legs < 0.5 && first(`legs${f.index}`)) return { chain: ['state.legwork'], prio: 20, voice: 'c', about: f, name: 0.6 };
    }
    if (ft > 25) {
      const lead = a.hpRatio >= b.hpRatio ? a : b;
      const r = lead.hpRatio / Math.max(0.01, lead.opp.hpRatio);
      if (r > 2 && !this.once.has(`dom${Math.floor(ft / 25)}`)) {
        this.once.add(`dom${Math.floor(ft / 25)}`);
        return { chain: ['state.dominating'], prio: 20, voice: chance(0.8) ? 'c' : undefined, about: chance(0.7) ? lead : lead.opp, name: 0.6 };
      }
      if (Math.abs(a.hpRatio - b.hpRatio) < 0.1 && !this.once.has(`close${Math.floor(ft / 30)}`)) {
        this.once.add(`close${Math.floor(ft / 30)}`);
        return { chain: ['state.close'], prio: 20 };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ speaking
  /** Says it now if it's important enough, otherwise waits up to `wait` seconds for a gap. */
  private say(s: Say, wait: number) {
    const c = this.cur;
    if (!c && !this.held(s) && this.t - this.lastEnd >= breath(s) && !this.queue.some((q) => q.say.prio > s.prio && q.from <= this.t)) {
      if (this.start(s)) return;
    }
    if (c && !this.held(s) && overrides(s, c)) {
      this.cut(s.voice);
      if (this.start(s)) return;
    }
    this.push(s, 0, wait);
  }

  private push(s: Say, after: number, wait: number, valid?: () => boolean) {
    const from = this.t + after;
    this.queue.push({ say: s, from, until: from + wait, valid });
    // keep the queue short: a reaction that waits behind three others is stale anyway
    if (this.queue.length > 6) {
      this.queue.sort((x, y) => y.say.prio - x.say.prio);
      this.queue.length = 6;
    }
  }

  private drain() {
    if (!this.queue.length) return;
    this.queue = this.queue.filter((q) => q.until >= this.t && (!q.valid || q.valid()));
    let best: Queued | null = null;
    for (const q of this.queue) if (q.from <= this.t && !this.held(q.say) && (!best || q.say.prio > best.say.prio)) best = q;
    if (!best) return;
    const c = this.cur;
    if (c) {
      if (overrides(best.say, c)) this.cut(best.say.voice ?? best.say.line?.v);
      else return;
    } else if (this.t - this.lastEnd < breath(best.say)) return;
    this.queue.splice(this.queue.indexOf(best), 1);
    // a line with nothing ready to say is dropped, and the next one gets its turn
    if (!this.start(best.say)) this.drain();
  }

  /**
   * Stops the current line for something bigger. Talked over by someone else, it
   * trails off underneath (longer for a conversation); a voice cutting itself off
   * just stops.
   */
  private cut(next?: BoothVoice) {
    const c = this.cur!;
    c.stopped = true;
    if (next && next === c.line.v && !c.line.n) c.speech.stop();
    else c.speech.fade(c.line.n ? 1.4 : 0.8);
    this.cur = null;
    this.lastEnd = this.t;
  }

  private start(s: Say): boolean {
    const line = s.line ?? this.pick(s);
    if (!line) return false;
    const takes = line.f.filter((f) => this.out.ready(f[0]));
    if (!takes.length) return false;
    const clip = takes[(rnd() * takes.length) | 0];
    const clips: { clip: Clip; gap: number }[] = [];
    const about = s.about ?? null;
    const needName = needsName(s, line);
    if (about && line.v !== 'r' && (needName || chance(s.name ?? 0))) {
      const n = this.names(about);
      const cut: NameCut = line.v === 'c' ? 'ccall' : s.chain[0] === 'name.win' || line.e >= 4 ? 'scream' : line.e === 3 ? 'hype' : 'call';
      const nc = n?.[cut];
      if (nc && this.out.ready(nc[0])) {
        // the winner's name comes after "And the winner is...", everything else leads with it
        if (s.chain[0] === 'name.win') clips.push({ clip, gap: 0.35 }, { clip: nc, gap: 0 });
        else clips.push({ clip: nc, gap: line.v === 'c' ? 0.22 : 0.08 }, { clip, gap: 0 });
      } else if (needName) return false;
    }
    if (!clips.length) clips.push({ clip, gap: 0 });
    const dur = clips.reduce((t, c) => t + c.clip[1] + c.gap, 0);
    const within = s.prio >= 40 ? 0.25 : 0.6;
    const speech = this.out.speak(clips, line.e, within, line.v);
    // the answer gets decoded while this line plays, so it lands right on the hand-off
    const answers = this.replies.get(line.id);
    if (answers?.length) this.out.prime?.(answers.flatMap((r) => {
        const got = r.f.filter((f) => this.out.ready(f[0]));
        return (got.length ? got : r.f.slice(0, 1)).map((f) => f[0]);
      }));
    // big calls jump in hard on the end of the last line; chat leaves a natural beat
    const overlap = line.n ? 0.2 : line.e >= 3 ? 0.3 + rnd() * 0.25 : 0.1 + rnd() * 0.3;
    this.cur = { say: s, line, speech, until: this.t + within + dur + 0.25, stopped: false, handed: false, overlap };
    // a line someone answers keeps the floor until the answer is over
    if (!s.quick && this.t < this.hold) this.queue = this.queue.filter((q) => !q.say.quick);
    this.hold = this.replies.get(line.id)?.length || s.reply ? this.t + within + dur + 2.5 : s.quick ? this.t + within + dur : 0;
    this.used.add(line.id);
    this.heard.set(line.id, ++this.seq);
    if (++this.dirty >= 12) this.save();
    return true;
  }

  /** The freshest line that fits, from the first trigger in the chain that has one ready. */
  private pick(s: Say): VoiceLine | null {
    const m = this.m;
    for (const t of s.chain) {
      const pool = this.byTrig.get(t);
      if (!pool) continue;
      let sum = 0;
      const ok: [VoiceLine, number][] = [];
      for (const l of pool) {
        if (this.used.has(l.id)) continue;
        // asked for the analyst, the robot may take it instead
        if (s.voice && l.v !== s.voice && !(s.voice === 'c' && l.v === 'r')) continue;
        if (l.v === 'r' && needsName(s, l)) continue;
        if (l.g && m && !this.fits(l.g, s)) continue;
        if (!l.f.some((f) => this.out.ready(f[0]))) continue;
        const fit = 1 / (1 + Math.abs(l.e - (1 + this.excite * 3)) * 0.35);
        const w = this.fresh(l) * fit * (s.voice === 'c' && l.v === 'r' ? 0.45 : 1);
        ok.push([l, w]);
        sum += w;
      }
      if (!ok.length) {
        // nothing downloaded for this one yet: fetch some for next time
        this.out.want(pool.filter((l) => !this.used.has(l.id)).slice(0, 2).map((l) => l.f[0][0]));
        continue;
      }
      let r = rnd() * sum;
      for (const [l, w] of ok) if ((r -= w) <= 0) return l;
      return ok[ok.length - 1][0];
    }
    return null;
  }

  private fits(tags: string[], s: Say) {
    const m = this.m!;
    const about = s.about;
    for (const g of tags) {
      switch (g) {
        case 'left':
        case 'right':
          if (s.side !== (g === 'left' ? 'L' : 'R')) return false;
          break;
        case 'ahead':
        case 'behind': {
          if (!about || !this.names(about)) return false;
          const ahead = about.hpRatio >= about.opp.hpRatio;
          if (ahead !== (g === 'ahead')) return false;
          break;
        }
        case 'early':
          if (this.fightT > 30) return false;
          break;
        case 'late':
          if (m.clock > 30) return false;
          break;
        case 'online':
          if (!this.online) return false;
          break;
        case 'cpu':
          if (this.online) return false;
          break;
        case 'any':
        case 'once':
          break;
        default: {
          // style matchups: "brawler-vs-outfighter", "boxer-vs-any", "same-style"
          const sa = STYLE_KEY[m.brains[0].traits.style];
          const sb = STYLE_KEY[m.brains[1].traits.style];
          if (g === 'same-style') {
            if (sa !== sb) return false;
            break;
          }
          const [x, y] = g.split('-vs-');
          if (!y) break;
          if (y === 'any') {
            if (sa !== x && sb !== x) return false;
          } else if (!((sa === x && sb === y) || (sa === y && sb === x))) return false;
        }
      }
    }
    return true;
  }

  private names(f: Fighter) {
    return this.man?.names[nameKey(f.name)] ?? null;
  }

  private save() {
    this.dirty = 0;
    try {
      const ids = [...this.heard.entries()].sort((a, b) => a[1] - b[1]).slice(-HISTORY_MAX).map((e) => e[0]);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(ids));
    } catch {
      /* private mode */
    }
  }
}

/** Seconds of silence a line needs after the last one: big moments and answers don't wait. */
const breath = (s: Say) => (s.quick || s.prio >= 60 ? 0.05 : s.prio >= 40 ? 0.25 : 0.7);

/**
 * Whether a new line talks over the current one. Someone else jumping in on a
 * big moment needs less of a reason than a voice interrupting itself, and
 * nobody talks over the finish.
 */
function overrides(s: Say, c: Talking) {
  if (s.prio < 40) return false;
  const v = s.voice ?? s.line?.v;
  return s.prio >= c.say.prio + (v && v !== c.line.v ? 10 : 15);
}

/** Lines that only make sense after a bot's name clip. */
function needsName(s: Say, l: VoiceLine) {
  return !!s.chain[0]?.startsWith('intro.style') || s.chain[0] === 'name.win' || !!l.g?.some((g) => g === 'ahead' || g === 'behind');
}

/** What the booth talks about in a quiet spell. */
function chat() {
  const r = rnd();
  return r < 0.26 ? 'lull.convo'
    : r < 0.42 ? 'lull.chatter'
    : r < 0.54 ? 'lull.pair'
    : r < 0.66 ? 'lull.tournament'
    : r < 0.78 ? 'lull.gear'
    : r < 0.9 ? 'lull.fighters'
    : 'lull.robot';
}

const SPECIAL: Record<string, string> = {
  flurry: 'special.flurry',
  shockUpper: 'special.shock',
  rocketPunch: 'special.rocket',
  hammer: 'special.hammer',
};
const KICK: Record<string, string> = {
  pushKick: 'kick.push',
  roundhouse: 'kick.round',
  lowKick: 'kick.low',
  spinKick: 'kick.spin',
  flyingKnee: 'kick.knee',
  sweep: 'kick.sweep',
};
const PUNCH: Record<string, string> = {
  cross: 'hit.straight',
  leadHook: 'hit.hook',
  rearHook: 'hit.hook',
  leadUpper: 'hit.uppercut',
  rearUpper: 'hit.uppercut',
  haymaker: 'hit.overhand',
};
