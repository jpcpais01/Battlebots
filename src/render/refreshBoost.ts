/**
 * Experiment: ways to keep a phone's screen at its high refresh rate when nobody is touching it.
 *
 * Some Android phones only give the browser 120 Hz while a finger is down and drop web content to
 * 60 Hz otherwise. No web API asks for a refresh rate, so these try to look like content the system
 * keeps at full rate. Each one is a 2 px, almost invisible element, and all are off by default.
 */
export type BoostMode = 'off' | 'video' | 'scroll' | 'anim' | 'all';

export const BOOST_MODES: { id: BoostMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'video', label: 'Video' },
  { id: 'scroll', label: 'Scroll' },
  { id: 'anim', label: 'Anim' },
  { id: 'all', label: 'All' },
];

const KEY = 'bb.boost';

function tiny(el: HTMLElement, left: number) {
  Object.assign(el.style, {
    position: 'fixed',
    left: `${left}px`,
    bottom: '0',
    width: '2px',
    height: '2px',
    opacity: '0.02',
    pointerEvents: 'none',
    zIndex: '1',
  });
  document.body.appendChild(el);
  return el;
}

export class RefreshBoost {
  mode: BoostMode = 'off';
  private els: HTMLElement[] = [];
  private raf = 0;
  private tickers: (() => void)[] = [];
  private video: HTMLVideoElement | null = null;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    if (BOOST_MODES.some((m) => m.id === saved)) this.set(saved as BoostMode, false);
    // a video may only start playing after a tap
    window.addEventListener('pointerdown', () => void this.video?.play().catch(() => {}), { capture: true });
  }

  set(mode: BoostMode, remember = true) {
    this.stop();
    this.mode = mode;
    if (remember) {
      try {
        if (mode === 'off') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, mode);
      } catch {}
    }
    const all = mode === 'all';
    if (all || mode === 'video') this.startVideo();
    if (all || mode === 'scroll') this.startScroll();
    if (all || mode === 'anim') this.startAnim();
    if (this.tickers.length) {
      const loop = () => {
        this.raf = requestAnimationFrame(loop);
        for (const t of this.tickers) t();
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  /** A muted video fed from a canvas redrawn every frame, so it runs at the screen's full rate. */
  private startVideo() {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const g = c.getContext('2d');
    if (!g || typeof c.captureStream !== 'function') return;
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.srcObject = c.captureStream();
    tiny(v, 0);
    this.els.push(v);
    this.video = v;
    let n = 0;
    this.tickers.push(() => {
      g.fillStyle = (n++ & 1) ? '#000' : '#010101';
      g.fillRect(0, 0, 2, 2);
    });
    void v.play().catch(() => {});
  }

  /** A scroller that moves one pixel every frame. */
  private startScroll() {
    const s = tiny(document.createElement('div'), 3);
    s.style.overflow = 'scroll';
    const inner = document.createElement('div');
    inner.style.height = '200px';
    s.appendChild(inner);
    this.els.push(s);
    this.tickers.push(() => {
      s.scrollTop = s.scrollTop >= 100 ? 0 : s.scrollTop + 1;
    });
  }

  /** A compositor animation that never stops. */
  private startAnim() {
    const a = tiny(document.createElement('div'), 6);
    a.style.background = '#000';
    a.animate([{ transform: 'translateX(0) rotate(0deg)' }, { transform: 'translateX(1px) rotate(360deg)' }], {
      duration: 1000,
      iterations: Infinity,
    });
    this.els.push(a);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.tickers = [];
    for (const e of this.els) e.remove();
    this.els = [];
    if (this.video) {
      const s = this.video.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
      this.video = null;
    }
  }
}
