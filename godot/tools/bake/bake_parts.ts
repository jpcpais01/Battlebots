/**
 * Bakes every robot part the web game can build (src/render/parts.ts and its gear designs) into
 * godot/assets/bots/parts.bin, so the Godot app draws the very same armour without porting the
 * builders. Each part is welded, tessellated and size-ordered exactly as the web's SkinBuilder
 * does (skin.ts), in its bone's rest frame; the app only concatenates parts per loadout.
 *
 *   THREE_MODULE=.../three.module.js node --experimental-transform-types --no-warnings \
 *     --import ./godot/tools/node/register.mjs godot/tools/bake/bake_parts.ts
 *
 * File: "BBPK" u32 version u32 parts, then a table of (key: u16 length + utf8, u32 offset,
 * u32 packed size, u32 size), then each part zstd-compressed on its own (the app unpacks only
 * the parts a fight needs). A part is the opaque and the emissive family, each: u32 vertices,
 * u32 indices, u32 groups, f32 pos[v*3], f32 nor[v*3], f32 tag[v], u32 index[i],
 * (f32 radius, u32 indexEnd)[groups].
 * Triangles wind clockwise (Godot's front faces).
 * tag: opaque = material key (OPAQUE_KEYS), emissive = 0 accent glow, 1 core, 2 rarity.
 * Groups are size-ordered piece runs (biggest first; radius -1 = always drawn).
 *
 * A core only moves with the chest it sits on (where the chest puts it), so each core look is
 * baked once on chest 0, split into its front unit and back reactor ("coreF/l", "coreB/l"), and
 * parts.json carries per chest how far each half shifts (coreShift); the app hangs the halves on
 * bones of their own.
 */
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';
import * as P from '../../../src/render/parts';
import { SkinBuilder } from '../../../src/render/skin';
import { samplePB, partRadius } from '../../../src/render/contact';
import { surf, type Surfaces } from '../../../src/render/bake';
import { PB } from '../../../src/render/partKit';

const OPAQUE_KEYS = ['paint', 'paint2', 'metal', 'chrome', 'dark', 'joint', 'brass', 'glass', 'rubber', 'steel', 'carbon', 'alu'] as const;
const LOOKS = 18;

// a surface per key whose metalness carries the key's index (colour management can't touch it)
const surfaces = Object.fromEntries(OPAQUE_KEYS.map((k, i) => [k, surf(0xffffff, i, 0)])) as unknown as Surfaces;

let out: Buffer[] = [];
const table: { key: string; data: Buffer }[] = [];
const u32 = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); out.push(b); };
const f32s = (a: ArrayLike<number>) => { const b = Buffer.alloc(a.length * 4); for (let i = 0; i < a.length; i++) b.writeFloatLE(a[i], i * 4); out.push(b); };
const u32s = (a: ArrayLike<number>) => { const b = Buffer.alloc(a.length * 4); for (let i = 0; i < a.length; i++) b.writeUInt32LE(a[i], i * 4); out.push(b); };

let parts = 0;
let verts = 0;
function family(geo: any, lod: any, opaque: boolean) {
  const pos = geo.attributes.position.array as Float32Array;
  const n = pos.length / 3;
  const index = geo.index.array as ArrayLike<number>;
  const radii: Float32Array = lod.radii;
  const ends: Uint32Array = lod.ends;
  u32(n);
  u32(index.length);
  u32(radii.length);
  f32s(pos);
  if (opaque) f32s(geo.attributes.normal.array);
  else f32s(new Float32Array(n * 3));
  // (a float per vertex: the app hands it to the GPU as it is)
  const tag = new Float32Array(n);
  if (opaque) {
    const mr = geo.attributes.mr.array as Float32Array;
    for (let i = 0; i < n; i++) tag[i] = Math.round(mr[i * 2]);
  } else {
    const ech = geo.attributes.ech.array as Float32Array;
    for (let i = 0; i < n; i++) tag[i] = Math.min(2, Math.round(ech[i]));
  }
  f32s(tag);
  // Godot's front faces wind clockwise, three's counter-clockwise: swap two corners of each
  const flipped = new Uint32Array(index.length);
  for (let k = 0; k < index.length; k += 3) {
    flipped[k] = index[k];
    flipped[k + 1] = index[k + 2];
    flipped[k + 2] = index[k + 1];
  }
  u32s(flipped);
  const g = Buffer.alloc(radii.length * 8);
  for (let i = 0; i < radii.length; i++) {
    g.writeFloatLE(radii[i] === Infinity ? -1 : radii[i], i * 8);
    g.writeUInt32LE(ends[i], i * 8 + 4);
  }
  out.push(g);
  verts += n;
}

/** One part: `keep` for parts stretched at run time (never tessellated, always drawn). */
function part(key: string, pb: PB, keep = false) {
  const sb = new SkinBuilder(surfaces, keep ? new Set([0]) : new Set());
  // rarity pieces bake as channel 2 (the first slot): the app adds its slot
  sb.add(pb, 0, 'head', 0);
  const { opaque, emissive, opaqueLod, emissiveLod } = sb.build();
  out = [];
  family(opaque, opaqueLod, true);
  family(emissive, emissiveLod, false);
  table.push({ key, data: Buffer.concat(out) });
  parts++;
}

const t0 = performance.now();
for (let l = 0; l < LOOKS; l++) {
  part(`head/${l}`, P.buildHead(l));
  part(`torso/${l}`, P.buildTorso(l));
  part(`upperArm/${l}/-1`, P.buildUpperArm(l, -1));
  part(`upperArm/${l}/1`, P.buildUpperArm(l, 1));
  const core = P.buildCore(l, 0);
  const front = new PB(), back = new PB();
  for (const e of core.entries) (e.m.elements[14] > 0 ? front : back).entries.push(e);
  part(`coreF/${l}`, front);
  part(`coreB/${l}`, back);
  part(`forearm/${l}`, P.buildForearm(l));
  part(`fist/${l}/1`, P.buildFist(l, 1));
  part(`fist/${l}/-1`, P.buildFist(l, -1));
  part(`pelvis/${l}`, P.buildPelvis(l));
  part(`thigh/${l}`, P.buildThigh(l));
  part(`shin/${l}`, P.buildShin(l));
  part(`shinGuard/${l}`, P.buildShinGuard(l));
  part(`foot/${l}`, P.buildFoot(l));
  part(`toe/${l}`, P.buildToe(l));
}
part('neck', P.buildNeck(), true);
part('spine', P.buildSpine(), true);
part('rocket', P.buildRocketPiston(), true);
// pistons: the sizes botModel.ts uses (arm, leg, heavy leg)
for (const [len, r] of [[0.13, 0.018], [0.2, 0.024], [0.2, 0.024 * 1.35]]) part(`barrel/${len}/${+r.toFixed(4)}`, P.buildPistonBarrel(len, r));
for (const [len, r] of [[0.17, 0.018], [0.25, 0.024], [0.25, 0.024 * 1.35]]) part(`rod/${len}/${+r.toFixed(4)}`, P.buildPistonRod(len, r));

// limb radii for the contact pass, from the bare armour (botModel.ts)
const band = (pts: number[], lo: number, hi: number) => {
  const o: number[] = [];
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] >= lo && pts[i + 1] <= hi) o.push(pts[i], pts[i + 1], pts[i + 2]);
  return o;
};
const radii: Record<string, number[]> = { upper: [], fore: [], fist: [], thigh: [], shin: [] };
for (let l = 0; l < LOOKS; l++) {
  radii.upper.push(partRadius(band(samplePB(P.buildUpperArm(l, 1)), 0.12, 0.3), 0.6));
  radii.fore.push(partRadius(band(samplePB(P.buildForearm(l)), 0.08, 0.27), 0.6));
  radii.fist.push(partRadius(samplePB(P.buildFist(l, 1)), 0.45, 0, 0.02, 0));
  radii.thigh.push(partRadius(band(samplePB(P.buildThigh(l)), 0.12, 0.4), 0.6));
}
// shin: [kick look * 18 + leg look]
for (let k = 0; k < LOOKS; k++)
  for (let l = 0; l < LOOKS; l++) radii.shin.push(partRadius(band(samplePB(P.buildShinGuard(k), undefined, samplePB(P.buildShin(l))), 0.1, 0.38), 0.6));
// per chest look: how far the core's front unit and back reactor move from where chest 0 puts them
// (checked: every core look moves the same way, and only by translation)
const coreShift: number[][] = [];
for (let c = 0; c < LOOKS; c++) {
  let f: number[] | null = null, b: number[] | null = null;
  for (let l = 0; l < LOOKS; l++) {
    const e0 = P.buildCore(l, 0).entries, e1 = P.buildCore(l, c).entries;
    if (e0.length !== e1.length) throw new Error(`core ${l} on chest ${c}: different pieces`);
    for (let i = 0; i < e0.length; i++) {
      const a = e0[i].m.elements, m = e1[i].m.elements;
      for (let k = 0; k < 12; k++) if (Math.abs(a[k] - m[k]) > 1e-9) throw new Error(`core ${l} on chest ${c}: not a translation`);
      const d = [m[12] - a[12], m[13] - a[13], m[14] - a[14]];
      const front = a[14] > 0;
      const prev = front ? f : b;
      if (prev && prev.some((v, k) => Math.abs(v - d[k]) > 1e-9)) throw new Error(`core ${l} on chest ${c}: pieces move apart`);
      if (front) f = d;
      else b = d;
    }
  }
  coreShift.push([...(f ?? [0, 0, 0]), ...(b ?? [0, 0, 0])]);
}
const coreColors = Array.from({ length: LOOKS }, (_, l) => P.coreColor(l));

const packed = table.map((t) => zlib.zstdCompressSync(t.data, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } }));
const keys = table.map((t) => Buffer.from(t.key, 'utf8'));
let offset = 12 + keys.reduce((s, k) => s + 2 + k.length + 12, 0);
const head = Buffer.alloc(offset);
head.write('BBPK', 0, 'ascii');
head.writeUInt32LE(1, 4);
head.writeUInt32LE(parts, 8);
let o = 12;
table.forEach((t, i) => {
  head.writeUInt16LE(keys[i].length, o);
  keys[i].copy(head, o + 2);
  o += 2 + keys[i].length;
  head.writeUInt32LE(offset, o);
  head.writeUInt32LE(packed[i].length, o + 4);
  head.writeUInt32LE(t.data.length, o + 8);
  o += 12;
  offset += packed[i].length;
});
const raw = table.reduce((s, t) => s + t.data.length, 0);
const dir = new URL('../../assets/bots/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(new URL('parts.bin', dir), Buffer.concat([head, ...packed]));
fs.writeFileSync(new URL('parts.json', dir), JSON.stringify({ opaqueKeys: OPAQUE_KEYS, radii, coreShift, coreColors }) + '\n');
console.log(`${parts} parts, ${verts} vertices, ${(raw / 1e6).toFixed(1)} MB raw, ${(offset / 1e6).toFixed(1)} MB packed, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
