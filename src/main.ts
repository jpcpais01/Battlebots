import './style.css';
import { Game } from './game/game';
import { detectQuality } from './render/stage';
import { randomBot } from './game/loadout';
import { Rng } from './sim/math';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const game = new Game(canvas, (params.get('q') as 'low' | 'med' | 'high') ?? detectQuality());
const rng = new Rng(Number(params.get('seed') ?? 3));
const a = randomBot(rng);
const b = randomBot(rng, 0.35, a.palette);
if (params.has('show')) {
  const all = Array.from({ length: 5 }, (_, i) => i);
  const k = Number(params.get('show'));
  const spec = { name: 'Show', palette: k % 10, loadout: { head: { id: ['sentinel','hawkeye','oracle','bulwark','berserker'][all[k%5]], rarity: (k % 5) as 0 }, fist: { id: ['brawler','piston','thunder','rocket','titan'][k%5], rarity: 4 as const }, core: { id: ['fusion','overdrive','aegis','leech','static'][k%5], rarity: 3 as const }, chest: { id: ['plated','reactive','juggernaut','aero','counter'][k%5], rarity: 2 as const }, legs: { id: ['strider','hopper','anchor','hydraulic','phantom'][k%5], rarity: 1 as const }, kick: { id: ['snap','whip','sweeper','comet','jet'][k%5], rarity: 0 as const } } };
  game.showBot(spec);
  game.director.mode = 'garage';
  game.director.garageYaw = Number(params.get('yaw') ?? 0.5);
} else {
  const m = game.startMatch(a, b, 5);
  if (params.has('skip')) m.skipIntro();
}
if (params.has('fixed')) game.fixedDt = 1 / 30;
if (params.has('manual')) game.manual = true;
(window as unknown as { game: Game }).game = game;
