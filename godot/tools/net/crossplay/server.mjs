// Serves the web game's own src/ (TS transpiled on the fly, import.meta.env.DEV on), PeerJS 1.5.5
// from its source, shims for its dependencies and three, for the cross-play test page (xp.html).
//   XP_PEERJS=<a git clone of peerjs at v1.5.5> XP_THREE=<three's build/ folder> node server.mjs
// Optional: XP_PORT (8790), XP_TS (the typescript package, if it isn't resolvable from here).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require(process.env.XP_TS ?? 'typescript');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '../../../..');
const PEERJS = process.env.XP_PEERJS ?? '/tmp/peerjs';
const THREE = process.env.XP_THREE ?? '/tmp/three/build';
const PORT = Number(process.env.XP_PORT ?? 8790);
let code = '';
const tx = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, useDefineForClassFields: true } }).outputText.replaceAll('import.meta.env', '({ DEV: true, PROD: false, MODE: "development", BASE_URL: "/" })');
function resolve(f) {
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  for (const alt of [f + '.ts', f.replace(/\.js$/, '.ts'), path.join(f, 'index.ts')]) if (fs.existsSync(alt)) return alt;
  return null;
}
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const send = (c, type, body) => { res.writeHead(c, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  if (p === '/code') {
    if (req.method === 'POST') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { code = b; send(200, 'text/plain', 'ok'); }); return; }
    return send(200, 'text/plain', code);
  }
  if (p === '/log') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { console.log(b); send(200, 'text/plain', 'ok'); }); return; }
  let f = null;
  if (p.startsWith('/src/')) f = resolve(path.join(REPO, p));
  else if (p.startsWith('/peerjs/')) f = resolve(path.join(PEERJS, 'lib', p.slice(8)));
  else if (p.startsWith('/three/')) f = resolve(path.join(THREE, p.slice(7)));
  else f = resolve(path.join(HERE, p));
  if (!f) return send(404, 'text/plain', p);
  if (f.endsWith('.ts')) { try { return send(200, 'text/javascript', tx(f)); } catch (e) { return send(500, 'text/plain', String(e)); } }
  send(200, f.endsWith('.html') ? 'text/html' : f.endsWith('.json') ? 'application/json' : 'text/javascript', fs.readFileSync(f));
}).listen(PORT, () => console.log('xplay on ' + PORT));
