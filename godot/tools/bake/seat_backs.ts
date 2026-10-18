// Moves the arena's 7,384 seat backs out of the stands' geometry and into the crowd's shader.
//
// The web game builds every seat back as a 10-point, 8-triangle shell (src/render/venue.ts), which
// is 59k of the stands' 91k triangles. Every seat already has a crowd sprite standing on it
// (an empty seat is a sprite too), so the crowd shader draws the shell inside that sprite's quad
// instead: it casts each pixel's view ray onto the real seat-back plane (same place, size, lean,
// rounded corners, shading and colour as the old geometry) and fills it where the fan is not.
//
// This rewrites godot/assets/venue/arena.{json,bin} in place:
// - drops the seat-back triangles (and the vertices only they used) from the batched stands;
// - tags each crowd sprite that sits on a bowl seat: iData.w (flags) += 16 * code, where code
//   (1 and up) packs the seat's centre to 2 mm (the sprite stands up to 4 cm off it) and the
//   shell's brightness (0..99, venue.ts' per-seat hash), for crowd.gdshader to decode. The flags stay
//   below 2^23, where a float still holds every integer and half.
// Run it after every arena bake (node godot/tools/bake/web/run.mjs venue); it does nothing on a
// bake it has already done.
//   node --experimental-transform-types --no-warnings godot/tools/bake/seat_backs.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { seats, ROWS } from '../../../src/render/bowl.ts';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BAKE = path.resolve(HERE, '../../assets/venue/arena');

// venue.ts SEAT_PTS: the shell's outline as (u across, v up) on the seat's 0.5 x 0.5 m quad
const SEAT_PTS: [number, number][] = [
  [0.094, 0.03], [0.5, 0.03], [0.906, 0.03], [0.906, 0.75], [0.845, 0.905],
  [0.69, 0.97], [0.5, 0.97], [0.31, 0.97], [0.155, 0.905], [0.094, 0.75],
];

const json: Any = JSON.parse(fs.readFileSync(BAKE + '.json', 'utf8'));
if (json.seatBacks === 'crowd') {
  console.log('seat backs already in the crowd shader: nothing to do');
  process.exit(0);
}
let raw = fs.readFileSync(BAKE + '.bin');
const packed = raw.subarray(0, 4).toString('ascii') === 'BBZ1';
if (packed) raw = zlib.zstdDecompressSync(raw.subarray(8));

const bufBytes = (id: number) => {
  const b = json.buffers[id];
  return raw.subarray(b.offset, b.offset + b.bytes);
};
const f32 = (id: number) => {
  const b = bufBytes(id);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const i32 = (id: number) => {
  const b = bufBytes(id);
  return new Int32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
// buffers this run rewrites, by id
const replaced = new Map<number, Buffer>();
const put = (id: number, a: Float32Array | Int32Array) => replaced.set(id, Buffer.from(a.buffer, a.byteOffset, a.byteLength));

// ------------------------------------------------------------- where every shell's points are
const bowl = seats();
const CELL = 0.01;
const grid = new Map<string, number[]>();
const cellKey = (x: number, y: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
bowl.forEach((st) => {
  // (venue.ts, the seat-back block)
  const nx = st.nx ?? 0, nz = st.nz ?? 0;
  const row = ROWS[st.row];
  const bx = st.x + nx * row.depth * 0.32, bz = st.z + nz * row.depth * 0.32;
  const tx = -nz * 0.25, tz = nx * 0.25;
  const y0 = st.y + 0.36, y1 = st.y + 0.86;
  for (const [u, v] of SEAT_PTS) {
    const w = 2 * u - 1;
    const p = [bx + tx * w + nx * 0.06 * v, y0 + (y1 - y0) * v, bz + tz * w + nz * 0.06 * v];
    const k = cellKey(p[0], p[1], p[2]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(...p);
  }
});
const isShellPoint = (x: number, y: number, z: number) => {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++)
      for (let c = -1; c <= 1; c++) {
        const list = grid.get(`${cx + a},${cy + b},${cz + c}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i += 3) {
          if (Math.abs(list[i] - x) < 1e-3 && Math.abs(list[i + 1] - y) < 1e-3 && Math.abs(list[i + 2] - z) < 1e-3) return true;
        }
      }
  return false;
};

// ------------------------------------------------------------- the stands, without the shells
let trisBefore = 0, trisAfter = 0, vertsBefore = 0, vertsAfter = 0;
for (const node of json.nodes as Any[]) {
  if (node.name !== 'batch-bowl' || node.geometry === undefined) continue;
  const g = json.geometries[node.geometry];
  if (g.groups.length) throw new Error('batch-bowl with groups: not handled');
  const pos = f32(g.attributes.position.buffer);
  const idx = i32(g.index.buffer);
  const n = pos.length / 3;
  const shell = new Uint8Array(n);
  for (let i = 0; i < n; i++) shell[i] = isShellPoint(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) ? 1 : 0;
  const keep: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (shell[idx[t]] && shell[idx[t + 1]] && shell[idx[t + 2]]) continue;
    keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  // compact: only the vertices something still uses, in first-use order
  const remap = new Int32Array(n).fill(-1);
  const order: number[] = [];
  const out = new Int32Array(keep.length);
  keep.forEach((v, i) => {
    if (remap[v] < 0) {
      remap[v] = order.length;
      order.push(v);
    }
    out[i] = remap[v];
  });
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name];
    const src = f32(a.buffer);
    const w = a.itemSize;
    const dst = new Float32Array(order.length * w);
    order.forEach((v, i) => dst.set(src.subarray(v * w, v * w + w), i * w));
    put(a.buffer, dst);
  }
  put(g.index.buffer, out);
  trisBefore += idx.length / 3;
  trisAfter += out.length / 3;
  vertsBefore += n;
  vertsAfter += order.length;
  g.vertices = order.length;
  g.index.count = out.length;
}
if (trisBefore === trisAfter) throw new Error('no seat backs found in the stands: has venue.ts changed?');

// ------------------------------------------------------------- tag the fans who sit on a seat
// seats sit 0.6 m apart in a row, and each row at its own height: a 0.1 m grid per height finds them
const bySeat = new Map<string, number>();
bowl.forEach((st, i) => {
  const k = `${Math.round(st.x * 10)},${Math.round(st.y * 100)},${Math.round(st.z * 10)}`;
  bySeat.set(k, i);
});
const findSeat = (x: number, y: number, z: number) => {
  let best = -1, bestD = 0.06 * 0.06;
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const i = bySeat.get(`${Math.round(x * 10) + a},${Math.round(y * 100)},${Math.round(z * 10) + b}`);
      if (i === undefined) continue;
      const st = bowl[i];
      const d = (st.x - x) ** 2 + (st.z - z) ** 2;
      if (Math.abs(st.y - y) < 1e-3 && d < bestD) {
        bestD = d;
        best = i;
      }
    }
  return best;
};
let tagged = 0, fans = 0;
const used = new Uint8Array(bowl.length);
for (const node of json.nodes as Any[]) {
  if (node.geometry === undefined) continue;
  const mat = json.materials[node.materials[0]];
  if (mat.kind !== 'crowd') continue;
  const g = json.geometries[node.geometry];
  const ip = f32(g.attributes.iPos.buffer);
  const data = f32(g.attributes.iData.buffer);
  const wp = g.attributes.iPos.itemSize, wd = g.attributes.iData.itemSize;
  // every sprite is four corners with the same per-fan data
  for (let v = 0; v < g.vertices; v += 4) {
    fans++;
    const x = ip[v * wp], y = ip[v * wp + 1], z = ip[v * wp + 2];
    const i = findSeat(x, y, z);
    if (i < 0) continue;
    if (used[i]) throw new Error('two fans on seat ' + i);
    used[i] = 1;
    const st = bowl[i];
    const jx = Math.max(0, Math.min(40, Math.round((st.x - x) * 500) + 20));
    const jz = Math.max(0, Math.min(40, Math.round((st.z - z) * 500) + 20));
    // venue.ts: k = ... * (0.85 + 0.3 * (((i * 2654435761) >>> 0) % 100) / 100)
    const r = Number((BigInt(i) * 2654435761n) & 0xffffffffn) % 100;
    const code = 1 + jx + 41 * jz + 1681 * r;
    if (16 * (code + 1) >= 1 << 23) throw new Error('flags past 2^23');
    for (let c = 0; c < 4; c++) {
      const f = (v + c) * wd + 3;
      if (data[f] >= 16) throw new Error('crowd flags already tagged');
      data[f] += 16 * code;
    }
    tagged++;
  }
  put(g.attributes.iData.buffer, data);
}
if (tagged !== bowl.length) throw new Error(`tagged ${tagged} fans for ${bowl.length} seats`);

// ------------------------------------------------------------- write the bake back
json.seatBacks = 'crowd';
const parts: Buffer[] = [];
let at = 0;
const place = (b: Buffer) => {
  const pad = (4 - (at % 4)) % 4;
  if (pad) {
    parts.push(Buffer.alloc(pad));
    at += pad;
  }
  const offset = at;
  parts.push(b);
  at += b.length;
  return offset;
};
json.buffers.forEach((b: Any, id: number) => {
  const bytes = replaced.get(id) ?? bufBytes(id);
  b.offset = place(Buffer.from(bytes));
  b.bytes = bytes.length;
});
for (const t of json.textures as Any[]) {
  if (!t.png) continue;
  const bytes = raw.subarray(t.png.offset, t.png.offset + t.png.bytes);
  t.png.offset = place(Buffer.from(bytes));
}
let body = Buffer.concat(parts);
if (packed) {
  const head = Buffer.alloc(8);
  head.write('BBZ1', 0, 'ascii');
  head.writeUInt32LE(body.length, 4);
  body = Buffer.concat([head, zlib.zstdCompressSync(body, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } })]);
}
fs.writeFileSync(BAKE + '.bin', body);
fs.writeFileSync(BAKE + '.json', JSON.stringify(json));
console.log(`stands: ${trisBefore} -> ${trisAfter} triangles, ${vertsBefore} -> ${vertsAfter} vertices; ${tagged} of ${fans} fans sit on a seat`);
