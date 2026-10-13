# Battlebots live commentary: phrase bank (draft)

Two voices in the booth:

- **P, play-by-play.** The caller. Fast, punchy, reacts to every big moment and sets the scene. Think a veteran fight-night announcer: warm, sharp, gets loud when it matters.
- **C, colour.** The analyst. A retired robot builder and corner coach. Slower, wry, explains why something happened, notices damage and tactics, and jokes now and then.

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

- P3 Good evening, and welcome to fight night!
- P3 Ladies and gentlemen, welcome to the arena!
- P3 We are live, the house is full, and it is loud in here tonight!
- P2 Welcome back to the arena. Two machines, one ring, ninety-nine seconds.
- P3 Good evening, everybody! What a crowd we have tonight!
- P2 Welcome in, everybody. We've got a good one lined up for you.
- P3 It's fight night, and you can feel it in the building!
- P2 Evening, everyone. The lights are down, the ring is set, and the bots are on their way out.
- P3 Welcome to the main event!
- P2 Hello again from ringside, where the crowd has been on its feet for ten minutes already.
- P2 Welcome, everybody. Grab a seat, because this one could get ugly.
- P3 The arena is packed, the hydraulics are warm, and we are ready to go!
- P2 Good evening from the arena floor. Two bots, both looking for a statement win.
- P1 Welcome back, folks. Nice to have you with us.
- P2 Here we are again. Steel on steel, and a crowd that wants to see sparks.
- P3 Welcome to the loudest building in town!
- P2 Thanks for joining us. Plenty to talk about in this one.
- P2 Welcome, welcome, welcome. This is the one they've been waiting for.
- P3 It is time! Welcome to fight night!
- P2 Good evening. The crowd is in, the cameras are rolling, and the bots are making their way to the ring.
- P1 Evening, everyone. Settle in. This has the makings of a classic.
- P2 We are coming to you live from ringside, and it is electric in here.
- P2 Welcome back to the arena, where the only thing louder than the crowd is the metal.
- P3 What a night for a fight!
- P2 Welcome, everybody. The walkout is underway.
- P2 And we're back, live from the arena, with a fight that has everyone talking.
- P1 Good evening. Pull up a chair, this is going to be fun.
- P2 Welcome to ringside. If you just joined us, you picked a great time.
- P3 Here we go again, the lights are up and the place is shaking!
- P2 Evening, everyone. Two bots, a full house, and a referee who brought earplugs.

## `intro.reply` · Colour answers the welcome
**When:** right after `intro.welcome`.

- +C2 Glad to be here. I've been looking forward to this one all week.
- +C2 Thanks. I've got a feeling about this one.
- +C1 Good to be with you. Should be a fun night.
- +C2 Great to be here. You can smell the motor oil from up here.
- +C2 Happy to be here. And I'll say it now: this doesn't go the distance.
- +C2 Thanks for having me. I saw both of these bots in the workshop this week, and they look sharp.
- +C1 Always a pleasure. Let's see what they've got.
- +C2 Thanks. I think the crowd is going to get its money's worth.
- +C2 Good to be here. My ears are already ringing, and nobody's thrown a punch yet.
- +C1 Evening. I've got my notes, I've got my coffee, I'm ready.
- +C2 Glad to be back. The energy in here tonight is something else.
- +C2 Thanks. I spent twenty years building these things, and I still get nervous before the bell.
- +C2 It's good to be here. Both corners told me they're ready, but they always say that.
- +C1 Happy to be here. Hopefully nobody loses a head tonight.
- +C2 [laughs] Great to be here. I've got my money on a knockout.

## `intro.preview` · Colour sets up the fight
**When:** during the walkout, after the welcome.

- C2 What I want to see tonight is who controls the middle of the ring.
- C2 Both bots come in fresh, so the first thirty seconds will tell us a lot.
- C2 The key here is the jab. Whoever lands it first gets to set the pace.
- C1 Ninety-nine seconds isn't long. Nobody can afford a slow start.
- C2 I'd keep an eye on the legs tonight. Take the legs, and everything else follows.
- C2 Plating, power, footwork. Whoever wins two out of three wins the fight.
- C1 These machines are well matched on paper. Paper doesn't throw punches, though.
- C2 Look at the build on that chassis. That's a bot made to take a hit.
- C2 The head is the weak spot on both of these. Expect a lot of shots up top.
- C2 Neither of these bots likes going backwards. That's a recipe for fireworks.
- C1 The corners have done their homework. Now it's about execution.
- C2 What wins fights in here is patience. What wins crowds is the opposite.
- C2 If either of these gets caught on the ropes, it could be over in a hurry.
- C1 Stamina will matter. Throw too much early and the servos run hot late.
- C2 I'll be watching the guard. A tight guard keeps the head on the shoulders.
- C2 This ring is small. There's nowhere to hide for ninety-nine seconds.
- C2 Body work is the hidden story in these fights. It doesn't look like much, until it does.
- C1 Three knockdowns and it's stopped, so nobody wants to get dropped early.
- C2 Watch the kicks tonight. One clean kick to the knee joint changes everything.
- C2 Both teams have been working on their defence. I think we'll see a lot of slipping and countering.
- C1 Whoever's got the better engine in the last twenty seconds wins this.
- C2 I like a fight where both bots have something to prove. That's what we've got.
- C2 The bigger bot wants to make it ugly. The smaller one wants to make it long.
- C1 I've seen plenty of fights won by the bot that simply refused to stop throwing.
- C2 Watch the feet. Good footwork wins more fights than big punches.

## `intro.style.brawler` · A bot built to brawl
**When:** walkout, about a bot whose fight style is Brawler. Usually played right after its name clip.

- C2 This one's a brawler. It wants to stand in the pocket and trade.
- C2 Pure brawler. It walks forward, it throws heavy, and it doesn't care what comes back.
- C2 A brawler through and through. Expect it to eat a few to land a big one.
- C1 It's not subtle. It's a brawler, and it'll try to drag this into a phone booth.
- C2 Brawler. The game plan is simple: get close and swing.
- C2 This is a bot that likes a mess. If it turns into a slugfest, that suits it fine.
- C2 A brawler with heavy hands. One clean shot is all it needs.
- C1 Not much footwork, not much defence, lots of power. A classic brawler.

## `intro.style.swarmer` · A pressure fighter
**When:** walkout, Swarmer style.

- C2 This one's a swarmer. Relentless pressure, punches in bunches.
- C2 It's a pressure fighter. It wants to smother you and never let you breathe.
- C2 A swarmer. Expect it to come forward from the opening bell and not stop.
- C1 High output, high work rate. It wins by drowning the other bot in punches.
- C2 Swarmer style. The question is whether the engine holds up for ninety-nine seconds.
- C2 This bot fights like it's late for something. Non-stop pressure.
- C2 It's a swarmer, so it'll cut the ring off and work the body.
- C1 Busy, aggressive, always in your face. That's a swarmer.

## `intro.style.outfighter` · An out-fighter
**When:** walkout, Out-fighter style.

- C2 This one's an out-fighter. It wants distance, the jab, and long kicks.
- C2 A rangy out-fighter. It'll try to keep this at the end of its reach.
- C2 Out-fighter. Lots of movement, lots of jabs, and it hates getting crowded.
- C1 A technician. It'll pick shots from outside and make you miss.
- C2 It fights at range. If the other bot can't close the distance, this could be a long night for it.
- C2 Beautiful footwork on this one. Pure out-fighter.
- C2 It's an out-fighter, so watch for the push kick to keep the other bot off.
- C1 Patient, long, accurate. It'll win on points if it has to.

## `intro.style.counter` · A counter-puncher
**When:** walkout, Counter-puncher style.

- C2 This one's a counter-puncher. It waits for you to make a mistake.
- C2 A counter-puncher. Throw carelessly at this bot and you'll pay for it.
- C2 Counter-puncher. It's happy to let the other bot lead, then make it pay.
- C1 Very defensive, very patient. It lives off the other bot's mistakes.
- C2 It's a counter-puncher with a sharp eye. Slip, then fire back.
- C2 This bot reads the other one's shots and punishes them. Classic counter-puncher.
- C2 Don't let the slow start fool you. It's a counter-puncher, and it's watching.
- C1 Tight guard, quick hands, and a lot of patience. A dangerous counter-puncher.

## `intro.style.boxer` · An all-rounder
**When:** walkout, Boxer style.

- C2 This one's a boxer. Solid fundamentals, nothing flashy.
- C2 A well-rounded boxer. It can lead, it can counter, it can adapt.
- C2 It's a boxer. Good jab, good guard, good feet.
- C1 A bit of everything in this build. A proper all-rounder.
- C2 Textbook boxer. It'll try to win every exchange on technique.
- C2 It's a boxer, so it'll pick its moments and keep its shape.
- C2 Sound fundamentals on this bot. Nothing wasted.
- C1 It's a balanced fighter. No real weaknesses, but no single big weapon either.

## `intro.matchup` · Style clash
**When:** walkout, after both styles are known. The tag names the matchup.

- C2 {brawler-vs-outfighter} Classic matchup. The brawler wants it close, the out-fighter wants it long. Whoever sets the range wins.
- C2 {brawler-vs-outfighter} If the brawler can't get inside, it's going to spend all night eating jabs.
- C2 {swarmer-vs-counter} Pressure against patience. The swarmer has to be careful not to walk onto a counter.
- C2 {swarmer-vs-counter} The counter-puncher is going to get plenty of chances. The question is whether it can handle the volume.
- C2 {brawler-vs-brawler} Two brawlers. Nobody's taking a step back in this one.
- C2 {brawler-vs-brawler} [laughs] Two brawlers. I'd move back from the ropes if I were in the front row.
- C2 {swarmer-vs-swarmer} Two pressure fighters. Somebody has to go backwards eventually.
- C2 {outfighter-vs-outfighter} Two out-fighters. This might be a chess match early.
- C2 {counter-vs-counter} Two counter-punchers. Somebody has to lead, or we'll be here all night.
- C2 {boxer-vs-any} The boxer can adapt. The question is whether it can adapt fast enough.
- C2 {swarmer-vs-outfighter} The swarmer has to cut off the ring. The out-fighter has to keep moving. Fascinating.
- C2 {brawler-vs-counter} The brawler throws big, and the counter-puncher loves big. That's dangerous for the brawler.
- C2 {same-style} Mirror match tonight. Same style, so it comes down to who executes better.
- C1 {any} On paper this one's very close. I can't split them.
- C2 {any} Styles make fights, and I like these styles together.

## `intro.online` · Two real players
**When:** walkout of an online fight. {online}

- P2 {online} And tonight, two real players are in control of these corners.
- P2 {online} This is a live online match, folks. Two garages, two builds, one winner.
- P3 {online} We've got a head-to-head tonight. Two players, and bragging rights on the line!
- C2 {online} I love these. You never know what somebody's cooked up in the garage.
- C2 {online} Two players, two builds. Let's see whose homework pays off.
- P2 {online} An online showdown. Somebody's going home with a story to tell.
- C1 {online} Real opponents tonight. No scripts, no excuses.
- P2 {online} Live, head-to-head, and nobody wants to lose this one.
- C2 {online} Whoever built these bots, they know what they're doing.
- P2 {online} Two players, and only one of them gets the win screen.

## `intro.sponsor` · Sponsor reads
**When:** walkout, now and then. These are the made-up brands already on the arena boards.

- P2 Tonight's main event is brought to you by Voltcell. Power that hits back.
- P2 This bout is presented by Titan Full Synthetic motor oil.
- P2 Brought to you by Gearhead Pro Tools, with a lifetime warranty. They're going to need it tonight.
- P2 Fight night is fuelled by Robo Fuel. Zero sugar, maximum voltage.
- P2 Coverage tonight is brought to you by Orbit. Five G everywhere, even in here.
- P2 This fight is presented by Steelguard Insurance. We've got you covered.
- +C2 [laughs] Steelguard is going to have some claims to process after tonight.
- P1 Hungry? Bolt Burger. The double stack, four ninety-nine.
- P2 Brought to you by Skyline Airways. Fly further.
- P2 Stay cool with Frostbite. Ice cold cola.
- P2 Presented by Pixelforge. Their new game is out now.
- P2 Tonight's broadcast rolls on Kaiju Tires. Grip everything.

## `countdown.start` · Fighters to the centre
**When:** phase `countdown`.

- P2 The referee brings them to the centre.
- P2 Here we go. Final instructions from the referee.
- P3 Fighters ready!
- P2 Both corners clear the ring. This is it.
- P2 The referee checks with both corners.
- P2 Final checks done. We are moments away.
- P3 Here we go!
- P2 Lights down, crowd up. Let's do this.
- P2 They touch gloves... well, they touch fists.
- P2 And the crowd rises as we get set to begin.
- P1 Here we go, folks.
- P2 Ninety-nine seconds on the clock.
- P2 The bots square up.
- P3 Get ready!
- P2 It all comes down to this.

## `fight.start` · The bell
**When:** `fightStart`.

- P4 And we are underway!
- P3 There's the bell!
- P3 Here we go!
- P3 Fight!
- P3 And they're off!
- P3 We're underway in the arena!
- P2 There's the bell, and both bots come out quickly.
- P2 And we begin.
- P3 Let's go!
- P2 The fight is on.
- P2 Underway. Both bots meet in the centre.
- P3 There it is, the bell, and we're fighting!
- P2 And here we go, ninety-nine seconds of action.
- P2 They come out to the centre and start feeling each other out.
- P3 It's on!

## `fight.opening` · First seconds
**When:** first 5 s, if nothing big has landed yet.

- C2 Lots of feinting early. Both bots want to see what the other one does.
- C2 Nobody wants to make the first mistake.
- C1 Feeling-out process. Measuring the distance.
- C2 They're both being careful. Respect on both sides.
- C2 Look at that footwork early. Both bots looking for the angle.
- P2 Cautious start from both corners.
- C2 The first clean shot is going to tell us a lot.
- C1 Let's see who blinks first.
- P2 Plenty of movement, not much contact so far.
- C2 I expected one of them to rush out. Good discipline from both.

# Strikes

Reaction lines have to start within about 0.2 s of the hit, so they are short. Colour lines in this part play just after a big shot, once the caller is done.

## `hit.jab` · Jab lands
**When:** `hit`, move `jab`, not blocked. Plays rarely: jabs are constant, so only about one in six gets a call.

- P2 Nice jab.
- P2 Jab lands.
- P2 Sharp jab.
- P2 Stiff jab there.
- P2 Snapping the jab.
- P2 Popping the jab.
- P2 Another jab.
- P2 The jab is working.
- P2 Jab, right on target.
- P2 Good jab.
- P2 Double jab!
- P2 That jab keeps finding a home.
- P1 Jab.
- P1 Touching it up with the jab.
- C2 That jab is doing a lot of work.
- C2 The jab sets everything up. Keep throwing it.
- C1 Nice, simple jab. That's how you control distance.
- C2 Every time it jabs, the other bot's head snaps back.
- C2 It's living off the jab right now.
- C1 Jab, jab. Not pretty, but it scores.

## `hit.straight` · Cross or straight right lands
**When:** `hit`, move `cross` (straight rear hand), not blocked.

- P3 {right} Straight right!
- P3 {right} Big right hand!
- P3 {right} Right hand lands!
- P3 Straight down the middle!
- P3 Cross lands clean!
- P3 One-two!
- P2 {right} Right hand behind the jab.
- P3 Right on the button!
- P2 Good straight shot.
- P3 Down the pipe!
- P2 Threads the needle with the cross.
- P3 {right} Pow! Right hand!
- P2 {right} Straight right gets through.
- P3 Right through the guard!
- P2 Nice cross.
- C2 Right down the centre line. The guard was too wide.
- C2 That one-two is perfect boxing.
- C2 {right} Every time that right hand comes, it's landing.

## `hit.hook` · Hook lands
**When:** `hit`, move `leadHook` or `rearHook`, not blocked.

- P3 {left} Left hook!
- P3 Big hook!
- P3 Hook lands!
- P3 Wrapped around the guard!
- P3 Hook to the head!
- P3 What a hook!
- P2 Short hook on the inside.
- P3 {right} Right hook!
- P3 Lands the hook!
- P2 Nice hook.
- P3 Swinging hook, and it lands!
- P2 Hook around the side.
- P3 Oh, clean hook!
- P3 Turned it over on that hook!
- P2 Tight little hook.
- C2 Beautiful hook. It came around the side where the guard couldn't see it.
- C2 That hook came from nowhere.
- C2 It's been setting up that hook with the jab all fight.
- C1 Short, tight hook. No wasted motion.
- C2 You don't see that hook coming. That's what makes it so dangerous.

## `hit.uppercut` · Uppercut lands
**When:** `hit`, move `leadUpper` or `rearUpper`, not blocked.

- P3 Uppercut!
- P3 Big uppercut!
- P3 Uppercut lands!
- P3 Right up the middle!
- P3 Uppercut snaps the head back!
- P3 Ooh, uppercut!
- P2 Short uppercut on the inside.
- P3 Up and through the guard!
- P3 What an uppercut!
- P2 Nice uppercut.
- P3 Lifts it right off its feet!
- P2 Uppercut finds the gap.
- C2 Right between the gloves. Textbook uppercut.
- C2 It was leaning forward, and the uppercut was waiting for it.
- C2 Uppercuts are made for that range. Perfect choice.
- C1 That uppercut is short, it's quick, and it's hard to see.

## `hit.overhand` · Haymaker lands
**When:** `hit`, move `haymaker`, not blocked.

- P4 Haymaker!
- P4 Huge overhand!
- P3 {right} Overhand right!
- P4 Swung from the basement!
- P3 Big looping shot lands!
- P4 What a haymaker!
- P3 Over the top!
- P4 Everything on that one!
- P3 Wild swing, and it connects!
- P3 Overhand crashes in!
- C2 It threw that from the parking lot, and it still landed.
- C2 That's a big, wild swing. Risky, but it paid off.
- C2 [laughs] Telegraphed it from a mile away, and it still worked!
- C2 When it lands, the haymaker ends fights.

## `hit.body` · Body shot lands
**When:** `hit` to a body zone (chest or torso), not blocked.

- P2 Body shot!
- P3 Goes to the body!
- P3 Digs to the body!
- P2 Hook to the ribs.
- P3 Right to the midsection!
- P2 Down to the body.
- P3 Deep body shot!
- P2 Works the body.
- P3 Rips one to the chassis!
- P2 Underneath, to the body.
- P3 Body shot lands flush!
- P2 Investing downstairs.
- C2 Smart work to the body. That chest plate won't hold up forever.
- C2 Body shots don't make the highlight reel, but they win fights.
- C2 Kill the body and the head will follow. Oldest rule in the book.
- C2 Every body shot rattles that core. You can hear it.
- C1 Good body work. That pays off in the last thirty seconds.
- C2 It's chopping down the tree. Body, body, body.

## `hit.solid` · Clean shot, generic
**When:** `hit` that isn't a jab, not blocked, medium damage, when no move-specific line is free.

- P3 Lands!
- P3 Clean shot!
- P3 Got it!
- P2 Nice shot.
- P3 That landed!
- P3 Good connection!
- P2 Gets one in.
- P3 Right on target!
- P3 Scores with that one!
- P2 Lands clean.
- P2 That one got through.
- P3 Finds the target!
- P3 There it is!
- P2 Nice.
- P3 Oh, good shot!
- P2 Lands a good one.
- P3 Snaps it back!
- P2 Connects.
- P3 Pop!
- P3 Bang!

## `hit.big` · Heavy shot
**When:** `hit` with high damage (`heavy`), not blocked, no knockdown.

- P4 Oh, what a shot!
- P4 Huge shot!
- P4 Massive!
- P4 What a hit!
- P4 Oh my!
- P4 Oh, that's a big one!
- P4 Crushing shot!
- P4 Boom!
- P4 Ohhh!
- P4 Hammered!
- P4 That one landed with everything!
- P3 That one shook the ring!
- P4 Flush!
- P3 Heavy, heavy shot!
- P4 Oh, did you hear that?
- P4 Sparks flying!
- P3 That rattled it!
- P4 What a blow!
- P3 Oh, that's going to leave a mark!
- P4 Right on the money!
- P3 Thunderous shot!
- P4 Bang! Big shot!
- P3 That one echoed around the building!
- P4 Oh, it felt that one!
- P3 You could hear that one in the back row!
- C2 That's the hardest shot of the fight so far.
- C2 Oh, that's a dent. That's going to need a hammer after the fight.
- C2 You don't just walk through a shot like that.
- C2 I felt that one up here.
- C2 That's the kind of shot that changes a fight.
- C2 Pure power. Nothing technical about it, just power.
- C3 Oh, that one hurt!
- C2 Whoever's in that corner is wincing right now.
- C2 That's going to show up on the damage report.
- C1 Well. That'll do it.

## `hit.crit` · Critical hit
**When:** `hit` with `crit`, not blocked.

- P4 Critical hit!
- P4 Right on the weak spot!
- P4 Perfect shot!
- P4 Right on the sweet spot!
- P3 Found the gap in the armour!
- P4 Pinpoint!
- P3 Right through the seams!
- P4 Direct hit!
- P3 Couldn't have placed that any better!
- P4 Bullseye!
- C2 Right between the plates. That's precision.
- C2 It found a joint. That's where the damage really goes in.
- C2 That's not luck. That's aim.
- C2 You can armour everything except the seams, and it found the seam.
- C1 Perfect placement. Nothing you can do about that.

## `hit.counter` · Counter punch
**When:** `hit` with `counter`, not blocked.

- P4 Counter!
- P3 Countered!
- P4 {right} Counter right!
- P3 Caught it coming in!
- P3 Beat it to the punch!
- P4 Right on the counter!
- P3 Times it perfectly!
- P3 Walked right into that!
- P3 Made it pay!
- P4 Countered beautifully!
- P3 Slip and counter!
- P2 Catches it on the way in.
- P3 Punished!
- C2 That's timing. It saw that coming a mile away.
- C2 It walked right onto that one. Running into a punch doubles the damage.
- C2 Lovely counter. Let it commit, then fire.
- C2 That's what happens when you throw lazy. You get countered.
- C2 It's been waiting for that all fight.
- C2 You can't keep throwing the same shot. It's reading it now.
- C1 Perfect timing. That's years of training in one punch.
- C2 Patience pays off. That's a counter-puncher's dream.
- C2 It baited that one. Showed an opening, then took it away.

## `special.flurry` · Piston Rush lands
**When:** `hit`, move `flurry`.

- P4 Piston Rush!
- P3 Here comes the Piston Rush!
- P4 Rapid fire!
- P3 Machine-gun punches!
- P4 Pistons firing!
- P3 A blur of fists!
- P4 Look at the hand speed!
- P3 Unloading with the Piston Rush!
- C2 You can't block all of those. Some are getting through.
- C2 That's six punches in a second. The guard just can't keep up.
- C2 Those pistons are pumping. That's what that build was made for.

## `special.shock` · Shock Uppercut lands
**When:** `hit`, move `shockUpper`.

- P4 Shock Uppercut!
- P4 Electrified!
- P3 It's lit up!
- P4 Zapped!
- P3 Shock uppercut connects!
- P4 The sparks are flying!
- P3 Circuits fried on that one!
- C2 That shock scrambles the systems. It'll be slow to react for a second.
- C2 [laughs] I think the arena lights flickered on that one.
- C2 That's the shock module. It stuns everything it touches.

## `special.rocket` · Rocket Punch lands
**When:** `hit`, move `rocketPunch`.

- P4 Rocket Punch!
- P4 The fist launches!
- P4 Rocket fist!
- P3 Fired from range!
- P4 Look at the reach on that!
- P3 It flew across the ring!
- P4 Launched!
- P3 Rocket punch lands clean!
- C2 You think you're out of range, and then the fist comes off.
- C2 That extension is unfair. I love it.
- C2 It caught it from three metres. Nowhere to hide from that.

## `special.hammer` · Guard Breaker lands
**When:** `hit`, move `hammer`.

- P4 Guard Breaker!
- P4 Hammer fist!
- P3 Smashed right through the guard!
- P4 Brings the hammer down!
- P3 Crashing down from above!
- P4 Hammer time!
- P3 Down comes the hammer!
- C2 You can't block that one. It goes straight through your arms.
- C2 Sometimes you just have to break the door down.
- C2 That's what the Guard Breaker does. Shell up all you want.

## `special.whiff` · Special move misses
**When:** `whiff` with an ability move.

- P3 Misses with the big one!
- P2 Swings and misses.
- P3 All that power, and nothing there!
- P2 Big swing, nothing but air.
- P3 Wasted the special!
- P2 Off target.
- P3 Missed it!
- C2 That's on cooldown now. Big window to attack.
- C2 Burned the special for nothing. That hurts.
- C2 Too much telegraphing. It saw that coming.
- C2 [laughs] That would have ended the fight if it landed. It didn't land.
- C1 Wasted. That was the wrong moment to throw it.

## `miss.whiff` · Big miss
**When:** `whiff` on a power punch or kick (not jabs). Rare.

- P2 Misses.
- P2 Short.
- P2 Swing and a miss.
- P2 Nothing there.
- P3 Wide!
- P2 Falls short.
- P2 Too far.
- P2 Over the top.
- P3 Whiffs!
- P2 Can't find the range.
- C2 It's loading up too much. You can see them coming.
- C2 Missing like that burns energy. That adds up.
- C1 Measuring the distance. It'll find it.

## `defence.dodge` · Slips a shot
**When:** `dodge`.

- P3 Slipped it!
- P3 Ducks under!
- P3 Makes it miss!
- P2 Nice slip.
- P3 Rolled under it!
- P3 Head movement!
- P2 Swayed back.
- P3 Not there!
- P2 Moves out of the way.
- P3 Leans out of range!
- P3 Dodged!
- P3 Too quick!
- P2 Slips inside.
- P3 Look at that defence!
- P2 Gone.
- P3 Matrix!
- P3 Evaded!
- P2 Weaves under it.
- C2 Lovely defence. Just enough, nothing more.
- C2 Look at that head movement. Hard to hit a moving target.
- C2 Made it miss by a centimetre. That's confidence.
- C2 That's frustrating for the other corner. Throwing hard and hitting nothing.
- C2 Gorgeous slip. And now it's in perfect position to counter.
- C1 Reading everything right now.
- C2 It's slippery tonight. Like trying to punch smoke.
- C2 It saw that one coming before it was thrown.

## `defence.dodge.special` · Dodges a special
**When:** `dodge` against an ability move.

- P4 Dodged the special!
- P3 Saw it coming!
- P4 Slipped the big one!
- P3 Avoided the special move!
- C2 That special is on cooldown now. Window's open.
- C2 Huge dodge. That would have been a game-changer.

## `defence.block` · Shot blocked
**When:** `hit` with `blocked`, not a guard break. Plays now and then.

- P2 Blocked.
- P2 Good guard.
- P2 Takes it on the arms.
- P2 Caught on the gloves.
- P2 Shelled up.
- P2 Tight defence.
- P2 Off the forearms.
- P2 Blocked well.
- P2 Nothing gets through.
- P2 Arms up, takes it there.
- P2 Covered up.
- C2 Good high guard. Nothing's getting through clean.
- C2 Those forearms are taking a beating though. Watch the arm damage.
- C2 Blocking all day is fine, but you still have to throw back.
- C1 Solid defence. Just keep the hands up.
- C2 It's walking in behind the guard. Very disciplined.

## `defence.guardbreak` · Guard broken
**When:** `hit` with `guardBreak`.

- P4 Guard broken!
- P4 Smashed through the guard!
- P3 The guard's down!
- P4 Broke right through!
- P3 Arms knocked aside!
- P3 The guard collapses!
- P4 Wide open now!
- P3 Through the defence!
- C2 That guard is gone. Now it's wide open.
- C2 You can only block so long before the arms give up.
- C2 Big moment. Without that guard, it's in real trouble.

## `defence.shield` · Shield absorbs it
**When:** `hit` with `shielded`.

- P2 Shield takes it!
- P3 Absorbed by the shield!
- P2 Shield's up.
- P2 Bounces off the shield.
- P3 The shield holds!
- C2 That shield is buying it time.
- C2 Nice. The shield soaked all of that.

## `combo.three` · Three-hit combination
**When:** the same bot lands its third hit in a row (CrowdMood's combo counter hits 3).

- P3 Combination!
- P3 Puts it together!
- P3 One, two, three!
- P3 Lovely combination!
- P3 Strings them together!
- P3 Three in a row!
- P3 Flurry of shots!
- P3 Look at this combination!
- P3 Putting punches in bunches!
- P3 Lands them all!
- P2 Nice combination there.
- P3 Starting to pour it on!
- P3 Keeps the punches coming!
- C2 Beautiful combination. Every shot set up the next one.
- C2 That's why you drill combinations in the workshop.
- C2 Head, body, head. Textbook.
- C2 Doesn't give it a second to recover.

## `combo.five` · Five-plus hit run
**When:** combo counter reaches 5 or more.

- P4 It's teeing off!
- P4 Unloading!
- P4 Pouring it on!
- P4 It can't miss right now!
- P4 Everything's landing!
- P4 Shot after shot after shot!
- P4 Relentless!
- P4 A barrage!
- P4 It's a beatdown!
- P4 Unanswered shots!
- P4 Somebody stop this!
- P4 Look out, here it comes again!
- C3 It has to fire back or get out of there!
- C3 Get out of there! Tie up, move, anything!
- C2 That's a lot of unanswered punches. The referee's watching closely.
- C3 Its corner must be screaming right now!

## `stagger` · Rocked
**When:** `stagger`.

- P4 It's hurt!
- P4 It's wobbled!
- P4 Rocked!
- P4 It's in trouble!
- P4 The legs are gone!
- P4 Staggered!
- P4 Hurt it!
- P4 It's on wobbly legs!
- P4 Stunned!
- P4 Big trouble here!
- P3 Stumbling backwards!
- P4 It's reeling!
- P3 The systems are scrambled!
- P4 It's out on its feet!
- P3 It doesn't know where it is!
- P4 Can it survive this?
- P3 Looks shaky!
- P4 It's all over the place!
- P4 Hurt bad!
- P3 Gyros are spinning on that one!
- C3 Finish it! This is the moment!
- C3 Now's the time! Go for the finish!
- C2 Its balance is gone. One more and it's down.
- C2 The gyroscope took that one. Look at the legs.
- C2 It has to survive the next few seconds.
- C2 Covering up is the only option now.
- C2 That shot scrambled something inside.
- C3 Its corner is begging it to hold on!

# Kicks

## `kick.push` · Push kick lands
**When:** `hit`, move `pushKick`.

- P3 Push kick!
- P3 Front kick sends it back!
- P3 Teep to the body!
- P3 Shoves it away with the kick!
- P2 Push kick to create space.
- P3 Kicked across the ring!
- P3 Foot to the chest!
- P2 Pushes it off with the front kick.
- P3 Sends it flying back!
- C2 Smart. Use the push kick to reset the distance.
- C2 That push kick is like a jab with your leg. Keeps everybody honest.
- C2 It didn't like being crowded, so it kicked the problem away.

## `kick.round` · Roundhouse lands
**When:** `hit`, move `roundhouse`.

- P4 Roundhouse!
- P4 Head kick!
- P4 What a kick!
- P3 Roundhouse lands!
- P4 Kick to the head!
- P3 Whipped that one in!
- P4 Shin across the head!
- P3 High kick!
- P3 Swinging kick connects!
- P4 Boom, roundhouse!
- P3 Roundhouse to the body!
- P3 Kicks it in the ribs!
- C2 Look at the hip rotation on that. Perfect form.
- C2 A kick like that carries three times the power of a punch.
- C2 It didn't see the kick coming. Too focused on the hands.
- C2 That's the payoff for all the punches. Now it's open for the kick.

## `kick.low` · Low kick to the leg
**When:** `hit`, move `lowKick`.

- P3 Low kick!
- P3 Chops the leg!
- P3 Kick to the thigh!
- P3 Calf kick!
- P2 Low kick lands.
- P3 Right on the knee joint!
- P3 Attacking the legs!
- P2 Another kick to the leg.
- P3 Chopping it down!
- P3 Leg kick!
- C2 It's going after that leg. Smart, smart work.
- C2 Every leg kick slows it down a little more.
- C2 Take the legs, take the mobility, take the fight.
- C2 That knee joint is starting to complain.
- C2 You won't see it right away, but those low kicks add up.
- C1 Chopping down the tree. Patient, ugly, effective.

## `kick.spin` · Spinning Heel lands
**When:** `hit`, move `spinKick`.

- P4 Spinning heel kick!
- P4 Spinning kick!
- P4 Oh my, spinning back kick!
- P4 Off the spin!
- P4 What a kick!
- P4 Spun around and nailed it!
- P4 Unbelievable!
- P3 Spinning heel lands!
- C3 Highlight reel! That's going to be everywhere tomorrow!
- C2 You do not expect that from a bot that size.
- C2 [laughs] I've been building robots for twenty years, and that still amazes me.
- C2 Risky move. If it misses, you've given up your back. It didn't miss.

## `kick.knee` · Jet Knee lands
**When:** `hit`, move `flyingKnee`.

- P4 Flying knee!
- P4 Jet Knee!
- P4 It's airborne!
- P4 Knee to the head!
- P3 Jets fire, and the knee lands!
- P4 Up and over with the knee!
- P3 Launched into the knee!
- C2 Those jets give it serious lift. Nasty, nasty shot.
- C2 You don't see many bots willing to leave the ground. That one did, and it paid off.
- C2 That knee is the most dangerous shot in its arsenal.

## `kick.sweep` · Sweep connects
**When:** `hit`, move `sweep` (the trip itself is under `knockdown.sweep`).

- P3 Low sweep!
- P3 Sweeps the legs!
- P3 Kicked the legs out!
- P3 Takes out the ankle!
- P2 Sweep connects.
- C2 Good sweep. Keeps it guessing what's coming next.

## `kick.blocked` · Kick checked or blocked
**When:** `hit`, a kick, `blocked`.

- P2 Kick checked.
- P2 Blocks the kick.
- P2 Caught it on the arm.
- P2 Arms take the kick.
- P2 Kick blocked.
- C2 Good check. That's a painful one for the kicker.
- C2 It's reading the kicks now. Need to mix it up.

# Knockdowns

## `knockdown.first` · First knockdown of the fight
**When:** the first `knockdown` of the fight (not a sweep). Fires instead of `knockdown.any`.

- P4 Down goes the bot! Down goes the bot!
- P4 It's down! First knockdown of the fight!
- P4 Knockdown! Oh my goodness!
- P4 Dropped! It's down!
- P4 And it's down! What a shot!
- P4 Down it goes!
- P4 It drops! First blood!
- P4 Knockdown! It's flat on the canvas!
- P4 Down! Down! It's down!
- P4 Oh, it's down! What a shot!
- P4 And that's a knockdown!
- P4 It hits the deck!
- P4 Timber! Down it goes!
- P4 First knockdown of the night!
- P4 Ohhh, it's down!
- C3 Out of nowhere! I didn't see that coming!
- C3 That's the first one. Two more and it's over.
- C3 Did you see the way it fell? That's a heavy shot.
- C2 First knockdown, and the momentum has just swung completely.

## `knockdown.any` · Knockdown
**When:** `knockdown` (not the first, not a sweep).

- P4 Down again!
- P4 It's down!
- P4 Knockdown!
- P4 Down it goes again!
- P4 Dropped again!
- P4 It's on the canvas!
- P4 Down! It's down!
- P4 Floored!
- P4 Knocked flat!
- P4 And it's down again!
- P4 Another knockdown!
- P4 Back on the canvas!
- P4 Down hard!
- P4 Sent to the floor!
- P4 Leveled!
- P4 Smashed to the canvas!
- P4 Down! What a shot!
- P4 It's dropped!
- P3 Down and hurt!
- P4 Crumbles to the canvas!
- C3 It's taking a beating now!
- C3 That's two! One more and it's a TKO!
- C2 It can get up from that, but how many more can it take?
- C3 Every knockdown takes a little more out of it.
- C3 What a shot! I didn't think it had that much power.

## `knockdown.second` · Second knockdown, one from TKO
**When:** `knockdown` when the downed bot now has 2 knockdowns.

- P4 That's two! One more and it's over!
- P4 Down for the second time!
- P4 Two knockdowns now! It's on the brink!
- P4 Down again! That's the second!
- P4 Second knockdown! One more ends it!
- C3 One more knockdown and the referee waves it off!
- C3 It's hanging on by a thread now!
- C2 It needs to survive. Grab, hold, anything.
- C2 Two down. Its corner has to be thinking about the towel.

## `knockdown.kick` · Knocked down by a kick
**When:** `knockdown` from a kick (`move.kind === 'kick'`). Picked over the generic lines half the time.

- P4 Kicked down!
- P4 Kick to the head, and it's down!
- P4 The kick drops it!
- P4 Leveled by the kick!
- C3 What a kick! That's the shot of the night!
- C2 Never saw it coming. Too busy watching the hands.

## `knockdown.counter` · Knocked down by a counter
**When:** `knockdown` on a `counter` hit.

- P4 Countered and down!
- P4 Walked right into it, and it's down!
- P4 Caught coming in! Down it goes!
- C3 Walked straight into it! That's the danger of rushing in!
- C2 Running into a counter is like running into a wall.

## `knockdown.sweep` · Swept off its feet
**When:** `knockdown` from a sweep trip (doesn't count as a knockdown).

- P3 Swept!
- P3 Sweeps the legs!
- P3 Swept off its feet!
- P3 Legs taken out!
- P3 Trip! It's on the floor!
- P3 Upended!
- P3 Taken off its feet!
- P3 Down it goes on the sweep!
- P2 Swept to the canvas.
- C2 That doesn't count as a knockdown, but it's embarrassing.
- C2 [laughs] Look at that. Legs straight up in the air.
- C2 Sweeps are great for momentum. The crowd loves it.
- C2 Good sweep. It gets a free second while the other one gets back up.
- C1 That's a slip, not a knockdown. No count.

## `down.count` · While a bot is down
**When:** during the referee's count, 1 to 2 s after a knockdown, if nothing else is speaking.

- P3 The referee is counting!
- P3 Can it get up?
- P3 Will it beat the count?
- P3 It's trying to get up!
- P3 It's moving! It's trying!
- P2 The count is on.
- P3 Get up, get up!
- P3 It's still down!
- P2 It's slow to rise.
- P3 Its systems are rebooting!
- C3 Get up! Come on!
- C2 Take your time. Use the count.
- C2 The legs are moving. It's trying.
- C2 The question is whether there's any power left.
- C2 Its corner is yelling at it to get up.
- C2 The gyroscope needs a second to recalibrate.
- C3 It has to get up! This can't be the end!
- C2 That's a lot of damage. I'm not sure it gets up from this one.

## `getup` · Beats the count
**When:** `getUp` (not after the third knockdown).

- P3 It's up!
- P3 Back on its feet!
- P3 It beats the count!
- P3 Up it gets!
- P3 Back up!
- P3 It's not done yet!
- P3 What heart!
- P3 Gets back up!
- P3 Up and ready!
- P3 It's back in this!
- P2 Up at the count.
- P3 It's not finished!
- P3 Climbing back up!
- P3 It wants more!
- P3 Look at the resilience!
- P2 Slowly back on its feet.
- C2 Incredible toughness.
- C2 Now it has to survive the next ten seconds.
- C2 Heart of steel. Literally.
- C2 Back up, but is it really recovered?
- C2 The legs look shaky. Its opponent will smell blood.
- C2 Good for it. But that took a lot out of it.
- C2 Built tough. That's good engineering.
- C2 Fight's not over. Not even close.
- C3 You cannot count this one out!
- C1 Back up. Now cover up and clear your head.

## `getup.last` · Up after two knockdowns
**When:** `getUp` and the bot has 2 knockdowns.

- P3 It's up, but one more knockdown ends it!
- P3 Back up, living on the edge!
- P3 It beats the count again, but it's in deep trouble!
- C2 One more and the referee stops it. It has to be careful now.
- C2 It's fighting on borrowed time.
- C2 Survive. That's all it can think about right now.
- C3 You've got to admire the heart. You really do.

## `taunt` · Showboating over a downed opponent
**When:** a taunt emote starts during the count, or the brain's `taunt` event.

- P3 Showboating!
- P3 Look at this! It's playing to the crowd!
- P3 Taunting!
- P2 A little bit of showmanship there.
- P3 Rubbing it in!
- P3 It's soaking it up!
- P2 The crowd loves that.
- C2 [laughs] Bit of showmanship. I like it.
- C2 Careful. The fight's not over yet.
- C2 That's confidence. Or arrogance. Hard to tell with robots.
- C2 The crowd is eating that up.
- C2 I'd save the celebrating for later, but I understand it.
- C1 Programmed with an ego. Somebody had fun in the garage.
- C2 [laughs] That's just disrespectful. I love it.

# Battle damage

## `wear.dented` · A part takes its first real damage
**When:** `wear` level 0 (a part drops below 70%). Mostly colour, and only if nobody's talking.

- C2 There's the first real dent.
- C2 You can see the plating starting to buckle.
- C2 That armour is starting to show some damage.
- C1 First scratches in the paint. It won't be the last.
- C2 That spot is taking a lot of punishment.
- C2 Dents are showing now. The corner will be worried about that.
- C2 That part's been hit a few too many times.
- C1 Those dents are cosmetic for now. For now.
- C2 The paint is coming off. That's never a good sign.
- C2 Look at the damage building up there.

## `wear.head` · Head badly damaged
**When:** `wear` level 1 on the head.

- P3 The head is hanging on by a thread!
- P3 Look at the head! It's barely attached!
- P3 The head is loose!
- C3 One more clean shot and that head comes clean off!
- C2 The neck joint is shot. That's the danger zone.
- C2 The head is wobbling. It needs to protect that at all costs.
- C2 I can see wires. That's not good.
- C2 That head is in rough shape. The opponent will be aiming right there.
- C2 If I were in that corner, I'd be very worried about the head.
- C1 That's not a dent anymore. That's structural damage.

## `wear.chest` · Chest caving in
**When:** `wear` level 1 on the chest.

- P3 The chest plate is caving in!
- P3 The core is leaking!
- C2 That chest plate is crumpled. The core is exposed.
- C2 Every body shot is going straight into the core now.
- C2 That's coolant leaking. Not ideal.
- C2 The chest armour has given up. Power will start dropping.
- C1 You can't fix that mid-fight. It just has to hold on.
- C2 That's a lot of damage to the core. You'll see it slow down.

## `wear.torso` · Waist buckling
**When:** `wear` level 1 on the lower torso.

- P3 The waist is buckling!
- P2 The midsection is badly damaged.
- C2 The waist joint is bending the wrong way. That's going to hurt the power.
- C2 It can't rotate properly now. No rotation, no power.
- C2 That lower torso has taken a pounding.
- C1 Look at the way it's leaning. Something's bent in there.

## `wear.arm` · Arm coming apart
**When:** `wear` level 1 on an arm part.

- P3 The arm is coming apart!
- P3 That arm is in bad shape!
- C2 That arm is barely holding on. One more and it's gone.
- C2 It's been blocking with that arm all fight, and now it's paying for it.
- C2 Watch the arm. The joint is shot.
- C2 It'll have to fight with one hand soon if it's not careful.
- C2 The servo in that arm is grinding. You can hear it from here.
- C1 That's what happens when you block everything with the same arm.

## `wear.leg` · Leg barely holding
**When:** `wear` level 1 on a leg part.

- P3 The leg is barely holding on!
- P3 That leg is badly damaged!
- C2 The leg is shot. Look at the limp.
- C2 It's dragging that leg. All those kicks paid off.
- C2 Without that leg, there's no footwork. It's a sitting duck.
- C2 If that leg goes, the fight goes with it.
- C2 The knee joint is done. It can barely put weight on it.
- C1 You can see it favouring that leg now.

## `wear.wrecked` · Fist or foot destroyed
**When:** `wear` level 2 on a fist or foot.

- P3 The fist is shattered!
- P3 The foot is crushed!
- P2 That fist is wrecked.
- C2 Broke the hand on that one. It won't punch as hard now.
- C2 That foot is crushed. Good luck kicking with that.
- C2 That fist is mangled. That'll take some repairs.
- C1 It's fighting with a broken hand now. That takes guts.

## `detach.arm` · Arm torn off
**When:** `detach` of an upper arm or forearm, not fatal.

- P4 The arm is off!
- P4 Ripped the arm clean off!
- P4 There goes the arm!
- P4 The arm is gone!
- P4 Tore it right off!
- P4 Arm ripped away!
- P4 Oh my! The arm went flying!
- P4 It's lost an arm!
- P4 Dismembered!
- P4 That arm just flew into the crowd!
- P4 The forearm is gone!
- P4 Torn off at the joint!
- C3 Unbelievable! It's fighting one-armed now!
- C3 Somebody duck! That arm is heading for the third row!
- C2 It's down to one arm now. That changes everything.
- C2 One arm left. It has to be very careful now.
- C2 It's going to have a hard time defending on that side.
- C2 That's a lot of repair work after tonight.
- C2 [laughs] I hope they kept the receipt for that arm.
- C3 It's still fighting! One arm and it's still fighting!

## `detach.leg` · Leg torn off (not fatal)
**When:** `detach` of a shin or foot, not fatal.

- P4 The leg is gone!
- P4 Ripped off the lower leg!
- P4 It's lost a foot!
- P4 Kicked right off!
- C3 How is it still standing?
- C2 Balance is going to be a problem now.
- C2 It's hopping now. This could be over very soon.

## `detach.fatal.head` · Head off: DISMANTLED
**When:** `detach` fatal `head`, or `ko` with reason `head`.

- P4 The head is off! The head is off!
- P4 Decapitated! It's over!
- P4 It took the head clean off!
- P4 Off with its head! Unbelievable!
- P4 The head goes flying! That's the end!
- P4 Oh my! The head! It's gone!
- P4 Head ripped off! Dismantled!
- P4 Headless! It's over!
- P4 Knocked the head clean off its shoulders!
- P4 Unbelievable! The head is in the crowd!
- C3 I have never seen anything like it!
- C3 That's the most brutal finish you'll ever see!
- C3 Somebody go get that head! It's in the stands!
- C3 That's not a knockout, that's a demolition!
- C2 [laughs] Well, that's one way to win a fight.
- C3 Dismantled! Totally dismantled!
- C2 The neck had been loose for a while. It finally gave out.
- C2 That's going to need more than a wrench.

## `detach.fatal.leg` · Leg gone: DISMANTLED
**When:** fatal `leg`.

- P4 The leg is gone! It can't stand!
- P4 It's down for good! The leg's been destroyed!
- P4 Leg ripped off! It's over!
- P4 Dismantled! It can't get back up!
- P4 Can't stand without that leg! It's finished!
- C3 No leg, no fight! That's it!
- C2 All those low kicks paid off in the end.
- C2 It chopped that leg down all fight, and now the tree has fallen.
- C3 It's done! It has nothing to stand on!

## `detach.fatal.arms` · Both arms gone: DISMANTLED
**When:** fatal `arms`.

- P4 Both arms gone! It's over!
- P4 No arms left! It can't fight!
- P4 Disarmed! Completely disarmed!
- P4 It has nothing left to fight with!
- P4 Dismantled! Both arms are off!
- C3 No arms, no fight! The referee has to stop it!
- C2 [laughs] I'd call that disarmed.
- C3 Taken apart piece by piece!

# Fight flow

## `ropes.pinned` · Pinned against the ropes
**When:** `ropes` with strong force, the bot is pushed into them.

- P3 Into the ropes!
- P3 Pinned against the ropes!
- P3 Backed up to the ropes!
- P2 On the ropes now.
- P3 Nowhere to go!
- P3 Trapped against the ropes!
- P3 Bounces off the ropes!
- P2 Pushed back into the ropes.
- P3 Cornered!
- P3 Trapped in the corner!
- P3 Stuck on the ropes!
- P3 Driving it into the corner!
- C2 Get off the ropes! You can't fight from there!
- C2 Bad place to be. No room to move.
- C2 The ropes are not your friend in this fight.
- C2 It has to slide out of there. Circle out, circle out.
- C2 Good ring control, cutting off the angles.
- C2 It's trapped. Time to let the hands go.
- C1 That's not where you want to be.
- C2 Ropes absorb some of the power, but they also take away your escape.

## `brain.switch` · Switches stance
**When:** brain `switch`.

- P2 Switching stance.
- P2 Switches to southpaw.
- P2 Back to orthodox.
- P2 Changes stance now.
- C2 Switching stance to give a different look. Smart.
- C2 That stance switch throws off the timing.
- C2 It's trying something new. It wasn't working the other way.
- C1 Interesting adjustment from that corner.

## `brain.retreat` · Backs off to reset
**When:** brain `retreat`.

- P2 Backing off.
- P2 Retreats to reset.
- P2 Gives some ground.
- P2 Steps back to regroup.
- P2 Taking a breather.
- C2 Good decision. Reset and come back fresh.
- C2 It needs a moment. That last exchange took a lot out of it.
- C2 Backing up isn't losing. It's thinking.
- C1 Smart. Get out of the danger zone.
- C2 It wants no part of that exchange.

## `brain.rally` · Coming forward again
**When:** brain `rally` (was behind, now pressing).

- P3 It's coming forward again!
- P3 Look at this! It's fighting back!
- P3 Not giving up!
- P3 Here comes the response!
- P3 Firing back now!
- P3 The fightback is on!
- P3 It's taking the fight to its opponent!
- C2 That's the response its corner wanted.
- C2 Behind on damage, but it's not going quietly.
- C3 This is a fight now!
- C2 Look at the change in body language. Something clicked.
- C2 It has nothing to lose now. That makes it dangerous.

## `brain.read` · Reads a shot
**When:** brain `read`.

- P3 Read it!
- P3 Saw that coming!
- P2 Anticipated that one.
- P3 Knew it was coming!
- C2 It's reading the patterns now. That's dangerous.
- C2 That bot has done its homework.
- C2 It knew that shot was coming before it was thrown.
- C2 Too predictable. You can't throw the same thing over and over.
- C1 Experience. It's seen that one before.

## `brain.furious` · Gets angry
**When:** brain `adapt` (furious after a big hit).

- P3 It looks furious!
- P3 That woke it up!
- P3 Now it's angry!
- C2 Uh oh. You just made it angry.
- C2 That shot lit a fire. Watch out now.
- C2 It's going to come out swinging. That can be good or bad.
- C2 Emotions running high. Got to stay composed.
- C1 Anger makes you sloppy. Let's see if it keeps its head.

## `lull.boo` · Nothing landing, crowd restless
**When:** CrowdMood's lull (7 s with nothing landing).

- P2 The crowd is getting restless.
- P2 Some boos starting to ring out.
- P2 Not much happening right now.
- P2 The fans want some action.
- P2 Plenty of feinting, not much landing.
- P2 A bit of a stalemate here.
- C2 Somebody has to make something happen.
- C2 The crowd paid for a fight. Let's see one.
- C2 Too much respect. Throw something!
- C2 [laughs] I think the crowd wants their money back.
- C2 Both bots waiting for the other one to make a mistake.
- C1 This is a chess match right now. Not everybody's a chess fan.
- C2 The judges don't score feints.
- C2 One of them needs to take a risk.
- C2 This is a waiting game.
- C1 Patience is fine, but you can overdo it.

## `lull.chatter` · Quiet moment, analysis or banter
**When:** nothing big for 4 s or more, booth idle. Longest lines live here and get cut off if something big lands.

- C2 What I like about this fight is how evenly matched they are.
- C2 The footwork from both bots tonight has been excellent.
- C2 You can tell both corners spent a lot of time in the garage.
- C1 Ninety-nine seconds doesn't sound like long, until you're the one in there.
- C2 The building is buzzing. You can feel it.
- C2 I remember building my first bot. It fell over walking to the ring.
- C2 [laughs] Back in my day, we had one arm and a prayer.
- C2 These modern servos are incredible. The response time is unreal.
- C1 Watch the shoulders. They always tell you what's coming.
- C2 Good fights come down to small adjustments. Look for who adapts.
- C2 The crowd tonight might be the loudest I've heard all season.
- C2 Every dent on those bots is a lesson for the corner.
- P2 What a night it's been in the arena.
- P2 The crowd is on its feet here.
- C2 These bots are tougher than they look.
- C2 I love how these bots are built. Every part has a purpose.
- C1 You can learn a lot watching how a bot recovers after a big exchange.
- C2 Stamina is the hidden battle in every fight.
- C2 I'm watching the feet. That's where it all starts.
- C2 The arena crew is going to be sweeping up bolts for a week.
- C2 [laughs] Somebody's going to have a long night in the workshop after this.
- P2 Some great action so far.
- C2 These two are not giving each other an inch.
- C1 It's all about rhythm. Find yours, break theirs.
- C2 That's what's beautiful about this sport. Anything can happen.
- C2 The great bots can switch gears mid-fight. Let's see who can.
- C2 I've been around this sport a long time, and these fights never get old.
- C2 Look at the precision on those movements. Incredible engineering.
- P2 There's a lot of tension in the building right now.
- C2 One mistake is all it takes in this ring.
- C2 You never relax in there. Not for a second.
- C2 Both corners will be watching the replay of that last exchange.
- C1 Breathing room for both. Not for long, I suspect.
- C2 I'd love to see the telemetry on these two right now.
- C2 The fans in the cheap seats are getting the best view tonight.
- C2 Good engineering wins fights. Great engineering wins championships.
- P2 Just a moment of calm before the storm.
- C2 You learn more about a bot in the quiet moments than the wild ones.
- C2 These two are making each other think, and that's great to watch.
- C2 [laughs] My ears will be ringing for a week.

## `lull.pair` · Booth back-and-forth
**When:** a longer quiet moment. The whole exchange plays, and stops if something big lands.

- P2 What are you seeing from the corners so far?
- +C2 Both of them are being careful. They know one big shot can end this.
- P2 How much does the damage matter at this point?
- +C2 A lot. A dented chest plate means less power on every shot from here on.
- P2 If you're in that corner right now, what are you saying?
- +C2 Keep your guard up and stop admiring your work. Keep throwing.
- P2 Who's winning this, in your eyes?
- +C2 Honestly? It's close. Too close to call.
- P2 Does the size difference matter here?
- +C2 It matters until somebody lands clean. Then nothing else matters.
- P2 You've built bots like these. What's the hardest part?
- +C2 Balance. Getting a robot to stay on its feet after a big hit is an art.
- P2 Ninety-nine seconds. Is that enough time?
- +C2 For these two? [laughs] It might be too much.
- P2 Any surprises so far?
- +C2 I didn't expect this much defence. Both bots are very disciplined.
- P2 What wins it from here?
- +C2 The bot that keeps its shape. Whoever gets sloppy first loses.
- P2 How's the crowd treating you up here?
- +C2 [laughs] I can't hear a thing. It's wonderful.
- P2 What do you make of the pace?
- +C2 It's frantic. I don't know how long they can keep this up.
- P2 Have you ever seen a fight this even?
- +C2 Not often. Usually somebody blinks by now.
- P2 You mentioned the legs before the fight.
- +C2 I did, and I stand by it. Watch the legs in the last thirty seconds.
- P2 What would you change if this was your bot?
- +C2 More plating on the head. Always more plating on the head.

# The scoreboard

## `state.dominating` · One bot well ahead
**When:** periodic check, one bot has more than 2x the other's remaining HP fraction. About the leader unless noted.

- C2 This has been one-way traffic.
- C2 It's controlling this fight completely.
- C2 Total domination so far.
- C2 It's winning every exchange.
- C2 The other bot hasn't found an answer yet.
- C2 Right now, it can do no wrong.
- C2 If this continues, it won't go to the cards.
- C2 It's a clinic in there.
- P2 A big lead on the damage count.
- P2 Well ahead at this point.
- C2 {behind} It needs something big, and fast.
- C2 {behind} Its corner needs to come up with a new plan.
- C2 {behind} It's taking way too much punishment.
- C2 {behind} Nothing it's doing is working right now.
- C2 {behind} It needs to change something, anything.

## `state.close` · Neck and neck
**When:** periodic check, HP within 10% after at least 20 s.

- C2 This is as close as it gets.
- C2 Neck and neck.
- C2 I couldn't separate them if I tried.
- C2 Back and forth all fight.
- C2 Neither one is giving an inch.
- P2 Very even contest so far.
- C2 What a fight. Nothing between them.
- C2 This one could go either way.
- C2 Every exchange matters in a fight this close.
- C1 Dead even. One moment will decide it.

## `state.comeback` · Comeback
**When:** a bot that was more than 25% behind is now level or ahead.

- P3 What a comeback!
- P3 It's turned this fight around!
- P3 Back from the brink!
- P3 The tables have turned!
- C3 Nobody saw this coming a minute ago!
- C2 Remember when this looked over? Neither do I.
- C2 Never count out a bot with a good engine.
- C2 That's a huge momentum shift.

## `state.bothhurt` · Both bots badly hurt
**When:** both bots below 35% HP.

- P3 Both bots are hurt!
- P3 They're both running on fumes!
- C2 Whoever lands the next clean shot wins this.
- C2 Both of these bots are in bad shape. This is a war.
- C3 This is incredible! Neither one will give in!
- C2 Battered, dented, and still swinging. This is what fights are about.
- C2 Both corners are holding their breath.

## `state.lowhp` · One bot in danger
**When:** a bot drops below 20% HP.

- P3 It's running on empty!
- P3 Its health is critical!
- P2 It's barely hanging on.
- C2 One more clean shot and it's over.
- C2 Danger zone. It has to protect itself now.
- C2 It's on its last legs.
- C2 It's in survival mode now.
- C3 Hold on! Just hold on!

## `state.tired` · Slowing down
**When:** a bot's stamina has been low for a while.

- C2 It's slowing down. The engine is running hot.
- C2 The punches are getting slower. Fatigue is setting in.
- C2 It's gassed. You can see it in the footwork.
- C2 It threw too much early, and now it's paying.
- C1 The output has dropped right off.
- C2 Look at how slow the hands are coming back.

## `state.bodywork` · Body work paying off
**When:** one bot has landed a lot to the body.

- C2 All that body work is starting to pay off.
- C2 The body shots are slowing it down. You can see it.
- C2 It invested in the body early, and now it's cashing in.
- C2 Look at the posture. All those body shots, and it's starting to fold.

## `state.legwork` · Legs worn down
**When:** one bot's leg parts are damaged and it keeps getting kicked.

- C2 The legs are going. All those kicks are adding up.
- C2 It can barely move now. Those low kicks did their job.
- C2 Without its legs, it can't get out of the way.

# The clock

## `clock.60` · One minute left
**When:** 60 s remain (clock crosses 60).

- P2 One minute to go.
- P2 Sixty seconds left.
- P2 We're into the last minute.
- P2 One minute remaining in this fight.
- C2 One minute left. Time to make your move.
- C2 Last minute. This is where the engines matter.

## `clock.30` · Thirty seconds
**When:** 30 s remain.

- P3 Thirty seconds left!
- P3 Thirty seconds to go!
- P3 Half a minute left!
- P2 Thirty seconds remaining.
- C3 {behind} It needs a knockdown, and it needs it now!
- C2 {ahead} It just needs to stay safe. Don't get careless now.
- C2 Thirty seconds. Empty the tank.
- C2 It's going to come down to the judges unless somebody gets dropped.

## `clock.10` · Final ten seconds
**When:** 10 s remain.

- P4 Ten seconds!
- P4 Ten seconds to go!
- P4 Final ten seconds!
- P4 Here's the final push!
- P4 Everything they've got!
- P4 Down to the wire!
- P4 Last chance!
- C3 Throw everything! Throw everything!
- C3 Last ten! Let it go!
- C3 Empty the tank!

## `clock.final` · Final seconds frenzy
**When:** last 5 s, any landed shot.

- P4 Down to the final seconds!
- P4 Swinging until the end!
- P4 Five seconds left!
- P4 They're trading to the bell!
- P4 Right to the end!
- P4 Here it comes, the final bell!

# The finish

During the KO slow-motion the booth stays at normal speed. The caller screams first, the colour line lands while the winner celebrates, and the wrap-up plays over the results screen.

## `ko.call` · Knockout
**When:** `ko` kind `KO`.

- P4 It's over! It's all over!
- P4 Knockout! Knockout!
- P4 Good night!
- P4 Lights out!
- P4 It's out cold!
- P4 That's it! It's done!
- P4 Knocked out!
- P4 Down and out!
- P4 Stick a fork in it!
- P4 It's not getting up from that!
- P4 What a knockout!
- P4 And that is the end!
- P4 It's over! What a finish!
- P4 Knockout! Unbelievable!
- P4 Ladies and gentlemen, it is over!
- P4 Shut down! Totally shut down!
- P4 Powered down! Knockout!
- P4 That's lights out in the arena!
- P4 Goodnight, and goodbye!
- P4 Knocked out cold!
- P4 Oh, what a finish!
- P4 It's game over!
- P4 Finished! It's finished!
- P4 Sleep mode! It's out!
- P4 The referee waves it off! It's over!

## `ko.kick` · KO by kick
**When:** `ko` kind `KO`, finishing hit was a kick. Picked over `ko.call` half the time.

- P4 Kicked out cold!
- P4 What a kick! It's over!
- P4 Knocked out by the kick!
- P4 One kick, and it's done!
- C3 Kick of the night! Kick of the year!

## `ko.counter` · KO by counter
**When:** `ko` kind `KO`, finishing hit was a counter.

- P4 Countered and knocked out!
- P4 Walked onto it! It's over!
- C3 Walked right into it! What timing!

## `ko.comeback` · KO after being behind
**When:** `ko`, the winner had less HP than the loser at some point after 30 s, by 25% or more.

- P4 From the brink to the win! What a comeback!
- P4 Unbelievable comeback!
- C3 It was losing this fight! What a turnaround!
- C3 Never, ever give up! Look at that!

## `ko.late` · KO in the final seconds
**When:** `ko` with 10 s or less on the clock.

- P4 With seconds to spare!
- P4 At the very last moment!
- C3 Right at the end! Unbelievable timing!
- C3 It didn't want to leave it to the judges!

## `ko.early` · Fast KO
**When:** `ko` within the first 20 s.

- P4 That was quick!
- P4 Over in a flash!
- C3 Blink and you missed it!
- C2 [laughs] I barely sat down!

## `ko.colour` · Colour reacts to a KO
**When:** after the KO call, while the winner celebrates.

- C3 What a shot! What a shot!
- C3 I can't believe what I just saw!
- C3 That's a highlight reel knockout!
- C3 Unbelievable! Absolutely unbelievable!
- C2 That is one of the best knockouts I've seen all year.
- C2 It never saw it coming.
- C2 That's a statement win. Everybody's going to be talking about that one.
- C2 When you land that clean, it's over. Nothing you can do.
- C2 What a performance.
- C2 Perfect. Absolutely perfect.
- C2 That one is going straight to the replay.
- C2 You don't get up from a shot like that.
- C2 Clinical. Absolutely clinical.
- C3 Oh, I need to sit down!
- C2 [laughs] I think somebody needs to call a mechanic.
- C2 That's why you never drop your guard.
- C2 Everything it did tonight led to that moment.
- C2 It's going to take a while to reboot that one.
- C3 Did you see that? Did you see that?
- C2 Wow. Just wow.

## `tko.call` · TKO, third knockdown
**When:** `ko` kind `TKO`.

- P4 That's three! The referee stops it!
- P4 Three knockdowns! It's a TKO!
- P4 Technical knockout!
- P4 It's over! Three knockdowns!
- P4 The referee has seen enough!
- P4 The referee waves it off!
- P4 Down for the third time! It's over!
- P4 TKO! What a performance!
- P4 That's the third knockdown, and that's the fight!
- P4 Stopped! It's all over!
- C3 Three times it went down! The referee had no choice!
- C2 Three knockdowns. That's a dominant win.
- C2 The right call. It had nothing left.
- C2 It kept getting up, you have to give it credit. But that's enough.
- C2 Brave performance from the loser. But that was the right stoppage.
- C2 Knocked down three times. That's a beating.

## `decision.time` · Time runs out
**When:** `decision`, the bell.

- P3 That's the bell! It's going to the judges!
- P3 Time! We go to the cards!
- P3 That's the final bell!
- P3 Time! It's over!
- P3 And there's the bell!
- P2 That's time. We'll go to the scorecards.
- P3 We go the distance!
- P3 The bell! What a fight!
- P2 Time is up.
- P3 Saved by the bell!

## `decision.win` · Decision win
**When:** `decision` with a winner. Played after the bell call.

- P3 And the winner, by decision!
- P3 The judges have it! Winner by decision!
- P2 A decision victory.
- P3 Taking it on the scorecards!
- P2 The judges give it to the better bot tonight.
- C2 Fair decision. It did more of the damage.
- C2 I had it the same way. It earned that one.
- C2 Not a knockout, but a convincing win.
- C2 A smart win. It fought the right fight.
- C2 It controlled the pace from start to finish.
- C2 Points win. Not flashy, but a win is a win.
- C1 The judges got that one right.

## `decision.close` · Close decision
**When:** `decision` with HP within 10%.

- P3 By the narrowest of margins!
- P3 A razor-close decision!
- C2 That could have gone either way. Tough call for the judges.
- C2 Very close. I wouldn't argue with either result.
- C2 I'd like to see a rematch. That was too close.
- C2 Some people will disagree with that one.

## `decision.draw` · Draw
**When:** `decision` with no winner.

- P3 It's a draw!
- P3 The judges can't split them! It's a draw!
- P2 Dead even. We have a draw.
- C2 A draw. Fitting, for a fight that close.
- C2 Nobody deserved to lose that one.
- C2 [laughs] We'll have to do this again.
- C2 Rematch. We need a rematch.

## `win.celebrate` · Winner celebrates
**When:** a win celebration emote starts.

- P3 And the winner celebrates!
- P3 Soaking it all in!
- P3 Listen to this crowd!
- P2 Look at the celebration.
- P3 What a moment for the winner!
- P3 Celebrating in the centre of the ring!
- P2 The crowd is on its feet.
- C2 It earned that celebration.
- C2 [laughs] That's quite a victory dance.
- C2 You get to celebrate after a performance like that.
- C2 Enjoy it. You've earned it.
- C2 The crowd loves this bot.

## `wrap` · Sign-off
**When:** results screen. One line from each voice.

- P2 What a fight. Thank you for joining us.
- P2 That's all for this one. Great fight, everybody.
- P2 And that'll do it from the arena.
- P2 What a night. We'll see you next time.
- P2 That's our main event, and what a fight it was.
- P2 Thanks for joining us from ringside.
- P2 What a show. Goodnight, everybody.
- P2 We'll be back with more action soon.
- P2 Another unforgettable night in the arena.
- P1 And that's a wrap from the booth.

## `wrap.reply` · Colour signs off
**When:** right after a `wrap` line.

- +C2 Great fight. I need a vacation after that one.
- +C2 Thanks for having me. What a night.
- +C2 Can't wait to see these two again.
- +C2 [laughs] My voice is gone. Good night, everyone.
- +C1 Good fight. Good fight.
- +C2 Somebody give both of those bots a tune-up.
- +C2 Pleasure, as always. Get home safe, everyone.
- +C2 I'll be thinking about that one all week.

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

- P4 Your winner...
- P4 And the winner is...
- P4 Winner, and still standing...
- P4 Ladies and gentlemen, your winner...
- P4 The victory goes to...

**Renamed bots:** a name a player types in the garage has no clip. Those bots get the nameless lines only, which already make up most of the bank. Later, a small server function could voice a new name once with your ElevenLabs key and cache it for everyone.
