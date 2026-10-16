// Bakes the live crowd's sounds from the web game's own synthesis, for godot/audio/crowd_audio.gd:
//   node godot/tools/bake/web/run.mjs audio_crowd
//   node --experimental-transform-types --no-warnings godot/tools/bake/web/audio_crowd_encode.ts
// The first writes raw float PCM and a manifest to godot/assets/audio/crowd/_raw/, the second
// encodes each to .ogg next to it (and drops _raw).
//
// What the web makes per session (crowd.ts Crowd.build: one seed, then murmur, ooh, cheer, roar,
// applause, boo, ooh, cheer), baked over several seeds so each Godot session draws its own set:
// - murmur / roar / applause beds: crowdSynth.ts murmur(), roar(), applause(); already seamless
//   loops (their finish() crossfades the tail into the head with CrowdRender.loopify).
// - ooh / cheer / boo reactions: crowdSynth.ts reaction().
// - whistles: crowd.ts Crowd.whistle(), a live oscillator graph, run on an OfflineAudioContext
//   (random type, pitch, wobble and pan per render, as the web picks per play).
import { applause, CROWD_RATE, murmur, prng, reaction, roar, type CrowdRender } from '../../../../src/audio/crowdSynth';
import { Crowd } from '../../../../src/audio/crowd';
import { post } from './scene_bake';

/** How many of each to bake. The web's session holds 1 of each bed, 2 ooh, 2 cheer, 1 boo. */
const COUNTS = { murmur: 4, roar: 4, applause: 4, ooh: 8, cheer: 8, boo: 4, whistle: 24 };
/** Whistles render at the gain the crowd mostly calls them with (0.4..0.6), then are scaled
 * up by this so the encoder sees a healthy level; crowd_audio.gd divides it back out. */
const WHISTLE_GAIN = 0.5;
const WHISTLE_SCALE = 32;
const WHISTLE_RATE = 44100;
/** What the live context plays the 22.05 kHz renders at. Chrome's AudioBufferSourceNode
 * resamples with linear interpolation, which takes a few dB off the top octave; Godot's cubic
 * resampler would not, so the renders go through the web's own playback here. */
const RATE = 44100;

type Job = { render: CrowdRender; finish: () => [Float32Array, Float32Array] };

/** Plays a crowd render the way Crowd.loop / Crowd.play do (an AudioBufferSourceNode at rate 1),
 * at RATE. A loop plays looping for exactly one period, so the result loops seamlessly too. */
async function playback(L: Float32Array, R: Float32Array, loop: boolean): Promise<[Float32Array, Float32Array]> {
  const n = Math.round((L.length * RATE) / CROWD_RATE);
  const ctx = new OfflineAudioContext(2, n, RATE);
  const b = ctx.createBuffer(2, L.length, CROWD_RATE);
  b.getChannelData(0).set(L);
  b.getChannelData(1).set(R);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.loop = loop;
  s.connect(ctx.destination);
  s.start();
  const out = await ctx.startRendering();
  return [out.getChannelData(0).slice(), out.getChannelData(1).slice()];
}

function interleave(L: Float32Array, R: Float32Array, k = 1) {
  const out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    out[2 * i] = L[i] * k;
    out[2 * i + 1] = R[i] * k;
  }
  return out;
}

function stats(L: Float32Array, R: Float32Array) {
  let s = 0, p = 0;
  for (const ch of [L, R]) for (let i = 0; i < ch.length; i++) {
    s += ch[i] * ch[i];
    p = Math.max(p, Math.abs(ch[i]));
  }
  return { rms: +Math.sqrt(s / (2 * L.length)).toFixed(4), peak: +p.toFixed(4) };
}

export async function run() {
  await post('audio/crowd/_raw/.gdignore', new Uint8Array());
  const rnd = prng(20261016);
  const files: Record<string, unknown>[] = [];
  const save = async (name: string, kind: string, seed: number, L: Float32Array, R: Float32Array, rate: number, loop: boolean, k = 1) => {
    await post(`audio/crowd/_raw/${name}.f32`, new Uint8Array(interleave(L, R, k).buffer));
    files.push({ name, kind, seed, rate, loop, seconds: +(L.length / rate).toFixed(4), ...stats(L, R) });
  };
  const synth: [keyof typeof COUNTS, (seed: number) => Job, boolean][] = [
    ['murmur', (s) => murmur(s), true],
    ['roar', (s) => roar(s), true],
    ['applause', (s) => applause(s), true],
    ['ooh', (s) => reaction('ooh', s), false],
    ['cheer', (s) => reaction('cheer', s), false],
    ['boo', (s) => reaction('boo', s), false],
  ];
  for (const [kind, make, loop] of synth) {
    for (let i = 0; i < COUNTS[kind]; i++) {
      const seed = (rnd() * 1e6) | 0;
      const job = make(seed);
      job.render.runAll();
      const [l, r] = job.finish();
      const [L, R] = await playback(l, r, loop);
      await save(`${kind}_${i}`, kind, seed, L, R, RATE, loop);
    }
  }
  // the whistle is a method of the live Crowd; it only touches ctx and bus, so give it those
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whistle = (Crowd.prototype as any).whistle as (this: { ctx: BaseAudioContext; bus: AudioNode }, gain: number) => void;
  for (let i = 0; i < COUNTS.whistle; i++) {
    const ctx = new OfflineAudioContext(2, Math.ceil(WHISTLE_RATE * 0.95), WHISTLE_RATE);
    const bus = ctx.createGain();
    bus.connect(ctx.destination);
    whistle.call({ ctx, bus }, WHISTLE_GAIN);
    const b = await ctx.startRendering();
    await save(`whistle_${i}`, 'whistle', 0, b.getChannelData(0), b.getChannelData(1), WHISTLE_RATE, false, WHISTLE_SCALE);
  }
  const manifest = { source: 'src/audio/crowdSynth.ts, src/audio/crowd.ts (Crowd.whistle)', whistle_gain: WHISTLE_GAIN, whistle_scale: WHISTLE_SCALE, counts: COUNTS, files };
  await post('audio/crowd/_raw/manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 1)));
  return `ok: ${files.length} sounds`;
}
