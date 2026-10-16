// Reference renders of the web game's career screens (the world map's overlay and event card, the
// Parts Market, the trophy room, a fight's prize money), for matching the Godot port
// (godot/app/career). The state is godot/tests/career_fixture.json, the same one the Godot shots
// load. Run with career_ref.mjs, which also serves the screens' CSS imports:
//   node godot/tools/bake/web/career_ref.mjs <view> out.png      (view: map, market, trophy, reward)
import { EVENT_BY_ID, defenceOf, rival } from '../../../../src/game/events';
import { settle, stock } from '../../../../src/game/career';
import { sanitizeBot, sanitizeRecord } from '../../../../src/game/saves';
import { Rng } from '../../../../src/sim/math';
import { marketView, rewardView, trophyView, type CareerHost } from '../../../../src/ui/careerUi';
import { MapScreen } from '../../../../src/ui/mapScreen';
import { el } from '../../../../src/ui/dom';
import type { Game } from '../../../../src/game/game';

export async function run() {
  const q = new URLSearchParams(location.search);
  const view = q.get('view') ?? 'map';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/src/style.css';
  document.head.appendChild(link);
  await new Promise((r) => (link.onload = r));
  document.body.style.cssText = 'margin:0;background:linear-gradient(135deg,#3a4a60,#1a2a3a 60%,#40382a)';
  document.getElementById('c')?.remove();
  const ui = el('div', '', '', document.body);
  ui.id = 'ui';
  const fx = await (await fetch('/godot/tests/career_fixture.json')).json();
  const record = sanitizeRecord(fx.record);
  const player = sanitizeBot(null);
  // one offer already bought (owned and sold), as the Godot fixture does
  const offers = stock(record.career, record.events);
  record.career.owned.push(offers[1].item.id);
  record.career.shop.sold.push(offers[1].item.id);
  const host: CareerHost = {
    record: () => record,
    player: () => player,
    thumb: () => '',
    tap: () => {},
    save: () => {},
    fit: () => {},
  };
  const modal = (title: string, fill: (box: HTMLElement) => void) => {
    const m = el('div', 'modal screen show interactive', '', ui);
    const box = el('div', 'box', `<h2>${title}</h2>`, m);
    fill(box);
  };
  if (view === 'map') {
    const game = { worldMap: null, loadWorld: () => new Promise(() => {}), stage: { camera: null } } as unknown as Game;
    const s = new MapScreen({
      game,
      events: () => record.events,
      career: () => record.career,
      player: () => player,
      rival: (e, round) => rival(e, round, player, defenceOf(record.events, e)),
      market: () => {},
      trophies: () => {},
      tap: () => {},
      back: () => {},
      fight: () => {},
    });
    ui.appendChild(s.root);
    s.root.classList.add('show');
    s.show();
    s.pick(q.get('event') ?? 'harbor');
  } else if (view === 'market') modal('Parts Market', (box) => marketView(box, host, () => {}));
  else if (view === 'trophy') modal('Trophy room', (box) => trophyView(box, host, () => {}));
  else if (view === 'reward') {
    const e = EVENT_BY_ID.get('harbor')!;
    const round = e.rivals.length - 1;
    const opp = rival(e, round, player, 0);
    const rw = settle(record.career, { e, round, defence: 0, won: true, draw: false, kind: 'KO', title: true, rival: opp }, new Rng(7));
    const res = el('div', 'results screen show', '', ui);
    const card = el('div', 'res-card', `<div class="head"><span class="kicker">Harbor Cup · Final</span><div class="verdict title">CUP WINNER</div><div class="who"><b>Player</b> wins by knockout</div></div>`, res);
    rewardView(card, rw, host, e.rivals[round], false, () => {});
    el('div', 'actions', '<button class="btn primary">Map</button>', card);
  }
  // let the entrance animations finish
  await new Promise((r) => setTimeout(r, 2500));
  return 'ok';
}
