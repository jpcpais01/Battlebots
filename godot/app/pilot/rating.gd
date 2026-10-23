## The crowd's verdict on a fight, Android only: every fight is scored half a star to five stars
## for how good it was to watch (not for who won), with a headline ("ALL-OUT WAR", "COMEBACK!"),
## what the stands said about it, the moments that made it, and its flow: both corners' health
## through the fight, which the results card draws as a line swinging from one side to the other.
##
## A loss can still be a five-star fight, and a five-star fight pays the most XP of any rating
## (Pilot.settle's Crowd rating line), counts for the Crowd Pleaser and Fan Favourite medals, and
## goes on the fight's tape (`rating`), so a saved replay keeps its stars on the shelf.
##
## Rules only, read from the sim's events as the fight is played (Log, fed by Pilot.FightLog):
## nothing here touches the sim. The results card draws it (app/results/rating_view.gd).
class_name FightRating
extends RefCounted

## Points kept of a fight's flow, each corner's (the tape keeps them as 0..100).
const FLOW_N := 64
const MARKS_MAX := 20
## A blow this big, of the rival's full health, is a big hit.
const BIG_HIT := 0.075
## A lead has to be this big (of full health) to count as changing hands.
const SWING := 0.06

## Every headline, the most remarkable first: what decides it is in rate().
const HEADS := {
	"classic": ["INSTANT CLASSIC", ["They'll be talking about that one for years.", "Nobody in the building sat down.", "Frame that one. Hang it in the garage."]],
	"comeback": ["COMEBACK!", ["Left for scrap, and still won it.", "The crowd had written it off. Big mistake.", "Out on its feet, then out of nowhere."]],
	"scrapyard": ["SCRAPYARD", ["Bring a bin bag for the parts.", "Not a fight. A teardown.", "Someone call the recycling crew."]],
	"war": ["ALL-OUT WAR", ["Both of them went to the floor and both got up.", "Pure violence, and the crowd loved every second.", "Nobody took a step back."]],
	"seesaw": ["SEESAW BATTLE", ["The lead changed hands again and again.", "Every time one took over, the other took it back.", "Back and forth, all night long."]],
	"nailbiter": ["NAIL-BITER", ["It could have gone either way.", "Separated by a whisker.", "Nobody breathed for the last ten seconds."]],
	"finished": ["FINISHED IN STYLE", ["The finisher brought the house down.", "Saved the best for last.", "That's one for the highlight reel."]],
	"flawless": ["FLAWLESS", ["Barely a scratch on the winner.", "A masterclass. A one-sided masterclass.", "Clinical. The crowd wanted more of a fight."]],
	"demolition": ["DEMOLITION JOB", ["Over before the popcorn arrived.", "Quick, brutal, done.", "Blink and you missed it."]],
	"slugfest": ["SLUGFEST", ["Toe to toe, blow for blow.", "Neither of them stopped swinging.", "A punch-up from bell to bell."]],
	"chess": ["CHESS MATCH", ["Patient, careful, clever. A purist's fight.", "More thinking than hitting.", "Tactics over fireworks."]],
	"pleaser": ["CROWD PLEASER", ["Good scrap. The stands enjoyed that.", "Plenty to cheer about.", "Solid entertainment from start to finish."]],
	"scrap": ["SOLID SCRAP", ["A fair fight, fairly fought.", "Honest work from both corners.", "Nothing wrong with that one."]],
	"quiet": ["QUIET NIGHT", ["Some of the crowd went for snacks.", "The stands have seen livelier.", "A slow one. They'll want more next time."]],
}


## A fight being watched: its health line and its big moments, from the sim's events (both
## corners: the rating is the whole fight's).
class Log:
	extends RefCounted
	var m
	## [fight time, corner 0's health share, corner 1's] each time either changed.
	var pts := []
	## Its big moments: {t: fight time, k: kd (a knockdown) / fin (a finisher) / tear (a part
	## ripped off) / big (a big hit), s: the corner that did it}.
	var marks := []
	var landed := [0, 0]
	var big := 0
	## The biggest single blow, of the rival's full health.
	var biggest := 0.0
	var kd := [0, 0]
	var tears := 0
	var finisher := false
	var _downs := {}

	func _init(m_) -> void:
		m = m_
		pts.append([0.0, 1.0, 1.0])

	## A sim event (Pilot.FightLog.event passes them all on).
	func event(type: String, d) -> void:
		if not d is Dictionary:
			return
		match type:
			"hit":
				var att = d.get("attacker")
				var def = d.get("defender")
				if att == null or def == null or d.blocked or d.get("shielded", false):
					return
				var s := int(att.index)
				landed[s] += 1
				var k := float(d.damage) / maxf(1.0, float(def.build.stats.maxHp))
				biggest = maxf(biggest, k)
				if k >= BIG_HIT:
					big += 1
					_mark("big", s)
			"knockdown":
				var f = d.get("defender")
				if f == null:
					return
				# (a sweep or a takedown sends them down without counting one)
				var n := int(f.knockdowns)
				var id := (f as Object).get_instance_id()
				if n > int(_downs.get(id, 0)):
					_downs[id] = n
					kd[1 - int(f.index)] += 1
					_mark("kd", 1 - int(f.index))
			"finisher":
				var f = d.get("f")
				if f != null:
					finisher = true
					_mark("fin", int(f.index))
			"detach":
				var by = d.get("by")
				if by != null:
					tears += 1
					_mark("tear", int(by.index))
		# (health can move on any of them: a finisher's blows, a part ripped off)
		_note()

	func _mark(k: String, s: int) -> void:
		# (big hits only while there's room: the rarer moments always get theirs)
		if k == "big" and marks.size() >= MARKS_MAX - 6:
			return
		if marks.size() < MARKS_MAX:
			marks.append({"t": float(m.fightTime), "k": k, "s": s})

	func _note() -> void:
		var a := FightRating.side_share(m, 0)
		var b := FightRating.side_share(m, 1)
		var last: Array = pts[-1]
		if absf(a - float(last[1])) < 0.002 and absf(b - float(last[2])) < 0.002:
			return
		pts.append([float(m.fightTime), a, b])


## A corner's health now, of its full health (a tag team's two bots together).
static func side_share(m, side: int) -> float:
	var hp := 0.0
	var hp_max := 0.0
	if m.tag != null:
		for mb in m.tag.members:
			if int(mb.side) == side:
				hp += maxf(0.0, float(mb.f.hp))
				hp_max += float(mb.f.build.stats.maxHp)
	else:
		var f = m.fighters[side]
		hp = maxf(0.0, float(f.hp))
		hp_max = float(f.build.stats.maxHp)
	return clampf(hp / hp_max, 0.0, 1.0) if hp_max > 0.0 else 1.0


## The finished fight's rating: {stars (0.5 to 5, in halves), head (its id in HEADS), title, line
## (what the crowd said), why ([words] for the moments that made it), flow: [[corner 0's health
## a point, 0..100], [corner 1's]], marks: [{t: 0..1000 of the fight, k, s}], secs}. `kind`: how
## it ended (null or "Decision", "TKO", "KO", "Dismantled", "Draw").
static func rate(lg: Log, kind) -> Dictionary:
	var m = lg.m
	lg._note()
	var secs := maxf(1.0, float(m.fightTime))
	var how := String(kind) if kind != null else ""
	var w := int(m.winner.index) if m.winner != null else -1
	var pts: Array = lg.pts
	var fin: Array = pts[-1]
	var a1 := float(fin[1])
	var b1 := float(fin[2])
	# the lead changing hands, and how far behind the winner ever was
	var changes := 0
	var state := 0
	var deficit := 0.0
	for p in pts:
		var lead := float(p[1]) - float(p[2])
		var st := 1 if lead > SWING else -1 if lead < -SWING else state
		if st != state and state != 0:
			changes += 1
		state = st
		if w >= 0:
			deficit = maxf(deficit, -lead if w == 0 else lead)
	var margin := absf(a1 - b1)
	var won_share := (a1 if w == 0 else b1) if w >= 0 else maxf(a1, b1)
	var per_min := float(lg.landed[0] + lg.landed[1]) / (secs / 60.0)
	var downs: int = lg.kd[0] + lg.kd[1]
	var stoppage := how != "" and how != "Decision" and how != "Draw"
	# what made it: tuned with tests/rating_check.gd (2026-10-23, 41 fights: about three stars on
	# average, one in ten five, one in ten under two)
	var s := 0.9
	s += clampf((per_min - 30.0) / 25.0, 0.0, 0.7)
	s += minf(3.0, float(changes)) * 0.45
	s += clampf((deficit - 0.08) * 3.0, 0.0, 1.6)
	s += clampf(1.0 - margin, 0.0, 1.0) * 1.1
	s += minf(3.0, float(downs)) * 0.25
	s += minf(2.0, float(lg.tears)) * 0.15
	s += 0.35 if lg.finisher else 0.0
	s += minf(4.0, float(lg.big)) * 0.05
	# (a walkover: the crowd wanted a fight)
	if margin > 0.6:
		s -= (margin - 0.6) * 2.0
	if secs < 30.0:
		s -= 0.3
	if w < 0:
		s += 0.2
	var stars := clampf(roundf(s * 2.0) / 2.0, 0.5, 5.0)
	# the headline
	var head := "scrap"
	if stars >= 5.0:
		head = "classic"
	elif w >= 0 and deficit >= 0.3:
		head = "comeback"
	elif lg.tears >= 2:
		head = "scrapyard"
	elif downs >= 3 or (lg.kd[0] > 0 and lg.kd[1] > 0):
		head = "war"
	elif changes >= 3:
		head = "seesaw"
	elif w < 0 or margin < 0.12:
		head = "nailbiter"
	elif lg.finisher:
		head = "finished"
	elif won_share >= 0.85:
		head = "flawless"
	elif stoppage and secs < 40.0:
		head = "demolition"
	elif per_min >= 48.0:
		head = "slugfest"
	elif not stoppage and per_min < 26.0:
		head = "chess"
	elif stars >= 3.5:
		head = "pleaser"
	elif stars < 2.0:
		head = "quiet"
	var lines: Array = HEADS[head][1]
	var line := String(lines[int(absf(float(m.seed_))) % lines.size()])
	# the moments that made it, the best few
	var why := []
	if w >= 0 and deficit >= 0.2:
		why.append("Came back from %d%% down" % roundi(deficit * 100.0))
	if changes >= 2:
		why.append("Lead changed %d times" % changes)
	if downs > 0:
		why.append("%d knockdown%s" % [downs, "" if downs == 1 else "s"])
	if lg.finisher:
		why.append("Finisher")
	if lg.tears > 0:
		why.append("%d part%s ripped off" % [lg.tears, "" if lg.tears == 1 else "s"])
	if w >= 0 and won_share <= 0.2:
		why.append("Won on %d%% health" % maxi(1, roundi(won_share * 100.0)))
	if per_min >= 45.0:
		why.append("%d blows a minute" % roundi(per_min))
	if lg.biggest >= 0.12:
		why.append("Biggest hit %d%%" % roundi(lg.biggest * 100.0))
	return {
		"stars": stars, "head": head, "title": String(HEADS[head][0]), "line": line, "why": why.slice(0, 4),
		"flow": flow(pts, secs), "marks": lg.marks.map(func(k): return {"t": clampi(roundi(float(k.t) / secs * 1000.0), 0, 1000), "k": k.k, "s": int(k.s)}),
		"secs": roundi(secs),
		# (what it was scored on, for tests/rating_check.gd: not kept on the tape)
		"f": {"per_min": per_min, "changes": changes, "deficit": deficit, "margin": margin, "downs": downs, "kd": lg.kd.duplicate(), "tears": lg.tears, "fin": lg.finisher, "big": lg.big, "secs": secs, "draw": w < 0, "how": how, "won_share": won_share},
	}


## Both corners' health through the fight, at FLOW_N even steps (each the health at that moment),
## 0..100.
static func flow(pts: Array, secs: float) -> Array:
	var a := []
	var b := []
	var j := 0
	for i in FLOW_N:
		var t := secs * float(i) / float(FLOW_N - 1)
		while j + 1 < pts.size() and float(pts[j + 1][0]) <= t + 1e-6:
			j += 1
		a.append(roundi(float(pts[j][1]) * 100.0))
		b.append(roundi(float(pts[j][2]) * 100.0))
	# (the last point is how it ended)
	a[-1] = roundi(float(pts[-1][1]) * 100.0)
	b[-1] = roundi(float(pts[-1][2]) * 100.0)
	return [a, b]


## The XP a rating pays the pilot (Pilot.settle's Crowd rating line): 2 for one star to 40 for
## five.
static func xp(stars: float) -> int:
	return roundi(stars * stars * 1.6)


## A rating read back from a saved tape, made safe (or null).
static func sanitize(raw) -> Variant:
	if not raw is Dictionary:
		return null
	var num := func(v) -> bool: return (v is float or v is int) and is_finite(float(v))
	if not num.call(raw.get("stars")) or not HEADS.has(raw.get("head")):
		return null
	var head := String(raw.head)
	var fl = raw.get("flow")
	if not fl is Array or fl.size() != 2 or not fl[0] is Array or not fl[1] is Array or fl[0].size() != FLOW_N or fl[1].size() != FLOW_N:
		return null
	var f := [[], []]
	for c in 2:
		for v in fl[c]:
			f[c].append(clampi(int(v), 0, 100) if num.call(v) else 0)
	var marks := []
	for k in (raw.get("marks") if raw.get("marks") is Array else []).slice(0, MARKS_MAX):
		if k is Dictionary and k.get("k") in ["kd", "fin", "tear", "big"] and num.call(k.get("t")):
			marks.append({"t": clampi(int(k.t), 0, 1000), "k": String(k.k), "s": 1 if int(k.get("s", 0)) == 1 else 0})
	var why := []
	for x in (raw.get("why") if raw.get("why") is Array else []).slice(0, 4):
		if x is String:
			why.append(String(x).substr(0, 40))
	return {
		"stars": clampf(roundf(float(raw.stars) * 2.0) / 2.0, 0.5, 5.0), "head": head, "title": String(HEADS[head][0]),
		"line": String(raw.line).substr(0, 90) if raw.get("line") is String else String(HEADS[head][1][0]),
		"why": why, "flow": f, "marks": marks, "secs": maxi(0, int(raw.secs)) if num.call(raw.get("secs")) else 0,
	}
