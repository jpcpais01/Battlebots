import * as THREE from 'three';
import type { Game } from '../game/game';
import { perf, SECTIONS, type PerfReport } from '../perf';
import { PARTS } from '../render/renderProbe';
import { button, el } from './dom';

const KEY = 'bb.perf';
const BUDGET = 1000 / 60;

/**
 * Small FPS + frame-cost panel, toggled from Settings (or `?perf` in the URL). The CPU tab splits the
 * frame by game system, the GPU tab by part of the scene. Tap the panel to fold it down to the FPS
 * line. It only touches the DOM twice a second, and nothing runs while it is hidden.
 */
export class PerfOverlay {
  private root: HTMLElement | null = null;
  private head!: HTMLElement;
  private body!: HTMLElement;
  private graph!: HTMLCanvasElement;
  private rows = new Map<string, { ms: HTMLElement; bar: HTMLElement; draws?: HTMLElement }>();
  private tab: 'cpu' | 'gpu' = 'cpu';
  private gpuNote!: HTMLElement;
  private measureBtn!: HTMLButtonElement;
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
    const tabs = el('div', 'perf-tabs', '', this.body);
    const cpuTab = el('div', 'perf-rows', '', this.body);
    const gpuTab = el('div', 'perf-rows gpu', '', this.body);
    const pick = (t: 'cpu' | 'gpu') => {
      this.tab = t;
      cpuBtn.classList.toggle('on', t === 'cpu');
      gpuBtn.classList.toggle('on', t === 'gpu');
      cpuTab.style.display = t === 'cpu' ? '' : 'none';
      gpuTab.style.display = t === 'gpu' ? '' : 'none';
    };
    const cpuBtn = button('', 'CPU', () => pick('cpu'), tabs);
    const gpuBtn = button('', 'GPU', () => pick('gpu'), tabs);
    const row = (table: HTMLElement, id: string, label: string, sub: boolean, draws = false) => {
      const r = el('div', `perf-row${sub ? ' sub' : ''}`, '', table);
      el('span', 'perf-label', label, r);
      const ms = el('span', 'perf-ms', '', r);
      const d = draws ? el('span', 'perf-draws', '', r) : undefined;
      const bar = el('i', 'perf-bar', '', el('span', 'perf-track', '', r));
      this.rows.set(id, { ms, bar, draws: d });
    };
    for (const s of SECTIONS) row(cpuTab, s.id, s.label, !!s.parent);
    row(cpuTab, 'cpu', 'CPU total', false);
    row(cpuTab, 'gpu', 'GPU', false);
    row(cpuTab, 'free', 'Spare', false);

    const head = el('div', 'perf-row head', '<span>part</span><span>ms</span><span>draws</span>', gpuTab);
    head.appendChild(document.createElement('span'));
    for (const p of PARTS) row(gpuTab, `part.${p.id}`, p.label, false, true);
    const probe = this.game.probe;
    const act = el('div', 'perf-act', '', gpuTab);
    this.measureBtn = button('', 'Measure', () => {
      probe.measure();
      this.measureBtn.textContent = 'Measuring…';
    }, act);
    this.gpuNote = el('div', 'perf-note', '', act);
    pick('cpu');
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
    this.showParts();
    const renderer = this.game.stage.renderer;
    renderer.getDrawingBufferSize(this.size);
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const pacer = this.game.pacer;
    this.foot.textContent =
      `screen now ${Math.round(pacer.rafHz)} Hz (max ${pacer.hz}) · aiming for ${pacer.target} FPS · keep 120: ${this.game.boost.mode} · ` +
      `${r.draws} draws · ${r.tris >= 1000 ? `${Math.round(r.tris / 1000)}k` : r.tris} tris · ` +
      `${this.size.x}×${this.size.y} @${renderer.getPixelRatio().toFixed(2)}x ${this.game.stage.resScale === null ? 'auto' : 'fixed'} · ${this.game.stage.quality}` +
      (mem ? ` · ${Math.round(mem.usedJSHeapSize / 1048576)} MB` : '') +
      (perf.gpuSupported ? '' : ' · no GPU timer on this device');
    this.drawGraph();
  }

  private showParts() {
    const probe = this.game.probe;
    const snap = probe.snapshot();
    if (this.tab !== 'gpu') return;
    const live = snap.gpu;
    const measured = live ? null : probe.result;
    for (const p of PARTS) {
      const row = this.rows.get(`part.${p.id}`)!;
      const ms = live ? live[p.id] : measured ? measured.ms[p.id] : null;
      row.ms.textContent = ms === null ? '–' : ms.toFixed(2);
      row.bar.style.width = `${ms === null ? 0 : Math.min(100, (ms / BUDGET) * 100)}%`;
      const d = snap.draws[p.id];
      row.draws!.textContent = d ? `${Math.round(d)}` : '';
      row.draws!.title = `${Math.round(snap.tris[p.id] / 1000)}k triangles`;
    }
    this.measureBtn.style.display = probe.hasTimer ? 'none' : '';
    if (probe.hasTimer) {
      this.gpuNote.textContent = 'Live GPU time for each part.';
    } else if (probe.measuring) {
      this.gpuNote.textContent = 'Rendering each part on its own…';
    } else {
      this.measureBtn.textContent = measured ? 'Measure again' : 'Measure';
      this.gpuNote.textContent = measured
        ? `Measured ${Math.round((performance.now() - measured.at) / 1000)} s ago, by redrawing the frame without each part.`
        : 'No live GPU timer here. Tap Measure during a fight.';
    }
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
