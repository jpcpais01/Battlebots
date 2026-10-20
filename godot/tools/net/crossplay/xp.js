// The web game's real OnlineSession (src/net/session.ts, link.ts, PeerJS) as one side of a room
// against the Godot app (godot/tests/net/crossplay.gd), with the same script of play.
// PeerJS asks the broker's HTTP API for a guest id: the test broker only speaks WebSocket.
const realFetch = window.fetch;
window.fetch = (u, o) => (String(u).includes('/peerjs/id') ? Promise.resolve(new Response('webguest' + Math.random().toString(36).slice(2, 10))) : realFetch(u, o));
const log = (s) => { console.log('XP ' + s); return realFetch('/log', { method: 'POST', body: 'XP ' + s }); };
const q = new URLSearchParams(location.search);
const role = q.get('role');
const END = 6000;
try {
  const { OnlineSession } = await import('/src/net/session.ts');
  const { Match } = await import('/src/sim/match.ts');
  const { matchHash } = await import('/src/sim/hash.ts');
  const { randomBot } = await import('/src/game/loadout.ts');
  const { Rng } = await import('/src/sim/math.ts');
  const bot = randomBot(new Rng(role === 'host' ? 15 : 16));
  bot.name = 'Web ' + role;
  let s;
  if (role === 'host') {
    s = await OnlineSession.host(bot);
    await realFetch('/code', { method: 'POST', body: s.code });
    log('code ' + s.code);
  } else {
    let code = '';
    while (!code) { await new Promise((r) => setTimeout(r, 200)); code = await (await realFetch('/code')).text(); }
    s = await OnlineSession.join(code, bot);
  }
  let m = null, started = false, compared = 0, called = false;
  const game = { speed: 1, onStep: null, fastForward(n) { for (let i = 0; i < n && m.phase !== 'end' && m.frame < END; i++) step(); } };
  const step = () => { m.step(); if (m.frame % 60 === 0) compared++; game.onStep?.(m); };
  s.onChange = () => {
    if (s.canFight && !started) {
      log(`peer ${s.peerBot.name} blocker '${s.blocker}'`);
      if (role === 'host') { started = true; s.startFight(); }
    }
  };
  s.onEnd = (why) => log('ended ' + why);
  s.onStart = (a, b, seed) => {
    started = true;
    log(`start seed ${seed} a ${a.name} b ${b.name}`);
    m = new Match(a, b, seed);
    s.watch(game, m);
    let last = performance.now(), acc = 0, doneAt = -1;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      s.frame(dt);
      if (!called && m.phase === 'fight' && m.coachReady(s.me)) { called = true; s.coach(s.me === 0 ? 'allIn' : 'head'); }
      acc += dt * game.speed;
      while (acc >= 1 / 120 && m.frame < END) { acc -= 1 / 120; step(); }
      if (m.frame >= END || m.phase === 'end') {
        if (doneAt < 0) {
          doneAt = now;
          log(`frame ${m.frame} hashes ${compared} desynced ${s.desynced}`);
          log('coach ' + JSON.stringify(m.coachLog));
          log('state ' + matchHash(m).toString(16));
        } else if (now - doneAt > 4000) {
          log('desynced-after ' + s.desynced);
          s.close();
          window.__done = true;
          return;
        }
      }
      setTimeout(tick, 8);
    };
    tick();
  };
} catch (e) {
  log('error ' + e.stack);
  window.__done = true;
}
