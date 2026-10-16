// Bakes the animated home screens' places exactly as the web game builds them
// (src/render/home/beach.ts, gym.ts, lounge.ts) into godot/assets/home/<id>.{json,bin}, for
// godot/render/home/home_stage.gd. Nodes the Godot side animates are named here, reaching into the
// web classes; every hooked material (onBeforeCompile) is tagged with its program key in
// userData.key, so Godot can give it the matching hand-ported shader.
//   node godot/tools/bake/web/run.mjs homescene_bake --q "id=beach"     (beach, gym, lounge or all)
//   node godot/tools/bake/web/run.mjs homescene_bake --q "id=beach&list=1"   (inventory only)
import * as THREE from 'three';
import { RenderSettings } from '../../../../src/render/settings';
import { contactAO } from '../../../../src/render/ao';
import { SceneBake } from './scene_bake';
import { Baker, surf } from '../../../../src/render/bake';
import { G } from '../../../../src/render/parts';
import { putS } from '../../../../src/render/home/scene';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Every material's program key (vertexPBR, the wood grain, the plants' breeze...) where the bake sees it. */
function tagMaterials(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) {
      const ns = (x as THREE.MeshStandardMaterial).normalScale;
      if ((x as THREE.MeshStandardMaterial).normalMap && ns) x.userData.normalScale = [ns.x, ns.y];
      if (x.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) continue;
      const key = x.customProgramCacheKey();
      if (key && !x.userData.key) x.userData.key = key;
    }
  });
}

function inventory(root: THREE.Object3D) {
  const rows: string[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const path: string[] = [];
    for (let p: THREE.Object3D | null = o; p; p = p.parent) path.unshift(p.name || p.type);
    if (!(m as unknown as { material?: unknown }).material) {
      rows.push(`  ${path.slice(-3).join('/')} (${o.children.length} children)`);
      return;
    }
    const g = m.geometry as THREE.BufferGeometry;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const attrs = Object.entries(g.attributes).map(([k, a]) => `${k}:${(a as THREE.BufferAttribute).itemSize}`);
    for (const mat of mats) {
      const sm = mat as THREE.ShaderMaterial;
      const kind = sm.isShaderMaterial ? 'Shader[' + Object.keys(sm.uniforms).join(',') + ']' : mat.type;
      rows.push(
        `${o.type} ${path.slice(-3).join('/')} v=${g.attributes.position?.count ?? 0} i=${g.index?.count ?? 0} n=${(o as THREE.InstancedMesh).count ?? '-'} ${kind} key=${mat.userData.key ?? ''} map=${!!(mat as Any).map} nmap=${!!(mat as Any).normalMap} side=${mat.side} blend=${mat.blending} at=${mat.alphaTest} tr=${mat.transparent} ao=${!!mat.userData.ao} [${attrs.join(' ')}] ro=${o.renderOrder} cs=${o.castShadow}`,
      );
    }
  });
  return rows.join('\n');
}

/** The web ShaderMaterials of the home scenes, by what they are. */
function kindOf(m: THREE.ShaderMaterial, o: THREE.Object3D): string | null {
  if (o.name && /^(sky|flare|water)$/.test(o.name)) return o.name;
  const u = m.uniforms;
  if ('uOpacity' in u && 'uSides' in u) return 'shaft';
  // the lounge's (lounge.ts): the rainy window, the headlights on the ceiling, the steam, the dust
  if ('uNear' in u && 'uFar' in u) return 'window';
  if ('uCol' in u && 'uNoise' in u && !('uViewH' in u)) return 'sweep';
  if ('uOpacity' in u && 'uColor' in u && 'uNoise' in u) return 'steam';
  if ('uViewH' in u) return 'motes';
  return o.name ? `named:${o.name}` : 'unknown:' + Object.keys(u).join(',');
}

async function beach(renderer: THREE.WebGLRenderer, list: boolean) {
  const { Beach } = await import('../../../../src/render/home/beach');
  const b = new Beach(renderer, 'high') as unknown as Any;
  const g = b.group as THREE.Group;
  g.visible = true;
  g.name = 'beach';
  const [dome, flare, sand, water, grove, plants] = g.children;
  dome.name = 'sky';
  flare.name = 'flare';
  sand.name = 'sand';
  water.name = 'water';
  grove.name = 'grove';
  plants.name = 'plants';
  ['bush', 'vine', 'tuft', 'jungle'].forEach((n, i) => (plants.children[i].name = n));
  (b.near as THREE.Object3D).name = 'near';
  (b.phone as THREE.Object3D).name = 'phone';
  (b.phone as THREE.Object3D).children[1].name = 'phoneScreen';
  (b.coconut as THREE.Object3D).name = 'coconut';
  (b.holo as THREE.Object3D).name = 'holo';
  (b.birds as THREE.Object3D).name = 'birds';
  (b.glasses as THREE.Object3D).name = 'glasses';
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as Any;
    if (m && m.map && m.opacity === 0.3 && m.depthWrite === false) o.name = 'footprints';
  });
  const root = new THREE.Group();
  root.name = 'root';
  root.add(g, b.glasses);
  tagMaterials(root);
  root.updateMatrixWorld(true);
  if (list) return inventory(root);
  const bake = new SceneBake({ globals: new Map([[b.time, 'time'], [b.sway, 'sway'], [b.sunView, 'sun_view']]), kind: kindOf });
  bake.add(root);
  const r = await bake.save('home/beach', {});
  console.log(JSON.stringify(r));
  return r.warnings.length ? r.warnings.join('\n') : 'ok';
}

/** Name the meshes drawn with material `m` (the first gets `name`, the rest name_1, name_2...). */
function nameByMaterial(root: THREE.Object3D, m: THREE.Material, name: string) {
  let n = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).material === m) o.name = n++ ? `${name}_${n - 1}` : name;
  });
}

async function gym(renderer: THREE.WebGLRenderer, list: boolean) {
  const { Gym } = await import('../../../../src/render/home/gym');
  const b = new Gym(renderer, 'high') as unknown as Any;
  const g = b.group as THREE.Group;
  g.visible = true;
  g.name = 'gym';
  // what the Godot side moves or relights, by name
  const named: [string, THREE.Object3D][] = [
    ['bag', b.bag], ['bagBody', b.bagBody], ['leafL', b.leafL], ['leafR', b.leafR], ['debBall', b.debBall], ['debTop', b.debTop],
    ['debBot', b.debBot], ['fanHead', b.fanHead], ['fanBlades', b.fanBlades], ['cctv', b.cctv], ['motes', b.motes], ['lampDust', b.lampDust],
  ];
  for (const [n, o] of named) o.name = n;
  (b.fans as THREE.Object3D[]).forEach((o, i) => (o.name = `fan${i}`));
  (b.banners as THREE.Object3D[]).forEach((o, i) => (o.name = `banner${i}`));
  (b.hands as THREE.Object3D[]).forEach((o, i) => (o.name = `hand${i}`));
  for (const [n, m] of [['blast', b.blast], ['leak', b.leak], ['spill', b.spill], ['ray', b.rays], ['sign', b.sign], ['neon', b.neon], ['neonWash', b.neonWash], ['led', b.ledMat], ['tube', b.tubeMat]] as [string, THREE.Material][]) nameByMaterial(g, m, n);
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as Any;
    if (m?.map === b.timerTex) o.name = 'timer';
    if (m?.map === b.tvTex) o.name = 'tv';
  });
  // the chain is built for each robot's size (gym.ts chainGeo): one link to lay along it
  (b.chain as THREE.Mesh).removeFromParent();
  const lb = new Baker();
  putS(lb, G.torus(0.022, 0.0055, 5, 10), 0, 0, 0, surf(0xd7dce2, 1, 0.12), 1, 1.45, 1);
  const link = new THREE.Mesh(lb.build().opaque!, b.chainMat);
  link.name = 'chainLink';
  link.visible = false;
  g.add(link);
  // the walls', floor's and mat's grime (gym.ts wearPatch) only lives in their shader hook: run the
  // hook on a stand-in program to catch it, and hand it over in the unused aoMap slot
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m || !(m as Any).isMeshStandardMaterial || m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile || m.aoMap) return;
    const sh: Any = { uniforms: {}, defines: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(sh as THREE.WebGLProgramParametersWithUniforms, renderer);
    const wear = sh.uniforms.uWear?.value as THREE.Texture | undefined;
    if (wear) {
      m.aoMap = wear;
      m.userData.wear = true;
    }
  });
  const root = new THREE.Group();
  root.name = 'root';
  root.add(g);
  tagMaterials(root);
  root.updateMatrixWorld(true);
  if (list) return inventory(root);
  const bake = new SceneBake({ globals: new Map([[b.time, 'time']]), kind: kindOf });
  bake.add(root);
  const r = await bake.save('home/gym', {});
  console.log(JSON.stringify(r));
  return r.warnings.length ? r.warnings.join('\n') : 'ok';
}

async function lounge(renderer: THREE.WebGLRenderer, list: boolean) {
  const { Lounge } = await import('../../../../src/render/home/lounge');
  const b = new Lounge(renderer, 'high') as unknown as Any;
  const g = b.group as THREE.Group;
  g.visible = true;
  g.name = 'lounge';
  // what the Godot side moves or relights, by name
  const named: [string, THREE.Object3D][] = [
    ['near', b.near], ['mug', b.mug], ['steam', b.steam], ['vinyl', b.vinyl], ['roomba', b.roomba], ['fairy', b.fairy], ['drops', b.drops],
    ['fish', b.fish], ['cat', b.cat], ['catBody', b.catBody], ['catHead', b.catHead], ['catTail', b.catTail], ['catEyes', b.catEyes],
  ];
  if (b.bubbles) named.push(['bubbles', b.bubbles]);
  for (const [n, o] of named) o.name = n;
  (b.hands as THREE.Object3D[]).forEach((o, i) => (o.name = `hand${i}`));
  (b.flames as THREE.Object3D[]).forEach((o, i) => (o.name = `flame${i}`));
  for (const [n, m] of [['neonMain', b.neonMain], ['neonKo', b.neonKo], ['neonHalo', b.neonHalo], ['backlight', b.backlight], ['roombaLed', b.roombaLed], ['window', b.winMat]] as [string, THREE.Material][]) nameByMaterial(g, m, n);
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as Any;
    if (m?.map === b.tvTex) o.name = 'tv';
  });
  // every drop of the spit-take, placed by the Godot side (three draws the first `count`)
  (b.drops as THREE.InstancedMesh).count = (b.drops as THREE.InstancedMesh).instanceMatrix.count;
  // the velvet's sheen (MeshPhysicalMaterial), which the bake doesn't carry
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
    if (m && (m as Any).isMeshPhysicalMaterial && m.sheen > 0) m.userData.sheen = { k: m.sheen, roughness: m.sheenRoughness, color: [m.sheenColor.r, m.sheenColor.g, m.sheenColor.b] };
  });
  const root = new THREE.Group();
  root.name = 'root';
  root.add(g);
  tagMaterials(root);
  root.updateMatrixWorld(true);
  if (list) return inventory(root);
  const bake = new SceneBake({ globals: new Map([[b.time, 'time'], [b.winK, 'win_k']]), kind: kindOf });
  bake.add(root);
  const r = await bake.save('home/lounge', {});
  console.log(JSON.stringify(r));
  return r.warnings.length ? r.warnings.join('\n') : 'ok';
}

export async function run() {
  RenderSettings.bloom = true;
  RenderSettings.quality = 'high';
  contactAO.setQuality('high');
  const q = new URLSearchParams(location.search);
  const id = q.get('id') ?? 'beach';
  const list = q.has('list');
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas });
  const out: string[] = [];
  if (id === 'beach' || id === 'all') out.push(await beach(renderer, list));
  if (id === 'gym' || id === 'all') out.push(await gym(renderer, list));
  if (id === 'lounge' || id === 'all') out.push(await lounge(renderer, list));
  return out.join('\n');
}
