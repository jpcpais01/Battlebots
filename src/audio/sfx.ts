import { BANK, renderImpact, type ImpactKind } from './impacts';
import { Crowd, type CrowdState } from './crowd';
import { Booth, nameKey, type Clip, type NameCut, type VoiceManifest } from './booth';
import { fetchManifest, Voice } from './voice';
import { renderWalkOn } from './walkOn';
import { HomeSound, type HomeSoundKind } from './homeSound';
import { GACHA_RATE, GACHA_SOUNDS, makeGachaSound, type GachaSoundId } from './gachaSound';

const MASTER = 0.7;
/** The rate sounds made before audio may start are made at (the usual output rate; any other resamples them on play). */
const PRE_RATE = 48000;
const idle = (fn: () => void, timeout = 500) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout }) : setTimeout(fn, 30));

/**
 * Tiny synthesized sound kit (WebAudio, no assets): metallic impacts, whooshes,
 * a live crowd that reacts to the fight (crowd.ts), bell, and UI blips. Impacts come from a bank of
 * procedurally rendered metal hits (see impacts.ts), played back with random
 * variation, pitch and pan so no two punches sound the same. The commentary
 * booth (booth.ts) talks over all of it with recorded voices (voice.ts).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  /** Where effects, the crowd and the chant go (through the glue compressor). */
  private master: GainNode | null = null;
  /** The final mix: effects and commentary, at master volume (0 when muted). */
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private crowd: Crowd | null = null;
  private crowdLevel = 0;
  muted = false;
  private lastStep = [0, 0];
  /** Until when a vapour hiss is still blowing (audio clock). */
  private hissUntil = 0;
  /** Where impacts go: straight into the mix, and into a short arena slap so they have a room. */
  private hits: GainNode | null = null;
  private lastTink = 0;
  private bank: Partial<Record<ImpactKind, AudioBuffer[]>> = {};
  /** The bank being rendered: what's left, how to make one, and when it's all there. */
  private bankJob: { jobs: [ImpactKind, number][]; make: (job: [ImpactKind, number]) => void; done: Promise<void> } | null = null;
  /** The chant's clips loading, and the commentary's line list (both fetched before audio starts, if preload ran). */
  private chantJob: Promise<void> | null = null;
  private manifest: Promise<VoiceManifest | null> | null = null;
  private lastPick: Partial<Record<ImpactKind, AudioBuffer>> = {};
  private voice: Voice | null = null;
  /** The crowd counting down (3, 2, 1, FIGHT), decoded once audio starts. */
  private chant: Partial<Record<string, AudioBuffer>> = {};
  private chantBus: AudioNode | null = null;
  /** The hall reverb's return: only wired into the mix while the chant rings, so the
   * convolver isn't running on the audio thread for the rest of the game. */
  private chantHall: GainNode | null = null;
  private hallOn = false;
  private hallOff = 0;
  /** Clips of names the player had voiced, handed to the voice once audio starts. */
  private userClips = new Map<string, ArrayBuffer>();
  /** Walk-on themes, rendered once each the first time they're needed. */
  private walkOns = new Map<string, Promise<AudioBuffer | null>>();
  /** Renders run one at a time, so the theme asked for first is ready first. */
  private walkOnQueue: Promise<unknown> = Promise.resolve();
  /** The theme playing now (and a token so a late render never starts a stale one). */
  private walkOnNow: { src: AudioBufferSourceNode; g: GainNode } | null = null;
  private walkOnToken = 0;
  /** The animated home screen's place: surf and a tune, or the gym's radio. */
  private home: HomeSound | null = null;
  private homeKind: HomeSoundKind | null = null;
  /** The Skin Vault's synthesized sounds, and the ones playing. */
  private gachaBank = new Map<GachaSoundId, AudioBuffer>();
  private gachaLive = new Set<AudioBufferSourceNode>();
  /** Commentary volume: 1 on, 0.5 quiet, 0 off. */
  commentary = 1;
  /** The commentators. Silent until audio starts and the voice list has loaded. */
  readonly booth = new Booth({
    ready: (f) => !!this.voice?.ready(f),
    want: (f) => this.voice?.want(f),
    prime: (f) => this.voice?.prime(f),
    speak: (clips, energy, within, voice) => this.voice?.speak(clips, energy, within, voice) ?? { done: true, stop() {}, fade() {}, left: () => 0 },
  });

  constructor() {
    try {
      this.muted = localStorage.getItem('bb.muted') === '1';
      const c = localStorage.getItem('bb.commentary');
      if (c !== null) this.commentary = Math.min(1, Math.max(0, +c || 0));
    } catch {
      /* ignore */
    }
    this.booth.enabled = this.commentary > 0;
  }

  setCommentary(v: number) {
    this.commentary = v;
    this.booth.enabled = v > 0;
    this.voice?.setLevel(v);
    try {
      localStorage.setItem('bb.commentary', String(v));
    } catch {
      /* ignore */
    }
  }

  /** A name the player had voiced: the booth calls the bot by it from now on. */
  addName(name: string, clips: Partial<Record<NameCut, [bytes: ArrayBuffer, dur: number]>>) {
    const key = nameKey(name);
    const made: Partial<Record<NameCut, Clip>> = {};
    for (const [cut, c] of Object.entries(clips) as [NameCut, [ArrayBuffer, number]][]) {
      const file = `user/${key}/${cut}`;
      this.userClips.set(file, c[0]);
      this.voice?.add(file, c[0]);
      made[cut] = [file, c[1]];
    }
    this.booth.setCustomName(name, made);
  }

  /** Plays a voiced name the way the caller shouts it at a big moment. */
  previewName(name: string) {
    const file = `user/${nameKey(name)}/scream`;
    if (!this.voice?.ready(file)) return;
    const dur = this.booth.nameClip(name, 'scream')?.[1] ?? 1;
    this.voice.speak([{ clip: [file, dur], gap: 0 }], 4, 0.3, 'p');
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    // a slightly deeper buffer than the minimum: on a phone the audio thread shares the
    // CPU with the renderer, and the smallest buffer is what underruns into clicks and dropouts
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: 'balanced' });
    } catch {
      ctx = new AC();
    }
    this.ctx = ctx;
    // Two buses meet at the output. Effects (hits, crowd, chant) share a glue compressor
    // that evens them out; the commentary has its own (voice.ts), so a heavy hit no longer
    // pumps the voices down mid-word. After them a fast limiter catches stacked peaks (a KO
    // is five sounds at once) and a soft clipper is the last safety: past full scale the
    // speaker plays a harsh crackle.
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.ratio.value = 4;
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : MASTER;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -4;
    limit.knee.value = 2;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.12;
    // the shaper only sees -1..1, so feed it half level and let its curve cover peaks up to 2:
    // unity below 0.7, then a smooth knee that never quite reaches full scale
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) {
      const u = ((i / (curve.length - 1)) * 2 - 1) * 2;
      const a = Math.abs(u);
      curve[i] = Math.sign(u) * (a < 0.7 ? a : 0.7 + 0.29 * Math.tanh((a - 0.7) / 0.29));
    }
    clip.curve = curve;
    // the limiter keeps the signal in the shaper's straight part, so oversampling it
    // would only cost audio-thread time on every sample of the mix
    clip.oversample = 'none';
    this.master = ctx.createGain();
    this.master.connect(glue).connect(this.out);
    this.hits = this.makeHitBus(ctx, this.master);
    this.out.connect(limit).connect(pre).connect(clip).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const bank = this.buildBank(ctx.sampleRate, (n) => ctx.createBuffer(1, n, ctx.sampleRate));
    // whatever preload hasn't made yet: the first of each kind now, the first hit can come any moment
    while (bank.jobs.length && bank.jobs[0][1] === 0) bank.make(bank.jobs.shift()!);
    this.crowd = new Crowd(ctx, this.master);
    this.crowd.ambience(this.crowdLevel);
    this.home = new HomeSound(ctx, this.master, this.noiseBuf);
    this.home.set(this.homeKind);
    const crowd = this.crowd;
    const voice = new Voice(ctx, this.out, this.commentary, (g) => crowd.duck(g));
    this.voice = voice;
    for (const [f, b] of this.userClips) voice.add(f, b);
    void (this.manifest ??= fetchManifest()).then((m) => m && this.booth.setManifest(m));
    // the hall's impulse response is heavy to build, so do it now in a quiet moment
    // rather than on the first number of the countdown
    idle(() => (this.chantBus ??= this.makeChantBus()), 2000);
    void this.loadChant(ctx);
  }

  /**
   * Everything the sound kit can make before audio is allowed to start (that takes a tap): the
   * impact bank, the crowd's countdown chant and the commentary's list of lines. The first tap
   * then only has to wire up the mixer. `progress` gets the share done (0..1).
   */
  preload(progress: (k: number) => void = () => {}): Promise<void> {
    const OAC = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    let maker: OfflineAudioContext;
    try {
      // (only makes buffers and decodes: buffers belong to no context, the live one plays them)
      maker = new OAC(1, 1, PRE_RATE);
    } catch {
      progress(1);
      return Promise.resolve();
    }
    this.manifest ??= fetchManifest();
    const chant = this.loadChant(maker);
    const bank = this.buildBank(PRE_RATE, (n) => maker.createBuffer(1, n, PRE_RATE), progress);
    return Promise.all([chant, bank.done]).then(() => progress(1));
  }

  /**
   * The impact bus. Besides the dry path, two short, darkened slap-back delays (one each
   * side) give a hit the hard walls of an arena to ring off, so it lands in a big room instead
   * of in the listener's ear. Built once: every hit shares it, so it adds no per-hit nodes.
   */
  private makeHitBus(ctx: AudioContext, dest: AudioNode) {
    const bus = ctx.createGain();
    bus.connect(dest);
    const send = ctx.createGain();
    send.gain.value = 0.22;
    bus.connect(send);
    for (const [time, pan, fb] of [[0.083, -0.55, 0.32], [0.131, 0.55, 0.26]] as const) {
      const d = ctx.createDelay(0.3);
      d.delayTime.value = time;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 160;
      const back = ctx.createGain();
      back.gain.value = fb;
      send.connect(d).connect(lp).connect(hp);
      hp.connect(back).connect(d);
      let wet: AudioNode = hp;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        wet = hp.connect(p);
      }
      wet.connect(dest);
    }
    return bus;
  }

  /** The crowd's countdown (3, 2, 1, FIGHT) clips, fetched and decoded once with `decoder`. */
  private loadChant(decoder: BaseAudioContext) {
    this.chantJob ??= Promise.all(
      ['3', '2', '1', 'fight'].map((k) =>
        fetch(`/audio/count/${k}.mp3`)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then((b) => b && new Promise<AudioBuffer>((ok, no) => decoder.decodeAudioData(b, ok, no)))
          .then((buf) => {
            if (buf) this.chant[k] = buf;
          })
          .catch(() => {}),
      ),
    ).then(() => {});
    return this.chantJob;
  }

  /**
   * The chant comes from the stands, not a speaker: a few layers of it slightly out
   * of step (a house full of voices), dulled by distance and thrown into the hall.
   */
  private playChant(k: string, gain: number) {
    const buf = this.chant[k];
    if (!buf) return false;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const bus = (this.chantBus ??= this.makeChantBus());
    if (!this.hallOn) {
      this.chantHall!.connect(this.master!);
      this.hallOn = true;
    }
    clearTimeout(this.hallOff);
    // unhook the hall once this number and its echo have died away
    this.hallOff = window.setTimeout(() => {
      this.chantHall?.disconnect();
      this.hallOn = false;
    }, (buf.duration / 0.97 + 0.1 + 3) * 1000);
    const layers: [rate: number, delay: number, pan: number, g: number][] = [
      [1, 0, 0, 1],
      [0.985, 0.035, -0.6, 0.5],
      [1.018, 0.06, 0.6, 0.5],
      [0.97, 0.09, -0.25, 0.3],
    ];
    for (const [rate, delay, pan, lg] of layers) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain * lg * 0.62;
      let out: AudioNode = src.connect(g);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        out = out.connect(p);
      }
      out.connect(bus);
      src.start(t + delay);
    }
    return true;
  }

  /** Distance (band-limited, softened) plus a big arena hall for the chant. */
  private makeChantBus(): AudioNode {
    const ctx = this.ctx!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 150;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    hp.connect(lp);
    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    lp.connect(dry).connect(this.master!);
    // a synthetic hall: decorrelated noise in each ear, darkening as it decays
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    const pre = Math.floor(ctx.sampleRate * 0.03);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lpState = 0;
      for (let i = pre; i < len; i++) {
        const x = (i - pre) / (len - pre);
        const a = 0.35 + 0.6 * x; // more smoothing (darker) further into the tail
        lpState += (Math.random() * 2 - 1 - lpState) * (1 - a);
        d[i] = lpState * Math.exp(-x * 5.5);
      }
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.85;
    lp.connect(verb).connect(wet);
    this.chantHall = wet;
    return hp;
  }

  /**
   * The countdown: the whole house shouts the number with the screen, over a deep
   * drum hit that climbs a step each time. 0 is FIGHT!
   */
  countdown(n: number) {
    if (!this.ok) return;
    this.crowd?.event('count', n);
    const k = n > 0 ? String(n) : 'fight';
    const sung = this.playChant(k, n > 0 ? 0.95 : 1.05);
    const f = n > 0 ? 62 + (3 - n) * 9 : 92;
    this.tone('sine', f * 1.6, f * 0.55, 0.55, 0.55);
    this.tone('triangle', f * 3.2, f * 1.1, 0.18, 0.12);
    this.noise(0.22, 'lowpass', 900, 0.7, 0.3, 0, 120);
    // no chant clips: at least a tick on the beat
    if (!sung && n > 0) this.tone('square', 660, 660, 0.06, 0.04, 0.02);
  }

  /**
   * Render walk-on themes ahead of when they play: the player's once the game has loaded, both
   * fighters' at the start of a fight. Each takes a second or two of a background thread.
   */
  primeWalkOn(...ids: string[]) {
    // (before audio starts it renders at the usual rate: a theme is an offline render, no tap needed)
    const rate = this.ctx?.sampleRate ?? PRE_RATE;
    for (const id of ids) {
      if (this.walkOns.has(id)) continue;
      const p = this.walkOnQueue.then(() => renderWalkOn(id, rate)).catch(() => null);
      this.walkOns.set(id, p);
      this.walkOnQueue = p;
    }
  }

  /**
   * A bot's walk-on theme, from `offset` seconds in (it was asked for that long ago). Fades
   * out whatever theme was already playing. A theme still rendering starts when it is done,
   * in time with the entrance; `wait` plays it whenever it is ready (the garage preview).
   */
  walkOn(id: string, offset = 0, gain = 0.62, wait = false) {
    if (!this.ok) return;
    this.walkOnStop(0.3);
    this.primeWalkOn(id);
    const ctx = this.ctx!;
    const asked = ctx.currentTime;
    const token = ++this.walkOnToken;
    void this.walkOns.get(id)!.then((buf) => {
      if (!buf || token !== this.walkOnToken || !this.master) return;
      // a slow render starts it late, still in time with the entrance: the drop lands on the
      // reveal even if the build is cut short, and a bar later is too late to bother
      const at = wait ? 0 : offset + ctx.currentTime - asked;
      if (at > 3.6) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.master);
      src.start(ctx.currentTime, Math.max(0, at));
      src.onended = () => {
        if (this.walkOnNow?.src === src) this.walkOnNow = null;
        g.disconnect();
      };
      this.walkOnNow = { src, g };
    });
  }

  /** Fade the walk-on theme out over `fade` seconds. */
  walkOnStop(fade = 0.6) {
    this.walkOnToken++;
    const w = this.walkOnNow;
    this.walkOnNow = null;
    if (!w || !this.ctx) return;
    const t = this.ctx.currentTime;
    w.g.gain.cancelScheduledValues(t);
    w.g.gain.setValueAtTime(w.g.gain.value, t);
    w.g.gain.linearRampToValueAtTime(0, t + fade);
    w.src.stop(t + fade + 0.05);
  }

  /** A corner lift: the doors unlock and slide (open), the hydraulics push (rise), it locks at the top (arrive). */
  lift(cue: 'open' | 'rise' | 'arrive', pan = 0) {
    if (!this.ok) return;
    if (cue === 'open') {
      // a clunk, then the hiss of the seals letting go
      this.impact('block', 0.3, 0.55, pan);
      this.noise(0.9, 'highpass', 2500, 0.6, 0.12, 0.05);
      this.noise(0.6, 'bandpass', 600, 1.2, 0.1, 0.1, 180);
    } else if (cue === 'rise') {
      // a hydraulic whine climbing with the lift
      this.tone('sawtooth', 55, 110, 1.3, 0.05, 0, 300, 900);
      this.tone('sine', 110, 220, 1.3, 0.05);
      this.noise(1.3, 'bandpass', 300, 2, 0.06, 0, 1400);
    } else {
      // locked: a heavy metal clunk and the CO2 cannons blasting
      this.impact('heavy', 0.75, 0.62, pan);
      this.tone('sine', 70, 34, 0.7, 0.5);
      this.noise(1.1, 'highpass', 1200, 0.4, 0.28, 0.02, 5000);
      this.noise(0.9, 'lowpass', 1800, 0.6, 0.18, 0.02, 300);
    }
  }

  /** Two robots touching gloves: a bright, ringing clink of metal knuckles. */
  fistBump() {
    if (!this.ok) return;
    this.impact('block', 0.4, 1.35);
    for (const r of [1, 2.76, 5.4]) this.tone('sine', 1250 * r, 1240 * r, 0.5 / r, 0.05 / r, 0.004);
  }

  /**
   * Renders the impact bank (as `rate` buffers made by `create`) a few hits at a time in quiet
   * moments, the first variation of each kind first. Started by preload, before audio may start,
   * or at the latest by unlock; later calls get the same job.
   */
  private buildBank(rate: number, create: (length: number) => AudioBuffer, progress?: (k: number) => void) {
    if (this.bankJob) return this.bankJob;
    const seed = (Math.random() * 1e6) | 0;
    const jobs: [ImpactKind, number][] = [];
    for (const k of Object.keys(BANK) as ImpactKind[]) for (let v = 0; v < BANK[k]; v++) jobs.push([k, v]);
    jobs.sort((a, b) => a[1] - b[1]);
    const total = jobs.length;
    const make = ([k, v]: [ImpactKind, number]) => {
      const data = renderImpact(k, seed + v * 131 + k.length, rate);
      const buf = create(data.length);
      buf.getChannelData(0).set(data);
      (this.bank[k] ??= []).push(buf);
    };
    const done = new Promise<void>((ok) => {
      const step = () => {
        const t0 = performance.now();
        while (jobs.length && performance.now() - t0 < 8) make(jobs.shift()!);
        progress?.(1 - jobs.length / total);
        if (jobs.length) idle(step);
        else ok();
      };
      idle(step);
    });
    return (this.bankJob = { jobs, make, done });
  }

  /** Plays a random variation of an impact (never the same one twice in a row). */
  private impact(kind: ImpactKind, gain: number, rate: number, pan = 0, when = 0) {
    const list = this.bank[kind];
    if (!list?.length) return;
    let buf = list[(Math.random() * list.length) | 0];
    if (buf === this.lastPick[kind] && list.length > 1) buf = list[(list.indexOf(buf) + 1) % list.length];
    this.lastPick[kind] = buf;
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = gain;
    let out: AudioNode = src.connect(g);
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      out = out.connect(p);
    }
    out.connect(this.hits ?? this.master!);
    src.start(t);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('bb.muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.05);
  }

  private get ok() {
    return !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  private noise(dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, when = 0, freqEnd?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** An enveloped oscillator sweep, optionally through a low-pass that moves from lp0 to lp1 (Hz). */
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when = 0, lp0 = 0, lp1 = lp0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let src: AudioNode = o;
    if (lp0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(lp0, t);
      f.frequency.exponentialRampToValueAtTime(lp1, t + dur);
      src = o.connect(f);
    }
    src.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /**
   * A landed strike. kind is the move type ('punch' or 'kick'); pan places it left/right in
   * the stereo field (-1..1); wear (0..1) is how battered the part that took it is: a worn part
   * crumples and rattles instead of ringing clean.
   */
  hit(damage: number, zone: string, crit: boolean, kind = 'punch', pan = 0, wear = 0) {
    if (!this.ok) return;
    const k = Math.min(1, damage / 100);
    const big = crit || k > 0.5;
    // bigger hits land lower and fatter
    const rate = 1.1 - k * 0.25;
    this.impact(zone === 'head' ? 'head' : kind === 'kick' ? 'kick' : 'punch', 0.5 + k * 0.5, rate, pan);
    // the layers land a hair apart, the way a blow travels through a frame
    const flam = () => 0.004 + Math.random() * 0.012;
    if (big) {
      this.impact('heavy', 0.35 + k * 0.45, 0.85 + Math.random() * 0.2, pan * 0.6, flam());
      // the panel left ringing after a big one
      this.impact('clang', (crit ? 0.32 : 0.2) + k * 0.15, 0.9 + Math.random() * 0.2 - k * 0.1, pan * 0.8, flam());
      this.tone('sine', 62, 34, 0.3, 0.25 + k * 0.25);
    } else if (Math.random() < 0.45) {
      // a second, brighter plate somewhere on the frame
      this.impact('block', 0.12 + k * 0.12, 1.15 + Math.random() * 0.25, pan, flam());
    }
    if (wear > 0.3) this.impact('crunch', Math.min(0.75, (wear - 0.2) * (0.5 + k * 0.7)), 1.1 - wear * 0.25, pan, flam());
  }

  block(damage: number, pan = 0, guardBreak = false) {
    if (!this.ok) return;
    const k = Math.min(1, damage / 120);
    this.impact('block', 0.45 + k * 0.35, 1.05 + Math.random() * 0.1 - k * 0.15, pan);
    if (guardBreak) {
      this.impact('heavy', 0.45, 0.95, pan);
      this.impact('clang', 0.25, 1.05, pan, 0.006);
    } else if (k > 0.35) this.impact('punch', 0.2 + k * 0.2, 1.2, pan);
  }

  /** A chunk of metal torn off a bot landing on the canvas (k: 0..1 how hard). */
  tink(k: number, pan = 0) {
    if (!this.ok) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastTink < 0.07) return;
    this.lastTink = now;
    // heavier landings play lower
    this.impact('tink', 0.08 + 0.16 * Math.min(1, k), 0.95 - Math.min(1, k) * 0.2 + Math.random() * 0.1, pan);
  }

  whoosh(power: boolean, kick: boolean, vol = 1) {
    if (!this.ok) return;
    const dur = kick ? 0.22 : power ? 0.16 : 0.11;
    this.noise(dur, 'bandpass', kick ? 500 : 900, 1.2, (power ? 0.22 : 0.12) * vol, 0, kick ? 1500 : 2400);
    // a short servo whine from the limb's actuators
    this.tone('sawtooth', kick ? 140 : 190, kick ? 300 : 420, dur * 0.8, (power ? 0.016 : 0.01) * vol);
  }

  charge(kick: boolean) {
    if (!this.ok) return;
    // actuators spinning up: a rising whine, no hiss
    this.tone('sawtooth', kick ? 120 : 160, kick ? 420 : 640, 0.32, 0.04, 0, 1800);
    this.tone('sine', kick ? 240 : 320, kick ? 840 : 1280, 0.3, 0.035);
  }

  step(index: number) {
    if (!this.ok) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastStep[index] < 0.08) return;
    this.lastStep[index] = now;
    this.impact('step', 0.1 + Math.random() * 0.05, 0.9 + Math.random() * 0.25, index === 0 ? -0.15 : 0.15);
  }

  /** A body slamming into the canvas (k: 0..1 impact strength). */
  thud(k: number, pan = 0) {
    if (!this.ok) return;
    this.impact('thud', 0.35 + 0.55 * k, 1.05 - k * 0.15, pan);
    this.tone('sine', 70, 30, 0.3, 0.2 + 0.3 * k);
  }

  /**
   * A hinge seal blowing: a crack as it gives, then a hard, bright hiss of vapour that
   * sputters out over `dur` seconds. k (0..1) is how wrecked the part is.
   */
  hiss(k: number, dur: number, pan = 0) {
    if (!this.ok) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // hinges blowing together read as one: don't stack them
    if (t < this.hissUntil) return;
    this.hissUntil = t + 0.18;
    this.tone('square', 1800, 900, 0.03, 0.04 * (0.5 + k), 0, 3000);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.setValueAtTime(6500 + Math.random() * 1500, t);
    bp.frequency.linearRampToValueAtTime(4200, t + dur);
    bp.gain.value = 6;
    const g = ctx.createGain();
    const peak = 0.07 + 0.1 * k;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    g.gain.setValueAtTime(peak, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(peak * 0.3, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    let node: AudioNode = src.connect(hp).connect(bp).connect(g);
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.2);
  }

  ropes() {
    if (!this.ok) return;
    this.tone('sine', 70, 55, 0.35, 0.18);
    this.noise(0.25, 'bandpass', 300, 3, 0.12);
  }

  shield() {
    if (!this.ok) return;
    this.tone('sine', 900, 1400, 0.2, 0.15);
    this.tone('triangle', 1800, 2600, 0.25, 0.05);
    this.noise(0.25, 'bandpass', 1600, 1.5, 0.06);
  }

  shieldUp() {
    if (!this.ok) return;
    this.tone('sine', 500, 1200, 0.25, 0.06);
  }

  zap() {
    if (!this.ok) return;
    // an electric thrum: buzzing low saws under a closing filter, instead of a burst of static
    this.tone('sawtooth', 110, 92, 0.16, 0.07, 0, 2600, 300);
    this.tone('sawtooth', 113.5, 95, 0.16, 0.06, 0, 2600, 300);
    this.tone('sine', 1300, 520, 0.09, 0.05);
  }

  /**
   * The hover stretcher: a two-note medic chime as it swoops in, a rising hum as its beam
   * lifts the loser on, a cheerful little arpeggio when the loser perks up, and a jet whoosh
   * as it takes off for the tunnel.
   */
  stretcher(kind: 'arrive' | 'lift' | 'cheer' | 'depart') {
    if (!this.ok) return;
    if (kind === 'arrive') {
      this.tone('sine', 988, 988, 0.22, 0.05);
      this.tone('sine', 1319, 1319, 0.3, 0.05, 0.16);
      this.noise(0.7, 'bandpass', 700, 0.8, 0.07, 0, 300);
    } else if (kind === 'lift') {
      this.tone('sine', 220, 660, 1.1, 0.05);
      this.tone('triangle', 330, 990, 1.1, 0.025, 0.05);
    } else if (kind === 'cheer') {
      [784, 988, 1175, 1568].forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.04, i * 0.07));
    } else {
      this.noise(1.1, 'bandpass', 380, 1, 0.12, 0, 1800);
      this.tone('sawtooth', 90, 260, 0.9, 0.025, 0, 900, 2400);
    }
  }

  bell(times = 1) {
    if (!this.ok) return;
    for (let i = 0; i < times; i++) {
      for (const r of [1, 2.4, 3.9, 5.2]) this.tone('sine', 820 * r, 818 * r, 1.4 / r, 0.12 / r, i * 0.32);
    }
  }

  ko() {
    if (!this.ok) return;
    this.impact('heavy', 1, 0.72);
    this.impact('kick', 0.6, 0.8, 0, 0.01);
    this.impact('clang', 0.45, 0.78, 0, 0.018);
    this.impact('thud', 0.5, 0.85, 0, 0.12);
    this.tone('sine', 110, 28, 1.0, 0.7);
    this.noise(0.6, 'lowpass', 1200, 0.5, 0.35, 0, 200);
  }

  /**
   * One of the Skin Vault's sounds (audio/gachaSound.ts), made the first time it's wanted, at a
   * gain and playback rate. gachaStop() cuts whatever of them is still playing.
   */
  gacha(id: GachaSoundId, gain = 1, rate = 1) {
    if (!this.ok) return;
    const ctx = this.ctx!;
    let b = this.gachaBank.get(id);
    if (!b) {
      const d = makeGachaSound(id);
      b = ctx.createBuffer(1, d.length, GACHA_RATE);
      b.copyToChannel(d, 0);
      this.gachaBank.set(id, b);
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master!);
    src.start();
    this.gachaLive.add(src);
    src.onended = () => this.gachaLive.delete(src);
  }

  gachaStop() {
    for (const s of this.gachaLive) {
      try {
        s.stop();
      } catch {
        /* already done */
      }
    }
    this.gachaLive.clear();
  }

  /** Make the vault's sounds ahead of a pull, one per call (whether any were left). */
  gachaWarm() {
    if (!this.ok) return false;
    for (const id of GACHA_SOUNDS) {
      if (this.gachaBank.has(id)) continue;
      const d = makeGachaSound(id);
      const b = this.ctx!.createBuffer(1, d.length, GACHA_RATE);
      b.copyToChannel(d, 0);
      this.gachaBank.set(id, b);
      return true;
    }
    return false;
  }

  ui(kind: 'tap' | 'select' | 'back' | 'start' = 'tap') {
    if (!this.ok) return;
    if (kind === 'start') {
      this.tone('square', 440, 880, 0.12, 0.05);
      this.tone('square', 660, 1320, 0.16, 0.04, 0.08);
    } else if (kind === 'select') this.tone('triangle', 720, 980, 0.08, 0.09);
    else if (kind === 'back') this.tone('triangle', 600, 380, 0.08, 0.08);
    else this.tone('triangle', 880, 900, 0.05, 0.07);
  }

  // ------------------------------------------------------------------ home scenes
  /** The home screen's place sounds (null when the home screen isn't showing one). */
  homeScene(kind: HomeSoundKind | null) {
    this.homeKind = kind;
    this.home?.set(kind);
  }

  /** The place's tune on or off. */
  homeMusic(on: boolean) {
    this.home?.setMusic(on);
  }

  /** The place's sounds as a whole, louder or quieter. */
  homeLevel(v: number, tau = 0.3) {
    this.home?.level(v, tau);
  }

  /** The phone ringing on the side table. */
  ring() {
    if (!this.ok) return;
    this.home?.ring(this.master!);
  }

  /** Picking up: two short beeps. */
  phoneBeep() {
    if (!this.ok) return;
    this.tone('sine', 1400, 1400, 0.07, 0.05);
    this.tone('sine', 1760, 1760, 0.09, 0.05, 0.09);
  }

  /** A strike landing on the heavy bag (k: 0..1 power). */
  bagHit(k: number, pan = 0) {
    if (!this.ok) return;
    this.impact('thud', 0.25 + 0.45 * k, 1.35 - 0.3 * k, pan);
    this.tone('sine', 110, 45, 0.18 + 0.2 * k, 0.12 + 0.3 * k);
    this.noise(0.08 + 0.1 * k, 'lowpass', 1400, 0.7, 0.08 + 0.18 * k, 0, 300);
  }

  /** The bag's chain rattling. */
  chain(k = 1) {
    if (!this.ok) return;
    for (let i = 0; i < 4; i++) {
      const f = 2600 + Math.random() * 2400;
      this.tone('triangle', f, f * 0.98, 0.07, 0.012 * k, i * (0.035 + Math.random() * 0.03));
    }
  }

  /** The TV cutting to the fight-night alert: a thunderclap and a three-beep news sting. */
  homeAlert() {
    if (!this.ok) return;
    this.noise(0.25, 'highpass', 2000, 0.7, 0.12);
    this.noise(2.6, 'lowpass', 900, 0.8, 0.35, 0.02, 60);
    for (let i = 0; i < 3; i++) {
      this.tone('square', 880, 880, 0.12, 0.05, 0.12 + i * 0.2, 2600);
      this.tone('square', 1320, 1320, 0.12, 0.03, 0.12 + i * 0.2, 2600);
    }
    this.tone('sawtooth', 220, 330, 0.6, 0.05, 0.75, 1800, 900);
  }

  /** A mouthful of coffee sprayed everywhere. */
  spit() {
    if (!this.ok) return;
    this.noise(0.38, 'bandpass', 1400, 0.9, 0.3, 0, 3800);
    this.noise(0.18, 'lowpass', 600, 0.7, 0.18, 0.02, 200);
    for (let i = 0; i < 6; i++) this.noise(0.04, 'highpass', 3000 + Math.random() * 3000, 0.7, 0.05, 0.3 + Math.random() * 0.35);
  }

  /** A gulp. */
  gulp() {
    if (!this.ok) return;
    this.tone('sine', 300, 120, 0.14, 0.12, 0, 900);
    this.noise(0.1, 'bandpass', 700, 2, 0.05, 0.02, 300);
  }

  /** A mug set down on a wooden table. */
  mugDown() {
    if (!this.ok) return;
    this.impact('tink', 0.14, 1.3);
    this.tone('sine', 1900, 1850, 0.12, 0.025);
    this.tone('triangle', 240, 160, 0.08, 0.06);
  }

  /** The heavy arena door: the latch, a groan, and a rush of air and light. */
  doorOpen() {
    if (!this.ok) return;
    this.impact('block', 0.5, 0.65);
    this.tone('sawtooth', 70, 52, 0.9, 0.03, 0.08, 500, 300);
    this.noise(1.6, 'lowpass', 250, 0.6, 0.22, 0.15, 5000);
  }

  // ------------------------------------------------------------------ crowd
  /** Crowd volume (0 silent, ~0.25 menus, 1 during fights). */
  ambience(level: number) {
    this.crowdLevel = level;
    this.crowd?.ambience(level);
  }

  /** Match events the crowd reacts to (hits, knockdowns, KOs...). */
  crowdEvent(type: string, data?: unknown) {
    this.crowd?.event(type, data);
  }

  /** Per-frame crowd update; state is null outside a fight. */
  crowdTick(dt: number, state: CrowdState | null) {
    this.crowd?.tick(dt, state);
  }
}
