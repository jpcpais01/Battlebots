## The League, Android only: the home screen's Fight is a ranked fight. Twenty AI pilots and the
## player share one table, and every quick fight is against one of them, a real rival with a name,
## a pilot, a temper and a bot that looks the same every time they meet.
##
## The player starts at the bottom (#21) and climbs: beat a pilot ranked above you and you take
## their place (everyone between moves down one). By default the next fight is the pilot just
## above; the League screen lets the player pick anyone up to REACH places above instead (a bigger
## jump against a tougher rival), or settle a score with a pilot below who beat them last time. A
## pilot the player beat may call them out from below, and if that pilot wins they take the
## player's place. At #1 the player is the League Champion, and every fight is a title defence.
##
## Rivals get tougher up the table: a pilot's bot is about as strong as the player's in its parts
## (rebuilt when the player's bot outgrows it by more than REFIT) and carries its rank's grade on
## top (BotSpec.boost, as the Gauntlet's rivals do): rusty at the bottom, better than even at the
## top. Each pilot remembers every fight with the player: the score, who won last, a run of wins.
## A pilot who has beaten the player twice more than they've lost is their Nemesis, and beating a
## pilot who won the last meeting is Revenge. While the player fights, the pilots fight each other
## too (AI_BOUTS a fight, worked out on odds, not in the sim), so the table moves and the news
## fills up.
##
## Seasons run Monday to Monday on the phone's clock. When one ends, the player's best rank in it
## pays Skin Vault shards, the season's champion goes into the Hall of Champions, and the player
## drops SEASON_DROP places for the new one. Reaching #15, #10, #5, #3 and #1 for the first time
## ever pays shards too.
##
## Rules and the save (user://save/league.json) only: App runs the fights and pays out,
## LeagueScreen and the results card show it.
class_name League
extends RefCounted

const KEY := "league"
const PILOTS := 20
## The player's id on the table (pilots are 1..PILOTS).
const YOU := 0
## How many places above the player a challenge can reach.
const REACH := 3
## A pilot's grade (a share of its health and power, as the Gauntlet's) by rank: GRADE_TOP at #1,
## GRADE_BOTTOM at #PILOTS, even steps between.
const GRADE_TOP := 0.08
const GRADE_BOTTOM := -0.32
## A pilot's bot is rebuilt when its parts' rating is this far off the player's.
const REFIT := 0.15
## The first time the player reaches a rank: [rank, Skin Vault shards].
const MILESTONES := [[15, 20], [10, 40], [5, 60], [3, 100], [1, 220]]
## A season's pay by the best rank reached in it: [up to rank, shards] (any league fight at all
## pays the last).
const SEASON_PAY := [[1, 150], [3, 90], [10, 50], [15, 25], [PILOTS + 1, 10]]
const SEASON_DROP := 6
## The first season's Monday.
const SEASON_ONE := "2026-10-19"
const AI_BOUTS := 2
## A challenger's odds of taking the place above in a fight between pilots.
const AI_UPSET := 0.42
## Odds a pilot the player beat last time, just below them, calls them out.
const CALLOUT_ODDS := 0.25
const NEWS_MAX := 8
const CHAMPS_MAX := 6
## XP (Pilot.settle): per place climbed (up to CLIMB_MAX), revenge, a title won, a defence.
const XP_CLIMB := 15
const XP_CLIMB_MAX := 60
const XP_REVENGE := 40
const XP_TITLE := 120
const XP_DEFENCE := 50

const GOLD := Color(1.0, 0.824, 0.29)
const RIVAL := Color(1.0, 0.33, 0.36)
## The League's mark: a belt, its plate and studs.
const SVG := '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 9.5c2 .8 3.4 1 5 1M21.5 9.5c-2 .8-3.4 1-5 1M2.5 14.5c2-.8 3.4-1 5-1M21.5 14.5c-2-.8-3.4-1-5-1"/><path d="M12 5.5l4.5 2.2v8.6L12 18.5l-4.5-2.2V7.7z"/><path d="M12 9.4l1 2 2.1.3-1.5 1.5.4 2.1-2-1-2 1 .4-2.1-1.5-1.5 2.1-.3z" fill="currentColor" stroke-width="0.8"/></svg>'

const FIRST := ["Mara", "Dex", "Kenji", "Rosa", "Viktor", "Ines", "Tobias", "Ama", "Rafa", "Yuki", "Bram", "Zara", "Otis", "Lena", "Cruz", "Nadia", "Hugo", "Sol", "Ivo", "Priya", "Jonas", "Kofi", "Mei", "Axel", "Noor", "Leo", "Tess", "Bo", "Remy", "Kai"]
const LAST := ["Quinn", "Okafor", "Tanaka", "Silva", "Kovac", "Moreau", "Lindqvist", "Mensah", "Ortega", "Sato", "Vance", "Haddad", "Petrov", "Nakamura", "Reyes", "Byrne", "Costa", "Weber", "Ito", "Adeyemi", "Novak", "Laurent", "Kim", "Duarte", "Fischer", "Rossi", "Hale", "Park", "Varga", "Cole"]
const HOMES := ["Osaka", "Detroit", "Lagos", "Rio", "Glasgow", "Busan", "Marseille", "Mexico City", "Reykjavik", "Cairo", "Manila", "Lisbon", "Chicago", "Krakow", "Mumbai", "Sydney", "Nairobi", "Montreal", "Naples", "Seoul"]

## The pilots' tempers: what they're called, the styles they fight in, their bots' frame sizes, and
## what they say ({you} is the player's bot). Contexts: first (never met), won_last (they won the
## last meeting), lost_last (the player did), nemesis, callout (they called the player out), champ
## (they hold the title), defence (the player does), and after the fight beat_you / beaten.
const PERSONAS := {
	"showboat": {"name": "Showboat", "styles": ["Swarmer", "Out-fighter"], "size": [0.9, 1.05], "lines": {
		"first": ["Smile for the cameras, {you}. They're here for me.", "First time on my stage? Try to keep up."],
		"won_last": ["Back for an encore? The crowd loved your last fall.", "I'd sign your scrap, {you}, but I signed it last time."],
		"lost_last": ["Last time was a fluke. Tonight's the highlight reel.", "You stole my spotlight once. Never again."],
		"nemesis": ["Again? You're my favourite opening act, {you}.", "Every time you show up, my ratings go up."],
		"callout": ["I want my spotlight back, {you}. Right now.", "The fans want a rematch. So do I."],
		"champ": ["The belt looks better on me. Always will.", "You want the crown? Take a picture of it. That's all you'll get."],
		"defence": ["Nice belt. It'll look great on my shelf.", "Champion? That's my title you're wearing, {you}."],
		"beat_you": ["Did you get that on camera? Good.", "And the crowd goes wild. For me."],
		"beaten": ["Okay. That one goes on your highlight reel.", "Fine. Enjoy the spotlight while it lasts."],
	}},
	"veteran": {"name": "Veteran", "styles": ["Boxer", "Counter-puncher"], "size": [0.95, 1.1], "lines": {
		"first": ["I've been in this ring since before you were bolted together.", "Let's see what the new blood's made of."],
		"won_last": ["You've got heart, kid. Heart's not enough.", "Same lesson as last time. Pay attention."],
		"lost_last": ["You caught me last time. It won't happen twice.", "Respect, {you}. Now I'm ready for you."],
		"nemesis": ["We keep meeting like this, {you}. You keep learning nothing.", "I know every move you'll make before you do."],
		"callout": ["Old dogs don't forget, {you}. Rematch.", "I owe you one. I always pay my debts."],
		"champ": ["Took me twenty years to win this belt. You get one night.", "Every champion was a challenger once. Show me."],
		"defence": ["Every champion falls. Tonight's your turn.", "I've held that belt before. I want it back."],
		"beat_you": ["Keep your guard up, kid. You'll get there.", "Experience, {you}. You can't buy it at the Parts Market."],
		"beaten": ["Good fight, kid. You earned that.", "Well, I'll be. The kid can fight."],
	}},
	"hothead": {"name": "Hothead", "styles": ["Brawler", "Swarmer"], "size": [0.95, 1.1], "lines": {
		"first": ["Who let this bucket of bolts in here?", "Get out of my ring, {you}!"],
		"won_last": ["I scrapped you once. I'll scrap you twice!", "Still got my dents in you, {you}?"],
		"lost_last": ["You got lucky! LUCKY!", "I've waited all week to tear you apart."],
		"nemesis": ["You again? I'm sick of looking at you!", "I'm taking you apart bolt by bolt, {you}."],
		"callout": ["Get back in here, {you}! We're not done!", "Rematch! Now! No excuses!"],
		"champ": ["You want MY belt? Over my scrap heap!", "Nobody takes the belt from me. Nobody!"],
		"defence": ["Hand over that belt or I rip it off you!", "That belt's mine, {you}. MINE!"],
		"beat_you": ["HA! Stay down!", "That's what you get, {you}!"],
		"beaten": ["This isn't over! You hear me?!", "Rigged! The whole thing was rigged!"],
	}},
	"tactician": {"name": "Tactician", "styles": ["Counter-puncher", "Out-fighter", "Boxer"], "size": [0.9, 1.05], "lines": {
		"first": ["I've studied forty of your fights. You have tells.", "Your guard drops after a combination. I noticed."],
		"won_last": ["Nothing has changed since our last fight. Same result.", "I ran this fight a thousand times. You won thirty-one."],
		"lost_last": ["I've corrected the error from our last meeting.", "You exposed a flaw. It's been patched."],
		"nemesis": ["You're predictable, {you}. That's why you keep losing.", "I could fight you with my optics off."],
		"callout": ["Our last fight produced bad data. We run it again.", "One loss is an anomaly. I'm here to remove it."],
		"champ": ["Your odds of taking this belt are eighteen percent. Generous.", "I've mapped every path to this belt. Yours ends here."],
		"defence": ["Champions decline. The numbers say you have.", "I've found the weakness in your title run."],
		"beat_you": ["As calculated.", "Variables accounted for. Thank you for the data."],
		"beaten": ["Unexpected. I'll need to review the footage.", "Impressive. You weren't in my models."],
	}},
	"rookie": {"name": "Rookie", "styles": ["Boxer", "Brawler", "Swarmer", "Out-fighter", "Counter-puncher"], "size": [0.85, 1.0], "lines": {
		"first": ["My first big fight! Please don't wreck me too badly!", "Wow, {you}! I've watched all your fights!"],
		"won_last": ["I beat you once! I can do it again!", "Last time felt like a dream. Let's go again!"],
		"lost_last": ["I've trained every day since you beat me!", "I learned so much from our last fight!"],
		"nemesis": ["I didn't think I'd beat you once, let alone again!", "My coach says you're my lucky charm, {you}."],
		"callout": ["Can I have a rematch? Please? I'm ready this time!", "I'll show everyone I belong here, {you}!"],
		"champ": ["I'm the champion?! Okay. Okay. I can do this!", "Nobody thought I'd win this belt. Nobody!"],
		"defence": ["It's an honour to fight the champion! And beat you!", "I'm coming for that belt, {you}!"],
		"beat_you": ["I did it! Did you see that?!", "Sorry! Good fight, {you}!"],
		"beaten": ["Wow. That was amazing. Can we go again sometime?", "I'm still learning. Thank you, {you}!"],
	}},
	"brute": {"name": "Brute", "styles": ["Brawler"], "size": [1.1, 1.2], "lines": {
		"first": ["Smash.", "You small. I break."],
		"won_last": ["Broke you once. Break you again.", "Remember my fist, {you}?"],
		"lost_last": ["You hit me. Now I hit back.", "No more lucky. Only smash."],
		"nemesis": ["You. Again. Good.", "I like breaking you, {you}."],
		"callout": ["Fight. Now.", "You owe me a fight, {you}."],
		"champ": ["Belt mine. Come take.", "Biggest. Strongest. Champion."],
		"defence": ["Belt. Give.", "I take shiny belt, {you}."],
		"beat_you": ["Told you. Smash.", "Small bot. Big fall."],
		"beaten": ["...Ow.", "Strong. Respect."],
	}},
}
const PERSONA_IDS := ["showboat", "veteran", "hothead", "tactician", "rookie", "brute"]
## What a fight is, as the screens bill it.
const KIND_WORDS := {"challenge": "Challenge", "title": "Title shot", "defence": "Title defence", "callout": "Callout", "revenge": "Revenge match"}
## What a grade reads as, from the bottom: [up to, words] (as the Gauntlet's).
const THREAT := [[-0.2, "Rusty"], [-0.05, "Fair"], [0.1, "Tough"], [INF, "Brutal"]]


# ------------------------------------------------------------------ the save

static func load_state(player) -> Dictionary:
	return sanitize(Store.read(KEY, null), player)


static func save_state(g: Dictionary) -> void:
	Store.write(KEY, g)


## A brand-new League: twenty pilots made up for this phone, the player at the bottom.
static func fresh(player) -> Dictionary:
	var g := _blank()
	g.rs = randi() % 2147483647
	var rng := TMath.Rng.new(float(g.rs))
	var used := {String(player.name_): true}
	var tempers := []
	while tempers.size() < PILOTS:
		var batch: Array = PERSONA_IDS.duplicate()
		for i in range(batch.size() - 1, 0, -1):
			var j := int(rng.next() * (i + 1)) % (i + 1)
			var t = batch[i]
			batch[i] = batch[j]
			batch[j] = t
		tempers.append_array(batch)
	var names := {}
	var target := rating_of(player)
	for i in PILOTS:
		g.pilots.append(_make_pilot(i + 1, i + 1, String(tempers[i]), rng, used, names, target))
	g.table = range(1, PILOTS + 1)
	g.table.append(YOU)
	g.season = week_now()
	g.season_best = PILOTS + 1
	return g


static func _blank() -> Dictionary:
	return {"rs": 0, "pilots": [], "table": [], "best": PILOTS + 1, "season": 0, "season_best": PILOTS + 1, "season_fights": 0, "fights": 0, "titles": 0, "defences": 0, "revenges": 0, "miles": [], "next": null, "news": [], "champs": [], "ended": null}


## One pilot, made at rank `rank`: their name, home and temper, and their bot (parts about as
## strong as the player's, the temper's style and frame, a Rare or Epic skin near the top).
static func _make_pilot(id: int, rank: int, temper: String, rng: TMath.Rng, used: Dictionary, names: Dictionary, target: float) -> Dictionary:
	var pn := ""
	for k in 40:
		pn = "%s %s" % [FIRST[int(rng.next() * FIRST.size()) % FIRST.size()], LAST[int(rng.next() * LAST.size()) % LAST.size()]]
		if not names.has(pn):
			break
	names[pn] = true
	var bot = _closest(rng, target)
	for k in 30:
		if not used.has(String(bot.name_)):
			break
		bot.name_ = TLoadout.randomName(rng)
	used[String(bot.name_)] = true
	var per: Dictionary = PERSONAS[temper]
	var styles: Array = per.styles
	bot.style = styles[int(rng.next() * styles.size()) % styles.size()]
	bot.size_ = TItems.sanitizeSize(rng.range_(float(per.size[0]), float(per.size[1])))
	var sk = null
	if rank <= 8:
		var pool: Array = Skins.of_rarity(Skins.EPIC if rank <= 3 else Skins.RARE)
		if not pool.is_empty():
			sk = pool[int(rng.next() * pool.size()) % pool.size()].id
	else:
		sk = Gacha.opponent_skin(rng)
	if sk != null:
		bot.skin = sk
	return {"id": id, "pname": pn, "home": HOMES[int(rng.next() * HOMES.size()) % HOMES.size()], "temper": temper, "bot": bot, "rs": int(rng.next() * 2147483646.0), "w": 0, "l": 0, "d": 0, "last": "", "run": 0}


## The random bot (of 40) whose parts' rating is closest to `target`.
static func _closest(rng: TMath.Rng, target: float):
	var best = null
	var best_d := INF
	for i in 40:
		var b = TLoadout.randomBot(rng, rng.next(), null)
		var d: float = absf(TItems.computeBuild(b.loadout).rating - target)
		if d < best_d:
			best_d = d
			best = b
	return best


## A save made safe: pilots with sane bots and counts, a table holding everyone once. A save too
## broken to mend is a new League.
static func sanitize(raw, player) -> Dictionary:
	if not raw is Dictionary or not raw.get("pilots") is Array or (raw.pilots as Array).size() != PILOTS:
		return fresh(player)
	var g := _blank()
	g.rs = _int(raw.get("rs"))
	for k in ["fights", "titles", "defences", "revenges", "season_fights"]:
		g[k] = maxi(0, _int(raw.get(k)))
	g.season = maxi(0, _int(raw.get("season")))
	g.best = clampi(_int(raw.get("best"), PILOTS + 1), 1, PILOTS + 1)
	g.season_best = clampi(_int(raw.get("season_best"), PILOTS + 1), 1, PILOTS + 1)
	for i in PILOTS:
		var p = raw.pilots[i]
		if not p is Dictionary or not p.get("bot") is Dictionary:
			return fresh(player)
		var bot = Store.keep_skin(TSaves.sanitizeBot(p.bot), p.bot)
		var temper := String(p.get("temper", ""))
		if not PERSONAS.has(temper):
			temper = PERSONA_IDS[i % PERSONA_IDS.size()]
		var last := String(p.get("last", ""))
		g.pilots.append({
			"id": i + 1, "pname": String(p.get("pname", "")), "home": String(p.get("home", "")), "temper": temper, "bot": bot,
			"rs": _int(p.get("rs")), "w": maxi(0, _int(p.get("w"))), "l": maxi(0, _int(p.get("l"))), "d": maxi(0, _int(p.get("d"))),
			"last": last if last in ["w", "l", "d"] else "", "run": _int(p.get("run")),
		})
	# the table: everyone once (a missing id goes on the bottom)
	var seen := {}
	if raw.get("table") is Array:
		for id in raw.table:
			var n := _int(id, -1)
			if n >= 0 and n <= PILOTS and not seen.has(n):
				seen[n] = true
				g.table.append(n)
	for n in range(1, PILOTS + 1):
		if not seen.has(n):
			g.table.append(n)
	if not seen.has(YOU):
		g.table.append(YOU)
	if raw.get("miles") is Array:
		for m in raw.miles:
			var n := _int(m, -1)
			if n > 0 and not g.miles.has(n):
				g.miles.append(n)
	var nx = raw.get("next")
	if nx is Dictionary and _int(nx.get("id")) >= 1 and _int(nx.get("id")) <= PILOTS and KIND_WORDS.has(String(nx.get("kind", ""))):
		g.next = {"id": _int(nx.id), "kind": String(nx.kind)}
	if raw.get("news") is Array:
		for n in raw.news:
			if n is Dictionary and n.get("t") is String:
				g.news.append({"t": String(n.t), "k": String(n.get("k", "ai"))})
		g.news = g.news.slice(0, NEWS_MAX)
	if raw.get("champs") is Array:
		for c in raw.champs:
			if c is Dictionary and c.get("who") is String:
				g.champs.append({"season": _int(c.get("season")), "who": String(c.who), "you": c.get("you") == true})
		g.champs = g.champs.slice(0, CHAMPS_MAX)
	var e = raw.get("ended")
	if e is Dictionary:
		g.ended = {"season": _int(e.get("season")), "rank": _int(e.get("rank")), "best": _int(e.get("best")), "shards": _int(e.get("shards")), "seen": e.get("seen") == true}
	return g


static func _int(v, fallback := 0) -> int:
	return int(v) if (v is float or v is int) else fallback


# ------------------------------------------------------------------ reading

static func rating_of(bot) -> float:
	return float(TItems.computeBuild(bot.loadout).rating)


## Where `id` stands on the table (1 is the top).
static func rank_of(g: Dictionary, id: int) -> int:
	return g.table.find(id) + 1


static func me(g: Dictionary) -> int:
	return rank_of(g, YOU)


static func pilot(g: Dictionary, id: int) -> Dictionary:
	return g.pilots[id - 1]


static func at(g: Dictionary, rank: int) -> int:
	return int(g.table[rank - 1])


static func champion(g: Dictionary) -> bool:
	return me(g) == 1


static func grade(rank: int) -> float:
	return GRADE_BOTTOM + (GRADE_TOP - GRADE_BOTTOM) * float(PILOTS - rank) / float(PILOTS - 1)


static func threat(rank: int) -> String:
	var k := grade(rank)
	for t in THREAT:
		if k <= float(t[0]):
			return String(t[1])
	return String(THREAT[-1][1])


static func threat_color(rank: int) -> Color:
	var t := threat(rank)
	return UiTheme.GREEN if t == "Rusty" else UiTheme.CYAN if t == "Fair" else GOLD if t == "Tough" else RIVAL


## "#7", or "Champion" for #1 when `words`.
static func rank_text(rank: int, words := false) -> String:
	return "Champion" if words and rank == 1 else "#%d" % rank


## The pilot who has beaten the player the most more than they've lost to them (at least two), or
## -1: the player's Nemesis.
static func nemesis(g: Dictionary) -> int:
	var best := -1
	var best_s := -INF
	for p in g.pilots:
		var diff := int(p.l) - int(p.w)
		if int(p.l) < 2 or diff < 2:
			continue
		var s := diff * 10.0 + int(p.run)
		if s > best_s:
			best_s = s
			best = int(p.id)
	return best


## The score between the player and a pilot in words ("You lead 3–1").
static func score_words(p: Dictionary) -> String:
	var w := int(p.w)
	var l := int(p.l)
	if w + l + int(p.d) == 0:
		return "First meeting"
	if w > l:
		return "You lead %d–%d" % [w, l]
	if l > w:
		return "They lead %d–%d" % [l, w]
	return "Level at %d–%d" % [w, l]


## What a fight against `id` is, from where they and the player stand.
static func kind_for(g: Dictionary, id: int) -> String:
	var m := me(g)
	var r := rank_of(g, id)
	if m == 1:
		return "defence"
	if r < m:
		return "title" if r == 1 else "challenge"
	return "revenge" if String(pilot(g, id).last) == "l" else "callout"


## Pilots the player can pick to fight next on the League screen: anyone up to REACH places above
## (the champion: up to REACH below), a pilot below within reach who won the last meeting, the
## Nemesis anywhere, and whoever is up next.
static func can_pick(g: Dictionary, id: int) -> bool:
	if id < 1 or id > PILOTS:
		return false
	var m := me(g)
	var r := rank_of(g, id)
	if g.next != null and int(g.next.id) == id:
		return true
	if nemesis(g) == id:
		return true
	if m == 1:
		return r <= 1 + REACH
	if r < m:
		return r >= m - REACH
	return r <= m + REACH and String(pilot(g, id).last) == "l"


## Who the player fights next, {id, kind}: the pick, if they made one; the champion's first
## challenger; now and then a pilot just below whom they beat last time, calling them out; or
## the pilot just above. Kept in the save, so the screen and the fight agree.
static func next_foe(g: Dictionary) -> Dictionary:
	if g.next != null and can_pick(g, int(g.next.id)):
		return g.next
	var m := me(g)
	var out := {}
	if m == 1:
		out = {"id": at(g, 2), "kind": "defence"}
	else:
		var rng := TMath.Rng.new(float((int(g.rs) + int(g.fights) * 104729 + 17) % 2147483647))
		var calls := []
		for r in range(m + 1, mini(m + REACH, PILOTS + 1) + 1):
			var id := at(g, r)
			if String(pilot(g, id).last) == "w":
				calls.append(id)
		if not calls.is_empty() and rng.next() < CALLOUT_ODDS:
			out = {"id": calls[int(rng.next() * calls.size()) % calls.size()], "kind": "callout"}
		else:
			var up := at(g, m - 1)
			out = {"id": up, "kind": kind_for(g, up)}
	g.next = out
	return out


## Fight `id` next (the League screen's pick, or a rematch: `force` skips the reach rule).
static func choose(g: Dictionary, id: int, force := false) -> bool:
	if id < 1 or id > PILOTS or (not force and not can_pick(g, id)):
		return false
	var k := kind_for(g, id)
	if g.next != null and int(g.next.id) == id and String(g.next.kind) == "callout":
		k = "callout"
	g.next = {"id": id, "kind": k}
	return true


## What a win and a loss against the next foe would do: [if won, if lost], in words.
static func stakes(g: Dictionary, nf: Dictionary) -> Array:
	var m := me(g)
	var r := rank_of(g, int(nf.id))
	if m == 1:
		return ["Keep the belt", "Drop to #%d" % r if r > 1 else "Lose the belt"]
	if r < m:
		return ["Become Champion" if r == 1 else "Take #%d" % r, "Stay #%d" % m]
	return ["Stay #%d" % m, "Drop to #%d" % (m + 1)]


## A pilot's line for a moment (PERSONAS contexts), {you} filled in.
static func line(p: Dictionary, ctx: String, you: String, salt := 0) -> String:
	var lines: Array = PERSONAS[String(p.temper)].lines.get(ctx, [])
	if lines.is_empty():
		return ""
	var k := absi(int(p.w) + int(p.l) + int(p.d) + salt + int(p.id)) % lines.size()
	return String(lines[k]).replace("{you}", you)


## What the pilot says walking out for the next fight.
static func taunt(g: Dictionary, id: int, you: String) -> String:
	var p := pilot(g, id)
	var nf = g.next if g.next != null and int(g.next.id) == id else {"kind": kind_for(g, id)}
	var ctx := "first"
	if String(nf.kind) == "defence":
		ctx = "defence"
	elif rank_of(g, id) == 1:
		ctx = "champ"
	elif nemesis(g) == id:
		ctx = "nemesis"
	elif String(nf.kind) == "callout":
		ctx = "callout"
	elif String(p.last) == "l":
		ctx = "won_last"
	elif String(p.last) == "w":
		ctx = "lost_last"
	return line(p, ctx, you)


## The fight intro's billing of a pilot: {style (the line under their name), taunt, tag (over
## their card)}.
static func bill(g: Dictionary, id: int, you: String) -> Dictionary:
	var p := pilot(g, id)
	var r := rank_of(g, id)
	var nf = g.next if g.next != null and int(g.next.id) == id else {"kind": kind_for(g, id)}
	var bits := ["League " + rank_text(r, true), String(p.bot.get("style", "")), score_words(p)]
	var tag := "League " + rank_text(r, true)
	if nemesis(g) == id:
		tag = "Your Nemesis · " + rank_text(r)
	elif String(nf.kind) == "defence":
		tag = "Title challenger · " + rank_text(r)
	return {"style": " · ".join(bits.filter(func(s): return s != "")), "taunt": taunt(g, id, you), "tag": tag}


## The pilot's bot for the next fight: their own bot (rebuilt first if the player's has outgrown
## it), in paint that can't be mistaken for the player's, wearing their rank's grade.
static func bot_for(g: Dictionary, id: int, player) -> Dictionary:
	var p := pilot(g, id)
	refit(g, p, player)
	var b: Dictionary = p.bot.duplicate(true)
	if TPaint.samePaint(b.paint, player.paint):
		b.paint = TPaint.contrastingPaint(player.paint, TMath.Rng.new(float(int(p.rs) % 2147483647)))
	var k := grade(rank_of(g, id))
	b.boost = {"punchPower": k, "kickPower": k, "hp": float(TItems.BASE_STATS.maxHp) * k}
	return b


## Rebuild a pilot's parts when the player's bot is more than REFIT off theirs (the same name,
## paint, skin, frame and style; new parts about as strong as the player's). Whether it did.
static func refit(g: Dictionary, p: Dictionary, player) -> bool:
	var target := rating_of(player)
	var cur := rating_of(p.bot)
	if absf(cur - target) <= REFIT * maxf(target, 1.0):
		return false
	var rng := TMath.Rng.new(float((int(p.rs) + int(g.fights) * 7919 + 1) % 2147483647))
	p.bot.loadout = _closest(rng, target).loadout
	return true


static func name_of(g: Dictionary, id: int, you: String) -> String:
	return you if id == YOU else String(pilot(g, id).bot.name_)


# ------------------------------------------------------------------ a fight

## A League fight against `id` is over. Moves the table, the score with the pilot, the records and
## the news on, and the pilots fight among themselves. Returns what happened, for the results
## card and the pilot's XP: {id, name, pname, kind, from, to, their, won, draw, revenge, nemesis
## (the Nemesis beaten), title, defended, lost_title, shards, miles, quote, score, next}.
static func settle(g: Dictionary, id: int, won: bool, draw: bool, you: String) -> Dictionary:
	var p := pilot(g, id)
	var m := me(g)
	var r := rank_of(g, id)
	var kind := String(g.next.kind) if g.next != null and int(g.next.id) == id else kind_for(g, id)
	var bot_name := String(p.bot.name_)
	var out := {"id": id, "name": bot_name, "pname": String(p.pname), "kind": kind, "from": m, "to": m, "their": r, "won": won, "draw": draw,
		"revenge": false, "nemesis": false, "title": false, "defended": false, "lost_title": false, "shards": 0, "miles": [], "quote": "", "score": ""}
	var was_nemesis := nemesis(g) == id
	if draw:
		p.d = int(p.d) + 1
		p.last = "d"
		p.run = 0
	elif won:
		out.revenge = String(p.last) == "l"
		p.w = int(p.w) + 1
		p.last = "w"
		p.run = mini(int(p.run), 0) - 1
		if out.revenge:
			g.revenges = int(g.revenges) + 1
	else:
		p.l = int(p.l) + 1
		p.last = "l"
		p.run = maxi(int(p.run), 0) + 1
	out.nemesis = was_nemesis and won
	var news := ""
	if won and r < m:
		# the player takes their place; they and everyone between move down one
		g.table.erase(YOU)
		g.table.insert(r - 1, YOU)
		if r == 1:
			out.title = true
			g.titles = int(g.titles) + 1
			news = "%s beat %s and is the new League Champion!" % [you, bot_name]
		else:
			news = "%s beat %s to take #%d" % [you, bot_name, r]
	elif won:
		if m == 1:
			out.defended = true
			g.defences = int(g.defences) + 1
			news = "%s defended the title against %s" % [you, bot_name]
		else:
			news = "%s beat %s" % [you, bot_name] + (" and got revenge" if out.revenge else "")
	elif not draw and r > m:
		# they take the player's place
		g.table.erase(id)
		g.table.insert(m - 1, id)
		if m == 1:
			out.lost_title = true
			news = "%s took the title from %s!" % [bot_name, you]
		else:
			news = "%s beat %s to take #%d" % [bot_name, you, m]
	elif not draw:
		news = "%s beat %s" % [bot_name, you]
	else:
		news = "%s and %s fought to a draw" % [you, bot_name]
	out.to = me(g)
	g.best = mini(int(g.best), int(out.to))
	g.season_best = mini(int(g.season_best), int(out.to))
	for ms in MILESTONES:
		if int(out.to) <= int(ms[0]) and not g.miles.has(int(ms[0])):
			g.miles.append(int(ms[0]))
			out.shards = int(out.shards) + int(ms[1])
			out.miles.append(int(ms[0]))
	out.quote = "" if draw else line(p, "beaten" if won else "beat_you", you, int(g.fights))
	out.score = score_words(p)
	g.fights = int(g.fights) + 1
	g.season_fights = int(g.season_fights) + 1
	g.next = null
	# the pilots' own fights, then the player's (newest first)
	var ai := ai_bouts(g)
	for n in ai:
		_news(g, String(n), "ai")
	_news(g, news, "title" if out.title or out.lost_title else "you")
	out.news = ai
	out.next = next_foe(g)
	return out


## AI_BOUTS fights between neighbours on the table (never the player), worked out on odds: the
## lower pilot takes the place above at AI_UPSET. Their headlines.
static func ai_bouts(g: Dictionary) -> Array:
	var rng := TMath.Rng.new(float((int(g.rs) * 3 + int(g.fights) * 31337 + 5) % 2147483647))
	var out := []
	for i in AI_BOUTS:
		var k := 0
		for tries in 12:
			k = int(rng.next() * (PILOTS)) % PILOTS
			if int(g.table[k]) != YOU and int(g.table[k + 1]) != YOU:
				break
		var hold := int(g.table[k])
		var chal := int(g.table[k + 1])
		if hold == YOU or chal == YOU:
			continue
		var hn := String(pilot(g, hold).bot.name_)
		var cn := String(pilot(g, chal).bot.name_)
		if rng.next() < AI_UPSET:
			g.table[k] = chal
			g.table[k + 1] = hold
			out.append(("%s beat %s and is the new League Champion!" % [cn, hn]) if k == 0 else "%s beat %s to take #%d" % [cn, hn, k + 1])
		elif k == 0:
			out.append("%s defended the title against %s" % [hn, cn])
	return out


static func _news(g: Dictionary, text: String, kind: String) -> void:
	if text == "":
		return
	g.news.push_front({"t": text, "k": kind})
	g.news = g.news.slice(0, NEWS_MAX)


# ------------------------------------------------------------------ seasons

## Days since 1970 of the phone's date today.
static func _day(date := "") -> int:
	if date == "":
		date = Pilot.today()
	return int(floor(Time.get_unix_time_from_datetime_string(date + "T00:00:00") / 86400.0))


## This week (Monday to Sunday) as a number: days since a Monday, over 7.
static func week_now() -> int:
	return int(floor((_day() + 3) / 7.0))


static func season_no(week: int) -> int:
	return week - int(floor((_day(SEASON_ONE) + 3) / 7.0)) + 1


## Seconds until the season ends (the phone's next Monday midnight).
static func season_left() -> int:
	var dow := posmod(_day() + 3, 7)
	return (6 - dow) * 86400 + Pilot.until_tomorrow()


## "3d 4h" / "5h 12m".
static func left_words() -> String:
	var s := season_left()
	if s >= 86400:
		return "%dd %dh" % [s / 86400, (s % 86400) / 3600]
	return Pilot.clock(s)


## A new week: the season that ended pays the player's best rank in it, its champion goes into the
## Hall of Champions, the player drops SEASON_DROP places and a few pilots swap. The shards it
## paid (App pays them), 0 when the season hasn't changed.
static func roll(g: Dictionary, you: String) -> int:
	var w := week_now()
	if int(g.season) == 0:
		g.season = w
		return 0
	if w <= int(g.season):
		return 0
	var m := me(g)
	var pay := 0
	if int(g.season_fights) > 0:
		for s in SEASON_PAY:
			if int(g.season_best) <= int(s[0]):
				pay = int(s[1])
				break
	var no := season_no(int(g.season))
	var top := at(g, 1)
	if int(g.season_fights) > 0 or top != YOU:
		g.champs.push_front({"season": no, "who": name_of(g, top, you), "you": top == YOU})
		g.champs = g.champs.slice(0, CHAMPS_MAX)
	g.ended = {"season": no, "rank": m, "best": int(g.season_best), "shards": pay, "seen": false}
	# the new season: the player drops, a few pilots trade places
	g.table.erase(YOU)
	g.table.insert(mini(m - 1 + SEASON_DROP, PILOTS), YOU)
	var rng := TMath.Rng.new(float((int(g.rs) + w * 613) % 2147483647))
	for i in 4:
		var k := int(rng.next() * PILOTS) % PILOTS
		if int(g.table[k]) != YOU and int(g.table[k + 1]) != YOU:
			var t = g.table[k]
			g.table[k] = g.table[k + 1]
			g.table[k + 1] = t
	g.season = w
	g.season_best = me(g)
	g.season_fights = 0
	g.next = null
	_news(g, "Season %d is under way. %s holds the belt." % [season_no(w), name_of(g, at(g, 1), you)], "season")
	return pay
