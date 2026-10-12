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
      'Arena realism pass: fans now have faces, beards, glasses, jerseys, jackets, scarves and foam fingers, lit by the ring.',
      'The arena gains exit stairwells, aisle handrails, a glass rail on the upper tier, roof catwalks, speaker stacks and press and judges desks.',
      'The big screen over the ring now shows both robots, their health and the fight clock live.',
      'Patch notes: this button on the home screen lists what changed in each update.',
      'Refresh button on the home screen (circular arrow next to sound and settings) reloads the app on the latest version.',
      'The settings button now shows a proper gear instead of a sun.',
      'A live crowd that cheers, gasps and roars with the fight.',
      'Crowd background no longer hums or buzzes: the arena noise is now a soft, natural wash that swells with the fight.',
      'No more crackling: smoother crowd applause, cleaner electric sounds, and loud moments like a KO no longer distort.',
      'Action camera: the fight is now shot like a broadcast, with cuts and close-ups on the big hits.',
      'Clear view: ropes, posts and anything else between the camera and the robots fade away, so nothing blocks the fight.',
      'Free camera: shots are no longer held inside the ropes, so the camera finds better angles from anywhere around the ring.',
      'Camera zoom: pick Close, Normal or Wide in Settings or with the zoom button during a fight. Every shot keeps its angle and style.',
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
      'Fewer stand-offs: fresh bots in range let their hands go, and when both just stand and cover, one commits, shoves them off with a push kick or steps out.',
      'Elastic ropes: they stretch and bow around a robot that leans or gets knocked into them, then spring it back into the ring with a wobble.',
      'A huge indoor arena: two tiers of seats, suites, LED boards, entrance tunnels, a hanging scoreboard and championship banners.',
      'A much bigger crowd of about 7,500 fans in team colours who clap, pump their fists, jump, hold up signs and start the odd Mexican wave, and it runs lighter on phones than the old crowd.',
      'Performance stats (Settings): an FPS counter plus how many milliseconds the fight, AI, animation, effects, arena, camera, audio and rendering each cost per frame. Tap it to shrink it to just the FPS.',
      'Performance stats now have a GPU tab: how many milliseconds the bots, crowd, stands, ring, ropes, light beams, effects, shadows and bloom each cost to draw. On phones without a live GPU timer, tap Measure during a fight.',
      'Patch notes now scroll with your finger, without a visible scrollbar.',
      'Titan Hammers: the Guard Breaker now rises overhead and chops down onto the head.',
      'Brawler Knuckles: the haymaker winds back and loops round from the side.',
      'Jet Knees: the Jet Knee now leaps up off the canvas and drives the knee in, with a clean landing.',
      'All punches and kicks move at a more human pace: a visible wind-up, weight behind the shot and a smooth return to guard.',
      'More natural footwork: bots shift their weight, turn their hips and shoulders and settle into each step as they move.',
      'The arena\'s LED boards now run real-looking ads from a dozen sponsors (energy drinks, motor oil, tools, airlines and more) that rotate with a wipe.',
      'Fixed a flickering dark patch on top of the Reactive Frame and Counter Plate chests.',
      'The crowd now follows the fight: fans sit through quiet spells, get to their feet as it heats up, cheer their robot\'s big hits, clutch their heads when it takes one, boo when nothing happens and erupt at the KO.',
      'Knockouts end with a giant animated K.O. that slams onto the screen; a TKO gets its own, slightly calmer T.K.O. banner.',
      'Clearer knockdown count: a big referee count under the clock that ticks up each second and turns green when the bot beats it.',
      'Knockdown marks next to each bot\'s name show how close they are to a TKO (three knockdowns ends the fight).',
      'New get-up after a knockdown: bots sit up or push up off the canvas, take a knee, plant a foot and rise back into their guard.',
      'Health bars now wear each bot\'s own paint colours, and flash red when a bot is close to going down.',
      'The K.O. and T.K.O. letters now slam in for a moment, then shrink to a title at the top, so you can watch the knockout fall and the winner celebrate.',
      'Arena lighting: a spotlight over the ring puts the robots in a pool of light, with the arena floor falling away into shadow.',
      'Ambient occlusion: robots cast soft contact shadows on the canvas (a big dark pool when one goes down), shade each other up close and darken where limbs tuck in. Posts, stands and the stage base get it too, and it stays light on phones.',
      'Fixed the hard-edged circle on the canvas around each robot: its contact shadow now fades out softly.',
      'Fight-night lighting: the ring is brighter and the crowd and stands sit in the dark around it, lit only by spill from the ring, the roaming spotlights and the LED boards. The camera adapts like a broadcast camera, so close-ups on the fight push the house even darker, with a soft vignette around the edges.',
      'Much lighter glow and light beams: bloom and the overhead light shafts now cost a fraction of the GPU time, with the same look, so fights run smoother at high quality.',
      'Render resolution setting (Settings): pick Auto, or fix it at 0.5x, 0.75x, 1x and up to your screen\'s native resolution. A fixed choice is never changed automatically.',
    ],
  },
  {
    date: '2026-10-12',
    title: 'Battlebots launch',
    notes: ['First release: build your bot in the garage and send it into the arena.'],
  },
];
