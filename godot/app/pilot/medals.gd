## The pilot's medals, Android only (kept in the pilot's save, app/pilot/pilot.gd): what a pilot
## has done over every fight they've had, and 26 medals for it, each in Bronze, Silver and Gold.
##
## Every fight adds to the pilot's lifetime stats (Pilot.settle feeds this the fight's summary).
## A medal's tier comes when a stat reaches its mark: most count up ("Land 1,500 punches"), two
## keep the best ever (the longest win streak, the pilot's level). Each tier pays XP and credits
## once. Silver earns the medal's title ("Iron Fist"), which the pilot can wear: it bills them in
## the fight intro and on the home screen (Gold shows it in gold).
##
## Rules only: Pilot.settle and App use it, MedalViews shows it.
class_name Medals
extends RefCounted

const TIER_NAMES := ["", "Bronze", "Silver", "Gold"]
## What a tier pays once, [xp, credits], Bronze to Gold.
const TIER_PAY := [[60, 150], [140, 400], [300, 1000]]
## The tier that earns a medal's title.
const TITLE_TIER := 2

## Every medal, in the order the profile shows them: its name, the title its Silver earns, its
## icon, the lifetime stat it reads, its three marks and its words (%s is the mark; `one`: its
## words for a mark of 1). `best`: the stat is a best ever, not a count.
const MEDALS := [
	{"id": "fights", "name": "Road Warrior", "title": "Road Warrior", "icon": "swords", "stat": "fights", "n": [10, 50, 200], "text": "Fight %s times"},
	{"id": "wins", "name": "Champion", "title": "Champion", "icon": "trophy", "stat": "wins", "n": [5, 30, 120], "text": "Win %s fights"},
	{"id": "streak", "name": "Unstoppable", "title": "The Unstoppable", "icon": "pa:unstoppable", "stat": "best_streak", "best": true, "n": [3, 6, 12], "text": "Win %s fights in a row"},
	{"id": "ko_wins", "name": "Knockout Artist", "title": "Knockout Artist", "icon": "bolt", "stat": "ko_wins", "n": [3, 20, 75], "text": "Win %s fights inside the distance"},
	{"id": "knockdowns", "name": "Demolisher", "title": "Demolisher", "icon": "ab:hammer", "stat": "knockdowns", "n": [5, 30, 120], "text": "Knock rivals down %s times"},
	{"id": "punches", "name": "Iron Fist", "title": "Iron Fist", "icon": "slot:fist", "stat": "punches", "n": [250, 1500, 6000], "text": "Land %s punches"},
	{"id": "kicks", "name": "Kickmaster", "title": "Kickmaster", "icon": "slot:kick", "stat": "kicks", "n": [80, 500, 2000], "text": "Land %s kicks"},
	{"id": "head_kicks", "name": "Headhunter", "title": "Headhunter", "icon": "slot:head", "stat": "head_kicks", "n": [3, 20, 80], "text": "Land %s kicks to the head"},
	{"id": "body", "name": "Body Snatcher", "title": "Body Snatcher", "icon": "slot:chest", "stat": "body", "n": [150, 900, 3500], "text": "Land %s body shots"},
	{"id": "crits", "name": "Sharpshooter", "title": "Sharpshooter", "icon": "star", "stat": "crits", "n": [30, 200, 800], "text": "Land %s critical hits"},
	{"id": "counters", "name": "Counterpuncher", "title": "Counterpuncher", "icon": "pa:retaliate", "stat": "counters", "n": [40, 250, 1000], "text": "Land %s counters"},
	{"id": "blocks", "name": "The Wall", "title": "The Wall", "icon": "shield", "stat": "blocks", "n": [150, 900, 3500], "text": "Block %s strikes"},
	{"id": "dodges", "name": "Ghost", "title": "The Ghost", "icon": "pa:slipstream", "stat": "dodges", "n": [15, 100, 400], "text": "Dodge %s attacks"},
	{"id": "damage", "name": "Wrecking Ball", "title": "Wrecking Ball", "icon": "flame", "stat": "damage", "n": [10000, 75000, 300000], "text": "Deal %s damage"},
	{"id": "finishers", "name": "Executioner", "title": "Executioner", "icon": "pa:rage", "stat": "finishers", "n": [1, 10, 40], "one": "Land a finisher", "text": "Land %s finishers"},
	{"id": "tear_offs", "name": "Scrapper", "title": "Scrapper", "icon": "wrench", "stat": "tear_offs", "n": [1, 15, 60], "one": "Rip a part off a rival", "text": "Rip %s parts off rivals"},
	{"id": "clean", "name": "Untouchable", "title": "Untouchable", "icon": "pa:aegis", "stat": "clean_wins", "n": [3, 20, 75], "text": "Win %s fights without going down"},
	{"id": "dominant", "name": "Dominator", "title": "Dominator", "icon": "heart", "stat": "dominant_wins", "n": [3, 20, 75], "text": "Win %s fights with over half your health"},
	{"id": "quick", "name": "Lightning", "title": "Lightning", "icon": "fast", "stat": "quick_wins", "n": [1, 10, 40], "one": "Win a fight in under 50 seconds", "text": "Win %s fights in under 50 seconds"},
	{"id": "comebacks", "name": "Comeback Kid", "title": "Comeback Kid", "icon": "refresh", "stat": "comebacks", "n": [1, 5, 20], "one": "Win a fight from under 20% health", "text": "Win %s fights from under 20% health"},
	{"id": "tag", "name": "Dynamic Duo", "title": "Tag Master", "icon": "user", "stat": "tag_wins", "n": [1, 10, 40], "one": "Win a Tag Team fight", "text": "Win %s Tag Team fights"},
	{"id": "titans", "name": "Giant Slayer", "title": "Giant Slayer", "icon": "crown", "stat": "titan_wins", "n": [1, 10, 40], "one": "Win a Titans battle", "text": "Win %s Titans battles"},
	{"id": "career", "name": "Circuit Star", "title": "Circuit Star", "icon": "map", "stat": "career_wins", "n": [3, 20, 75], "text": "Win %s Career rounds"},
	{"id": "online", "name": "Online Ace", "title": "Online Ace", "icon": "globe", "stat": "online_wins", "n": [1, 10, 50], "one": "Win an online fight", "text": "Win %s online fights"},
	{"id": "contracts", "name": "Contractor", "title": "Contractor", "icon": "check", "stat": "contracts", "n": [5, 40, 150], "text": "Finish %s daily contracts"},
	{"id": "level", "name": "Elite Pilot", "title": "Elite", "icon": "rank", "stat": "level", "best": true, "n": [10, 25, 50], "text": "Reach pilot level %s"},
]

## Every lifetime stat kept (the counts a fight adds, and the bests).
const STATS := ["fights", "wins", "losses", "draws", "streak", "best_streak", "punches", "kicks", "head_kicks", "body", "crits", "counters", "blocks", "dodges", "damage", "knockdowns", "finishers", "tear_offs", "ko_wins", "clean_wins", "dominant_wins", "quick_wins", "comebacks", "tag_wins", "titan_wins", "career_wins", "online_fights", "online_wins", "contracts", "perfect_days"]

static var _by_id := {}


static func def(id: String) -> Dictionary:
	if _by_id.is_empty():
		for m in MEDALS:
			_by_id[m.id] = m
	return _by_id.get(id, {})


## Every tier there is (26 medals x 3).
static func total() -> int:
	return MEDALS.size() * 3


# ------------------------------------------------------------------ the save

## A pilot's medal keys, fresh: no stats yet (`seeded` false: App.seed fills what the record knows).
static func fresh_into(p: Dictionary) -> void:
	var life := {}
	for k in STATS:
		life[k] = 0
	p.life = life
	p.medals = {}
	p.title = ""
	p.seen = 0
	p.seeded = false


## The medal keys of a saved pilot made safe, into `out` (Pilot.sanitize).
static func sanitize_into(out: Dictionary, raw: Dictionary) -> void:
	fresh_into(out)
	var life = raw.get("life")
	if life is Dictionary:
		for k in STATS:
			var v = life.get(k)
			if v is float or v is int:
				out.life[k] = maxi(0, int(v))
	var md = raw.get("medals")
	if md is Dictionary:
		for id in md:
			var v = md[id]
			if not def(String(id)).is_empty() and (v is float or v is int):
				out.medals[String(id)] = clampi(int(v), 0, 3)
	out.title = String(raw.title) if raw.get("title") is String and title_ok(out, String(raw.title)) else ""
	out.seen = clampi(int(raw.seen) if (raw.get("seen") is float or raw.get("seen") is int) else 0, 0, total())
	out.seeded = raw.get("seeded") == true


## A pilot from before medals: what the win record already knows goes in (the fights, wins and
## best streak), so their first medals come with their next fight. Whether it changed anything.
static func seed(p: Dictionary, record) -> bool:
	if p.seeded:
		return false
	p.seeded = true
	if record == null:
		return true
	var l: Dictionary = p.life
	var w := int(record.wins)
	var lo := int(record.losses)
	var d := int(record.draws)
	l.fights = maxi(int(l.fights), maxi(w + lo + d, int(p.fights)))
	l.wins = maxi(int(l.wins), w)
	l.losses = maxi(int(l.losses), lo)
	l.draws = maxi(int(l.draws), d)
	l.streak = maxi(int(l.streak), int(record.streak))
	l.best_streak = maxi(int(l.best_streak), int(record.best))
	return true


# ------------------------------------------------------------------ reading

## The stat a medal reads, now.
static func value(p: Dictionary, m: Dictionary) -> int:
	if m.stat == "level":
		return int(p.level)
	return int(p.life.get(m.stat, 0))


## The tier a medal's at (0 none, 3 Gold).
static func tier(p: Dictionary, id: String) -> int:
	return int(p.medals.get(id, 0))


## The tier a value reaches.
static func tier_for(m: Dictionary, v: int) -> int:
	var t := 0
	for n in m.n:
		if v >= int(n):
			t += 1
	return t


## Its words for tier `t`'s mark (1..3).
static func text(m: Dictionary, t: int) -> String:
	var n := int(m.n[clampi(t, 1, 3) - 1])
	if n == 1 and m.has("one"):
		return String(m.one)
	return String(m.text).replace("%s", num(n))


## "1,500".
static func num(n: int) -> String:
	var s := str(absi(n))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if n < 0 else "") + s + out


## Every tier won.
static func count(p: Dictionary) -> int:
	var n := 0
	for id in p.medals:
		n += int(p.medals[id])
	return n


## Tiers won since the profile was last looked at.
static func unseen(p: Dictionary) -> int:
	return maxi(0, count(p) - int(p.seen))


static func title_ok(p: Dictionary, id: String) -> bool:
	return not def(id).is_empty() and tier(p, id) >= TITLE_TIER


## The title the pilot wears: [words, tier] (a medal's, or the level's own with tier 0).
static func worn(p: Dictionary) -> Array:
	var id := String(p.get("title", ""))
	if id != "" and title_ok(p, id):
		return [String(def(id).title), tier(p, id)]
	return [Pilot.title(int(p.level)), 0]


## The fight intro's tag over the player's card ("Lv 12 · Iron Fist").
static func intro_tag(p: Dictionary) -> String:
	return "Lv %d · %s" % [int(p.level), worn(p)[0]]


# ------------------------------------------------------------------ a fight

## A fight is over: its summary (FightLog.summary, from the player's side) into the lifetime
## stats. `contracts`: daily contracts it finished; `perfect`: it finished the day's three.
static func add_fight(p: Dictionary, s: Dictionary, ctx: Dictionary, contracts: int, perfect: bool) -> void:
	var l: Dictionary = p.life
	for k in s:
		if l.has(k) and k != "streak" and k != "best_streak":
			l[k] = int(l[k]) + int(s[k])
	var won: bool = ctx.won
	var draw: bool = ctx.draw
	if not won:
		l.losses = int(l.losses) + (0 if draw else 1)
		l.draws = int(l.draws) + (1 if draw else 0)
	l.streak = int(l.streak) + 1 if won else 0
	l.best_streak = maxi(int(l.best_streak), int(l.streak))
	if ctx.get("online", false):
		l.online_fights = int(l.online_fights) + 1
		l.online_wins = int(l.online_wins) + (1 if won else 0)
	l.contracts = int(l.contracts) + contracts
	l.perfect_days = int(l.perfect_days) + (1 if perfect else 0)


## The tiers the stats have reached and the save hasn't: moved on and returned, each [id, tier]
## (one entry per tier, so a medal jumping two tiers pays both).
static func award(p: Dictionary) -> Array:
	var out := []
	for m in MEDALS:
		var was := tier(p, m.id)
		var now := tier_for(m, value(p, m))
		if now > was:
			p.medals[m.id] = now
			for t in range(was + 1, now + 1):
				out.append([String(m.id), t])
	return out


## What a list of new tiers pays: [xp, credits].
static func pay(won: Array) -> Array:
	var xp := 0
	var cr := 0
	for w in won:
		xp += int(TIER_PAY[int(w[1]) - 1][0])
		cr += int(TIER_PAY[int(w[1]) - 1][1])
	return [xp, cr]


## Medal tiers this fight has just reached as it goes (the counting stats only), each announced
## once: [id, tier] each. Paid when the fight settles.
static func live_done(p: Dictionary, fl) -> Array:
	var out := []
	for m in MEDALS:
		if m.get("best", false) or not fl.counts.has(m.stat):
			continue
		var t := tier_for(m, int(p.life.get(m.stat, 0)) + int(fl.counts[m.stat]))
		if t <= tier(p, m.id):
			continue
		var key := "medal:%s:%d" % [m.id, t]
		if fl.told.has(key):
			continue
		fl.told[key] = true
		out.append([String(m.id), t])
	return out
