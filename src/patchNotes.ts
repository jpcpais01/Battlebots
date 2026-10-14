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
    hour: '2026-10-14 20:00',
    title: 'A new ring, heavier hits, arena light show',
    notes: [
      'Six new robot makers: Ironhorse Diesel Works, Lumen, Longwei Robotics, Officine Martelli, Kensei Precision and Strix Aerospace. Each builds one part for every slot, with its own set bonuses. Your saved bots move over to the maker that took over each old part.',
      'Ironhorse diesel parts are the strongest in the game, but they only run on a full diesel bot. Fit all six or they stall and do nothing. Their engine also warms up, hitting harder over the first 30 seconds.',
      'Bots now make a real entrance: each one rides a lift up through a glowing hatch in its corner, with fog pouring out, a spotlight, sparks and CO2 cannons firing as it locks into place. They wait in their corners for the countdown, then walk out to touch gloves.',
      'Six entrances to pick from in the garage (Emotes > Entrances): Power Up, Hero Landing, Cold Stare, Crowd Pleaser, Shadow Boxer and Earthquake. Equip none and your bot picks one to suit its style.',
      'Every bot has its own walk-on music, with the drop landing the moment it arrives: Steel Anthem, Neon Drive, Iron Forge, Bass Drop, Champion\'s Call or Arcade Boss. Pick yours in the Entrances tab and tap to hear it.',
      'The two corners are now properly blue and orange, with coloured corner pads and a lift hatch that stays as the corner\'s floor plate during the fight.',
      'Camera drones now carry a red recording light on the nose and in the eye that blinks while they film.',
      'Damage flying off a bot is now real wreckage: jagged shards of torn armour, curled strips, nuts, bolts and washers at true size. They burst off hard with the blow, the freshly torn ones glowing orange and trailing sparks and smoke as they cool, then clatter and skid across the canvas and stay there, piling up as the fight wears on.',
      'The camera drones got a sci-fi makeover: sleek pearl-white hulls with a big glass eye, four glowing ducted fans instead of propellers, and cyan thrusters underneath that flare up when they race between shots.',
      'Vapour jets look far better: a hard streak of pressure blasts out of the joint and breaks into lumpy, lit clouds that curl upward and fray into wisps.',
      'Better pyro: flame cannons now fire a roaring jet that blooms into a churning fireball, throws off embers and leaves a cloud of smoke, and the spark fountains spray streaking white-hot sparks that crackle out as they fall. The cannons and fountains now sit on the arena floor where you can see them.',
      'Smoother fights on phones: the robots, the ring floor, the crowd and the stands all cost the graphics chip much less to draw, with no change to how they look. Tiny details too small to see are skipped (and left out of shadows), and the parts of the arena behind the camera are no longer drawn.',
      'The whole game has a fresh, cleaner look: one simple console-style design across every menu, with glass panels, rounded buttons, and a bright white button for the next thing to do.',
      'New home screen: your bot\'s name, moves and six fitted parts sit bottom left (tap a part to jump straight to it in the garage), and Fight, Garage and Online sit together bottom right.',
      'The results screen is one tidy card with a bar under each stat showing who came out ahead. Settings, pause, saved bots, account and online rooms all share the new style, and patch notes are now under What\'s new.',
      'The arena puts on a proper show: 20 moving-head lights on the roof sweep beams through the stands, wheel round as the bots walk out, lock onto the ring for the countdown and strobe in the winner\'s colour on a KO.',
      'Pyro round the stage: spark fountains as each bot is introduced, flame cannons on FIGHT!, finishers and knockouts, and confetti in the winner\'s colour rains down from the roof at the end.',
      'The big screen now shows each bot\'s name in its corner colour as it is introduced, and a new ring of ad boards crowns the top of the stands.',
      'The garage parts menu is rebuilt around the makers: pick a maker from the logo tabs to see what they build for, how close you are to their set bonus, and their parts as big tiles.',
      'Tap a part to try it on before fitting it: your bot wears it, the diagnostics show what it adds or takes away, and any set bonus it unlocks or loses lights up. Press Equip, or tap it again, to fit it. On a keyboard the arrows browse and Enter fits.',
      'Knocked-down bots get back up a bit more often before the count runs out.',
      'The ring has been rebuilt: a new printed canvas with a gear emblem, hazard-striped corners and skid marks from old fights, a padded edge, and an LED skirt round the stage that scrolls the league name and flares when the crowd goes wild. New padded corner posts with glowing beacons and LED strips, thicker neon-core ropes tied with straps that bend with them, and a steel truss overhead with the spotlights hanging from it.',
      'Hits sound like real armour now: every blow rings the plate it lands on, big shots leave the panel clanging, and battered parts crunch and rattle instead of ringing clean.',
      'Sparks streak off in the direction of the blow, skate across the plating and bounce along the canvas, cooling from white hot to red.',
      'Hard hits knock nuts, bolts and flecks of paint loose that clink across the canvas. The more beaten up a part is, the more comes off it.',
      'The camera now rocks the way each blow travels, so you feel which way the hit went.',
      'Badly damaged parts now blast hard, hissing jets of high-pressure vapour out of their joints, more often as the part nears failure and every time it gets hit. Tear the part off and the venting stops.',
      'New icons for every special move, and every passive now has its own icon in the garage and on the fight HUD.',
      'The back arrow in the garage and online screens is now a proper Home button with a house icon, and the results screen\'s Home button says what it does.',
      'The arena floor around the ring is now matte black, no more shiny glare.',
    ],
  },
  {
    hour: '2026-10-14 19:00',
    title: 'Thrown out of the ring, replay controls',
    notes: [
      'Replays now have media-player controls: play and pause, jump back or ahead 5 seconds, step frame by frame while paused, and drag the timeline to any moment. Knockdowns, torn-off parts and the KO are marked on it.',
      'Watch replays at any speed from 0.25x slow motion up to 4x. On a keyboard: space pauses, the arrow keys jump, [ and ] change speed.',
      'Big knockout blows can now send a bot flying over the top rope and out of the ring, crashing down onto the arena floor. The ropes still catch anything lower, and the corner posts are solid all the way up. A bot knocked down outside the ring can\'t climb back in before ten.',
    ],
  },
  {
    hour: '2026-10-14 17:00',
    title: 'Cleaner fights, whole-bot finishers',
    notes: [
      "The bot's-eye camera now always stays on for at least 3 seconds, even through knockdowns and KOs, and can run for up to 7 seconds.",
      'Knocked-down bots get back up a bit more often: their odds of beating the count each second are higher.',
      'Finishers now need a whole bot: if any of your parts has been torn off, you can no longer pull off a finisher.',
      'The little text line at the bottom of fights that narrated every move is gone, so the action and the coach buttons have the screen to themselves.',
    ],
  },
  {
    hour: '2026-10-14 15:00',
    title: 'Coach your bot',
    notes: [
      'Coach from the corner! Four buttons along the bottom of a fight: "Go in!" makes your bot attack more, "All in!!!" sends it in non-stop, "Defend" gets its hands up and makes it careful, and "For the head!" has it hunt the head. Each call lasts 10 seconds, then the corner needs 15 seconds before the next one.',
      'Coach calls work in online fights too (both players must update), and replays repeat the calls you made.',
    ],
  },
  {
    hour: '2026-10-14 14:00',
    title: "Bot's-eye camera",
    notes: [
      "Every so often the fight camera cuts inside one of the bots' heads for a few seconds, so you see the opponent the way your bot does, through its visor. It never happens during knockdowns, KOs or finishers.",
    ],
  },
  {
    hour: '2026-10-14 04:00',
    title: 'Slow bots fight back',
    notes: [
      'Bots no longer pull their own punch halfway through to dodge. Once a punch is on its way they let it go and trade, unless the other shot will clearly land first. Slower bots commit hardest.',
      'Slower, heavier bots no longer turtle up against quick ones. They commit once they are set, meet opponents as they step in and fire straight back when hit, trading speed for power.',
    ],
  },
  {
    hour: '2026-10-14 03:00',
    title: 'Bot sizes, beat the count, camera drones and real oil',
    notes: [
      'Swipe left or right on the home screen (or drag with the mouse) to walk the camera round your bot. Fling it and it keeps turning, then glides back to the usual view a few seconds after you let go.',
      'Oil now looks like real motor oil: thick, glossy black with a rainbow sheen. Drops bead on the wound, stretch and string out as they fall, and spread into slick puddles.',
      'Tearing a part off wrenches the joint it was attached to: the part it hung from loses 30% of what it had left, and the metal around the socket is wrecked.',
      'Torn sockets gush oil, then keep bleeding for the rest of the fight.',
      'Both robots get oily and dirty as the fight goes on: oil splashes onto the attacker\'s fists, flicks onto whoever is close, runs down the plating, and coats the feet of a bot that steps in a puddle.',
      'New Size tab in the garage: build your bot up to 120% or down to 80%. Big bots reach further, have more health and hit harder but are slower and easier to hit. Small bots are quick, sharp and hard to hit. Opponents come in all sizes too.',
      'Downed bots now really try to get up during the count: sometimes their legs give out halfway and they slump back to the canvas.',
      'Knocked-down bots now get a chance to rise on every second of the count, and the more health they have left the better their odds. A badly hurt bot can stay down for ten.',
      'Composure and Reboot now make a bot more likely to beat the count.',
      'The fight camera now keeps your bot on the left of the screen, online too. It only swaps sides when it really has to, like a KO shot or being squeezed against the stands, and comes back on the next cut.',
      'Three little camera drones now fly the arena. Each camera angle is one of them filming: when the shot cuts, the drone that just filmed hangs where the camera was and climbs away, and you can spot the others hovering past the ring with their red tally lights on.',
    ],
  },
  {
    hour: '2026-10-14 01:00',
    title: 'The whole ring is open, and your paint online',
    notes: [
      'No more invisible wall: bots now use the whole ring right up to the ropes, lean and sink into them, and can get pinned there by an opponent pressing forward.',
      'Online fights keep both bots in their owners\' own paint. Your opponent is no longer repainted when your colours look alike.',
    ],
  },
  {
    hour: '2026-10-14 00:00',
    title: 'Calmer, steadier bots',
    notes: [
      'Guarding hands are calm now: no more twitchy, vibrating forearms. The guard drifts and settles, and holds its shape instead of flicking between high and low.',
      'Everything moves at a more grounded pace: punches and kicks wind up and return to guard more deliberately, the bounce on the toes is slower, and steps, turns and dodges are less hurried. Fights run a few seconds longer.',
    ],
  },
  {
    hour: '2026-10-13 22:00',
    title: 'Bots move with real weight, and leak oil',
    notes: [
      'A badly beaten chest or lower torso now leaks oil: a slow drip at first, then a pumping stream as it fails. Hits to the wound splash it out, puddles spread across the canvas, and bots that step in them leave oily footprints.',
      'Renaming your bot and recording its name now use proper in-game popups instead of the browser\'s plain boxes.',
      'If voicing your bot\'s name fails, the message now says why, so it\'s easier to fix.',
      'Bots move like they have real weight: torsos wind up and carry a little past each punch before settling, and power shots sit down into the legs first.',
      'Getting hit looks physical: head shots snap the upper body back, body shots fold it over, leg kicks buckle the knees.',
      'Knockouts drop the legs first: the knees fold, then the bot goes down.',
      'Getting up, celebrations and taunts flow as one smooth movement instead of pausing at each pose.',
      'Idle bots breathe (harder when tired), bounce on their toes with a natural rhythm, and their guard hands never move on a loop. Feet lift, push off the toes and land heel first.',
    ],
  },
  {
    hour: '2026-10-13 21:00',
    title: 'Saved bots and voiced names',
    notes: [
      'New Saves button in the garage: keep up to 8 bots, each with its own name, parts and paint, and switch between them any time.',
      'Voice your bot\'s name: tap the mic by its name in the garage and the commentators record it, then shout it in your fights. One new name a day.',
    ],
  },
  {
    hour: '2026-10-13 20:00',
    title: 'Steadier tear-offs',
    notes: [
      'When a part gets torn off, the camera now holds steady on it for a moment before switching angles, so you see the piece fly off without a jarring cut.',
    ],
  },
  {
    hour: '2026-10-13 15:00',
    title: 'Player accounts',
    notes: [
      'Player accounts: tap Log in on the home screen to make an account with just a username and password. Your bot, paint, emotes and win record are saved to it, so you can log in on any phone or PC and carry on where you left off.',
    ],
  },
  {
    hour: '2026-10-13 14:00',
    title: 'Five robot makers and 30 new parts',
    notes: [
      'Every part now comes from one of five robot makers, each with its own look and fighting style: Bastion Heavy Industries (armour), Kestrel Dynamics (speed), Vulkan Forgeworks (raw power), Halcyon Voltaics (energy and self-repair) and Kensei Precision (accuracy and counters).',
      '30 new parts, six from each maker: riveted blast-door hulls, swept-wing jet frames, furnace-glow forge plating, glowing halo shells and laced samurai armour.',
      'Set bonuses: fit three parts from the same maker for a bonus, and all six for a bigger one. The garage groups parts by maker and shows how close you are, and Diagnostics lists your live bonuses.',
      'New perks to find on the new parts, like Furnace (each clean hit in a row hits harder), Iaido (a big first strike after a pause), Nanite Bloom (repairs while untouched) and Durability, which makes parts harder to break off.',
      'Opponents often show up in matching gear from one maker, and the pre-fight cards show their set.',
      'Finishers get the full commentary treatment: the caller shouts the move as it starts ("Look at that fist crackle! SKYFALL!"), Reg or Unit Seven jumps in on top, the final blow gets a scream, and the knockout call names the finisher. Every finisher has its own lines.',
      'The pre-fight fist bump is one smooth, quick motion now: the bots reach out at full stretch as they arrive, touch fists from further apart and spring back into their guards.',
      'Smoother sound on phones: no more crackles, dropouts or stutter in the commentary and crowd, the commentators no longer dip in volume on every heavy hit, and replies come in right on cue. Every sound is still there.',
      'If the commentators are still talking after both bots are introduced, the camera cuts around the arena: pans along the crowd, a high sweep over the bowl, the ring from the upper tier and low shots across the canvas.',
    ],
  },
  {
    hour: '2026-10-13 13:00',
    title: 'Fight replays and a better booth',
    notes: [
      'The crowd is roaring from the moment the fight screen opens, under the commentators\' opening, instead of waiting for the countdown.',
      'When one commentator asks the other something, the booth waits for the answer before moving on. Only a knockdown or a knockout cuts in.',
      'The opening speech now finishes before the countdown starts.',
      'The crowd countdown sounds like it comes from the stands: a whole arena of voices echoing around the hall, with a roar on every number.',
      'New Replay button on the results screen: watch your last fight again from the walkout to the celebration, every punch exactly as it happened. Tap the intro to jump to the bell, change the speed, or skip to the result from the menu. Replays don\'t count towards your record.',
    ],
  },
  {
    hour: '2026-10-13 05:00',
    title: 'A proper fight night entrance',
    notes: [
      'The caller sounds more like a real person now: relaxed and chatty in quiet moments, talking normally through routine exchanges, and saving the screaming for the big shots.',
      'Every commentary line is voiced again, and the caller shouts every bot\'s name on big shots and wins.',
      'The crowd countdown is now a real arena full of voices shouting three, two, one, FIGHT!',
      'Every fight now opens with a real introduction: the camera goes in close on each bot for three seconds while its card and name land on screen.',
      'The whole crowd counts it down with you: three, two, one, FIGHT!',
      'Before the first punch the two bots walk to the centre, bump fists, step back into their guards and then the fight is on.',
    ],
  },
  {
    hour: '2026-10-13 04:00',
    title: 'A three-voice commentary booth',
    notes: [
      'The commentary booth has brand new voices: a raspy, all-action fight caller, a booming big-fight announcer and a crisp android for Unit Seven.',
      'Meet Unit Seven, a robot co-commentator who joins Danny on the call and Reg on analysis, with fight numbers, damage readouts and a worrying love of robot violence.',
      'All three commentators have new, stronger voices, and every line was rewritten to sound like a real live broadcast.',
      'The booth talks like a real one now: they answer each other before the last word lands, trail off when a big moment talks over them, and fill quiet spells with real conversations about the fight, the circuit, the gear and each other.',
      'The caller now shouts many bots\' names when they land big shots and win.',
    ],
  },
  {
    hour: '2026-10-13 03:00',
    title: 'Finishers',
    notes: [
      'Parts blown off a bot no longer hit an invisible wall at the ropes. A big enough blow sends them sailing over the top rope, off the apron and into the stands, where they clatter down the rows. The fans where it lands leap up and go wild, and the whole arena roars.',
      'New: Finishers. When your opponent is down to 15% health or less and you still have 40% or more, your next landed attack becomes a Finisher: the fight slows down, the camera swings in, and your bot ends it in style with a special combo. Watch for the "Finisher ready" tag on the health bar.',
      'Five finishers to choose from in the garage, under Emotes > Finishers: Skyfall (a charged uppercut into the rafters), Meteor Hammer (a leaping two-fist slam), Cyclone (a spinning kick that sends them flying), Piston Overdrive (a jab storm and a rocket punch) and Headhunter (drop them to their knees and kick their head clean off). A sparring dummy shows each one in the garage.',
    ],
  },
  {
    hour: '2026-10-13 02:00',
    title: 'Live commentary',
    notes: [
      'The commentary booth goes wild now: a brand-new American caller and a gravelly British ex-heavyweight analyst, with every line rewritten to sound like a real boxing or MMA broadcast. They scream on the big shots, argue with each other and do not always keep it polite.',
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
