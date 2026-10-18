/**
 * In-game patch notes, shown from the "Patch notes" button on the home screen.
 *
 * Notes are grouped by the HOUR (UTC) the update was merged to main, newest
 * group first, and a group holds at most 5 lines (several groups may share an
 * hour). Every merge adds its lines to the top group if its hour matches and it
 * has room; otherwise it starts a new group at the top. Newest lines go first inside a group. One short, player-facing line
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
    hour: "2026-10-18 04:00",
    title: "100,000 credits for everyone",
    notes: [
      "Everyone gets a one-time gift of 100,000 credits to spend in the Skin Vault (or the Parts Market). It arrives the next time you open the game, on the web and on Android, and only once per player, even across devices.",
    ],
  },
  {
    hour: "2026-10-18 03:00",
    title: "Smoother fights on Android",
    notes: [
      "You can now have the commentators voice up to 5 bot names a day instead of 1. The garage button shows how many you have left.",
      "Android: the arena's stands draw with less than half the triangles they did. Every seat back is now painted by the crowd itself, and they look just the same.",
      "Android: both robots work out where their arms and legs meet armour at the same time, which takes a chunk off every frame in a clinch.",
      "Android: the fight itself runs a little faster on your phone, with exactly the same results as before.",
    ],
  },
  {
    hour: "2026-10-18 02:00",
    title: "The Skin Vault comes to the web",
    notes: [
      "The Skin Vault from the Android app is open on the web: tap the new Skins button on the home screen to win skins that cover your robot's plating, from 13 Common patterns and 8 Rare exotic finishes to 7 animated Epics.",
      "Every pull drops a capsule that charges up and bursts open, teasing violet for a Rare and gold for an Epic. A 10-pull deals ten cards and turns them over one by one.",
      "Pulls cost career credits: 100, or 900 for ten with a Rare or better inside. A free pull comes back every 4 hours, and your first visit has a free 10-pull waiting.",
      "The odds are in the vault: Epic 4%, Rare 21%, Common 75%, an Epic within 50 pulls, and a featured Epic each day. Duplicates turn into shards that buy the skin you want.",
      "Wear skins from the vault or the garage's new Skins page under Paint, and each one paints on with a sweep of light. Opponents show up in skins too, and title finals in an Epic one.",
    ],
  },
  {
    hour: "2026-10-18 01:00",
    title: "The Skin Vault",
    notes: [
      "Android: the Skin Vault is open. Win skins, special paint jobs that cover your robot's plating: 13 Common patterns, 8 Rare exotic finishes and 7 animated Epic skins that move as you fight.",
      "Every pull drops a capsule that charges up and bursts open, its light teasing violet for a Rare and gold for an Epic. A 10-pull deals ten cards and turns them over one by one.",
      "Pulls cost career credits: 100, or 900 for ten with a Rare or better guaranteed. A free pull comes back every 4 hours, and your first visit has a free 10-pull waiting.",
      "The odds are in the vault: Epic 4%, Rare 21%, Common 75%, an Epic guaranteed within 50 pulls, and a featured Epic each day. Duplicates turn into shards that buy the skin you want.",
      "Wear skins from the vault's Collection or the garage's new Skins page, and each one paints on with a sweep of light. Opponents show up in skins too, and title finals in an Epic one.",
    ],
  },
  {
    hour: "2026-10-18 00:00",
    title: "The referee comes to the web",
    notes: [
      "The referee drone from the Android app now runs every fight on the web too: it presents both robots, counts down 3-2-1 on its face and chops the air for FIGHT!",
      "It watches each exchange from the side, flinches at big hits, moves in to break up clinches, and counts a downed robot with the same number as the count on screen.",
      "At a knockout it waves the fight off with K.O. on its face, then raises the winner's hand with a happy spin.",
      "On the web too, every Rare and Epic part is unlocked for now: fit anything from any maker in the garage. The career still pays out as usual.",
      "The home screen now shows which build of the game you're on, next to What's new.",
    ],
  },
  {
    hour: "2026-10-17 23:00",
    title: "Every part unlocked",
    notes: [
      "On Android, every Rare and Epic part is unlocked for now: fit anything from any maker in the garage, no career wins needed. The career still pays out credits, crates and trophies as usual.",
    ],
  },
  {
    hour: "2026-10-17 03:00",
    title: "A referee in the ring",
    notes: [
      "Android fights now have a referee: a little striped drone that drops in for the walk-outs, presents both robots, counts down 3-2-1 on its face and chops the air for FIGHT!",
      "The referee watches every exchange, flinches at the big hits and throws its hands up at finishers. Get too cosy in a clinch and it moves in to break you up.",
      "When a robot goes down, the referee flies over and counts it, the number on its face and its arm pumping with each count, and waves it on if it beats the count.",
      "At a knockout it waves the fight off, then raises the winner's hand with a happy spin, lit in the winner's colours.",
    ],
  },
  {
    hour: "2026-10-16 21:00",
    title: "The Android app gets its menus",
    notes: [
      "The Android app now has the whole game around the fights: the garage, the career map with its event venues, the Parts Market, the trophy room and the animated home scenes.",
      "On Android, the Resolution setting now reads Low (0.5x), Normal (0.75x) and Extra (1x native).",
    ],
  },
  {
    hour: "2026-10-16 16:00",
    title: "Lighter fights",
    notes: [
      "Fights take noticeably less work for your device to run, so busy exchanges stay smoother. Every fight still plays out exactly the same.",
    ],
  },
  {
    hour: "2026-10-16 02:00",
    title: "A quiet paradise beach",
    notes: [
      "The home beach has been rebuilt from scratch as a quiet tropical lagoon: soft white sand, clear turquoise water and nobody else around.",
      "Little waves now wash up the sand and leave it wet and shiny as they drain away, with sunlight rippling over the lagoon floor.",
      "New palms sway in the breeze over a thatched sunshade, a hammock, an outrigger canoe and a green jungle hillside, with islands out on the horizon.",
      "The beach music is slower and softer, with lapping water and the odd dove instead of gulls.",
    ],
  },
  {
    hour: "2026-10-15 21:00",
    title: "Rare and Epic gear is here",
    notes: [
      "72 new Rare and Epic parts: every maker has a Rare and an Epic part for each slot, each with its own shape, name, stats and passive. Win them in Career or buy them in the Parts Market.",
      "Epic sets are each maker's showpiece: a steam locomotive (Ironhorse), floating halos (Lumen), a dragon (Longwei), a gold lion (Martelli), a shogun warlord (Kensei) and an SR-71 Blackbird (Strix).",
      "Rare sets have their own looks too: a big-rig truck, a sleek phone-style suit, a space station, Gothic plate armour, a ninja and a VTOL jump jet.",
      "Rare parts glow blue and Epic parts glow purple, and each part's rarity shows on its garage tile.",
      "Big back pieces like wings, banners and halos no longer push your bot's arms out from its sides.",
    ],
  },
  {
    hour: "2026-10-15 20:00",
    title: "Career mode",
    notes: [
      "Career mode on the World map: every cup and championship round now pays prize money, more in later rounds, at bigger events and for a knockout. Even a loss pays a small appearance fee.",
      "Win a title for a bonus purse and a crate with a Rare or Epic part inside, and beaten rivals sometimes leave one of their parts behind.",
      "New Parts Market on the World map: spend your credits on Rare and Epic parts. The shelf restocks every few fights with one deal at 30% off, and Epics open up once you hold two titles.",
    ],
  },
  {
    hour: "2026-10-15 20:00",
    title: "Rare and Epic gear on the way",
    notes: [
      "Climb the career ranks from Rookie to Legend, and see your cups, belts and part collection in the new Trophy room.",
      "All 23 rivals now have their own maker, frame, story and a taunt before the fight. Their gear gets better every round, and every time you come back to defend a title.",
      "Rare and Epic parts are locked in the garage until you earn them in Career, but you can still try them on.",
      "Titles you won before today are paid out in credits the first time you open Career.",
      "Getting ready for Rare and Epic gear: every maker now has a Common, Rare and Epic part for each slot in the catalogue, each with its own stats and passive. They switch on with their new looks very soon.",
    ],
  },
  {
    hour: "2026-10-15 15:00",
    title: "No shadows at night",
    notes: [
      "Fixed the beach robots twisting and flailing: the dog walker now strolls along the shore properly and the volleyball players stay on their court.",
      "At night the world map no longer shows the big buildings' long daytime shadows (or the hills'): they fade away as it gets dark and come back with the morning sun.",
    ],
  },
  {
    hour: "2026-10-15 15:00",
    title: "Summer beach and a cleaner loading screen",
    notes: [
      "The turning ring is gone from the loading screen: the logo and progress line now sit centred over the flowing light.",
      "The robot dog is rebuilt from scratch, with proper legs: it trots after its owner, gallops off, splashes in the surf, sniffs around and shakes itself dry.",
      "New boats out at sea: sailing sloops, a motor yacht, a catamaran and a fishing boat, plus a paddleboarder and a windsurfer.",
      "Brighter summer day at the beach: bluer sky, turquoise water and big layered mountains on the horizon.",
      "The crab scuttles properly, the cooler opens like a real one, the lounger next to yours is fixed, and the book no longer hides your phone.",
    ],
  },
  {
    hour: "2026-10-15 15:00",
    title: "Steady arms near the head",
    notes: [
      "The beach is full of real game bots now: sunbathing, chatting, swimming, playing volleyball and riding boards, with a new mix every visit.",
      "Fists and forearms no longer snap between positions near the head: guards, blocks and the coconut drink on the beach now move smoothly.",
      "Arms slide cleanly over armour edges instead of catching on them and jumping sideways.",
      "A forearm held across the face no longer spins or flicks.",
      "When two robots are pressed chest to chest, a squeezed elbow eases into place instead of popping.",
    ],
  },
  {
    hour: "2026-10-15 14:00",
    title: "A new loading screen and ray tracing fixes",
    notes: [
      "A redesigned loading screen: a glowing boxing ring turns slowly in the dark beside the logo, with a cleaner progress line and a big percentage counter.",
      "Fixed dark horizontal lines across the floor and other surfaces with ray tracing on. They showed up at some screen resolutions and not others, which is why they came and went between launches.",
      "Soft shadows no longer show faint stripes on surfaces the light only grazes.",
    ],
  },
  {
    hour: "2026-10-15 13:00",
    title: "Smoother walking and loading",
    notes: [
      "The loading screen stays smooth while the game loads: the bar glides steadily instead of jumping, and the spinner never stops turning.",
      "Bots no longer sink down while they walk: every stride now fits the legs, a trailing foot rolls up onto its toes instead of dragging the hips down, and a foot that gets left behind takes a quick catch step.",
      "Steps land where they should: a stride re-aims mid-swing when the bot speeds up, slows or turns, and when a bot stops its last foot lands under it instead of out in front.",
      "Setting off and pulling up look natural: bots ease into a walk and out of it instead of lurching, and they stay standing as they walked instead of shuffling back into a fighting stance.",
      "Fight footwork keeps the hips level: the stance shortens a little on the move, and the small bob on each step is gentler.",
    ],
  },
  {
    hour: "2026-10-15 13:00",
    title: "Richer home scenes",
    notes: [
      "The beach is busier: robots sunbathe, play volleyball and walk a dog along the shore, with a tiki stand and lifeguard tower down the sand.",
      "Beach palms, sand, sea and clouds are far more detailed, with swaying sea oats and flags rippling in the breeze.",
      "Your beach lounger got a makeover: wood grain, piped cushions, a towel over the back and a boombox with a bouncing equaliser.",
      "The gym got a big makeover: worn floors, grimy brick, peeling fight posters, a training whiteboard, a title belt and a robot workbench by the door.",
      "The gym feels alive: a standing fan sweeps the room, a double-end bag bounces, a security camera pans and an old tube light flickers.",
    ],
  },
  {
    hour: "2026-10-15 13:00",
    title: "Richer home scenes",
    notes: [
      "New gear around the gym: a glove rack, an agility ladder, a stretching corner, jump ropes and a sledgehammer, and the clock shows your real time.",
      "The lounge sofa is now plump and buttoned, with piping, a knitted throw and a blanket over the arm, and wood, velvet and knit show real texture.",
      "Through the lounge window the city lights flicker, beacons blink and planes cross the rainy sky, while car headlights sweep the ceiling.",
      "The lounge has a neon sign in the window, a fish tank, a radiator, fight posters and a pizza box on the floor.",
    ],
  },
  {
    hour: "2026-10-15 12:00",
    title: "A fresh loading screen",
    notes: [
      "A brand new loading screen: flowing ribbons of light, drifting sparkles and a clean progress line.",
    ],
  },
  {
    hour: "2026-10-15 12:00",
    title: "Natural walking, quicker map and roads at night",
    notes: [
      "The world map is now built while the game loads, so it opens straight away.",
      "Loading messages are simpler and tell you what's happening in plain words.",
      "Bots walk like they have weight now: slower, longer strides that roll heel to toe, one foot at a time, with the arms swinging when the hands are down. Walking out to touch gloves and the gym walk to the arena door are calmer, and bigger bots take slower steps.",
      "Fight footwork is less fidgety: bots move in fewer, smoother steps instead of constant quick shuffles, and stop re-planting their feet every moment while they wait.",
      "At night the roads light up properly: pools of lamplight along the streets and the expressway, lamps in the villages, and headlights and tail lights moving along the country roads.",
    ],
  },
  {
    hour: "2026-10-15 12:00",
    title: "New roads, fullscreen and the river's mouth",
    notes: [
      "The world map has real roads now, each kind its own: an expressway with a lit median runs out of the city into a mountain tunnel, country roads wind out to Lantern Grove and the lighthouse on grassy banks, a mountain road with a double yellow line and stone walls climbs the valley, and village lanes and dirt farm tracks run between the fields.",
      "City streets have crisp kerbs and pavements instead of blurry edges: rounded corners, zebra crossings and stop lines at every junction, scramble crossings where the avenues meet, bus lanes and tree-lined medians that glow neon at night, and little cobbled alleys hung with paper lanterns.",
      "A red funicular now carries visitors from the end of the mountain road up the cliff to Cascade Falls.",
      "On the world map the river now runs out into the sea through a real estuary: level with the sea instead of ending in a hard edge, over a wide shallow delta with sandbars, its greener water fanning out and fading into the blue, with surf following the new shores.",
      "New fullscreen button on the home screen, next to settings. Tap it to go fullscreen or back to a window; once you turn fullscreen off, the game stops switching it back on by itself.",
    ],
  },
  {
    hour: "2026-10-15 12:00",
    title: "Home scenes load up front, river and skies",
    notes: [
      "Every home background (beach, gym and lounge) is now built while the game loads, so switching between them shows the new one straight away instead of after a few seconds.",
      "The loading screen is calmer: the swinging spotlights are gone, leaving the arena floor and the power core.",
      "By day the world map's sky is clear again: the searchlights sweeping up from the towers and the holograms (the koi, the whale, the robot, the tower ads and the ad screens over downtown) now only come out at night, fading in as it gets dark.",
      "The river on the world map now really flows: fast down the middle and slow by the banks, with ripples and lines of foam carried downstream, white water churning over the rapids, foam lacing the banks, and the sun glittering on it and dancing over the stony shallows. The lake above the falls shows its shallows too.",
      "Cascade Falls drops sheer off the cliff again in a tall white curtain with spray at its foot, the dam sits on the cliff edge instead of hanging in the air, and the river below now runs down its valley instead of floating over it, tumbling through a run of rapids on the way to the city.",
    ],
  },
  {
    hour: "2026-10-15 12:00",
    title: "New loading screen, map and big bots",
    notes: [
      "A new loading screen: stage lights swing over the arena floor while a power core fills with the game's real progress, showing what it's doing right now (lighting the arena, opening the workshop, setting up your home scene) and a tip to read while you wait.",
      "While it loads, the game now gets everything ready up front: every shader, texture and reflection of the arena, the workshop and your home scene, the screen effects and the ray-traced lighting. No more stutter the first time you enter the arena, open the garage or land the first hit of a fight. If you're logged in, your saved bot is fetched before the home screen appears, so it no longer swaps in a moment later.",
      "Sounds are made during loading too (punches, clangs, the crowd's 3-2-1 chant), so the first tap no longer hitches, and your bot's walk-on theme and the garage's part pictures are prepared in the background right after.",
      "Tapping an arena on the world map now flies it to the middle of the map you can see, beside the event card, on phones and PC at any zoom. Skydeck 88 up on its tower no longer ends up near the top of the screen.",
      "Frame size now really matters for strike power: a max-size bot hits about 20% harder than a standard one and roughly half again as hard as a tiny one, and knocks people down far more often. In exchange big bots are a little slower on their feet and with their hands, and gain less extra health than before, so small bots still win by landing far more shots.",
    ],
  },
  {
    hour: "2026-10-15 12:00",
    title: "Smoother arms, natural mountains",
    notes: [
      "The mountains on the world map are no longer a forest of spikes: long rounded ridgelines and big massifs, with valleys between, snow on the highest crests and gullies running down every slope where water has worn them.",
      "Mountainsides now weather like real ones: grey rock on the spurs and tops, green in the gullies, and the lake above the falls sits in a high valley between two mountain shoulders.",
      "The far ranges behind the map are drawn in finer detail and coloured to match, so they fade into the haze without blocky faces.",
      "Fists and forearms no longer twitch. They used to spin round in a single frame when an arm crossed the body or straightened, and jolt whenever they brushed armour; now they turn and slide smoothly, in fights and in the home scenes.",
      "Arms flow back into the guard after kicks and dodges instead of snapping there, fists turn smoothly into each punch, and on the beach the robot no longer bobs the coconut with a jerk while it drinks.",
    ],
  },
  {
    hour: "2026-10-15 12:00",
    title: "Ray-traced lighting",
    notes: [
      "New ray-traced lighting, on by default on PC: light now bounces off whatever is near it, so the orange ring skirt glows on the floor and a red robot tints the canvas, and every corner, seam and joint sits in its own soft shade.",
      "The canvas and the arena floor are glossy now and mirror the robots, the ropes, the LED skirt and the lights above: sharp where a foot meets the floor, blurring with distance. Event venues with smooth floors (the Harbor plates, Skydeck's deck, the wet pavers at the dam) reflect too.",
      "Shadows soften the way real ones do: crisp where a robot's feet meet the canvas and wider and softer the higher up the body casts them, and small shadows now show in fingers, joints and armour seams.",
      "Chrome and paint now reflect the venue you actually fight in (the truss lamps, the screens, the crowd, the harbour sunset) instead of a plain studio, and robot plating has a finer finish: brushed metal, patchy sheen and a faint ripple in the paint.",
      "Phones can switch ray tracing on in Settings, under Graphics (it is off there by default to keep fights smooth). The Performance stats GPU tab shows what it costs on its own Ray tracing row.",
    ],
  },
  {
    hour: "2026-10-15 11:00",
    title: "Real dents and performance stats",
    notes: [
      "Fixed windows on the world map's buildings and towers sparkling with static: every window is now cleanly lit or dark, and far-off houses' windows no longer flicker against their walls.",
      "Robots now dent for real. Every blow that lands punches a dent where it struck, pushed in the way the blow travelled, with a lip of bent metal around it and the paint knocked off its floor. Hit the same spot again and it caves in deeper and wider, so a chest that keeps eating hooks ends up visibly crushed.",
      "Battered plates now buckle out of shape instead of just looking scuffed: the armour bends, light rolls into the dents, their shadows follow, and a torn-off arm or head keeps every dent it took. Replays rebuild the dents when you skip ahead.",
      "The GPU tab in Performance stats now splits Bloom/post into MSAA resolve, Bloom and Final pass, so you can see which one is taking the time.",
      "Performance stats now show which graphics chip the game is running on (like GeForce RTX 3060, Adreno 740 or Apple M1) and whether it draws with WebGPU or WebGL, on PC and phones. Where the browser hides the exact model, as Safari on iPhone does, it says so.",
    ],
  },
  {
    hour: "2026-10-15 10:00",
    title: "Fixes",
    notes: [
      "The What's new button on the home screen works again: the hidden world map was sitting on top of it and swallowing the taps.",
    ],
  },
  {
    hour: "2026-10-15 03:00",
    title: "Skydeck 88",
    notes: [
      "The Neon Heights Championship now has its own venue, Skydeck 88: a ring on the roof of the tower in the middle of downtown, at night, with the whole city from the world map spread out below, the Spire's neon glass rising right behind the north stand, and the holo whale gliding past over the streets.",
      "Up on Skydeck 88: lit glass floors stepping out under the deck, holo banners beamed up from lattice masts at the corners, a ring of holo text circling over the roof, searchlights sweeping the sky and flying cars streaming round downtown at the height of the deck.",
    ],
  },
  {
    hour: "2026-10-15 02:00",
    title: "Pier 9, the Lantern Grove and Cascade Falls",
    notes: [
      "The Cascade Championship now has its own venue, Cascade Falls Dam: a ring on a bastion jutting from the crest of an old concrete dam high in the mountains, with a still reservoir under snowy peaks behind, a seventy metre drop to the river in front, and the spillway roaring over its weir right beside the stands in four white curtains, a rainbow hanging in the spray.",
      "The Lantern Grove Cup now has its own venue, The Lantern Grove: a clearing among giant cedars at dusk, strings of paper lanterns round the stands, vermilion torii at the east and west corners, raked white gravel, a path of a hundred little gates up into the forest, a shrine on its stone terrace, a pond with a red bridge, fireflies, mist and sky lanterns drifting up.",
      "The Harbor Cup now has its own venue, Pier 9 Container Yard: a ring on the quay at sunset, stands painted in container colours inside a wall of boxes strung with festoon lights, giant cranes unloading a container ship alongside, a tug and a lighthouse out on the water, and the city's mega-towers glowing across the yard.",
      "World map pins are just their icons now, so the names no longer cover the city. Tap one to see the event.",
    ],
  },
  {
    hour: "2026-10-15 02:00",
    title: "Downtown after dark",
    notes: [
      "The jellyfish are gone. In their place, rooftop projectors beam hologram ads into the air over downtown: fight nights, the six makers and every cup on the map, flickering from one ad to the next.",
      "Four mega-towers now rise over the middle of the World map's city: a twisting glass Spire, a stacked Arcology with gardens on every terrace, the Needle with its halo decks and a dark Monolith, with giant screens and searchlights sweeping the sky.",
      "More holograms downtown: a whale swimming laps high round the towers, jellyfish drifting between them, a giant robot shadow-boxing in the plaza and glitching adverts off the skyscrapers. The koi is still there.",
      "New day/night button on the World map: at night the windows, neon, street lamps and holograms light the city up under a moonlit sky.",
      "More detail everywhere on the map: country houses with porches, gardens, sheds and solar panels, farms with barns, silos and glowing greenhouses, and radio masts, water tanks, billboards and shop signs across the city.",
    ],
  },
  {
    hour: "2026-10-15 01:00",
    title: "The World map",
    notes: [
      "The Island Championship now has its own venue, Coral Beach Ring: sun-bleached bleachers under striped shade sails on a little island, palms over the sand, a jetty with the ferry tied up, surf breaking on the beach and the city's towers far across the sea.",
      "Outdoor fights are lit by the late afternoon sun, and a saved replay remembers which venue its fight was in.",
      "New World map, from the home screen: a big neon-lit harbour city at golden hour, with hills, farms, forests, a waterfall and an island out at sea. Drag to look around, pinch or scroll to zoom.",
    ],
  },
  {
    hour: "2026-10-15 01:00",
    title: "A cosier lounge",
    notes: [
      "Six cups and championships to win across the World map, from the container docks to a skyscraper rooftop. Each is a ladder of named rivals that get tougher every round; lose once and the run starts over, but titles you win are yours to keep.",
      "The Grand Championship on the World map opens once you hold three other titles.",
      "Your progress in every World map event is saved with your win record, and follows you to any device when you're signed in.",
      "The beach home screen now watches your robot from its left side, with the sea and sunset off to one side.",
      "Lounge: a knitted pouf with headphones, a basket of blankets, records on the floor, an open book on the sofa, cookies by the candles and slippers on the rug.",
    ],
  },
  {
    hour: "2026-10-15 01:00",
    title: "Smoother grappling",
    notes: [
      "Lounge: a little robot cat sleeps curled up at the end of the sofa, flicking its tail, and jolts awake when the news breaks.",
      "Lounge: pothos trail from hanging planters in front of the rainy window, dust drifts in the lamplight and the wall clock shows your own time.",
      "Clinches look and feel weightier: bodies ease into the tie-up, arms swim inside for the underhooks, drives walk them onto the ropes and settle there, and plum knees pull the head down onto them.",
      "Takedowns are real moves now: trips step in behind the heel and reap the leg, body-lock lifts carry them up and round before the slam, and double legs drive in off a deep penetration step, scoop the legs and turn the corner.",
      "Push-offs, referee breaks, sprawls, two-handed shoves and the step back after a takedown all play out smoothly instead of snapping apart.",
    ],
  },
  {
    hour: "2026-10-15 00:00",
    title: "A livelier beach",
    notes: [
      "Beach: a kite swoops over the shallows, a yacht crosses the bay trailing its wake, and a little robot paddleboards past the buoys.",
      "Beach: more parasols, towels and a windbreak down the shore, bunting at the beach bar, shells in the sand, flags on the sandcastle, spray glittering off the surf and a cocktail on the side table.",
    ],
  },
  {
    hour: "2026-10-15 00:00",
    title: "Online replays, light-up entrance tunnels",
    notes: [
      "Beach: dune grass and flowering shrubs sway in the breeze, and dry fronds lie fallen under the palms.",
      "The hover stretcher is longer, so the loser lies on it with room to spare, and it's sized to match the bot riding it.",
      "Gym: the bot no longer shakes and glitches as it pushes the doors open on its way to a fight.",
      "Online fights have replays too: tap Replay or Save replay on the results. Your opponent waits in the room, and Rematch is right there on the replay's results.",
      "The entrance tunnels are rebuilt as deep halls running under the stands. Each has a lit portal with LED pylons, a dot-matrix marquee and a crown of bulbs, and rings of team-coloured light race down it to the energy gate.",
    ],
  },
  {
    hour: "2026-10-14 23:00",
    title: "Fighting on one leg",
    notes: [
      "Losing a leg no longer ends the fight. The bot goes down, pushes itself back up on the leg it has left and fights on, hopping.",
      "On one leg a bot moves in slow, weighty hops, sways as it keeps its balance, throws no kicks and goes over far more easily. Lose the second leg and it's dismantled.",
    ],
  },
  {
    hour: "2026-10-14 22:00",
    title: "A rainy night in, and a smoother, lighter arena",
    notes: [
      "Hits feel smooth: instead of freezing for a few frames on impact, the fight dips into a split second of slow motion and eases straight back.",
      "No more hitch the first time a fight throws sparks, rips a part off or calls the stretcher: every effect is ready before the bell.",
      "The arena is much lighter to run, especially on phones: the stands, crowd and ring take a fraction of the work to draw and look the same.",
      "Glow and shockwaves cost less on phones, so big exchanges hold a steadier frame rate.",
      "New home scene, the Lounge: your bot slumps on a velvet sofa with its feet up and a steaming coffee, watching a fireplace on TV while rain runs down a big window over the city at night. Lightning flickers, a record turns, candles and fairy lights glow and a robot vacuum does its rounds. Hit Fight and the TV cuts to the news: you're up. Cue the spit-take.",
    ],
  },
  {
    hour: "2026-10-14 22:00",
    title: "Walk-on music, remastered",
    notes: [
      "All six entrance songs are new, full productions: real chord progressions, melodies and a proper build into the drop, with layered drums, bass that carries on phone speakers, reverb and a mastered mix.",
      "Steel Anthem brings double-tracked guitars and a screaming lead, Neon Drive a gated pad and a singing synth over a racing arpeggio, and Iron Forge anvils, a klaxon and a gated bass riff.",
      "Bass Drop is now a trap tune with a tightening snare roll, a breath, then sliding 808s and rattling hats. Champion's Call is a full brass fanfare with timpani, strings and chimes, and Arcade Boss a fast chiptune boss theme.",
      "Each theme is about twelve seconds long now, so a bot that waits longer to come out still has music, and the garage previews play the whole tune.",
      "The music starts in time with the entrance even when it has to be prepared at the last moment, instead of staying silent.",
    ],
  },
  {
    hour: "2026-10-14 21:00",
    title: "A proper exit for the loser",
    notes: [
      "The beach is clearer: the pier, the overwater houses, the lighthouse and the rocks are gone, leaving open sand and sea.",
      "The stretcher ride waits a little longer, then glides down the walkout carpet past the crew and security, waves goodbye and disappears through a glowing gate in the tunnel.",
      "The entrance tunnels are real now: open halls lit by rings of team-coloured light, with a gap in the ad boards to walk through.",
    ],
  },
  {
    hour: "2026-10-14 21:00",
    title: "No more floor fighting, tidier performance stats",
    notes: [
      "The gym got a makeover: brick walls with real relief, a polished concrete floor that catches the light, dusty sunbeams through windows that look out over the city, a pink TRAIN HARD neon, a TV showing a fight, ceiling fans, championship banners, battle ropes, trophies and a training dummy.",
      "The beach is now a golden-hour paradise: a low sun with a glowing halo, lit clouds and lens flare, a sea that sparkles, rolls and foams over the sand, wet sand that shines, plus a pier, overwater bungalows, a lighthouse, kayaks, buoys and a crab. The first shot now looks out to sea over your bot's shoulder.",
      "The loser's stretcher ride no longer crashes the winner's celebration. The victory plays out first, then the show cuts to the loser already aboard, waving and grinning as it glides off to the tunnel.",
      "No more fighting on the floor: after a takedown or a slam the bot stays on its feet, steps back and lets the other one get up, instead of kneeling over it to punch.",
      "Performance stats now start as just the FPS counter. Tap it to open the full panel.",
    ],
  },
  {
    hour: "2026-10-14 21:00",
    title: "Saved replays, steadier entrances, finishers that connect",
    notes: [
      "Save your favourite fights: tap Save replay on the results, then watch them again any time from Replays on the home screen. You can keep 30, and they follow your account to other devices.",
      "Replays now show the fight exactly as you saw it: the same camera shots and cuts, and the same commentary lines at the same moments, even when you skip around with the replay controls.",
      "Replays saved before a game update still play, marked as an older version, since the bots may not fight it out exactly the same way.",
      "Finishers connect for real: every punch, kick and smash lands on the robot instead of passing through it or hitting thin air, whatever size either bot is.",
      "Finisher blows follow the opponent as it reels, folds over or drops to its knees, and your bot steps to the right range before each shot, so nothing whiffs or gets cut short. Overdrive's crosses all land now.",
      "Meteor's double-fisted smash comes down on the opponent's back, fists and feet shove the opponent instead of sinking into it, and finisher impact sparks fly from where the blow actually lands.",
      "The camera holds still while each bot rides up and does its entrance, instead of swinging round whenever the bot spins or turns.",
    ],
  },
  {
    hour: "2026-10-14 21:00",
    title: "Living home screens, MMA fighting, maker makeovers (part 3)",
    notes: [
      "The home screen comes alive: your robot now kicks back on a sun lounger at a tropical beach, sipping from a coconut, or trains on the heavy bag in a boxing gym. Pick the place (or the arena, as before) with the new scene button at the top.",
      "Hit Fight on the beach and the phone rings: your bot takes the call, tosses the coconut, flips its shades up and gets to its feet, ready to fight. In the gym it lands one last huge punch on the bag, then walks to the arena door and pushes it open into the light. Tap the screen to skip.",
      "All gear has been rebuilt so each maker looks like itself: Ironhorse is riveted steel with headlamps, radiator grilles, exhaust stacks, dozer blades and rubber tracks; Lumen is seamless and smooth with smoked glass and single light lines; Longwei is sharp and sturdy with carbon panels, glass sensor bands and a lidar crown; Martelli is classic heavy armour with brass trim, a plumed helm, a muscle cuirass and a V-twin on the back; Kensei keeps its lacquered samurai plate with gold crests; Strix is a faceted stealth jet with a gold canopy, intakes and tail fins.",
      "Each maker's power core now glows its own colour: diesel orange, Lumen white, Longwei cyan, Martelli gold, Kensei crimson and Strix green.",
      "Fights are now MMA, not just kickboxing. Bots tie each other up in a clinch, fight for the underhooks, drive knees up from the plum and walk each other onto the ropes.",
    ],
  },
  {
    hour: "2026-10-14 21:00",
    title: "Living home screens, MMA fighting, maker makeovers (part 2)",
    notes: [
      "Takedowns: bots shoot double legs, trip each other from the clinch and lift and slam from a body lock.",
      "Bots defend against it too: they sprawl on shots, push off out of the clinch, and the referee breaks up a clinch that goes quiet.",
      "Bots also shove each other. A bot that is off balance, or caught standing on one leg mid-kick, goes over. Takedowns now show on the results screen.",
      "Pressure fighters and heavy, planted builds like to wrestle; out-fighters would rather keep it standing. Your coach calls change how much your bot grapples too.",
      "Metal pieces flying off a bot now land with a heavy, dull clunk instead of a light, sparkly ting.",
    ],
  },
  {
    hour: "2026-10-14 21:00",
    title: "Living home screens, MMA fighting, maker makeovers (part 1)",
    notes: [
      "Vapour jets from damaged joints now only start on parts that are nearly wrecked (below 20%), blow every 3 to 7 seconds instead of every second or two, and each burst is a random size, from a short puff up to the full blast. The vapour is also a touch more see-through.",
      "After every knockout the loser gets carried off on a hover stretcher. It swoops in from the tunnel, a lift beam floats the loser aboard, and then the loser perks right up for the camera with one of five bits: a peace sign, double thumbs up, a wave to the crowd, a lie-back with its hands behind its head, or some disco pointing. Then it flies off over the ropes and out the tunnel.",
      "If the loser was torn apart, every piece that came off flies onto the stretcher too, even the ones that landed in the stands.",
      "The results come up once the stretcher has gone. Tap Skip to see them straight away.",
      "The camera, speed and pause buttons now stay out of the way while the bots are introduced, so they no longer sit behind the name cards.",
    ],
  },
  {
    hour: "2026-10-14 20:00",
    title: "A new ring, heavier hits, arena light show (part 6)",
    notes: [
      "Six new robot makers: Ironhorse Diesel Works, Lumen, Longwei Robotics, Officine Martelli, Kensei Precision and Strix Aerospace. Each builds one part for every slot, with its own set bonuses. Your saved bots move over to the maker that took over each old part.",
      "Ironhorse diesel parts are the strongest in the game, but they only run on a full diesel bot. Fit all six or they stall and do nothing. Their engine also warms up, hitting harder over the first 30 seconds.",
      "Bots now make a real entrance: each one rides a lift up through a glowing hatch in its corner, with fog pouring out, a spotlight, sparks and CO2 cannons firing as it locks into place. They wait in their corners for the countdown, then walk out to touch gloves.",
      "Six entrances to pick from in the garage (Emotes > Entrances): Power Up, Hero Landing, Cold Stare, Crowd Pleaser, Shadow Boxer and Earthquake. Equip none and your bot picks one to suit its style.",
      "Every bot has its own walk-on music, with the drop landing the moment it arrives: Steel Anthem, Neon Drive, Iron Forge, Bass Drop, Champion's Call or Arcade Boss. Pick yours in the Entrances tab and tap to hear it.",
    ],
  },
  {
    hour: "2026-10-14 20:00",
    title: "A new ring, heavier hits, arena light show (part 5)",
    notes: [
      "The two corners are now properly blue and orange, with coloured corner pads and a lift hatch that stays as the corner's floor plate during the fight.",
      "Camera drones now carry a red recording light on the nose and in the eye that blinks while they film.",
      "Damage flying off a bot is now real wreckage: jagged shards of torn armour, curled strips, nuts, bolts and washers at true size. They burst off hard with the blow, the freshly torn ones glowing orange and trailing sparks and smoke as they cool, then clatter and skid across the canvas and stay there, piling up as the fight wears on.",
      "The camera drones got a sci-fi makeover: sleek pearl-white hulls with a big glass eye, four glowing ducted fans instead of propellers, and cyan thrusters underneath that flare up when they race between shots.",
      "Vapour jets look far better: a hard streak of pressure blasts out of the joint and breaks into lumpy, lit clouds that curl upward and fray into wisps.",
    ],
  },
  {
    hour: "2026-10-14 20:00",
    title: "A new ring, heavier hits, arena light show (part 4)",
    notes: [
      "Better pyro: flame cannons now fire a roaring jet that blooms into a churning fireball, throws off embers and leaves a cloud of smoke, and the spark fountains spray streaking white-hot sparks that crackle out as they fall. The cannons and fountains now sit on the arena floor where you can see them.",
      "Smoother fights on phones: the robots, the ring floor, the crowd and the stands all cost the graphics chip much less to draw, with no change to how they look. Tiny details too small to see are skipped (and left out of shadows), and the parts of the arena behind the camera are no longer drawn.",
      "The whole game has a fresh, cleaner look: one simple console-style design across every menu, with glass panels, rounded buttons, and a bright white button for the next thing to do.",
      "New home screen: your bot's name, moves and six fitted parts sit bottom left (tap a part to jump straight to it in the garage), and Fight, Garage and Online sit together bottom right.",
      "The results screen is one tidy card with a bar under each stat showing who came out ahead. Settings, pause, saved bots, account and online rooms all share the new style, and patch notes are now under What's new.",
    ],
  },
  {
    hour: "2026-10-14 20:00",
    title: "A new ring, heavier hits, arena light show (part 3)",
    notes: [
      "The arena puts on a proper show: 20 moving-head lights on the roof sweep beams through the stands, wheel round as the bots walk out, lock onto the ring for the countdown and strobe in the winner's colour on a KO.",
      "Pyro round the stage: spark fountains as each bot is introduced, flame cannons on FIGHT!, finishers and knockouts, and confetti in the winner's colour rains down from the roof at the end.",
      "The big screen now shows each bot's name in its corner colour as it is introduced, and a new ring of ad boards crowns the top of the stands.",
      "The garage parts menu is rebuilt around the makers: pick a maker from the logo tabs to see what they build for, how close you are to their set bonus, and their parts as big tiles.",
      "Tap a part to try it on before fitting it: your bot wears it, the diagnostics show what it adds or takes away, and any set bonus it unlocks or loses lights up. Press Equip, or tap it again, to fit it. On a keyboard the arrows browse and Enter fits.",
    ],
  },
  {
    hour: "2026-10-14 20:00",
    title: "A new ring, heavier hits, arena light show (part 2)",
    notes: [
      "Knocked-down bots get back up a bit more often before the count runs out.",
      "The ring has been rebuilt: a new printed canvas with a gear emblem, hazard-striped corners and skid marks from old fights, a padded edge, and an LED skirt round the stage that scrolls the league name and flares when the crowd goes wild. New padded corner posts with glowing beacons and LED strips, thicker neon-core ropes tied with straps that bend with them, and a steel truss overhead with the spotlights hanging from it.",
      "Hits sound like real armour now: every blow rings the plate it lands on, big shots leave the panel clanging, and battered parts crunch and rattle instead of ringing clean.",
      "Sparks streak off in the direction of the blow, skate across the plating and bounce along the canvas, cooling from white hot to red.",
      "Hard hits knock nuts, bolts and flecks of paint loose that clink across the canvas. The more beaten up a part is, the more comes off it.",
    ],
  },
  {
    hour: "2026-10-14 20:00",
    title: "A new ring, heavier hits, arena light show (part 1)",
    notes: [
      "The camera now rocks the way each blow travels, so you feel which way the hit went.",
      "Badly damaged parts now blast hard, hissing jets of high-pressure vapour out of their joints, more often as the part nears failure and every time it gets hit. Tear the part off and the venting stops.",
      "New icons for every special move, and every passive now has its own icon in the garage and on the fight HUD.",
      "The back arrow in the garage and online screens is now a proper Home button with a house icon, and the results screen's Home button says what it does.",
      "The arena floor around the ring is now matte black, no more shiny glare.",
    ],
  },
  {
    hour: "2026-10-14 19:00",
    title: "Thrown out of the ring, replay controls",
    notes: [
      "Replays now have media-player controls: play and pause, jump back or ahead 5 seconds, step frame by frame while paused, and drag the timeline to any moment. Knockdowns, torn-off parts and the KO are marked on it.",
      "Watch replays at any speed from 0.25x slow motion up to 4x. On a keyboard: space pauses, the arrow keys jump, [ and ] change speed.",
      "Big knockout blows can now send a bot flying over the top rope and out of the ring, crashing down onto the arena floor. The ropes still catch anything lower, and the corner posts are solid all the way up. A bot knocked down outside the ring can't climb back in before ten.",
    ],
  },
  {
    hour: "2026-10-14 17:00",
    title: "Cleaner fights, whole-bot finishers",
    notes: [
      "The bot's-eye camera now always stays on for at least 3 seconds, even through knockdowns and KOs, and can run for up to 7 seconds.",
      "Knocked-down bots get back up a bit more often: their odds of beating the count each second are higher.",
      "Finishers now need a whole bot: if any of your parts has been torn off, you can no longer pull off a finisher.",
      "The little text line at the bottom of fights that narrated every move is gone, so the action and the coach buttons have the screen to themselves.",
    ],
  },
  {
    hour: "2026-10-14 15:00",
    title: "Coach your bot",
    notes: [
      "Coach from the corner! Four buttons along the bottom of a fight: \"Go in!\" makes your bot attack more, \"All in!!!\" sends it in non-stop, \"Defend\" gets its hands up and makes it careful, and \"For the head!\" has it hunt the head. Each call lasts 10 seconds, then the corner needs 15 seconds before the next one.",
      "Coach calls work in online fights too (both players must update), and replays repeat the calls you made.",
    ],
  },
  {
    hour: "2026-10-14 14:00",
    title: "Bot's-eye camera",
    notes: [
      "Every so often the fight camera cuts inside one of the bots' heads for a few seconds, so you see the opponent the way your bot does, through its visor. It never happens during knockdowns, KOs or finishers.",
    ],
  },
  {
    hour: "2026-10-14 04:00",
    title: "Slow bots fight back",
    notes: [
      "Bots no longer pull their own punch halfway through to dodge. Once a punch is on its way they let it go and trade, unless the other shot will clearly land first. Slower bots commit hardest.",
      "Slower, heavier bots no longer turtle up against quick ones. They commit once they are set, meet opponents as they step in and fire straight back when hit, trading speed for power.",
    ],
  },
  {
    hour: "2026-10-14 03:00",
    title: "Bot sizes, beat the count, camera drones and real oil (part 3)",
    notes: [
      "Swipe left or right on the home screen (or drag with the mouse) to walk the camera round your bot. Fling it and it keeps turning, then glides back to the usual view a few seconds after you let go.",
      "Oil now looks like real motor oil: thick, glossy black with a rainbow sheen. Drops bead on the wound, stretch and string out as they fall, and spread into slick puddles.",
      "Tearing a part off wrenches the joint it was attached to: the part it hung from loses 30% of what it had left, and the metal around the socket is wrecked.",
      "Torn sockets gush oil, then keep bleeding for the rest of the fight.",
      "Both robots get oily and dirty as the fight goes on: oil splashes onto the attacker's fists, flicks onto whoever is close, runs down the plating, and coats the feet of a bot that steps in a puddle.",
    ],
  },
  {
    hour: "2026-10-14 03:00",
    title: "Bot sizes, beat the count, camera drones and real oil (part 2)",
    notes: [
      "New Size tab in the garage: build your bot up to 120% or down to 80%. Big bots reach further, have more health and hit harder but are slower and easier to hit. Small bots are quick, sharp and hard to hit. Opponents come in all sizes too.",
      "Downed bots now really try to get up during the count: sometimes their legs give out halfway and they slump back to the canvas.",
      "Knocked-down bots now get a chance to rise on every second of the count, and the more health they have left the better their odds. A badly hurt bot can stay down for ten.",
      "Composure and Reboot now make a bot more likely to beat the count.",
      "The fight camera now keeps your bot on the left of the screen, online too. It only swaps sides when it really has to, like a KO shot or being squeezed against the stands, and comes back on the next cut.",
    ],
  },
  {
    hour: "2026-10-14 03:00",
    title: "Bot sizes, beat the count, camera drones and real oil (part 1)",
    notes: [
      "Three little camera drones now fly the arena. Each camera angle is one of them filming: when the shot cuts, the drone that just filmed hangs where the camera was and climbs away, and you can spot the others hovering past the ring with their red tally lights on.",
    ],
  },
  {
    hour: "2026-10-14 01:00",
    title: "The whole ring is open, and your paint online",
    notes: [
      "No more invisible wall: bots now use the whole ring right up to the ropes, lean and sink into them, and can get pinned there by an opponent pressing forward.",
      "Online fights keep both bots in their owners' own paint. Your opponent is no longer repainted when your colours look alike.",
    ],
  },
  {
    hour: "2026-10-14 00:00",
    title: "Calmer, steadier bots",
    notes: [
      "Guarding hands are calm now: no more twitchy, vibrating forearms. The guard drifts and settles, and holds its shape instead of flicking between high and low.",
      "Everything moves at a more grounded pace: punches and kicks wind up and return to guard more deliberately, the bounce on the toes is slower, and steps, turns and dodges are less hurried. Fights run a few seconds longer.",
    ],
  },
  {
    hour: "2026-10-13 22:00",
    title: "Bots move with real weight, and leak oil (part 2)",
    notes: [
      "A badly beaten chest or lower torso now leaks oil: a slow drip at first, then a pumping stream as it fails. Hits to the wound splash it out, puddles spread across the canvas, and bots that step in them leave oily footprints.",
      "Renaming your bot and recording its name now use proper in-game popups instead of the browser's plain boxes.",
      "If voicing your bot's name fails, the message now says why, so it's easier to fix.",
      "Bots move like they have real weight: torsos wind up and carry a little past each punch before settling, and power shots sit down into the legs first.",
      "Getting hit looks physical: head shots snap the upper body back, body shots fold it over, leg kicks buckle the knees.",
    ],
  },
  {
    hour: "2026-10-13 22:00",
    title: "Bots move with real weight, and leak oil (part 1)",
    notes: [
      "Knockouts drop the legs first: the knees fold, then the bot goes down.",
      "Getting up, celebrations and taunts flow as one smooth movement instead of pausing at each pose.",
      "Idle bots breathe (harder when tired), bounce on their toes with a natural rhythm, and their guard hands never move on a loop. Feet lift, push off the toes and land heel first.",
    ],
  },
  {
    hour: "2026-10-13 21:00",
    title: "Saved bots and voiced names",
    notes: [
      "New Saves button in the garage: keep up to 8 bots, each with its own name, parts and paint, and switch between them any time.",
      "Voice your bot's name: tap the mic by its name in the garage and the commentators record it, then shout it in your fights. One new name a day.",
    ],
  },
  {
    hour: "2026-10-13 20:00",
    title: "Steadier tear-offs",
    notes: [
      "When a part gets torn off, the camera now holds steady on it for a moment before switching angles, so you see the piece fly off without a jarring cut.",
    ],
  },
  {
    hour: "2026-10-13 15:00",
    title: "Player accounts",
    notes: [
      "Player accounts: tap Log in on the home screen to make an account with just a username and password. Your bot, paint, emotes and win record are saved to it, so you can log in on any phone or PC and carry on where you left off.",
    ],
  },
  {
    hour: "2026-10-13 14:00",
    title: "Five robot makers and 30 new parts (part 2)",
    notes: [
      "Every part now comes from one of five robot makers, each with its own look and fighting style: Bastion Heavy Industries (armour), Kestrel Dynamics (speed), Vulkan Forgeworks (raw power), Halcyon Voltaics (energy and self-repair) and Kensei Precision (accuracy and counters).",
      "30 new parts, six from each maker: riveted blast-door hulls, swept-wing jet frames, furnace-glow forge plating, glowing halo shells and laced samurai armour.",
      "Set bonuses: fit three parts from the same maker for a bonus, and all six for a bigger one. The garage groups parts by maker and shows how close you are, and Diagnostics lists your live bonuses.",
      "New perks to find on the new parts, like Furnace (each clean hit in a row hits harder), Iaido (a big first strike after a pause), Nanite Bloom (repairs while untouched) and Durability, which makes parts harder to break off.",
      "Opponents often show up in matching gear from one maker, and the pre-fight cards show their set.",
    ],
  },
  {
    hour: "2026-10-13 14:00",
    title: "Five robot makers and 30 new parts (part 1)",
    notes: [
      "Finishers get the full commentary treatment: the caller shouts the move as it starts (\"Look at that fist crackle! SKYFALL!\"), Reg or Unit Seven jumps in on top, the final blow gets a scream, and the knockout call names the finisher. Every finisher has its own lines.",
      "The pre-fight fist bump is one smooth, quick motion now: the bots reach out at full stretch as they arrive, touch fists from further apart and spring back into their guards.",
      "Smoother sound on phones: no more crackles, dropouts or stutter in the commentary and crowd, the commentators no longer dip in volume on every heavy hit, and replies come in right on cue. Every sound is still there.",
      "If the commentators are still talking after both bots are introduced, the camera cuts around the arena: pans along the crowd, a high sweep over the bowl, the ring from the upper tier and low shots across the canvas.",
    ],
  },
  {
    hour: "2026-10-13 13:00",
    title: "Fight replays and a better booth",
    notes: [
      "The crowd is roaring from the moment the fight screen opens, under the commentators' opening, instead of waiting for the countdown.",
      "When one commentator asks the other something, the booth waits for the answer before moving on. Only a knockdown or a knockout cuts in.",
      "The opening speech now finishes before the countdown starts.",
      "The crowd countdown sounds like it comes from the stands: a whole arena of voices echoing around the hall, with a roar on every number.",
      "New Replay button on the results screen: watch your last fight again from the walkout to the celebration, every punch exactly as it happened. Tap the intro to jump to the bell, change the speed, or skip to the result from the menu. Replays don't count towards your record.",
    ],
  },
  {
    hour: "2026-10-13 05:00",
    title: "A proper fight night entrance (part 2)",
    notes: [
      "The caller sounds more like a real person now: relaxed and chatty in quiet moments, talking normally through routine exchanges, and saving the screaming for the big shots.",
      "Every commentary line is voiced again, and the caller shouts every bot's name on big shots and wins.",
      "The crowd countdown is now a real arena full of voices shouting three, two, one, FIGHT!",
      "Every fight now opens with a real introduction: the camera goes in close on each bot for three seconds while its card and name land on screen.",
      "The whole crowd counts it down with you: three, two, one, FIGHT!",
    ],
  },
  {
    hour: "2026-10-13 05:00",
    title: "A proper fight night entrance (part 1)",
    notes: [
      "Before the first punch the two bots walk to the centre, bump fists, step back into their guards and then the fight is on.",
    ],
  },
  {
    hour: "2026-10-13 04:00",
    title: "A three-voice commentary booth",
    notes: [
      "The commentary booth has brand new voices: a raspy, all-action fight caller, a booming big-fight announcer and a crisp android for Unit Seven.",
      "Meet Unit Seven, a robot co-commentator who joins Danny on the call and Reg on analysis, with fight numbers, damage readouts and a worrying love of robot violence.",
      "All three commentators have new, stronger voices, and every line was rewritten to sound like a real live broadcast.",
      "The booth talks like a real one now: they answer each other before the last word lands, trail off when a big moment talks over them, and fill quiet spells with real conversations about the fight, the circuit, the gear and each other.",
      "The caller now shouts many bots' names when they land big shots and win.",
    ],
  },
  {
    hour: "2026-10-13 03:00",
    title: "Finishers",
    notes: [
      "Parts blown off a bot no longer hit an invisible wall at the ropes. A big enough blow sends them sailing over the top rope, off the apron and into the stands, where they clatter down the rows. The fans where it lands leap up and go wild, and the whole arena roars.",
      "New: Finishers. When your opponent is down to 15% health or less and you still have 40% or more, your next landed attack becomes a Finisher: the fight slows down, the camera swings in, and your bot ends it in style with a special combo. Watch for the \"Finisher ready\" tag on the health bar.",
      "Five finishers to choose from in the garage, under Emotes > Finishers: Skyfall (a charged uppercut into the rafters), Meteor Hammer (a leaping two-fist slam), Cyclone (a spinning kick that sends them flying), Piston Overdrive (a jab storm and a rocket punch) and Headhunter (drop them to their knees and kick their head clean off). A sparring dummy shows each one in the garage.",
    ],
  },
  {
    hour: "2026-10-13 02:00",
    title: "Live commentary",
    notes: [
      "The commentary booth goes wild now: a brand-new American caller and a gravelly British ex-heavyweight analyst, with every line rewritten to sound like a real boxing or MMA broadcast. They scream on the big shots, argue with each other and do not always keep it polite.",
      "Knocked-down bots beat the count a bit more often again. A battered bot or one dropped twice can still stay down for ten, but a single knockdown rarely ends the fight.",
      "Fights now have live voiced commentary: a play-by-play caller and an old-school colour analyst call the punches, kicks, knockdowns, counts, comebacks and KOs as they happen, chat during quiet spells, and wrap up the result. Over 1,300 lines, so it stays fresh fight after fight. Turn it down or off in Settings > Commentary.",
    ],
  },
  {
    hour: "2026-10-13 00:00",
    title: "Knockdowns hit harder",
    notes: [
      "Knocked-down bots get up less often. A fresh bot usually beats the count, but a battered one, one that has already been dropped, or one flattened by a huge shot often stays down for ten and loses by KO.",
    ],
  },
  {
    hour: "2026-10-12 21:00",
    title: "Paint shop, new health bars, emotes and cleaner hits (part 2)",
    notes: [
      "New Paint tab in the garage: 26 ready-made paint jobs, 40 plating colours and 16 glow colours (or any colour you like), six finishes from matte to chrome, and six frame metals including gold and copper. Every change shows on your bot straight away. Your old colours carry over.",
      "Ropes, posts and barriers that come between the camera and the robots disappear again, however far away they are, so nothing blocks your view of the fight.",
      "For now every part is Common: you, your opponents and online rivals all fight with Common gear, so fights come down to your build and moves. Your saved parts were switched to Common, and the rarity picker is gone from the garage. Better tiers will come back later.",
      "Battle damage shows much sooner and bigger: a few hits already scuff and dent the plating, and a badly damaged part caves in, tears open to burnt innards with glowing split edges, and pours sparks and smoke.",
      "New health bars: a steel frame in your bot's colours, ten cells, and a live HP number. Damage now leaves a striped chip behind that hangs while the hits keep coming, then drains away, and the flurry's total shows by the name. Big hits flash and shake the bar.",
    ],
  },
  {
    hour: "2026-10-12 21:00",
    title: "Paint shop, new health bars, emotes and cleaner hits (part 1)",
    notes: [
      "New Emotes tab in the garage: equip up to 3 celebrations and 3 taunts, and tap any of them to watch your bot perform it. Your bot only uses the ones you equip (and they show on your opponent's screen online). Leave a list empty and it picks its own.",
      "Fixed a big robot part on a white square flashing in the bottom-left corner while the game loads.",
      "The x-ray condition panels now sit at the top of the screen, right under each robot's health bar.",
      "The orange glow on a robot part when it gets hit is gone. Dents, scorch marks, cracks and sparks still show the damage.",
    ],
  },
  {
    hour: "2026-10-12 20:00",
    title: "Battle damage, online fights, rebuilt robots, celebrations and better kicks (part 5)",
    notes: [
      "Battle damage: every robot is now 15 parts (head, chest, lower torso, upper arms, forearms, fists, thighs, shins and feet), and hits wear down the part they land on. Blocking wears down the guarding arm and the fist or foot thrown into it.",
      "Damage shows on the robot: plates dent and buckle, paint chips off to bare steel, scorch marks spread, wrecked parts glow with cracks, and badly hurt parts spit sparks and smoke.",
      "A strong hit on a badly damaged head, arm or leg can rip it clean off. It flies across the ring, bounces off the ropes and gets kicked around the canvas while the stump sparks and smokes.",
      "New way to win: tear off the head, a leg, or both arms and the fight ends as DISMANTLED. A bot that loses one arm fights on one-armed.",
      "Damage hurts how a bot fights: battered arms punch slower, cracked fists and feet hit softer, damaged legs move and kick slower, a rattled head reacts late, a caved-in chest leaks stamina and a bent waist is easier to rock.",
    ],
  },
  {
    hour: "2026-10-12 20:00",
    title: "Battle damage, online fights, rebuilt robots, celebrations and better kicks (part 4)",
    notes: [
      "An x-ray condition panel in each bottom corner shows every part during the fight, from teal to red. Parts that could come off with the next big hit blink.",
      "Bots fight around the damage: they hunt the parts you have damaged, throw big shots at anything hanging loose, cover up a cracked head and stop blocking with failing arms.",
      "Every bot now has a Low Kick that chops at the legs. It can't be blocked with the hands, so it has a short cooldown.",
      "Online fights: tap Online on the home screen and create a room, then send a friend the 4-letter code or the invite link. Once they join, the host taps Fight and you both watch the same fight live, each from your own phone.",
      "After an online fight, both tap Rematch to go again, or go back to the room and change parts in the garage first. If someone drops out, the fight still plays out to the end.",
    ],
  },
  {
    hour: "2026-10-12 20:00",
    title: "Battle damage, online fights, rebuilt robots, celebrations and better kicks (part 3)",
    notes: [
      "Fights now play out exactly the same on every phone and browser, so both players always see the same punches land.",
      "Knockout celebrations: the winner now celebrates in the K.O. slow-mo, with nine moves including arms to the sky, a double-biceps flex and roar, chest pounds, a jumping fist pump, a bow, a crowd salute, shadowboxing and dropping to one knee after a hard-won fight. Brawlers flex, showboats play to the crowd, and a close fight or a comeback changes the pick. It keeps celebrating behind the results screen.",
      "Taunts: while the opponent is down for the count, the standing bot may wave them up, shrug, point down at them, do the shuffle, stomp and roar, bang its gloves, strut, or turn to get the crowd going, and it is always back in guard before they are on their feet.",
      "Robots have joined the crowd: about one fan in ten is now a robot, sitting in little groups around the stands with softly glowing LED eyes, cheering, clapping and booing along with everyone else.",
      "Every robot part has been rebuilt with far more mechanical detail: bolts, vents, layered plates, springs, pistons and lit sensors, and each item now has its own silhouette.",
    ],
  },
  {
    hour: "2026-10-12 20:00",
    title: "Battle damage, online fights, rebuilt robots, celebrations and better kicks (part 2)",
    notes: [
      "Each power core now has its own back reactor: twin exhaust stacks, a hex generator, collector tanks or a coil tower.",
      "Rarity now shows on the robot itself: Epic parts add bolted armour, Legendary adds chrome trim, and Mythic adds signature fins, blades and a V-crest lit in the rarity colour.",
      "Reworked kicks: the push kick lifts the knee and drives the foot straight out, the roundhouse turns the hips over and whips the shin in at head height, and the spinning heel turns on the planted foot and drives the heel back.",
      "Kicking legs no longer fold up, flip at the knee or cross the standing leg, even up close or when the opponent steps aside.",
      "The standing foot stays planted and pivots through every kick, and the sweep and Jet Knee recover more cleanly.",
    ],
  },
  {
    hour: "2026-10-12 20:00",
    title: "Battle damage, online fights, rebuilt robots, celebrations and better kicks (part 1)",
    notes: [
      "Your bot card on the home screen has the same new look: real renders of all six fitted parts in your paint and rarity, plus your power and moves. Tap it to open the garage.",
      "New fight intro: each bot gets a versus card at the side of the screen with its real parts in its own paint and rarity, its power and its two moves, so the robots in the ring stay in view.",
      "Ropes and barriers now only turn see-through when the camera is right up against them (within about a metre); farther away they stay solid.",
    ],
  },
  {
    hour: "2026-10-12 19:00",
    title: "Settings that fit your phone",
    notes: [
      "Big hits, crits and shield blocks now send a shockwave through the air: the picture warps and ripples outward from the impact instead of showing a flat glowing circle.",
      "Screens now keep an even margin on the left and right and use the full height up to the top of the screen.",
      "Removed the experimental Keep 120 Hz test. The Frame rate setting (Max, 60 or 30) stays.",
      "Settings has a new two-column layout that fits a landscape phone screen, with bigger buttons, a close button and tap-outside-to-close. Graphics quality now has an Auto option, and resetting your record asks you to tap twice.",
    ],
  },
  {
    hour: "2026-10-12 18:00",
    title: "The new garage and fight night atmosphere (part 4)",
    notes: [
      "The game now runs at your screen's full refresh rate (120 Hz and up) instead of settling at 60. New Frame rate setting: Max, 60 or 30 to save battery.",
      "Fixed glaring white light with black specks along the top of the boards around the ring: the front row's seat backs and aisle steps were broken on some phones.",
      "Patch notes are now grouped by the hour each update went live, shown in your local time.",
      "The garage is now its own robotics workshop: your bot stands on a turntable under a gantry crane, surrounded by workbenches, tool walls, shelves of spare parts and a welding robot at work.",
      "Every item card shows a real 3D picture of the part itself: the actual fist, head, chest, core, legs or kick, in your paint colours.",
    ],
  },
  {
    hour: "2026-10-12 18:00",
    title: "The new garage and fight night atmosphere (part 3)",
    notes: [
      "The loadout rail on the left of the panel shows the part fitted in each slot.",
      "Tap a slot and the camera moves in on that part. Tap it again, or use the Inspect button, to see the whole bot.",
      "Each card shows how much it would change your Power before you fit it.",
      "A scan light sweeps up your bot whenever you change a part, paint or rarity.",
      "Drag to spin your bot: it keeps turning a little when you let go, and slowly turns by itself if you leave it.",
    ],
  },
  {
    hour: "2026-10-12 18:00",
    title: "The new garage and fight night atmosphere (part 2)",
    notes: [
      "Fuller stands: a seat back behind every fan, stepped aisles with lit step edges, exit stairwells in the upper tier too, camera platforms over the lower exits, follow spots on the roof catwalk and a rail along the top row.",
      "Fight night on the arena floor: pit crews with tool chests and chargers by each tunnel, ringside VIP seats, photographers whose flashes go off on big hits, camera operators, officials, patrolling security, walkout carpets and floor lights.",
      "Fight-night lighting: the ring is brighter and the crowd and stands sit in the dark around it, lit only by spill from the ring, the roaming spotlights and the LED boards. The camera adapts like a broadcast camera, so close-ups on the fight push the house even darker, with a soft vignette around the edges.",
      "Crowd background no longer hums or buzzes: the arena noise is now a soft, natural wash that swells with the fight.",
      "Arena realism pass: fans now have faces, beards, glasses, jerseys, jackets, scarves and foam fingers, lit by the ring.",
    ],
  },
  {
    hour: "2026-10-12 18:00",
    title: "The new garage and fight night atmosphere (part 1)",
    notes: [
      "The arena gains exit stairwells, aisle handrails, a glass rail on the upper tier, roof catwalks, speaker stacks and press and judges desks.",
      "The big screen over the ring now shows both robots, their health and the fight clock live.",
    ],
  },
  {
    hour: "2026-10-12 17:00",
    title: "Knockouts, lighting and camera (part 6)",
    notes: [
      "The K.O. and T.K.O. letters now slam in for a moment, then shrink to a title at the top, so you can watch the knockout fall and the winner celebrate.",
      "The K.O. and T.K.O. letters now wait about 3 seconds after the knockout, so you see the fall clean before they appear.",
      "Fixed the hard-edged circle on the canvas around each robot: its contact shadow now fades out softly.",
      "Much lighter glow and light beams: bloom and the overhead light shafts now cost a fraction of the GPU time, with the same look, so fights run smoother at high quality.",
      "Render resolution setting (Settings): pick Auto, or fix it at 0.5x, 0.75x, 1x and up to your screen's native resolution. A fixed choice is never changed automatically.",
    ],
  },
  {
    hour: "2026-10-12 17:00",
    title: "Knockouts, lighting and camera (part 5)",
    notes: [
      "Camera zoom: pick Close, Normal or Wide in Settings or with the zoom button during a fight. Every shot keeps its angle and style.",
      "Arena lighting: a spotlight over the ring puts the robots in a pool of light, with the arena floor falling away into shadow.",
      "Ambient occlusion: robots cast soft contact shadows on the canvas (a big dark pool when one goes down), shade each other up close and darken where limbs tuck in. Posts, stands and the stage base get it too, and it stays light on phones.",
      "Fewer stand-offs: fresh bots in range let their hands go, and when both just stand and cover, one commits, shoves them off with a push kick or steps out.",
      "Free camera: shots are no longer held inside the ropes, so the camera finds better angles from anywhere around the ring.",
    ],
  },
  {
    hour: "2026-10-12 17:00",
    title: "Knockouts, lighting and camera (part 4)",
    notes: [
      "Health bars now wear each bot's own paint colours, and flash red when a bot is close to going down.",
      "New get-up after a knockdown: bots sit up or push up off the canvas, take a knee, plant a foot and rise back into their guard.",
      "Performance stats now have a GPU tab: how many milliseconds the bots, crowd, stands, ring, ropes, light beams, effects, shadows and bloom each cost to draw. On phones without a live GPU timer, tap Measure during a fight.",
      "Knockouts end with a giant animated K.O. that slams onto the screen; a TKO gets its own, slightly calmer T.K.O. banner.",
      "Clearer knockdown count: a big referee count under the clock that ticks up each second and turns green when the bot beats it.",
    ],
  },
  {
    hour: "2026-10-12 17:00",
    title: "Knockouts, lighting and camera (part 3)",
    notes: [
      "Knockdown marks next to each bot's name show how close they are to a TKO (three knockdowns ends the fight).",
      "The crowd now follows the fight: fans sit through quiet spells, get to their feet as it heats up, cheer their robot's big hits, clutch their heads when it takes one, boo when nothing happens and erupt at the KO.",
      "Fixed a flickering dark patch on top of the Reactive Frame and Counter Plate chests.",
      "No more crackling: smoother crowd applause, cleaner electric sounds, and loud moments like a KO no longer distort.",
      "The settings button now shows a proper gear instead of a sun.",
    ],
  },
  {
    hour: "2026-10-12 17:00",
    title: "Knockouts, lighting and camera (part 2)",
    notes: [
      "The arena's LED boards now run real-looking ads from a dozen sponsors (energy drinks, motor oil, tools, airlines and more) that rotate with a wipe.",
      "Titan Hammers: the Guard Breaker now rises overhead and chops down onto the head.",
      "Brawler Knuckles: the haymaker winds back and loops round from the side.",
      "Jet Knees: the Jet Knee now leaps up off the canvas and drives the knee in, with a clean landing.",
      "All punches and kicks move at a more human pace: a visible wind-up, weight behind the shot and a smooth return to guard.",
    ],
  },
  {
    hour: "2026-10-12 17:00",
    title: "Knockouts, lighting and camera (part 1)",
    notes: [
      "More natural footwork: bots shift their weight, turn their hips and shoulders and settle into each step as they move.",
    ],
  },
  {
    hour: "2026-10-12 16:00",
    title: "Smarter fighters, bigger arena (part 3)",
    notes: [
      "Patch notes now scroll with your finger, without a visible scrollbar.",
      "Calmer, more deliberate pace: bots throw about a third fewer strikes, pick their moments, reset between exchanges and paw out jabs to find the range.",
      "Performance stats (Settings): an FPS counter plus how many milliseconds the fight, AI, animation, effects, arena, camera, audio and rendering each cost per frame. Tap it to shrink it to just the FPS.",
      "A huge indoor arena: two tiers of seats, suites, LED boards, entrance tunnels, a hanging scoreboard and championship banners.",
      "A much bigger crowd of about 7,500 fans in team colours who clap, pump their fists, jump, hold up signs and start the odd Mexican wave, and it runs lighter on phones than the old crowd.",
    ],
  },
  {
    hour: "2026-10-12 16:00",
    title: "Smarter fighters, bigger arena (part 2)",
    notes: [
      "Elastic ropes: they stretch and bow around a robot that leans or gets knocked into them, then spring it back into the ring with a wobble.",
      "Smarter, more human fighting: bots feel each other out at range, step in behind real combinations (jab-cross-hook), then get out, cover up or stay to trade.",
      "Footwork moves in steps and pauses instead of a constant glide, and every fighting style moves differently.",
      "Bots react to each other: they meet an opponent stepping in with a jab, back off or cover up after a big shot, fire back when angry, and use feints and stutter steps to draw a reaction.",
      "Clear view: ropes, posts and anything else between the camera and the robots fade away, so nothing blocks the fight.",
    ],
  },
  {
    hour: "2026-10-12 16:00",
    title: "Smarter fighters, bigger arena (part 1)",
    notes: [
      "Arms no longer pass through chest plates, their own or the opponent's.",
      "Elbows and knees no longer snap to the wrong side mid-punch or mid-kick.",
      "Guarding hands stay tucked at the chin through the whole strike, and bots no longer sink into each other up close.",
    ],
  },
  {
    hour: "2026-10-12 15:00",
    title: "Crowd and quality of life",
    notes: [
      "Fixed a brief zoom flicker during fights on phones; resolution changes now happen on camera cuts.",
      "Patch notes: this button on the home screen lists what changed in each update.",
      "Refresh button on the home screen (circular arrow next to sound and settings) reloads the app on the latest version.",
      "A live crowd that cheers, gasps and roars with the fight.",
    ],
  },
  {
    hour: "2026-10-12 14:00",
    title: "Fight night upgrade",
    notes: [
      "Action camera: the fight is now shot like a broadcast, with cuts and close-ups on the big hits.",
      "Metal impact sounds: punches, kicks, blocks and knockdowns all clang differently.",
      "Rebuilt robot models with smoother, weightier punches and kicks.",
      "Installed app opens as a normal window and goes fullscreen in landscape on first tap.",
      "Fixed the screen flickering on some phones.",
    ],
  },
  {
    hour: "2026-10-12 13:00",
    title: "Battlebots launch",
    notes: [
      "First release: build your bot in the garage and send it into the arena.",
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
