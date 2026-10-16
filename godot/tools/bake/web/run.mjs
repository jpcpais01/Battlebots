// Run one bake job in headless Chromium against serve.mjs.
//   node godot/tools/bake/web/run.mjs <job> [--shot out.png] [--q key=value&...] [--port 8765]
// --shot saves the page (1280x720) once the job is done, for reference renders of the web game.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright');
const args = process.argv.slice(2);
const job = args[0];
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const port = opt('--port', 8765);
const shot = opt('--shot', null);
const q = opt('--q', '');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(`http://localhost:${port}/godot/tools/bake/web/bake.html?job=${job}&${q}`);
const r = await page.waitForFunction(() => window.__done, null, { timeout: 900000, polling: 500 });
const out = await r.jsonValue();
console.log(out);
if (shot) await page.screenshot({ path: shot });
await browser.close();
process.exit(String(out).startsWith('ERROR') ? 1 : 0);
