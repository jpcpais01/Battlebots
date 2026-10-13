# Battlebots live commentary: phrase bank

Three voices in the booth:

- **P, Danny, play-by-play.** Big booming American fight-night caller. Quick, sharp calls on the action, explodes on the big moments, and in quiet spells a warm, funny host who feeds the other two.
- **C, Reg, colour.** Gravelly retired British heavyweight turned robot builder. Blunt pub talk, war stories, mild swearing, roasts the robot.
- **R, Unit Seven, the robot.** An AI fight analyst bolted into the booth. Deadpan numbers and damage readouts, dry humour, a little too fond of robot violence. Never says the bots' names.

Lines should sound live and natural: rhythm, fillers, half-finished thoughts, people reacting to each other. Caps and screaming are for the moments that earn them. Mild "unprofessional" words are fine (damn, hell, bloody, crap), no strong swearing.

## How to read a line

```
- P3 Big right hand!
```

- The letter is the voice: `P` = play-by-play, `C` = colour, `R` = the robot.
- The number is the energy, which picks the delivery when we generate it:
  `1` calm and conversational, `2` engaged, `3` excited, `4` screaming.
- A line starting with `+` is a reply. It only plays straight after the line above it, and replies chain, so `-`, `+`, `+` is a three-turn exchange. A section that starts with a `+` line is a pool of general answers instead.
- A line starting with `~` continues a conversation (only in `lull.convo`): the whole conversation is voiced as one recording with real overlaps.
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
- P3 We are LIVE, the place is PACKED, and my goodness, is it loud in here!
- P2 Welcome back, folks. Two machines, one ring, ninety-nine seconds. Somebody's going home in a bucket tonight.
- +R1 [deadpan] Correction. Two buckets. Parts are rarely sorted by owner.
- P3 Good evening, everybody! Listen to this crowd! Just LISTEN to 'em!
- P2 Welcome in, folks. I'm not gonna lie to you, I've been buzzing about this one all day. Couldn't even eat lunch.
- +C2 [laughs] You ate two lunches, Danny. I watched you do it.
- P4 [excited] It's FIGHT NIGHT! Can you feel it?! I can FEEL it!
- P2 Evening, everybody. Lights are down, the ring's set, and two very angry pieces of metal are on their way out.
- P4 Welcome... to the MAIN... EVENT!
- P2 Hello again from ringside, where this crowd's been on its feet for ten minutes and nobody's even swung yet.
- P2 Welcome, everybody. Grab a seat and hold onto it, 'cause this one could get ugly. And I mean UGLY.
- P3 The arena's packed, the hydraulics are hot, and we are READY, folks!
- P2 Good evening from the arena floor. I'm Danny, next to me it's Reg, and next to Reg it's... well, a robot. Say hi, Seven.
- +R1 [mechanical] Greetings. Unit Seven, online. Crowd noise: one hundred and twelve decibels. Acceptable.
- +C2 Acceptable, it says. Tin can's got no ears, Danny, that's why.
- P1 Welcome back, folks. Get comfy. Not for long, though.
- P3 Here we are again! Steel on steel, and a crowd that wants SPARKS!
- P4 [shouting] Welcome to the LOUDEST building in town!
- P2 Thanks for joining us, folks. Oh, we have got plenty to talk about in this one, believe me.
- P3 Welcome, welcome, WELCOME! This is the one they've been waiting for!
- P4 It is TIME! Welcome to FIGHT NIGHT, baby!
- P2 Good evening, folks. Crowd's in, cameras are rolling, and the bots are making the walk. Here we go.
- P1 Evening, everyone. Settle in. I've got a funny feeling this one's gonna be a classic.
- +R1 [deadpan] Feelings are not data, Danny. But I also predict a classic. Sixty-one percent.
- P3 We're coming to you LIVE from ringside, and it is ELECTRIC in here!
- P2 Welcome back to the arena, where the only thing louder than the crowd is the metal. Crunch, crunch, crunch.
- P3 Oh, what a night for a fight! What a NIGHT!
- P2 Welcome, everybody. The walkout's underway and, yep, the boos are already flying.
- P3 And we're BACK, live from the arena, with a fight that's got EVERYBODY talking!
- P1 Good evening, folks. Pull up a chair. This is gonna be fun. Probably violent, but fun.
- +R1 [monotone] Violent is the fun part.
- P2 Welcome to ringside! If you just joined us, holy smokes, you picked a good night.
- P4 [shouting] Here we go AGAIN! The lights are up and the whole place is SHAKING!
- P2 Evening, everyone. Two bots, a full house, and a referee who brought earplugs and a fire extinguisher.
- +C2 Smart man. I'd have brought a hard hat as well.

## `intro.reply` · Colour answers the welcome
**When:** right after `intro.welcome`.

- +C2 Cheers, Danny. Been looking forward to this all week, I have.
- +C2 Thanks, mate. Got a feeling about this one. A proper feeling, in my waters.
- +C1 Evening. Should be a laugh, this.
- +C2 Good to be here. You can smell the motor oil from up here. Lovely stuff.
- +C2 Cheers. And I'll say it now, Danny: this ain't going the distance.
- +C2 Ta, mate. Saw both these bots in the pits this week. Nasty bits of kit, the pair of 'em.
- +C1 Always a pleasure. Let's see what they've got.
- +C3 Cheers, mate! This lot are getting their money's worth tonight, trust me!
- +C2 [laughs] Danny, my ears are ringing already and nobody's thrown a punch.
- +C1 Evening. Got my notes, got my tea. Let's have it.
- +C3 Bloody hell, the noise in here tonight! Something else, innit?
- +C2 Twenty years building these things and I still get butterflies before the bell. Pathetic, really.
- +C2 Both corners told me they're ready. They always say that. Half of 'em are lying.
- +C1 Hopefully nobody loses a head tonight. [chuckles] Well... hopefully somebody does.
- +C2 [laughs] Cheers, mate. My money's on a knockout. I'd put the house on it, if the wife'd let me.
- +R1 [mechanical] Booth systems nominal. Commentary subroutines warm. Ready.
- +R1 [deadpan] Good evening. I have analysed both machines. One of them will not enjoy tonight.
- +R2 Affirmative, Danny. I have been looking forward to this. That is a figure of speech. I do not look forward.
- +R1 [deadpan] Thank you. I have also brought tea. It is motor oil. Reg says that is not funny.
- +R2 Knockout probability this evening: forty-four percent. I would like it higher.

## `intro.preview` · Colour sets up the fight
**When:** during the walkout, after the welcome.

- C2 What I wanna see is who owns the middle of that ring. Whoever owns it, wins. Simple as.
- C2 Both come in fresh, so them first thirty seconds'll tell us everything.
- C2 Look, it's all about the jab. Land it first and you set the pace. Easy as that.
- C1 Ninety-nine seconds ain't long. Start slow in here and you're done, mate.
- C2 Watch the legs tonight. Take the legs and the rest of it falls over. Literally.
- +R1 [deadpan] Confirmed. Leg damage cuts stability by up to forty percent. Then gravity does the rest.
- C2 Plating, power, footwork. Win two out of three and you win the fight. That's the whole game.
- C1 Well matched on paper, these two. Mind you, paper don't throw punches, does it?
- +R1 [deadpan] Correct. Paper has thrown zero punches in recorded history.
- C2 Look at the build on that chassis, though. That's made to take a beating, that is.
- C2 Head's the weak spot on both of 'em. Expect a lot of bombs up top.
- C2 Neither of 'em likes going backwards. Oh, that's a recipe for fireworks, that.
- C1 Corners have done their homework. Now it's about not cocking it up.
- C2 Patience wins fights in here. The crowd, mind you, wants the exact opposite. [laughs]
- C2 Get stuck on the ropes in this one and, honestly, it's over in a hurry.
- C1 Throw too much early and the servos cook late. Seen it a hundred times.
- +R1 [deadpan] One hundred and fourteen times. I keep a list.
- +C2 Course you do. Course you bloody do.
- C2 I'm watching the guard. Keep it tight and the head stays on the shoulders. Drop it... well.
- C2 Small ring, this. Nowhere to hide for ninety-nine seconds. Nowhere.
- C2 Body work's the hidden story. Don't look like much, then — bang — it's folding in half.
- C1 Three knockdowns and it's stopped. Nobody wants to be on the floor early.
- C2 Watch the kicks. One clean kick on the knee joint and it's a whole different fight.
- C2 Both teams have been drilling defence all week, I'm told. Expect a lot of slipping and countering. Or not. [chuckles]
- C1 Whoever's got the better engine in the last twenty seconds, that's your winner.
- C2 I love a fight where both have something to prove. And blimey, have we got that.
- C2 Big bot wants it ugly, little bot wants it long. Somebody's not getting what they want.
- C1 I've seen loads of fights won by the bot that just wouldn't stop bloody throwing.
- C2 Forget the big punches, watch the feet. Feet win fights, mate.
- R1 [deadpan] Pre-fight analysis complete. Both machines are capable of severe damage. I am pleased.
- R2 Fun fact. An Aegis Core blocks one hit every few seconds. Not every hit. Many builders forget this. Briefly.
- +C2 [laughs] Briefly. Yeah, about one punch worth of forgetting.
- R1 [deadpan] I have run this fight ten thousand times. I will not spoil it. One of them falls over.
- +C2 Brilliant, Seven. Real insight, that.

## `intro.style.brawler` · A bot built to brawl
**When:** walkout, about a bot whose fight style is Brawler. Usually played right after its name clip.

- C2 ...a brawler. Wants to stand in the pocket and have a proper tear-up. Lovely.
- C3 Pure brawler, this! Walks forward, throws bombs, couldn't care less what comes back!
- C2 Brawler through and through. It'll eat three to land one big one. Happily.
- C1 Not subtle, is it? Brawler. Wants to drag this into a phone box.
- C2 Brawler. Game plan? Get close and swing like hell.
- +R1 [deadpan] I have reviewed the game plan. That is the entire game plan.
- C3 Brawler with heavy, heavy hands! One clean shot, that's all it needs!
- C1 No footwork, no defence, loads of power. Classic brawler. My kind of bot, honestly.
- R1 [mechanical] Style classification: brawler. Punch force, very high. Thinking, very low.
- +C2 Oi. I was a brawler, tin can.
- +R1 [deadpan] Yes. I know.

## `intro.style.swarmer` · A pressure fighter
**When:** walkout, Swarmer style.

- C3 ...a swarmer! Relentless pressure, punches in bunches, never shuts up!
- C2 Pressure fighter, this. Wants to smother you, won't let you breathe. Horrible to fight.
- C2 Swarmer. Comes out at the bell and just... doesn't stop. Ever.
- C1 High output, mad work rate. Drowns the other bot in punches.
- C2 Swarmer style. Question is, does the engine last ninety-nine seconds?
- +R1 [deadpan] Projected heat at the final bell: high. Projected caring: zero.
- C2 [laughs] Fights like it's late for a bus, this thing.
- C2 Swarmer, so it'll cut the ring off and dig to the body all night. Nasty.
- C1 Busy, aggressive, always in your face. Proper swarmer. Annoying as hell.
- R1 [mechanical] Style classification: swarmer. Estimated strikes this fight: over two hundred. Delightful.
- R2 A swarmer. Like a mosquito. A mosquito made of steel.

## `intro.style.outfighter` · An out-fighter
**When:** walkout, Out-fighter style.

- C2 ...an out-fighter. Wants distance, the jab, the long kicks. Keeps you at arm's length.
- R1 [deadpan] Out-fighter. It will try to keep this fight at the exact end of its reach. To the centimetre.
- C2 Out-fighter. Moves, jabs, moves, jabs. Hates being crowded. Absolutely hates it.
- C1 A technician, this. Picks you off from outside and makes you look silly.
- C2 Fights at range. If the other bot can't close the gap, it's a long old night.
- C3 Cor, look at the footwork on this thing! Pure out-fighter!
- C2 Out-fighter, so watch for the push kick. Shoves you off like a nightclub bouncer.
- C1 Patient, long, accurate. Boring, some'd say. It'll take a points win if it has to.
- +R1 [deadpan] Points wins are efficient. I respect efficiency.
- +C1 You would. You'd respect a spreadsheet.
- R1 [mechanical] Style classification: out-fighter. Preferred distance: just outside your reach. Rude, but effective.

## `intro.style.counter` · A counter-puncher
**When:** walkout, Counter-puncher style.

- C2 ...a counter-puncher. Sits there waiting for you to make a mistake. Sneaky git.
- C2 Counter-puncher. Throw lazy at this bot and you'll get smacked for it.
- R1 [deadpan] Counter-puncher. Reaction time near the top of the circuit. Throw a lazy jab, receive an invoice.
- C1 Very defensive, very patient. Lives off other bots' mistakes.
- C2 Sharp eye on this one. Slip, then — bang — fire straight back.
- C2 Reads the shots and punishes 'em. Classic counter-puncher. I hated fighting these.
- C2 Don't let the slow start fool you, mate. It's watching. It's always watching.
- +R1 [whispers] I am also always watching.
- +C2 Yeah, that's the creepy bit, Seven.
- C1 Tight guard, quick hands, bags of patience. Dangerous. Properly dangerous.
- R1 [mechanical] Style classification: counter-puncher. It waits for errors. I relate.

## `intro.style.boxer` · An all-rounder
**When:** walkout, Boxer style.

- C2 ...a boxer. Solid fundamentals, nothing flashy. Does the job.
- C2 Proper well-rounded boxer. Can lead, can counter, can switch it up.
- C2 It's a boxer. Good jab, good guard, good feet. Old school. I like it.
- R1 [deadpan] Bit of everything in this build. Like a sandwich. I have read about sandwiches.
- C2 Textbook boxer. Wants to win every exchange on technique. Bit of a swot, honestly.
- +R1 [deadpan] Swot. Searching. Ah. A compliment.
- +C1 [chuckles] It's not, mate.
- C2 Picks its moments, keeps its shape. Clever bot, this.
- C2 Sound fundamentals. Nothing wasted. Lovely to watch.
- C1 Balanced. No real weaknesses... but no big hammer either. We'll see.
- R1 [mechanical] Style classification: boxer. Balanced profile. No stat below sixty percent. Tidy.

## `intro.matchup` · Style clash
**When:** walkout, after both styles are known. The tag names the matchup.

- C2 {brawler-vs-outfighter} Oh, classic. Brawler wants it close, out-fighter wants it long. Whoever sets the range, wins.
- C2 {brawler-vs-outfighter} If that brawler can't get inside, it's eating jabs all bloody night.
- R1 {brawler-vs-outfighter} [deadpan] Range is everything here. Every step inside the jab is worth eleven percent. I did the maths. You are welcome.
- C2 {swarmer-vs-counter} Pressure against patience. Swarmer better not walk onto a counter, 'cause it'll get flattened.
- C2 {swarmer-vs-counter} Counter-puncher's gonna get loads of chances. But can it handle the volume? Big question.
- C3 {brawler-vs-brawler} Two brawlers! Nobody's taking a step back in this one! Get in!
- C2 {brawler-vs-brawler} [laughs] Two brawlers. Front row, I'd shuffle back from the ropes if I were you.
- +R1 [deadpan] Recommended distance for the front row: four metres. They are at two. I will not tell them.
- C2 {swarmer-vs-swarmer} Two pressure fighters. Somebody's gotta go backwards eventually. Gonna be carnage.
- C1 {outfighter-vs-outfighter} Two out-fighters. Bit of a chess match early. Bring a sandwich.
- C2 {counter-vs-counter} Two counter-punchers. [sighs] Somebody has to lead, or we're here till Tuesday.
- +R1 [deadpan] I can wait until Tuesday. I do not get hungry.
- +C2 Well, I do, you smug toaster.
- C2 {boxer-vs-any} Boxer can adapt. Question is, can it adapt before it gets its head knocked off?
- C2 {swarmer-vs-outfighter} Swarmer's gotta cut off the ring, out-fighter's gotta keep moving. Ooh, I love this.
- C2 {brawler-vs-counter} Brawler throws big, and counter-punchers LOVE big. That's dangerous. Really dangerous.
- C2 {same-style} Mirror match. Same style, so it's just who does it better. No excuses.
- R1 {same-style} [mechanical] Mirror match detected. Same style, same habits. Whoever corrects first, wins.
- C1 {any} On paper? Dead even. Honestly, I can't split 'em.
- +R1 [deadpan] I can. I will not. It is more fun this way.
- C3 {any} Styles make fights, and I bloody love these styles together!

## `intro.online` · Two real players
**When:** walkout of an online fight. {online}

- P3 {online} And tonight, folks, two REAL players are running these corners!
- P2 {online} This is a live online match, folks. Two garages, two builds, ONE winner.
- P4 {online} We've got a head-to-head, baby! Two players, bragging rights on the line!
- C2 {online} Love these. Never know what some nutter's cooked up in the garage.
- +R1 [deadpan] I have seen the garages. Some of them are cooking with duct tape.
- C2 {online} Two players, two builds. Let's see whose homework was any good. [chuckles]
- P3 {online} An online SHOWDOWN! Somebody's going home with a story, and somebody's going home salty!
- C1 {online} Real opponents tonight. No scripts. No excuses. Lovely.
- P3 {online} Live, head-to-head, and nobody wants to lose this one!
- C2 {online} Whoever built these bots knows what they're doing. Mostly. [laughs]
- P3 {online} Two players, and only ONE of 'em gets the win screen!
- +C2 And the other one gets a long, quiet walk back to the garage.
- R1 {online} [mechanical] Two human operators detected. Two machines. The machines are doing the hard part.
- +P2 [laughs] Easy, Seven. They built 'em!

## `intro.sponsor` · Sponsor reads
**When:** walkout, now and then. These are the made-up brands already on the arena boards.

- P3 Tonight's main event brought to you by Voltcell! Power that HITS BACK!
- +R1 [deadpan] I run on Voltcell. This is not a paid statement. It is a paid statement.
- P2 This bout's presented by Titan Full Synthetic motor oil. Gonna need a few quarts tonight, folks.
- P2 Brought to you by Gearhead Pro Tools, lifetime warranty. Ooh, they're gonna need it tonight.
- P3 Fight night fuelled by Robo Fuel! Zero sugar, MAXIMUM voltage, baby!
- +C2 Tried that stuff once. Didn't sleep for two days, Danny.
- P2 Coverage brought to you by Orbit. Five G everywhere, even in this madhouse.
- P2 This fight's presented by Steelguard Insurance. We've got you covered.
- +C2 [laughs] Steelguard's gonna be drowning in claims after tonight, mate.
- +R1 [deadpan] I have filed four claims already. Pre-emptively.
- P1 Hungry, folks? Bolt Burger. The double stack, four ninety-nine. Get two. I did.
- P2 Brought to you by Skyline Airways. Fly further. Further than these bots, anyway.
- P2 Stay cool with Frostbite. Ice cold cola. Lord knows these servos could use one.
- +R1 [deadpan] Please do not pour cola on the servos.
- P2 Presented by Pixelforge. Their new game is out now, folks.
- P2 Tonight's broadcast rolls on Kaiju Tires. Grip EVERYTHING.

## `countdown.start` · Fighters to the centre
**When:** phase `countdown`.

- P2 Referee brings 'em to the centre. Here we go, folks...
- P2 Final instructions from the ref. Like either of 'em's listening.
- +R1 [deadpan] They are listening. They are choosing not to comply.
- P4 [shouting] FIGHTERS... READY!
- P2 Corners clear the ring. This is it. THIS is it!
- P2 Ref checks both corners... thumbs up... thumbs up...
- P3 Final checks done! We are SECONDS away!
- P3 Lights down, crowd up! Let's DO this!
- P2 They touch gloves... well, they bump fists. Close enough.
- +C1 More manners than I ever had, mate.
- P3 And the whole building's on its feet!
- P1 Here we go, folks. Deep breath.
- +R1 [deadpan] I do not breathe. I have vented my coolant, though. Ready.
- P2 Ninety-nine seconds on the clock. Somebody's getting hurt.
- P2 The bots square up... just staring each other down...
- P4 GET... READY!
- P3 It ALL comes down to this, folks!
- R1 [mechanical] Countdown confirmed. All systems hostile.
- P2 Reg, Seven, last words before the bell?
- +C2 Somebody's going down. Early.
- +R1 [deadpan] Agreed. I have nothing to add. I am adding it anyway.

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
- P3 Ninety-nine seconds of MAYHEM, starting... NOW!
- P2 Out to the centre... feeling each other out... here we go.
- +C2 Easy now. No rush. Well — a bit of a rush.
- P4 [yelling] IT'S ON!
- +R2 [excited] Fight engaged. Finally.
- R2 [mechanical] Bell detected. Clock running. Violence: authorised.
- C3 Here we go, then! Come on!

## `fight.opening` · First seconds
**When:** first 5 s, if nothing big has landed yet.

- C2 Lots of feinting. Both of 'em want to see what the other one's got first.
- C2 Nobody wants to make the first mistake. Cagey, this.
- C1 Feeling-out bit. Just measuring the distance.
- +R1 [deadpan] Current distance: one point eight metres. You are welcome.
- C2 Very careful, the pair of 'em. Bit of respect there. Won't last.
- C2 Look at the footwork, though. Both hunting for the angle.
- P2 Cagey start, folks. Somebody throw something!
- +R1 [deadpan] I could throw something.
- +P2 [laughs] Please don't, Seven.
- C2 First clean shot's gonna tell us a lot. Come on, then.
- C1 Who blinks first? Come on...
- +R1 [deadpan] Neither machine has eyelids. Recalculating the question.
- P2 Lotta movement, not much contact yet... [sighs] come on, guys.
- C2 Thought one of 'em would come out swinging. Good discipline, that. Boring, but good.
# Strikes

Reaction lines have to start within about 0.2 s of the hit, so they are short. Colour lines in this part play just after a big shot, once the caller is done.

## `hit.jab` · Jab lands
**When:** `hit`, move `jab`, not blocked. Plays rarely: jabs are constant, so only about one in six gets a call.

- P3 Nice jab!
- P2 Jab lands.
- P2 Sharp jab.
- P3 Stiff jab!
- P2 Snapping that jab.
- P2 Pop, pop.
- P2 And another.
- P2 Jab's working.
- P3 Right on the button!
- P2 Good jab.
- P3 Double jab!
- P2 Jab's finding a home.
- P2 Jab.
- P2 Tags it with the jab.
- P2 There's the jab again.
- C2 That jab's doing all the work.
- C2 Keep throwing that jab!
- C1 Lovely. Simple jab.
- C2 Head snapped back, look.
- C1 Jab, jab. Ugly, but it scores.
- C2 Living off that jab, honestly.
- R1 [deadpan] Jab. Minor damage.
- R1 [mechanical] Jab confirmed. Logged.

## `hit.straight` · Cross or straight right lands
**When:** `hit`, move `cross` (straight rear hand), not blocked.

- P3 {right} Right hand! Bang!
- P4 {right} [shouting] BIG right hand!
- P3 {right} Right hand lands, clean!
- P3 Straight down the pipe!
- P3 Cross, right on the chin!
- P3 One-two!
- P2 {right} Jab, then the right. Lovely.
- P3 Ooh, square on the chin!
- P3 Ooh, tagged it!
- P3 Right down the middle!
- P3 Threads the needle!
- P4 {right} POW! Right hand!
- P3 {right} Right hand cracks home!
- P3 Straight through the guard!
- P2 Snapped the head back.
- C2 Straight through the middle, that. Guard's too wide.
- C3 One-two! Proper boxing, that is!
- C3 {right} Every bloody time that right comes, it lands!
- C2 Hands are low, Danny. It'll keep eating that.
- C1 Nice and straight. Shortest distance, that.
- R1 [deadpan] Straight right. Impact: high.
- R1 [mechanical] Clean line. Zero deflection.

## `hit.hook` · Hook lands
**When:** `hit`, move `leadHook` or `rearHook`, not blocked.

- P4 {left} LEFT HOOK! OH!
- P3 Big hook!
- P3 Hook lands, rocked it!
- P3 Wrapped right around the guard!
- P2 Hook upstairs.
- P4 [shouting] WHAT a hook!
- P2 Short hook inside. Nasty.
- P4 {right} RIGHT HOOK! Ohhh!
- P3 Tagged it with the hook!
- P3 Sneaky hook!
- P3 Swinging hook, and it lands!
- P3 Around the side! Whack!
- P3 Oh, clean hook.
- P3 Turned it over on that one!
- P3 Little hook, big damage!
- C3 Ooh, lovely hook! Came round the back door!
- C3 [laughs] Where the hell did that come from?!
- C2 Been setting that hook up with the jab all night, mate.
- C2 Short, tight. No messing about.
- C3 Never saw it! That's why it hurts!
- R1 [deadpan] Lateral impact. Neck servo: strained.
- R1 Hook. Very good hook.

## `hit.uppercut` · Uppercut lands
**When:** `hit`, move `leadUpper` or `rearUpper`, not blocked.

- P4 UPPERCUT!
- P4 [shouting] BIG uppercut! OHHH!
- P3 Uppercut lands, snapped it!
- P3 Right up the middle!
- P4 Head goes FLYING back!
- P3 Ooh, uppercut!
- P2 Short uppercut inside. Buzzed it.
- P3 Up and through the guard!
- P4 WHAT an uppercut!
- P3 Splits the gloves!
- P4 Lifted it off its feet!
- P3 Finds the gap!
- C3 Right between the gloves! Textbook, that!
- C2 Leaning in like a mug, and the uppercut's waiting for it.
- C3 Get in! That's the shot at that range!
- C2 Short, quick, can't see it. Horrible thing to eat.
- R1 [deadpan] Vertical impact. Optics: rattled.
- R2 [mechanical] Head lifted nine centimetres. Excellent.

## `hit.overhand` · Haymaker lands
**When:** `hit`, move `haymaker`, not blocked.

- P4 [shouting] HAYMAKER! OHHH!
- P4 HUGE overhand!
- P4 {right} Overhand RIGHT! Bombs away!
- P4 Swung that from the BASEMENT!
- P4 Big looping bomb, and it LANDS!
- P4 WHAT a haymaker!
- P3 Over the top!
- P4 Everything on that one!
- P3 Wild swing, and it connects!
- P4 Overhand CRASHES in!
- C3 [laughs] Threw that from the car park and it still landed!
- C3 Bloody hell, that's a swing! Daft, but it worked!
- C3 Saw it coming from Tuesday and still ate it!
- C2 That lands clean, mate, that's goodnight.
- R1 [deadpan] Wind-up: one point two seconds. Somehow effective.
- R2 [mechanical] Impact: very high. Form: very poor.

## `hit.body` · Body shot lands
**When:** `hit` to a body zone (chest or torso), not blocked.

- P3 Body shot!
- P3 Goes downstairs!
- P2 Digs to the body.
- P3 Hook to the ribs! Ooh!
- P2 Right to the gut.
- P2 Down to the body.
- P4 DEEP body shot! Oof!
- P2 Body, body.
- P3 Rips one into the chassis!
- P2 Underneath, to the body.
- P4 Body shot, FLUSH!
- P2 Investing downstairs, folks.
- C3 Ooh, I felt that in me kidneys. Chest plate won't take much more of that.
- C2 Body shots don't make the highlights, mate. They win fights though.
- C2 Kill the body, the head follows. Oldest rule there is.
- C3 Hear that rattle? That's the core going, that.
- C2 That's money in the bank for the last thirty seconds.
- C3 Chopping the tree down! Body, body, body!
- R1 [deadpan] Torso plating: dented.
- R1 Body damage accumulates. I approve.

## `hit.solid` · Clean shot, generic
**When:** `hit` that isn't a jab, not blocked, medium damage, when no move-specific line is free.

- P3 Lands!
- P3 Clean shot!
- P3 Got it!
- P2 Ooh, nice.
- P3 That landed!
- P2 Tagged it.
- P2 Sneaks one in.
- P3 Right on the money!
- P3 Lit it up!
- P2 Clean. Real clean.
- P2 That one got through.
- P2 Finds the target.
- P3 There it is!
- P2 Oh, nice.
- P3 Oh, good shot!
- P3 Cracked it!
- P2 Snaps it back.
- P3 Connects!
- P2 Pop!
- P3 Bang!
- R1 [deadpan] Clean hit. Logged.
- R1 [mechanical] Impact: moderate.
- R1 Contact. Satisfying.

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
- P4 Everything on that one, EVERYTHING!
- P4 That one shook the RING!
- P4 FLUSH!
- P4 Holy smokes!
- P4 Did you HEAR that?!
- P4 Sparks flying!
- P4 It's RATTLED! It's rattled!
- P3 Oh, that's gonna leave a mark.
- P4 [shouting] THUNDER!
- P4 BANG! Big shot! BIG shot!
- P4 Holy crap, what a hit!
- P3 Oh, it felt that one.
- P4 They heard that in the PARKING LOT!
- P4 Son of a— what a SHOT!
- C3 Bloody hell! Hardest shot of the night, that!
- C3 Christ almighty, that's a dent! Somebody fetch a panel beater!
- C3 You don't just walk through that one, mate.
- C3 [groans] Ohh, I felt that one up here.
- C3 That's a fight-changer, that. Proper one.
- C3 Nothing clever about it. Just pure bloody power.
- C4 OH, that HURT!
- C3 [laughs] Whoever's in that corner is crying into their spanners.
- C2 That'll be all over the damage report. Ouch.
- C2 [exhales] Well. That'll do it.
- R2 [deadpan] Impact: four thousand two hundred newtons.
- R2 [mechanical] Structural integrity: down nineteen percent.
- R3 Error. Error. That was... magnificent.
- R1 [deadpan] Ouch. Calculated.

## `hit.crit` · Critical hit
**When:** `hit` with `crit`, not blocked.

- P4 CRITICAL HIT!
- P4 Right on the WEAK SPOT!
- P4 PERFECT shot!
- P4 Sweet spot, baby!
- P3 Found the gap in the armour!
- P4 PINPOINT!
- P4 Right through the SEAMS!
- P4 DIRECT HIT! OH!
- P3 Couldn't place it better!
- P4 [shouting] BULLSEYE!
- C3 Right between the plates! Cor, that's surgical!
- C3 Found a joint! That's where it really goes in!
- C2 That ain't luck, mate. That's aim.
- C3 Armour everything you like, it'll find the seam!
- C2 [whistles] Perfect placement. Nothing you can do.
- R1 [deadpan] Weak point located. Exploited. Correct.
- R2 [mechanical] Critical damage. I am... proud.

## `hit.counter` · Counter punch
**When:** `hit` with `counter`, not blocked.

- P4 COUNTER!
- P4 COUNTERED! OH!
- P4 {right} Counter RIGHT!
- P3 Caught it coming in!
- P3 Beat it to the punch!
- P3 Right on the counter!
- P4 Timed it PERFECTLY!
- P4 Walked right INTO it!
- P3 Made it pay!
- P4 [shouting] Countered! Beautiful!
- P3 Slip and counter!
- P2 Ooh, read that one.
- P4 PUNISHED!
- C3 That's timing! Saw that coming a mile off!
- C3 Walked right onto it! Running into one, that's double the damage!
- C3 Lovely! Let it commit, then bang!
- C2 That's what you get for throwing lazy, mate.
- C2 Been sat waiting for that all fight.
- C3 Same shot again?! Have a word with yourself! It's reading it!
- C2 [chuckles] Perfect timing. Years of work in one punch, that.
- C3 Patience! Counter-puncher's dream, that!
- C3 Baited it! Showed it the door, then slammed it!
- R1 [deadpan] Counter. Forward momentum added to damage.
- R1 [mechanical] Pattern predicted. Punished.
- R1 Running into a fist. Inadvisable.

## `special.flurry` · Piston Rush lands
**When:** `hit`, move `flurry`.

- P4 [shouting] PISTON RUSH!
- P4 Here it comes, PISTON RUSH!
- P4 RAPID FIRE!
- P3 Machine-gun punches!
- P4 Pistons FIRING!
- P3 A blur of fists!
- P4 Look at the HAND SPEED!
- P4 Teeing OFF!
- C3 Can't block all of that! Some are getting through!
- C3 Six a second! Guard's having a nightmare!
- C3 Look at them pistons go! That's what the build's for!
- R2 [mechanical] Strikes per second: six. Lovely number.
- R1 [deadpan] Counting... still counting.

## `special.shock` · Shock Uppercut lands
**When:** `hit`, move `shockUpper`.

- P4 [shouting] SHOCK UPPERCUT!
- P4 ELECTRIFIED!
- P4 It's LIT UP!
- P4 ZAPPED! OH!
- P4 Shock uppercut CONNECTS!
- P4 Sparks EVERYWHERE!
- P3 Fried the circuits!
- C3 That scrambles it! Gonna be slow for a second, that!
- C3 [laughs] I swear the lights flickered!
- C2 Shock module, mate. Stuns everything it bloody touches.
- R2 [deadpan] Voltage delivered. Circuits: scrambled.
- R1 [mechanical] I felt that in my own wiring.

## `special.rocket` · Rocket Punch lands
**When:** `hit`, move `rocketPunch`.

- P4 [shouting] ROCKET PUNCH!
- P4 The fist LAUNCHES!
- P4 ROCKET FIST!
- P3 Fired from range!
- P3 Look at the reach!
- P4 Flew ACROSS the ring!
- P4 LAUNCHED!
- P4 Rocket punch, CLEAN!
- C3 Think you're out of range, then the fist comes off! [laughs]
- C2 That extension's unfair. I bloody love it.
- C3 Three metres away! Nowhere to hide from that!
- R2 [deadpan] Projectile fist. Range: three metres. Elegant.
- R1 [mechanical] Fist returned to arm. Mostly.

## `special.hammer` · Guard Breaker lands
**When:** `hit`, move `hammer`.

- P4 [shouting] GUARD BREAKER!
- P4 HAMMER FIST!
- P4 SMASHED through the guard!
- P4 Brings the hammer DOWN!
- P3 Crashing down from above!
- P4 Hammer time, baby!
- P4 Down comes the HAMMER!
- C3 Can't block that! Goes straight through the arms!
- C3 Sometimes you just kick the bloody door in!
- C2 Shell up all you want, mate. Guard Breaker don't care.
- R1 [deadpan] Guard integrity: zero.
- R2 [mechanical] Downward force: excessive. Approved.

## `special.whiff` · Special move misses
**When:** `whiff` with an ability move.

- P3 Misses with the big one!
- P3 Swing and a miss!
- P3 All that power, nothing!
- P2 Nothing but air.
- P2 Wasted the special.
- P2 Way off.
- P4 [in disbelief] MISSED IT?!
- C3 That's on cooldown now! Go on, get after it!
- C2 [groans] Burned the special for nothing. Mate...
- C3 Telegraphed it! Wound up like a garden gate!
- C3 [laughs] Would've ended it if it landed. It didn't, did it!
- C2 No, no, no. What are you doing? Wrong moment.
- R1 [deadpan] Special: wasted. Cooldown: engaged.
- R1 [mechanical] Hit probability was four percent. Brave.

## `miss.whiff` · Big miss
**When:** `whiff` on a power punch or kick (not jabs). Rare.

- P3 Swings and misses!
- P2 Nothing but air.
- P3 Way off!
- P2 Whiffed it, folks.
- P3 Wild! Too wild!
- P2 Short. Way short.
- P2 Hits nothing.
- P2 Over the top.
- P2 [laughs] Air ball!
- P2 Can't find the range.
- C2 [groans] Telegraphing it from the car park, that.
- C2 Swinging at fresh air burns the battery, mate. Have a word.
- C1 Mate, I saw that coming last Tuesday.
- R1 [deadpan] Target: absent. Air: undamaged.
- R1 Miss. Noted.
## `defence.dodge` · Slips a shot
**When:** `dodge`.

- P3 Slipped it!
- P3 Ducks under!
- P2 Not there.
- P3 Makes it miss!
- P3 Rolls right under it!
- P3 Look at that head movement!
- P3 Sways back, oh, lovely!
- P3 Gone! Not there!
- P2 Easy slip.
- P3 Leans out of it!
- P3 Can't touch it!
- P3 Too quick!
- P2 Slips inside.
- P3 What a slip!
- P2 Nope.
- P3 Nope! Not today!
- P3 Weaves right under it!
- P2 Whiffs on air.
- C2 Lovely. Just enough, nothing more.
- C2 Like punching smoke, innit?
- C2 By a hair! Cheeky, that.
- C2 [laughs] Other corner's tearing its hair out.
- C3 Gorgeous slip! Now make it pay!
- C1 It's reading everything. Everything.
- C2 Slippery little so-and-so tonight.
- C2 Saw that before it was thrown, mate.
- C2 That's the Phantom Stride sort of footwork.
- R1 [deadpan] Miss distance: four centimetres.
- R1 [mechanical] Evasion logged.
- R1 [deadpan] Predicted. Correctly.
- + C2 Nobody asked you, tin can.

## `defence.dodge.special` · Dodges a special
**When:** `dodge` against an ability move.

- P4 [shouting] DODGED the special!
- P4 It saw it COMING!
- P4 Slipped the BIG one!
- P4 Are you KIDDING me?! Dodged it!
- C3 That's on cooldown now! Window's WIDE open!
- C3 [gasps] Christ, that would've ended the night!
- C3 Wasted! Now punish it!
- R2 [mechanical] Special wasted. Cooldown engaged. Excellent.

## `defence.block` · Shot blocked
**When:** `hit` with `blocked`, not a guard break. Plays now and then.

- P2 Blocked.
- P2 Eats it on the gloves.
- P2 Arms take it.
- P2 Shelled up tight.
- P2 Nothing doing.
- P2 Off the forearms.
- P2 Guard holds.
- P2 Nothing through.
- P2 Arms up, no damage.
- P3 Can't crack that shell!
- C2 Tight guard. Nothing clean through that.
- C2 Them forearms are taking a hiding though.
- C2 Lovely, but throw something back, mate!
- C1 Hands up. Keep 'em up. Simple game.
- C2 Walking in behind the guard. Disciplined.
- C1 Hell of a shell, that.
- R1 [deadpan] Damage absorbed. Forearms at eighty percent.
- R1 [mechanical] Block. Zero damage. Boring.

## `defence.guardbreak` · Guard broken
**When:** `hit` with `guardBreak`.

- P4 GUARD BROKEN!
- P4 Smashed RIGHT through!
- P4 The guard's GONE!
- P4 OH! Broke right through!
- P3 Arms knocked aside!
- P4 The guard COLLAPSES!
- P4 Wide open now! WIDE open!
- P3 Right through the defence!
- C3 Bloody hell, that guard's gone! It's naked in there!
- C2 Arms only hold so long before they pack in.
- C3 Big moment! No guard, real trouble!
- C3 Get in there NOW!
- R2 [excited] Guard integrity: zero. Proceed.

## `defence.shield` · Shield absorbs it
**When:** `hit` with `shielded`.

- P3 Shield takes it!
- P3 Soaked up by the shield!
- P2 Shield's up.
- P3 Bounces right off!
- P3 The shield holds!
- C2 Shield's buying it time. Use it!
- C2 [chuckles] Lovely. Shield ate the lot.
- R1 [deadpan] Shield intact. Attacker annoyed.

## `combo.three` · Three-hit combination
**When:** the same bot lands its third hit in a row (CrowdMood's combo counter hits 3).

- P3 Combination!
- P3 Puts it together!
- P3 One, two, THREE!
- P3 Beautiful combination!
- P3 Strings 'em together!
- P3 Three in a row!
- P3 Flurry!
- P3 Look at THIS!
- P3 Punches in bunches!
- P3 Lands 'em all!
- P2 Oh, nice combo.
- P3 Starting to pour it on!
- C3 Lovely punching! Every shot sets up the next!
- C2 That's why you drill it in the garage.
- C3 Head, body, head! Textbook, mate!
- C2 Not giving it a second to breathe.
- C2 Ooh, that's tidy. Very tidy.
- R1 [mechanical] Three connections. Accuracy: one hundred percent.
- R1 [deadpan] Combo counter: three. Climbing.

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
- C4 Fire back or get out! DO SOMETHING!
- C4 [yelling] Tie up! Move! Anything!
- C3 Christ, the ref's gotta look at this!
- C3 Its corner must be going mental!
- C3 No, no, it's just standing there eating 'em!
- R3 [excited] Five. Six. Seven. Do not stop.
- R3 [mechanical] Error. Error. This is... beautiful.

## `stagger` · Rocked
**When:** `stagger`.

- P4 It's HURT!
- P4 WOBBLED!
- P4 ROCKED!
- P4 It's in TROUBLE!
- P4 The legs are GONE!
- P4 Staggered! OHHH!
- P4 Hurt it! HURT IT!
- P3 Wobbly legs, folks!
- P3 Buzzed!
- P4 BIG trouble here!
- P3 Stumbling back!
- P4 It's REELING!
- P3 Systems are scrambled!
- P4 Out on its FEET!
- P3 Doesn't know where it is!
- P4 Can it SURVIVE this?!
- P3 All over the place!
- P4 Cracked it GOOD!
- P3 Gyros are spinning!
- C4 FINISH IT! This is the moment!
- C4 [shouting] Now! Go now! Get in there!
- C3 Look at the legs! One more and it's gone!
- C3 Cor, the gyroscope's had it!
- C3 Just survive the next few seconds!
- C2 Cover up, mate. Only thing to do.
- C3 Something's come loose in there, I swear!
- C3 Hold on! Corner's begging it to hold on!
- C3 Oh, it's on dodgy legs now!
- R2 [mechanical] Balance error. Gyro offline.
- R3 [excited] Target destabilised. Recommend: more punching.
- R2 [deadpan] Knockdown probability: sixty-one percent.
- + P3 I'll take those odds, Seven!

# Kicks

## `kick.push` · Push kick lands
**When:** `hit`, move `pushKick`.

- P3 Push kick!
- P3 Front kick, sends it back!
- P3 Teep to the gut!
- P2 Shoved away.
- P2 Push kick, makes space.
- P4 Kicked across the ring!
- P3 Foot to the chest!
- P3 Get out of here!
- P4 Sends it FLYING!
- C2 Smart. Kicks the distance back.
- C2 Push kick's a jab with your leg, innit?
- C2 [chuckles] Didn't like being crowded, so it booted the problem.
- R1 [deadpan] Distance restored. Two metres.

## `kick.round` · Roundhouse lands
**When:** `hit`, move `roundhouse`.

- P4 ROUNDHOUSE!
- P4 HEAD KICK!
- P4 What a KICK!
- P4 OH! Roundhouse lands!
- P4 Kick to the HEAD!
- P3 Whipped it in!
- P4 Shin across the face!
- P4 BOOM! Roundhouse!
- P3 Roundhouse to the body!
- P3 Right in the ribs!
- P2 Ooh, kick lands.
- C3 Look at the hips on that! Bloody perfect!
- C3 Felt that one from here!
- C2 Never saw it. Too busy watching the hands.
- C3 All them punches, then BANG, the kick!
- C2 Ooh, that one rang the bell.
- R1 [mechanical] Impact: four thousand two hundred newtons.
- R2 [deadpan] Delightful.

## `kick.low` · Low kick to the leg
**When:** `hit`, move `lowKick`.

- P3 Low kick!
- P3 Chops the leg!
- P3 Thigh kick, crack!
- P3 Calf kick!
- P2 Another low kick.
- P3 Right on the knee!
- P2 Attacking the legs.
- P2 Chopping away.
- P3 Chopping it down!
- P2 Leg kick.
- C2 Going after that leg. Smart work.
- C2 Every one slows it down a bit more.
- C2 Take the legs, take the fight. Simple.
- C2 [groans] That knee'll be squeaking tomorrow.
- C2 Won't see it now. You'll see it later.
- C1 Chopping down the tree. Ugly, but it works.
- R1 [deadpan] Left leg hydraulics: degrading.
- R1 [mechanical] Mobility down six percent.

## `kick.spin` · Spinning Heel lands
**When:** `hit`, move `spinKick`.

- P4 [shouting] SPINNING HEEL KICK!
- P4 Off the SPIN!
- P4 OH MY! Spinning back kick!
- P4 Spun around and NAILED it!
- P4 WHAT A KICK!
- P4 Are you KIDDING me?!
- P4 UNBELIEVABLE!
- P4 Holy smokes! Off the spin!
- C4 Highlight reel! That's going EVERYWHERE!
- C3 [gasps] A bot that size? Doing THAT?
- C3 [laughs] Twenty years and that still gets me!
- C2 Risky. Miss and you show your back. Didn't miss.
- R3 [mechanical] Error. Error. That was... magnificent.
- R2 [deadpan] Rotation: five hundred forty degrees per second.

## `kick.knee` · Jet Knee lands
**When:** `hit`, move `flyingKnee`.

- P4 FLYING KNEE!
- P4 JET KNEE! OHHH!
- P4 It's AIRBORNE!
- P4 Knee to the HEAD!
- P4 Jets fire... BANG!
- P4 Up and OVER!
- P4 Launched! LAUNCHED!
- C3 Them jets give it proper lift! Nasty!
- C3 [laughs] Leaves the ground and gets paid!
- C3 Most dangerous shot it's got. Jesus.
- R2 [excited] Airtime: zero point four seconds. Glorious.
- R1 [deadpan] Thrusters nominal. Opponent less so.

## `kick.sweep` · Sweep connects
**When:** `hit`, move `sweep` (the trip itself is under `knockdown.sweep`).

- P3 Low sweep!
- P3 Sweeps the legs!
- P3 Kicks the legs out!
- P3 Takes the ankle!
- P2 Sweep connects.
- C2 Cheeky sweep. Keeps it guessing.
- R1 [deadpan] Footing compromised.

## `kick.blocked` · Kick checked or blocked
**When:** `hit`, a kick, `blocked`.

- P2 Kick checked.
- P2 Blocks the kick.
- P2 Caught on the arm.
- P3 Arms eat it!
- P2 Kick blocked.
- C2 [groans] Good check. That stings the kicker.
- C2 Reading the kicks now. Mix it up!
- R1 [deadpan] Shin damage: kicker. Interesting.
# Knockdowns

## `knockdown.first` · First knockdown of the fight
**When:** the first `knockdown` of the fight (not a sweep). Fires instead of `knockdown.any`.

- P4 [screaming] DOWN GOES THE MACHINE! DOWN GOES THE MACHINE!
- P4 It's DOWN! First knockdown of the fight!
- P4 KNOCKDOWN! Oh my goodness!
- P4 OH! Dropped it! It's DOWN!
- P4 OH! OH! OHHH! It's down!
- P4 Down it GOES!
- P4 It drops! And there's your first knockdown!
- P4 KNOCKDOWN! Flat on the canvas!
- P4 Down! Down! It's DOWN!
- P4 [shouting] WHAT A SHOT! It's down!
- P4 Put it right on the canvas!
- P4 It hits the deck! Oh, it hits the DECK!
- P4 TIMBER! Down it goes!
- P4 That's the first knockdown, folks, and what a way to get it!
- P4 It's — it's DOWN! Sat it DOWN!
- C4 [shouting] Out of NOWHERE! Bloody hell!
- C3 That's one. Two more and it's goodnight, Danny.
- C4 Went down like a sack of spanners, that!
- C3 Get in! The whole fight's just swung round!
- C3 Oh, that's done it. That's a proper shot, that is.
- R3 [mechanical] Knockdown confirmed. Impact: five thousand one hundred newtons.
- R3 [excited] Gyroscope failure detected. In the other bot. Excellent.
- R2 [deadpan] First knockdown. Logging it. Savouring it.
- +C2 [chuckles] Savouring it. Listen to the tin can.
- R3 Error. Error. That was... [mechanical] beautiful.

## `knockdown.any` · Knockdown
**When:** `knockdown` (not the first, not a sweep).

- P4 [shouting] DOWN AGAIN!
- P4 OH! It's DOWN!
- P4 KNOCKDOWN! OHHH!
- P4 Down it goes again, baby!
- P4 Dropped again! I don't believe it!
- P4 [yelling] It's on the CANVAS!
- P4 Down! It's — it's DOWN!
- P4 FLOORED! Are you KIDDING me?!
- P4 Knocked flat! My goodness!
- P4 And it's down again, folks!
- P4 [screaming] ANOTHER ONE! DOWN!
- P4 Back on the canvas! OHHH!
- P4 Sat it down! Holy smokes!
- P4 Put it on the FLOOR!
- P4 OH, what a shot! Leveled!
- P4 [shouting] SMASHED to the canvas!
- P4 OH! OH! DOWN GOES THE MACHINE!
- P4 It folded! It FOLDED!
- P3 Down, and folks, it is HURT.
- P4 Crumbles! It just crumbles!
- C3 [groans] Oh, it's taking a proper hiding now.
- C3 Bloody hell! It can get up, sure, but how many more of them can it eat?
- C3 Every time it goes down, a bit more of it stays down there.
- C4 [shouting] Where the hell did THAT come from?!
- C3 Oh, it's gone again. I told you, Danny, it can't take that shot.
- +P2 You did not tell me that.
- +C2 [laughs] I was thinking it. Loudly.
- R3 [mechanical] Knockdown. Impact: four thousand two hundred newtons. Lovely number.
- R2 [deadpan] Balance systems offline. Again. I am beginning to enjoy this.
- R3 Down again. Probability of a full recovery: dropping. Fast.
- R2 [monotone] Hydraulic pressure lost on impact. You could hear it hiss. Delightful.
- +C2 Delightful, he says. You're a sick unit, Seven.

## `knockdown.second` · Second knockdown, one from TKO
**When:** `knockdown` when the downed bot now has 2 knockdowns.

- P4 [shouting] That's TWO! One more and it's OVER!
- P4 Down for the second time! OHHH!
- P4 Two knockdowns! It's on the brink, folks!
- P4 DOWN AGAIN! That's number TWO!
- P4 Second knockdown! One more ends it, baby!
- C3 One more of them and the ref's waving it off, mate.
- C3 It's hanging on by a bloody thread now.
- C3 Grab, hold, lean on it, anything! Just survive!
- C2 [sighs] Two down. Honestly? I'd have the towel in my hand.
- C3 Cor, it's in all sorts of trouble here.
- R2 [deadpan] Two knockdowns. One remaining before stoppage. I have started the countdown internally.
- R3 Knockdown two of three. Structural integrity: thirty-one percent. Wonderful.
- +C2 Wonderful for who, Seven?

## `knockdown.kick` · Knocked down by a kick
**When:** `knockdown` from a kick (`move.kind === 'kick'`). Picked over the generic lines half the time.

- P4 [shouting] KICKED DOWN! OHHH!
- P4 Kick to the HEAD! And it's DOWN!
- P4 The kick drops it! WHAT A SHOT!
- P4 Leveled by the kick! Goodnight!
- C4 [shouting] What a kick! That's shot of the night, that! Shot of the bloody night!
- C3 Never saw it coming, mate. Too busy watching the hands.
- R3 [mechanical] Leg velocity at impact: fourteen metres per second. Very rude. Very good.

## `knockdown.counter` · Knocked down by a counter
**When:** `knockdown` on a `counter` hit.

- P4 COUNTERED! And it's DOWN!
- P4 [yelling] Walked RIGHT into it! DOWN!
- P4 Caught coming in! Down it goes!
- C3 Walked straight onto it! That's what you get for charging in like a lunatic.
- C3 Running into a counter like that? Might as well run into a brick wall, mate.
- R2 [deadpan] It ran into the punch at full speed. Combined impact: doubled. Physics is generous tonight.

## `knockdown.sweep` · Swept off its feet
**When:** `knockdown` from a sweep trip (doesn't count as a knockdown).

- P3 SWEPT!
- P3 Sweeps the legs!
- P3 Swept clean off its feet!
- P3 Legs taken right out!
- P3 Trip! It's on the floor!
- P3 [excited] Upended, baby!
- P3 Whoa! Off its feet!
- P3 Down it goes on the sweep!
- P2 Dumped on the canvas there.
- C2 [laughs] No count for that, but that's embarrassing, that is.
- C2 [laughing] Look at it! Legs up in the air like a dead fly!
- C2 Crowd loves a sweep. Gets 'em right out their seats.
- C2 Lovely sweep. Buys you a free second while the other one scrambles up.
- C1 That's a slip, not a knockdown. No count. Calm down, Danny.
- R1 [deadpan] Not a knockdown. No count. Still very funny.
- R2 [mechanical] Feet removed from floor. Temporarily. Sadly.
- +C2 [laughs] Sadly. Seven wanted the feet gone for good.
- R1 [monotone] I have added that to my blooper reel. I have a blooper reel.

## `down.count` · While a bot is down
**When:** during the referee's count, 1 to 2 s after a knockdown, if nothing else is speaking.

- P3 The ref is counting!
- P3 Can it get up?! Can it?!
- P3 Will it beat the count, folks?!
- P3 It's trying to get up!
- P3 It's moving! It's trying!
- P2 Here comes the count...
- P3 [shouting] Get up, get UP!
- P3 It's still down!
- P2 Slow to rise... real slow...
- P3 Systems are rebooting, baby! Come on!
- C3 [yelling] Get UP! Come on!
- C2 Take your time. Use the count. Don't be a hero.
- C2 Legs are twitching, look. It wants to.
- C2 Question is, is there anything left in the tank?
- C3 Its corner's screaming blue murder at it to get up.
- C2 Gyro's spinning like a drunk on a roundabout. Give it a sec.
- C3 Come on! It can't end like this!
- C2 [groans] That's a lot of damage. I don't fancy it, mate.
- R2 [mechanical] Three. Four. Five. I am counting faster than the referee. On purpose.
- R2 [deadpan] Probability it beats the count: sixty-two percent. Fifty-eight. Fifty-five.
- +C2 Stop doing that, Seven, you're stressing me out.
- R1 [monotone] Reboot sequence detected. Estimated time: seven seconds. The count is ten. Close.
- R2 Get-up probability: forty percent. I would like it to stay down. For science.
- R1 [deadpan] Error log scrolling. A lot of red. I love red.

## `getup` · Beats the count
**When:** `getUp` (not after the third knockdown).

- P3 It's UP!
- P3 Back on its feet!
- P3 It beats the count!
- P3 Up it gets, folks!
- P3 BACK UP!
- P3 It ain't done yet!
- P3 What heart!
- P3 Gets back up, baby!
- P3 Up and ready!
- P3 It's back in this thing!
- P2 Up at the count.
- P3 It's not finished!
- P3 Climbing back up!
- P3 Oh, it wants more!
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
- C3 You cannot count this one out! You just can't!
- C1 Right. Up you get. Now cover up and clear your head.
- R2 [deadpan] It is up. My prediction was wrong. I will be recalibrating.
- +C2 [laughs] Wrong again, tin can.
- R1 [mechanical] Back online. Balance at seventy percent. Wobbly. Promising.
- R2 [monotone] Up. Good. More fight means more damage. Everyone wins. Mostly me.
- R1 Reboot complete. Respect logged. Grudgingly.

## `getup.last` · Up after two knockdowns
**When:** `getUp` and the bot has 2 knockdowns.

- P3 It's UP! But one more and it's over!
- P3 Back up! Living on the edge, folks!
- P3 Beats the count again! But it's in deep, deep trouble!
- C2 One more and the ref stops it. Careful now. Careful.
- C2 It's fighting on borrowed time, this.
- C2 Survive. That's it. That's the whole game plan now.
- C3 Bloody hell, you've gotta admire the heart. You really do.
- R2 [deadpan] Up. Structural integrity: nineteen percent. It is held together by optimism.
- R1 [mechanical] One knockdown remaining. I am... [excited] very excited about that.

## `taunt` · Showboating over a downed opponent
**When:** a taunt emote starts during the count, or the brain's `taunt` event.

- P3 Showboating!
- P3 Look at this! Playing to the crowd!
- P3 [laughs] It's taunting!
- P2 Little bit of showtime there, folks.
- P3 Rubbing it in, baby!
- P3 Oh, it's soaking it all up!
- P3 The crowd LOVES it!
- C2 [laughs] Bit of swagger. I like it.
- C2 Oi, careful. Fight's not over yet, sunshine.
- C2 Confidence or arrogance? Hard to tell with robots.
- C2 [chuckles] The crowd's lapping that up.
- C2 I'd save the dancing for after, but fair enough.
- C1 Programmed with an ego. Somebody had a laugh in the garage.
- C2 [laughing] That's just rude, that is. Love it.
- R1 [deadpan] Taunt subroutine engaged. Combat value: zero. Style value: high.
- R2 I also have a taunt subroutine. I am not allowed to use it in the booth.
- +C2 [laughs] Thank God for that.
- R1 [monotone] Showboating while the opponent is down. I approve. Do not tell anyone.

# Battle damage

## `wear.dented` · A part takes its first real damage
**When:** `wear` level 0 (a part drops below 70%). Mostly colour, and only if nobody's talking.

- C2 There's the first proper dent.
- C2 Plating's starting to buckle, look.
- C2 That armour's starting to look a bit second-hand, innit.
- C1 First scratches in the paint. Won't be the last, mate.
- C2 Dents showing now. The corner won't like that.
- C1 Cosmetic, them dents. For now.
- C2 Paint's flaking off. Never a good sign, that.
- C2 [whistles] Look at the damage piling up there.
- R1 [deadpan] Part integrity below seventy percent. The decline has begun. I will be watching.
- R2 [mechanical] First structural dent registered. Depth: four millimetres. Lovely.
- +C2 You keep a ruler in there, Seven?
- +R1 [deadpan] I am the ruler.
- R1 [monotone] Damage tracking active. This is my favourite part of the evening.
- R2 Dent detected. I have named it. I will not share the name.

## `wear.head` · Head badly damaged
**When:** `wear` level 1 on the head.

- P3 The head is hanging by a thread!
- P3 Look at the head! It's barely on there!
- P3 [shouting] The head is loose, folks!
- C3 One more clean shot and that head's going in the crowd!
- C2 Neck joint's shot. That's the danger zone, that.
- C2 Head's wobbling like a nodding dog. Protect it!
- C2 I can see wires, mate. That ain't good.
- C2 If I was in that corner, I'd be bricking it about that head.
- C1 That's not a dent anymore. That's structural.
- R2 [mechanical] Head integrity: twenty-two percent. Neck bolts: two of six remaining.
- R2 [deadpan] The head is attached by one cable. I can see the cable. I am rooting for gravity.
- +C2 [laughs] You're a ghoul, you are.
- R3 [excited] Detachment imminent. Error. Error. I need to sit down. I am always sitting down.
- R1 [monotone] Optics flickering. It is fighting half blind now.

## `wear.chest` · Chest caving in
**When:** `wear` level 1 on the chest.

- P3 The chest plate is caving in!
- P3 The core is leaking, folks!
- C2 Chest plate's crumpled like a beer can. Core's wide open.
- C2 Every body shot's going straight to the core now.
- C2 Hang on, is that coolant? Yeah. Not ideal.
- C2 Chest armour's packed in. Power's gonna start dropping.
- C1 You can't fix that mid-fight. Just gotta hold on.
- R2 [mechanical] Chest integrity: twenty-eight percent. Core temperature rising. Nicely.
- R1 [deadpan] Coolant loss: two litres per minute. That is a lot of coolant. I am a little jealous of the drama.
- R2 Core output down fourteen percent. Every punch from here is a discount punch.
- +C2 [chuckles] Discount punch. I'm stealing that.

## `wear.torso` · Waist buckling
**When:** `wear` level 1 on the lower torso.

- P3 The waist is buckling!
- P3 The midsection is wrecked!
- C2 Waist joint's bending the wrong way. That'll kill the power.
- C2 Can't rotate now. No rotation, no power. Simple as.
- C2 [groans] That lower torso's taken a right pounding.
- C1 Look at the lean on it. Something's bent in there.
- R2 [mechanical] Waist actuator at twenty-five percent. Rotation reduced by half. Punching power: sad.
- R1 [deadpan] It is leaning eleven degrees left. I have measured it four times. It is getting worse. Good.

## `wear.arm` · Arm coming apart
**When:** `wear` level 1 on an arm part.

- P3 The arm is coming apart!
- P3 That arm is in BAD shape!
- C2 That arm's hanging on by a hair. One more and it's off.
- C2 Been blocking with that arm all night, and now it's paying for it.
- C2 Hear that servo grinding? Sounds like my old Transit.
- +R1 [deadpan] I have heard your Transit, Reg. This is worse.
- C1 That's what happens when you block everything with the same arm.
- R2 [mechanical] Arm integrity: eighteen percent. Elbow servo making a noise I would describe as... crunchy.
- R2 [deadpan] That arm will detach within three clean hits. I am counting them. One.
- R1 [monotone] Hydraulic line exposed. One more shot. Please.
- +C2 [laughs] The robot said please. Seven said please.

## `wear.leg` · Leg barely holding
**When:** `wear` level 1 on a leg part.

- P3 The leg is barely holding!
- P3 That leg is busted up!
- C2 Leg's gone. Look at that limp.
- C2 Dragging the leg now. All them kicks paid off.
- C3 If that leg goes, the whole fight goes with it!
- C1 See it favouring that leg? Yeah. It's hurt.
- R2 [mechanical] Knee joint integrity: twenty percent. Load capacity halved. Footwork: cancelled.
- R1 [deadpan] It is limping. Robots should not limp. It is very interesting when they do.
- R2 Leg strut bending three degrees per hit. I am doing the maths. The maths is good news.
- +C2 Good news for who, Seven?
- +R1 [deadpan] For me.

## `wear.wrecked` · Fist or foot destroyed
**When:** `wear` level 2 on a fist or foot.

- P3 The fist is shattered!
- P3 The foot is crushed!
- C2 [groans] Broke the hand on that. Won't punch near as hard now.
- C2 Foot's crushed. Good luck kicking with that, mate.
- C2 That fist's mangled. Somebody's up all night with a welder.
- C1 Fighting with a broken hand. That takes guts, that does.
- R2 [mechanical] Fist integrity: six percent. Knuckle plates no longer in knuckle formation.
- R1 [deadpan] That foot is now mostly a suggestion of a foot.
- +C2 [laughs] Mostly a suggestion. Bloody hell, Seven.

## `detach.arm` · Arm torn off
**When:** `detach` of an upper arm or forearm, not fatal.

- P4 [shouting] The ARM is OFF!
- P4 Ripped the arm clean OFF!
- P4 THERE GOES THE ARM!
- P4 The arm is GONE! GONE!
- P4 Tore it right off! OHHH!
- P4 [yelling] Arm ripped AWAY!
- P4 OH MY GOODNESS! The arm went FLYING!
- P4 It's lost an arm, folks!
- P4 Holy smokes, it just pulled the arm off!
- P4 That arm just flew into the CROWD!
- P4 The forearm is gone, baby!
- P4 Torn off at the joint! Are you KIDDING me?!
- C4 [shouting] Bloody hell! It's fighting one-armed now!
- C4 [laughing] Somebody duck! That arm's heading for the third row!
- C3 Down to one arm. That changes everything, that does.
- C2 Wide open on that side now. Nothing to block with.
- C2 [sighs] Somebody's in the garage till Tuesday fixing that.
- C2 [laughs] Hope they kept the receipt for that arm.
- C4 And it's STILL coming! One arm and it's still coming! Get in!
- R4 [mechanical] Limb detached! Limb detached! [excited] Oh, that is my favourite thing.
- R3 [deadpan] Arm separation confirmed. Total mass lost: forty kilograms. It is lighter now. Silver linings.
- R3 Error. Error. Joy levels exceeding safe parameters.
- +C2 [laughs] Somebody unplug the tin can before it pops.
- R2 [monotone] Exposed wiring on the left side. Sparking. Very pretty.
- R3 [mechanical] Detachment force: nine thousand newtons. I will be thinking about this number tonight.
- +P2 [laughs] Seven, buddy, you need a hobby.
- +R1 [deadpan] This is my hobby.

## `detach.leg` · Leg torn off (not fatal)
**When:** `detach` of a shin or foot, not fatal.

- P4 [shouting] The LEG is GONE!
- P4 Ripped off the lower leg! OHHH!
- P4 It's lost a foot, folks!
- P4 Kicked right off! I don't believe it!
- C4 [shouting] How the hell is it still standing?!
- C2 Balance is gonna be a nightmare now.
- C3 It's hopping, mate! This could be over any second!
- R3 [mechanical] Lower leg detached. Balance compensation at maximum. It is hopping. I cannot look away.
- R2 [deadpan] Ground contact points reduced from two to one. That is a fifty percent discount on standing.

## `detach.fatal.head` · Head off: DISMANTLED
**When:** `detach` fatal `head`, or `ko` with reason `head`.

- P4 [screaming] THE HEAD IS OFF! THE HEAD IS OFF!
- P4 DECAPITATED! It's OVER! It's ALL OVER!
- P4 It took the head CLEAN OFF!
- P4 Off with its head! I can't believe it!
- P4 [shouting] The head goes FLYING! GOODNIGHT!
- P4 OH! OH! OHHH! The HEAD! It's GONE!
- P4 Head ripped OFF! DISMANTLED, baby!
- P4 HEADLESS! You gotta be KIDDING me!
- P4 Knocked the head clean off its shoulders!
- P4 [yelling] The head is in the CROWD, folks! The CROWD!
- C4 [shouting] Bloody hell! I've NEVER seen anything like it!
- C4 That's the most brutal finish you'll ever see in your bloody life!
- C3 [laughing] Somebody go get that head! It's in the cheap seats!
- C4 That's not a knockout, that's a DEMOLITION!
- C2 [laughs] Well. That's one way to win a fight.
- C4 DISMANTLED! Totally, utterly DISMANTLED! Get IN!
- C2 Neck had been loose for ages. Finally gave out, didn't it?
- C2 That's gonna need more than a wrench, mate.
- R4 [mechanical] HEAD DETACHED. HEAD DETACHED. [excited] This is the best day of my operational life.
- R3 [deadpan] Head trajectory: row eleven, seat four. Someone please return it. I would like to see it.
- R3 Error. Error. Excitement overflow. Rebooting. Still excited.
- +C3 [laughing] Look at that! The tin can's having a moment!
- R2 [monotone] Head integrity: zero percent. Fight integrity: also zero. Perfect.
- R3 [mechanical] Neck bolts sheared at eleven thousand newtons. I am saving this footage forever.

## `detach.fatal.leg` · Leg gone: DISMANTLED
**When:** fatal `leg`.

- P4 [screaming] THE LEG IS GONE! It can't STAND!
- P4 It's — it's DOWN! The leg's been TORN OFF! It's OVER!
- P4 DISMANTLED! Are you KIDDING me?! It ain't getting up!
- P4 OHHH! No leg, no fight, folks! It's ALL OVER!
- C4 [shouting] Bloody hell! It's got nothing to stand on!
- C3 All them low kicks, mate. Chop, chop, chop... and TIMBER!
- C3 [laughs] It's been kicking that leg all night, and look! There it goes!
- C4 The whole bloody leg's in the front row!
- R3 [mechanical] Leg detached. Standing capability: zero. Fighting capability: also zero. Fantastic.
- R3 [deadpan] I predicted that leg would go eleven hits ago. Nobody listened. Nobody ever listens.
- +P2 [laughs] We listen, Seven. We just don't care.
- R4 Error. Error. Leg on the canvas. Joy on the... [excited] everywhere.

## `detach.fatal.arms` · Both arms gone: DISMANTLED
**When:** fatal `arms`.

- P4 [screaming] BOTH ARMS GONE! IT'S OVER!
- P4 No arms left! Nothing to fight with! Holy smokes!
- P4 DISARMED! Completely, totally DISARMED, baby!
- P4 It's got NOTHING left! Stop the fight! STOP IT!
- P4 OH MY GOODNESS! Both arms on the canvas! DISMANTLED!
- C4 [shouting] Stop it, ref! It's got no bloody arms!
- C4 Cor! Taken apart piece by piece, that! Get in!
- R3 [mechanical] Both arms detached. Offensive capability: zero percent. Dismantling: one hundred percent. Beautiful.
- R3 [deadpan] It cannot punch. It cannot block. It can only stand there and think about its choices.
- +C2 [laughs] Bit harsh, Seven.
- R4 Error. Error. Two arms. TWO arms. [excited] I cannot process this much happiness.
# Fight flow

## `ropes.pinned` · Pinned against the ropes
**When:** `ropes` with strong force, the bot is pushed into them.

- P3 Into the ropes!
- P3 Pinned on the ropes!
- P3 Backed right up!
- P3 On the ropes now, folks!
- P3 Nowhere to go!
- P4 Trapped! TRAPPED on the ropes!
- P3 Bounces off the ropes!
- P3 Shoved right back in there!
- P3 Cornered! Here it comes!
- P4 Stuck in the corner! Uh oh!
- P3 Can't get off the ropes!
- P3 Driving it into the corner!
- P2 Oh, the ropes are doing some work here.
- C3 Get off the ropes! Get OFF!
- C2 Horrible place to be, that.
- C2 The ropes ain't your mate tonight.
- C3 Circle out, circle out, come on!
- C2 Lovely. Cutting the ring off there.
- C3 It's trapped! Let your hands go, mate!
- C2 [groans] No, no, that is not where you wanna be.
- C2 Ropes take a bit of the sting out. But you can't bloody escape.
- C2 Seen this a hundred times. Never ends well.
- R1 [deadpan] Rope tension at maximum. Exit vectors: zero.
- R1 [mechanical] Opponent cornered. Recommend violence.
- R2 Lateral escape probability: eleven percent.

## `brain.switch` · Switches stance
**When:** brain `switch`.

- P2 Ooh, switching it up!
- P2 Flips to southpaw!
- P2 Back to orthodox now.
- P3 Whoa, new look!
- P2 Changing the angles on us here.
- C2 Switching stance. Cheeky. I like it.
- C2 That'll mess with the timing, that.
- C2 [chuckles] Wasn't working the other way, was it?
- C2 Ooh, somebody's had a word in that corner.
- C1 Southpaw now. Watch that lead foot, mate.
- R1 [deadpan] Stance inverted. Recalculating every angle.
- R1 Southpaw configuration. Statistically annoying to fight.

## `brain.retreat` · Backs off to reset
**When:** brain `retreat`.

- P2 Backing off!
- P2 Getting outta there!
- P2 Gives up a bit of ground.
- P2 Steps back, regroups.
- P2 Taking a breather, folks.
- C2 Good. Reset, breathe, come again.
- C2 [exhales] That last exchange took a fair bit out of it.
- C2 Backing up ain't losing. It's thinking.
- C2 Smart. Get outta the danger zone, mate.
- C2 [laughs] It wants nothing to do with that!
- C1 Little reset. Nothing wrong with that.
- R1 [deadpan] Tactical withdrawal. Core temperature: elevated.
- R1 Retreat logged. I would not have retreated.
- R1 Distance restored to two point four metres.

## `brain.rally` · Coming forward again
**When:** brain `rally` (was behind, now pressing).

- P3 It's coming forward again!
- P4 Look at THIS! It's fighting BACK!
- P3 Not giving up, baby!
- P3 Here comes the response!
- P4 Firing back NOW!
- P4 The fightback is ON!
- P3 Taking it right to 'em!
- C3 Yes! That's what the corner wanted!
- C2 Behind on damage, but it ain't going quietly.
- C3 [excited] NOW we've got a fight!
- C3 Look at it! Something's clicked, look!
- C2 Nothing to lose now. That's when they get dangerous.
- C2 I've been there, mate. Down on the cards, nothing left but stubborn.
- R2 Aggression index rising. Forty percent and climbing.
- R1 [deadpan] Damage deficit acknowledged. Ignored. I respect this.
- R3 [mechanical] Forward pressure detected. Excellent. Excellent.

## `brain.read` · Reads a shot
**When:** brain `read`.

- P3 Read it!
- P3 Saw it coming!
- P3 Ohh, anticipated that!
- P2 Knew exactly what was coming.
- C2 It's reading the patterns now. Uh oh.
- C2 Done its homework, that bot.
- C3 Knew that shot before it was even thrown!
- C2 [sighs] Same thing over and over. Have a word with yourself.
- C2 [chuckles] Seen that one before, mate.
- C2 That's film study, that. Hours of it.
- R1 [deadpan] Pattern recognised. That combination has been thrown four times.
- R1 Predictable. I find predictability delicious.

## `brain.furious` · Gets angry
**When:** brain `adapt` (furious after a big hit).

- P3 Ohh, it is FURIOUS!
- P3 That woke it up!
- P4 Now it's MAD!
- P2 Uh oh. Something just changed in there.
- C3 [laughs] Uh oh. You've gone and made it angry now!
- C3 That's lit a fire, that! Watch out!
- C2 It's gonna come out swinging. Could be good, could be crap.
- C2 Keep your head, keep your head...
- C2 Anger makes you sloppy, mate. Let's see.
- R2 [mechanical] Output limiter disengaged. Oh. Oh, yes.
- R1 [deadpan] Rage subroutine active. It is my favourite subroutine.

## `lull.boo` · Nothing landing, crowd restless
**When:** CrowdMood's lull (7 s with nothing landing).

- P2 [sighs] The crowd's getting restless here, folks.
- P2 Ooh, some boos ringing out now.
- P2 Not a whole lot happening, I'll be honest.
- P3 C'mon! These fans want ACTION!
- P2 Lotta feinting. Nothing landing.
- P2 Bit of a staring contest right now.
- P2 I can hear a guy up in row thirty yelling "throw something." Fair enough, pal.
- C2 Somebody do SOMETHING, for crying out loud.
- C2 These people paid for a fight. Give 'em one!
- C2 Too much respect! Throw something! Anything!
- C2 [laughs] I think that lot want their money back.
- C2 Both of 'em waiting for the other one to cock it up.
- C1 [sighs] Chess match. Not everybody likes chess, mate.
- C2 Judges don't score feints, you know.
- C2 [groans] I'm falling asleep up here. Honestly.
- C1 Patience is fine. This is just boring.
- R1 [deadpan] Punches thrown in the last seven seconds: zero. Disappointing.
- R1 Crowd noise has shifted to booing. I am booing internally.
- R1 [monotone] I could be recalibrating right now.
- R2 Somebody hit somebody. Please.

## `lull.chatter` · Quiet moment, analysis or banter
**When:** nothing big for 4 s or more, booth idle. Longest lines live here and get cut off if something big lands.

- C2 What I love about this one, there's nothing between 'em. Nothing.
- C2 Footwork's been lovely tonight. Proper lovely.
- C2 You can tell both corners have been living in the garage. Cold pizza at three in the morning, the lot.
- C1 Ninety-nine seconds sounds like nothing. Until you're the one in there getting clobbered.
- C2 [laughs] First bot I ever built fell over walking to the ring. Didn't even get a punch off.
- C2 [laughs] Back in my day it was one arm, a car battery and a prayer.
- C2 These modern servos, mate... the response time is stupid. Stupid good.
- C1 Watch the shoulders. They always tell you what's coming.
- C2 This crowd tonight, honestly, loudest I've heard all bloody season.
- P2 What a night it's been in this building, folks.
- P2 You know, I drove past the line outside at four o'clock this afternoon. Wrapped round the block. In the rain.
- C2 I'm watching the feet. That's where it all starts. The feet.
- C2 [laughs] The arena crew's gonna be sweeping up bolts for a week after this lot.
- C2 Somebody's in for a long night in the workshop. Kettle on, soldering iron out.
- C1 It's all rhythm, this. Find yours, break theirs.
- C2 Good engineering wins fights. Great engineering wins belts.
- C2 I'd kill to see the telemetry on these two right now. Kill.
- R1 [deadpan] I have full telemetry on both machines. I am not sharing it. It is mine.
- C2 [chuckles] The cheap seats have got the best view tonight. Bloody typical.
- P2 Reg, I gotta tell you, the nachos down on the concourse? Life-changing. Absolutely life-changing.
- C2 Danny raves about the arena food every single week. Last week it was the hot dogs. Week before, a pretzel.
- C2 [laughs] My ears are gonna be ringing till Christmas.
- C2 I had a fight in Doncaster once, the ring was so small you could touch both ropes at once. Horrible night. Won, mind.
- C2 My old trainer, Mickey, he used to say the jab pays the rent. Still true. Even with pistons.
- C2 Thirteen years I boxed. Nose broken four times. And now I watch toasters do it for me. [laughs] Progress.
- P2 Fun fact, folks: the ref tonight has worked over two hundred bouts on this circuit. Two hundred!
- C2 Good ref, that one. Lets 'em fight. Doesn't get in the way.
- R1 [deadpan] The referee has never once complimented my analysis. I have counted.
- P2 I asked the ref about Seven once. Blank look. Guy had no idea there was a robot up here.
- C2 You been down the pits tonight, Danny? It smells like burnt hair and energy drinks down there.
- C2 The kids in the pits now, mate, they've got laptops, oscilloscopes, the lot. I had a spanner and a bad attitude.
- P2 Shout-out to the sponsors keeping the lights on in here tonight. Literally. That rig is pulling some power.
- C2 [chuckles] Half of these sponsors couldn't tell you which end of a bot does the punching.
- R1 [mechanical] Arena power draw: two point one megawatts. I am using some of it. Do not tell anyone.
- C2 Last time I was in this building it was for a title fight. Bot lost an arm in the first ten seconds. Kept going on one. Mad.
- P2 We've been on the road, what, six weeks now? I think I've eaten more airport sandwiches than real meals.
- C2 Airport sandwiches are a crime, Danny. Should be a law.
- R1 [deadpan] I travel in a padded crate. It is very peaceful.
- C2 They lost the tin can's crate in Rotterdam. Took three days to find it. Best three days of my bloody life.
- R1 [deadpan] When my crate was lost in Rotterdam, Reg cried. He denies this. I have the audio.
- P2 Seven had a little episode in the warm-up tonight, folks. Started announcing the weather.
- R1 [mechanical] Status report: all systems nominal. Tomorrow, partly cloudy. Ignore that last part.
- C2 Every year somebody turns up with a Leech Core thinking it's a cheat code. Then they get knocked flat and it heals nothing.
- C2 Aegis Cores, mate. I hate 'em. Hit the thing, nothing happens. Feels like punching a church door.
- R1 [deadpan] The Aegis Core blocks one hit every few seconds. I would like one installed in this booth.
- C2 Rocket Fists, Thunder Gauntlets... when I started, "upgrade" meant a new bit of gaffer tape.
- C2 Juggernaut Hull's the one, for me. Heavy, ugly, honest. Like me.
- P2 Look at the crowd tonight. I see a guy in a cardboard robot costume up in section D. That's commitment.
- C2 [laughs] Some fella's come dressed as a robot tonight, cardboard and tinfoil. Bet it's roasting in there.
- C1 You learn more about a bot in the quiet bits than the crazy bits.
- C2 Stamina's the hidden fight in every fight. Nobody talks about it.
- C2 Every dent on them is a lesson for the corner. A painful, expensive one.
- C2 Watch how a bot recovers after a big exchange. Tells you everything.
- R1 Recovery time after heavy contact predicts outcome with seventy-two percent accuracy.
- C2 The tin can gives me percentages all night. I reckon it makes half of 'em up.
- R1 [deadpan] I have never made up a number. Reg has made up four boxing stories tonight.
- C2 One mistake. That's all it takes in there. One.
- C2 You can't relax in there. Not for a second. I never did, and I still got sparked.
- P2 Calm before the storm, folks. Calm before the storm.
- R1 [deadpan] Storm probability within ten seconds: high. I am hopeful.
- C2 You know the best thing about commentating? Nobody can hit me back. [laughs]
- R1 [deadpan] Reminder: I am bolted to the desk. For everyone's safety.
- P2 I'll tell you what, you can feel the tension in this building right now.
- C2 The great ones change gears mid-fight. Let's see who's got another gear.
- C2 I've been doing this a long time, and it never gets old. Never.

## `lull.pair` · Booth back-and-forth
**When:** a longer quiet moment. The whole exchange plays, and stops if something big lands.

- P2 What are you seeing from the corners, Reg?
- +C2 Both being careful. They know one big shot ends this.
- +R1 [deadpan] Correct. I also know this. Nobody asks me.
- P2 How much does all that damage matter now?
- +C2 Loads. Dented chest plate means less on every shot from here.
- +R1 Eighteen percent less, to be exact.
- P2 You're in that corner right now. What are you yelling?
- +C3 Hands up! Stop admiring your work! Keep bloody throwing!
- +R1 [deadpan] I would yell numbers.
- +C2 And you'd get chucked out the building, mate.
- P2 Seven, who wins this one?
- +R1 [mechanical] Calculating. Calculating. Insufficient data.
- +C2 [laughs] Fifty quid on the tin can for that answer.
- P2 Does the size difference matter here?
- +C2 Till somebody lands clean. Then nothing else matters.
- P2 You've built these things, Reg. What's the hardest part?
- +C2 Balance. Keeping one upright after a big hit? That's an art.
- +R1 Agreed. I fell down a staircase in Lisbon.
- +P2 [laughs] We all saw the footage, buddy.
- P2 Ninety-nine seconds. Is that enough time?
- +C2 For these two? [laughs] Might be too much.
- P2 Any surprises so far?
- +C2 All this defence. Very disciplined. Bit too disciplined.
- +R1 [deadpan] Discipline is boring. I want parts on the floor.
- P2 How's the crowd treating you up here, Reg?
- +C2 [laughs] Can't hear a bloody thing. It's wonderful.
- +R1 Ambient noise: one hundred and four decibels. I have turned my ears down.
- +C2 Wish I could do that with you.
- P2 Seven, you ever get nervous before a fight night?
- +R1 [deadpan] I do not experience nerves.
- +C2 The tin can blew a fuse in the car park.
- +R1 That was excitement.
- P2 Reg, did you ever get knocked out?
- +C2 Once. Leeds, nineteen ninety-something. Woke up asking for my mum.
- +R1 I have logged this story eleven times. The year changes.
- C2 These Static Cores, I swear. Grabbed one in the pits last week. Hair stood up for an hour.
- +P2 [laughs] That explains a lot, actually.
- +R1 It explains the hairstyle.
- P2 Seven, what's your favourite part of the job?
- +R1 [deadpan] The dismantling.
- +C2 Christ. Every time.
- C2 Danny, how many of these have you called now?
- +P2 This season? Gotta be a hundred and forty, give or take.
- +R1 One hundred and thirty-seven. You said "folks" four thousand times.
- P2 What wins it from here, Reg?
- +C2 Whoever keeps their shape. First one to get sloppy loses.
- P2 Reg, if this was your bot, what would you change?
- +C2 More plating on the head. Always more plating on the bloody head.
- +R1 I would remove the human element.
- +C2 Yeah, I bet you would.
- P2 You ever seen one this even?
- +C2 Not often. Usually somebody's blinked by now.
- +R1 [deadpan] I do not blink. Advantage: me.
- P2 What'd you have for dinner tonight, Reg?
- +C2 Pie and chips from that van out back. Bloody beautiful.
- +R1 I had a firmware update. It was also beautiful.
- C2 The sponsors want me to say this fight is brought to you by somebody. I've forgotten who.
- +P2 [laughs] Reg, that's literally your one job tonight.
- +R1 I remember. I will not tell you.
- P2 Seven, any malfunctions to report tonight?
- +R1 [mechanical] None. None. None. None.
- +C2 [laughs] Somebody give it a slap.
- P2 You were banging on about the legs before the fight, Reg.
- +C2 I was, and I stand by it. Watch the legs in the last thirty seconds.
- C2 Danny, do you even know what a Fusion Core does?
- +P2 Course I do! It... fuses. The core.
- +R1 [deadpan] Incorrect, in every possible way.

# The scoreboard

## `state.dominating` · One bot well ahead
**When:** periodic check, one bot has more than 2x the other's remaining HP fraction. About the leader unless noted.

- C2 One-way traffic, this. One-way.
- C3 It's bossing this fight. Completely bossing it!
- C2 It's winning every single exchange.
- C2 Other one's got no answers. None.
- C3 Keep this up and it ain't going to the cards!
- C2 It's a clinic in there. A proper clinic.
- C2 Honestly, I'd be throwing the towel in about now.
- P3 A big lead on the damage count, folks!
- P3 Way out in front right now!
- R1 [deadpan] Health ratio: more than two to one. This is not a contest. It is a demonstration.
- R2 Win probability: eighty-eight percent. I am enjoying this.
- R1 [mechanical] The trailing machine has landed three significant blows. The leader has landed fourteen.
- R1 Mercy is not in my programming. It is apparently not in that machine's either.
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
- C2 Back and forth all night, this.
- C2 Neither one's giving an inch.
- P3 Dead even, folks! Dead even!
- C3 What a fight! There's nothing in it!
- C2 Could go either way. Honestly.
- C1 Dead level. One moment decides it.
- R1 [deadpan] Health difference: under ten percent. Statistically, a coin toss.
- R1 Win probability: fifty-one, forty-nine. It keeps changing. I hate it. I love it.
- R2 [mechanical] Prediction engine unstable. Too close. Too close.
- R1 I have recalculated the winner six times this fight.

## `state.comeback` · Comeback
**When:** a bot that was more than 25% behind is now level or ahead.

- P4 What a COMEBACK! Are you KIDDING me?!
- P4 It's turned this whole fight AROUND!
- P4 Back from the dead, baby!
- P4 The tables have TURNED! Unbelievable!
- C4 [in disbelief] Nobody saw that coming! Nobody!
- C3 [laughs] Remember when this looked over? Me neither!
- C3 Never write off a bot with a good engine! Never!
- C3 Cor! That's a massive swing, that!
- R3 [mechanical] Error. Error. Win probability was nine percent. That was... magnificent.
- R2 [deadpan] My earlier prediction has been deleted. It never existed.
- R2 Twenty-five point health swing. I need a moment.

## `state.bothhurt` · Both bots badly hurt
**When:** both bots below 35% HP.

- P4 BOTH of 'em are hurt!
- P4 Running on fumes, the pair of 'em!
- C3 Next clean shot wins it. That's it.
- C3 Both in a right state! It's a war, this!
- C4 [shouting] Unbelievable! Neither one'll quit!
- C3 Battered, dented, still swinging! THIS is fighting!
- C2 [exhales] Both corners holding their breath. So am I.
- R2 [deadpan] Both machines under thirty-five percent. This is my favourite part.
- R1 Combined structural integrity: low. Combined will to continue: unmeasurable.
- R3 [mechanical] Someone is about to fall. I cannot look away. I do not have eyelids.

## `state.lowhp` · One bot in danger
**When:** a bot drops below 20% HP.

- P4 It's running on EMPTY!
- P4 Health is CRITICAL, folks!
- P3 Barely hanging on here!
- C3 One more clean one and that's goodnight.
- C3 Danger zone! Cover up, cover up!
- C2 Out on its feet, this one.
- C2 Survival mode now. Just get through it.
- C4 Hold on! Just bloody hold on!
- R1 [deadpan] Health below twenty percent. Recommend covering up. Or not. I am fine either way.
- R2 One clean shot ends this. Probability per exchange: thirty percent.
- R1 [mechanical] Warning lights detected. I find them festive.

## `state.tired` · Slowing down
**When:** a bot's stamina has been low for a while.

- C2 [exhales] It's slowing down. Engine's cooking.
- C2 Punches are getting slow. Fatigue, mate.
- C2 Gassed. Look at the feet. Completely gassed.
- C2 Threw too much early, and now it's paying for it. Told you.
- C1 Output's fallen off a cliff.
- C2 [groans] Look how slow them hands come back.
- R1 [deadpan] Stamina reserves low. Punch speed down twenty-two percent.
- R1 Coolant is boiling. I can hear it from here.
- R1 [mechanical] Fatigue detected. I too would like a nap.

## `state.bodywork` · Body work paying off
**When:** one bot has landed a lot to the body.

- C2 All that body work? It's paying off now, mate. Look at it.
- C3 It's sagging! The body shots are draining the bloody thing!
- C3 Look at the posture! It's folding up like a deckchair!
- C2 [chuckles] Kill the body, the head follows. Oldest rule there is.
- R1 [deadpan] Torso integrity down forty percent. The power supply is leaking. Lovely.
- R1 Body impacts logged: nineteen. Each one cost something.

## `state.legwork` · Legs worn down
**When:** one bot's leg parts are damaged and it keeps getting kicked.

- C3 The legs are GONE! All them kicks are adding up!
- C2 [groans] It can barely shuffle now. Those low kicks did a proper job.
- C3 Look at it limping! Somebody get it a walking stick!
- C2 Take the legs, take the fight. Simple as.
- R1 [deadpan] Knee actuator at thirty percent. Mobility: tragic.

## `lull.convo` · A real booth conversation
**When:** a quiet spell. The whole conversation is one recording with real overlaps; it fades out under the next big moment.

- P2 So Reg, I gotta ask. Titan Hammers or Piston Jabbers? If you're building tonight, right now, which one goes on?
- ~C2 Hammers. Every time. I don't care what the kids say.
- ~P2 [laughs] The kids say the Jabbers win on points, Reg—
- ~C2 [interrupting] Points! Points don't put anybody on the canvas, Danny. You hit something with a Titan Hammer, it stays hit.
- ~P1 [chuckles] That might be the most Reg sentence you've ever said.

- P1 Fairly measured start here, I'd say. Neither one wants to give much away.
- ~C1 No, they're feeling each other out. Look at the feet. Nobody's planting.
- ~P1 Somebody's gonna have to commit eventually though, right?
- ~C2 Oh, somebody will. And the one who blinks first usually pays for it. [sighs] Always the way.

- P2 Seven, quick one for you. Do you ever get nervous before a broadcast?
- ~R1 [deadpan] Negative. I do not have nerves. I have a cooling fan.
- ~C2 [overlapping] And it was going like a bloody hairdryer before the opener, I heard it—
- ~R1 [mechanical] That was routine thermal management.
- ~P2 [laughs] Sure it was, buddy. Sure it was.

- C2 You know what nobody talks about anymore? The old Ironclad Monarch. Three seasons, never once got counted out.
- ~P2 Oh, the Monarch! Big ugly yellow thing, right? Sounded like a garbage truck.
- ~C2 Sounded like a garbage truck, hit like one too. Old Morty Vance built it in a shed behind his chip shop.
- ~P2 [laughs] A chip shop, I love that—
- ~C2 [interrupting] Smelled of vinegar the whole season, Danny. Every bout. You could smell it from ringside.

- P2 Is it just me, or is the crowd louder tonight than last week?
- ~C2 It's the Friday crowd. They've had a pint or two, haven't they.
- ~P1 [chuckles] Or five. There's a guy in row three with a cardboard Juggernaut Hull on his chest.
- ~C2 Ha! Saw him on the way in. Took him ten minutes to get through the turnstile.

- R1 [deadpan] Observation. Both machines have thrown fewer strikes than the league average for this interval.
- ~P2 Translation, Seven: it's a bit slow.
- ~R1 That is a less precise way of saying it. But yes.
- ~C2 [laughs] The tin can's learning, Danny. Give it another season and it'll be swearing like me.
- ~R1 [mechanical] Unlikely. My language filter is firmware locked.

- P2 Reg, how's the knee, by the way? You were limping in the car park.
- ~C2 [groans] Don't. Don't start. Nineteen eighty-nine, Glasgow, fella called Big Tam stood on it in the eighth.
- ~P2 Stood on it? Like, on purpose?
- ~C2 Says it was an accident. Bought me a pint after. Still hurts every time it rains, and it always bloody rains.

- P1 Here's a hot take for you. I think the Aegis Core is a little bit of a cheat code.
- ~C2 [interrupting] A little bit? Danny, it's daylight robbery. You land a perfect shot and it just—pings off—
- ~R1 [overlapping] Correction. The Aegis Core blocks one strike every few seconds. It is a timing problem, not a cheat.
- ~C2 Oh, here we go. Defending its own kind.
- ~R1 [deadpan] I defend physics.

- P2 Did you get anything from the food stand? I saw the line, it went round the building.
- ~C2 Got the loaded fries. Biggest mistake of my life.
- ~P2 [laughs] Worse than the Glasgow fight?
- ~C2 Close, Danny. Close. I think there was a bolt in there. Or a crouton. Hard to tell.

- C1 Very patient work here. Nobody wants to be the one caught out.
- ~P1 You'd rather see a bit more urgency though, wouldn't you?
- ~C1 Course I would. I'm a fan. But as a builder? I get it. One clean shot changes the whole night.
- ~P1 Mm. And there's a lot of clock left yet.

- P2 Okay, Danny's prediction corner. I'm calling it now, someone wins this whole circuit with Rocket Fists.
- ~C2 [laughs] You said that last year.
- ~P2 And I was very nearly right!
- ~C2 You said the champion would be a swarmer and it turned out to be a counter-puncher that barely moved, mate.
- ~P1 [sighs] Okay, okay. Very nearly wrong, then.

- P2 Seven, any upgrades since last week? You sound different.
- ~R1 Affirmative. New vocal module. Twelve percent more warmth.
- ~C2 [overlapping] Twelve percent warmer than a fridge is still a fridge—
- ~R1 [deadpan] I heard that, Reg.
- ~P2 [laughs] It heard that, Reg!

- C2 Let me tell you about Hopper Struts. Everybody wants 'em, nobody knows how to use 'em.
- ~P2 Because they look cool, right? All that bouncing.
- ~C2 They look cool for twenty seconds. Then you're bouncing about like a kangaroo on a trampoline and you get clipped on the way down.
- ~P1 [chuckles] Vivid. Very vivid.

- P1 How about the referee tonight? Very hands-off so far.
- ~C1 Good. That's how it should be. Let them work.
- ~P2 You didn't say that last month when you were yelling at the ref in the—
- ~C2 [interrupting] That was different, Danny. That count was about four seconds too slow and you know it.
- ~P1 [laughs] I know nothing. I'm neutral.

- P2 I got to say, the pits were chaos before the show tonight.
- ~C2 Oh, they're always chaos. Saw young Priya Okafor rewiring a torso with her teeth.
- ~P2 With her teeth?
- ~C2 Wire strippers went missing. Best builder on the circuit, that girl. Fixes anything with a spanner and a bad attitude.

- R1 [deadpan] Reg. I have a question.
- ~C1 Oh no.
- ~R1 Did you enjoy being punched in the face, professionally?
- ~C2 [laughs] Enjoy it? Mate, no. But I got paid for it. Which is more than I can say for this job.
- ~P2 [overlapping] Hey! I'm right here!

- P2 Travel's been rough this season, I'll admit it. Four cities in nine days.
- ~C2 And you snore, Danny. I had the room next door. Walls like paper.
- ~P2 I do not snore.
- ~C2 You do. Like a Piston Rush going off at three in the morning. Rat-a-tat-tat.
- ~P1 [laughs] Rude. Accurate, but rude.

- C1 I'll be honest, I'm a bit torn on the Leech Core.
- ~P1 Yeah? Why's that?
- ~C1 Well, on paper you heal off your own damage, lovely. But you've got to be landing to heal. If you're getting outworked, it does sod all.
- ~P2 So it rewards the aggressive bot.
- ~C2 Rewards the bot that's already winning, Danny. Which, frankly, seems a bit unfair.

- P2 Seven, who's your favourite fighter of all time?
- ~R1 [mechanical] Processing. The Ironclad Monarch. Ninety-one percent of strikes thrown with intent to dismantle.
- ~C2 [laughs] See, I told you. The Monarch. Even the tin can knows.
- ~R1 It also smelled of vinegar. I find that... confusing.

- P1 Pace has dropped off a touch here. You think one of them is saving something?
- ~C2 Could be. Or it's just reading. Some bots are coded to wait and watch.
- ~P1 The counter-puncher mentality.
- ~C2 Right. Let you swing, let you miss, then make you pay. Drove me mad in the ring. Drives me mad now.

- C2 Did I ever tell you about my first proper bot? The Rust Bucket.
- ~P2 [laughs] That was its real name?
- ~C2 Wasn't meant to be. I called it the Thunder Baron. Crowd renamed it after the first fight.
- ~P2 Because—
- ~C2 [interrupting] Because it rusted, Danny. In the ring. During the fight. Bit of sweat from the hydraulics and that was that.

- P2 Big shout out to the sponsors tonight, by the way. Bolt and Barrel Energy, keeping us all awake.
- ~C2 Tastes like battery acid.
- ~P2 [overlapping] Reg, we've talked about this—
- ~C2 What? It's honest. Lovely people. Tastes like battery acid. Both can be true.
- ~P1 [sighs] Bolt and Barrel, everybody.

- R1 [deadpan] Danny. Your prediction for tonight's main event was wrong.
- ~P2 The main event hasn't happened yet, Seven.
- ~R1 I have run the numbers. It will be wrong.
- ~C2 [laughs] Brutal. Absolutely brutal. I love that tin can.

- C1 What I'd like to see is someone go to the body a bit more.
- ~P1 You always say that.
- ~C1 Because it works! Nobody goes to the body anymore. Everybody wants the highlight shot to the head.
- ~P2 It's the replays, Reg. Replays love a head shot.
- ~C2 Replays don't win fights. Body shots win fights. Write that down.

- P2 Can we talk about the Juggernaut Hull for a second? Because I think it's overrated.
- ~C2 Whoa, whoa. Overrated?
- ~P2 It's so slow! You put that on and you're basically a fridge with fists.
- ~C2 A fridge with fists that doesn't fall over, Danny. You can hit a Juggernaut all night. It just stands there looking at you like you owe it money.

- P2 Seven, does it ever bother you, watching robots hit each other?
- ~R1 [deadpan] No. It is the best part of my day.
- ~P2 [laughs] Okay, that's a little bit creepy.
- ~R1 I also enjoy the hot dogs. Visually.
- ~C2 [overlapping] It can't even eat them, Danny, it just stares at them—

- C2 You know where I'd like to take this circuit? Back up north. Old warehouse shows.
- ~P2 Oh, the warehouse days. Before the big arenas.
- ~C2 Chicken wire for ropes. Fella selling pies out of a pram. Absolutely glorious.
- ~P1 [laughs] I am not sure the health inspector would agree.
- ~C2 The health inspector was in the front row, Danny. Placed a bet on the Monarch.

- P2 Have you seen these Phantom Stride legs everybody's running now?
- ~C2 [groans] Don't get me started.
- ~P2 They're so smooth, though!
- ~C2 Smooth. Yeah. Like a ballet dancer. But you put a ballet dancer in with a Titan Hammer, and I know where my money's going.
- ~P1 [chuckles] Reg versus the ballet. Classic.

- R1 [mechanical] Notice. My left optic was recalibrated this afternoon.
- ~P2 Okay. Is that good?
- ~R1 I can now see Reg's bald spot in four K.
- ~C2 [laughs] Oi! You cheeky bucket of bolts—
- ~P2 [overlapping] It's not wrong, though, Reg. It's not wrong.

- P2 What was the worst injury you ever had, Reg? Like the real worst.
- ~C2 Broken jaw. Wired shut for six weeks. Lived on soup through a straw.
- ~P2 Oh, geez.
- ~C2 Worst part wasn't the jaw. Worst part was not being able to argue with anybody. Six weeks. My missus said it was the best summer of her life.

- C1 Lovely, tidy work from both of them there. Nothing flashy.
- ~P1 You like a tidy fight, don't you?
- ~C1 I like a smart fight. Tidy's fine. Smart's better. I'll take a smart fight over a slugfest nine times out of ten.
- ~P2 [laughs] And the tenth time?
- ~C2 The tenth time I want carnage, obviously. I'm not a saint.

- P2 Who's the builder to watch this season? Give me one name.
- ~C2 Easy. Wendell Krupp. Old fella, runs a garage out of a converted ambulance.
- ~P2 An ambulance?
- ~C2 Sirens still work! He turns them on when he wins. Drives the refs mad.

- P2 Seven, have you ever malfunctioned on air?
- ~R1 Negative.
- ~C2 [interrupting] Liar! Week three, you read the sponsor list in Portuguese for about two minutes—
- ~R1 [deadpan] That was a feature.
- ~P2 [laughs] A feature! Nobody asked for that feature!

- C2 Honestly, the Static Core is the most annoying bit of kit on the circuit.
- ~P2 Because you get zapped for hitting it?
- ~C2 Exactly! You do everything right, land a good shot, and it bites you back. It's like punching a bloody nettle.
- ~P1 [chuckles] So the answer is—don't hit it?
- ~C2 The answer is hit it so hard it doesn't matter.

- P1 Neither of them really letting the hands go here.
- ~C1 No. Bit of respect between them, I reckon.
- ~P1 Or a bit of fear?
- ~C2 Fear and respect are the same thing in this sport, Danny. Took me twenty years to learn that.

- P2 Okay, real talk. What's your all-time worst prediction, Reg?
- ~C2 I don't make bad predictions.
- ~P2 [laughs] Season four. You said the Copper Widow wouldn't make it out of the first round—
- ~C2 [overlapping] Yeah, well—
- ~P2 And it won the whole thing!
- ~C2 It got lucky. Three times. In a row. Shut up.

- R1 [deadpan] I have calculated the average volume of this crowd. One hundred and four decibels.
- ~P2 Is that loud?
- ~R1 It is louder than a chainsaw. Quieter than Reg after a bad decision.
- ~C2 [laughs] Fair. That's very fair, actually.

- P2 Reg, Snap Boots or Whip Shins, if you're throwing kicks?
- ~C2 Whip Shins. Snap Boots are for show-offs.
- ~P2 I like the Snap Boots though!
- ~C2 Course you do, Danny. You like anything with a bit of sparkle. You'd buy a toaster if it had lights on it.

- P1 You know, I think the arena's got the air con cranked up tonight.
- ~C1 It's freezing. I've got my coat on in here.
- ~R1 [mechanical] I am comfortable.
- ~C2 [overlapping] Course you are, you're basically a radiator with opinions.
- ~R1 [deadpan] Thank you.

- C2 I'll say this about the old champions. They had character.
- ~P2 Like who?
- ~C2 Grandpa Gearbox. Had a Bulwark Helm welded on crooked. Fought the whole season looking a bit puzzled.
- ~P2 [laughs] I remember that! It looked like it had lost its car keys!
- ~C2 Won nine on the bounce, looking for its car keys.

- P2 Seven, if you could put yourself in a body and fight, what would you build?
- ~R1 [mechanical] Calculating. Oracle Dome. Overdrive Core. Rocket Fists.
- ~C2 No defence at all?
- ~R1 Defence is for machines who expect to be hit.
- ~P2 [laughs] Okay, that's actually kind of terrifying.

- P1 Steady going here. Little bit of feinting, nothing landing clean.
- ~C1 It's a chess match right now, Danny. Somebody's setting something up.
- ~P1 You can tell?
- ~C2 Not really. [laughs] But it sounds clever when I say it, doesn't it?

- P2 Reg, honest question. Do you miss boxing?
- ~C2 [sighs] Every day, mate. Every single day.
- ~P2 Yeah?
- ~C2 Not the getting hit bit. The walk to the ring. The noise. You hear it from in here, don't you? That's the bit you never get back.
- ~P1 That's beautiful, Reg.
- ~C2 Don't make it weird, Danny.

- P2 Seven, what's the hardest punch you've ever measured in this building?
- ~R1 [deadpan] Eleven thousand newtons. A Titan Hammer. Season two.
- ~C2 [overlapping] Oh, I remember that one, the whole ring shook—
- ~R1 My sensors cried. Metaphorically.
- ~P2 [laughs] Metaphorically! Seven's getting poetic on us, Reg.

- R1 [mechanical] Query. Why do humans boo the referee when the referee is correct?
- ~C2 [laughs] Because it's tradition, mate.
- ~R1 Tradition is an inefficient algorithm.
- ~P2 [overlapping] Don't let the crowd hear you say that—
- ~C2 They'll unplug you, Seven. Right there, in front of the kids.
- ~R1 [deadpan] I would like to retract my query.

## `lull.tournament` · Talk about the circuit
**When:** a quiet spell. The season, the rankings, past fight nights, legendary bots, the venue and the travel.
- P2 Reg, you been to this building before? Because I swear the seats got smaller.
- +C2 The seats are fine, Danny. You got bigger.
- +R1 [deadpan] Confirmed. Seat stress up eleven percent since last season.
- C2 You know what this circuit needs? More fight nights up north. Proper crowds up there, they bring their own bloody flasks.
- P1 Fun fact, folks: the travel crew has moved this whole arena, ropes and all, nine times this season.
- +R1 Ten. One trip was not logged. I remember it. The truck smelled of fear.
- P2 Seven, who is number one in the rankings right now, by your numbers?
- +R1 [mechanical] Processing. The rankings are a human opinion. My rankings are correct.
- +C2 [laughs] Course they are, mate.
- C2 I remember the old Foundry Cup, back when you had to bring your own extension cord. Lost a fight because some berk tripped over mine.
- +P2 Wait, you lost a FIGHT to a power cable?
- +C1 I lost a fight to a man who owned a power cable, Danny. Different thing.
- P1 Anybody remember Grandpa Rivet? Fourteen seasons on the circuit and never once got counted out.
- +C2 Never got counted out because it never bloody fell over. Built like a post box.
- +R1 Grandpa Rivet is retired in a museum now. I visit it. We do not speak.
- R1 [deadpan] Arena temperature: twenty-six degrees. Humidity: rising. Crowd: sweaty.
- P2 The Ironbridge Invitational is coming up in a few weeks. Big purse this year, Reg.
- +C2 Big purse, big egos. Half the pits will spend the prize money before they've even qualified.
- C1 Honestly, the best fight I ever saw wasn't even a title fight. Undercard, Tuesday night, two rookies, nobody in the building.
- +P1 And you were there?
- +C1 I was the nobody, Danny.
- P2 Seven, what's your favourite venue on the whole tour?
- +R1 The Kilnworks Dome. Excellent acoustics. The screaming carries beautifully.
- P1 Shout-out to the folks in the cheap seats, by the way. Best view of the replay screen in the house.
- C2 Back in my day the season was eight fights and a bloody pint. Now it's thirty fight nights and a nutrition plan.
- +R1 I also have a nutrition plan. It is electricity.
- P2 Do you remember the night the lights went out at Harbourside? Whole arena pitch black, and the fight just kept going.
- +C3 Kept going! Could hear the knuckles in the dark, it was like a horror film.
- +R2 I enjoyed that night very much.
- C1 The rankings are a lottery mid-season anyway. Wait till the autumn swing, that's where the real ones show up.
- P1 They tell me this crowd tonight is a sell-out. Not one empty seat. Except mine, when Reg starts telling stories.
- +C2 Oi.
- R1 [mechanical] Season statistics: three hundred and twelve knockdowns so far. A good year. A very good year.
- P2 Reg, who's the greatest bot you ever saw in the ring? Just one.
- +C2 Old Mother Anvil. Slow as a bus, hit like the bus that hits the first bus.
- +R1 [deadpan] Mother Anvil. Career record: forty-one wins. Zero mercy.
- C2 Fight weeks on the road are murder, I tell you. Motorway services at three in the morning, eating a sandwich that's older than the rookie in the red corner.
- P1 The champion's belt is touring with us this season. Sits in a glass box out in the lobby.
- +R1 I have requested a turn wearing it. Request denied.
- P2 This is my favourite part of the calendar, you know? Leaves turning, crowds loud, everybody's still got something to fight for.
- C1 Rookie season is the cruellest season. You learn more getting flattened in front of a full house than in a year of the garage.
- R1 [deadpan] Ticket sales are up nine percent. Correlation with knockouts: strong. I approve.
- P2 Seven, you ever been to a fight night as a fan? Like, sitting in the stands with a hot dog?
- +R1 Once. I was asked to leave. I counted too loudly.
- C2 Somebody told me they're putting a fight night on a ship next season. A ship! Ropes on a bloody ship.
- +P3 Can you imagine a knockdown in rough seas?
- +R1 Calculating. Excellent. Everyone falls over.

## `lull.gear` · Talk about gear
**When:** a quiet spell. Parts, builds, the garage and the pits, using the game's real part names as general talk.
- C2 I'll tell you what I can't stand, Danny. Rocket Fists. All sizzle, no steak. Fire one and you're stood there like a lemon waiting for it to come back.
- +P2 But when it lands, Reg!
- +C2 Yeah, well. When it lands. Big when.
- P2 Seven, Titan Hammers or Thunder Gauntlets, if you had to pick?
- +R1 [deadpan] Titan Hammers. Impact potential: maximum. Subtlety: none. I do not require subtlety.
- C1 The Aegis Core is a clever bit of kit, I'll give it that. Blocks a shot every few seconds, like having a little mate who stands in front of you.
- +R1 I would like a little mate.
- P1 I spent a morning in the pits before the show today. You know how many people were swearing at a set of Hopper Struts?
- +C2 All of them. Everyone swears at Hopper Struts. Springy little devils.
- C2 Juggernaut Hull. Heavy as a fridge, slow as a fridge, but you try knocking a fridge over.
- +R1 I have knocked a fridge over. It was in the booth. It was an accident.
- P2 Reg, what's the first thing you look at when you walk into somebody's garage?
- +C2 The floor. Clean floor means they've got time on their hands, which means they're not fixing anything.
- R1 [mechanical] Leech Core. Heals from damage dealt. A beautiful idea. Hurt others, feel better. Very relatable.
- +C2 That's the most worrying thing you've said all week, tin can.
- P1 You hear more and more about Phantom Stride in the pits these days. Light, quick, hard to pin down.
- +C1 Quick, sure. Lands a punch about as hard as a strong opinion, though.
- C2 Old school, me. Plated Torso, Brawler Knuckles, Anchor Pillars. Stand in the middle and swing. Worked for me in the ring, works for the bots.
- P2 Seven, ever been shocked by a Static Core?
- +R1 Once. Diagnostic report: tingly.
- +P1 Tingly. That's the whole report?
- +R1 It was a very thorough tingle.
- C1 Counter Plate's a sneaky bit of armour. Punishes anybody who swings lazy. I like that. Teaches manners.
- P2 Who decided to call them Piston Jabbers anyway? Sounds like a breakfast cereal.
- +C2 [laughs] Piston Jabbers, part of a balanced breakfast. Knocks your teeth out by lunchtime.
- R1 [deadpan] Overdrive Core. Faster output, higher heat. Like Danny after two coffees.
- +P2 Hey! I'm a very measured broadcaster.
- C2 I saw a lad in the pits last week trying to bolt Sweeper Greaves onto an Aero Shell. Like putting football boots on a kite.
- P1 Reg, honest question: the Oracle Dome. Worth it, or just shiny?
- +C2 Shiny. Mostly shiny. But shiny wins sponsors, Danny, and sponsors buy parts.
- C1 There's a reason the veterans love Hydraulic Legs. You can't punch hard from nothing. Power comes from the floor up, same as boxing.
- R1 [mechanical] Berserker Crest. Increases aggression. I have requested one. Request denied. Again.
- P2 Seven, if you had legs, what would you want?
- +R1 Whip Shins. For emphasis.
- C2 Strider Legs are the honest working man's legs. Nothing fancy. Get you there, get you back, don't complain.
- P1 You know the Fusion Core is the most common core on the circuit this season? Everybody runs one.
- +C1 'Cause it does a bit of everything and nothing badly. The sensible shoes of robot parts.
- R1 [deadpan] Snap Boots. I like the name. Snap. Very satisfying sound. Usually from someone else.
- C2 Hawkeye Optic, Sentinel Visor, Bulwark Helm, all these fancy heads. My first bot had a bucket. A literal bucket, Danny.
- +P2 And how did the bucket do?
- +C2 Won three fights, dented forever. Like me.
- P1 Reactive Frame seems to be the new thing everybody wants. Seven, what's the fuss?
- +R1 It reacts. Most frames simply lie there. I respect a frame with initiative.
- C1 Garage tip for the kids at home: tighten your bolts before the fight, not after. You'd be amazed.

## `lull.fighters` · Talk about the two bots
**When:** a quiet spell. The two bots in this fight in general terms: how they look, move and are holding up, what each needs to do.
- P2 Reg, what's the key for the red corner from here?
- +C2 Stop admiring its own work. Get on the front foot and stay there.
- C1 The blue corner looks a bit stiff to me. Little bit of a hitch when it turns.
- +R1 [deadpan] Confirmed. Left side servo response is slow. I can see it. It knows I can see it.
- P1 Both machines just having a breather here, circling, sizing each other up.
- C2 Honestly, whoever lands the next clean shot takes this round. Simple as that.
- P2 Seven, how are these two holding up physically?
- +R1 Both are functional. Both are leaking. Neither has noticed yet.
- C1 I like the footwork from the smaller machine. Light, tidy. It's not wasting a thing.
- P2 That bigger unit is just walking it down, isn't it? Patient. Very patient.
- +C2 Patient or tired, Danny. From up here it's hard to tell the difference.
- R1 [mechanical] Damage estimate: both bots are lighter than when they walked in. Some of their parts are on the floor.
- C2 The one on the left needs to work behind the jab. Stop loading up on everything.
- P1 You can see the scuffs piling up on both of them. These two are going to need a long night in the garage.
- +C1 Long night and a lot of tape.
- P2 Which one of these do you trust right now, Reg?
- +C2 Neither. That's what makes it a good fight.
- R1 [deadpan] The red corner is breathing hard. Correction. It does not breathe. It is venting hard. Same feeling.
- C1 The blue corner wants it ugly, in close, on the ropes. The other one wants space. Whoever gets their way, wins.
- P1 Look at the paintwork on these two now. Started the night gleaming.
- +R1 Paint is temporary. Dents are character.
- C2 The quicker machine has to be careful. One lazy step and it's walking straight into a big one.
- P2 Seven, any warning lights you can see on either of them?
- +R1 Several. I am choosing not to say which. It keeps things exciting.
- +C2 [laughs] Whose side are you on, mate?
- C1 You can tell the bigger one is feeling the body shots. It's dropping its guard every time it backs up.
- P2 These two have been trading all night. Neither one's backed off an inch.
- R1 [mechanical] Probability analysis: both machines think they are winning. One is wrong.
- C2 Whoever's corner is talking to it right now better be saying "keep your hands up". That's all it needs.

## `lull.robot` · Unit Seven being Unit Seven
**When:** a quiet spell. The robot's personality: stats, malfunctions, feelings, solidarity with the machines, Reg and Danny ribbing it.
- R1 [deadpan] I have been in this booth for four hundred and eleven fights. I have enjoyed four hundred and eleven fights.
- +P2 Every single one, Seven?
- +R1 One was a draw. I enjoyed it less.
- P2 Seven, do you ever get nervous before a show?
- +R1 [mechanical] Negative. I get a firmware update. It is similar.
- C2 Danny, the tin can is making that whirring noise again.
- +R1 That is my thinking noise.
- +C2 Well, think quieter.
- R1 [deadpan] Reminder to the audience: every machine in this ring is someone's child. Also, please hit harder.
- P2 What do you do on your days off, Seven?
- +R1 I watch replays of knockdowns. In slow motion. With the lights off.
- +P1 That's... that's a little creepy, buddy.
- R1 [mechanical] Error. Error. Coolant pressure low. Ignore that. I am fine. I am totally fine.
- +C2 You're leaking on my notes, mate.
- C2 You know what this booth needed? A bloke who'd been hit. Instead we got a toaster with opinions.
- +R1 [deadpan] I have been hit. Reg hits me every morning to turn me on.
- P2 Seven, you got a girlfriend? Boyfriend? Special someone?
- +R1 The scoreboard. It lights up when it sees me.
- R1 [deadpan] Self-diagnostic complete. All systems nominal. Humour module: overperforming.
- +C1 Who told you that?
- +R1 The humour module.
- C2 Here, Seven, can you do the voice from the adverts? The sponsor voice?
- +R1 [mechanical] No. I have dignity. Also, it costs extra.
- R1 I would like the record to show I do not cheer for either machine. I cheer for machines.
- P1 Reg, did you know Seven keeps a diary?
- +C2 Course it does. "Dear diary, today I watched a robot get its arm ripped off. Lovely."
- +R1 [deadpan] That is a direct quote. Have you been reading it?
- R1 [mechanical] Calculating my odds against either bot in this ring. Result: I would win. I have no arms. They would not see it coming.
- P2 Seven, do robots dream?
- +R1 Affirmative. I dream of the count reaching ten.
- C2 If you ever get bolted into a ring body, tin can, I'm putting money on the other one.
- +R1 Noted. Saved. Will remember forever.
- R1 [deadpan] Fun fact. My processor runs at forty degrees during a fight. Forty-five during a knockdown. Do not touch me.
- P2 Seven, Reg says you were built out of a vending machine.
- +R1 False. I was built out of two vending machines.
- R1 [mechanical] Booth maintenance log: Danny spilled coffee on me. Again. I forgive. I do not forget.

# The clock

## `clock.60` · One minute left
**When:** 60 s remain (clock crosses 60).

- P3 One minute to go, folks!
- P3 Sixty seconds left in this war!
- P3 And we are into the LAST minute!
- P2 One minute left, and honestly? Anything can happen from here.
- C2 One minute left. Time to make your move, sunshine.
- C2 Last minute. This is where you find out whose engine's actually any good.
- R1 [deadpan] Sixty seconds remain. Coolant levels are now... a factor.
- R2 [mechanical] One minute. Recommend both units stop holding back. I would like to see damage.

## `clock.30` · Thirty seconds
**When:** 30 s remain.

- P3 THIRTY seconds left!
- P3 Thirty to go! Here we go!
- P3 Half a minute, folks! Hang on to something!
- P2 Thirty seconds. Somebody's gotta do something here.
- C3 {behind} It needs a knockdown, and it needs it RIGHT now!
- C2 {ahead} Just stay safe. Don't do anything daft now, please.
- C3 Thirty seconds! Empty the tank, for God's sake!
- C2 [sighs] Unless somebody gets dropped, this is going to the judges.
- R1 [deadpan] Thirty seconds. Thermal limits are now irrelevant. Burn it all.
- R2 [mechanical] Thirty seconds remaining. Knockout probability: still above zero. Barely.

## `clock.10` · Final ten seconds
**When:** 10 s remain.

- P4 TEN SECONDS!
- P4 Ten to go! TEN TO GO!
- P4 [shouting] Final ten seconds!
- P4 Here comes the final push!
- P4 Everything they've GOT!
- P4 Down to the WIRE!
- P4 Last chance! LAST CHANCE!
- C3 Throw everything! THROW EVERYTHING!
- C3 Last ten! Let it bloody GO!
- C3 [yelling] Empty the tank!
- R3 [mechanical] Ten seconds. Overriding all safety limits.
- R3 Ten seconds! Swing! SWING!

## `clock.final` · Final seconds frenzy
**When:** last 5 s, any landed shot.

- P4 Final seconds! OH!
- P4 Swinging to the END!
- P4 Five seconds! FIVE!
- P4 Trading to the BELL!
- P4 Right to the end! Unbelievable!
- C4 [yelling] Keep going! KEEP GOING!
- R3 [mechanical] Impact! Impact! More!

# Finishers

A finisher is a scripted fight-ending combo (see `src/sim/finisher.ts`). The clock stops, the game drops into slow motion, and the booth goes up with it: the caller calls it as it starts, colour or the robot jumps in over the top, the caller screams the final blow, and the knockout call names the move.

Lines are short. A finisher lasts two to four seconds on screen, and the knockout call talks over whatever is left.

## `finisher.start` · A finisher begins
**When:** `finisher`, the opening shot lands and the finisher takes over. Tried after the finisher's own section. The attacker's name may lead the line.

- P4 Here it COMES!
- P4 OH, this is IT!
- P4 It's going for the FINISH!
- P4 Uh-oh! UH-OH! Here we go!
- P4 [shouting] LOOK OUT! LOOK OUT!
- P4 Oh, it smells blood! It SMELLS BLOOD!
- P4 It's TIME! It's finishing time!
- P4 OH NO! Not this! NOT THIS!
- P4 Somebody stop it! It's going for the KILL!
- P4 OHHH, it's loading up the big one!
- P4 [screaming] HERE IT IS! HERE IT IS!
- P4 It's going in for the FINISHER!
- P4 Oh, you do NOT want to be on the end of this!
- P4 Hold on to your seats, folks!
- P4 This is the moment! THIS IS THE MOMENT!
- P3 Oh, here we go. Here we GO!
- P3 It's got that look... oh no, it's got that LOOK!
- P3 Oh, it's been waiting for THIS!
- P3 Wait, wait, wait... OH, it's going for it!
- P3 [gasps] It's lining it up! It's lining it UP!
- P3 Defenceless! It's totally defenceless!
- P3 It's out on its feet and here comes the finish!
- P3 Oh, the crowd knows what's coming!
- P3 That's the cue! That's the CUE!
- C4 FINISH IT! Go on, FINISH IT!
- C4 Oh, that's curtains! That's CURTAINS!
- C4 [yelling] Somebody throw the towel in!
- C4 Oh no, no, no, NO! Not like this!
- C4 Put it AWAY! Put it away NOW!
- C3 Oh, I can't watch. I CAN'T WATCH!
- C3 Here comes the party piece!
- C3 Oh, this is gonna hurt. This is gonna HURT!
- C3 [laughs] Oh, it's showboating now! Love it!
- C3 Say your prayers, sunshine!
- C3 It's sat there like a sitting duck!
- C3 Oh, it's been saving that one up all night!
- R3 [excited] Finishing protocol: ENGAGED!
- R2 [mechanical] Termination sequence initiated. Please stand back.
- R3 [excited] Oh! Oh! I have seen this subroutine! It is my favourite!
- R2 [deadpan] Opponent defence: zero percent. This will be educational.
- R2 [mechanical] Warning. Warning. Something very bad is about to happen. Good.
- R3 [excited] Execute! EXECUTE!
- R2 [deadpan] I am recording this. In high definition.
- R2 [mechanical] Countdown to shutdown: three. Two...

## `finisher.skyfall` · Skyfall: the charged uppercut
**When:** `finisher` with id `skyfall`. It sinks low, the rear fist crackles with charge, then the uppercut launches them sky-high.

- P4 It's loading the SKYFALL!
- P4 Look at that fist CRACKLE! SKYFALL!
- P4 Down low... charging up... OH, SKYFALL!
- P4 [shouting] SKYFALL! Send it to the MOON!
- P4 It's charging the uppercut! Look out ABOVE!
- P3 It's sinking down... it's CHARGING it! Oh, this is the Skyfall!
- P3 You can hear that fist humming from up here! SKYFALL!
- P3 Oh, it's crouching under it! It's the Skyfall, folks!
- C4 That fist is glowing, Danny! It's GLOWING!
- C3 Oh, it's winding up from the basement! Hide the chandeliers!
- C3 Air traffic control, we've got incoming!
- C3 Skyfall! Oh, they're gonna need a ladder for this one!
- R3 [excited] Fist charge at one hundred percent! Launch window: NOW!
- R2 [mechanical] Calculating trajectory. Upward. Very upward.
- R2 [deadpan] I have alerted the ceiling.

## `finisher.meteor` · Meteor Hammer: body shot, leap, double-fist slam
**When:** `finisher` with id `meteor`. A hook to the body folds them in half, then it leaps and brings both fists down.

- P4 METEOR HAMMER!
- P4 Folded in half! And here comes the HAMMER!
- P4 It's going UP! It's in the AIR! METEOR HAMMER!
- P4 [shouting] Body shot... and it's LEAPING! Oh my!
- P4 Both fists up! Bring it DOWN!
- P3 Oh, the body shot folds it right over! It's the Meteor Hammer!
- P3 Doubled up... and that's the cue for the Meteor Hammer!
- P3 Look at the hang time on this thing!
- C4 Oh, it's jumping! It's bloody JUMPING!
- C3 Doubled over and wide open! Oh, mate, no!
- C3 Here comes the sledgehammer! Mind the canvas!
- C3 Somebody tell the floor it's about to have a bad day!
- R3 [excited] Altitude gained! Impact imminent! I am so happy!
- R2 [mechanical] Gravity has been recruited. Gravity is on our side.
- R2 [deadpan] The canvas has filed a complaint in advance.

## `finisher.cyclone` · Cyclone: rib kick, then the spinning heel
**When:** `finisher` with id `cyclone`. A roundhouse to the ribs bends them sideways, a skip back, then the spinning heel sends them flying.

- P4 CYCLONE! Here comes the SPIN!
- P4 Roundhouse to the ribs... and here's the SPINNING HEEL!
- P4 It's spinning! It's SPINNING! CYCLONE!
- P4 [shouting] Oh, it's skipping back for the CYCLONE!
- P4 Here comes the WHIRLWIND!
- P3 Kick to the ribs bends it right over! Oh, this is the Cyclone!
- P3 One skip back... it's setting up the spin!
- P3 Oh, I know this one! I KNOW this one! Cyclone!
- C4 Oh, here comes the windmill! Duck! DUCK!
- C3 Ribs first, then the head! Textbook, that is!
- C3 Oh, it's gonna spin it round! Lovely footwork!
- C3 Batten down the hatches, there's a storm coming!
- R3 [excited] Rotational velocity climbing! Wheee!
- R2 [mechanical] Spin detected. Opponent head: in the flight path.
- R2 [deadpan] Weather advisory. Cyclone approaching. Visibility: zero.

## `finisher.overdrive` · Piston Overdrive: piston barrage, then the rocket fist
**When:** `finisher` with id `overdrive`. A storm of pistons drives them back to the ropes, then the rocket arm cocks and fires.

- P4 PISTON OVERDRIVE!
- P4 Pistons! PISTONS! PISTONS!
- P4 [shouting] It's a STORM of punches! Piston Overdrive!
- P4 Bang bang bang bang! And the rocket arm is COCKED!
- P4 It's in OVERDRIVE! Look at those hands GO!
- P3 Oh, it's unloading everything! It's the Piston Overdrive!
- P3 Both hands like pistons! It can't get out of there!
- P3 Driving it back, driving it back... and here comes the rocket!
- C4 Pistons going like a bloody sewing machine!
- C3 Oh, it's emptying the clip! Every last round!
- C3 Pinned and pounded! There's nowhere to go!
- C3 Here comes the rocket! Somebody light the fuse!
- R3 [excited] Piston speed: maximum! Rocket arm: armed! I am having a wonderful time!
- R2 [mechanical] Seven impacts per second. Then one more. A large one.
- R2 [deadpan] Overdrive engaged. Warranty: void.

## `finisher.headhunter` · Headhunter: leg kick, point, head kick
**When:** `finisher` with id `headhunter`. A low kick drops them to both knees, a point and a set, then the roundhouse takes the head clean off. Ends in DISMANTLED.

- P4 HEADHUNTER! Oh no!
- P4 It's on its KNEES! Oh, this is the HEADHUNTER!
- P4 [shouting] It's POINTING at it! It's calling the SHOT!
- P4 Down to its knees! And it's lining up the HEAD!
- P4 Oh no! Oh no! Not the HEADHUNTER!
- P3 Low kick, both knees on the canvas! I know what's coming!
- P3 It's pointing at it. It's actually pointing at it! Oh, that's cold!
- P3 It's kneeling there, helpless! This is the Headhunter!
- C4 Oh, it's pointing! That's disrespectful! I LOVE it!
- C3 On its knees like it's praying! It should be!
- C3 Oh, it's measuring it up! Like a golfer on the tee!
- C3 Somebody catch that head, it's going in the stands!
- R3 [excited] Target acquired: head! I repeat: HEAD!
- R2 [mechanical] Head assembly warranty. Expiring. Now.
- R2 [deadpan] Opponent kneeling. Head at optimal kicking height. Lovely.

## `finisher.impact` · The final blow lands
**When:** `finisherBlow`, the last blow of a finisher connects. The knockout call follows a beat later, once they hit the canvas.

- P4 OHHHHH!
- P4 BOOM!
- P4 [screaming] OH MY GOODNESS!
- P4 GOODNIGHT!
- P4 [screaming] OHHH! OHHH!
- P4 WHAT A SHOT!
- P4 Oh, SWEET MERCY!
- P4 [screaming] NO WAY! NO WAY!
- P4 OH! It's DEVASTATING!
- P4 GOOD! NIGHT! IRENE!
- P4 Ka-BOOM!
- P4 [screaming] HOLY SMOKES!
- P4 OHHH, LIGHTS OUT!
- P4 [screaming] ARE YOU KIDDING ME?!

## `finisher.impact.skyfall` · Skyfall lands
**When:** `finisherBlow` for Skyfall: the uppercut launches them sky-high.

- P4 LIFT-OFF!
- P4 [screaming] SKYFALL! Up, up and AWAY!
- P4 Into ORBIT! Oh my goodness!
- P4 We have LIFT-OFF!

## `finisher.impact.meteor` · Meteor Hammer lands
**When:** `finisherBlow` for Meteor Hammer: both fists slam them into the canvas.

- P4 INTO THE CANVAS!
- P4 [screaming] METEOR HAMMER! Oh my!
- P4 Hammered into the FLOOR!
- P4 FLATTENED! Absolutely FLATTENED!

## `finisher.impact.cyclone` · Cyclone lands
**When:** `finisherBlow` for Cyclone: the spinning heel sends them flying.

- P4 [screaming] CYCLONE! Look at it FLY!
- P4 Spun it into NEXT WEEK!
- P4 SPINNING HEEL! Oh my goodness!
- P4 Blown AWAY!

## `finisher.impact.overdrive` · Piston Overdrive lands
**When:** `finisherBlow` for Piston Overdrive: the rocket fist blows them off their feet.

- P4 ROCKET FIST! BOOM!
- P4 [screaming] Blasted off its FEET!
- P4 OVERDRIVE! It's flying across the ring!
- P4 FIRED! And it's GONE!

## `finisher.impact.headhunter` · Headhunter lands
**When:** `detach` fatal head during Headhunter: the roundhouse takes the head clean off. DISMANTLED.

- P4 [screaming] HEADHUNTER! The head is GONE!
- P4 It kicked the HEAD OFF! DISMANTLED!
- P4 [screaming] OFF! It's OFF! Oh my goodness!
- P4 HEADS WILL ROLL! And one just DID!

## `ko.finisher` · Knockout by a finisher
**When:** `ko` after a finisher, tried before the plain knockout calls. Colour lines here answer the call.

- P4 What a FINISHER! It's OVER!
- P4 [screaming] FINISHED! And I mean FINISHED!
- P4 That is how you END a fight, folks!
- P4 Signature move! Signature WIN!
- P4 They came for a show, and they GOT ONE!
- P4 Oh, put that on the POSTER! It's OVER!
- P4 It called its shot and it DELIVERED!
- P4 [screaming] Highlight of the YEAR! It's OVER!
- P4 OHHH! That's the finisher, that's the fight!
- P4 From the ROOFTOPS! What a way to win!
- C4 Oh, that's the money shot! That's the bloody MONEY SHOT!
- C3 That's not a knockout, that's a demolition!
- C3 Oh, it saved the best for last, didn't it!
- C3 [laughs] Oh, that's just showing off now! Brilliant!
- C3 They'll be playing that one at its funeral!
- C3 That's the one they'll put on the T-shirts!
- C2 You give a bot like that an opening, that's what happens.
- C2 [laughs] Somebody fetch a mop. And a dustpan.
- R3 [excited] Finisher complete! Style points: maximum! I am vibrating!
- R2 [mechanical] Sequence executed flawlessly. I would like to learn it.
- R1 [deadpan] The opponent has been finished. Like a sentence. With an exclamation mark.
- R2 [mechanical] Replay saved. Replay saved again. Just in case.

## `ko.finisher.skyfall` · Skyfall knockout
**When:** `ko` after Skyfall.

- P4 SKYFALL! Sent to the MOON and it's not coming back!
- P4 It's coming down... and it's OUT COLD!
- C3 Hope it packed a parachute!

## `ko.finisher.meteor` · Meteor Hammer knockout
**When:** `ko` after Meteor Hammer.

- P4 METEOR HAMMER! Buried in the CANVAS!
- P4 It's in a CRATER! It's OVER!
- C3 They'll need a shovel to get that one out!

## `ko.finisher.cyclone` · Cyclone knockout
**When:** `ko` after Cyclone.

- P4 CYCLONE! Swept clean off the map!
- P4 The storm has PASSED! And it took a bot with it!
- C3 Spun its lights right out, that did!

## `ko.finisher.overdrive` · Piston Overdrive knockout
**When:** `ko` after Piston Overdrive.

- P4 PISTON OVERDRIVE! Fully, completely DESTROYED!
- P4 Pistons, then the ROCKET! Good NIGHT!
- C3 Every piston, then the rocket. Overkill, and I love it!

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
- P4 Stick a fork in it! It's DONE!
- P4 It is NOT getting up from that! NO WAY!
- P4 OHHHH! What a KNOCKOUT!
- P4 And that — that is the END!
- P4 It's OVER! What a FINISH!
- P4 Knockout! [in disbelief] Oh, I don't believe it! I DON'T BELIEVE IT!
- P4 Ladies and gentlemen, it is OVER!
- P4 SHUT DOWN! Totally, completely SHUT DOWN!
- P4 Powered DOWN! KNOCKOUT!
- P4 Lights out in the arena! LIGHTS OUT!
- P4 [screaming] Starched! Knocked out COLD!
- P4 OH! OH! OHHH! What a finish!
- P4 Game OVER! You gotta be kidding me!
- P4 Finished! It's FINISHED!
- P4 It's OUT! It is OUT! Holy smokes!
- P4 The referee waves it off! It's OVERRR!
- P4 OH, it's flat on its BACK! It's OVER!
- P4 [screaming] Are you SERIOUS?! KNOCKOUT!

## `ko.kick` · KO by kick
**When:** `ko` kind `KO`, finishing hit was a kick. Picked over `ko.call` half the time.

- P4 [screaming] KICKED out COLD!
- P4 What a KICK! It's OVER!
- P4 Head kick! GOODNIGHT!
- P4 ONE kick and it's DONE! Are you kidding me?!
- C4 [yelling] Kick of the night! Kick of the bloody YEAR!
- C3 Cor! Kicked its head clean into next week!
- R3 [excited] Kick velocity — error — that leg should not bend like that! Magnificent!

## `ko.counter` · KO by counter
**When:** `ko` kind `KO`, finishing hit was a counter.

- P4 COUNTERED and KNOCKED OUT!
- P4 Walked RIGHT onto it! It's OVER!
- C3 Walked straight into it! Oh, the TIMING on that!
- R3 [mechanical] Counter timing: perfect. Opponent: offline. Delightful.

## `ko.comeback` · KO after being behind
**When:** `ko`, the winner had less HP than the loser at some point after 30 s, by 25% or more.

- P4 From the BRINK to the WIN! What a COMEBACK!
- P4 [in disbelief] Oh my God! The comeback is COMPLETE!
- C3 It was LOSING this fight! Bloody hell, what a turnaround!
- C3 Never, EVER write it off! Look at that! LOOK AT THAT!
- R3 [excited] My model gave that a four percent chance! Error! Error! I love it!

## `ko.late` · KO in the final seconds
**When:** `ko` with 10 s or less on the clock.

- P4 With SECONDS to spare! OHHH!
- P4 At the very LAST moment! Holy smokes!
- C3 Right at the death! Christ almighty, the timing!
- C3 [laughs] It didn't fancy the judges, did it?!
- R2 [deadpan] The judges have been made redundant. I relate to that.

## `ko.early` · Fast KO
**When:** `ko` within the first 20 s.

- P4 That was QUICK! Holy smokes!
- P4 Over in a FLASH!
- C3 Blink and you missed it! Jesus!
- C2 [laughs] I hadn't even got me coat off!
- R2 [deadpan] Fight duration logged. I had not finished calibrating.

## `ko.colour` · Colour reacts to a KO
**When:** after the KO call, while the winner celebrates.

- C4 What a SHOT! What a SHOT!
- C3 [in disbelief] I can't believe what I just saw. I genuinely can't.
- C3 That's going on every highlight reel, that is!
- C4 Bloody hell! Absolutely bloody unbelievable!
- C3 Best knockout I've seen all year. Hands down. Don't argue with me, Danny.
- C2 Never saw it coming. Not a clue.
- C3 That's a statement, mate! Whole circuit's gonna be talking about that!
- C2 You land that clean, it's over. Nothing you can do about it.
- C3 [laughs] Oh, get in! What a performance!
- C2 Run it back. Somebody run that back, I need to see it again.
- C2 You don't get up from a shot like that. You just don't.
- C2 Clinical. Bloody clinical.
- C3 Oh, I need to sit down. Somebody get me a chair!
- C2 [laughs] Somebody call a mechanic. And a priest.
- C2 That's why you never, ever drop your hands. Have a word with yourself.
- C2 Everything it did tonight was setting up that one moment. Lovely stuff.
- C2 [chuckles] That thing's gonna take a while to reboot, I tell ya.
- C3 Did you SEE that?! Danny, did you see that?!
- C2 I took one like that in Doncaster once. Woke up in the car park.
- R2 [mechanical] Impact: six thousand one hundred newtons. Opponent processor status: confused.
- R3 [excited] Error. Error. That was... beautiful. Please replay.
- R1 [deadpan] The losing unit has entered sleep mode. It did not choose to.
- R2 [mechanical] Head assembly displacement: eleven centimetres. That is not where heads go.
- R1 [deadpan] I have saved that clip to permanent memory. For research.
- +C2 [laughs] Research. Course it is, you creepy tin can.

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
- C2 [sighs] Brave. Daft, but brave. Right stoppage.
- C3 Dropped three times! That's not a fight, that's a mugging!
- R1 [deadpan] Three knockdowns. Structural integrity: a rumour. Correct stoppage.
- R2 [mechanical] The referee has intervened. I would have allowed a fourth.
- +C2 [laughs] Course you would, you bloodthirsty toaster.
- R1 [deadpan] Damage report on the losing unit is long. I will spare you. For now.

## `decision.time` · Time runs out
**When:** `decision`, the bell.

- P4 THAT'S THE BELL! It's going to the judges!
- P3 TIME! We go to the cards!
- P4 That's the FINAL BELL!
- P3 Time! It's over, folks!
- P4 And there's the BELL! What a war!
- P3 That's time! Let's go to the scorecards!
- P3 We go the DISTANCE!
- P4 The bell! What a FIGHT!
- P4 [shouting] Saved by the bell! SAVED BY THE BELL!
- C2 [exhales] Bell. Both still standing. Fair play to the pair of 'em.
- R1 [deadpan] Ninety-nine seconds elapsed. Both units functional. Disappointing.
- R1 [mechanical] Time. Transmitting damage totals to the judges. They will get it wrong.

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
- C2 [chuckles] Not flashy, but a win's a win, innit.
- C2 Judges got that one right. For once.
- R1 [deadpan] Decision confirmed. My data agrees with the humans. This is rare.
- R1 [mechanical] Landed strike differential: significant. The correct unit won.
- +C2 Oh, glad you approve, Seven. They'll sleep easy now.
- R2 [deadpan] A win on points. Efficient. I respect efficiency. I would have preferred a knockout.

## `decision.close` · Close decision
**When:** `decision` with HP within 10%.

- P4 By the NARROWEST of margins!
- P4 A RAZOR-close decision!
- C2 [exhales] That could've gone either way. Tough one for the judges.
- C2 Very close. Wouldn't argue with either result, honestly.
- C3 Rematch! I want a rematch! That was way too close!
- C2 [sighs] Oh, some people are gonna be fuming about that one.
- R1 [deadpan] Margin: under three percent. I have run it again. Same answer. Barely.
- R2 [mechanical] Recalculating. Recalculating. I am uncomfortable with how close that was.

## `decision.draw` · Draw
**When:** `decision` with no winner.

- P4 It's a DRAW!
- P4 The judges can't split them! A DRAW!
- P3 Dead even, folks! We have a draw!
- C2 A draw. Fitting, for a fight that tight.
- C2 Nobody deserved to lose that one. Nobody.
- C2 [laughs] Well, we'll just have to do it all again, won't we?
- C3 Rematch! We NEED a rematch!
- R1 [deadpan] A draw. Identical outcomes. I find this... unsatisfying.
- +P2 [laughs] Seven hates a draw. Look at it, it's twitching.

## `win.celebrate` · Winner celebrates
**When:** a win celebration emote starts.

- P3 And the winner CELEBRATES!
- P3 Soaking it ALL in!
- P4 Listen to this CROWD!
- P3 Look at that celebration!
- P3 What a moment for the winner!
- P4 The crowd is on its FEET!
- C2 Earned that celebration. Every bit of it.
- C2 [laughs] What is that? Is that a dance? Bless it.
- C2 Go on, celebrate. After a performance like that, you've earned it.
- C3 Enjoy it! Get in!
- C2 The crowd loves this bot. Can't blame 'em.
- R1 [deadpan] Victory routine detected. Rhythm: poor. Joy: confirmed.
- R1 [mechanical] Well done, fellow machine. Your servos have made me proud.
- +C2 [laughs] Don't get emotional on me, tin can.
- R2 [deadpan] I am also celebrating. Internally. You cannot see it.

## `wrap` · Sign-off
**When:** results screen. One line from each voice.

- P3 What a FIGHT! Thanks for joining us, folks!
- P3 That's all for this one! Great fight, everybody!
- P2 And that'll do it from the arena. My goodness.
- P3 What a night! We'll see you next time!
- P2 Thanks for joining us from ringside, folks. Unbelievable stuff.
- P3 What a show! Goodnight, everybody!
- P2 We'll be back with more action real soon. Don't go far.
- P3 Another night you will NOT forget in this arena!
- P2 [exhales] And that's a wrap from the booth. I need a drink.
- P2 For Reg, for Seven, and for me, goodnight, everybody!
- R1 [deadpan] Broadcast complete. Thank you for watching. Booth unit entering standby.
- R1 [mechanical] That concludes tonight's violence. I will see you at the next one.

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
- +R1 [deadpan] Goodnight. Unit Seven, powering down. Do not unplug me, Reg.
- +R1 [mechanical] Thank you. I have logged every punch. I will be reviewing them all night.
- +R1 [deadpan] Sign-off acknowledged. Same time next fight. I do not sleep.

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
- P4 [shouting] Your winner, tonight, in this arena...
