import '@fontsource/russo-one/latin-400.css';
// (the menus use the device's own UI font; Rajdhani is for the arena's printed signs)
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { Game } from './game/game';
import { detectQuality, nextFrame, type Quality } from './render/stage';
import { Sfx } from './audio/sfx';
import { App } from './ui/app';
import { Loader } from './ui/loader';
import { enterLandscapeOnFirstGesture } from './fullscreen';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const q = params.get('q');
const quality: Quality = q === 'low' || q === 'med' || q === 'high' ? q : detectQuality();

// first, so a fixed build can always reach a phone, even one this build fails to start on
if (import.meta.env.PROD) registerSW({ immediate: true });

const loader = new Loader();
const within = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((ok) => setTimeout(ok, ms))]);

/**
 * Everything that can be made before the player gets the controls is made behind the loading
 * screen, in order, each step reporting real progress: the fonts (the arena's signs are painted
 * with them), the arena, the sounds, the menus and the home screen's place, the saved login's bot,
 * the world map, and then every shader, texture and reflection of the places the player will visit.
 */
async function boot() {
  const fonts = loader.job('Getting ready', 3);
  const arena = loader.job('Building the arena', 14);
  const sound = loader.job('Tuning the sound', 6, true);
  const home = loader.job('Getting your bot ready', 9);
  const sync = loader.job('Getting your bot ready', 3);
  const prep = loader.job('Warming up', 72);

  fonts.set(0);
  await within(Promise.all(['400 1em "Russo One"', '600 1em Rajdhani', '700 1em Rajdhani'].map((f) => document.fonts.load(f))), 3000).catch(() => {});
  fonts.done();
  loader.fontsReady();
  arena.set(0);
  await nextFrame();

  const game = new Game(canvas, quality);
  // the loading screen covers it: the game draws nothing until it's all ready
  game.hold = true;
  game.sfx = new Sfx();
  arena.done();
  // audio can only start from a user gesture
  window.addEventListener('pointerdown', () => game.sfx?.unlock(), { once: true, capture: true });
  // (decoding and synthesis run alongside the rest, in the gaps)
  const sounds = game.sfx.preload((k) => sound.set(k));
  home.set(0);
  await nextFrame();

  const app = new App(game, quality);
  app.firstRunName();
  // invite links (?room=CODE) open straight into that room; drop the code from the address
  // so a reload or a home-screen launch doesn't try to join it again
  const room = params.get('room');
  if (room) {
    params.delete('room');
    const rest = params.toString();
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
    app.joinLink(room);
  }
  // debug hooks for automated captures
  if (params.has('fixed')) game.fixedDt = 1 / 30;
  if (params.has('manual')) game.manual = true;
  (window as unknown as { game: Game; app: App }).game = game;
  (window as unknown as { game: Game; app: App }).app = app;
  home.done();
  sync.set(0);
  await nextFrame();

  // a logged-in player's bot may be newer in the cloud: wait a moment for it, so the right
  // robot is the one set up (and shown) rather than swapped in after
  await within(app.synced, 4000);
  sync.done();

  try {
    await game.prepare((k, what) => prep.set(k, what));
  } catch (e) {
    // nothing is lost: whatever wasn't built builds the first time it's seen, as before
    console.error('warm-up failed', e);
  }
  prep.done();
  await within(sounds, 3000);
  sound.done();

  // the first frames draw under the loading screen, then it lifts away
  game.hold = false;
  await nextFrame();
  await nextFrame();
  await loader.finish();
  app.warmLater();
}

boot().catch((e) => loader.fail(e));

// the app launches as a normal window; the first tap upgrades it to fullscreen landscape
enterLandscapeOnFirstGesture();
