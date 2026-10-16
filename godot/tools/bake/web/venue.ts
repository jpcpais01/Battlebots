// Bakes the fight arena exactly as the web game builds it (src/render/arena.ts: the stage, posts,
// ropes, truss, corners and the indoor venue with its crowd) into godot/assets/venue/arena.{json,bin}.
// Nodes the Godot side animates are named here first, reaching into the web classes.
import * as THREE from 'three';
import { RenderSettings } from '../../../../src/render/settings';
import { contactAO } from '../../../../src/render/ao';
import { Arena } from '../../../../src/render/arena';
import { house } from '../../../../src/render/house';
import { SceneBake } from './scene_bake';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function kindOf(m: THREE.ShaderMaterial, o: THREE.Object3D): string {
  const u = m.uniforms;
  const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry;
  const has = (k: string) => k in u;
  if (o.name) {
    const byName: Record<string, string> = { skirt: 'skirt', beams: 'truss_beams', showBeams: 'show_beams', fire: 'pyro_fire', sparks: 'pyro_sparks', confetti: 'confetti' };
    if (byName[o.name]) return byName[o.name];
  }
  if (has('uAtlas') && has('uBounds')) return 'crowd';
  if (has('uMap') && g.attributes.aLed) return m.defines?.ADS !== undefined ? 'led_ads' : 'led';
  if (has('uHit')) return 'gate';
  if (g.attributes.aChase) return 'tunnel_led';
  if (has('uDensity') && has('uSize')) return m.defines?.STEADY !== undefined ? 'glow_points_steady' : 'glow_points';
  if (has('uSpin') && has('uChase')) return 'hatch_ring';
  if (has('uK') && has('uColor')) return m.fragmentShader.includes('(1.0 - vA) * (1.0 - vA)') ? 'beam_column' : 'beam_spot';
  if (has('uLevel') && has('uFan')) return 'show_heads';
  if (has('uBurst')) return 'photo_flash';
  if (has('uScale') && has('uSize') && has('uGlow')) return 'floor_glow_points';
  return 'unknown:' + Object.keys(u).filter((k) => !k.startsWith('fog')).join(',');
}

export async function run() {
  RenderSettings.bloom = true;
  RenderSettings.quality = 'high';
  contactAO.setQuality('high');
  const arena = new Arena('high');
  const a = arena as unknown as Any;
  // names for what Godot animates
  a.corners.corners.forEach((c: Any, i: number) => {
    c.root.name = `corner${i}`;
    c.deck.name = `corner${i}_deck`;
    c.rod.name = `corner${i}_rod`;
    c.doors.forEach((d: THREE.Object3D, k: number) => (d.name = `corner${i}_door${k}`));
    c.shaft.name = `corner${i}_shaft`;
    c.column.name = `corner${i}_column`;
    c.beam.name = `corner${i}_beam`;
    c.root.traverse((o: THREE.Object3D) => {
      const m = (o as THREE.Mesh).material;
      if (m === c.ring) o.name = `corner${i}_ring`;
    });
    arena.corners.group.traverse((o: THREE.Object3D) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[];
      if (m === c.sleeve) o.name = `corner${i}_sleeve`;
      if (Array.isArray(m) && m.includes(c.deckGlow)) o.name = `corner${i}_deckTop`;
    });
  });
  arena.group.traverse((o) => {
    if ((o as THREE.Mesh).material === (a.glowMat as THREE.Material)) o.name = 'ringGlow';
  });
  const v = arena.indoor as unknown as Any;
  // the centre-hung screens (Scoreboard's canvas) and the tunnel gates (west, east)
  v.group.traverse((o: THREE.Object3D) => {
    const m = (o as THREE.Mesh).material as Any;
    if (!m || Array.isArray(m)) return;
    if (m.map && m.map === v.board.texture) o.name = 'scoreScreen';
    const gi = (v.gates as THREE.Material[]).indexOf(m);
    if (gi >= 0) o.name = `gate${gi}`;
  });
  v.crowd.group.name = 'crowd';
  v.floor.group.name = 'floorShow';
  v.show.group.name = 'show';
  (v.floorMesh as THREE.Object3D).name = 'arenaFloor';
  v.group.name = 'venue';
  arena.group.name = 'arena';

  const globals = new Map<unknown, string>([
    [arena.uniforms.uTime, 'time'],
    [arena.uniforms.uHype, 'hype'],
    [v.uniforms.uFlash, 'flash'],
    [house.uniforms.uHouse, 'house'],
  ]);
  const bake = new SceneBake({ globals, kind: kindOf });
  const root = new THREE.Group();
  root.name = 'root';
  root.add(arena.group, arena.venue.group);
  root.updateMatrixWorld(true);
  bake.add(root);
  const r = await bake.save('venue/arena', {
    ropeHeights: [0.55, 0.95, 1.35],
    spots: (v.crowd.spots as THREE.Vector4[]).length,
  });
  console.log(JSON.stringify(r));
  return r.warnings.length ? r.warnings.join('\n') : 'ok';
}
