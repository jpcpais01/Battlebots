## The pilot's progress, Android only (saved as "pilot" beside the record): a level that every
## fight moves on, and three daily contracts.
##
## Every fight counts, whatever kind: a quick fight, tag team, titans, a career round or an online
## one. It earns XP (more for a win, a knockout, a finisher; the first win of the day doubles it),
## and quick fights pay a few credits on top (career rounds already pay their purse). Each level
## pays credits too, more every 5th.
##
## Contracts are three a day (one easy, one medium, one hard), the same for everyone on a given
## date, new at the phone's midnight. Most count over as many fights as it takes ("Land 30
## punches"); some ask for one fight done a certain way ("Win without being knocked down"). Each
## pays credits and XP; all three done pays a bonus. Nothing is lost by skipping a day.
##
## Rules only: App feeds it the fights (FightLog, settle) and the views (PilotViews) show it.
class_name Pilot
extends RefCounted

const KEY := "pilot"
const MAX_LEVEL := 99

## XP for a fight: being in it, the result, and the moments in it.
const XP_FIGHT := 25
const XP_WIN := 45
const XP_DRAW := 20
const XP_STOPPAGE := 15
const XP_KNOCKDOWN := 8
const XP_FINISHER := 15
## One XP per this many landed blows, up to XP_LANDED_MAX.
const XP_LANDED_PER := 2
const XP_LANDED_MAX := 25

## Credits a quick fight pays (not a career round: that pays its purse).
const PAY_WIN := 40
const PAY_DRAW := 25
const PAY_LOSS := 15
## All three contracts done in a day.
const DAY_BONUS := 200

## The contract tiers: [credits, xp].
const TIER_PAY := [[100, 40], [160, 70], [250, 110]]

## Every contract: its tier (0 easy, 1 medium, 2 hard), how many, what it counts (a FightLog
## summary key), its words (%d is the target) and icon. `row`: in a row (a loss starts it over).
const CONTRACTS := {
	"fights": {"tier": 0, "n": 3, "stat": "fights", "text": "Fight %d times", "icon": "swords"},
	"punches": {"tier": 0, "n": 40, "stat": "punches", "text": "Land %d punches", "icon": "slot:fist"},
	"kicks": {"tier": 0, "n": 15, "stat": "kicks", "text": "Land %d kicks", "icon": "slot:kick"},
	"blocks": {"tier": 0, "n": 35, "stat": "blocks", "text": "Block %d strikes", "icon": "shield"},
	"dodges": {"tier": 0, "n": 5, "stat": "dodges", "text": "Dodge %d attacks", "icon": "fast"},
	"damage": {"tier": 0, "n": 3000, "stat": "damage", "text": "Deal %d damage", "icon": "flame"},
	"wins": {"tier": 1, "n": 2, "stat": "wins", "text": "Win %d fights", "icon": "trophy"},
	"head_kicks": {"tier": 2, "n": 1, "stat": "head_kicks", "text": "Land a kick to the head", "icon": "slot:head"},
	"knockdowns": {"tier": 1, "n": 2, "stat": "knockdowns", "text": "Knock rivals down %d times", "icon": "bolt"},
	"crits": {"tier": 1, "n": 10, "stat": "crits", "text": "Land %d critical hits", "icon": "star"},
	"counters": {"tier": 1, "n": 15, "stat": "counters", "text": "Land %d counters", "icon": "refresh"},
	"body": {"tier": 1, "n": 50, "stat": "body", "text": "Land %d body shots", "icon": "slot:chest"},
	"tag_win": {"tier": 1, "n": 1, "stat": "tag_wins", "text": "Win a Tag Team fight", "icon": "user"},
	"titan_win": {"tier": 1, "n": 1, "stat": "titan_wins", "text": "Win a Titans battle", "icon": "crown"},
	"ko_wins": {"tier": 2, "n": 2, "stat": "ko_wins", "text": "Win %d fights inside the distance", "icon": "bolt"},
	"clean_win": {"tier": 1, "n": 1, "stat": "clean_wins", "text": "Win without being knocked down", "icon": "shield"},
	"dominant": {"tier": 2, "n": 1, "stat": "dominant_wins", "text": "Win with over half your health left", "icon": "heart"},
	"quick_win": {"tier": 2, "n": 1, "stat": "quick_wins", "text": "Win in under 50 seconds", "icon": "fast"},
	"finisher": {"tier": 2, "n": 1, "stat": "finishers", "text": "Land a finisher", "icon": "flame"},
	"tear_off": {"tier": 2, "n": 1, "stat": "tear_offs", "text": "Rip a part off a rival", "icon": "wrench"},
	"career_win": {"tier": 2, "n": 1, "stat": "career_wins", "text": "Win a Career round", "icon": "map"},
	"streak": {"tier": 2, "n": 3, "stat": "wins", "row": true, "text": "Win %d fights in a row", "icon": "trophy"},
}

## A pilot's title by level (the highest one reached).
const TITLES := [[1, "Rookie"], [5, "Prospect"], [10, "Contender"], [15, "Veteran"], [20, "Headliner"], [30, "Ace"], [40, "Legend"], [60, "Icon"]]


## A new pilot: level 1, nothing done.
static func fresh() -> Dictionary:
	var p := {"level": 1, "xp": 0, "fights": 0, "day": "", "contracts": [], "bonus": false, "first_win": ""}
	# (the lifetime stats, medals and title: app/pilot/medals.gd)
	Medals.fresh_into(p)
	# (the record in each fighting style: app/pilot/styles.gd)
	p.styles = {}
	return p


## A saved pilot made safe.
static func sanitize(raw) -> Dictionary:
	var out := fresh()
	if not raw is Dictionary:
		return out
	out.level = clampi(_int(raw.get("level"), 1), 1, MAX_LEVEL)
	out.xp = clampi(_int(raw.get("xp"), 0), 0, need(out.level) - 1)
	out.fights = maxi(0, _int(raw.get("fights"), 0))
	out.day = String(raw.get("day")) if raw.get("day") is String else ""
	out.bonus = raw.get("bonus") == true
	out.first_win = String(raw.get("first_win")) if raw.get("first_win") is String else ""
	var cs = raw.get("contracts")
	if cs is Array:
		for c in cs:
			if c is Dictionary and CONTRACTS.has(c.get("id")):
				var def: Dictionary = CONTRACTS[c.id]
				out.contracts.append({"id": String(c.id), "n": clampi(_int(c.get("n"), 0), 0, int(def.n)), "done": c.get("done") == true})
	if out.contracts.size() != 3:
		out.day = ""
	Medals.sanitize_into(out, raw)
	FightStyles.sanitize_into(out, raw)
	return out


static func _int(v, fallback: int) -> int:
	return int(v) if (v is float or v is int) else fallback


static func load_state() -> Dictionary:
	var p := sanitize(Store.read(KEY, null))
	roll(p)
	return p


static func save_state(p: Dictionary) -> void:
	Store.write(KEY, p)


# ------------------------------------------------------------------ levels

## XP from `level` to the next.
static func need(level: int) -> int:
	return 120 + 40 * level


## Credits for reaching `level` (every 5th pays double).
static func level_pay(level: int) -> int:
	var c := mini(50 + 10 * level, 300)
	return c * 2 if level % 5 == 0 else c


static func title(level: int) -> String:
	var t := "Rookie"
	for row in TITLES:
		if level >= int(row[0]):
			t = row[1]
	return t


## The next title up and the level it comes at ([] at the top).
static func next_title(level: int) -> Array:
	for row in TITLES:
		if int(row[0]) > level:
			return row
	return []


## Add XP: the levels it reaches, each [level, credits] (the credits not paid here).
static func add_xp(p: Dictionary, xp: int) -> Array:
	var ups := []
	p.xp = int(p.xp) + xp
	while int(p.level) < MAX_LEVEL and int(p.xp) >= need(int(p.level)):
		p.xp = int(p.xp) - need(int(p.level))
		p.level = int(p.level) + 1
		ups.append([int(p.level), level_pay(int(p.level))])
	if int(p.level) >= MAX_LEVEL:
		p.xp = 0
	return ups


# ------------------------------------------------------------------ the day

## Today on this phone ("2026-10-23"): contracts turn over at local midnight.
static func today() -> String:
	return Time.get_date_string_from_system()


## Seconds to the phone's next midnight.
static func until_tomorrow() -> int:
	var t := Time.get_time_dict_from_system()
	return maxi(1, 86400 - (int(t.hour) * 3600 + int(t.minute) * 60 + int(t.second)))


## "5h 12m" / "12m".
static func clock(s: int) -> String:
	var h := s / 3600
	var m := (s % 3600) / 60
	return "%dh %02dm" % [h, m] if h > 0 else "%dm" % maxi(1, m)


## A new day: three new contracts (one of each tier, the same for everyone that day). Whether
## they turned over.
static func roll(p: Dictionary, day := "") -> bool:
	if day == "":
		day = today()
	if p.day == day and p.contracts.size() == 3:
		return false
	p.day = day
	p.bonus = false
	p.contracts = []
	var rng := RandomNumberGenerator.new()
	rng.seed = ("bb-contracts|" + day).hash()
	for tier in 3:
		var pool := []
		for id in CONTRACTS:
			if int(CONTRACTS[id].tier) == tier:
				pool.append(id)
		p.contracts.append({"id": pool[rng.randi_range(0, pool.size() - 1)], "n": 0, "done": false})
	return true


static func text(id: String) -> String:
	var def: Dictionary = CONTRACTS[id]
	var t: String = def.text
	return t % int(def.n) if t.contains("%d") else t


static func target(id: String) -> int:
	return int(CONTRACTS[id].n)


static func pay(id: String) -> Array:
	return TIER_PAY[int(CONTRACTS[id].tier)]


static func done_count(p: Dictionary) -> int:
	var n := 0
	for c in p.contracts:
		if c.done:
			n += 1
	return n


# ------------------------------------------------------------------ a fight

## Watches one fight's events from the player's side and sums them up at the end.
class FightLog:
	extends RefCounted
	## The match it watches (events from any other are ignored).
	var m
	## The player's side (0 offline; online, the corner this phone fights in).
	var me := 0
	var counts := {"punches": 0, "kicks": 0, "head_kicks": 0, "body": 0, "crits": 0, "counters": 0, "blocks": 0, "dodges": 0, "damage": 0, "knockdowns": 0, "finishers": 0, "tear_offs": 0}
	## Contracts already announced in this fight.
	var told := {}
	## Rivals' knockdown counts seen so far (a sweep or a takedown sends them down without one).
	var _kd := {}
	## The lowest my side's health has been, of its full health (a comeback wins from under 0.2).
	var low := 1.0
	## The whole fight as the crowd sees it, for its rating (app/pilot/rating.gd).
	var crowd: FightRating.Log

	func _init(m_, me_: int) -> void:
		m = m_
		me = me_
		crowd = FightRating.Log.new(m_)

	## A sim event (Game.match_event).
	func event(type: String, d) -> void:
		crowd.event(type, d)
		if not d is Dictionary:
			return
		match type:
			"hit":
				var att = d.get("attacker")
				var def = d.get("defender")
				if att == null or def == null:
					return
				if int(att.index) == me:
					if d.blocked or d.get("shielded", false):
						return
					counts.damage += roundi(float(d.damage))
					var kind := String(d.move.kind) if d.get("move") != null else ""
					if kind == "punch":
						counts.punches += 1
					elif kind == "kick":
						counts.kicks += 1
						if String(d.zone) == "head":
							counts.head_kicks += 1
					if String(d.zone) == "body":
						counts.body += 1
					if d.crit:
						counts.crits += 1
					if d.counter:
						counts.counters += 1
				elif int(def.index) == me:
					if d.blocked:
						counts.blocks += 1
					else:
						low = minf(low, _health())
			"dodge":
				var f = d.get("f")
				if f != null and int(f.index) == me:
					counts.dodges += 1
			"knockdown":
				var f = d.get("defender")
				if f == null or int(f.index) == me:
					return
				var k := int(f.knockdowns)
				var id := (f as Object).get_instance_id()
				if k > int(_kd.get(id, 0)):
					_kd[id] = k
					counts.knockdowns += 1
			"finisher":
				var f = d.get("f")
				if f != null and int(f.index) == me:
					counts.finishers += 1
			"detach":
				var by = d.get("by")
				if by != null and int(by.index) == me:
					counts.tear_offs += 1

	## The landed blows (for XP).
	func landed() -> int:
		return int(counts.punches) + int(counts.kicks)

	## The whole fight as contract stats. `ctx`: {won, draw, kind, tag, titan, career}.
	func summary(ctx: Dictionary) -> Dictionary:
		var s := counts.duplicate()
		var won: bool = ctx.won
		s.fights = 1
		s.wins = 1 if won else 0
		var kind := String(ctx.kind) if ctx.kind != null else ""
		s.ko_wins = 1 if won and kind != "" and kind != "Decision" else 0
		# my side's knockdowns and health (a tag team's, together)
		var downs := 0
		var hp := 0.0
		var hp_max := 0.0
		for f in _mine():
			downs += int(f.knockdowns)
			hp += maxf(0.0, float(f.hp))
			hp_max += float(f.build.stats.maxHp)
		s.clean_wins = 1 if won and downs == 0 else 0
		s.dominant_wins = 1 if won and hp_max > 0.0 and hp / hp_max > 0.5 else 0
		s.quick_wins = 1 if won and float(m.fightTime) < 50.0 else 0
		s.tag_wins = 1 if won and ctx.get("tag", false) else 0
		s.titan_wins = 1 if won and ctx.get("titan", false) else 0
		s.career_wins = 1 if won and ctx.get("career", false) else 0
		s.comebacks = 1 if won and minf(low, _health()) < 0.2 else 0
		# the crowd's rating of it (FightRating): whole stars earned, and a five-star fight
		var r = ctx.get("rating")
		var stars := float(r.stars) if r is Dictionary else 0.0
		s.stars = floori(stars)
		s.five_stars = 1 if stars >= 5.0 else 0
		return s

	## My side's health now, of its full health (a tag team's, together).
	func _health() -> float:
		var hp := 0.0
		var hp_max := 0.0
		for f in _mine():
			hp += maxf(0.0, float(f.hp))
			hp_max += float(f.build.stats.maxHp)
		return hp / hp_max if hp_max > 0.0 else 1.0

	func _mine() -> Array:
		if m.tag != null:
			var out := []
			for mb in m.tag.members:
				if int(mb.side) == me:
					out.append(mb.f)
			return out
		return [m.fighters[me]]


## Contracts this fight has just finished as it goes (counting kinds only), each announced once:
## their ids.
static func live_done(p: Dictionary, fl: FightLog) -> Array:
	var out := []
	for c in p.contracts:
		if c.done or fl.told.has(c.id):
			continue
		var def: Dictionary = CONTRACTS[c.id]
		if def.get("row", false) or not fl.counts.has(def.stat):
			continue
		if int(c.n) + int(fl.counts[def.stat]) >= int(def.n):
			fl.told[c.id] = true
			out.append(c.id)
	return out


## A fight is over: move the contracts and the level on. `ctx`: {won, draw, kind, tag, titan,
## career}; quick fights (not career) are paid. Returns what happened, for the results card:
## {xp, xp_from: [level, xp] before, xp_lines: [[words, xp]], first_win, pay, levels: [[level,
## credits]], contracts: [{id, from, to, done}], bonus, credits (everything paid)}.
static func settle(p: Dictionary, fl: FightLog, ctx: Dictionary) -> Dictionary:
	roll(p)
	var s := fl.summary(ctx)
	var won: bool = ctx.won
	var draw: bool = ctx.draw
	var out := {"xp_from": [int(p.level), int(p.xp)], "xp_lines": [], "contracts": [], "levels": [], "bonus": 0, "pay": 0, "first_win": false}
	# the contracts
	var cxp := 0
	var credits := 0
	for c in p.contracts:
		if c.done:
			continue
		var def: Dictionary = CONTRACTS[c.id]
		var from := int(c.n)
		if def.get("row", false):
			c.n = int(c.n) + 1 if won else 0
		else:
			c.n = int(c.n) + int(s.get(def.stat, 0))
		c.n = mini(int(c.n), int(def.n))
		if int(c.n) == from and not (def.get("row", false) and from > 0):
			continue
		var row := {"id": c.id, "from": from, "to": int(c.n), "done": false}
		if int(c.n) >= int(def.n):
			c.done = true
			row.done = true
			credits += int(pay(c.id)[0])
			cxp += int(pay(c.id)[1])
		out.contracts.append(row)
	var finished := 0
	for row in out.contracts:
		if row.done:
			finished += 1
	if not p.bonus and done_count(p) == 3:
		p.bonus = true
		out.bonus = DAY_BONUS
		credits += DAY_BONUS
	# the lifetime stats, and the medal tiers they reach (app/pilot/medals.gd)
	Medals.add_fight(p, s, ctx, finished, int(out.bonus) > 0)
	var medals := Medals.award(p)
	# the fight's XP
	var lines := []
	lines.append(["Fight", XP_FIGHT])
	if won:
		lines.append(["Win", XP_WIN])
	elif draw:
		lines.append(["Draw", XP_DRAW])
	if int(s.ko_wins) > 0:
		lines.append(["Inside the distance", XP_STOPPAGE])
	var hits := mini(XP_LANDED_MAX, fl.landed() / XP_LANDED_PER)
	if hits > 0:
		lines.append(["Blows landed", hits])
	if int(s.knockdowns) > 0:
		lines.append(["Knockdowns", XP_KNOCKDOWN * int(s.knockdowns)])
	if int(s.finishers) > 0:
		lines.append(["Finisher", XP_FINISHER])
	# (a great fight to watch pays, won or lost)
	if ctx.get("rating") is Dictionary:
		lines.append(["Crowd rating", FightRating.xp(float(ctx.rating.stars))])
	var xp := 0
	for l in lines:
		xp += int(l[1])
	# the first win of the day counts double
	if won and p.first_win != p.day:
		p.first_win = p.day
		out.first_win = true
		lines.append(["First win today", xp])
		xp *= 2
	if cxp > 0:
		lines.append(["Contracts", cxp])
		xp += cxp
	var mpay := Medals.pay(medals)
	if int(mpay[0]) > 0:
		lines.append(["Medals", int(mpay[0])])
		xp += int(mpay[0])
	p.fights = int(p.fights) + 1
	out.levels = add_xp(p, xp)
	# (the levels it reached can earn the level medal: its XP on top)
	var more := Medals.award(p)
	if not more.is_empty():
		var extra := Medals.pay(more)
		out.levels.append_array(add_xp(p, int(extra[0])))
		xp += int(extra[0])
		mpay = [int(mpay[0]) + int(extra[0]), int(mpay[1]) + int(extra[1])]
		if lines[-1][0] == "Medals":
			lines[-1] = ["Medals", int(lines[-1][1]) + int(extra[0])]
		else:
			lines.append(["Medals", int(extra[0])])
		medals.append_array(more)
	credits += int(mpay[1])
	out.medals = medals
	out.xp_lines = lines
	out.xp = xp
	for u in out.levels:
		credits += int(u[1])
	# a quick fight's pay
	if not ctx.get("career", false):
		out.pay = PAY_WIN if won else PAY_DRAW if draw else PAY_LOSS
		credits += int(out.pay)
	out.credits = credits
	return out
