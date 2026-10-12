import * as THREE from 'three';
import type { Game } from '../game/game';
import { perf, SECTIONS, type PerfReport } from '../perf';
import { el } from './dom';

const KEY = 'bb.perf';
const BUDGET = 1000 / 60;

/**
 * Small FPS + frame-cost panel, toggled from Settings (or `?perf` in the URL). Tap it to fold it down
 * to the FPS line. It only touches the DOM twice a second, and nothing runs while it is hidden.
 */
export class PerfOverlay {
  private root: HTMLElement | null = null;
  private head!: HTMLElement;
  private body!: HTMLElement;
  private graph!: HTMLCanvasElement;
  private rows = new Map<string, { ms: HTMLElement; bar: HTMLElement }>();
  private foot!: HTMLElement;
  private hist: number[] = [];
  private size = new THREE.Vector2();
  private compact = false;

  constructor(private game: Game) {
    let saved = false;
    try {
      saved = localStorage.getItem(KEY) === '1';
    } catch {}
    if (saved || new URLSearchParams(location.search).has('perf')) this.setVisible(true, false);
  }

  get visible() {
    return perf.on;
  }

  setVisible(on: boolean, remember = true) {
    if (remember) {
      try {
        if (on) localStorage.setItem(KEY, '1');
        else localStorage.removeItem(KEY);
      } catch {}
    }
    perf.setOn(on);
    if (on) {
      if (!this.root) this.build();
      this.root!.style.display = '';
      perf.onReport = (r) => this.show(r);
    } else {
      perf.onReport = null;
      if (this.root) this.root.style.display = 'none';
    }
  }

  private build() {
    const root = el('div', 'perf');
    root.addEventListener('click', () => {
      this.compact = !this.compact;
      root.classList.toggle('compact', this.compact);
    });
    this.head = el('div', 'perf-head', '-- FPS', root);
    this.body = el('div', 'perf-body', '', root);
    this.graph = el('canvas', 'perf-graph', '', this.body);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.graph.width = Math.round(160 * dpr);
    this.graph.height = Math.round(36 * dpr);
    const table = el('div', 'perf-rows', '', this.body);
    const row = (id: string, label: string, sub: boolean) => {
      const r = el('div', `perf-row${sub ? ' sub' : ''}`, '', table);
      el('span', 'perf-label', label, r);
      const ms = el('span', 'perf-ms', '', r);
      const bar = el('i', 'perf-bar', '', el('span', 'perf-track', '', r));
      this.rows.set(id, { ms, bar });
    };
    for (const s of SECTIONS) row(s.id, s.label, !!s.parent);
    row('cpu', 'CPU total', false);
    row('gpu', 'GPU', false);
    row('free', 'Spare', false);
    this.foot = el('div', 'perf-foot', '', this.body);
    document.body.appendChild(root);
    this.root = root;
  }

  private show(r: PerfReport) {
    this.head.innerHTML = `<b>${Math.round(r.fps)}</b> FPS <span>${r.frame.toFixed(1)} ms · max ${Math.round(r.worst)}</span>`;
    if (this.compact) return;
    const set = (id: string, ms: number | null) => {
      const row = this.rows.get(id)!;
      row.ms.textContent = ms === null ? 'n/a' : ms.toFixed(2);
      row.bar.style.width = `${ms === null ? 0 : Math.min(100, (ms / BUDGET) * 100)}%`;
    };
    for (const s of SECTIONS) set(s.id, r.ms[s.id]);
    set('cpu', r.cpu);
    set('gpu', r.gpu);
    set('free', Math.max(0, r.frame - r.cpu));
    const renderer = this.game.stage.renderer;
    renderer.getDrawingBufferSize(this.size);
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    this.foot.textContent =
      `${r.draws} draws · ${r.tris >= 1000 ? `${Math.round(r.tris / 1000)}k` : r.tris} tris · ` +
      `${this.size.x}×${this.size.y} @${renderer.getPixelRatio().toFixed(2)}x · ${this.game.stage.quality}` +
      (mem ? ` · ${Math.round(mem.usedJSHeapSize / 1048576)} MB` : '') +
      (perf.gpuSupported ? '' : ' · no GPU timer on this device');
    this.drawGraph();
  }

  /** Every frame interval of the last ~3 s; lines at 60 and 30 FPS. */
  private drawGraph() {
    const c = this.graph;
    const g = c.getContext('2d');
    if (!g) return;
    const w = c.width;
    const h = c.height;
    const top = 50; // ms at the top of the graph
    const y = (ms: number) => h - (Math.min(ms, top) / top) * h;
    g.clearRect(0, 0, w, h);
    const t = perf.history(this.hist);
    const bw = w / perf.frames.length;
    for (let i = 0; i < t.length; i++) {
      const ms = t[i];
      g.fillStyle = ms <= BUDGET * 1.1 ? '#3ee08f' : ms <= BUDGET * 2.1 ? '#ffb43a' : '#ff3f5e';
      const yy = y(ms);
      g.fillRect(w - (t.length - i) * bw, yy, Math.max(1, bw), h - yy);
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, Math.round(y(BUDGET)), w, 1);
    g.fillRect(0, Math.round(y(BUDGET * 2)), w, 1);
  }
}
