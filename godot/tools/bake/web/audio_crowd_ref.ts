// Web reference for the Godot crowd: replays a log from godot/tests/crowd_record.gd (each frame's
// events and crowdState) into the web game's own Crowd (src/audio/crowd.ts) on an
// OfflineAudioContext, frame by frame, and saves what it played:
//   node godot/tools/bake/web/run.mjs audio_crowd_ref --q 'log=/path/under/repo.json&out=audio/crowd/_ref/web'
// -> <out>.f32 (interleaved stereo float, 44.1 kHz) and <out>.json (the reactions it played and
// its faders each frame), under godot/assets/. The crowd goes straight to the output (no glue
// compressor), as it does in Godot while no bus layout routes it.
import { Crowd, type CrowdState } from '../../../../src/audio/crowd';
import { post } from './scene_bake';

type Frame = { dt: number; state: CrowdState | null; events: [string, unknown][] };
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function run() {
  const q = new URLSearchParams(location.search);
  const log = (await (await fetch(q.get('log')!)).json()) as { frames: Frame[] };
  const out = q.get('out') ?? 'audio/crowd/_ref/web';
  const sr = 44100;
  const total = log.frames.reduce((s, f) => s + f.dt, 0);
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * total), sr);
  // Crowd.play only sounds while the context runs; an offline one reads "suspended" at each stop
  Object.defineProperty(ctx, 'state', { get: () => 'running' });
  const crowd = new Crowd(ctx as unknown as AudioContext, ctx.destination);
  const c = crowd as unknown as Any;
  // its sounds render in idle moments: wait for the last (the second cheer)
  await new Promise<void>((r) => {
    const chk = () => ((c.shots.cheer?.length ?? 0) >= 2 ? r() : setTimeout(chk, 50));
    chk();
  });
  crowd.ambience(1);
  const played: [number, string, number][] = [];
  const play = c.play.bind(crowd);
  c.play = (cue: { kind: string; gain: number }) => {
    if (c.level > 0) played.push([c.time, cue.kind, cue.gain]);
    play(cue);
  };
  const mix: number[][] = [];
  const quantum = 128 / sr;
  const step = (f: Frame) => {
    for (const [type, data] of f.events) crowd.event(type, data);
    crowd.tick(f.dt, f.state);
    mix.push([c.gains.murmur.gain.value, c.gains.roar.gain.value, c.gains.applause.gain.value, c.tone.frequency.value, c.bus.gain.value, c.ducker.gain.value]);
  };
  // each frame's update lands when its audio starts (Godot mixes a frame's audio after its tick)
  let t = 0;
  const at = new Map<number, Frame[]>();
  for (const f of log.frames) {
    const k = Math.round(t / quantum);
    if (!at.has(k)) at.set(k, []);
    at.get(k)!.push(f);
    t += f.dt;
  }
  for (const [k, fs] of at) {
    if (k === 0) fs.forEach(step);
    else void ctx.suspend(k * quantum).then(() => {
      fs.forEach(step);
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const inter = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    inter[2 * i] = L[i];
    inter[2 * i + 1] = R[i];
  }
  await post(`${out}.f32`, new Uint8Array(inter.buffer));
  await post(`${out}.json`, new TextEncoder().encode(JSON.stringify({ played, mix, rate: sr })));
  return `ok: ${(L.length / sr).toFixed(1)} s, ${played.length} reactions`;
}
