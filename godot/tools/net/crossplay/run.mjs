// One side of a cross-play room in headless Chromium: the web game's own OnlineSession (xp.js),
// against the Godot app on the other side (godot/tests/net/crossplay.gd), through the local
// PeerJS server (godot/tests/net/peer_server_main.gd). See godot/README.md (Online rooms).
//   node run.mjs host|guest        (BB_PEER=127.0.0.1:9124, XP_PORT=8790, XP_PLAYWRIGHT=<package>)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.XP_PLAYWRIGHT ?? 'playwright');
const role = process.argv[2];
const peer = process.env.BB_PEER ?? '127.0.0.1:9124';
const port = process.env.XP_PORT ?? 8790;
// (Chrome hides local addresses behind mDNS names, which don't resolve here)
const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[page error]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
await page.goto(`http://localhost:${port}/xp.html?role=${role}&peer=${peer}`);
await page.waitForFunction(() => window.__done, null, { timeout: 150000, polling: 500 });
await browser.close();
