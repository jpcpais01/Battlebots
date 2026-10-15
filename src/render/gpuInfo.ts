/**
 * Which GPU the game is drawing on, for the performance overlay. Works for both of three.js's
 * backends: WebGPU reports its adapter (`GPUAdapter.info`), WebGL its renderer string (unmasked via
 * WEBGL_debug_renderer_info where the browser allows it). Browsers that hide the real name (Safari
 * and iOS say "Apple GPU", privacy modes say less) get a second try through `navigator.gpu`, which
 * often names the chip family even when WebGL will not.
 */
export interface GpuInfo {
  /** Short readable name, e.g. "GeForce RTX 3060", "Adreno 740", "Apple GPU". */
  name: string;
  /** Who made it, when known: "NVIDIA", "Qualcomm", "Apple"… */
  vendor: string;
  /** "WebGPU" or "WebGL 2" / "WebGL 1", plus the native API underneath when the browser says. */
  backend: string;
  /** The untouched strings the browser gave, for the tooltip. */
  raw: string;
  /** True when the browser hid the real model and we only know the family. */
  masked: boolean;
}

type AnyRenderer = {
  getContext?: () => unknown;
  backend?: { isWebGPUBackend?: boolean; adapter?: { info?: AdapterInfo } | null; device?: unknown };
};
type AdapterInfo = { vendor?: string; architecture?: string; device?: string; description?: string };

let cached: GpuInfo | null = null;
let pending: Promise<GpuInfo> | null = null;

/** Best answer we have right now (filled in synchronously for WebGL), or null until the probe ends. */
export function gpuInfoNow(): GpuInfo | null {
  return cached;
}

/** Works out the GPU once; later calls return the same promise. */
export function probeGpu(renderer: unknown): Promise<GpuInfo> {
  if (!pending) {
    pending = detect(renderer as AnyRenderer).then((g) => (cached = g));
  }
  return pending;
}

async function detect(r: AnyRenderer): Promise<GpuInfo> {
  const be = r.backend;
  if (be?.isWebGPUBackend) {
    let info = be.adapter?.info;
    if (!info) info = (await adapterInfo()) ?? undefined;
    return fromAdapter(info ?? {}, 'WebGPU');
  }
  const gl = r.getContext?.() as WebGLRenderingContext | WebGL2RenderingContext | undefined;
  const fromGl = gl ? fromWebGL(gl) : null;
  if (fromGl) cached = fromGl; // show something straight away; the WebGPU query below can take a moment
  if (fromGl && !fromGl.masked) return fromGl;
  // WebGL hid the name: the WebGPU adapter often still says which chip family it is
  const info = await adapterInfo();
  if (info && (info.description || info.architecture || info.vendor)) {
    const a = fromAdapter(info, fromGl?.backend ?? 'WebGL');
    if (!fromGl || a.name !== 'Unknown GPU') {
      return { ...a, raw: [fromGl?.raw, a.raw].filter(Boolean).join(' | ') };
    }
  }
  return fromGl ?? unknown('WebGL');
}

function fromWebGL(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuInfo {
  const isGl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  let renderer = '';
  let vendor = '';
  // Firefox deprecates the extension but already returns the (sanitised) real name from RENDERER
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  try {
    if (ext) {
      renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
      vendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? '');
    }
    if (!renderer) renderer = String(gl.getParameter(gl.RENDERER) ?? '');
    if (!vendor) vendor = String(gl.getParameter(gl.VENDOR) ?? '');
  } catch {}
  const parsed = parseRenderer(renderer, vendor);
  const api = parsed.api ? ` (${parsed.api})` : '';
  return {
    name: parsed.name,
    vendor: parsed.vendor,
    backend: `${isGl2 ? 'WebGL 2' : 'WebGL 1'}${api}`,
    raw: [vendor, renderer].filter(Boolean).join(' · '),
    masked: parsed.masked,
  };
}

function fromAdapter(info: AdapterInfo, backend: string): GpuInfo {
  const vendor = vendorName(info.vendor ?? '');
  const desc = (info.description ?? '').trim();
  const arch = (info.architecture ?? '').trim();
  let name = '';
  if (desc) name = parseRenderer(desc, info.vendor ?? '').name;
  if (!name || name === 'Unknown GPU') {
    // Chrome hides `description` unless asked; vendor + architecture still says e.g. "Qualcomm adreno-7xx"
    name = [vendor, arch.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())].filter(Boolean).join(' ') || 'Unknown GPU';
  }
  return {
    name: tidy(name),
    vendor,
    backend,
    raw: [info.vendor, arch, info.device, desc].filter(Boolean).join(' · '),
    masked: !desc,
  };
}

async function adapterInfo(): Promise<AdapterInfo | null> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return null;
  try {
    const a = (await Promise.race([gpu.requestAdapter(), new Promise((res) => setTimeout(() => res(null), 3000))])) as {
      info?: AdapterInfo;
      requestAdapterInfo?: () => Promise<AdapterInfo>;
    } | null;
    if (!a) return null;
    if (a.info) return a.info;
    if (a.requestAdapterInfo) return await a.requestAdapterInfo(); // older Chrome
  } catch {}
  return null;
}

/**
 * Turns a renderer string into a short name. Handles ANGLE's wrapping on Windows/Android/Mac
 * ("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
 * Mesa and the masked strings browsers hand out.
 */
function parseRenderer(renderer: string, vendorStr: string): { name: string; vendor: string; api: string; masked: boolean } {
  let s = renderer.trim().replace(/,\s*or similar$/i, '');
  let vendor = vendorStr;
  let api = '';
  const angle = /^ANGLE \((.*)\)(?: on .*)?$/.exec(s);
  if (angle) {
    const parts = splitTop(angle[1]);
    if (parts.length >= 3) {
      vendor = parts[0];
      s = parts[1];
      api = parts.slice(2).join(', ');
    } else if (parts.length === 2) {
      s = parts[0];
      api = parts[1];
    } else {
      s = parts[0] ?? s;
    }
  }
  // the native API, said nicely
  const apiSrc = `${api} ${renderer}`;
  if (/D3D11|Direct3D11/i.test(apiSrc)) api = 'Direct3D 11';
  else if (/D3D9|Direct3D9/i.test(apiSrc)) api = 'Direct3D 9';
  else if (/Vulkan/i.test(apiSrc)) api = 'Vulkan';
  else if (/Metal/i.test(apiSrc)) api = 'Metal';
  else if (/OpenGL ES/i.test(apiSrc)) api = 'OpenGL ES';
  else if (/OpenGL/i.test(apiSrc)) api = 'OpenGL';
  else api = '';
  s = s
    .replace(/^ANGLE [^:]*:\s*/i, '')
    .replace(/^Mesa\s+/i, '')
    .replace(/\(0x[0-9a-f]+\)/gi, '')
    .replace(/\b(Direct3D\d+|D3D\d+|vs_\d_\d|ps_\d_\d|OpenGL( ES)?( \d+(\.\d+)*)?|Vulkan( \d+(\.\d+)*)?|Metal( Renderer)?)\b/gi, '')
    .replace(/\(TM\)|\(R\)|™|®/gi, '')
    .replace(/,\s*(Unspecified Version|SwiftShader driver).*$/i, '');
  // Mesa: "Mesa Intel(R) UHD Graphics 620 (KBL GT2)" / "AMD Radeon RX 6600 (radeonsi, navi23, LLVM 15)"
  s = s.replace(/\s*\((radeonsi|navi|llvm|kbl|cml|tgl|adl|rpl|skl|cfl|whl|icl|jsl|ehl)[^)]*\)/gi, '');
  s = tidy(s);
  // the chip name says the maker more reliably than the vendor string ("ARM" for a Samsung Xclipse)
  const fromName = vendorName(s);
  const v = KNOWN.has(fromName) ? fromName : vendorName(vendor || s);
  const generic = !s || /^(WebKit WebGL|WebKit|Mozilla|Generic Renderer|Google Inc\.?|Unknown)$/i.test(s);
  let masked = generic || /^Apple GPU$/i.test(s) || /^(Adreno|Mali|PowerVR)$/i.test(s);
  if (/SwiftShader|llvmpipe|softpipe|Microsoft Basic Render/i.test(renderer)) {
    s = 'Software renderer (no GPU)';
    masked = false;
  }
  if (generic) s = v && v !== 'Unknown' ? `${v} GPU` : 'Unknown GPU';
  // desktop names read better with the maker in front ("Radeon RX 6600" -> "AMD Radeon RX 6600")
  if (v && !s.toLowerCase().startsWith(v.toLowerCase()) && !/GPU$/.test(s) && /^(NVIDIA|AMD|Intel)$/.test(v)) {
    s = `${v} ${s}`;
  }
  s = s.replace(/^NVIDIA (NVIDIA )+/i, 'NVIDIA ').replace(/^AMD (AMD )+/i, 'AMD ');
  return { name: s, vendor: v === 'Unknown' ? '' : v, api, masked };
}

/** Splits on top-level commas, ignoring commas inside nested parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const KNOWN = new Set(['NVIDIA', 'AMD', 'Intel', 'Qualcomm', 'ARM', 'Apple', 'Imagination', 'Samsung']);

function vendorName(s: string): string {
  const t = s.toLowerCase();
  if (/nvidia|geforce|quadro|rtx|gtx/.test(t)) return 'NVIDIA';
  if (/\bamd\b|ati|radeon/.test(t)) return 'AMD';
  if (/intel/.test(t)) return 'Intel';
  if (/qualcomm|adreno/.test(t)) return 'Qualcomm';
  if (/\barm\b|mali/.test(t)) return 'ARM';
  if (/apple/.test(t)) return 'Apple';
  if (/imagination|powervr/.test(t)) return 'Imagination';
  if (/samsung|xclipse/.test(t)) return 'Samsung';
  if (/microsoft/.test(t)) return 'Microsoft';
  if (/google/.test(t)) return 'Google';
  return s.trim() ? s.trim().replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unknown';
}

function tidy(s: string): string {
  return s.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').trim();
}

function unknown(backend: string): GpuInfo {
  return { name: 'Unknown GPU', vendor: '', backend, raw: '', masked: true };
}
