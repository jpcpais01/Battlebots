import type { BoothOut, BoothVoice, Clip, Speech, VoiceManifest } from './booth';

const BASE = '/voice/';
/** Downloads at once. */
const FETCHES = 4;
/** Decoded clips kept around (decoded at the clips' own 24 kHz a second is ~94 KB, so this stays a few MB). */
const DECODED = 48;
/** The rate the clips are recorded at: decoding at it skips a resample and halves the memory. */
const CLIP_RATE = 24000;

/**
 * The commentary voices: downloads clips as the booth asks for them (the service
 * worker caches them for good), decodes them just before they play, and mixes
 * them like a broadcast booth: dry, close, a little presence, the crowd dipping
 * under each line. The three commentators sit a touch apart in the stereo field
 * so they stay clear when they talk over each other, and the robot goes through
 * a metallic ring-mod and comb before it reaches the booth.
 *
 * Everything here is built to stay light on the audio thread, which on a phone
 * shares the CPU with the renderer: clips are decoded off the live graph at their
 * own rate, replies and names are decoded before they're needed so nothing waits
 * on a decode mid-conversation, and the robot's effects only exist while it talks.
 */
export class Voice implements BoothOut {
  private enc = new Map<string, ArrayBuffer | null>();
  private wanted: string[] = [];
  private loading = 0;
  private dec = new Map<string, AudioBuffer>();
  private decoding = new Map<string, Promise<AudioBuffer | null>>();
  /** Clips to decode ahead of time, one at a time so they never bunch up. */
  private primeQ: string[] = [];
  private priming = false;
  /** Decodes clips at their own rate, away from the live context (falls back to it). */
  private decoder: BaseAudioContext;
  private bus: GainNode;
  private talking = 0;

  constructor(
    private ctx: AudioContext,
    out: AudioNode,
    level: number,
    private duck: (gain: number) => void,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = level;
    // headset mics in a booth: no rumble, a touch of presence, held level
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 95;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 3200;
    presence.Q.value = 0.8;
    presence.gain.value = 2.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;
    this.bus.connect(hp).connect(presence).connect(comp).connect(out);
    try {
      this.decoder = new OfflineAudioContext(1, 1, CLIP_RATE);
    } catch {
      this.decoder = ctx;
    }
  }

  /** The list of every line and name clip; null when the game ships without voices. */
  async manifest(): Promise<VoiceManifest | null> {
    try {
      const r = await fetch(`${BASE}manifest.json`);
      if (!r.ok) return null;
      const m = (await r.json()) as VoiceManifest;
      return Array.isArray(m.lines) ? m : null;
    } catch {
      return null;
    }
  }

  setLevel(v: number) {
    this.bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  ready(file: string) {
    return !!this.enc.get(file);
  }

  /** Decodes these clips in the background so they start the instant they're asked for. */
  prime(files: string[]) {
    for (const f of files) if (!this.dec.has(f) && !this.primeQ.includes(f)) this.primeQ.push(f);
    if (this.primeQ.length > DECODED / 2) this.primeQ.splice(0, this.primeQ.length - DECODED / 2);
    this.want(files);
    this.primeNext();
  }

  private primeNext() {
    if (this.priming) return;
    const i = this.primeQ.findIndex((f) => this.enc.get(f));
    if (i < 0) return;
    const [f] = this.primeQ.splice(i, 1);
    this.priming = true;
    void this.decode(f).then(() => {
      this.priming = false;
      this.primeNext();
    });
  }

  want(files: string[]) {
    for (const f of files) if (!this.enc.has(f)) {
      this.enc.set(f, null);
      this.wanted.push(f);
    }
    this.pump();
  }

  private pump() {
    while (this.loading < FETCHES && this.wanted.length) {
      const f = this.wanted.shift()!;
      this.loading++;
      fetch(`${BASE}c/${f}`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null)
        .then((b) => {
          if (b) this.enc.set(f, b);
          else this.enc.delete(f); // try again next time it's wanted
          this.loading--;
          this.pump();
          this.primeNext();
        });
    }
  }

  private decode(file: string): Promise<AudioBuffer | null> {
    const hit = this.dec.get(file);
    if (hit) {
      this.dec.delete(file);
      this.dec.set(file, hit);
      return Promise.resolve(hit);
    }
    const busy = this.decoding.get(file);
    if (busy) return busy;
    const b = this.enc.get(file);
    if (!b) return Promise.resolve(null);
    // decodeAudioData takes the bytes over, so it gets a copy
    const job = new Promise<AudioBuffer>((ok, no) => this.decoder.decodeAudioData(b.slice(0), ok, no))
      .then((buf) => {
        this.dec.set(file, buf);
        if (this.dec.size > DECODED) this.dec.delete(this.dec.keys().next().value!);
        return buf;
      })
      .catch(() => null)
      .finally(() => this.decoding.delete(file));
    this.decoding.set(file, job);
    return job;
  }

  /**
   * The robot's metal, built for one line and torn down after it: its dry voice,
   * a ring-modulated copy (the classic tin buzz) and a short resonant comb. Kept
   * per line so no oscillator or feedback loop runs on the audio thread in silence.
   */
  private robotFx(): { input: AudioNode; stop: (at: number) => void } {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 0.8;
    input.connect(dry).connect(this.bus);
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.frequency.value = 55;
    const depth = ctx.createGain();
    depth.gain.value = 0.32;
    osc.connect(depth).connect(ring.gain);
    osc.start();
    input.connect(ring).connect(this.bus);
    const comb = ctx.createDelay(0.05);
    comb.delayTime.value = 0.0065;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    input.connect(comb);
    comb.connect(fb).connect(comb);
    comb.connect(wet).connect(this.bus);
    return {
      input,
      stop: (at) => {
        osc.stop(at);
        // let the comb ring out, then break its loop so it can be collected
        const ms = Math.max(0, at - ctx.currentTime) * 1000 + 300;
        setTimeout(() => {
          fb.disconnect();
          comb.disconnect();
          wet.disconnect();
          ring.disconnect();
          dry.disconnect();
        }, ms);
      },
    };
  }

  speak(clips: { clip: Clip; gap: number }[], energy: number, within: number, voice: BoothVoice): Speech {
    const ctx = this.ctx;
    const deadline = ctx.currentTime + within;
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = PAN[voice];
    let fx: ReturnType<Voice['robotFx']> | null = null;
    const srcs: AudioBufferSourceNode[] = [];
    let playing = false;
    let end = Infinity;
    const halt = (fade: number) => {
      if (s.done) return;
      s.done = true;
      const t = ctx.currentTime;
      // hold the level where it really is right now, so the fade can't start with a jump
      if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t);
      else {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
      }
      if (fade > 0.2) {
        // trailing off: a quick dip as the other voice comes in, then fading away mid-word
        g.gain.linearRampToValueAtTime(0.55, t + 0.12);
        g.gain.linearRampToValueAtTime(0.0001, t + fade);
      } else g.gain.setTargetAtTime(0, t, fade / 4);
      for (const src of srcs) {
        try {
          src.stop(t + fade + 0.05);
        } catch {
          /* not started */
        }
      }
      fx?.stop(t + fade + 0.1);
      if (playing) this.release();
    };
    const s = {
      done: false,
      stop: () => halt(0.08),
      fade: (secs: number) => halt(secs),
      left: () => (s.done ? 0 : playing ? Math.max(0, end - ctx.currentTime) : Infinity),
    };
    Promise.all(clips.map((c) => this.decode(c.clip[0]))).then((bufs) => {
      if (s.done) return;
      if (bufs.some((b) => !b) || ctx.currentTime > deadline) {
        s.done = true;
        return;
      }
      if (voice === 'r') fx = this.robotFx();
      g.connect(pan).connect(fx ? fx.input : this.bus);
      let t = ctx.currentTime + 0.02;
      bufs.forEach((buf, i) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(t);
        srcs.push(src);
        t += buf!.duration + clips[i].gap;
      });
      end = t;
      srcs[srcs.length - 1].onended = () => {
        if (s.done) return;
        s.done = true;
        fx?.stop(ctx.currentTime + 0.1);
        this.release();
      };
      playing = true;
      this.talking++;
      // the crowd dips under the voices, except when they're screaming with it
      this.duck(energy >= 4 ? 0.85 : 0.56);
    });
    return s;
  }

  private release() {
    this.talking = Math.max(0, this.talking - 1);
    if (!this.talking) this.duck(1);
  }
}

/** Where each voice sits: the caller a little left, the analyst a little right, the robot dead centre. */
const PAN: Record<BoothVoice, number> = { p: -0.14, c: 0.14, r: 0 };
