// A tiny dev server that runs the web game's own TypeScript in a real browser, without npm or
// Vite: .ts files are transpiled on the fly, extensionless imports are resolved the way Vite
// does, and `three` comes from a three.js checkout (THREE_DIR, holding build/ and examples/jsm/).
// Bakes (venue, crowd atlas, textures) POST their results to /save/<path>, written under OUT.
//   THREE_DIR=... OUT=godot/assets node godot/tools/bake/web/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT ?? '/opt/node-tools/node_modules/typescript');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
const THREE_DIR = process.env.THREE_DIR;
const OUT = path.resolve(ROOT, process.env.OUT ?? 'godot/assets');
const port = Number(process.argv[2] ?? 8765);
if (!THREE_DIR) throw new Error('THREE_DIR must point at a three.js checkout (build/ and examples/jsm/)');

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' };
const cache = new Map();

function transpile(file) {
  const st = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.code;
  const src = fs.readFileSync(file, 'utf8');
  const out = ts.transpileModule(src, {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, useDefineForClassFields: true, verbatimModuleSyntax: false, sourceMap: false },
  });
  const code = out.outputText.replaceAll('import.meta.env', '({ DEV: false, PROD: true, MODE: "production", BASE_URL: "/" })');
  cache.set(file, { mtime: st.mtimeMs, code });
  return code;
}

function send(res, code, type, body) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (req.method === 'POST' && p.startsWith('/save/')) {
      const dest = path.resolve(OUT, p.slice(6));
      if (!dest.startsWith(OUT)) return send(res, 403, 'text/plain', 'outside OUT');
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        let body = Buffer.concat(chunks);
        // ?zstd: "BBZ1", the raw size (u32), then the zstd stream (Godot: decompress(size, ZSTD))
        if (url.searchParams.has('zstd')) {
          const head = Buffer.alloc(8);
          head.write('BBZ1', 0, 'ascii');
          head.writeUInt32LE(body.length, 4);
          body = Buffer.concat([head, zlib.zstdCompressSync(body, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } })]);
        }
        fs.writeFileSync(dest, body);
        send(res, 200, 'text/plain', 'ok');
      });
      return;
    }
    if (p.startsWith('/three/')) {
      const f = path.join(THREE_DIR, p.slice(7));
      if (fs.existsSync(f)) return send(res, 200, 'text/javascript', fs.readFileSync(f));
      return send(res, 404, 'text/plain', p);
    }
    let f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) return send(res, 403, 'text/plain', 'no');
    // directory imports resolve to their index; redirect so relative imports inside it work
    if (!path.extname(f) && fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      res.writeHead(302, { location: p.replace(/\/$/, '') + '/index.ts' });
      return res.end();
    }
    if (!fs.existsSync(f)) {
      for (const alt of [f + '.ts', f.replace(/\.js$/, '.ts')]) if (fs.existsSync(alt)) f = alt;
    }
    if (!fs.existsSync(f)) return send(res, 404, 'text/plain', p);
    if (f.endsWith('.ts')) {
      try {
        return send(res, 200, 'text/javascript', transpile(f));
      } catch (e) {
        return send(res, 500, 'text/plain', String(e));
      }
    }
    send(res, 200, TYPES[path.extname(f)] ?? 'application/octet-stream', fs.readFileSync(f));
  })
  .listen(port, () => console.log(`serving ${ROOT} on http://localhost:${port} (saves to ${OUT})`));
