// Bakes the fight's sound kit from the web game's own audio code, for godot/audio/sfx.gd:
//   node godot/tools/bake/web/run.mjs audio_sfx        -> godot/assets/audio/sfx/_raw/ (float PCM)
//   node --experimental-strip-types godot/tools/bake/web/audio_sfx_encode.ts
//                                                      -> godot/assets/audio/sfx/*.ogg and
//                                                         godot/audio/sfx_bank.gd (the manifest)
//
// - The impact bank: every ImpactKind of impacts.ts BANK, rendered by renderImpact itself, a
//   couple more variations than the web keeps, each with LEAD seconds of silence in front so
//   sfx.gd can land a layer a few milliseconds late (the web's flams) by starting it that much
//   further in; and each one's send into the arena slap (impw_*, band-limited as the web's).
// - Every one-shot sfx.ts builds from live nodes (its noise()/tone() calls): the real Sfx class
//   is pointed at an OfflineAudioContext with an empty impact bank, so each method renders only
//   its synthesized layers (its impacts are the bank's, played by sfx.gd). Sounds with random
//   noise get several variations; those whose level shapes the envelope get a few levels.
// - The six walk-on themes, rendered by renderWalkOn as the game renders them.
// - The crowd's 3-2-1-FIGHT chant (public/audio/count/*.mp3) through sfx.ts playChant: its four
//   voice layers out of step, the distance filter and the hall, as one stereo clip per call.
import { Sfx } from '../../../../src/audio/sfx';
import { BANK, renderImpact, type ImpactKind } from '../../../../src/audio/impacts';
import { renderWalkOn, WALK_ONS } from '../../../../src/audio/walkOn';
import { ENTRY } from '../../../../src/sim/entrance';
import { post } from './scene_bake';

export const RATE = 48000;
/** Silence in front of every impact (s): room for a layer's flam (sfx.ts hit/block/ko: up to 18 ms, at up to 1.6x speed). */
export const LEAD = 0.03;
/** Impact variations kept beyond the web's BANK count. */
const EXTRA = 2;
const SEED = 7331;

/** One baked clip: its name, channels, the gain its samples were normalised by, and what it is. */
interface Clip {
  name: string;
  channels: number;
  gain: number;
  dur: number;
}
const clips: Clip[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySfx = any;

/** A fresh Sfx wired straight into an offline context: no glue, no slap, no impact bank. */
function offlineSfx(ctx: OfflineAudioContext): AnySfx {
  const s: AnySfx = new Sfx();
  const g = ctx.createGain();
  g.connect(ctx.destination);
  s.ctx = ctx;
  s.master = g;
  s.hits = g;
  s.bank = {};
  // the same two seconds of white noise unlock() makes
  const len = ctx.sampleRate * 2;
  s.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = s.noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  // (an offline context is "suspended" until it renders; the kit only plays while "running")
  Object.defineProperty(s, 'ok', { get: () => true });
  return s;
}

/** Trim the silent tail (below -100 dBFS) off rendered channels. */
function trim(ch: Float32Array[], keepFrom = 0): Float32Array[] {
  let end = keepFrom;
  for (const c of ch) for (let i = c.length - 1; i > end; i--) if (Math.abs(c[i]) > 1e-5) { end = i; break; }
  end = Math.min(ch[0].length, end + 64);
  return ch.map((c) => c.slice(0, end));
}

/** Save channels as interleaved float32, normalised to a 0.9 peak (the gain goes in the manifest). */
async function save(name: string, ch: Float32Array[], normalise = true) {
  let peak = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  const k = normalise && peak > 0 ? 0.9 / peak : 1;
  const n = ch[0].length;
  const out = new Float32Array(n * ch.length);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch.length; c++) out[i * ch.length + c] = ch[c][i] * k;
  await post(`audio/sfx/_raw/${name}.f32`, new Uint8Array(out.buffer));
  clips.push({ name, channels: ch.length, gain: 1 / k, dur: n / RATE });
}

/** Render one of the kit's synthesized sounds: `play` calls the Sfx (or its tone/noise) at t = 0. */
async function synth(name: string, seconds: number, play: (s: AnySfx) => void) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  const s = offlineSfx(ctx);
  play(s);
  const buf = await ctx.startRendering();
  await save(name, trim([buf.getChannelData(0)]));
}

/** Variations of a synthesized sound: name_0, name_1... */
async function vars(name: string, n: number, seconds: number, play: (s: AnySfx) => void) {
  for (let v = 0; v < n; v++) await synth(`${name}_${v}`, seconds, play);
}

/**
 * What an impact sends into the hit bus's arena slap (sfx.ts makeHitBus): the echoes are darkened
 * by a 2.4 kHz low-pass and thinned by a 160 Hz high-pass, the same biquads as the web's. Baked
 * per variation (and encoded at 16 kHz, all it needs), so sfx.gd plays it as the impact's send
 * into the Hits bus, whose delay makes the echoes.
 */
async function slapSource(x: Float32Array) {
  const ctx = new OfflineAudioContext(1, x.length, RATE);
  const b = ctx.createBuffer(1, x.length, RATE);
  b.getChannelData(0).set(x);
  const src = ctx.createBufferSource();
  src.buffer = b;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 160;
  src.connect(lp).connect(hp).connect(ctx.destination);
  src.start();
  return (await ctx.startRendering()).getChannelData(0);
}

/** Durations the steam hiss is baked at (s): game.ts bursts run 0.29..1.75 s (steam.ts vent). */
export const HISS_DURS = [0.3, 0.386, 0.496, 0.638, 0.82, 1.055, 1.357, 1.745];
/** The level (k) the hiss is baked at; sfx.gd scales its peak (0.07 + 0.1 k) from there. */
export const HISS_K = 0.5;
/** Levels the thud's and the big hit's sub drop are baked at (their k), nearest one is played. */
export const THUD_KS = [0.15, 0.4, 0.7, 1];
export const HIT_KS = [0.2, 0.5, 0.8, 1];

export async function run() {
  // ------------------------------------------------------------- impacts.ts bank
  const bank: Record<string, number> = {};
  for (const k of Object.keys(BANK) as ImpactKind[]) {
    const n = BANK[k] + EXTRA;
    bank[k] = n;
    for (let v = 0; v < n; v++) {
      // (the web's own seeding: sfx.ts buildBank)
      const data = renderImpact(k, SEED + v * 131 + k.length, RATE);
      const lead = Math.round(LEAD * RATE);
      const ch = new Float32Array(lead + data.length);
      ch.set(data, lead);
      await save(`imp_${k}_${v}`, [ch], false);
      await save(`impw_${k}_${v}`, [await slapSource(ch)], false);
    }
  }

  // ------------------------------------------------------------- sfx.ts one-shots
  for (const p of [0, 1]) for (const k of [0, 1]) await vars(`whoosh_p${p}k${k}`, 4, 0.4, (s) => s.whoosh(!!p, !!k, 1));
  await synth('charge_punch', 0.45, (s) => s.charge(false));
  await synth('charge_kick', 0.45, (s) => s.charge(true));
  // thud(k) and a big hit: a sub drop whose level shapes its exponential decay
  for (let i = 0; i < THUD_KS.length; i++) await synth(`thud_tone_${i}`, 0.4, (s) => s.tone('sine', 70, 30, 0.3, 0.2 + 0.3 * THUD_KS[i]));
  for (let i = 0; i < HIT_KS.length; i++) await synth(`hit_tone_${i}`, 0.4, (s) => s.tone('sine', 62, 34, 0.3, 0.25 + 0.25 * HIT_KS[i]));
  for (let i = 0; i < HISS_DURS.length; i++) await vars(`hiss_${i}`, 2, HISS_DURS[i] + 0.4, (s) => s.hiss(HISS_K, HISS_DURS[i], 0));
  await vars('ropes', 4, 0.45, (s) => s.ropes());
  await vars('shield', 4, 0.4, (s) => s.shield());
  await synth('shield_up', 0.35, (s) => s.shieldUp());
  await synth('zap', 0.3, (s) => s.zap());
  await vars('stretcher_arrive', 3, 0.85, (s) => s.stretcher('arrive'));
  await synth('stretcher_lift', 1.25, (s) => s.stretcher('lift'));
  await synth('stretcher_cheer', 0.5, (s) => s.stretcher('cheer'));
  await vars('stretcher_depart', 3, 1.25, (s) => s.stretcher('depart'));
  // one strike of the bell: bell(times) rings it again every 0.32 s
  await synth('bell', 1.5, (s) => s.bell(1));
  await vars('ko_tail', 4, 1.1, (s) => s.ko());
  await vars('lift_open', 3, 1.0, (s) => s.lift('open'));
  await vars('lift_rise', 3, 1.4, (s) => s.lift('rise'));
  await vars('lift_arrive', 3, 1.2, (s) => s.lift('arrive'));
  await synth('fist_bump', 0.6, (s) => s.fistBump());
  for (const k of ['tap', 'select', 'back', 'start']) await synth(`ui_${k}`, 0.35, (s) => s.ui(k));
  // the countdown's drum under the chant (the chant itself is baked below)
  for (const n of [3, 2, 1, 0]) {
    await vars(`countdown_${n}`, 3, 0.65, (s) => {
      s.playChant = () => true;
      s.countdown(n);
    });
  }
  // what countdown plays without its chant clips: a tick on the beat
  await synth('countdown_tick', 0.15, (s) => s.tone('square', 660, 660, 0.06, 0.04, 0.02));

  // ------------------------------------------------------------- the chant
  const chant: Record<string, number> = {};
  const dec = new OfflineAudioContext(1, 1, RATE);
  for (const k of ['3', '2', '1', 'fight']) {
    const bytes = await (await fetch(`/public/audio/count/${k}.mp3`)).arrayBuffer();
    const clip = await dec.decodeAudioData(bytes);
    const seconds = clip.duration / 0.97 + 0.1 + 2.7;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
    const s = offlineSfx(ctx);
    s.chant[k] = clip;
    s.playChant(k, 1);
    clearTimeout(s.hallOff);
    const buf = await ctx.startRendering();
    await save(`chant_${k}`, trim([buf.getChannelData(0), buf.getChannelData(1)]));
    chant[k] = clip.duration;
  }

  // ------------------------------------------------------------- walk-ons
  for (const w of WALK_ONS) {
    const buf = await renderWalkOn(w.id, RATE);
    await save(`walkon_${w.id}`, [buf.getChannelData(0), buf.getChannelData(1)], false);
  }

  const manifest = {
    rate: RATE,
    lead: LEAD,
    bank,
    hissDurs: HISS_DURS,
    hissK: HISS_K,
    thudKs: THUD_KS,
    hitKs: HIT_KS,
    build: ENTRY.arrive - ENTRY.start,
    walkOns: WALK_ONS.map((w) => w.id),
    clips,
  };
  await post('audio/sfx/_raw/manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 1)));
  return `ok: ${clips.length} clips, ${clips.reduce((a, c) => a + c.dur * c.channels, 0).toFixed(1)} channel-seconds`;
}
