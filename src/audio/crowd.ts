import { applause, CROWD_RATE, murmur, reaction, roar, type CrowdRender, type Reaction } from './crowdSynth';

/** What the crowd needs to know about the fight each frame. */
export interface CrowdState {
  phase: 'intro' | 'countdown' | 'fight' | 'ko' | 'end';
  clock: number;
  hp: [number, number];
}

export interface CrowdLevels {
  murmur: number;
  roar: number;
  applause: number;
  /** 0 muffled .. 1 bright. */
  bright: number;
}

export interface CrowdCue {
  kind: Reaction | 'whistle';
  gain: number;
  delay: number;
}

interface HitLike {
  attacker: { index: number };
  blocked: boolean;
  shielded: boolean;
  guardBreak: boolean;
  damage: number;
  crit: boolean;
  counter: boolean;
  knockdown: boolean;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The crowd's mood: an excitement level pushed up by what happens in the fight
 * (big shots, combos, knockdowns, a close finish) and relaxing back to a floor
 * that itself rises with the tension. It also decides the one-off reactions:
 * gasps, cheers, boos when nothing happens, whistles and applause.
 * Pure logic, so it can be tested without audio.
 */
export class CrowdMood {
  excite = 0.2;
  cues: CrowdCue[] = [];
  private hold = 0;
  private applause = 0;
  private applauseHold = 0;
  private sinceLanded = 0;
  private lull = false;
  private combo = { who: -1, n: 0, t: -9 };
  private t = 0;
  private cool: Record<string, number> = {};

  private bump(x: number) {
    this.excite = Math.min(1, this.excite + x * (1 - this.excite * 0.5));
  }

  private cue(kind: CrowdCue['kind'], gain: number, delay = 0, cooldown = 1.2) {
    if ((this.cool[kind] ?? 0) > this.t) return;
    this.cool[kind] = this.t + cooldown;
    this.cues.push({ kind, gain, delay });
  }

  private clap(level: number, hold: number) {
    this.applause = Math.max(this.applause, level);
    this.applauseHold = Math.max(this.applauseHold, hold);
  }

  event(type: string, data?: unknown) {
    switch (type) {
      case 'fightStart':
        this.bump(0.5);
        this.cue('cheer', 0.5);
        break;
      case 'hit': {
        const h = data as HitLike;
        if (h.shielded) {
          this.bump(0.04);
          break;
        }
        if (h.blocked) {
          this.bump(h.guardBreak ? 0.2 : 0.03);
          if (h.guardBreak) this.cue('ooh', 0.45);
          break;
        }
        const k = Math.min(1, h.damage / 100);
        this.bump(0.05 + 0.3 * k);
        this.sinceLanded = 0;
        this.lull = false;
        // combos: the same fighter landing again and again
        if (h.attacker.index === this.combo.who && this.t - this.combo.t < 1.6) this.combo.n++;
        else this.combo = { who: h.attacker.index, n: 1, t: this.t };
        this.combo.t = this.t;
        if (this.combo.n === 3) {
          this.bump(0.15);
          this.cue('whistle', 0.5, 0.15, 2);
        } else if (this.combo.n >= 4) this.cue('cheer', 0.35, 0.05, 2.5);
        if (!h.knockdown && (k >= 0.55 || h.crit)) this.cue('ooh', 0.5 + 0.4 * k, 0.04);
        else if (!h.knockdown && h.counter && k > 0.3) this.cue('ooh', 0.4, 0.04);
        break;
      }
      case 'knockdown':
        this.excite = 1;
        this.hold = 1.5;
        this.cue('cheer', 0.9, 0.05, 0.5);
        this.cue('whistle', 0.5, 0.5, 0.5);
        break;
      case 'detach':
        // a part torn clean off: the house comes up out of its seats
        this.excite = 1;
        this.hold = Math.max(this.hold, 1.8);
        this.cue('ooh', 0.9, 0);
        this.cue('cheer', 0.85, 0.25, 0.5);
        break;
      case 'finisher':
        // everyone knows what's coming
        this.excite = 1;
        this.hold = Math.max(this.hold, 3);
        this.cue('ooh', 0.85, 0);
        this.cue('cheer', 0.8, 0.35, 0.5);
        break;
      case 'stagger':
        this.bump(0.2);
        this.cue('ooh', 0.45, 0.05);
        break;
      case 'dodge':
        this.bump(0.04);
        if (Math.random() < 0.15) this.cue('ooh', 0.22, 0.05, 3);
        break;
      case 'ropes':
        this.bump(0.06);
        break;
      case 'getUp':
        this.bump(0.3);
        this.clap(0.6, 1.5);
        this.cue('cheer', 0.4, 0, 1);
        break;
      case 'ko':
        this.excite = 1;
        this.hold = 4.5;
        this.cool = {};
        this.cue('cheer', 1, 0.05, 0);
        this.cue('ooh', 0.6, 0, 0);
        this.cues.push({ kind: 'cheer', gain: 0.8, delay: 0.8 });
        this.cues.push({ kind: 'whistle', gain: 0.6, delay: 0.6 });
        this.cues.push({ kind: 'whistle', gain: 0.5, delay: 1.5 });
        this.clap(1, 5);
        break;
      case 'decision':
        this.excite = Math.max(this.excite, 0.8);
        this.hold = 2;
        this.cue('cheer', 0.7, 0.2, 0);
        this.cues.push({ kind: 'whistle', gain: 0.45, delay: 0.9 });
        this.clap(0.9, 4);
        break;
    }
  }

  /** Advances the mood; state is null outside a fight (menus, garage). */
  tick(dt: number, state: CrowdState | null): CrowdLevels {
    this.t += dt;
    let floor = 0.15;
    if (state) {
      const p = state.phase;
      if (p === 'intro' || p === 'countdown') floor = 0.45;
      else if (p === 'fight') {
        floor = 0.22;
        // the last seconds and a close, bloody fight lift everyone
        if (state.clock < 15) floor += ((15 - state.clock) / 15) * 0.35;
        const low = Math.min(state.hp[0], state.hp[1]);
        if (low < 0.3) floor += 0.12;
        if (state.hp[0] < 0.35 && state.hp[1] < 0.35) floor += 0.1;
        // nothing landing for a while: the crowd gets restless
        this.sinceLanded += dt;
        if (this.sinceLanded > 7) {
          floor = Math.min(floor, 0.1);
          if (!this.lull) {
            this.lull = true;
            if (Math.random() < 0.55) this.cue('boo', 0.5, 0, 10);
            else this.cue('whistle', 0.4, 0, 6);
          }
        }
      } else floor = 0.35;
    }
    if (this.hold > 0) this.hold -= dt;
    else if (this.excite > floor) this.excite = floor + (this.excite - floor) * Math.exp(-dt / 3);
    else this.excite += (floor - this.excite) * (1 - Math.exp(-dt / 1.5));
    if (this.applauseHold > 0) this.applauseHold -= dt;
    else this.applause *= Math.exp(-dt / 1.2);
    const e = this.excite;
    return {
      murmur: 0.5 + 0.5 * e,
      roar: Math.pow(smooth(0.3, 1, e), 1.2),
      applause: this.applause,
      bright: e,
    };
  }
}

type Stereo = [Float32Array, Float32Array];

/**
 * The crowd you hear: murmur and roar loops mixed by the mood, applause, and
 * one-off reactions and whistles. Its sounds are synthesized in idle moments
 * after audio starts (see crowdSynth.ts).
 */
export class Crowd {
  readonly mood = new CrowdMood();
  private bus: GainNode;
  /** Dips the crowd under the commentary. */
  private ducker: GainNode;
  private tone: BiquadFilterNode;
  private gains: Record<'murmur' | 'roar' | 'applause', GainNode>;
  private shots: Partial<Record<Reaction, AudioBuffer[]>> = {};
  private level = 0;
  private acc = 0;
  private pending: { at: number; cue: CrowdCue }[] = [];
  private time = 0;

  constructor(private ctx: AudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.ducker = ctx.createGain();
    this.bus.connect(this.ducker).connect(out);
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 1500;
    this.tone.Q.value = 0.5;
    this.tone.connect(this.bus);
    const g = () => {
      const n = ctx.createGain();
      n.gain.value = 0;
      return n;
    };
    this.gains = { murmur: g(), roar: g(), applause: g() };
    this.gains.murmur.connect(this.tone);
    this.gains.roar.connect(this.tone);
    this.gains.applause.connect(this.bus);
    this.build();
  }

  private buffer([L, R]: Stereo) {
    const b = this.ctx.createBuffer(2, L.length, CROWD_RATE);
    b.getChannelData(0).set(L);
    b.getChannelData(1).set(R);
    return b;
  }

  private loop(buf: AudioBuffer, into: GainNode) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(into);
    s.start(this.ctx.currentTime, Math.random() * buf.duration);
  }

  /** Renders the crowd a voice at a time in idle moments: murmur first, then the rest. */
  private build() {
    const seed = (Math.random() * 1e6) | 0;
    type Job = { job: { render: CrowdRender; finish: () => Stereo }; done: (s: Stereo) => void };
    const shot = (k: Reaction) => (s: Stereo) => (this.shots[k] ??= []).push(this.buffer(s));
    const jobs: Job[] = [
      { job: murmur(seed), done: (s) => this.loop(this.buffer(s), this.gains.murmur) },
      { job: reaction('ooh', seed + 1), done: shot('ooh') },
      { job: reaction('cheer', seed + 2), done: shot('cheer') },
      { job: roar(seed + 3), done: (s) => this.loop(this.buffer(s), this.gains.roar) },
      { job: applause(seed + 4), done: (s) => this.loop(this.buffer(s), this.gains.applause) },
      { job: reaction('boo', seed + 5), done: shot('boo') },
      { job: reaction('ooh', seed + 6), done: shot('ooh') },
      { job: reaction('cheer', seed + 7), done: shot('cheer') },
    ];
    const idle = (fn: () => void) =>
      'requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 300 }) : setTimeout(fn, 20);
    const step = () => {
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 6) {
        const j = jobs[0];
        if (!j.job.render.step()) {
          jobs.shift();
          j.done(j.job.finish());
        }
      }
      if (jobs.length) idle(step);
    };
    idle(step);
  }

  /** Overall crowd volume (0 silent, ~0.25 menus, 1 fights). */
  ambience(level: number) {
    this.level = level;
    this.bus.gain.setTargetAtTime(level, this.ctx.currentTime, 0.6);
  }

  /** Crowd level under the commentary (1 = no dip). Dips quickly, comes back slowly. */
  duck(gain: number) {
    this.ducker.gain.setTargetAtTime(gain, this.ctx.currentTime, gain < this.ducker.gain.value ? 0.06 : 0.35);
  }

  event(type: string, data?: unknown) {
    this.mood.event(type, data);
  }

  tick(dt: number, state: CrowdState | null) {
    this.time += dt;
    const lv = this.mood.tick(dt, state);
    for (const c of this.mood.cues) this.pending.push({ at: this.time + c.delay, cue: c });
    this.mood.cues.length = 0;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at > this.time) continue;
      this.play(this.pending[i].cue);
      this.pending.splice(i, 1);
    }
    // mixer at 10 Hz is plenty for slow swells
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number, up = 0.15, down = 0.6) => p.setTargetAtTime(v, t, v > p.value ? up : down);
    set(this.gains.murmur.gain, 0.45 * lv.murmur);
    set(this.gains.roar.gain, 0.6 * lv.roar, 0.12, 0.8);
    set(this.gains.applause.gain, 0.5 * lv.applause, 0.1, 0.5);
    set(this.tone.frequency, 1100 + 4200 * lv.bright, 0.1, 0.8);
  }

  private play(c: CrowdCue) {
    if (this.level <= 0 || this.ctx.state !== 'running') return;
    if (c.kind === 'whistle') return this.whistle(c.gain);
    const list = this.shots[c.kind];
    if (!list?.length) return;
    const s = this.ctx.createBufferSource();
    s.buffer = list[(Math.random() * list.length) | 0];
    s.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = this.ctx.createGain();
    g.gain.value = 0.65 * c.gain;
    s.connect(g).connect(this.bus);
    s.start();
  }

  /** A fan's whistle: a two-note wolf whistle or one long rising call. */
  private whistle(gain: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const g = ctx.createGain();
    const base = 1500 + Math.random() * 700;
    const f = o.frequency;
    g.gain.setValueAtTime(0.0001, t);
    let end: number;
    if (Math.random() < 0.55) {
      // wolf whistle: up, gap, up-and-down
      f.setValueAtTime(base * 0.7, t);
      f.exponentialRampToValueAtTime(base * 1.35, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.05 * gain, t + 0.04);
      g.gain.setValueAtTime(0.05 * gain, t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      f.setValueAtTime(base * 0.75, t + 0.34);
      f.exponentialRampToValueAtTime(base * 1.45, t + 0.52);
      f.exponentialRampToValueAtTime(base * 0.8, t + 0.85);
      g.gain.exponentialRampToValueAtTime(0.05 * gain, t + 0.38);
      g.gain.setValueAtTime(0.05 * gain, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      end = t + 0.95;
    } else {
      f.setValueAtTime(base * 0.8, t);
      f.exponentialRampToValueAtTime(base * 1.3, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.045 * gain, t + 0.06);
      g.gain.setValueAtTime(0.045 * gain, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      end = t + 0.85;
    }
    // a little breathy wobble
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5 + Math.random() * 3;
    const depth = ctx.createGain();
    depth.gain.value = base * 0.012;
    lfo.connect(depth).connect(f);
    let node: AudioNode = o.connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.random() * 1.6 - 0.8;
      node = node.connect(p);
    }
    node.connect(this.bus);
    o.start(t);
    lfo.start(t);
    o.stop(end);
    lfo.stop(end);
  }
}
