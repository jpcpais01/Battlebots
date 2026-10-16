// Reference renders of the web sound kit through its real mix (sfx.ts unlock: the hit bus's
// slap, the glue compressor, the master gain, limiter and soft clip), for checking
// godot/audio/sfx.gd and godot/default_bus_layout.tres against (godot/tests/sfx_ref.gd plays
// the same script in Godot under Movie Maker):
//   node godot/tools/bake/web/run.mjs audio_sfx_ref --q "script=fight"
// writes godot/assets/audio/sfx_ref/<script>.f32 (stereo float, 48 kHz) and <script>.json (the
// script, for the Godot side). Move them out of assets/ afterwards: they are not shipped.
//
// Scripts: "slap" (a click into the hit bus: its echoes), "sweep" (a 1 kHz tone stepping up 2 dB at a time into the effects bus, then into the
// master after the glue: the mix's static curves), "kit" (every sound alone, three times over,
// in its own slot), "repeat" (one call many times: &m=ko&a=[...]&n=12&gap=2.5) and "fight" (a dense exchange, the walk-on and lift, the countdown).
import { Sfx } from '../../../../src/audio/sfx';
import { ENTRY } from '../../../../src/sim/entrance';
import { post } from './scene_bake';

const RATE = 48000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySfx = any;
type Cue = [t: number, method: string, ...args: unknown[]];

/** Every sound once, three rounds: [method, args] with a slot length (s). */
const KIT: [string, unknown[], number][] = [
  ['hit', [25, 'body', false, 'punch', 0.3, 0], 1],
  ['hit', [60, 'body', false, 'kick', -0.3, 0.1], 1],
  ['hit', [90, 'head', true, 'punch', 0.1, 0.7], 1.5],
  ['block', [40, -0.2, false], 1],
  ['block', [90, 0.2, true], 1.5],
  ['tink', [0.6, 0.3], 0.6],
  ['whoosh', [true, false, 1], 0.6],
  ['whoosh', [false, true, 1], 0.6],
  ['whoosh', [false, false, 1], 0.6],
  ['charge', [false], 0.7],
  ['step', [0], 0.5],
  ['thud', [0.7, -0.3], 1],
  ['hiss', [0.8, 1.1, 0.3], 1.8],
  ['ropes', [], 0.8],
  ['shield', [], 0.7],
  ['shieldUp', [], 0.6],
  ['zap', [], 0.6],
  ['bell', [2], 2],
  ['ko', [], 2],
  ['lift', ['open', -0.3], 1.2],
  ['lift', ['rise', -0.3], 1.6],
  ['lift', ['arrive', -0.3], 1.6],
  ['fistBump', [], 0.8],
  ['countdown', [3], 1.2],
  ['countdown', [0], 1.5],
  ['stretcher', ['arrive'], 1],
  ['stretcher', ['depart'], 1.4],
  ['ui', ['start'], 0.5],
];

function kitScript(): Cue[] {
  const out: Cue[] = [];
  let t = 0.5;
  for (let round = 0; round < 3; round++) {
    for (const [m, a, len] of KIT) {
      out.push([+t.toFixed(3), m, ...a]);
      t += len;
    }
  }
  out.push([+t.toFixed(3), 'end']);
  return out;
}

/** A busy exchange with the walk-on before it: what a fight actually throws at the mix. */
function fightScript(): Cue[] {
  const out: Cue[] = [];
  // the walk-on starts with the entrance (ENTRY.start); the lift's cues come off the same clock
  const t0 = 0.5;
  out.push([t0, 'walkOn', 'anthem', 0, 0.62]);
  out.push([+(t0 + ENTRY.open - ENTRY.start).toFixed(3), 'lift', 'open', -0.4]);
  out.push([+(t0 + ENTRY.rise - ENTRY.start).toFixed(3), 'lift', 'rise', -0.4]);
  out.push([+(t0 + ENTRY.arrive - ENTRY.start).toFixed(3), 'lift', 'arrive', -0.4]);
  out.push([7, 'walkOnStop', 0.9]);
  for (let n = 3; n >= 1; n--) out.push([7 + (3 - n), 'countdown', n]);
  out.push([10, 'countdown', 0]);
  out.push([10, 'bell', 1]);
  out.push([11, 'fistBump']);
  // an exchange: steps, swings, hits and blocks a fifth of a second apart
  let t = 12;
  const seq: [string, unknown[]][] = [
    ['step', [0]], ['whoosh', [false, false, 1]], ['hit', [22, 'body', false, 'punch', 0.2, 0]], ['step', [1]],
    ['whoosh', [true, false, 1]], ['block', [45, -0.2, false]], ['step', [0]], ['whoosh', [false, true, 1]],
    ['hit', [70, 'body', false, 'kick', -0.3, 0.4]], ['thud', [0.45, -0.3]], ['step', [1]], ['charge', [true]],
    ['whoosh', [true, true, 1]], ['hit', [110, 'head', true, 'kick', 0.1, 0.8]], ['tink', [0.5, 0.2]], ['tink', [0.8, -0.1]],
    ['thud', [1, 0.1]], ['hiss', [0.9, 1.4, -0.2]], ['ropes', []], ['zap', []],
  ];
  for (let r = 0; r < 3; r++) for (const [m, a] of seq) {
    out.push([+t.toFixed(3), m, ...a]);
    t += 0.2;
  }
  out.push([+(t + 0.5).toFixed(3), 'ko']);
  out.push([+(t + 3).toFixed(3), 'bell', 2]);
  out.push([+(t + 6).toFixed(3), 'end']);
  return out;
}

/** ?script=repeat&m=ko&a=[]&n=12&gap=2.5: one call, many times (for a sound's average). */
function repeatScript(): Cue[] {
  const q = new URLSearchParams(location.search);
  const n = +(q.get('n') ?? 12);
  const gap = +(q.get('gap') ?? 2);
  const args = JSON.parse(q.get('a') ?? '[]') as unknown[];
  const out: Cue[] = [];
  for (let i = 0; i < n; i++) out.push([0.5 + i * gap, q.get('m') ?? 'ko', ...args]);
  out.push([0.5 + n * gap, 'end']);
  return out;
}

/** The kit wired up by its own unlock(), into an offline context instead of the speakers. */
async function liveSfx(ctx: OfflineAudioContext): Promise<AnySfx> {
  const s: AnySfx = new Sfx();
  s.muted = false;
  // the chant's clips and the voice list: fetched here (the dev server serves public/ as /public)
  s.manifest = Promise.resolve(null);
  s.chantJob = Promise.all(
    ['3', '2', '1', 'fight'].map(async (k) => {
      const b = await (await fetch(`/public/audio/count/${k}.mp3`)).arrayBuffer();
      s.chant[k] = await ctx.decodeAudioData(b);
    }),
  );
  await s.chantJob;
  // the whole impact bank now (the game renders it in idle moments)
  const bank = s.buildBank(RATE, (n: number) => ctx.createBuffer(1, n, RATE));
  while (bank.jobs.length) bank.make(bank.jobs.shift());
  const w = window as unknown as { AudioContext: unknown };
  const real = w.AudioContext;
  w.AudioContext = function () {
    return ctx;
  };
  try {
    s.unlock();
  } finally {
    w.AudioContext = real;
  }
  Object.defineProperty(s, 'ok', { get: () => true });
  if (new URLSearchParams(location.search).has('dry')) {
    // ?dry: no glue, limiter or clip (only MASTER's 0.7): the sounds' own levels
    s.master.disconnect();
    s.master.connect(s.out);
    s.out.disconnect();
    s.out.connect(ctx.destination);
  }
  return s;
}

export async function run() {
  const which = new URLSearchParams(location.search).get('script') ?? 'kit';
  if (which === 'sweep') {
    // 0.4 s steps of 1 kHz from -40 to +6 dBFS: into the effects bus, then into the master
    const levels: number[] = [];
    for (let db = -40; db <= 6; db += 2) levels.push(db);
    const step = 0.4;
    const len = levels.length * step * 2 + 0.5;
    const ctx = new OfflineAudioContext(2, Math.ceil(len * RATE), RATE);
    const s = await liveSfx(ctx);
    for (const [k, into] of [[0, s.master], [1, s.out]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = 1000;
      const g = ctx.createGain();
      g.gain.value = 0;
      levels.forEach((db, i) => g.gain.setValueAtTime(Math.pow(10, db / 20), (k * levels.length + i) * step));
      g.gain.setValueAtTime(0, (k + 1) * levels.length * step);
      o.connect(g).connect(into);
      o.start(k * levels.length * step);
      o.stop((k + 1) * levels.length * step);
    }
    const buf = await ctx.startRendering();
    await saveStereo('sweep', buf);
    await post('audio/sfx_ref/sweep.json', new TextEncoder().encode(JSON.stringify({ levels, step })));
    return 'ok sweep';
  }
  if (which === 'slap') {
    // the hit bus's room: one click (0.25) into it, alone
    const ctx = new OfflineAudioContext(2, RATE, RATE);
    const s = await liveSfx(ctx);
    const b = ctx.createBuffer(1, 64, RATE);
    b.getChannelData(0)[0] = 0.25;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(s.hits);
    src.start(0.1);
    await saveStereo('slap', await ctx.startRendering());
    return 'ok slap';
  }
  const script = which === 'fight' ? fightScript() : which === 'repeat' ? repeatScript() : kitScript();
  const end = script[script.length - 1][0] as number;
  const ctx = new OfflineAudioContext(2, Math.ceil(end * RATE), RATE);
  const s = await liveSfx(ctx);
  for (const [t, m, ...a] of script) {
    if (m === 'end') continue;
    void ctx.suspend(t).then(async () => {
      s[m](...a);
      if (m === 'countdown') clearTimeout(s.hallOff);
      // (a walk-on starts from a promise: let it land before the clock moves on)
      await new Promise((r) => setTimeout(r, 0));
      void ctx.resume();
    });
  }
  // walk-ons render on a promise: let it finish before the clock reaches the entrance
  if (script.some((c) => c[1] === 'walkOn')) s.primeWalkOn('anthem');
  await s.walkOns.get('anthem');
  const buf = await ctx.startRendering();
  await saveStereo(which + (new URLSearchParams(location.search).has('dry') ? '_dry' : ''), buf);
  await post(`audio/sfx_ref/${which}.json`, new TextEncoder().encode(JSON.stringify(script)));
  return `ok ${which} ${end}s`;
}

async function saveStereo(name: string, buf: AudioBuffer) {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    out[i * 2] = L[i];
    out[i * 2 + 1] = R[i];
  }
  await post(`audio/sfx_ref/${name}.f32`, new Uint8Array(out.buffer));
}
