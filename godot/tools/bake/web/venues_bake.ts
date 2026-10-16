// Bakes the world map events' own venues (src/render/venues: island, harbor, grove, falls,
// rooftop) exactly as the web game builds them, for render/venues/ in the Godot app:
//   node godot/tools/bake/web/run.mjs venues_bake [--q "id=island,harbor"]
// -> godot/assets/venues/<id>.{json,bin}, and every venue ShaderMaterial translated to Godot by
// venues_glsl.ts -> godot/assets/venues/shaders/<hash>.gdshader (shared between venues).
//
// Left out: the show's pyro and confetti (the indoor arena's own are moved in: they're the same),
// so the Godot side reuses render/venue/show.gd. Named here, for what Godot drives: the venue's
// root ("outdoor"), its crowd, floor, sky dome, screens, gates, and what the venue's tick animates
// (gulls, boats, cranes, searchlights...), whose parameters are read back from the web objects
// into the JSON's `anim` (see the per-venue extractors below).
import * as THREE from 'three';
import { RenderSettings } from '../../../../src/render/settings';
import { contactAO } from '../../../../src/render/ao';
import { buildVenue } from '../../../../src/render/venues';
import type { ArenaId } from '../../../../src/game/events';
import { SceneBake, post } from './scene_bake';
import { translate, type GlslMaterial } from './venues_glsl';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The hand-ported kinds the venues share with the indoor arena (render/venue/venue_materials.gd). */
function knownKind(m: THREE.ShaderMaterial, o: THREE.Object3D): string | null {
  const u = m.uniforms;
  const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry;
  const has = (k: string) => k in u;
  if (has('uAtlas') && has('uBounds')) return 'crowd';
  if (has('uMap') && g.attributes.aLed) return m.defines?.ADS !== undefined ? 'led_ads' : 'led';
  if (has('uHit')) return 'gate';
  if (has('uDensity') && has('uSize') && !has('uSunDir')) return m.defines?.STEADY !== undefined ? 'glow_points_steady' : 'glow_points';
  return null;
}

/** Every Object3D in SceneBake.add's order (pre-order, skipping `skip`). */
function walk(o: THREE.Object3D, skip: Set<THREE.Object3D>, out: THREE.Object3D[] = []) {
  if (skip.has(o)) return out;
  out.push(o);
  for (const c of o.children) walk(c, skip, out);
  return out;
}

function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Run the venue's per-frame animation at time t. */
function tick(v: Any, t: number) {
  for (const f of v.tick as ((dt: number, t: number) => void)[]) f(0.016, t);
  v.group.updateMatrixWorld(true);
}

/** props.ts gulls: each bird's circle, height, speed, phase and size, read back from its matrices. */
function gullParams(v: Any, im: THREE.InstancedMesh) {
  const at = (t: number) => {
    tick(v, t);
    return Array.from({ length: im.count }, (_, i) => {
      const m = new THREE.Matrix4();
      im.getMatrixAt(i, m);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      m.decompose(p, q, s);
      return { p, s };
    });
  };
  const a = at(0), b = at(1), c = at(2);
  return a.map((_, i) => {
    // the circle through three points on it
    const [x1, y1, x2, y2, x3, y3] = [a[i].p.x, a[i].p.z, b[i].p.x, b[i].p.z, c[i].p.x, c[i].p.z];
    const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    const cx = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / d;
    const cz = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / d;
    const rad = Math.hypot(x1 - cx, y1 - cz);
    const a0 = Math.atan2(y1 - cz, x1 - cx), a1 = Math.atan2(y2 - cz, x2 - cx);
    const w = wrapA(a1 - a0);
    const ph = a0;
    const h = a[i].p.y - Math.sin(ph) * 1.5;
    return { cx, cz, rad, h, w, ph, s: a[i].s.x };
  });
}

/** Rebuild a gull's matrix from its parameters exactly as props.ts gulls does, to check the fit. */
function gullMatrix(b: Any, t: number) {
  const a = b.ph + t * b.w;
  const p = new THREE.Vector3(b.cx + Math.cos(a) * b.rad, b.h + Math.sin(t * 0.7 + b.ph) * 1.5, b.cz + Math.sin(a) * b.rad);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a - (b.w > 0 ? 0 : Math.PI), Math.sin(a) * 0.3));
  const flap = 0.7 + 0.3 * Math.sin(t * 7 + b.ph * 5);
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(b.s, b.s * flap * 1.6, b.s));
}

/** Objects whose transform, visibility or instance matrices the venue's tick changes, between
 * time t0 and any of the times ts. */
function moving(v: Any, t0: number, ts: number[]) {
  const snap = () => {
    const m = new Map<THREE.Object3D, string>();
    v.group.traverse((o: THREE.Object3D) => {
      let s = o.matrix.toArray().map((x) => x.toFixed(5)).join(',') + o.visible;
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) s += Array.from(im.instanceMatrix.array as Float32Array).map((x) => x.toFixed(4)).join(',');
      m.set(o, s);
    });
    return m;
  };
  tick(v, t0);
  const a = snap();
  const out = new Set<THREE.Object3D>();
  for (const t of ts) {
    tick(v, t);
    const b = snap();
    for (const [o, s] of a) if (b.get(o) !== s) out.add(o);
  }
  return [...out];
}

const mat4At = (im: THREE.InstancedMesh, i: number) => {
  const m = new THREE.Matrix4();
  im.getMatrixAt(i, m);
  return m;
};
const maxDiff = (a: THREE.Matrix4, b: THREE.Matrix4) => Math.max(...a.elements.map((x, k) => Math.abs(x - b.elements[k])));
const yxz = (x: number, y: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, 0, 'YXZ'));

/** rooftop.ts and the world map's city under it (map/city.ts, towers.ts, roads.ts): what the
 * tick moves, each read back and checked against the web's own transforms at another time. */
function rooftopAnim(v: Any, mv: THREE.Object3D[], anim: Any) {
  const T = 7.77;
  const errs: Record<string, number> = {};
  const err = (k: string, e: number) => (errs[k] = Math.max(errs[k] ?? 0, e));
  anim.beams = [];
  anim.spins = [];
  anim.inst = [];
  let beam = 0, spin = 0, inst = 0;
  for (const o of mv) {
    if (o.name === 'trainGlow') continue;
    tick(v, 0);
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      const at0 = Array.from({ length: im.count }, (_, i) => mat4At(im, i));
      const p0 = at0.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
      // towers.ts searchlights: a slow sweep round, leaning out and back
      const phs = at0.map((m) => new THREE.Euler().setFromRotationMatrix(m, 'YXZ').y);
      const sweep = (t: number, i: number) => new THREE.Matrix4().compose(p0[i], yxz(0.32 + 0.14 * Math.sin(t * 0.21 + phs[i] * 2.0), t * 0.12 + phs[i]), new THREE.Vector3(1, 1, 1));
      // city.ts rotors: turning about z where they stand
      const a0s = at0.map((m) => Math.atan2(m.elements[1], m.elements[0]));
      const rotor = (t: number, i: number) => new THREE.Matrix4().makeRotationZ(t * 0.9 + a0s[i]).setPosition(p0[i]);
      // city.ts wheel: the gondolas round the rim, hanging level
      const r = p0[0].x;
      const gondola = (t: number, k: number) => {
        const a = t * 0.05 + (k / im.count) * Math.PI * 2;
        return new THREE.Matrix4().makeTranslation(Math.cos(a) * r, r + 4 + Math.sin(a) * r, 0);
      };
      const at = (t: number) => {
        tick(v, t);
        return Array.from({ length: im.count }, (_, i) => mat4At(im, i));
      };
      const aT = at(T);
      const fits: [string, (t: number, i: number) => THREE.Matrix4][] = [['sweep', sweep], ['rotor', rotor], ['gondola', gondola]];
      let kind = '';
      for (const [k, f] of fits) {
        const e = Math.max(...aT.map((m, i) => maxDiff(m, f(T, i))));
        if (e < 1e-3) {
          kind = k;
          err(k, e);
          break;
        }
      }
      o.name = `inst${inst++}`;
      if (kind === 'sweep') anim.inst.push({ name: o.name, kind, p: p0.map((p) => p.toArray()), ph: phs });
      else if (kind === 'rotor') anim.inst.push({ name: o.name, kind, p: p0.map((p) => p.toArray()), a0: a0s });
      else if (kind === 'gondola') anim.inst.push({ name: o.name, kind, r });
      else if (im.count === 6) {
        // city.ts Train: the cars follow the maglev loop at 24 m/s; car 0's path read back step by
        // step (each tick moves it 0.016 s on), every 8th step kept
        const step = 0.016 * 24;
        const pts: number[] = [];
        tick(v, 0);
        const start = p0[0].clone();
        let n = 0;
        let len = 0;
        for (; n < 40000; n++) {
          const p = new THREE.Vector3().setFromMatrixPosition(mat4At(im, 0));
          if (n % 8 === 0) pts.push(p.x, p.y - 1.8, p.z);
          if (n > 200 && p.distanceTo(start) < step * 0.6) break;
          tick(v, 0);
          len += step;
        }
        const glow = (o.parent!.children.find((c) => c !== o && (c as THREE.InstancedMesh).isInstancedMesh && (c as THREE.InstancedMesh).count === 6) ?? null) as THREE.InstancedMesh | null;
        anim.train = { name: o.name, len, ds: step * 8, pts };
        if (glow) {
          glow.name = 'trainGlow';
          anim.train.glow = glow.name;
        }
        err('trainLoop', p0[0].distanceTo(start));
        kind = 'train';
      }
      if (!kind) console.log('rooftop: unknown instanced', o.name, im.count);
      continue;
    }
    // plain nodes
    tick(v, 0);
    const vis0 = o.visible, p0 = o.position.clone(), r0 = o.rotation.clone();
    tick(v, 0.6);
    if (o.visible !== vis0 && p0.equals(o.position)) {
      // rooftop.ts beacons: blinking together
      o.name = 'beacons';
      continue;
    }
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry.attributes.position.count === 34) {
      // rooftop.ts searchlights: ph = i * 1.7 (+ 0.4 east of the ring)
      const ph = beam * 1.7 + (p0.x > 0 ? 0.4 : 0);
      o.name = `beam${beam++}`;
      tick(v, T);
      err('beam', o.quaternion.angleTo(yxz(0.42 + 0.2 * Math.sin(T * 0.23 + ph * 2.0), T * 0.13 + ph)));
      anim.beams.push({ name: o.name, ph });
      continue;
    }
    // a steady turn about one axis (the lighthouse lamp, the Ferris wheel)
    tick(v, 1);
    const d = [o.rotation.x - r0.x, o.rotation.y - r0.y, o.rotation.z - r0.z];
    const ax = d.findIndex((x) => Math.abs(x) > 1e-6);
    if (ax >= 0 && p0.equals(o.position)) {
      const rate = d[ax];
      tick(v, T);
      const want = new THREE.Euler(r0.x, r0.y, r0.z);
      (want as Any)[['x', 'y', 'z'][ax]] += rate * T;
      err('spin', o.quaternion.angleTo(new THREE.Quaternion().setFromEuler(want)));
      o.name = `spin${spin++}`;
      anim.spins.push({ name: o.name, axis: ax, rate, rot: [r0.x, r0.y, r0.z] });
      continue;
    }
    if (!p0.equals(o.position)) {
      // roads.ts the lift: up, wait, down, wait, a 70 s round trip; its path kept every 0.25 s
      const pts: number[] = [];
      for (let t = 0; t <= 70.001; t += 0.25) {
        tick(v, t);
        pts.push(o.position.x, o.position.y, o.position.z);
      }
      tick(v, T);
      const k = T / 0.25, i = Math.floor(k), f = k - i;
      const e = new THREE.Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]).lerp(new THREE.Vector3(pts[i * 3 + 3], pts[i * 3 + 4], pts[i * 3 + 5]), f);
      err('lift', e.distanceTo(o.position));
      o.name = 'lift';
      anim.lift = { name: o.name, period: 70, dt: 0.25, pts };
      continue;
    }
    console.log('rooftop: unknown moving', o.type, o.name, (o as THREE.Mesh).geometry?.attributes?.position?.count);
  }
  anim.errs = errs;
}

/** Per venue: name what its tick animates and read back the parameters (see render/venues/*.gd). */
function extract(id: string, v: Any): Any {
  const anim: Any = {};
  // gulls (island, harbor, falls)
  v.group.traverse((o: THREE.Object3D) => {
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh && im.count === 9 && im.geometry.attributes.position.count === 6) {
      o.name = 'gulls';
      anim.gulls = gullParams(v, im);
      // the fit, checked against the web's own matrices at another time
      tick(v, 7.77);
      let err = 0;
      anim.gulls.forEach((b: Any, i: number) => {
        const m = new THREE.Matrix4();
        im.getMatrixAt(i, m);
        const e = gullMatrix(b, 7.77).toArray();
        m.toArray().forEach((x, k) => (err = Math.max(err, Math.abs(x - e[k]))));
      });
      anim.gullsErr = err;
    }
  });
  const mv = moving(v, 0, [1.3, 13.1, 31.7]).filter((o) => o.name !== 'gulls');
  if (id === 'island') {
    // island.ts: the sailboats bob (sin(0.9t + ph)), the ferry rides the swell (sin(0.8t))
    const WATER_Y = -0.62 - 0.9;
    anim.boats = [];
    let k = 0;
    for (const o of mv) {
      tick(v, 0);
      const y0 = o.position.y - (WATER_Y + 0.4);
      tick(v, Math.PI / 1.8);
      const y1 = o.position.y - (WATER_Y + 0.4);
      tick(v, 0);
      if (Math.abs(o.rotation.z) < 1e-9 && Math.abs(o.position.y - (WATER_Y + 0.45)) < 1e-6) {
        o.name = 'ferry';
        continue;
      }
      o.name = `boat${k++}`;
      // the phase from the bob is known up to whole turns (the web's is 0..10): the roll, at
      // 1.3 times it, tells which
      let ph = Math.atan2(y0 / 0.12, y1 / 0.12);
      if (ph < 0) ph += Math.PI * 2;
      const rx = o.rotation.x;
      if (Math.abs(Math.sin((ph + Math.PI * 2) * 1.3) * 0.03 - rx) < Math.abs(Math.sin(ph * 1.3) * 0.03 - rx)) ph += Math.PI * 2;
      anim.boats.push({ name: o.name, ph, yaw: o.rotation.y });
    }
  } else if (id === 'harbor') {
    // harbor.ts stsCrane: each crane's trolley, ropes and box; the tug's circuit
    const CRANES = [20, 74, 128];
    for (const o of mv) {
      tick(v, 0);
      const ci = CRANES.findIndex((x) => Math.abs(o.position.x - x) < 1e-6);
      if (ci < 0) {
        o.name = 'tug';
        continue;
      }
      const role = Math.abs(o.position.y - 42.4) < 1e-6 ? 'trolley' : o.scale.y !== 1 ? 'ropes' : 'box';
      o.name = `crane${ci}_${role}`;
    }
    anim.cranes = CRANES;
  } else if (id === 'rooftop') {
    rooftopAnim(v, mv, anim);
  }
  if (mv.length) console.log(id, 'moving', mv.map((o) => `${o.type}:${o.name}`).join(' '));
  // what the web shows at T, for tests/venues_animcheck.gd to hold the Godot port's tick to
  // (not the train: it moves on by dt, not by the clock)
  const T = 9.41;
  tick(v, T);
  const check: Any = { t: T, nodes: {} };
  v.group.traverse((o: THREE.Object3D) => {
    if (!o.name || !(mv.includes(o) || o.name === 'gulls') || o.name.startsWith('train')) return;
    const im = o as THREE.InstancedMesh;
    const rec: Any = { visible: o.visible, world: o.matrixWorld.toArray() };
    if (im.isInstancedMesh) rec.inst = Array.from({ length: Math.min(im.count, 3) }, (_, i) => o.matrixWorld.clone().multiply(mat4At(im, i)).toArray());
    check.nodes[o.name] = rec;
  });
  if (anim.train) delete check.nodes[anim.train.name];
  anim.check = check;
  tick(v, 0);
  return anim;
}

export async function run() {
  RenderSettings.bloom = true;
  RenderSettings.quality = 'high';
  contactAO.setQuality('high');
  const q = new URLSearchParams(location.search);
  const ids = (q.get('id') ?? 'island,harbor,grove,falls,rooftop').split(',') as ArenaId[];
  const quality = (q.get('quality') ?? 'high') as 'low' | 'med' | 'high';
  const results: string[] = [];
  const written = new Set<string>();
  for (const id of ids) {
    const arena = { uTime: { value: 0 }, uHype: { value: 0.3 } };
    const v = buildVenue(id, quality, arena) as unknown as Any;
    const anim = extract(id, v);
    v.group.name = 'outdoor';
    v.crowd.group.name = 'crowd';
    (v.floorMesh as THREE.Object3D).name = 'venueFloor';
    (v.group.children[0] as THREE.Object3D).name = 'skyDome';
    let screens = 0;
    v.group.traverse((o: THREE.Object3D) => {
      const m = (o as THREE.Mesh).material as Any;
      if (!m || Array.isArray(m)) return;
      if (m === v.screenMat) o.name = `scoreScreen${screens++}`;
      const gi = (v.gates as THREE.Material[]).indexOf(m);
      if (gi >= 0) o.name = `gate${gi}`;
    });
    const globals = new Map<unknown, string>([
      [arena.uTime, 'time'],
      [arena.uHype, 'hype'],
      [v.u.uFlash, 'flash'],
    ]);
    if (v.city?.mu) globals.set(v.city.mu.uTime, 'time');
    for (const k of ['uHouse']) {
      // the crowd's house exposure (house.ts) is the game's bb_house
      v.crowd.group.traverse((o: THREE.Object3D) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial;
        if (m?.uniforms?.[k]) globals.set(m.uniforms[k], 'house');
      });
    }
    // the crowd's figure atlas and its bounds are the indoor arena's (the same pixels, 15 MB raw):
    // the Godot side takes them from there
    const stub = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
    v.crowd.group.traverse((o: THREE.Object3D) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial;
      if (m?.uniforms?.uAtlas) {
        m.uniforms.uAtlas.value = stub;
        m.uniforms.uBounds.value = stub;
      }
    });
    const kindOf = (m: THREE.ShaderMaterial, o: THREE.Object3D) => knownKind(m, o) ?? 'glsl';
    const skip = new Set<THREE.Object3D>([v.show.group]);
    const bake = new SceneBake({ globals, kind: kindOf, skip });
    v.group.updateMatrixWorld(true);
    // the venue's root stays where it is (the ring is at the origin)
    bake.add(v.group);
    // translate every glsl material, per drawable (instancing and the attributes it has matter)
    const b = bake as unknown as Any;
    const objs = walk(v.group, skip);
    if (objs.length !== b.nodes.length) throw new Error(`walk ${objs.length} != bake ${b.nodes.length}`);
    const ports = new Map<string, string>();
    let glsl = 0;
    objs.forEach((o, i) => {
      const rec = b.nodes[i];
      if (rec.geometry === undefined) return;
      const mesh = o as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const geo = mesh.geometry as THREE.BufferGeometry;
      const attrs: Record<string, number> = {};
      for (const [k, a] of Object.entries(geo.attributes)) attrs[k] = k === 'color' ? 4 : (a as THREE.BufferAttribute).itemSize;
      const im = o as THREE.InstancedMesh;
      rec.gd = mats.map((m) => {
        const sm = m as THREE.ShaderMaterial;
        if (!sm.isShaderMaterial || knownKind(sm, o)) return null;
        const unis: GlslMaterial['uniforms'] = {};
        for (const [k, w] of Object.entries(sm.uniforms)) {
          const g = globals.get(w);
          if (g) unis[k] = { global: g };
          else if ((w.value as THREE.Texture)?.isTexture) {
            const t = w.value as THREE.Texture;
            unis[k] = { tex: { srgb: t.colorSpace === THREE.SRGBColorSpace, repeat: t.wrapS === THREE.RepeatWrapping || t.wrapT === THREE.RepeatWrapping, mip: t.generateMipmaps && t.minFilter >= THREE.NearestMipmapNearestFilter, nearest: t.magFilter === THREE.NearestFilter } };
          } else unis[k] = {};
        }
        const port = translate({
          vertex: sm.vertexShader,
          fragment: sm.fragmentShader,
          defines: sm.defines ?? {},
          uniforms: unis,
          side: sm.side,
          blending: sm.blending,
          blendSrc: sm.blendSrc as number,
          blendDst: sm.blendDst as number,
          transparent: sm.transparent,
          depthWrite: sm.depthWrite,
          depthTest: sm.depthTest,
          fog: sm.fog,
          attributes: attrs,
          instanced: !!im.isInstancedMesh,
          instanceColor: !!im.instanceColor,
          sky: o.name === 'skyDome',
        });
        const name = `shaders/${hash(port.code)}.gdshader`;
        ports.set(name, port.code);
        glsl++;
        return { shader: `res://assets/venues/${name}`, slots: port.slots, priority: o.renderOrder };
      });
    });
    for (const [name, code] of ports) {
      if (written.has(name)) continue;
      written.add(name);
      await post(`venues/${name}`, new TextEncoder().encode(code));
    }
    const r = await bake.save(`venues/${id}`, { anim, look: v.look, far: v.far, outer: v.outer, glsl, shaders: [...ports.keys()] });
    console.log(id, JSON.stringify({ ...r, glsl, shaders: ports.size }));
    results.push(`${id}: ${r.nodes} nodes, ${r.materials} materials, ${ports.size} shaders, ${(r.bytes / 1e6).toFixed(2)} MB raw${r.warnings.length ? ' WARN ' + r.warnings.join('; ') : ''} anim=${JSON.stringify(anim).slice(0, 300)}`);
  }
  return results.join('\n');
}
