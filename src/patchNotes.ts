/**
 * In-game patch notes, shown from the "Patch notes" button on the home screen.
 *
 * Every merge to main adds an entry at the TOP of this list (newest first).
 * Keep each note to one short, player-facing line. Several merges on the same
 * day can share one entry: add lines to it instead of making a new one.
 */
export interface PatchNote {
  /** YYYY-MM-DD */
  date: string;
  title: string;
  notes: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    date: '2026-10-12',
    title: 'Fight night upgrade',
    notes: [
      'Patch notes: this button on the home screen lists what changed in each update.',
      'Refresh button on the home screen (circular arrow next to sound and settings) reloads the app on the latest version.',
      'A live crowd that cheers, gasps and roars with the fight.',
      'Action camera: the fight is now shot like a broadcast, with cuts and close-ups on the big hits.',
      'Clear view: ropes, posts and anything else between the camera and the robots fade away, so nothing blocks the fight.',
      'Metal impact sounds: punches, kicks, blocks and knockdowns all clang differently.',
      'Rebuilt robot models with smoother, weightier punches and kicks.',
      'Installed app opens as a normal window and goes fullscreen in landscape on first tap.',
      'Fixed the screen flickering on some phones.',
      'Fixed a brief zoom flicker during fights on phones; resolution changes now happen on camera cuts.',
      'Arms no longer pass through chest plates, their own or the opponent\'s.',
      'Elbows and knees no longer snap to the wrong side mid-punch or mid-kick.',
      'Guarding hands stay tucked at the chin through the whole strike, and bots no longer sink into each other up close.',
      'Smarter, more human fighting: bots feel each other out at range, step in behind real combinations (jab-cross-hook), then get out, cover up or stay to trade.',
      'Footwork moves in steps and pauses instead of a constant glide, and every fighting style moves differently.',
      'Bots react to each other: they meet an opponent stepping in with a jab, back off or cover up after a big shot, fire back when angry, and use feints and stutter steps to draw a reaction.',
      'Calmer, more deliberate pace: bots throw about a third fewer strikes, pick their moments, reset between exchanges and paw out jabs to find the range.',
      'Elastic ropes: they stretch and bow around a robot that leans or gets knocked into them, then spring it back into the ring with a wobble.',
      'A huge indoor arena: two tiers of seats, suites, LED boards, entrance tunnels, a hanging scoreboard and championship banners.',
      'A much bigger crowd of about 7,500 fans in team colours who clap, pump their fists, jump, hold up signs and start the odd Mexican wave, and it runs lighter on phones than the old crowd.',
      'Performance stats (Settings): an FPS counter plus how many milliseconds the fight, AI, animation, effects, arena, camera, audio and rendering each cost per frame. Tap it to shrink it to just the FPS.',
    ],
  },
  {
    date: '2026-10-12',
    title: 'Battlebots launch',
    notes: ['First release: build your bot in the garage and send it into the arena.'],
  },
];
