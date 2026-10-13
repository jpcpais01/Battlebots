# Battlebots live commentary: phrase bank

Two voices in the booth:

- **P, play-by-play.** The caller. American fight-night maniac: rapid, punchy, and loses it on every big shot ("OH! OHHH! Down it goes!"). Real boxing and MMA booth energy, not a TV presenter.
- **C, colour.** The analyst. A gravelly retired British heavyweight turned robot builder. Blunt, funny, swears mildly ("Bloody hell, that's a proper shot, that"), argues with the caller and gets just as loud when a bot gets hurt.

Lines should sound live: CAPS on the word that pops, stretched vowels, half-sentences and restarts, mild "unprofessional" words (damn, hell, bloody, crap), but no strong swearing. Fast-trigger lines (hits, kicks, defence) stay a few words long.

## How to read a line

```
- P3 Big right hand!
```

- The letter is the voice: `P` = play-by-play, `C` = colour.
- The number is the energy, which picks the delivery when we generate it:
  `1` calm and conversational, `2` engaged, `3` excited, `4` screaming.
- A line starting with `+` is a reply. It only plays straight after the line above it, so the two read as a real back-and-forth.
- Tags in braces narrow when a line can play:
  - `{once}` plays at most once per fight.
  - `{early}` first 30 s only; `{late}` last 30 s only.
  - `{ahead}` / `{behind}` means the bot the line is about is winning or losing on HP.
  - `{left}` / `{right}` is the arm or leg that threw it.
  - `{online}` plays only in online fights; `{cpu}` only against the computer.
- Square brackets like `[laughs]` are ElevenLabs v3 delivery tags. They are not spoken.

Lines never say "he" or "she". Robots get "that bot", "the machine" or a name clip. The two bots' names are separate clips (see the Names section at the end), played just before a short line, so "Iron Fang!" followed by "Big right hand!" sounds like one call.

Every section name, like `hit.hook`, maps to an event the game already emits. The section header says when it fires.

# Before the bell

## `intro.welcome` · Walkout opens
**When:** match phase `intro` starts. One line, then usually a reply from colour.

- P4 [shouting] GOOD EVENING, and welcome to FIGHT NIGHT, baby!
- P4 Ladies and gentlemen... it is TIME! Welcome to the arena!
- P3 We are LIVE, the place is PACKED, and my goodness is it loud in here!
- P2 Welcome back, folks. Two machines, one ring, ninety-nine seconds. Somebody's getting scrapped tonight.
- P3 Good evening, everybody! Listen to this crowd! LISTEN to 'em!
- P2 Welcome in, folks. I'm not gonna lie to you, I've been buzzing about this one all day.
- P4 [excited] It's FIGHT NIGHT! Can you feel it?! I can FEEL it!
- P2 Evening, everybody. Lights are down, the ring's set, and two very angry pieces of metal are on their way out.
- P4 Welcome... to the MAIN... EVENT!
- P2 Hello again from ringside, where this crowd has been on its feet for ten minutes and nobody's even swung yet.
- P2 Welcome, everybody. Grab a seat and hold onto it, 'cause this one could get UGLY.
- P3 The arena is packed, the hydraulics are hot, and we are READY TO ROCK, folks!
- P2 Good evening from the arena floor. Two bots, both looking to make a statement — and a mess.
- P1 Welcome back, folks. Get comfy. Not for long, though.
- P3 Here we are again! Steel on steel, and a crowd that wants SPARKS!
- P4 [shouting] Welcome to the LOUDEST building in town!
- P2 Thanks for joining us, folks. Oh, we've got PLENTY to talk about in this one.
- P3 Welcome, welcome, WELCOME! This is the one they've been waiting for!
- P4 It is TIME! Welcome to FIGHT NIGHT, baby!
- P2 Good evening, folks. Crowd's in, cameras are rolling, and the bots are making the walk. Here we go.
- P1 Evening, everyone. Settle in. I got a funny feeling this one's gonna be a classic.
- P3 We are coming to you LIVE from ringside, and it is ELECTRIC in here!
- P2 Welcome back to the arena, where the only thing louder than the crowd is the crunching metal.
- P3 Oh, what a night for a FIGHT! What a night!
- P2 Welcome, everybody. The walkout is underway, and the boos are already flying.
- P3 And we're BACK, live from the arena, with a fight that has EVERYBODY talking!
- P1 Good evening, folks. Pull up a chair. This is gonna be fun. Probably violent, but fun.
- P2 Welcome to ringside! If you just joined us, holy smokes, you picked a good night.
- P4 [shouting] Here we go AGAIN! The lights are up and the whole place is SHAKING!
- P2 Evening, everyone. Two bots, a full house, and a referee who brought earplugs and a fire extinguisher.

## `intro.reply` · Colour answers the welcome
**When:** right after `intro.welcome`.

- +C2 Cheers, mate. Been looking forward to this all week, I have.
- +C2 Thanks, mate. I've got a feeling about this one. A proper feeling.
- +C1 Evening. Should be a laugh, this.
- +C2 Good to be here. You can smell the motor oil from up here — lovely.
- +C2 Cheers. And I'll say it right now: this ain't going the distance.
- +C2 Ta, mate. Saw both these bots in the workshop this week. Nasty bits of kit, the pair of 'em.
- +C1 Always a pleasure, mate. Let's see what they've got.
- +C3 Thanks, mate! This lot are gonna get their money's worth tonight, trust me!
- +C2 [laughs] Mate, my ears are already ringing and nobody's thrown a punch yet.
- +C1 Evening. Got my notes, got my tea, I'm ready. Let's have it.
- +C3 Bloody hell, the noise in here tonight! It's something else!
- +C2 Twenty years building these things, and I still get butterflies before the bell. Pathetic, innit?
- +C2 Both corners told me they're ready. They always say that. Half of 'em are lying.
- +C1 Happy to be here. Hopefully nobody loses a head tonight. [chuckles] Well... hopefully somebody does.
- +C2 [laughs] Cheers, mate. My money's on a knockout. Put the house on it.

## `intro.preview` · Colour sets up the fight
**When:** during the walkout, after the welcome.

- C2 What I wanna see is who owns the middle of that ring. Whoever does, wins. Simple.
- C2 Both come in fresh, so them first thirty seconds are gonna tell us everything.
- C2 It's all about the jab, mate. Land it first and you set the pace. Easy as that.
- C1 Ninety-nine seconds ain't long. Start slow in here and you're done, mate.
- C2 Watch the legs tonight. Take the legs, and the rest of it falls over. Literally.
- C2 Plating, power, footwork. Win two out of three and you win the fight. That's the game.
- C1 Well matched on paper, these two. Mind you, paper don't throw punches, does it?
- C2 Look at the build on that chassis, though. That's made to take a beating, that is.
- C2 The head's the weak spot on both of 'em. Expect a lot of bombs up top.
- C2 Neither of these likes going backwards. Oh, that's a recipe for fireworks, that.
- C1 Corners have done their homework. Now it's about not cocking it up.
- C2 Patience wins fights in here. The crowd, mind you, wants the exact opposite. [laughs]
- C2 If either one gets stuck on the ropes, mate, it's over in a hurry. Done.
- C1 Throw too much early and the servos cook late. Seen it a hundred times.
- C2 I'm watching the guard. Keep it tight and the head stays on the shoulders. Drop it... well.
- C2 Small ring, this. Nowhere to hide for ninety-nine seconds. Nowhere.
- C2 Body work, that's the hidden story. Don't look like much, then — bang — it's folding.
- C1 Three knockdowns and it's stopped. Nobody wants to be on the floor early.
- C2 Watch the kicks. One clean kick to the knee joint and it's a whole different fight, mate.
- C2 Both teams have been drilling defence all week. Expect a lot of slipping and countering. Or not. [chuckles]
- C1 Whoever's got the better engine in the last twenty seconds, that's your winner.
- C2 I love a fight where both have something to prove. And blimey, have we got that.
- C2 Big bot wants it ugly. Little bot wants it long. Somebody's not getting what they want.
- C1 Seen loads of fights won by the bot that just wouldn't stop bloody throwing.
- C2 Forget the big punches, watch the feet. Feet win fights, mate.

## `intro.style.brawler` · A bot built to brawl
**When:** walkout, about a bot whose fight style is Brawler. Usually played right after its name clip.

- C2 ...a brawler. Wants to stand in the pocket and have a tear-up. Lovely.
- C3 Pure brawler, this. Walks forward, throws bombs, couldn't care less what comes back!
- C2 Brawler through and through. It'll eat three to land one big one. Happily.
- C1 Not subtle, is it? Brawler. Wants to drag this into a phone box.
- C2 Brawler. The game plan? Get close and swing like hell.
- C2 Loves a mess, this one. Turn it into a pub fight and it's right at home.
- C3 Brawler with heavy, heavy hands! One clean shot, mate, that's all it needs!
- C1 No footwork, no defence, loads of power. Classic brawler. My kind of bot.

## `intro.style.swarmer` · A pressure fighter
**When:** walkout, Swarmer style.

- C3 ...a swarmer! Relentless pressure, punches in bunches, never shuts up!
- C2 Pressure fighter, this. Wants to smother you and not let you breathe. Horrible to fight.
- C2 Swarmer. Comes out at the bell and just... doesn't stop. Ever.
- C1 High output, mad work rate. Drowns the other bot in punches.
- C2 Swarmer style. Question is, does the engine last ninety-nine seconds? We'll see.
- C2 [laughs] Fights like it's late for a bus, this thing. Non-stop.
- C2 Swarmer, so it'll cut the ring off and dig to the body all night. Nasty.
- C1 Busy, aggressive, always in your face. Proper swarmer. Annoying as hell.

## `intro.style.outfighter` · An out-fighter
**When:** walkout, Out-fighter style.

- C2 ...an out-fighter. Wants distance, the jab, and long kicks. Keeps you at arm's length.
- C2 Rangy out-fighter. It'll try to keep this right at the end of its reach.
- C2 Out-fighter. Moves, jabs, moves, jabs. Hates being crowded. Absolutely hates it.
- C1 A technician, this. Picks you off from outside and makes you look silly.
- C2 Fights at range. If the other bot can't close the gap, mate, long old night.
- C3 Cor, beautiful footwork on this thing! Pure out-fighter!
- C2 Out-fighter, so watch for the push kick. Shoves you off like a bouncer.
- C1 Patient, long, accurate. Boring, some'd say. It'll take a points win if it has to.

## `intro.style.counter` · A counter-puncher
**When:** walkout, Counter-puncher style.

- C2 ...a counter-puncher. Sits there waiting for you to make a mistake. Sneaky git.
- C2 Counter-puncher. Throw lazy at this bot and you'll get smacked for it.
- C2 Counter-puncher. Happy to let the other bot lead, then make it pay. Every time.
- C1 Very defensive, very patient. Lives off other bots' mistakes.
- C2 Counter-puncher with a sharp eye, this. Slip, then — bang — fire back.
- C2 Reads the shots and punishes 'em. Classic counter-puncher. Hate fighting these.
- C2 Don't let the slow start fool you, mate. It's watching. It's always watching.
- C1 Tight guard, quick hands, loads of patience. Dangerous. Properly dangerous.

## `intro.style.boxer` · An all-rounder
**When:** walkout, Boxer style.

- C2 ...a boxer. Solid fundamentals, nothing flashy. Does the job.
- C2 Proper well-rounded boxer. Can lead, can counter, can switch it up.
- C2 It's a boxer. Good jab, good guard, good feet. Old school. I like it.
- C1 Bit of everything in this build. Proper all-rounder.
- C2 Textbook boxer. Wants to win every exchange on technique. Bit of a swot.
- C2 Boxer, so it picks its moments and keeps its shape. Clever bot.
- C2 Sound fundamentals on this one. Nothing wasted. Lovely to watch.
- C1 Balanced. No real weaknesses... but no big hammer either. We'll see.

## `intro.matchup` · Style clash
**When:** walkout, after both styles are known. The tag names the matchup.

- C2 {brawler-vs-outfighter} Oh, classic. Brawler wants it close, out-fighter wants it long. Whoever sets the range, wins.
- C2 {brawler-vs-outfighter} If that brawler can't get inside, mate, it's eating jabs all bloody night.
- C2 {swarmer-vs-counter} Pressure against patience. The swarmer better not walk onto a counter, 'cause it'll get flattened.
- C2 {swarmer-vs-counter} Counter-puncher's gonna get loads of chances. But can it handle the volume? Big question.
- C3 {brawler-vs-brawler} Two brawlers! Nobody's taking a step back in this one! Get in!
- C2 {brawler-vs-brawler} [laughs] Two brawlers. Front row, I'd move back from the ropes if I were you.
- C2 {swarmer-vs-swarmer} Two pressure fighters. Somebody's gotta go backwards eventually. Gonna be carnage.
- C1 {outfighter-vs-outfighter} Two out-fighters. Bit of a chess match early. Bring a sandwich.
- C2 {counter-vs-counter} Two counter-punchers. [sighs] Somebody has to lead, or we're here till Tuesday.
- C2 {boxer-vs-any} Boxer can adapt. Question is, can it adapt before it gets its head knocked off?
- C2 {swarmer-vs-outfighter} Swarmer's gotta cut off the ring, out-fighter's gotta keep moving. Ooh, I love this.
- C2 {brawler-vs-counter} Brawler throws big, and counter-punchers LOVE big. That's dangerous, mate. Really dangerous.
- C2 {same-style} Mirror match. Same style, so it's who does it better. No excuses.
- C1 {any} On paper? Dead even. Can't split 'em, honestly.
- C3 {any} Styles make fights, and I bloody love these styles together!

## `intro.online` · Two real players
**When:** walkout of an online fight. {online}

- P3 {online} And tonight, folks, two REAL players are running these corners!
- P2 {online} This is a live online match, folks. Two garages, two builds, ONE winner.
- P4 {online} We've got a head-to-head, baby! Two players, bragging rights on the line!
- C2 {online} Love these. Never know what some nutter's cooked up in the garage.
- C2 {online} Two players, two builds. Let's see whose homework was any good. [chuckles]
- P3 {online} An online SHOWDOWN! Somebody's going home with a story, and somebody's going home salty!
- C1 {online} Real opponents tonight. No scripts. No excuses. Lovely.
- P3 {online} Live, head-to-head, and NOBODY wants to lose this one!
- C2 {online} Whoever built these bots, mate, they know what they're doing. Mostly.
- P3 {online} Two players, and only ONE of 'em gets the win screen!

## `intro.sponsor` · Sponsor reads
**When:** walkout, now and then. These are the made-up brands already on the arena boards.

- P3 Tonight's main event brought to you by Voltcell! Power that HITS BACK!
- P2 This bout's presented by Titan Full Synthetic motor oil. Gonna need a few quarts tonight, folks.
- P2 Brought to you by Gearhead Pro Tools, lifetime warranty. Oh, they're gonna need it tonight.
- P3 Fight night fuelled by Robo Fuel! Zero sugar, MAXIMUM voltage, baby!
- P2 Coverage brought to you by Orbit. Five G everywhere, even in this madhouse.
- P2 This fight's presented by Steelguard Insurance. We've got you covered.
- +C2 [laughs] Steelguard's gonna be drowning in claims after tonight, mate.
- P1 Hungry, folks? Bolt Burger. The double stack, four ninety-nine. Get two.
- P2 Brought to you by Skyline Airways. Fly further. Further than these bots, anyway.
- P2 Stay cool with Frostbite. Ice cold cola. Lord knows these servos could use one.
- P2 Presented by Pixelforge. Their new game is out now, folks.
- P2 Tonight's broadcast rolls on Kaiju Tires. Grip EVERYTHING.

## `countdown.start` · Fighters to the centre
**When:** phase `countdown`.

- P2 Referee brings 'em to the centre. Here we go, folks...
- P2 Final instructions. Like either of 'em's listening.
- P4 [shouting] FIGHTERS... READY!
- P2 Corners clear the ring. This is it. THIS is it!
- P2 Ref checks both corners... thumbs up...
- P3 Final checks done! We are SECONDS away!
- P3 Here we go! Here we GO!
- P3 Lights down, crowd up! Let's DO this!
- P2 They touch gloves... well, they bump fists. Close enough.
- P3 And the whole building's on its feet!
- P1 Here we go, folks. Deep breath.
- P2 Ninety-nine seconds on the clock. Somebody's getting hurt.
- P2 The bots square up... staring each other down...
- P4 GET... READY!
- P3 It ALL comes down to this, folks!

## `fight.start` · The bell
**When:** `fightStart`.

- P4 [shouting] AND WE ARE UNDERWAY!
- P4 THERE'S the bell!
- P3 Here we GO!
- P4 FIGHT!
- P3 And they're OFF!
- P4 We are UNDERWAY in the arena, baby!
- P3 There's the bell, and both bots come flying out!
- P3 Let's get it ON!
- P4 LET'S GOOO!
- P3 The fight is ON, folks!
- P3 Underway! They meet right in the middle!
- P4 There it is, the BELL, and we are FIGHTING!
- P3 Here we go, ninety-nine seconds of MAYHEM!
- P2 Out to the centre... feeling each other out... here we go.
- P4 [yelling] IT'S ON!

## `fight.opening` · First seconds
**When:** first 5 s, if nothing big has landed yet.

- C2 Lots of feinting. Both of 'em want to see what the other one's got.
- C2 Nobody wants to make the first mistake. Cagey, this.
- C1 Feeling-out bit. Measuring the distance.
- C2 Very careful, the pair of 'em. Bit of respect there. Won't last.
- C2 Look at that footwork, though. Both hunting for the angle.
- P2 Cagey start, folks. Somebody throw something!
- C2 First clean shot's gonna tell us a lot. Come on, then.
- C1 Who blinks first? Come on...
- P2 Lotta movement, not much contact yet... [sighs] come on, guys.
- C2 Thought one of 'em would charge out swinging. Good discipline, that. Boring, but good.

# Strikes

Reaction lines have to start within about 0.2 s of the hit, so they are short. Colour lines in this part play just after a big shot, once the caller is done.

## `hit.jab` · Jab lands
**When:** `hit`, move `jab`, not blocked. Plays rarely: jabs are constant, so only about one in six gets a call.

- P3 Nice jab!
- P2 Jab lands!
- P3 Sharp jab!
- P3 STIFF jab!
- P2 Snapping that jab!
- P2 Pop, pop!
- P2 Another one!
- P3 Jab's WORKING!
- P3 Right on the button!
- P2 Good jab!
- P3 Double jab!
- P3 That jab's finding a home!
- P2 Jab!
- P2 Tagging it with the jab!
- C2 That jab's doing all the work.
- C2 Keep throwing that jab!
- C1 Lovely. Simple jab.
- C3 Head's snapping back, look!
- C2 Living off that jab.
- C1 Jab, jab. Ugly, but it scores.
## `hit.straight` · Cross or straight right lands
**When:** `hit`, move `cross` (straight rear hand), not blocked.

- P3 {right} RIGHT HAND! Bang!
- P4 {right} [shouting] BIG right hand!
- P3 {right} Right hand lands — CLEAN!
- P3 Straight down the PIPE!
- P3 Cross! Right on the chin!
- P3 One-TWO, baby!
- P2 {right} Jab, then the right. Lovely.
- P3 Right on the BUTTON!
- P3 Ooh, tagged it!
- P3 Down the middle! WHAP!
- P3 Threads the needle!
- P4 {right} POW! Right hand!
- P3 {right} Right hand cracks home!
- P3 Straight through the guard!
- P3 Snapped it back, folks!
- C2 Straight through the middle, that. Guard's too wide.
- C3 One-two! Proper boxing, that is!
- C3 {right} Every bloody time that right comes, it lands!

## `hit.hook` · Hook lands
**When:** `hit`, move `leadHook` or `rearHook`, not blocked.

- P4 {left} LEFT HOOK! OH!
- P4 BIG hook!
- P3 Hook lands! Rocked it!
- P3 Wrapped RIGHT around the guard!
- P3 Hook upstairs!
- P4 [shouting] WHAT a hook!
- P2 Short hook inside. Nasty.
- P4 {right} RIGHT HOOK! Ohhh!
- P3 Tagged it with the hook!
- P3 Sneaky hook!
- P3 Swinging hook — and it LANDS!
- P3 Around the side! WHACK!
- P4 Oh, CLEAN hook!
- P3 Turned it over on that one!
- P3 Little hook, big damage!
- C3 Cor, lovely hook! Came round the back door!
- C3 [laughs] Where the hell did that come from?!
- C2 Been setting that hook up with the jab all night, mate.
- C2 Short, tight. No messing about.
- C3 Never sees it! That's why it hurts!

## `hit.uppercut` · Uppercut lands
**When:** `hit`, move `leadUpper` or `rearUpper`, not blocked.

- P4 UPPERCUT!
- P4 [shouting] BIG uppercut! OHHH!
- P3 Uppercut lands! Snapped it!
- P3 Right up the GUT — up the middle!
- P4 Head goes FLYING back!
- P3 Ooh, uppercut!
- P3 Short uppercut inside! Buzzed it!
- P3 Up and THROUGH the guard!
- P4 WHAT an uppercut!
- P3 Splits the gloves!
- P4 LIFTED it off its feet!
- P3 Finds the gap! Up top!
- C3 Right between the gloves! Textbook, that!
- C2 Leaning in like a mug, and the uppercut's waiting for it.
- C3 Get in! That's the shot at that range!
- C2 Short, quick, can't see it. Horrible thing to eat.

## `hit.overhand` · Haymaker lands
**When:** `hit`, move `haymaker`, not blocked.

- P4 [shouting] HAYMAKER! OHHH!
- P4 HUGE overhand!
- P4 {right} Overhand RIGHT! BOMBS AWAY!
- P4 Swung from the BASEMENT!
- P4 Big loopin' bomb — LANDS!
- P4 WHAT a haymaker!
- P3 Over the TOP!
- P4 EVERYTHING on that one, folks!
- P4 Wild swing — and it CONNECTS!
- P4 Overhand CRASHES in!
- C3 [laughs] Threw that from the car park and it still landed!
- C3 Bloody hell, that's a swing! Daft, but it worked!
- C3 Saw it coming from Tuesday and STILL ate it!
- C3 That lands clean, that's goodnight, mate!

## `hit.body` · Body shot lands
**When:** `hit` to a body zone (chest or torso), not blocked.

- P3 BODY SHOT!
- P3 Goes DOWNSTAIRS!
- P3 Digs to the body!
- P3 Hook to the ribs! Ooh!
- P3 Right to the gut!
- P2 Down to the body.
- P4 DEEP body shot! Oof!
- P3 Body, body!
- P3 Rips one into the chassis!
- P3 Underneath! To the body!
- P4 Body shot — FLUSH!
- P2 Investing downstairs, folks.
- C3 Ooh, I felt that in me kidneys. Chest plate won't take much more of that.
- C2 Body shots don't make the highlights, mate. They win fights though.
- C2 Kill the body, the head follows. Oldest rule there is.
- C3 Hear that rattle? That's the core going, that.
- C2 That's money in the bank for the last thirty seconds.
- C3 Chopping the tree down! Body, body, body! Lovely!

## `hit.solid` · Clean shot, generic
**When:** `hit` that isn't a jab, not blocked, medium damage, when no move-specific line is free.

- P3 Lands!
- P3 Clean shot!
- P3 GOT it!
- P3 Ooh, nice!
- P3 That LANDED!
- P3 Tagged it!
- P3 Sneaks one in!
- P3 Right on the money!
- P3 Lit it up!
- P2 Clean. Real clean.
- P3 That one got through!
- P3 Finds the target!
- P3 THERE it is!
- P2 Oh, nice.
- P4 Oh, GOOD shot!
- P3 Cracked it!
- P3 Snaps it back!
- P3 Connects! Buzzed!
- P3 POP!
- P4 BANG!

## `hit.big` · Heavy shot
**When:** `hit` with high damage (`heavy`), not blocked, no knockdown.

- P4 [shouting] OH! WHAT A SHOT!
- P4 HUGE shot!
- P4 MASSIVE! OHHH!
- P4 Are you KIDDING me?!
- P4 Oh my GOODNESS!
- P4 OH! OH! OHHH!
- P4 CRUSHING shot!
- P4 BOOM!
- P4 [screaming] OHHHHH!
- P4 HAMMERED it!
- P4 Everything on that one — EVERYTHING!
- P4 That one shook the RING!
- P4 FLUSH!
- P4 Holy smokes!
- P4 Did you HEAR that?!
- P4 Sparks FLYING!
- P4 It's RATTLED! It's rattled!
- P4 You gotta be KIDDING me!
- P4 Oh, that's gonna leave a mark!
- P4 Right on the MONEY!
- P4 [shouting] THUNDER!
- P4 BANG! Big shot! BIG shot!
- P4 Holy crap, what a hit!
- P4 Oh, it FELT that one!
- P4 They heard that in the PARKING LOT!
- C3 Bloody hell! Hardest shot of the night, that!
- C3 Christ almighty, that's a dent! Somebody fetch a hammer!
- C3 You don't just walk through that one, mate.
- C3 [groans] Ohh, I felt that one up here.
- C3 That's a fight-changer, that. Proper one.
- C3 Nothing clever about it. Just pure bloody power.
- C4 OH, that HURT!
- C3 [laughs] Whoever's in that corner is crying into their spanners.
- C2 That'll be all over the damage report. Ouch.
- C2 [exhales] Well. That'll do it.

## `hit.crit` · Critical hit
**When:** `hit` with `crit`, not blocked.

- P4 CRITICAL HIT!
- P4 Right on the WEAK SPOT!
- P4 PERFECT shot! PERFECT!
- P4 SWEET spot, baby!
- P4 Found the gap in the armour!
- P4 PINPOINT!
- P4 Right through the SEAMS!
- P4 DIRECT HIT! OH!
- P4 Couldn't place it better!
- P4 [shouting] BULLSEYE!
- C3 Right between the plates! Cor, that's surgical!
- C3 Found a joint! That's where it really goes in!
- C3 That ain't luck, mate. That's aim.
- C3 Armour everything you like, it'll find the seam!
- C2 [whistles] Perfect placement. Nothing you can do.

## `hit.counter` · Counter punch
**When:** `hit` with `counter`, not blocked.

- P4 COUNTER!
- P4 COUNTERED! OH!
- P4 {right} Counter RIGHT!
- P4 Caught it COMING IN!
- P3 Beat it to the punch!
- P4 Right on the counter!
- P4 Timed it PERFECTLY!
- P4 Walked right INTO it!
- P3 Made it PAY!
- P4 [shouting] Countered! Beautiful!
- P4 Slip and COUNTER!
- P3 Caught it on the way in!
- P4 PUNISHED!
- C3 That's timing! Saw that coming a mile off!
- C3 Walked right onto it! Running into one, that's double the damage!
- C3 Lovely! Let it commit, then BANG!
- C3 That's what you get for throwing lazy, mate!
- C2 Been sat waiting for that all fight.
- C3 Same shot again?! Have a word with yourself! It's reading it!
- C2 [chuckles] Perfect timing. Years of work in one punch, that.
- C3 Patience! Counter-puncher's dream, that!
- C3 Baited it! Showed it the door, then slammed it!

## `special.flurry` · Piston Rush lands
**When:** `hit`, move `flurry`.

- P4 [shouting] PISTON RUSH!
- P4 Here it comes — PISTON RUSH!
- P4 RAPID FIRE!
- P4 Machine-gun punches!
- P4 Pistons FIRING!
- P4 A BLUR of fists!
- P4 Look at the HAND SPEED!
- P4 Teeing OFF! Piston Rush!
- C3 Can't block all of that! Some are getting through!
- C3 Six punches a second! The guard's having a nightmare!
- C3 Look at them pistons go! That's what the build's for! Get in!

## `special.shock` · Shock Uppercut lands
**When:** `hit`, move `shockUpper`.

- P4 [shouting] SHOCK UPPERCUT!
- P4 ELECTRIFIED!
- P4 It's LIT UP!
- P4 ZAPPED! OH!
- P4 Shock uppercut CONNECTS!
- P4 Sparks EVERYWHERE!
- P4 Fried the circuits!
- C3 That scrambles it! Gonna be slow for a second, that!
- C3 [laughs] I swear the lights flickered!
- C3 Shock module, mate! Stuns everything it bloody touches!

## `special.rocket` · Rocket Punch lands
**When:** `hit`, move `rocketPunch`.

- P4 [shouting] ROCKET PUNCH!
- P4 The fist LAUNCHES!
- P4 ROCKET FIST!
- P4 Fired from RANGE!
- P4 Look at the REACH!
- P4 Flew ACROSS the ring!
- P4 LAUNCHED!
- P4 Rocket punch — CLEAN!
- C3 Think you're out of range, then the fist comes off! [laughs]
- C3 That extension's unfair. I bloody love it.
- C3 Three metres away! Nowhere to hide from that!

## `special.hammer` · Guard Breaker lands
**When:** `hit`, move `hammer`.

- P4 [shouting] GUARD BREAKER!
- P4 HAMMER FIST!
- P4 SMASHED through the guard!
- P4 Brings the hammer DOWN!
- P4 Crashing down from ABOVE!
- P4 HAMMER TIME, baby!
- P4 Down comes the HAMMER!
- C3 Can't block that! Goes straight through the arms!
- C3 Sometimes you just kick the bloody door in!
- C3 Shell up all you want, mate. Guard Breaker don't care!

## `special.whiff` · Special move misses
**When:** `whiff` with an ability move.

- P3 MISSES with the big one!
- P3 Swing and a MISS!
- P3 All that power — NOTHING!
- P3 Nothing but AIR!
- P3 Wasted the special!
- P3 Way off!
- P4 [in disbelief] MISSED IT?!
- C3 That's on cooldown now! Go on, get after it!
- C2 [groans] Burned the special for nothing. Mate...
- C3 Telegraphed it! Saw it coming from the car park!
- C3 [laughs] Would've ended it if it landed. It didn't, did it!
- C2 No, no, no. What are you doing? Wrong moment.
## `miss.whiff` · Big miss
**When:** `whiff` on a power punch or kick (not jabs). Rare.

- P3 Swing and a MISS!
- P3 Nothing but air!
- P3 WAY off!
- P2 Whiffed it, folks.
- P3 Wild! Too wild!
- P2 Short! Way short!
- P3 Hits NOTHING!
- P3 Over the top, baby!
- P2 [laughs] Air ball!
- P3 Can't find the range!
- C2 [groans] Telegraphing it from the car park, that.
- C2 Swinging at fresh air burns the battery, mate. Have a word.
- C1 Mate, I saw that coming last Tuesday.

## `defence.dodge` · Slips a shot
**When:** `dodge`.

- P3 SLIPPED it!
- P3 Ducks under!
- P3 Not there!
- P3 Makes it MISS!
- P3 Rolled under it!
- P3 Look at that head movement!
- P3 Swayed back, baby!
- P3 Gone! Not there!
- P2 Easy slip.
- P3 Leans OUT of it!
- P3 Can't touch it!
- P3 Too QUICK!
- P2 Slips inside.
- P3 What defence!
- P3 Ghost!
- P3 Matrix, folks!
- P3 Nope! Not today!
- P3 Weaves right under!
- C2 Lovely. Just enough, nothing more. That's class.
- C2 Like trying to punch smoke, innit?
- C2 Missed it by a hair! Cheeky, that.
- C2 [laughs] The other corner's pulling its hair out right now.
- C3 Gorgeous slip! Now make it PAY!
- C1 It's reading everything. Everything.
- C2 Slippery little so-and-so tonight.
- C2 Saw that one before it was even thrown, mate.

## `defence.dodge.special` · Dodges a special
**When:** `dodge` against an ability move.

- P4 [shouting] DODGED the special!
- P4 It saw it COMING!
- P4 Slipped the BIG one!
- P4 Are you KIDDING me?! Dodged it!
- C3 That's on cooldown now! Window's WIDE open!
- C3 [in disbelief] Christ, that would've ended the night!

## `defence.block` · Shot blocked
**When:** `hit` with `blocked`, not a guard break. Plays now and then.

- P2 Blocked.
- P2 Eats it on the gloves.
- P2 Arms take it.
- P2 Shelled up tight.
- P2 Nothing doing.
- P2 Off the forearms.
- P2 Guard holds.
- P2 Nothing gets through!
- P2 Arms up, no damage.
- P2 Covered up nice.
- P3 Can't crack that shell!
- C2 Tight guard. Nothing clean getting through that.
- C2 Them forearms are taking a right hiding though. Watch the arms.
- C2 Blocking's lovely, but you gotta throw something back, mate!
- C1 Hands up. Keep 'em up. Simple game.
- C2 Walking in behind the guard. Very disciplined, I like it.

## `defence.guardbreak` · Guard broken
**When:** `hit` with `guardBreak`.

- P4 GUARD BROKEN!
- P4 Smashed RIGHT through!
- P4 The guard's GONE!
- P4 OH! Broke right through!
- P3 Arms knocked aside!
- P4 The guard COLLAPSES!
- P4 Wide open now! WIDE open!
- P4 Through the defence, baby!
- C3 Bloody hell, that guard's gone! It's naked in there!
- C2 You can only hide so long before the arms pack in.
- C3 Big moment, this! No guard, real trouble!

## `defence.shield` · Shield absorbs it
**When:** `hit` with `shielded`.

- P3 Shield takes it!
- P3 Soaked up by the shield!
- P2 Shield's up, folks.
- P3 Bounces right off!
- P3 The shield HOLDS!
- C2 That shield's buying it time. Use it!
- C2 [chuckles] Lovely. Shield ate the lot.

## `combo.three` · Three-hit combination
**When:** the same bot lands its third hit in a row (CrowdMood's combo counter hits 3).

- P3 COMBINATION!
- P3 Puts it together!
- P3 One, two, THREE!
- P3 Beautiful combination!
- P3 Strings 'em together!
- P3 Three in a row!
- P3 Flurry! FLURRY!
- P3 Look at THIS!
- P3 Punches in bunches, baby!
- P3 Lands 'em ALL!
- P3 Oh, nice combo!
- P3 Starting to pour it on!
- P3 Keeps 'em coming!
- C3 Lovely, lovely punching! Every shot sets up the next!
- C2 That's why you drill it in the workshop, that.
- C3 Head, body, head! Textbook, mate!
- C2 Not giving it a second to breathe. Good.

## `combo.five` · Five-plus hit run
**When:** combo counter reaches 5 or more.

- P4 [shouting] It's TEEING OFF!
- P4 UNLOADING!
- P4 Pouring it ON!
- P4 It CAN'T miss!
- P4 Everything's LANDING!
- P4 Shot after shot after SHOT!
- P4 RELENTLESS!
- P4 Bombs away! BOMBS AWAY!
- P4 It's a BEATDOWN!
- P4 Unanswered! UNANSWERED!
- P4 Somebody STOP this!
- P4 Here it comes AGAIN!
- C4 Fire back or get out of there! DO SOMETHING!
- C4 [yelling] Tie up! Move! Anything! Come on!
- C3 Christ almighty, the ref's gotta be looking at this!
- C3 Its corner must be going absolutely mental!
- C3 No, no, no, it's just standing there eating 'em!

## `stagger` · Rocked
**When:** `stagger`.

- P4 It's HURT!
- P4 WOBBLED!
- P4 ROCKED!
- P4 It's in TROUBLE!
- P4 The legs are GONE!
- P4 Staggered! OHHH!
- P4 Hurt it! HURT IT!
- P4 Wobbly legs, folks!
- P4 Buzzed!
- P4 BIG trouble here!
- P4 Stumbling back!
- P4 It's REELING!
- P3 Systems are scrambled!
- P4 Out on its FEET!
- P4 Doesn't know where it is!
- P4 Can it SURVIVE this?!
- P4 Rattled! RATTLED!
- P4 All over the place!
- P4 Cracked it GOOD!
- P3 Gyros are spinning, baby!
- C4 FINISH IT! This is the moment!
- C4 [shouting] Now! Go now! Get in there!
- C3 It's wobbling, look at the legs! One more and it's gone!
- C3 Cor, the gyroscope's had it! Look at that!
- C3 Just survive, just survive the next few seconds!
- C2 Cover up, mate. Only thing it can do now.
- C3 Something's come loose in there, I swear!
- C3 Hold on! The corner's begging it to hold on!

# Kicks

## `kick.push` · Push kick lands
**When:** `hit`, move `pushKick`.

- P3 Push kick!
- P3 Front kick, sends it BACK!
- P3 Teep to the gut!
- P3 Shoved away!
- P2 Push kick, makes space.
- P4 Kicked across the ring!
- P3 Foot to the chest!
- P3 Get OUT of here!
- P4 Sends it FLYING!
- C2 Smart. Kick the distance back where you want it.
- C2 Push kick's a jab with your leg, innit? Keeps 'em honest.
- C2 [chuckles] Didn't like being crowded, so it booted the problem away.

## `kick.round` · Roundhouse lands
**When:** `hit`, move `roundhouse`.

- P4 ROUNDHOUSE!
- P4 HEAD KICK!
- P4 What a KICK!
- P4 OH! Roundhouse lands!
- P4 Kick to the HEAD!
- P3 Whipped it in!
- P4 Shin across the face!
- P4 High kick! OHHH!
- P3 Swinging kick connects!
- P4 BOOM! Roundhouse!
- P3 Roundhouse to the body!
- P3 Right in the ribs!
- C3 Look at the hips on that! Perfect, bloody perfect!
- C3 That's three times a punch, that! Felt it from here!
- C2 Never saw it. Too busy watching the hands.
- C3 That's the payoff! All them punches, then BANG, the kick!

## `kick.low` · Low kick to the leg
**When:** `hit`, move `lowKick`.

- P3 Low kick!
- P3 Chops the leg!
- P3 Thigh kick, CRACK!
- P3 Calf kick!
- P2 Another low kick.
- P3 Right on the knee!
- P3 Attacking the legs!
- P3 Chopping away!
- P3 Chopping it DOWN!
- P3 Leg kick, folks!
- C2 Going after that leg. Smart, smart work.
- C2 Every one of them slows it down a bit more.
- C2 Take the legs, take the fight. Simple as.
- C2 [groans] That knee joint's gonna be squeaking tomorrow.
- C2 Won't see it now, mate. You'll see it in a minute.
- C1 Chopping down the tree. Ugly, but it works.

## `kick.spin` · Spinning Heel lands
**When:** `hit`, move `spinKick`.

- P4 [screaming] SPINNING HEEL KICK!
- P4 Off the SPIN!
- P4 OH MY! Spinning back kick!
- P4 Spun around and NAILED it!
- P4 WHAT A KICK!
- P4 Are you KIDDING me?!
- P4 UNBELIEVABLE!
- P4 Holy smokes! Off the spin!
- C4 Highlight reel! That's going EVERYWHERE tomorrow!
- C3 [in disbelief] A bot that size? Doing THAT? Get out!
- C3 [laughs] Twenty years building robots and that still gets me!
- C2 Risky, that. Miss and you've shown it your back. It didn't miss.

## `kick.knee` · Jet Knee lands
**When:** `hit`, move `flyingKnee`.

- P4 FLYING KNEE!
- P4 JET KNEE! OHHH!
- P4 It's AIRBORNE!
- P4 Knee to the HEAD!
- P4 Jets fire... BANG!
- P4 Up and OVER!
- P4 Launched! LAUNCHED!
- C3 Them jets give it proper lift! Nasty, nasty!
- C3 [laughs] Leaves the ground and gets paid for it! Love it!
- C3 Most dangerous shot it's got, that. Jesus.

## `kick.sweep` · Sweep connects
**When:** `hit`, move `sweep` (the trip itself is under `knockdown.sweep`).

- P3 Low sweep!
- P3 Sweeps the legs!
- P3 Kicks the legs out!
- P3 Takes the ankle!
- P3 Sweep connects!
- C2 Cheeky sweep. Keeps it guessing, that.

## `kick.blocked` · Kick checked or blocked
**When:** `hit`, a kick, `blocked`.

- P2 Kick checked.
- P2 Blocks the kick.
- P2 Caught on the arm.
- P3 Arms eat it!
- P2 Kick blocked.
- C2 [groans] Good check. That stings the kicker more, mate.
- C2 It's reading the kicks now. Mix it up, for God's sake.

# Knockdowns

## `knockdown.first` · First knockdown of the fight
**When:** the first `knockdown` of the fight (not a sweep). Fires instead of `knockdown.any`.

- P4 [screaming] DOWN GOES THE MACHINE! DOWN GOES THE MACHINE!
- P4 It's DOWN! First knockdown of the fight!
- P4 KNOCKDOWN! Oh my GOODNESS!
- P4 DROPPED! It's DOWN!
- P4 OH! OH! OHHH! It's down!
- P4 Down it GOES!
- P4 It DROPS! First blood, baby!
- P4 KNOCKDOWN! Flat on the canvas!
- P4 Down! Down! It's DOWN!
- P4 [shouting] WHAT A SHOT! It's down!
- P4 Put it on the CANVAS!
- P4 It hits the DECK!
- P4 TIMBER! Down it goes!
- P4 First knockdown of the night, folks!
- P4 It's — it's DOWN! Sat it DOWN!
- C4 [shouting] Out of NOWHERE! Bloody hell!
- C3 That's one! Two more and it's goodnight!
- C4 Did you see it fall?! Like a sack of spanners!
- C3 Get in! Momentum's just swung right round!
- C3 Oh, that's done it! That's a proper shot, that!
## `knockdown.any` · Knockdown
**When:** `knockdown` (not the first, not a sweep).

- P4 [shouting] DOWN AGAIN!
- P4 OH! It's DOWN!
- P4 KNOCKDOWN! OHHH!
- P4 Down it goes AGAIN, baby!
- P4 Dropped AGAIN! Unbelievable!
- P4 [yelling] It's on the CANVAS!
- P4 Down! It's — it's DOWN!
- P4 FLOORED! Are you KIDDING me?!
- P4 Knocked FLAT! My goodness!
- P4 And it's down AGAIN, folks!
- P4 [screaming] ANOTHER ONE! DOWN!
- P4 Back on the canvas! OHHH!
- P4 Sat it DOWN! Holy smokes!
- P4 Put it on the FLOOR!
- P4 LEVELED! What a shot!
- P4 [shouting] SMASHED to the canvas!
- P4 OH! OH! DOWN GOES THE MACHINE!
- P4 It folded! It FOLDED!
- P3 Down, and it's HURT, folks!
- P4 Crumbles! It CRUMBLES!
- C3 [groans] Oh, it's taking a proper hiding now.
- C3 That's two, mate! One more and it's curtains!
- C3 Bloody hell! It can get up, but how many more of them can it eat?!
- C3 Every time it goes down, a bit more of it stays down there.
- C4 [in disbelief] Christ almighty! Where'd THAT come from?!
- C3 Oh, that's done it. That's a PROPER shot, that.

## `knockdown.second` · Second knockdown, one from TKO
**When:** `knockdown` when the downed bot now has 2 knockdowns.

- P4 [shouting] That's TWO! One more and it's OVER!
- P4 Down for the SECOND time! OHHH!
- P4 Two knockdowns! It's on the BRINK, folks!
- P4 DOWN AGAIN! That's number TWO!
- P4 Second knockdown! ONE more ends it, baby!
- C3 One more of them and the ref's waving it off, mate!
- C3 It's hanging on by a bloody thread now!
- C3 Grab, hold, lean on it, ANYTHING! Just survive!
- C2 [sighs] Two down. I'd have the towel in my hand, honestly.
- C3 Cor, it's in all sorts of trouble here.

## `knockdown.kick` · Knocked down by a kick
**When:** `knockdown` from a kick (`move.kind === 'kick'`). Picked over the generic lines half the time.

- P4 [shouting] KICKED DOWN! OHHH!
- P4 Kick to the HEAD! And it's DOWN!
- P4 The KICK drops it! WHAT A SHOT!
- P4 LEVELED by the kick! Goodnight!
- C4 [in disbelief] What a KICK! Shot of the night, that! Shot of the bloody night!
- C3 Never saw it coming, mate. Too busy watching the hands.

## `knockdown.counter` · Knocked down by a counter
**When:** `knockdown` on a `counter` hit.

- P4 COUNTERED! And it's DOWN!
- P4 [yelling] Walked RIGHT into it! DOWN!
- P4 Caught coming in! DOWN IT GOES!
- C3 Walked straight onto it! That's what you get for rushing in like a lunatic!
- C3 Running into a counter like that? Like running into a brick wall, mate.

## `knockdown.sweep` · Swept off its feet
**When:** `knockdown` from a sweep trip (doesn't count as a knockdown).

- P3 SWEPT!
- P3 Sweeps the LEGS!
- P3 Swept clean off its feet!
- P3 Legs taken right OUT!
- P3 TRIP! It's on the floor!
- P3 [excited] UPENDED, baby!
- P3 Whoa! Off its feet!
- P3 Down it goes on the SWEEP!
- P2 Dumped on the canvas there.
- C2 [laughs] No count for that, but that's embarrassing, that is.
- C2 [laughing] Look at it! Legs straight up in the air like a dead fly!
- C3 Crowd loves a sweep. Gets 'em right off their seats.
- C2 Lovely sweep. Free second while the other one's scrambling up.
- C1 That's a slip, not a knockdown. No count. Don't get excited.

## `down.count` · While a bot is down
**When:** during the referee's count, 1 to 2 s after a knockdown, if nothing else is speaking.

- P3 The ref is COUNTING!
- P3 Can it get up?! Can it?!
- P3 Will it beat the count, folks?!
- P3 It's trying to get up!
- P3 It's moving! It's TRYING!
- P2 Here comes the count...
- P3 [shouting] Get up, get UP!
- P3 It's still DOWN!
- P2 Slow to rise... real slow...
- P3 Systems are rebooting, baby!
- C3 [yelling] Get UP! Come on!
- C2 Take your time. Use the count. Don't be a hero.
- C2 Legs are twitching. It wants to, look.
- C2 Question is, is there anything left in the tank?
- C3 Its corner's screaming blue murder at it to get up.
- C2 Gyro's spinning like a drunk on a roundabout. Give it a sec.
- C3 Come on! It can't end like THIS!
- C2 [groans] That's a lot of damage. I don't fancy it, mate.

## `getup` · Beats the count
**When:** `getUp` (not after the third knockdown).

- P3 It's UP!
- P3 Back on its FEET!
- P3 It beats the count!
- P3 Up it gets, folks!
- P3 BACK UP!
- P3 It ain't done yet!
- P3 WHAT heart!
- P3 Gets back UP, baby!
- P3 Up and READY!
- P3 It's back in this thing!
- P2 Up at the count.
- P3 It's NOT finished!
- P3 Climbing back up!
- P3 It wants MORE!
- P4 [shouting] Are you KIDDING me?! It's UP!
- P2 Slowly... back on its feet.
- C3 Get in! Tough as old boots, this thing!
- C2 Now it's gotta survive the next ten seconds.
- C2 Heart of steel. Literally, mind.
- C2 Up, yeah. But is it really back? I dunno.
- C3 Look at the legs, though. Wobbling. The other one'll smell blood.
- C2 Good on it. But that took a lot out of it.
- C2 Built like a brick outhouse. Proper engineering, that.
- C2 Fight's not over, mate. Not even close.
- C3 You CANNOT count this one out! You can't!
- C1 Right. Up you get. Now cover up and clear your head.

## `getup.last` · Up after two knockdowns
**When:** `getUp` and the bot has 2 knockdowns.

- P3 It's UP! But one more and it's OVER!
- P3 Back up! Living on the EDGE, folks!
- P3 Beats the count AGAIN! But it's in deep, deep trouble!
- C2 One more and the ref stops it. Careful now. Careful.
- C2 It's fighting on borrowed time, this.
- C2 Survive. That's it. That's the whole game plan now.
- C3 Bloody hell, you've gotta admire the heart. You really do.

## `taunt` · Showboating over a downed opponent
**When:** a taunt emote starts during the count, or the brain's `taunt` event.

- P3 SHOWBOATING!
- P3 Look at THIS! Playing to the crowd!
- P3 [laughs] It's TAUNTING!
- P2 Little bit of showtime there, folks.
- P3 Rubbing it IN, baby!
- P3 It's soaking it ALL up!
- P3 The crowd LOVES it!
- C2 [laughs] Bit of swagger. I like it.
- C2 Oi, careful. Fight's not over yet, sunshine.
- C2 Confidence or arrogance? Hard to tell with robots.
- C2 [chuckles] The crowd's lapping that up.
- C2 I'd save the dancing for after, but fair enough.
- C1 Programmed with an ego. Somebody had a laugh in the garage.
- C2 [laughing] That's just rude, that is. Love it.

# Battle damage

## `wear.dented` · A part takes its first real damage
**When:** `wear` level 0 (a part drops below 70%). Mostly colour, and only if nobody's talking.

- C2 There's the first proper dent.
- C2 Plating's starting to buckle, look.
- C2 That armour's starting to look a bit second-hand.
- C1 First scratches in the paint. Won't be the last, mate.
- C2 That spot's taking a right battering.
- C2 Dents showing now. The corner won't like that.
- C2 That bit's been hit a few too many times, hasn't it?
- C1 Cosmetic, them dents. For now. For now.
- C2 Paint's flaking off. Never a good sign, that.
- C2 [whistles] Look at the damage piling up there.

## `wear.head` · Head badly damaged
**When:** `wear` level 1 on the head.

- P3 The head is hanging by a THREAD!
- P3 Look at the HEAD! It's barely on there!
- P3 [shouting] The head is LOOSE, folks!
- C3 One more clean shot and that head's going in the crowd!
- C2 Neck joint's shot. That's the danger zone, that.
- C2 Head's wobbling like a nodding dog. Protect it!
- C2 I can see wires, mate. That ain't good.
- C2 Head's in a right state. The other one'll be aiming straight at it.
- C2 If I was in that corner, I'd be bricking it about that head.
- C1 That's not a dent anymore. That's structural.

## `wear.chest` · Chest caving in
**When:** `wear` level 1 on the chest.

- P3 The chest plate is CAVING IN!
- P3 The core is LEAKING, folks!
- C2 Chest plate's crumpled like a beer can. Core's wide open.
- C2 Every body shot's going straight to the core now.
- C2 That's coolant pouring out. Not ideal.
- C2 Chest armour's packed in. Power's gonna start dropping.
- C1 Can't fix that mid-fight. Just gotta hold on.
- C2 Lot of damage in the core. Watch it slow down now.

## `wear.torso` · Waist buckling
**When:** `wear` level 1 on the lower torso.

- P3 The waist is BUCKLING!
- P3 The midsection is WRECKED!
- C2 Waist joint's bending the wrong way. That'll kill the power.
- C2 Can't rotate now. No rotation, no power. Simple as.
- C2 [groans] That lower torso's taken a right pounding.
- C1 Look at the lean on it. Something's bent in there.

## `wear.arm` · Arm coming apart
**When:** `wear` level 1 on an arm part.

- P3 The arm is coming APART!
- P3 That arm is in BAD shape!
- C2 That arm's hanging on by a hair. One more and it's off.
- C2 Been blocking with that arm all night, and now it's paying for it.
- C2 Watch the arm. Joint's knackered.
- C2 Be fighting one-handed soon if it ain't careful.
- C2 Hear that servo grinding? Sounds like my old Transit.
- C1 That's what happens when you block everything with the same arm.

## `wear.leg` · Leg barely holding
**When:** `wear` level 1 on a leg part.

- P3 The leg is barely HOLDING!
- P3 That leg is BUSTED UP!
- C2 Leg's gone. Look at that limp.
- C2 Dragging the leg now. All them kicks paid off.
- C2 No leg, no footwork. Sitting duck, mate.
- C3 If that leg goes, the whole fight goes with it!
- C2 Knee's done. Can barely put any weight on it.
- C1 See it favouring that leg? Yeah. It's hurt.

## `wear.wrecked` · Fist or foot destroyed
**When:** `wear` level 2 on a fist or foot.

- P3 The fist is SHATTERED!
- P3 The foot is CRUSHED!
- P3 That fist is WRECKED, folks!
- C2 [groans] Broke the hand on that. Won't punch near as hard now.
- C2 Foot's crushed. Good luck kicking with that, mate.
- C2 That fist's mangled. Somebody's up all night with a welder.
- C1 Fighting with a broken hand. That takes guts, that does.

## `detach.arm` · Arm torn off
**When:** `detach` of an upper arm or forearm, not fatal.

- P4 [shouting] The ARM is OFF!
- P4 RIPPED the arm clean OFF!
- P4 THERE GOES THE ARM!
- P4 The arm is GONE! GONE!
- P4 Tore it RIGHT off! OHHH!
- P4 [yelling] Arm ripped AWAY!
- P4 OH MY GOODNESS! The arm went FLYING!
- P4 It's lost an ARM, folks!
- P4 DISMEMBERED! Holy smokes!
- P4 That arm just flew into the CROWD!
- P4 The forearm is GONE, baby!
- P4 Torn off at the JOINT! Are you KIDDING me?!
- C4 [in disbelief] Bloody hell! It's fighting one-armed now!
- C4 [laughing] Somebody DUCK! That arm's heading for the third row!
- C3 Down to one arm. That changes everything, that does.
- C2 One arm left. Gotta be very, very careful now.
- C2 Wide open on that side now. Nothing to block with.
- C2 [sighs] Somebody's in the garage till Tuesday fixing that.
- C2 [laughs] Hope they kept the receipt for that arm.
- C4 And it's STILL coming! One arm and it's still coming! Get in!

## `detach.leg` · Leg torn off (not fatal)
**When:** `detach` of a shin or foot, not fatal.

- P4 [shouting] The LEG is GONE!
- P4 Ripped off the lower leg! OHHH!
- P4 It's lost a FOOT, folks!
- P4 Kicked RIGHT off! Unbelievable!
- C4 [in disbelief] How the hell is it still standing?!
- C2 Balance is gonna be a nightmare now.
- C3 It's hopping, mate! This could be over any second!

## `detach.fatal.head` · Head off: DISMANTLED
**When:** `detach` fatal `head`, or `ko` with reason `head`.

- P4 [screaming] THE HEAD IS OFF! THE HEAD IS OFF!
- P4 DECAPITATED! It's OVER! It's ALL OVER!
- P4 It took the head CLEAN OFF!
- P4 OFF WITH ITS HEAD! Unbelievable!
- P4 [shouting] The head goes FLYING! GOODNIGHT!
- P4 OH! OH! OHHH! The HEAD! It's GONE!
- P4 Head ripped OFF! DISMANTLED, baby!
- P4 HEADLESS! You gotta be KIDDING me!
- P4 Knocked the head CLEAN off its shoulders!
- P4 [yelling] The head is in the CROWD, folks! The CROWD!
- C4 [in disbelief] Christ almighty! I've NEVER seen anything like it!
- C4 That's the most brutal finish you'll ever see in your bloody life!
- C3 [laughing] Somebody go get that head! It's in the cheap seats!
- C4 That's not a knockout, that's a DEMOLITION!
- C2 [laughs] Well. That's one way to win a fight.
- C4 DISMANTLED! Totally, utterly DISMANTLED! Get IN!
- C2 Neck had been loose for ages. Finally gave out, didn't it?
- C2 That's gonna need more than a wrench, mate.
## `detach.fatal.leg` · Leg gone: DISMANTLED
**When:** fatal `leg`.

- P4 [screaming] THE LEG IS GONE! It can't STAND!
- P4 It's — it's DOWN! The leg's been TORN OFF! It's OVER!
- P4 Leg ripped clean off! GOODNIGHT!
- P4 DISMANTLED! Are you KIDDING me?! It ain't getting up!
- P4 OHHH! No leg, no fight, folks! It's ALL OVER!
- C4 [shouting] Bloody hell! It's got nothing to stand on!
- C3 All them low kicks, mate. Chop, chop, chop... and TIMBER!
- C3 [laughs] It's been kicking that leg all night, and look, there it goes!
- C4 Christ almighty! The whole leg's in the front row!

## `detach.fatal.arms` · Both arms gone: DISMANTLED
**When:** fatal `arms`.

- P4 [screaming] BOTH ARMS GONE! IT'S OVER!
- P4 No arms left! NOTHING to fight with! Holy smokes!
- P4 DISARMED! Completely, totally DISARMED, baby!
- P4 It's got NOTHING left! Stop the fight! STOP IT!
- P4 OH MY GOODNESS! Both arms on the canvas! DISMANTLED!
- C4 [shouting] Stop it, ref! It's got no bloody arms!
- C3 [laughs] Well, I'd call that disarmed, wouldn't you?
- C4 Cor! Taken apart piece by piece, that! Get in!

# Fight flow

## `ropes.pinned` · Pinned against the ropes
**When:** `ropes` with strong force, the bot is pushed into them.

- P3 INTO the ropes!
- P3 Pinned on the ropes!
- P3 Backed right up!
- P3 On the ropes now, folks!
- P3 Nowhere to GO!
- P3 Trapped! TRAPPED on the ropes!
- P3 Bounces off the ropes!
- P3 Shoved back into the ropes!
- P3 Cornered! Here it comes!
- P4 Stuck in the corner! Uh oh!
- P3 Can't get OFF the ropes!
- P3 Driving it into the corner!
- C3 Get off the ropes! Get OFF!
- C2 Horrible place to be, that.
- C2 The ropes ain't your mate tonight.
- C3 Slide out! Circle out, circle out, come on!
- C2 Lovely, cutting off the ring there.
- C3 It's trapped! Let your hands go, mate!
- C2 [groans] No, no, that's not where you wanna be.
- C2 Ropes take a bit of the sting out, but you can't bloody escape.

## `brain.switch` · Switches stance
**When:** brain `switch`.

- P2 Ooh, switching it up!
- P2 Flips to southpaw!
- P2 Back to orthodox now!
- P3 Whoa, new stance!
- C2 Switching stance. Cheeky. I like it.
- C2 That'll mess with the timing, that.
- C2 [chuckles] Wasn't working the other way, was it?
- C2 Ooh, something's been said in that corner.

## `brain.retreat` · Backs off to reset
**When:** brain `retreat`.

- P2 Backing off!
- P2 Getting outta there!
- P2 Gives up some ground.
- P2 Steps back, regroups.
- P2 Catching a breather, folks.
- C2 Good. Reset, take a breath, come again.
- C2 [exhales] That last exchange took a fair bit outta it.
- C2 Backing up ain't losing. It's thinking.
- C2 Smart. Get outta the danger zone, mate.
- C2 [laughs] It wants nothing to do with that!

## `brain.rally` · Coming forward again
**When:** brain `rally` (was behind, now pressing).

- P3 It's coming FORWARD again!
- P4 Look at THIS! It's fighting BACK!
- P3 Not giving up, baby!
- P3 Here comes the response!
- P4 Firing back NOW!
- P4 The fightback is ON!
- P3 It's taking it RIGHT to 'em!
- C3 Yes! That's what the corner wanted!
- C2 Behind on damage, but it ain't going quietly.
- C3 [excited] NOW we've got a fight!
- C3 Look at it! Something's clicked, look!
- C2 Nothing to lose now. That's when they get dangerous.

## `brain.read` · Reads a shot
**When:** brain `read`.

- P3 READ it!
- P3 Saw it coming!
- P3 Ohh, anticipated that!
- P3 Knew it was coming!
- C2 It's reading the patterns now. Uh oh.
- C2 Done its homework, that bot.
- C3 Knew that shot before it was even thrown!
- C2 [sighs] Same thing over and over. Have a word with yourself.
- C2 [chuckles] Seen that one before, mate.

## `brain.furious` · Gets angry
**When:** brain `adapt` (furious after a big hit).

- P3 Ohh, it is FURIOUS!
- P3 That woke it UP!
- P4 Now it's MAD!
- C3 [laughs] Uh oh. You've gone and made it angry now!
- C3 That's lit a fire, that! Watch out!
- C2 It's gonna come out swinging. Could be good, could be crap.
- C2 Keep your head, keep your head...
- C2 Anger makes you sloppy, mate. Let's see.

## `lull.boo` · Nothing landing, crowd restless
**When:** CrowdMood's lull (7 s with nothing landing).

- P2 [sighs] The crowd's getting restless here, folks.
- P2 Ooh, some boos ringing out now.
- P2 Not a whole lot happening.
- P3 C'mon! The fans want ACTION!
- P2 Lotta feinting, nothing landing.
- P2 Bit of a staring contest right now.
- C2 Somebody do SOMETHING, for crying out loud.
- C2 These people paid for a fight. Give 'em one!
- C2 Too much respect! Throw something! Anything!
- C2 [laughs] I think that lot want their money back.
- C2 Both of 'em waiting for the other to cock it up.
- C1 [sighs] Chess match. Not everybody likes chess, mate.
- C2 Judges don't score feints, you know.
- C2 One of 'em's gotta take a risk. Come on.
- C2 [groans] I'm falling asleep up here.
- C1 Patience is fine. This is just boring.

## `lull.chatter` · Quiet moment, analysis or banter
**When:** nothing big for 4 s or more, booth idle. Longest lines live here and get cut off if something big lands.

- C2 What I love about this one, there's nothing between 'em. Nothing.
- C2 Footwork's been lovely tonight. Proper lovely.
- C2 You can tell both corners have been living in the garage. Eating cold pizza at three in the morning.
- C1 Ninety-nine seconds sounds like nothing. Until you're the one in there getting clobbered.
- C2 Hear that? The whole building's buzzing.
- C2 [laughs] First bot I ever built fell over walking to the ring. Didn't even get a punch off.
- C2 [laughs] Back in my day it was one arm, a car battery and a prayer.
- C2 These modern servos, mate... the response time is just stupid. Stupid good.
- C1 Watch the shoulders. They always tell you what's coming.
- C2 Fights like this come down to little adjustments. Whoever adapts first wins it.
- C2 This crowd tonight, honestly, loudest I've heard all bloody season.
- C2 Every dent on them bots is a lesson for the corner. A painful one.
- P2 What a night it's been in this arena, folks!
- P2 The crowd is on its FEET in here!
- C2 These things are tougher than they look. Much tougher.
- C2 I love how these are built. Every bolt's got a job.
- C1 Watch how a bot recovers after a big exchange. Tells you everything.
- C2 Stamina's the hidden fight in every fight. Nobody talks about it.
- C2 I'm watching the feet. That's where it all starts, the feet.
- C2 [laughs] The arena crew's gonna be sweeping up bolts for a week after this lot.
- C2 Somebody's in for a long night in the workshop. Kettle on, soldering iron out.
- P2 Some cracking action so far, my goodness.
- C2 Neither of these two is giving an inch. Not one inch.
- C1 It's all rhythm. Find yours, break theirs.
- C2 That's the beauty of this game, innit? Anything can happen.
- C2 The great ones can change gears mid-fight. Let's see who's got another gear.
- C2 I've been doing this a long time, and it never gets old. Never.
- C2 Look at the precision on them movements. Gorgeous engineering, that.
- P2 Ooh, you can FEEL the tension in this building right now.
- C2 One mistake, mate. That's all it takes in there. One.
- C2 You can't relax in there. Not for a second. I never did, and I still got sparked.
- C2 Both corners are gonna be watching that last exchange on replay for weeks.
- C1 Bit of breathing room for both. Won't last.
- C2 I'd kill to see the telemetry on these two right now. Kill.
- C2 [chuckles] The cheap seats have got the best view tonight. Bloody typical.
- C2 Good engineering wins fights. Great engineering wins belts.
- P2 Calm before the storm, folks. Calm before the storm.
- C2 You learn more about a bot in the quiet bits than the crazy bits.
- C2 They're making each other think. Love that. Love it.
- C2 [laughs] My ears are gonna be ringing till Christmas.

## `lull.pair` · Booth back-and-forth
**When:** a longer quiet moment. The whole exchange plays, and stops if something big lands.

- P2 What are you seeing from the corners, partner?
- +C2 Both being careful. They know one big shot ends this.
- P2 How much does all that damage matter now?
- +C2 Loads. Dented chest plate means less on every shot from here.
- P2 You're in that corner right now. What are you yelling?
- +C3 Hands up! Stop admiring your work! Keep bloody throwing!
- P2 Who's winning this one, in your eyes?
- +C2 Honestly? Dunno. Too close to call, mate.
- P2 Does the size difference matter here?
- +C2 Till somebody lands clean. Then nothing else matters.
- P2 You've built these things. What's the hardest part?
- +C2 Balance. Keeping one upright after a big hit? That's an art, that.
- P2 Ninety-nine seconds. Is that enough time?
- +C2 For these two? [laughs] Might be too much.
- P2 Any surprises so far?
- +C2 All this defence. Didn't expect it. Very disciplined. Bit too disciplined.
- P2 So what wins it from here?
- +C2 Whoever keeps their shape. First one to get sloppy loses.
- P2 How's the crowd treating you up here, buddy?
- +C2 [laughs] Can't hear a bloody thing. It's wonderful.
- P2 What do you make of this pace?
- +C2 Frantic. No idea how they're keeping it up.
- P2 You ever seen one this even?
- +C2 Not often. Usually somebody's blinked by now.
- P2 You were banging on about the legs before the fight.
- +C2 I was, and I stand by it. Watch the legs in the last thirty seconds.
- P2 What would you change if this was your bot?
- +C2 More plating on the head. Always more plating on the bloody head.

# The scoreboard

## `state.dominating` · One bot well ahead
**When:** periodic check, one bot has more than 2x the other's remaining HP fraction. About the leader unless noted.

- C2 One-way traffic, this. One-way.
- C3 It's bossing this fight, completely bossing it!
- C3 Total domination! Total!
- C2 It's winning every single exchange.
- C2 The other one's got no answers. None.
- C2 It can do no wrong right now. None.
- C3 Keep this up and it ain't going to the cards!
- C2 It's a clinic in there. A proper clinic.
- P3 A BIG lead on the damage count, folks!
- P3 Way out in front right now!
- C2 {behind} Needs something big, and it needs it now.
- C2 {behind} The corner's gotta come up with something. Anything.
- C2 {behind} [groans] Taking far too much punishment, this.
- C2 {behind} Nothing's working. Nothing at all.
- C3 {behind} Change something! Bloody anything!

## `state.close` · Neck and neck
**When:** periodic check, HP within 10% after at least 20 s.

- C2 Close as it gets, this.
- C2 Neck and neck, mate.
- C2 Couldn't separate 'em with a crowbar.
- C2 Back and forth all night.
- C2 Neither one's giving an inch.
- P3 Dead even, folks! Dead EVEN!
- C3 What a fight! Nothing in it!
- C2 Could go either way, this. Honestly.
- C2 Every exchange counts now. Every one.
- C1 Dead level. One moment decides it.

## `state.comeback` · Comeback
**When:** a bot that was more than 25% behind is now level or ahead.

- P4 What a COMEBACK! Are you KIDDING me?!
- P4 It's turned this whole fight AROUND!
- P4 Back from the DEAD, baby!
- P4 The tables have TURNED! Unbelievable!
- C4 [in disbelief] Nobody saw that coming! Nobody!
- C3 [laughs] Remember when this looked over? Me neither!
- C3 Never write off a bot with a good engine! Never!
- C3 Cor! That's a massive swing, that!

## `state.bothhurt` · Both bots badly hurt
**When:** both bots below 35% HP.

- P4 BOTH of 'em are hurt!
- P4 Running on FUMES, the pair of 'em!
- C3 Next clean shot wins it. That's it.
- C3 Both in a right state! It's a war, this!
- C4 [shouting] Unbelievable! Neither one'll quit!
- C3 Battered, dented, still swinging! THIS is fighting!
- C2 [exhales] Both corners are holding their breath. So am I.

## `state.lowhp` · One bot in danger
**When:** a bot drops below 20% HP.

- P4 It's running on EMPTY!
- P4 Health is CRITICAL, folks!
- P3 Barely hanging on here!
- C3 One more clean one and that's goodnight.
- C3 Danger zone! Cover up, cover up!
- C2 Out on its feet, this one.
- C2 Survival mode now. Just survive.
- C4 Hold on! Just bloody hold on!

## `state.tired` · Slowing down
**When:** a bot's stamina has been low for a while.

- C2 [exhales] It's slowing down. Engine's cooking.
- C2 Punches are getting slow. Fatigue, mate.
- C2 Gassed. Look at the feet. Completely gassed.
- C2 Threw too much early, and now it's paying for it. Told you.
- C1 Output's fallen off a cliff.
- C2 [groans] Look how slow them hands are coming back.
## `state.bodywork` · Body work paying off
**When:** one bot has landed a lot to the body.

- C2 All that body work? It's paying off now, mate. Look at it.
- C3 It's sagging! The body shots are draining the bloody thing!
- C3 Look at the posture! It's folding up like a deckchair!
- C2 [chuckles] You kill the body, the head follows. Oldest rule there is.

## `state.legwork` · Legs worn down
**When:** one bot's leg parts are damaged and it keeps getting kicked.

- C3 The legs are GONE! All them kicks are adding up!
- C2 [groans] It can barely shuffle now. Those low kicks did a proper job.
- C3 Look at it limping! Christ, somebody get it a walking stick!

# The clock

## `clock.60` · One minute left
**When:** 60 s remain (clock crosses 60).

- P3 ONE minute to go, folks!
- P3 Sixty seconds left in this war!
- P3 We are into the LAST minute, baby!
- P2 One minute remaining, and my goodness, anything can happen.
- C2 One minute left. Time to make your move, sunshine.
- C2 Last minute. This is where you find out whose engine's any good.

## `clock.30` · Thirty seconds
**When:** 30 s remain.

- P3 THIRTY seconds left!
- P3 Thirty to go! Here we go!
- P3 Half a minute! Let's GO!
- P3 Thirty seconds, folks! Hang on to something!
- C3 {behind} It needs a knockdown, and it needs it RIGHT now!
- C2 {ahead} Just stay safe. Don't do anything stupid now, please.
- C3 Thirty seconds! Empty the tank, for God's sake!
- C2 Unless somebody gets dropped, this is going to the judges. Ugh.

## `clock.10` · Final ten seconds
**When:** 10 s remain.

- P4 TEN SECONDS!
- P4 Ten to go! TEN TO GO!
- P4 [shouting] Final ten seconds!
- P4 Here comes the final push!
- P4 Everything they've GOT!
- P4 Down to the WIRE, baby!
- P4 Last chance! LAST CHANCE!
- C3 Throw everything! THROW EVERYTHING!
- C3 Last ten! Let it bloody GO!
- C3 [yelling] Empty the tank!

## `clock.final` · Final seconds frenzy
**When:** last 5 s, any landed shot.

- P4 Final seconds! OH!
- P4 Swinging to the END!
- P4 Five seconds! FIVE!
- P4 Trading to the BELL!
- P4 Right to the end! Unbelievable!
- P4 [shouting] Here comes the BELL!

# The finish

During the KO slow-motion the booth stays at normal speed. The caller screams first, the colour line lands while the winner celebrates, and the wrap-up plays over the results screen.

## `ko.call` · Knockout
**When:** `ko` kind `KO`.

- P4 [screaming] It's OVER! It's ALL OVER!
- P4 KNOCKOUT! KNOCKOUT! KNOCKOUT!
- P4 GOODNIGHT! Goodnight, everybody!
- P4 LIGHTS OUT! OHHH!
- P4 It's out COLD! It's out cold, folks!
- P4 That's it! That's IT! It's DONE!
- P4 [shouting] KNOCKED OUT! Are you KIDDING me?!
- P4 Down and OUT! Oh my goodness!
- P4 Stick a fork in it, BABY! It's DONE!
- P4 It is NOT getting up from that! NO WAY!
- P4 OHHHH! What a KNOCKOUT!
- P4 And that — that is the END!
- P4 It's OVER! What a FINISH!
- P4 Knockout! [in disbelief] Unbelievable! UNBELIEVABLE!
- P4 Ladies and gentlemen, it is OVER!
- P4 SHUT DOWN! Totally, completely SHUT DOWN!
- P4 Powered DOWN! KNOCKOUT!
- P4 Lights out in the arena! LIGHTS OUT!
- P4 Goodnight, and GOODBYE!
- P4 [screaming] Starched! Knocked out COLD!
- P4 OH! OH! OHHH! What a finish!
- P4 Game OVER! You gotta be kidding me!
- P4 Finished! It's FINISHED!
- P4 Sleep mode! It's OUT! Holy smokes!
- P4 The referee waves it off! It's OVERRR!

## `ko.kick` · KO by kick
**When:** `ko` kind `KO`, finishing hit was a kick. Picked over `ko.call` half the time.

- P4 [screaming] KICKED out COLD!
- P4 What a KICK! It's OVER!
- P4 Head kick! GOODNIGHT!
- P4 ONE kick and it's DONE! Are you kidding me?!
- C4 [yelling] Kick of the night! Kick of the bloody YEAR!
- C3 Cor! Kicked its head clean into next week!

## `ko.counter` · KO by counter
**When:** `ko` kind `KO`, finishing hit was a counter.

- P4 COUNTERED and KNOCKED OUT!
- P4 Walked RIGHT onto it! It's OVER!
- C3 Walked straight into it! Oh, the TIMING on that! Lovely!

## `ko.comeback` · KO after being behind
**When:** `ko`, the winner had less HP than the loser at some point after 30 s, by 25% or more.

- P4 From the BRINK to the WIN! What a COMEBACK!
- P4 [in disbelief] Unbelievable! The comeback is COMPLETE!
- C3 It was LOSING this fight! Bloody hell, what a turnaround!
- C3 Never, EVER give up! Look at that! LOOK AT THAT!

## `ko.late` · KO in the final seconds
**When:** `ko` with 10 s or less on the clock.

- P4 With SECONDS to spare! OHHH!
- P4 At the very LAST moment! Holy smokes!
- C3 Right at the death! Christ almighty, the timing!
- C3 [laughs] It didn't fancy the judges, did it?!

## `ko.early` · Fast KO
**When:** `ko` within the first 20 s.

- P4 That was QUICK! Holy smokes!
- P4 Over in a FLASH, baby!
- C3 Blink and you missed it! Jesus!
- C2 [laughs] I hadn't even got me coat off!

## `ko.colour` · Colour reacts to a KO
**When:** after the KO call, while the winner celebrates.

- C4 What a SHOT! What a SHOT!
- C3 [in disbelief] I can't believe what I just saw. I genuinely can't.
- C3 That's going on every highlight reel, that is!
- C4 Bloody hell! Absolutely bloody unbelievable!
- C3 One of the best knockouts I've seen all year, hands down.
- C2 Never saw it coming. Not a clue.
- C3 That's a statement, mate! Everyone's gonna be talking about that!
- C2 You land that clean, it's over. Nothing you can do about it.
- C3 [laughs] What a performance! Get in!
- C3 Perfect! Absolutely perfect, that!
- C2 That one's going straight to the replay. Run it back, run it back.
- C2 You don't get up from a shot like that. You just don't.
- C2 Clinical. Bloody clinical.
- C3 Oh, I need to sit down! Somebody get me a chair!
- C2 [laughs] Somebody call a mechanic. And a priest.
- C2 That's why you never, ever drop your guard. Have a word.
- C2 Everything it did tonight was setting up that moment. Lovely stuff.
- C2 [chuckles] That thing's gonna take a while to reboot, I tell ya.
- C3 Did you SEE that?! Did you see that?!
- C3 Cor! Holy crap, what a finish!

## `tko.call` · TKO, third knockdown
**When:** `ko` kind `TKO`.

- P4 That's THREE! The referee STOPS it!
- P4 Three knockdowns! It's a T-K-O!
- P4 [shouting] Technical knockout! It's OVER!
- P4 THREE knockdowns! That's the fight, folks!
- P4 The referee has seen ENOUGH!
- P4 The ref waves it OFF! It's all over!
- P4 Down for the THIRD time! It's OVER!
- P4 TKO! My goodness, what a beating!
- P4 That's the third knockdown, and THAT is the FIGHT!
- P4 STOPPED! It's ALL over!
- C3 Three times it went down! The ref had no bloody choice!
- C3 Three knockdowns! That's a hiding, that is!
- C2 Right call. It had nothing left in there.
- C2 Kept getting up, fair play to it. But that's enough now.
- C2 [sighs] Brave, the loser. Daft, but brave. Right stoppage.
- C3 Dropped three times! That's not a fight, that's a mugging!

## `decision.time` · Time runs out
**When:** `decision`, the bell.

- P4 THAT'S THE BELL! It's going to the judges!
- P3 TIME! We go to the cards!
- P4 That's the FINAL BELL!
- P3 Time! It's OVER, folks!
- P4 And there's the BELL! What a war!
- P3 That's time! Let's go to the scorecards!
- P3 We go the DISTANCE, baby!
- P4 The bell! What a FIGHT!
- P3 Time is UP!
- P4 [shouting] Saved by the bell! SAVED BY THE BELL!

## `decision.win` · Decision win
**When:** `decision` with a winner. Played after the bell call.

- P3 And the winner, by DECISION!
- P4 The judges have it! Winner by decision!
- P3 A decision victory, folks!
- P3 Taking it on the SCORECARDS!
- P3 The judges give it to the better bot tonight!
- C2 Fair decision. It did more of the damage, simple as.
- C2 I had it the same. It earned that one.
- C2 No knockout, but a convincing win. Can't argue.
- C2 Smart win. Fought the right fight, didn't get silly.
- C2 Controlled the pace from start to finish. Lovely work.
- C2 [chuckles] Not flashy, but a win's a win, innit.
- C2 Judges got that one right. For once.

## `decision.close` · Close decision
**When:** `decision` with HP within 10%.

- P4 By the NARROWEST of margins!
- P4 A RAZOR-close decision!
- C2 [exhales] That could've gone either way. Tough one for the judges.
- C2 Very close. Wouldn't argue with either result, honestly.
- C3 Rematch! I want a rematch! That was way too close!
- C2 [sighs] Oh, some people are gonna be fuming about that one.

## `decision.draw` · Draw
**When:** `decision` with no winner.

- P4 It's a DRAW!
- P4 The judges can't split them! A DRAW!
- P3 Dead even, folks! We have a draw!
- C2 A draw. Fitting, for a fight that tight.
- C2 Nobody deserved to lose that one. Nobody.
- C2 [laughs] Well, we'll just have to do it all again, won't we?
- C3 Rematch! We NEED a rematch!

## `win.celebrate` · Winner celebrates
**When:** a win celebration emote starts.

- P3 And the winner CELEBRATES!
- P3 Soaking it ALL in!
- P4 Listen to this CROWD!
- P3 Look at that celebration, baby!
- P3 What a moment for the winner!
- P3 Celebrating in the centre of the ring!
- P4 The crowd is on its FEET!
- C2 Earned that celebration. Every bit of it.
- C2 [laughs] What is that? Is that a dance? Bless it.
- C2 Go on, celebrate. After a performance like that, you've earned it.
- C3 Enjoy it! Get in!
- C2 The crowd loves this bot. Can't blame 'em.

## `wrap` · Sign-off
**When:** results screen. One line from each voice.

- P3 What a FIGHT! Thank you for joining us, folks!
- P3 That's all for this one! Great fight, everybody!
- P2 And that'll do it from the arena. My goodness.
- P3 What a night! We'll see you next time!
- P3 That was our main event, and WHAT a fight it was!
- P2 Thanks for joining us from ringside, folks. Unbelievable stuff.
- P3 What a show! Goodnight, everybody!
- P2 We'll be back with more action real soon. Don't go far.
- P3 Another night you will NOT forget in this arena!
- P2 [exhales] And that's a wrap from the booth. I need a drink.

## `wrap.reply` · Colour signs off
**When:** right after a `wrap` line.

- +C2 Great fight. I need a holiday after that one, honestly.
- +C2 Cheers for having me. What a night, eh?
- +C2 Can't wait to see these two go at it again.
- +C2 [laughs] My voice is gone. Goodnight, everyone.
- +C1 Good fight. Good fight.
- +C2 Somebody give both them bots a tune-up. And a cuddle.
- +C2 Pleasure as always. Get home safe, you lot.
- +C2 [chuckles] I'll be thinking about that one all week, mate.

# Names

Bot names are separate clips, so any line can follow a name. Every random bot name is made of one of 20 first words and 20 second words, sometimes with a tag, so we generate all of them ahead of time:

- **First words:** Iron, Steel, Atomic, Turbo, Mega, Neon, Titan, Rust, Chrome, Nova, Thunder, Hyper, Diesel, Quantum, Cobalt, Magma, Static, Omega, Rapid, Brass
- **Second words:** Jack, Fang, Fist, Duke, Viper, Rhino, Bolt, Hammer, Knox, Ranger, Brute, Comet, Hornet, Kong, Rook, Grizzly, Spark, Mauler, Ace, Reaper
- **Tags:** II (spoken "the second"), X, MK-3 ("mark three"), V ("five"), Zero, 9 ("nine")

That makes 400 full names (plus the tagged versions, which reuse the base clip and add a short tag clip). The play-by-play voice records each one three ways:

| Delivery | Energy | Example | Used before |
| --- | --- | --- | --- |
| `name.call` | 2 | "Iron Fang." | Calm reads, intros, analysis |
| `name.hype` | 3 | "Iron Fang!" | Clean shots, combos, get-ups |
| `name.scream` | 4 | "IRON FANG!" | Knockdowns, KOs, tear-offs |

The colour voice records `name.call` only, for analysis lines.

## `name.win` · Winner announcement
**When:** after the finish call, followed by the winner's `name.scream` clip. Skipped for bots without a name clip.

- P4 [shouting] And your WINNER...
- P4 And the winner... IS...
- P4 Winner, and STILL standing...
- P4 Ladies and gentlemen... your WINNER...
- P4 The victory goes to... here it comes...
