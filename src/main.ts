import '@fontsource/russo-one/latin-400.css';
// (the menus use the device's own UI font; Rajdhani is for the arena's printed signs)
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { Game } from './game/game';
import { detectQuality, type Quality } from './render/stage';
import { Sfx } from './audio/sfx';
import { App } from './ui/app';
import { enterLandscapeOnFirstGesture } from './fullscreen';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const q = params.get('q');
const quality: Quality = q === 'low' || q === 'med' || q === 'high' ? q : detectQuality();

const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = '<div class="logo"><span class="l1">BATTLE</span><span class="l2">BOTS</span></div><i></i>';
document.body.appendChild(loading);

const game = new Game(canvas, quality);
game.sfx = new Sfx();
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

// audio can only start from a user gesture
const unlock = () => game.sfx?.unlock();
window.addEventListener('pointerdown', unlock, { once: true, capture: true });

// the app launches as a normal window; the first tap upgrades it to fullscreen landscape
enterLandscapeOnFirstGesture();

void document.fonts.ready.then(() => {
  requestAnimationFrame(() => {
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 600);
  });
});

if (import.meta.env.PROD) registerSW({ immediate: true });

// debug hooks for automated captures
if (params.has('fixed')) game.fixedDt = 1 / 30;
if (params.has('manual')) game.manual = true;
(window as unknown as { game: Game; app: App }).game = game;
(window as unknown as { game: Game; app: App }).app = app;
