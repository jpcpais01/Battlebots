// Bakes the animated home screens' sounds from the web game's own audio code
// (src/audio/homeSound.ts and the home one-shots of sfx.ts), for godot/render/home/home_sound.gd:
//   node godot/tools/bake/web/run.mjs homescene_audio      -> godot/assets/home/audio/_raw/ (float PCM)
//   node --experimental-strip-types godot/tools/bake/web/homescene_audio_encode.ts
//                                                          -> godot/assets/home/audio/*.ogg and
//                                                             godot/render/home/home_sound_bank.gd
//
// - Each place's bed (the lagoon's lapping, the gym's room tone, the rain) as a seamless loop: the
//   real HomeSound's own nodes rendered a little longer than the loop, the tail crossfaded into the head.
// - Each place's tune as one seamless 4-bar loop: the real step functions played for three loops and
//   the middle one kept, so the notes still ringing from the loop before are in its start.
// - The scattered sounds as a few variations each (the dove's coo, at a few pans; drips; thunder).
// - The one-shots (ring, the pick-up beeps, the bag, the chain, the TV alert, the door, the coffee).
import { HomeSound } from '../../../../src/audio/homeSound';
import { Sfx } from '../../../../src/audio/sfx';
import { renderImpact, type ImpactKind } from '../../../../src/audio/impacts';
import { post } from './scene_bake';

export const RATE = 48000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface Clip {
  name: string;
  channels: number;
  gain: number;
  dur: number;
  /** Loops: where it starts over (s), else 0. */
  loop: number;
}
const clips: Clip[] = [];

/** The same two seconds of white noise Sfx.unlock makes. */
function noise(ctx: BaseAudioContext) {
  const len = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** A HomeSound wired straight into an offline context, its bus open. */
function home(ctx: OfflineAudioContext): Any {
  const h: Any = new HomeSound(ctx as unknown as AudioContext, ctx.destination, noise(ctx));
  h.bus.gain.value = 1;
  return h;
}

/** A fresh Sfx wired straight into an offline context, with an impact bank of `kinds` (audio_sfx.ts offlineSfx). */
function offlineSfx(ctx: OfflineAudioContext, kinds: ImpactKind[] = []): Any {
  const s: Any = new Sfx();
  const g = ctx.createGain();
  g.connect(ctx.destination);
  s.ctx = ctx;
  s.master = g;
  s.hits = g;
  s.bank = {};
  for (const k of kinds) {
    s.bank[k] = [0, 1, 2].map((v) => {
      const data = renderImpact(k, 7331 + v * 131 + k.length, RATE);
      const b = ctx.createBuffer(1, data.length, RATE);
      b.getChannelData(0).set(data);
      return b;
    });
  }
  s.noiseBuf = noise(ctx);
  Object.defineProperty(s, 'ok', { get: () => true });
  return s;
}

function trim(ch: Float32Array[]): Float32Array[] {
  let end = 0;
  for (const c of ch) for (let i = c.length - 1; i > end; i--) if (Math.abs(c[i]) > 1e-5) { end = i; break; }
  end = Math.min(ch[0].length, end + 64);
  return ch.map((c) => c.slice(0, end));
}

/** Save channels as interleaved float32, normalised to a 0.9 peak (the gain goes in the manifest). */
async function save(name: string, ch: Float32Array[], loop = 0) {
  let peak = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  const k = peak > 0 ? 0.9 / peak : 1;
  const n = ch[0].length;
  const out = new Float32Array(n * ch.length);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch.length; c++) out[i * ch.length + c] = ch[c][i] * k;
  await post(`home/audio/_raw/${name}.f32`, new Uint8Array(out.buffer));
  clips.push({ name, channels: ch.length, gain: 1 / k, dur: n / RATE, loop });
}

/** Render `seconds` of whatever `play` sets going in a fresh context. */
async function render(seconds: number, channels: number, play: (ctx: OfflineAudioContext) => void) {
  const ctx = new OfflineAudioContext(channels, Math.ceil(seconds * RATE), RATE);
  play(ctx);
  const buf = await ctx.startRendering();
  return [...Array(channels).keys()].map((c) => buf.getChannelData(c));
}

/** A bed of `len` seconds that loops without a seam: rendered `fade` longer, the tail crossfaded over the head. */
async function bed(name: string, len: number, fade: number, place: (h: Any) => void) {
  const [x] = await render(len + fade + 1, 1, (ctx) => {
    const h = home(ctx);
    // the tune is baked on its own
    h.music.disconnect();
    place(h);
  });
  // (skip the first second: the noise loops start at random offsets and the LFOs settle)
  const s0 = RATE, n = Math.round(len * RATE), f = Math.round(fade * RATE);
  const out = x.slice(s0, s0 + n);
  for (let i = 0; i < f; i++) {
    const a = i / f;
    out[i] = out[i] * Math.sin(a * Math.PI / 2) + x[s0 + n + i] * Math.cos(a * Math.PI / 2);
  }
  await save(name, [out], len);
}

/** A place's tune as one seamless loop of `steps` eighths: three loops played, the middle one kept. */
async function tune(name: string, steps: number, eighth: number, swingK: number, place: (h: Any) => void, step: (h: Any, i: number, at: number) => void) {
  const len = steps * eighth;
  const [x] = await render(len * 3 + 0.2, 1, (ctx) => {
    const h = home(ctx);
    // only the music: the place's bed is baked on its own
    h.bus.disconnect();
    h.music.disconnect();
    h.music.connect(ctx.destination);
    h.music.gain.value = 1;
    place(h);
    for (let i = 0; i < steps * 3; i++) step(h, i, 0.1 + i * eighth + (i % 2 ? eighth * swingK : 0));
  });
  const s0 = Math.round((0.1 + len) * RATE), n = Math.round(len * RATE);
  await save(name, [x.slice(s0, s0 + n)], len);
}

export async function run() {
  // ------------------------------------------------------------- the beach
  await bed('beach_bed', 34, 2, (h) => h.beach());
  await tune('beach_music', 32, 30 / 86, 0.16, () => {}, (h, i, at) => h.beachStep(i, at));
  // a dove somewhere in the palms, at a few places left to right
  const pans = [-0.55, -0.3, -0.05, 0.2, 0.45, 0.6];
  for (let v = 0; v < pans.length; v++) {
    const ch = await render(1.4, 2, (ctx) => {
      const h = home(ctx);
      const r = Math.random;
      // (coo picks its pan with Math.random first: hand it this one)
      let first = true;
      Math.random = () => (first ? ((first = false), (pans[v] + 0.6) / 1.2) : r());
      h.coo(0.02);
      Math.random = r;
    });
    await save(`coo_${v}`, trim(ch));
  }
  await save('ring', trim(await render(1.0, 1, (ctx) => home(ctx).ring(ctx.destination))));
  await save('phone_beep', trim(await render(0.4, 1, (ctx) => offlineSfx(ctx).phoneBeep())));

  // ------------------------------------------------------------- the gym
  await bed('gym_bed', 10, 1.5, (h) => h.gym());
  await tune('gym_music', 32, 30 / 118, 0, (h) => h.gym(), (h, i, at) => h.gymStep(i, at));
  for (const [i, k] of [0.3, 0.65, 1].entries()) for (let v = 0; v < 2; v++) await save(`bag_hit_${i}_${v}`, trim(await render(1.2, 1, (ctx) => offlineSfx(ctx, ['thud']).bagHit(k))));
  for (let v = 0; v < 4; v++) await save(`chain_${v}`, trim(await render(0.5, 1, (ctx) => offlineSfx(ctx).chain(1))));
  await save('home_alert', trim(await render(3.2, 1, (ctx) => offlineSfx(ctx).homeAlert())));
  await save('door_open', trim(await render(2.2, 1, (ctx) => offlineSfx(ctx, ['block']).doorOpen())));

  // ------------------------------------------------------------- the lounge
  await bed('lounge_bed', 20, 2, (h) => h.lounge());
  await tune('lounge_music', 32, 30 / 76, 0.28, (h) => h.lounge(), (h, i, at) => h.loungeStep(i, at));
  for (let v = 0; v < 6; v++) await save(`drip_${v}`, trim(await render(0.3, 1, (ctx) => home(ctx).drip(0.02))));
  for (let v = 0; v < 3; v++) await save(`thunder_${v}`, trim(await render(5, 1, (ctx) => home(ctx).thunder(0.02, 1))));
  await save('spit', trim(await render(1.0, 1, (ctx) => offlineSfx(ctx).spit())));
  await save('gulp', trim(await render(0.4, 1, (ctx) => offlineSfx(ctx).gulp())));
  await save('mug_down', trim(await render(0.5, 1, (ctx) => offlineSfx(ctx, ['tink']).mugDown())));

  const manifest = { rate: RATE, beachBpm: 86, gymBpm: 118, loungeBpm: 76, bagKs: [0.3, 0.65, 1], clips };
  await post('home/audio/_raw/manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 1)));
  return `ok: ${clips.length} clips, ${clips.reduce((a, c) => a + c.dur * c.channels, 0).toFixed(1)} channel-seconds`;
}
