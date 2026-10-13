/**
 * In-game patch notes, shown from the "Patch notes" button on the home screen.
 *
 * Notes are grouped by the HOUR (UTC) the update was merged to main, newest
 * group first. Every merge to main adds its lines to the top group if that
 * group's hour matches the current UTC hour, otherwise it adds a new group at
 * the top. Newest lines go first inside a group. One short, player-facing line
 * per change. The popup shows each hour in the player's local time.
 */
export interface PatchNote {
  /** UTC hour the update went live, 'YYYY-MM-DD HH:00' */
  hour: string;
  title: string;
  notes: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    hour: '2026-10-13 02:00',
    title: 'Live commentary',
    notes: [
      'Knocked-down bots beat the count a bit more often again. A battered bot or one dropped twice can still stay down for ten, but a single knockdown rarely ends the fight.',
      'Fights now have live voiced commentary: a play-by-play caller and an old-school colour analyst call the punches, kicks, knockdowns, counts, comebacks and KOs as they happen, chat during quiet spells, and wrap up the result. Over 1,300 lines, so it stays fresh fight after fight. Turn it down or off in Settings > Commentary.',
    ],
  },
  {
    hour: '2026-10-13 00:00',
    title: 'Knockdowns hit harder',
    notes: [
      'Knocked-down bots get up less often. A fresh bot usually beats the count, but a battered one, one that has already been dropped, or one flattened by a huge shot often stays down for ten and loses by KO.',
    ],
  },
  {
    hour: '2026-10-12 21:00',
    title: 'Paint shop, new health bars, emotes and cleaner hits',
    notes: [
      'New Paint tab in the garage: 26 ready-made paint jobs, 40 plating colours and 16 glow colours (or any colour you like), six finishes from matte to chrome, and six frame metals including gold and copper. Every change shows on your bot straight away. Your old colours carry over.',
      'Ropes, posts and barriers that come between the camera and the robots disappear again, however far away they are, so nothing blocks your view of the fight.',
      'For now every part is Common: you, your opponents and online rivals all fight with Common gear, so fights come down to your build and moves. Your saved parts were switched to Common, and the rarity picker is gone from the garage. Better tiers will come back later.',
      'Battle damage shows much sooner and bigger: a few hits already scuff and dent the plating, and a badly damaged part caves in, tears open to burnt innards with glowing split edges, and pours sparks and smoke.',
      'New health bars: a steel frame in your bot\'s colours, ten cells, and a live HP number. Damage now leaves a striped chip behind that hangs while the hits keep coming, then drains away, and the flurry\'s total shows by the name. Big hits flash and shake the bar.',
      'New Emotes tab in the garage: equip up to 3 celebrations and 3 taunts, and tap any of them to watch your bot perform it. Your bot only uses the ones you equip (and they show on your opponent\'s screen online). Leave a list empty and it picks its own.',
      'Fixed a big robot part on a white square flashing in the bottom-left corner while the game loads.',
      'The x-ray condition panels now sit at the top of the screen, right under each robot\'s health bar.',
      'The orange glow on a robot part when it gets hit is gone. Dents, scorch marks, cracks and sparks still show the damage.',
    ],
  },
  {
    hour: '2026-10-12 20:00',
    title: 'Battle damage, online fights, rebuilt robots, celebrations and better kicks',
    notes: [
      'Battle damage: every robot is now 15 parts (head, chest, lower torso, upper arms, forearms, fists, thighs, shins and feet), and hits wear down the part they land on. Blocking wears down the guarding arm and the fist or foot thrown into it.',
      'Damage shows on the robot: plates dent and buckle, paint chips off to bare steel, scorch marks spread, wrecked parts glow with cracks, and badly hurt parts spit sparks and smoke.',
      'A strong hit on a badly damaged head, arm or leg can rip it clean off. It flies across the ring, bounces off the ropes and gets kicked around the canvas while the stump sparks and smokes.',
      'New way to win: tear off the head, a leg, or both arms and the fight ends as DISMANTLED. A bot that loses one arm fights on one-armed.',
      'Damage hurts how a bot fights: battered arms punch slower, cracked fists and feet hit softer, damaged legs move and kick slower, a rattled head reacts late, a caved-in chest leaks stamina and a bent waist is easier to rock.',
      'An x-ray condition panel in each bottom corner shows every part during the fight, from teal to red. Parts that could come off with the next big hit blink.',
      'Bots fight around the damage: they hunt the parts you have damaged, throw big shots at anything hanging loose, cover up a cracked head and stop blocking with failing arms.',
      'Every bot now has a Low Kick that chops at the legs. It can\'t be blocked with the hands, so it has a short cooldown.',
      'Online fights: tap Online on the home screen and create a room, then send a friend the 4-letter code or the invite link. Once they join, the host taps Fight and you both watch the same fight live, each from your own phone.',
      'After an online fight, both tap Rematch to go again, or go back to the room and change parts in the garage first. If someone drops out, the fight still plays out to the end.',
      'Fights now play out exactly the same on every phone and browser, so both players always see the same punches land.',
      'Knockout celebrations: the winner now celebrates in the K.O. slow-mo, with nine moves including arms to the sky, a double-biceps flex and roar, chest pounds, a jumping fist pump, a bow, a crowd salute, shadowboxing and dropping to one knee after a hard-won fight. Brawlers flex, showboats play to the crowd, and a close fight or a comeback changes the pick. It keeps celebrating behind the results screen.',
      'Taunts: while the opponent is down for the count, the standing bot may wave them up, shrug, point down at them, do the shuffle, stomp and roar, bang its gloves, strut, or turn to get the crowd going, and it is always back in guard before they are on their feet.',
      'Robots have joined the crowd: about one fan in ten is now a robot, sitting in little groups around the stands with softly glowing LED eyes, cheering, clapping and booing along with everyone else.',
      'Every robot part has been rebuilt with far more mechanical detail: bolts, vents, layered plates, springs, pistons and lit sensors, and each item now has its own silhouette.',
      'Each power core now has its own back reactor: twin exhaust stacks, a hex generator, collector tanks or a coil tower.',
      'Rarity now shows on the robot itself: Epic parts add bolted armour, Legendary adds chrome trim, and Mythic adds signature fins, blades and a V-crest lit in the rarity colour.',
      'Reworked kicks: the push kick lifts the knee and drives the foot straight out, the roundhouse turns the hips over and whips the shin in at head height, and the spinning heel turns on the planted foot and drives the heel back.',
      'Kicking legs no longer fold up, flip at the knee or cross the standing leg, even up close or when the opponent steps aside.',
      'The standing foot stays planted and pivots through every kick, and the sweep and Jet Knee recover more cleanly.',
      'Your bot card on the home screen has the same new look: real renders of all six fitted parts in your paint and rarity, plus your power and moves. Tap it to open the garage.',
      'New fight intro: each bot gets a versus card at the side of the screen with its real parts in its own paint and rarity, its power and its two moves, so the robots in the ring stay in view.',
      'Ropes and barriers now only turn see-through when the camera is right up against them (within about a metre); farther away they stay solid.',
    ],
  },
  {
    hour: '2026-10-12 19:00',
    title: 'Settings that fit your phone',
    notes: [
      'Big hits, crits and shield blocks now send a shockwave through the air: the picture warps and ripples outward from the impact instead of showing a flat glowing circle.',
      'Screens now keep an even margin on the left and right and use the full height up to the top of the screen.',
      'Removed the experimental Keep 120 Hz test. The Frame rate setting (Max, 60 or 30) stays.',
      'Settings has a new two-column layout that fits a landscape phone screen, with bigger buttons, a close button and tap-outside-to-close. Graphics quality now has an Auto option, and resetting your record asks you to tap twice.',
    ],
  },
  {
    hour: '2026-10-12 18:00',
    title: 'The new garage and fight night atmosphere',
    notes: [
      'The game now runs at your screen\'s full refresh rate (120 Hz and up) instead of settling at 60. New Frame rate setting: Max, 60 or 30 to save battery.',
      'Fixed glaring white light with black specks along the top of the boards around the ring: the front row\'s seat backs and aisle steps were broken on some phones.',
      'Patch notes are now grouped by the hour each update went live, shown in your local time.',
      'The garage is now its own robotics workshop: your bot stands on a turntable under a gantry crane, surrounded by workbenches, tool walls, shelves of spare parts and a welding robot at work.',
      'Every item card shows a real 3D picture of the part itself: the actual fist, head, chest, core, legs or kick, in your paint colours.',
      'The loadout rail on the left of the panel shows the part fitted in each slot.',
      'Tap a slot and the camera moves in on that part. Tap it again, or use the Inspect button, to see the whole bot.',
      'Each card shows how much it would change your Power before you fit it.',
      'A scan light sweeps up your bot whenever you change a part, paint or rarity.',
      'Drag to spin your bot: it keeps turning a little when you let go, and slowly turns by itself if you leave it.',
      'Fuller stands: a seat back behind every fan, stepped aisles with lit step edges, exit stairwells in the upper tier too, camera platforms over the lower exits, follow spots on the roof catwalk and a rail along the top row.',
      'Fight night on the arena floor: pit crews with tool chests and chargers by each tunnel, ringside VIP seats, photographers whose flashes go off on big hits, camera operators, officials, patrolling security, walkout carpets and floor lights.',
      'Fight-night lighting: the ring is brighter and the crowd and stands sit in the dark around it, lit only by spill from the ring, the roaming spotlights and the LED boards. The camera adapts like a broadcast camera, so close-ups on the fight push the house even darker, with a soft vignette around the edges.',
      'Crowd background no longer hums or buzzes: the arena noise is now a soft, natural wash that swells with the fight.',
      'Arena realism pass: fans now have faces, beards, glasses, jerseys, jackets, scarves and foam fingers, lit by the ring.',
      'The arena gains exit stairwells, aisle handrails, a glass rail on the upper tier, roof catwalks, speaker stacks and press and judges desks.',
      'The big screen over the ring now shows both robots, their health and the fight clock live.',
    ],
  },
  {
    hour: '2026-10-12 17:00',
    title: 'Knockouts, lighting and camera',
    notes: [
      'The K.O. and T.K.O. letters now slam in for a moment, then shrink to a title at the top, so you can watch the knockout fall and the winner celebrate.',
      'The K.O. and T.K.O. letters now wait about 3 seconds after the knockout, so you see the fall clean before they appear.',
      'Fixed the hard-edged circle on the canvas around each robot: its contact shadow now fades out softly.',
      'Much lighter glow and light beams: bloom and the overhead light shafts now cost a fraction of the GPU time, with the same look, so fights run smoother at high quality.',
      'Render resolution setting (Settings): pick Auto, or fix it at 0.5x, 0.75x, 1x and up to your screen\'s native resolution. A fixed choice is never changed automatically.',
      'Camera zoom: pick Close, Normal or Wide in Settings or with the zoom button during a fight. Every shot keeps its angle and style.',
      'Arena lighting: a spotlight over the ring puts the robots in a pool of light, with the arena floor falling away into shadow.',
      'Ambient occlusion: robots cast soft contact shadows on the canvas (a big dark pool when one goes down), shade each other up close and darken where limbs tuck in. Posts, stands and the stage base get it too, and it stays light on phones.',
      'Fewer stand-offs: fresh bots in range let their hands go, and when both just stand and cover, one commits, shoves them off with a push kick or steps out.',
      'Free camera: shots are no longer held inside the ropes, so the camera finds better angles from anywhere around the ring.',
      'Health bars now wear each bot\'s own paint colours, and flash red when a bot is close to going down.',
      'New get-up after a knockdown: bots sit up or push up off the canvas, take a knee, plant a foot and rise back into their guard.',
      'Performance stats now have a GPU tab: how many milliseconds the bots, crowd, stands, ring, ropes, light beams, effects, shadows and bloom each cost to draw. On phones without a live GPU timer, tap Measure during a fight.',
      'Knockouts end with a giant animated K.O. that slams onto the screen; a TKO gets its own, slightly calmer T.K.O. banner.',
      'Clearer knockdown count: a big referee count under the clock that ticks up each second and turns green when the bot beats it.',
      'Knockdown marks next to each bot\'s name show how close they are to a TKO (three knockdowns ends the fight).',
      'The crowd now follows the fight: fans sit through quiet spells, get to their feet as it heats up, cheer their robot\'s big hits, clutch their heads when it takes one, boo when nothing happens and erupt at the KO.',
      'Fixed a flickering dark patch on top of the Reactive Frame and Counter Plate chests.',
      'No more crackling: smoother crowd applause, cleaner electric sounds, and loud moments like a KO no longer distort.',
      'The settings button now shows a proper gear instead of a sun.',
      'The arena\'s LED boards now run real-looking ads from a dozen sponsors (energy drinks, motor oil, tools, airlines and more) that rotate with a wipe.',
      'Titan Hammers: the Guard Breaker now rises overhead and chops down onto the head.',
      'Brawler Knuckles: the haymaker winds back and loops round from the side.',
      'Jet Knees: the Jet Knee now leaps up off the canvas and drives the knee in, with a clean landing.',
      'All punches and kicks move at a more human pace: a visible wind-up, weight behind the shot and a smooth return to guard.',
      'More natural footwork: bots shift their weight, turn their hips and shoulders and settle into each step as they move.',
    ],
  },
  {
    hour: '2026-10-12 16:00',
    title: 'Smarter fighters, bigger arena',
    notes: [
      'Patch notes now scroll with your finger, without a visible scrollbar.',
      'Calmer, more deliberate pace: bots throw about a third fewer strikes, pick their moments, reset between exchanges and paw out jabs to find the range.',
      'Performance stats (Settings): an FPS counter plus how many milliseconds the fight, AI, animation, effects, arena, camera, audio and rendering each cost per frame. Tap it to shrink it to just the FPS.',
      'A huge indoor arena: two tiers of seats, suites, LED boards, entrance tunnels, a hanging scoreboard and championship banners.',
      'A much bigger crowd of about 7,500 fans in team colours who clap, pump their fists, jump, hold up signs and start the odd Mexican wave, and it runs lighter on phones than the old crowd.',
      'Elastic ropes: they stretch and bow around a robot that leans or gets knocked into them, then spring it back into the ring with a wobble.',
      'Smarter, more human fighting: bots feel each other out at range, step in behind real combinations (jab-cross-hook), then get out, cover up or stay to trade.',
      'Footwork moves in steps and pauses instead of a constant glide, and every fighting style moves differently.',
      'Bots react to each other: they meet an opponent stepping in with a jab, back off or cover up after a big shot, fire back when angry, and use feints and stutter steps to draw a reaction.',
      'Clear view: ropes, posts and anything else between the camera and the robots fade away, so nothing blocks the fight.',
      'Arms no longer pass through chest plates, their own or the opponent\'s.',
      'Elbows and knees no longer snap to the wrong side mid-punch or mid-kick.',
      'Guarding hands stay tucked at the chin through the whole strike, and bots no longer sink into each other up close.',
    ],
  },
  {
    hour: '2026-10-12 15:00',
    title: 'Crowd and quality of life',
    notes: [
      'Fixed a brief zoom flicker during fights on phones; resolution changes now happen on camera cuts.',
      'Patch notes: this button on the home screen lists what changed in each update.',
      'Refresh button on the home screen (circular arrow next to sound and settings) reloads the app on the latest version.',
      'A live crowd that cheers, gasps and roars with the fight.',
    ],
  },
  {
    hour: '2026-10-12 14:00',
    title: 'Fight night upgrade',
    notes: [
      'Action camera: the fight is now shot like a broadcast, with cuts and close-ups on the big hits.',
      'Metal impact sounds: punches, kicks, blocks and knockdowns all clang differently.',
      'Rebuilt robot models with smoother, weightier punches and kicks.',
      'Installed app opens as a normal window and goes fullscreen in landscape on first tap.',
      'Fixed the screen flickering on some phones.',
    ],
  },
  {
    hour: '2026-10-12 13:00',
    title: 'Battlebots launch',
    notes: [
      'First release: build your bot in the garage and send it into the arena.',
    ],
  },
];

/** Local-time label for a group's hour, e.g. "Oct 12 · 19:00". */
export function hourLabel(hour: string) {
  const d = new Date(`${hour.replace(' ', 'T')}:00Z`);
  if (isNaN(d.getTime())) return hour;
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} · ${time}`;
}
