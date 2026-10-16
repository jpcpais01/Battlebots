// Translates the event venues' three.js ShaderMaterials (src/render/venues/kit.ts vMaterial and the
// world map's mapMaterial, which the Skydeck reuses) into Godot spatial shaders, line for line:
// the GLSL bodies stay as the web game wrote them, only what differs between the two languages is
// mapped (attributes into vertex slots, three's built-in matrices and includes, gl_* outputs, the
// arena's shared uniforms into the game's shader globals). Used by venues_bake.ts, which writes one
// .gdshader per distinct source under godot/assets/venues/shaders/.
//
// Godot rules this follows (see the phase-2 port brief): unshaded, fog off (the venues haze
// themselves), POSITION written in clip space, clockwise front faces (the bake already flips the
// triangles), built-ins only inside vertex()/fragment() (helpers get the camera from the
// bb_cam_pos global instead).

export interface GlslMaterial {
  vertex: string;
  fragment: string;
  defines: Record<string, unknown>;
  /** Uniform name -> 'global:<name>' for the game's shader globals, or the texture record for samplers. */
  uniforms: Record<string, { global?: string; tex?: { srgb: boolean; repeat: boolean; mip: boolean; nearest: boolean } }>;
  side: number;
  blending: number;
  blendSrc: number;
  blendDst: number;
  transparent: boolean;
  depthWrite: boolean;
  depthTest: boolean;
  fog: boolean;
  /** Geometry attributes (name -> item size) the drawable has. */
  attributes: Record<string, number>;
  /** An InstancedMesh: Godot draws it as a MultiMesh (the instance transform is in MODEL_MATRIX). */
  instanced: boolean;
  instanceColor: boolean;
  /** The sky dome: drawn after everything opaque, in the transparent pass. */
  sky: boolean;
}

export interface GlslPort {
  code: string;
  /** Baked attribute -> Godot vertex slot ('' = not needed). */
  slots: Record<string, string>;
}

/** The game's shader globals (project.godot) the arena's shared uniforms become. */
const GLOBAL_TYPES: Record<string, string> = { time: 'float', hype: 'float', flash: 'float', house: 'float' };

const INCLUDES: Record<string, string> = {
  common: '',
  tonemapping_fragment: '',
  colorspace_fragment: '',
  fog_pars_vertex: '#ifdef USE_FOG\nvarying float vFogDepth;\n#endif',
  fog_vertex: '#ifdef USE_FOG\nvFogDepth = - mvPosition.z;\n#endif',
  fog_pars_fragment: '#ifdef USE_FOG\nvarying float vFogDepth;\n#endif',
  // three's FogExp2 (the venues' scene fog)
  fog_fragment: '#ifdef USE_FOG\nfloat fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\ngl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif',
};

/** three's built-in names -> Godot's, inside vertex() / fragment(). */
const BUILTINS: Record<string, string> = {
  modelMatrix: 'MODEL_MATRIX',
  viewMatrix: 'VIEW_MATRIX',
  projectionMatrix: 'PROJECTION_MATRIX',
  modelViewMatrix: 'MODELVIEW_MATRIX',
  normalMatrix: 'MODELVIEW_NORMAL_MATRIX',
  cameraPosition: 'CAMERA_POSITION_WORLD',
  isOrthographic: 'false',
  gl_Position: 'POSITION',
  gl_PointSize: 'POINT_SIZE',
  gl_FragCoord: 'FRAGCOORD',
  gl_FrontFacing: 'FRONT_FACING',
  gl_PointCoord: 'POINT_COORD',
  gl_FragColor: 'bb_frag',
  texture2D: 'texture',
  textureCube: 'texture',
};
/** What a helper function (outside vertex()/fragment()) may use instead of a built-in. */
const IN_FUNCTIONS: Record<string, string> = { cameraPosition: 'bb_cam_pos', texture2D: 'texture', textureCube: 'texture', isOrthographic: 'false' };

function stripComments(s: string) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
}

function expandIncludes(s: string) {
  return s.replace(/^[ \t]*#include\s*<(\w+)>[^\n]*$/gm, (_m, k: string) => {
    if (!(k in INCLUDES)) throw new Error(`no port for #include <${k}>`);
    return INCLUDES[k];
  });
}

interface Chunk {
  kind: 'pp' | 'decl' | 'func';
  text: string;
  name?: string;
}

/** Split a shader into top-level chunks: preprocessor lines, declarations, function definitions. */
function chunks(src: string): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    while (i < n && /\s/.test(src[i])) i++;
    if (i >= n) break;
    if (src[i] === '#') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      out.push({ kind: 'pp', text: src.slice(i, j).trim() });
      i = j + 1;
      continue;
    }
    // up to a ';' at depth 0, or the end of a { } block at depth 0
    let depth = 0;
    let j = i;
    let block = false;
    for (; j < n; j++) {
      const c = src[j];
      if (c === '#' && depth > 0) {
        // (preprocessor lines inside a body are kept as they are)
        const e = src.indexOf('\n', j);
        j = e < 0 ? n - 1 : e;
        continue;
      }
      if (c === '{') {
        depth++;
        block = true;
      } else if (c === '}') {
        depth--;
        if (depth === 0) {
          // a struct ends with "};"
          let k = j + 1;
          while (k < n && /\s/.test(src[k])) k++;
          if (src[k] === ';') j = k;
          break;
        }
      } else if (c === ';' && depth === 0) break;
    }
    const text = src.slice(i, j + 1).trim();
    i = j + 1;
    if (block && /\)\s*\{/.test(text) && !/^struct\b/.test(text)) {
      const m = text.match(/^[\w\s]*?\b(\w+)\s*\(/);
      out.push({ kind: 'func', text, name: m ? m[1] : '?' });
    } else out.push({ kind: 'decl', text });
  }
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function replaceWords(s: string, map: Record<string, string>) {
  return s.replace(/\b[A-Za-z_]\w*\b/g, (w) => (w in map ? map[w] : w));
}

/** Names declared in a "qualifier type a, b[3], c" list. */
function declNames(rest: string): { name: string; arr: string }[] {
  return rest.split(',').map((p) => {
    const m = p.trim().match(/^(\w+)\s*(\[[^\]]*\])?/);
    if (!m) throw new Error('bad declaration: ' + rest);
    return { name: m[1], arr: m[2] ?? '' };
  });
}

function hints(t: NonNullable<GlslMaterial['uniforms'][string]['tex']> | undefined) {
  if (!t) return ' : filter_linear_mipmap, repeat_enable';
  const h: string[] = [];
  if (t.srgb) h.push('source_color');
  h.push(t.nearest ? (t.mip ? 'filter_nearest_mipmap' : 'filter_nearest') : t.mip ? 'filter_linear_mipmap_anisotropic' : 'filter_linear');
  h.push(t.repeat ? 'repeat_enable' : 'repeat_disable');
  return ' : ' + h.join(', ');
}

/** GLSL's matN(N*N scalars) as Godot wants it: matN(vecN columns...). */
function matCtors(s: string) {
  let out = '';
  let i = 0;
  const re = /\bmat([234])\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    let j = m.index + m[0].length;
    let depth = 1;
    const args: string[] = [];
    let a = j;
    for (; j < s.length && depth > 0; j++) {
      const ch = s[j];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if ((ch === ',' && depth === 1) || depth === 0) {
        args.push(s.slice(a, j).trim());
        a = j + 1;
      }
    }
    if (args.length !== n * n) continue;
    const cols: string[] = [];
    for (let c = 0; c < n; c++) cols.push(`vec${n}(${args.slice(c * n, c * n + n).map(matCtors).join(', ')})`);
    out += s.slice(i, m.index) + `mat${n}(${cols.join(', ')})`;
    i = j;
    re.lastIndex = j;
  }
  return out + s.slice(i);
}

export function translate(mat: GlslMaterial): GlslPort {
  const defs: string[] = [];
  for (const [k, v] of Object.entries(mat.defines ?? {})) defs.push(`#define ${k}${v === '' || v === undefined || v === null || v === true ? '' : ' ' + String(v)}`);
  if (mat.fog) defs.push('#define USE_FOG', '#define FOG_EXP2');
  if (mat.instanced) defs.push('#define USE_INSTANCING');
  if (mat.instanced && mat.instanceColor) defs.push('#define USE_INSTANCING_COLOR');
  if (mat.side === 2) defs.push('#define DOUBLE_SIDED');
  if (mat.side === 1) defs.push('#define FLIP_SIDED');

  const top: string[] = [];
  const seenDecl = new Set<string>();
  const funcs = new Map<string, string>();
  const uniforms = new Map<string, string>();
  const varyings = new Map<string, string>();
  const attributes: { type: string; name: string }[] = [];
  const globalsUsed = new Set<string>();
  const aliases: string[] = [];
  let usesCamFn = false;
  const bodies: Record<'vertex' | 'fragment', string> = { vertex: '', fragment: '' };

  for (const stage of ['vertex', 'fragment'] as const) {
    const src = expandIncludes(stripComments(stage === 'vertex' ? mat.vertex : mat.fragment));
    for (const c of chunks(src)) {
      if (c.kind === 'pp') {
        const d = c.text.match(/^#define\s+(\w+)/);
        if (d && seenDecl.has('#def ' + norm(c.text))) continue;
        if (d) seenDecl.add('#def ' + norm(c.text));
        if (/^#(version|extension|pragma)\b/.test(c.text)) continue;
        top.push(c.text);
        continue;
      }
      if (c.kind === 'func') {
        if (c.name === 'main') {
          bodies[stage] = c.text.slice(c.text.indexOf('{') + 1, c.text.lastIndexOf('}'));
          continue;
        }
        const t = norm(c.text);
        const had = funcs.get(c.name!);
        if (had !== undefined) {
          if (had === t) continue;
          // (an overload with other parameters is fine; the same signature twice is not)
          const sig = (s: string) => s.slice(0, s.indexOf('{'));
          if (sig(had) === sig(t)) throw new Error(`function ${c.name} differs between the vertex and fragment shaders`);
        }
        funcs.set(c.name!, t);
        for (const w of ['viewMatrix', 'modelMatrix', 'projectionMatrix', 'modelViewMatrix', 'normalMatrix', 'gl_FragCoord', 'gl_FrontFacing', 'gl_PointCoord', 'instanceMatrix']) {
          if (new RegExp(`\\b${w}\\b`).test(c.text)) throw new Error(`${w} used in helper ${c.name}: no Godot built-ins outside vertex()/fragment()`);
        }
        if (/\bcameraPosition\b/.test(c.text)) usesCamFn = true;
        top.push(replaceWords(c.text, IN_FUNCTIONS));
        continue;
      }
      // declarations
      let t = c.text.replace(/;\s*$/, '').trim();
      if (/^precision\b/.test(t)) continue;
      if (/^(uniform|attribute|varying|in|out|flat)\b/.test(t)) t = t.replace(/\b(highp|mediump|lowp)\s+/g, '');
      const m =t.match(/^(uniform|attribute|varying|in|out|flat\s+varying)\s+(\w+)\s+([\s\S]+)$/);
      if (m) {
        const q = m[1], type = m[2];
        for (const { name, arr } of declNames(m[3])) {
          if (q === 'attribute' || (q === 'in' && stage === 'vertex')) {
            if (!attributes.some((a) => a.name === name)) attributes.push({ type, name });
          } else if (q === 'uniform') {
            const u = mat.uniforms[name];
            if (u?.global) {
              if (!(u.global in GLOBAL_TYPES)) throw new Error('unknown global ' + u.global);
              globalsUsed.add(u.global);
              const a = `#define ${name} bb_${u.global}`;
              if (!aliases.includes(a)) aliases.push(a);
              continue;
            }
            if (name === 'fogColor' || name === 'fogDensity' || name === 'fogNear' || name === 'fogFar') continue;
            if (name === 'uScale' && type === 'float') {
              // the drawing buffer's height (setPixelScale), for point sizes
              const a = '#define uScale VIEWPORT_SIZE.y';
              if (!aliases.includes(a)) aliases.push(a);
              continue;
            }
            const decl = `uniform ${type} ${name}${arr}${type === 'sampler2D' ? hints(u?.tex) : ''};`;
            const had = uniforms.get(name);
            if (had && had !== decl) throw new Error(`uniform ${name} declared twice differently`);
            if (!had) {
              uniforms.set(name, decl);
              top.push(decl);
            }
          } else {
            // varying (or a fragment "in")
            const decl = `varying ${q.startsWith('flat') ? 'flat ' : ''}${type} ${name}${arr};`;
            const had = varyings.get(name);
            if (had && had !== decl) throw new Error(`varying ${name} declared twice differently`);
            if (!had) {
              varyings.set(name, decl);
              top.push(decl);
            }
          }
        }
        continue;
      }
      const key = norm(t);
      if (seenDecl.has(key)) continue;
      seenDecl.add(key);
      top.push(replaceWords(t, IN_FUNCTIONS) + ';');
    }
  }
  if (!bodies.vertex || !bodies.fragment) throw new Error('no main()');

  // three declares these itself (WebGLProgram's prefix) for every ShaderMaterial
  for (const [type, name] of [['vec3', 'position'], ['vec3', 'normal'], ['vec2', 'uv']]) {
    if (!attributes.some((a) => a.name === name) && new RegExp(`\\b${name}\\b`).test(bodies.vertex)) attributes.unshift({ type, name });
  }
  // attributes into Godot's vertex slots
  const slots: Record<string, string> = {};
  const free = ['CUSTOM0', 'CUSTOM1', 'CUSTOM2', 'CUSTOM3'];
  const locals: string[] = [];
  const sw = (n: number) => ['.x', '.xy', '.xyz', ''][n - 1];
  for (const a of attributes) {
    const size = { float: 1, vec2: 2, vec3: 3, vec4: 4 }[a.type];
    if (!size) throw new Error('attribute type ' + a.type);
    const have = mat.attributes[a.name];
    if (have === undefined) {
      // (three reads a missing attribute as zero)
      locals.push(`${a.type} ${a.name} = ${a.type}(0.0);`);
      continue;
    }
    let slot: string;
    if (a.name === 'position') slot = 'VERTEX';
    else if (a.name === 'normal') slot = 'NORMAL';
    else if (a.name === 'uv' && have === 2) slot = 'UV';
    else if (free.length) slot = free.shift()!;
    else if (have <= 2 && !Object.values(slots).includes('UV2')) slot = 'UV2';
    else throw new Error('out of vertex slots for ' + a.name);
    slots[a.name] = slot;
    const n = slot.startsWith('CUSTOM') ? Math.min(have, 4) : slot === 'VERTEX' || slot === 'NORMAL' ? 3 : 2;
    const read = slot.startsWith('CUSTOM') ? slot + sw(Math.min(size, n)) : slot + (size < n ? sw(size) : '');
    locals.push(`${a.type} ${a.name} = ${size > n ? `${a.type}(${read}${', 0.0'.repeat(size - n)})` : read};`);
  }
  // (the mesh needs its vertex array even when the shader places points from other attributes)
  if ('position' in mat.attributes && !('position' in slots)) slots.position = 'VERTEX';
  for (const k of Object.keys(mat.attributes)) if (!(k in slots)) slots[k] = '';

  const vMap: Record<string, string> = { ...BUILTINS };
  if (mat.instanced) {
    // the MultiMesh puts each instance's transform in MODEL_MATRIX (the node itself stays at the origin)
    vMap.instanceMatrix = 'MODEL_MATRIX';
    vMap.modelMatrix = 'BB_IDENTITY';
    vMap.instanceColor = 'INSTANCE_CUSTOM.rgb';
  }
  const fMap: Record<string, string> = { ...BUILTINS };
  const vbody = replaceWords(bodies.vertex, vMap);
  const fbody = replaceWords(bodies.fragment, fMap);
  if (/\breturn\s*;/.test(fbody)) throw new Error('return in fragment main()');

  // how the result lands
  const modes = ['unshaded', 'fog_disabled', ['cull_back', 'cull_front', 'cull_disabled'][mat.side]];
  let out = 'ALBEDO = bb_frag.rgb;';
  const ONE = 201;
  if (mat.sky) {
    // after everything opaque: only what nothing else covered is shaded
    modes.push('depth_draw_never');
    out += '\n\tALPHA = 1.0;';
  } else if (mat.blending === 2) {
    modes.push('blend_add', 'depth_draw_never');
    out += '\n\tALPHA = bb_frag.a;';
  } else if (mat.blending === 5 && mat.blendSrc === ONE && mat.blendDst === ONE) {
    modes.push('blend_add', 'depth_draw_never');
  } else if (mat.blending === 1 || mat.blending === 0) {
    if (mat.transparent) {
      out += '\n\tALPHA = bb_frag.a;';
      if (mat.depthWrite) modes.push('depth_draw_always');
    }
    if (!mat.depthWrite && !mat.transparent) modes.push('depth_draw_never');
    if (mat.transparent && !mat.depthWrite) modes.push('depth_draw_never');
  } else throw new Error(`blending ${mat.blending} (${mat.blendSrc}, ${mat.blendDst})`);
  if (!mat.depthTest) modes.push('depth_test_disabled');

  const head = ['shader_type spatial;', `render_mode ${[...new Set(modes)].join(', ')};`, ...defs];
  for (const g of globalsUsed) head.push(`global uniform ${GLOBAL_TYPES[g]} bb_${g};`);
  if (mat.fog) head.push('global uniform vec3 bb_fog_color;', 'global uniform float bb_fog_density;', '#define fogColor bb_fog_color', '#define fogDensity bb_fog_density');
  if (usesCamFn) head.push('global uniform vec3 bb_cam_pos;');
  head.push('#define saturate(a) clamp(a, 0.0, 1.0)', ...aliases);
  // (Godot can't fold mat4(1.0))
  if (mat.instanced) head.push('const mat4 BB_IDENTITY = mat4(vec4(1.0, 0.0, 0.0, 0.0), vec4(0.0, 1.0, 0.0, 0.0), vec4(0.0, 0.0, 1.0, 0.0), vec4(0.0, 0.0, 0.0, 1.0));');
  const code = [
    '// Generated by godot/tools/bake/web/venues_glsl.ts from the web game\'s GLSL (src/render/venues, src/render/map): do not edit.',
    ...head,
    ...top,
    'void vertex() {',
    ...locals.map((l) => '\t' + l),
    vbody.replace(/^\n/, ''),
    '}',
    'void fragment() {',
    '\tvec4 bb_frag = vec4(0.0, 0.0, 0.0, 1.0);',
    fbody.replace(/^\n/, ''),
    '\t' + out,
    '}',
    '',
  ].join('\n');
  return { code: matCtors(code), slots };
}
