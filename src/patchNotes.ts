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
      'Metal impact sounds: punches, kicks, blocks and knockdowns all clang differently.',
      'Rebuilt robot models with smoother, weightier punches and kicks.',
      'Installed app opens as a normal window and goes fullscreen in landscape on first tap.',
      'Fixed the screen flickering on some phones.',
      'Fixed a brief zoom flicker during fights on phones; resolution changes now happen on camera cuts.',
      'Arms no longer pass through chest plates, their own or the opponent\'s.',
      'Elbows and knees no longer snap to the wrong side mid-punch or mid-kick.',
      'Guarding hands stay tucked at the chin through the whole strike, and bots no longer sink into each other up close.',
      'Titan Hammers: the Guard Breaker now rises overhead and chops down onto the head.',
      'Brawler Knuckles: the haymaker winds back and loops round from the side.',
      'Jet Knees: the Jet Knee now leaps up off the canvas and drives the knee in, with a clean landing.',
    ],
  },
  {
    date: '2026-10-12',
    title: 'Battlebots launch',
    notes: ['First release: build your bot in the garage and send it into the arena.'],
  },
];
