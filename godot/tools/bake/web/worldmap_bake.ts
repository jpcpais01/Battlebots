// Bakes the world map exactly as the web game builds it (src/render/map/world.ts WorldMap.build, at
// the phones' Med quality) into godot/assets/map/world.{json,bin}, for render/map/world_map.gd.
//   node godot/tools/bake/web/run.mjs worldmap_bake [--q quality=med]
//
// What the Godot side needs beyond the scene graph goes in the json's `map` record: the ground's
// height grid and the roofs grid (the map camera), the venue anchors, and tables of the things the
// web moves along curves in JS (the maglev train, the ferry, the funicular), sampled from the real
// web objects. Before baking, a few things are made cheaper for a phone without changing the look:
// the terrain chunks are merged four to a draw, the flat-shaded prop meshes are indexed (shared
// corners merged), and each instanced mesh's instances are packed as a Godot MultiMesh buffer
// (transform, a colour and a custom vec4 per instance) instead of being expanded into every vertex.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RenderSettings } from '../../../../src/render/settings';
import { WorldMap } from '../../../../src/render/map/world';
import { MAGLEV, MEGA, buildPlan } from '../../../../src/render/map/plan';
import { ISLAND, CITY_Y } from '../../../../src/render/map/layout';
import { SceneBake } from './scene_bake';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Each map ShaderMaterial's port (render/map/shaders/<kind>.gdshader), told apart by its GLSL. */
function kindOf(m: THREE.ShaderMaterial, o: THREE.Object3D): string | null {
  const f = m.fragmentShader, v = m.vertexShader, u = m.uniforms;
  const tests: [string, boolean][] = [
    ['terrain', f.includes('gridLine(')],
    ['far', f.includes('vWorld.xz / 300.0')],
    ['fresh', 'uMouthS' in u],
    ['sea', 'uDepth' in u],
    ['ribbon', f.includes('roadColor(kind')],
    ['building', 'uNeon' in u && v.includes('aSize')],
    ['tower', f.includes('advert(')],
    ['sign', v.includes('aSign')],
    ['traffic', v.includes('attribute vec2 aA, aB')],
    ['road_traffic', 'uPath' in u],
    ['beacons', f.includes('vec3(1.0, 0.15, 0.1)')],
    ['lamps', v.includes('most are sodium')],
    ['lights', v.includes('aInfo.x * uPx')],
    ['window', f.includes('step(0.002, vCol.r')],
    ['lh_beam', v.includes('position.x / 160.0')],
    ['searchlight', v.includes('vAlong = position.y /')],
    ['koi', f.includes('koi patches')],
    ['whale', v.includes('vBelly')],
    ['robot', 'uBones' in u],
    ['holo_ads', v.includes('aAd')],
    ['projections', 'uAds' in u],
    ['tree', v.includes('aCrown')],
    ['clouds', v.includes('aCentre')],
    ['pillar', 'uBoost' in u],
    ['mist', v.includes('aPuff')],
    ['wake', v.includes('p.x *= mix(1.0, 0.3, uv.y)')],
    ['glow_flicker', f.includes('floor(uTime * 9.0)')],
    ['glow', f.includes('mix(0.55, 1.0, uDusk) * uGlow')],
    ['lit', f.includes('vCol * mapLight(normalize(vN), vWorld)')],
  ];
  for (const [k, ok] of tests) if (ok) return k;
  return null;
}

/** The maglev's loop (city.ts maglevPath, which isn't exported): for the train's table. */
function maglevPath() {
  const { x0, z0, x1, z1, r, y } = MAGLEV;
  const p = new THREE.CurvePath<THREE.Vector3>();
  const v = (x: number, z: number) => new THREE.Vector3(x, y, z);
  const arc = (cx: number, cz: number, a0: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (k / 8) * (Math.PI / 2);
      pts.push(v(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
    return new THREE.CatmullRomCurve3(pts);
  };
  p.add(new THREE.LineCurve3(v(x0 + r, z0), v(x1 - r, z0)));
  p.add(arc(x1 - r, z0 + r, -Math.PI / 2));
  p.add(new THREE.LineCurve3(v(x1, z0 + r), v(x1, z1 - r)));
  p.add(arc(x1 - r, z1 - r, 0));
  p.add(new THREE.LineCurve3(v(x1 - r, z1), v(x0 + r, z1)));
  p.add(arc(x0 + r, z1 - r, Math.PI / 2));
  p.add(new THREE.LineCurve3(v(x0, z1 - r), v(x0, z0 + r)));
  p.add(arc(x0 + r, z0 + r, Math.PI));
  return p;
}

/** Index a flat, non-indexed mesh: corners shared by a face merged (a box: 36 vertices to 24). */
function indexed(g: THREE.BufferGeometry) {
  if (g.index) return g;
  const m = mergeVertices(g, 1e-5);
  m.computeBoundingSphere();
  return m;
}

export async function run() {
  const q = new URLSearchParams(location.search);
  const quality = (q.get('quality') ?? 'med') as 'low' | 'med' | 'high';
  RenderSettings.bloom = true;
  RenderSettings.quality = quality;
  try {
    localStorage.setItem('bb.mapNight', '0');
  } catch {
    /* ignore */
  }
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, 1, 20000);
  const map = await WorldMap.build(quality, cam, () => {});
  const w = map as unknown as Any;
  const u = map.u;
  const root = map.group;
  root.name = 'map';
  const [ground, roads, sea, city, towers, holo, trees, sites, clouds] = root.children;
  ground.name = 'ground';
  roads.name = 'roads';
  sea.name = 'sea';
  city.name = 'city';
  towers.name = 'towers';
  holo.name = 'holo';
  trees.name = 'trees';
  sites.name = 'sites';
  clouds.name = 'clouds';

  // ---------------------------------------------------------------- names for what Godot moves
  const ck = city.children;
  ck[0].name = 'buildings';
  const inst6 = ck.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh && (c as THREE.InstancedMesh).count === 6);
  inst6[0].name = 'train';
  inst6[1].name = 'train_glow';
  const wheel = ck.find((c) => c.type === 'Group' && c.children.length === 3 && (c.children[2] as THREE.InstancedMesh).isInstancedMesh)!;
  wheel.name = 'wheel';
  wheel.children[1].name = 'wheel_turn';
  wheel.children[2].name = 'wheel_gondolas';
  const rotors = ck.find((c) => (c as THREE.InstancedMesh).isInstancedMesh && c.name === '' && (c as THREE.InstancedMesh).count === 9)!;
  rotors.name = 'rotors';
  const lh = ck.find((c) => c.type === 'Group' && c.children.length === 2 && c.children[1].type === 'Group')!;
  lh.name = 'lighthouse';
  lh.children[1].name = 'lh_spin';
  towers.children[1].name = 'searchlights';
  const robot = holo.children.find((c) => 'uBones' in ((c as THREE.Mesh).material as THREE.ShaderMaterial).uniforms)!;
  robot.name = 'holo_robot';
  const pillars = sites.children.find((c) => ((c as THREE.Mesh).material as THREE.ShaderMaterial)?.uniforms?.uBoost)!;
  pillars.name = 'pillars';
  const ferry = sites.children[sites.children.length - 1];
  ferry.name = 'ferry';
  ferry.children[0].name = 'ferry_holder';
  ferry.children[0].children[1].name = 'ferry_wake';
  const lift = roads.children[roads.children.length - 1];
  lift.name = 'funicular';

  // ---------------------------------------------------------------- tables of what moves along curves
  const tables: Any = {};
  // the train: car 0's place for every metre along the loop (city.ts Train.update), sampled from the path
  {
    const path = maglevPath();
    const L = path.getLength();
    const pts: number[] = [];
    const n = Math.ceil(L);
    for (let i = 0; i <= n; i++) {
      const a = path.getPointAt(Math.min(i, L) / L);
      pts.push(a.x, a.y, a.z);
    }
    // (check against the web's own train after a step)
    const tr = w.city;
    tr.update(1, 0);
    const m = new THREE.Matrix4();
    (city.getObjectByName('train') as THREE.InstancedMesh).getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    const a = path.getPointAt(24 / L);
    tables.train = { L, step: 1, pts, check: [p.x - a.x, p.y - a.y - 1.8, p.z - a.z] };
    tr.update(L / 24 - 1, 0); // back where it started (s = 0)
  }
  // the ferry: out, a pause, back, a pause (sites.ts ferryBoat update), every quarter second of its cycle
  {
    const plan = buildPlan(quality);
    const pier = plan.docks.piers[1] ?? [223, 200, 241, 272];
    const route = new THREE.CatmullRomCurve3([
      new THREE.Vector3((pier[0] + pier[2]) / 2 + 16, 0, pier[3] - 6),
      new THREE.Vector3(260, 0, 360),
      new THREE.Vector3(320, 0, 470),
      new THREE.Vector3(480, 0, 590),
      new THREE.Vector3(ISLAND.x - 100, 0, ISLAND.z - 70),
    ]);
    const cycle = 2 * (route.getLength() / 9) + 2 * 14;
    const dt = 0.25;
    const pts: number[] = [];
    const holder = ferry.children[0];
    const wake = holder.children[1];
    for (let t = 0; t <= cycle + dt; t += dt) {
      map.sites.update(0, t);
      holder.updateMatrix();
      const e = holder.matrix.elements;
      // x, z, yaw (its +z towards where it heads), wake shown
      pts.push(holder.position.x, holder.position.z, Math.atan2(e[8], e[10]), wake.visible ? 1 : 0);
    }
    map.sites.update(0, 0);
    tables.ferry = { cycle, dt, pts };
  }
  // the funicular: up, wait, down, wait over 70 s (roads.ts lift update), every tenth of a second
  {
    const dt = 0.1;
    const pts: number[] = [];
    for (let t = 0; t <= 70 + dt; t += dt) {
      map.roads.update(t);
      pts.push(lift.position.x, lift.position.y, lift.position.z);
    }
    map.roads.update(0);
    tables.funicular = { cycle: 70, dt, pts, rot: lift.rotation.y };
  }

  // ---------------------------------------------------------------- tree detail: both versions of every tile
  // (nature.ts buildTrees: each tile swaps to its cheap trees past LOD_FAR; Godot keeps both and
  // shows one by distance, as the web's update(camera) does)
  const treeMeshes = trees.children.slice() as THREE.InstancedMesh[];
  const near = treeMeshes.map((m) => m.geometry);
  const far = new THREE.PerspectiveCamera();
  far.position.set(1e6, 0, 0);
  far.updateMatrixWorld();
  w.trees.update(far);
  // (one MultiMesh per tile, its mesh swapped by distance: the cheap trees' geometry rides along)
  const lod1 = new Map<THREE.Object3D, THREE.BufferGeometry>();
  treeMeshes.forEach((m, i) => {
    lod1.set(m, m.geometry);
    m.geometry = near[i];
    m.name = `tree${i}`;
  });

  // ---------------------------------------------------------------- fewer, cheaper draws
  // the fine terrain's chunks, four (2 x 2) to a draw
  {
    const chunks = ground.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    const cells = new Map<string, THREE.Mesh[]>();
    for (const c of chunks) {
      c.geometry.computeBoundingBox();
      const bb = c.geometry.boundingBox!;
      const key = `${Math.floor((bb.min.x + 1600 + 1) / 800)},${Math.floor((bb.min.z + 1600 + 1) / 800)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(c);
    }
    for (const [key, list] of cells) {
      const g = mergeGeometries(list.map((c) => c.geometry), false)!;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, list[0].material);
      m.name = `terrain_${key}`;
      m.matrixAutoUpdate = false;
      for (const c of list) ground.remove(c);
      ground.add(m);
    }
  }
  // flat-shaded props: shared corners merged
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    const g = m.geometry as THREE.BufferGeometry;
    if (g.index || (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry || g.attributes.position.count < 30) return;
    m.geometry = indexed(g);
  });

  // ---------------------------------------------------------------- bake
  const globals = new Map<unknown, string>([
    [u.uTime, 'time'],
    [u.uSunDir, 'sun_dir'],
    [u.uSunCol, 'sun_col'],
    [u.uSky, 'sky'],
    [u.uGnd, 'gnd'],
    [u.uShadow, 'shadow'],
    [u.uShadowHalf, 'shadow_half'],
    [u.uNoise, 'noise'],
    [u.uDusk, 'dusk'],
    [u.uNight, 'night'],
    [u.uGlow, 'glow'],
    [u.uFogOut, 'fog_out'],
    [u.uMapShift, 'map_shift'],
  ]);
  const bake = new SceneBake({ globals, kind: kindOf });
  const b = bake as unknown as Any;
  root.updateMatrixWorld(true);
  // instanced meshes go in as plain ones (their geometry once); their instances follow below
  const order: THREE.Object3D[] = [];
  const walk = (o: THREE.Object3D) => {
    order.push(o);
    o.children.forEach(walk);
  };
  walk(root);
  const instanced = new Set(order.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh));
  for (const o of instanced) (o as unknown as Any).isInstancedMesh = false;
  bake.add(root);
  for (const o of instanced) (o as unknown as Any).isInstancedMesh = true;
  // every instance as a Godot MultiMesh buffer wants it (transform 3 x 4 by rows, colour, custom):
  // buildings: aNeon in the colour's alpha, aInfo as custom (aSize is the instance's scale);
  // signs: aSign as custom
  order.forEach((o, i) => {
    if (!instanced.has(o)) return;
    const im = o as THREE.InstancedMesh;
    const rec = b.nodes[i] as Any;
    if (rec.name !== o.name) throw new Error('node order');
    if (rec.geometry === undefined) return;
    const g = im.geometry;
    const n = im.count;
    const out = new Float32Array(n * 20);
    const c = new THREE.Color();
    const e = im.instanceMatrix.array;
    const neon = g.attributes.aNeon, info = g.attributes.aInfo ?? g.attributes.aSign;
    for (let k = 0; k < n; k++) {
      const o20 = k * 20, m = k * 16;
      out.set([e[m], e[m + 4], e[m + 8], e[m + 12], e[m + 1], e[m + 5], e[m + 9], e[m + 13], e[m + 2], e[m + 6], e[m + 10], e[m + 14]], o20);
      c.setRGB(1, 1, 1);
      if (im.instanceColor) im.getColorAt(k, c);
      out.set([c.r, c.g, c.b, neon ? neon.getX(k) : 1], o20 + 12);
      if (info) for (let j = 0; j < 4; j++) out[o20 + 16 + j] = info.getComponent(k, j);
    }
    rec.multimesh = { buffer: b.buffer(out, 'float32'), count: n };
    const l1 = lod1.get(o);
    if (l1) rec.lod1 = b.geometry(l1, 'triangles', null);
  });
  // (the GLSL stays in the web source: left out of what ships)
  for (const m of b.materials as Any[]) delete m.src;
  // the shared textures (uniforms Godot owns): the noise, the shadow height map, the sea depth
  const sharedTex = { noise: b.texture(u.uNoise.value), shadow: b.texture(u.uShadow.value) };

  // the camera's ground and roofs (world.ts build: grid.at, roofs), sampled on their own grids
  const FINE = 1600, CELL = 12.5, N = Math.round((2 * FINE) / CELL) + 1;
  const hts = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hts[j * N + i] = w.cam.ground(-FINE + i * CELL, -FINE + j * CELL);
  const RC = 20, RN = 160;
  const roofs = new Float32Array(RN * RN);
  for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) roofs[j * RN + i] = w.cam.roofs((i - RN / 2 + 0.5) * RC, (j - RN / 2 + 0.5) * RC);
  const anchors: Any = {};
  for (const [id, a] of Object.entries(map.sites.anchors)) anchors[id] = [a.x, a.y, a.z];
  const extra = {
    map: {
      quality,
      textures: sharedTex,
      ground: { n: N, cell: CELL, half: FINE, buffer: b.buffer(hts, 'float32') },
      roofs: { n: RN, cell: RC, buffer: b.buffer(roofs, 'float32') },
      obstacles: Object.values(MEGA),
      anchors,
      pillarIds: Object.keys(map.sites.anchors),
      cityY: CITY_Y,
      tables,
    },
  };
  for (const t of Object.values(tables) as Any[]) t.pts = b.buffer(new Float32Array(t.pts), 'float32');
  const r = await bake.save('map/world', extra);
  console.log(JSON.stringify({ ...r, check: tables.train.check }));
  return r.warnings.length ? r.warnings.join('\n') : 'ok ' + JSON.stringify({ bytes: r.bytes, nodes: r.nodes, check: tables.train.check });
}
