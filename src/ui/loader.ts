/**
 * The loading screen. Its markup and look are inline in index.html, so it's up before any script
 * has downloaded; this drives it. Progress is real: the boot lists its jobs up front, each with
 * a weight for its share of the wait, and each job reports how far it has got. The line eases
 * toward that total but never runs ahead of it, and it only reads 100% when everything is done.
 * The caption stays simple: a few friendly words on what's happening, never the nuts and bolts.
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
  /** How far this job has got (0..1), and (if it's moved on to something else) what it's on now. */
  set(k: number, label?: string): void;
  done(): void;
}

export class Loader {
  private root = document.getElementById('boot');
  private jobs: { label: string; w: number; k: number }[] = [];
  /** The share shown, easing toward the real one. */
  private shown = 0;
  private lastPct = -1;
  private last = performance.now();
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
    const j = { label, w: weight, k: 0 };
    this.jobs.push(j);
    return {
      set: (k, override) => {
        j.k = Math.max(j.k, Math.min(1, k));
        if (!quiet) this.caption(override ?? label);
      },
      done: () => {
        j.k = 1;
      },
    };
  }

  /** The fonts are in: the logo and the number can show without a swap. */
  fontsReady() {
    this.root?.classList.add('fonts');
  }

  private get real() {
    let w = 0;
    let k = 0;
    for (const j of this.jobs) {
      w += j.w;
      k += j.w * j.k;
    }
    return w ? k / w : 0;
  }

  private caption(t: string) {
    if (t === this.what || !this.els.what) return;
    this.what = t;
    this.els.what.textContent = t;
  }

  private tick = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const real = this.real;
    // quick to catch up, smooth on the way: a big step lands in about a third of a second
    this.shown += (real - this.shown) * Math.min(1, dt * 9);
    if (real - this.shown < 0.002) this.shown = real;
    this.draw();
    if (this.reached && this.shown >= 0.9995) {
      this.reached();
      this.reached = null;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw() {
    const pct = this.shown * 100;
    const e = this.els;
    const at = `translateX(${(pct - 100).toFixed(2)}%)`;
    if (e.fill) e.fill.style.transform = at;
    if (e.head) e.head.style.transform = at;
    const whole = Math.floor(pct + 1e-6);
    if (whole !== this.lastPct) {
      this.lastPct = whole;
      if (e.pct) e.pct.textContent = `${whole}%`;
      this.root?.setAttribute('aria-valuenow', String(whole));
    }
  }

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
    for (const j of this.jobs) j.k = 1;
    if (!root) return;
    this.caption('Ready');
    await new Promise<void>((ok) => {
      this.reached = ok;
      // (no frames in a hidden tab: don't wait on the animation there)
      setTimeout(ok, 1200);
    });
    this.shown = 1;
    this.draw();
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
