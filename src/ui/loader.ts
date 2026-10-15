/**
 * The loading screen. Its markup and look are inline in index.html, so it's up before any script
 * has downloaded; this drives it. Progress is real: the boot lists its jobs up front, each with
 * a weight for its share of the wait, and each job reports how far it has got (and where the step
 * it's on ends). The caption stays simple: a few friendly words on what's happening.
 *
 * Nothing on it waits for the page's own thread, which is busy building the game the whole time:
 * the spinner and the background are CSS animations, and the line is a Web Animation the browser
 * plays by itself. Each time progress comes in the line is handed a new glide (an easing curve
 * from where it is now toward a little past the real progress, never past the end of the current
 * step), so it keeps moving smoothly through a long step instead of jumping when the step reports.
 */
const TIPS = [
  'Wear three or six parts from one maker to unlock its set bonus.',
  'Tap a part in the garage to try it on before you fit it.',
  'Get a rival below 15% while you are above 40%, and your next hit can be a finisher.',
  'Losing a leg does not end it: your bot hops on and keeps swinging.',
  'Coach from the corner: send your bot in, go all in, defend, or call for the head.',
  'Big frames hit harder and take more. Small ones are quicker, sharper and harder to catch.',
  'Invite a friend with a room link: online fights play out the same on both phones.',
  'Paint, finish and glow colour are all yours to pick in the garage.',
];

export interface LoadJob {
  /**
   * How far this job has got (0..1), (if it's moved on to something else) what it's on now, and
   * how far the job will have got when the step it's on is done (the line may glide toward that).
   */
  set(k: number, label?: string, until?: number): void;
  done(): void;
}

/** How quickly the line closes in on where it's heading (s): it covers ~63% of the gap in this long. */
const TAU = 1.4;
/** How far into the rest of the current step the line runs ahead of the real progress. */
const LEAD = 0.7;
/** Points along each glide handed to the browser (it draws straight between them). */
const SAMPLES = 24;

type Job = { label: string; w: number; k: number; until: number; quiet: boolean };

export class Loader {
  private root = document.getElementById('boot');
  private jobs: Job[] = [];
  /** The job the caption (and the line's lead) follows. */
  private current: Job | null = null;
  /** The glide the line is on: from `from` to `to`, starting at `t0`, with time constant `tau` (s). */
  private glide = { from: 0, to: 0, t0: performance.now(), tau: TAU };
  private anims: Animation[] = [];
  private lastPct = -1;
  private raf = 0;
  private what = '';
  private tipTimer = 0;
  private tipAt = (Math.random() * TIPS.length) | 0;
  private ended = false;
  private reached: (() => void) | null = null;
  private els = {
    fill: this.q<HTMLElement>('.bt-fill'),
    head: this.q<HTMLElement>('.bt-head'),
    pct: this.q<HTMLElement>('.bt-pct'),
    what: this.q<HTMLElement>('.bt-what'),
    tip: this.q<HTMLElement>('.bt-tip'),
  };

  constructor() {
    if (!this.root) return;
    this.raf = requestAnimationFrame(this.tick);
    // a quick start never needs a tip; a slow one gets something to read
    this.tipTimer = window.setTimeout(() => this.nextTip(), 1600);
  }

  private q<T extends Element>(sel: string) {
    return this.root?.querySelector<T>(sel) ?? null;
  }

  /** A job worth `weight` of the wait. `quiet` jobs run alongside others and don't take over the caption. */
  job(label: string, weight: number, quiet = false): LoadJob {
    const j: Job = { label, w: weight, k: 0, until: 1, quiet };
    this.jobs.push(j);
    return {
      set: (k, override, until = 1) => {
        j.k = Math.max(j.k, Math.min(1, k));
        j.until = Math.max(j.k, Math.min(1, until));
        if (!quiet) {
          this.current = j;
          this.caption(override ?? label);
        }
        this.steer();
      },
      done: () => {
        j.k = j.until = 1;
        this.steer();
      },
    };
  }

  /** The fonts are in: the logo can show without a swap. */
  fontsReady() {
    this.root?.classList.add('fonts');
  }

  private get total() {
    let w = 0;
    for (const j of this.jobs) w += j.w;
    return w || 1;
  }

  private get real() {
    let k = 0;
    for (const j of this.jobs) k += j.w * j.k;
    return k / this.total;
  }

  /**
   * Where the line is on its glide at `now` (0..1). Timed from when the browser started playing it
   * (its own clock reads the same as performance.now), or from when it was handed over while that
   * news hasn't reached this thread yet: the page's view of animation time stands still while it's
   * busy, but the browser kept playing, so that view would put the line back.
   */
  private at(now: number) {
    const g = this.glide;
    const start = this.anims[0]?.startTime;
    const t = (now - (typeof start === 'number' ? start : g.t0)) / 1000;
    return t >= 4 * g.tau ? g.to : g.to - (g.to - g.from) * Math.exp(-t / g.tau);
  }

  /** Progress came in: head a little past it, up to the end of the step being worked on. */
  private steer() {
    if (this.ended) return;
    const real = this.real;
    const j = this.current;
    const ceiling = j && j.k < 1 ? real + (j.w * (j.until - j.k)) / this.total : real;
    const goal = Math.min(1, real + LEAD * (ceiling - real));
    // (small changes ride the glide already going: a new one each time would be a lot of restarts)
    if (goal > this.glide.to + 0.004) this.retarget(goal, TAU);
  }

  /** Start a new glide from wherever the line is now toward `goal`, for the browser to play. */
  private retarget(goal: number, tau: number) {
    const now = performance.now();
    const from = this.at(now);
    this.glide = { from, to: Math.max(goal, from), t0: now, tau };
    const g = this.glide;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = (i / SAMPLES) * 4 * tau;
      const p = i === SAMPLES ? g.to : g.to - (g.to - from) * Math.exp(-t / tau);
      frames.push({ transform: `translateX(${((p - 1) * 100).toFixed(3)}%)` });
    }
    const was = this.anims;
    this.anims = [];
    for (const el of [this.els.fill, this.els.head]) {
      if (!el) continue;
      if (typeof el.animate === 'function') this.anims.push(el.animate(frames, { duration: 4 * tau * 1000, fill: 'forwards' }));
      else el.style.transform = frames[SAMPLES].transform as string;
    }
    // (the new ones are already on top, so dropping the old ones shows no gap)
    for (const a of was) a.cancel();
  }

  private caption(t: string) {
    if (t === this.what || !this.els.what) return;
    this.what = t;
    this.els.what.textContent = t;
  }

  /** The number only: the line moves by itself. */
  private tick = (now: number) => {
    const shown = this.at(now);
    const whole = Math.floor(shown * 100 + 1e-6);
    if (whole !== this.lastPct) {
      this.lastPct = whole;
      if (this.els.pct) this.els.pct.textContent = `${whole}%`;
      this.root?.setAttribute('aria-valuenow', String(whole));
    }
    if (this.reached && shown >= 0.99) {
      this.reached();
      this.reached = null;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private nextTip() {
    const el = this.els.tip;
    if (!el || this.ended) return;
    el.classList.remove('on');
    window.setTimeout(() => {
      if (this.ended) return;
      this.tipAt = (this.tipAt + 1) % TIPS.length;
      el.innerHTML = `<b>Tip</b>${TIPS[this.tipAt]}`;
      el.classList.add('on');
    }, el.textContent ? 450 : 0);
    this.tipTimer = window.setTimeout(() => this.nextTip(), 5200);
  }

  /** Everything is done: fill the line, flash, and lift away. Resolves once the game shows through. */
  async finish() {
    const root = this.root;
    for (const j of this.jobs) j.k = j.until = 1;
    if (!root) return;
    this.caption('Ready');
    // a quick, smooth run to the end
    this.retarget(1, 0.2);
    await new Promise<void>((ok) => {
      this.reached = ok;
      // (no frames in a hidden tab: don't wait on the animation there)
      setTimeout(ok, 1400);
    });
    if (this.els.pct) this.els.pct.textContent = '100%';
    root.classList.add('full');
    await wait(300);
    this.ended = true;
    clearTimeout(this.tipTimer);
    root.classList.add('out');
    await wait(720);
    cancelAnimationFrame(this.raf);
    root.remove();
  }

  /** Something broke on the way in: say so and offer a reload, rather than spin forever. */
  fail(e: unknown) {
    console.error('loading failed', e);
    this.ended = true;
    clearTimeout(this.tipTimer);
    this.fontsReady();
    this.root?.classList.add('failed');
    this.caption("Couldn't start the game");
    if (this.els.tip) {
      this.els.tip.textContent = 'Check your connection and try again.';
      this.els.tip.classList.add('on');
    }
  }
}

const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
