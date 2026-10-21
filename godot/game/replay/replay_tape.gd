## A fight's tape (src/game/game.ts Tape): everything a replay needs to play the same fight
## again, a few KB. The sim is deterministic, so that's the bots, the seed, and what the player
## changed while it ran: where the intro ended (tapped, or how long the booth held it), the
## coach's calls and the TAG button, by step. Plus the fight's length (the step its results came
## up), its big moments for the scrubber, and what the commentators said, so the booth says it
## again.
##
## A plain dictionary (saved as JSON, translated-code key names: see Store):
##   a, b: the bots (specs); partners: {a, b} in a tag team match, else null; seed
##   arena: the venue (events.ts ArenaId, "grand" indoors, "titan" for titan battles)
##   cut: the step a tap skipped the intro at (-1: it ran its length); intro: that length (s)
##   coach: [{side, kind, frame}]; tags: [{side, frame}] (the TAG button's taps)
##   end, marks: [{frame, kind: kd, tear, ko}], talk: the booth's script (Booth.said_script)
##   result: the results card's numbers (summary), so Results needn't run the fight to its end
##   me: the corner the player fought from; online; teams: a tag team fight's names
class_name ReplayTape
extends RefCounted

const MARK_KINDS := ["kd", "tear", "ko"]


## A tape for a fight starting now; the rest is filled in as it goes (mark, tag) and at its
## results (finish).
static func make(a, b, seed: float, partners = null, arena := "grand") -> Dictionary:
	return {
		"a": a.duplicate(true), "b": b.duplicate(true), "seed": seed,
		"partners": {"a": partners.a.duplicate(true), "b": partners.b.duplicate(true)} if partners != null else null,
		"arena": arena, "cut": -1, "intro": -1.0, "coach": [], "tags": [], "end": 0, "marks": [], "talk": [],
		"result": null, "me": 0, "online": false, "teams": ["", ""],
	}


## The fight on screen ended and its results are up (app.ts showResults): the rest of the tape.
static func finish(t: Dictionary, m, talk: Array) -> void:
	t.coach = (m.coachLog as Array).map(func(c): return {"side": int(c.side), "kind": str(c.kind), "frame": int(c.frame)})
	t.talk = talk
	t.end = int(m.frame)
	if int(t.cut) < 0:
		t.intro = float(m.introLength)
	t.result = summary(m)


## What the results card reads of a finished match (ResultsView), as plain data shaped like it:
## {fighters: [{index, name_, stats, hp, hpRatio}], specs: [{paint}], winner (one of fighters, or
## null), result, fightTime, tag: null or {tags, members: [{side, f, spec, out}]}}.
static func summary(m) -> Dictionary:
	var fs := []
	for f in m.fighters:
		fs.append(_fighter(f))
	var out := {
		"fighters": fs, "specs": [{"name_": String(m.specs[0].name_), "paint": m.specs[0].paint.duplicate(true)}, {"name_": String(m.specs[1].name_), "paint": m.specs[1].paint.duplicate(true)}],
		"winner": fs[int(m.winner.index)] if m.winner != null else null,
		"result": str(m.result) if m.result != null else null, "fightTime": float(m.fightTime), "tag": null,
	}
	if m.tag != null:
		var mbs := []
		for mb in m.tag.members:
			# (the bot in the ring at the end is the same one in fighters)
			var i: int = m.fighters.find(mb.f)
			mbs.append({"side": int(mb.side), "f": fs[i] if i >= 0 else _fighter(mb.f), "spec": {"paint": mb.spec.paint.duplicate(true)}, "out": bool(mb.out)})
		out.tag = {"tags": [int(m.tag.tags[0]), int(m.tag.tags[1])], "members": mbs}
	return out


static func _fighter(f) -> Dictionary:
	var st := {}
	for k in ["dealt", "landed", "thrown", "blocked", "dodged", "knockdowns", "takedowns", "biggest"]:
		st[k] = float(f.stats[k])
	return {"index": int(f.index), "name_": String(f.name_), "stats": st, "hp": float(f.hp), "hpRatio": float(f.hpRatio)}


## A saved summary made safe (or null: a replay without one runs to its end for its results).
static func _summary(raw) -> Variant:
	if not raw is Dictionary or not raw.get("fighters") is Array or raw.fighters.size() != 2:
		return null
	var fs := []
	for f in raw.fighters:
		if not f is Dictionary:
			return null
		fs.append(_fighter_of(f, fs.size()))
	var specs := []
	for i in 2:
		var sp = raw.get("specs")[i] if raw.get("specs") is Array and raw.specs.size() == 2 else null
		var bot = TSaves.sanitizeBot({"name_": sp.get("name_"), "paint": sp.get("paint")} if sp is Dictionary else null)
		specs.append({"name_": String(bot.name_), "paint": bot.paint})
	var w = raw.get("winner")
	var wi := int(w.get("index", -1)) if w is Dictionary and _num(w.get("index")) else -1
	var out := {
		"fighters": fs, "specs": specs, "winner": fs[wi] if wi == 0 or wi == 1 else null,
		"result": String(raw.result).substr(0, 16) if raw.get("result") is String else null,
		"fightTime": maxf(0.0, float(raw.fightTime)) if _num(raw.get("fightTime")) else 0.0, "tag": null,
	}
	var t = raw.get("tag")
	if t is Dictionary and t.get("members") is Array and t.members.size() == 4:
		var mbs := []
		for mb in t.members:
			if not mb is Dictionary or not mb.get("f") is Dictionary:
				return out
			var side := 1 if _int(mb.get("side")) == 1 else 0
			var f: Dictionary = mb.f
			# (the two in the ring at the end are the same as in fighters)
			var same := -1
			for i in 2:
				if fs[i].name_ == str(f.get("name_", "")) and int(fs[i].index) == side:
					same = i
			var paint = mb.get("spec").get("paint") if mb.get("spec") is Dictionary else null
			mbs.append({"side": side, "f": fs[same] if same >= 0 else _fighter_of(f, side), "spec": {"paint": TSaves.sanitizeBot({"paint": paint}).paint}, "out": mb.get("out") == true})
		var tags = t.get("tags")
		out.tag = {"tags": [_int(tags[0]), _int(tags[1])] if tags is Array and tags.size() == 2 else [0, 0], "members": mbs}
	return out


static func _fighter_of(f: Dictionary, index: int) -> Dictionary:
	var st := {}
	var raw = f.get("stats")
	for k in ["dealt", "landed", "thrown", "blocked", "dodged", "knockdowns", "takedowns", "biggest"]:
		st[k] = maxf(0.0, float(raw.get(k))) if raw is Dictionary and _num(raw.get(k)) else 0.0
	return {
		"index": index, "name_": str(f.get("name_", "")).substr(0, 24), "stats": st,
		"hp": float(f.hp) if _num(f.get("hp")) else 0.0, "hpRatio": clampf(float(f.hpRatio), 0.0, 1.0) if _num(f.get("hpRatio")) else 0.0,
	}


## A big moment for the scrubber (app.ts markMoment), from a sim event as it's handled: the step
## it happened at, and the phase the fight is in now.
static func mark(t: Dictionary, frame: int, phase: String, type: String, data) -> void:
	if phase == "end":
		return
	var kind := "ko" if type == "ko" or type == "eliminated" else "tear" if type == "detach" else "kd" if type == "knockdown" and phase == "fight" else ""
	if kind == "":
		return
	if kind == "kd" and data != null and data.get("defender") != null and data.defender.state == "ko":
		return
	t.marks.append({"frame": frame, "kind": kind})


## How the player's corner did, the fight's length, for the shelf's list: {winner, kind, secs}.
static func outcome(m) -> Dictionary:
	return {"winner": int(m.winner.index) if m.winner != null else -1, "kind": str(m.result) if m.result != null else "", "secs": roundi(float(m.fightTime))}


## The id a tape is saved under (replays.ts replayId): the same fight saved twice is one replay.
static func id_of(t: Dictionary) -> String:
	return "%s-%s" % [_b36(int(t.seed) & 0xffffffff), _b36(int(t.end))]


static func _b36(n: int) -> String:
	const D := "0123456789abcdefghijklmnopqrstuvwxyz"
	if n <= 0:
		return "0"
	var s := ""
	while n > 0:
		s = D[n % 36] + s
		n /= 36
	return s


## A tape read back from a save, made safe (replays.ts sanitizeTape), or null if it can't play.
static func sanitize(raw) -> Variant:
	if not raw is Dictionary:
		return null
	var t: Dictionary = raw
	# (read back through TInit.from_json, "seed" comes as the translated code's "seed_")
	if t.has("seed_") and not t.has("seed"):
		t = t.duplicate()
		t.seed = t.seed_
	if not (t.get("seed") is float or t.get("seed") is int) or not (t.get("end") is float or t.get("end") is int) or int(t.end) <= 0:
		return null
	var coach := []
	for c in _arr(t.get("coach")):
		if c is Dictionary and TCoach.COACH_KINDS.has(c.get("kind")):
			coach.append({"side": 1 if _int(c.get("side")) == 1 else 0, "kind": c.kind, "frame": _int(c.get("frame"))})
	var marks := []
	for k in _arr(t.get("marks")):
		if k is Dictionary and MARK_KINDS.has(k.get("kind")):
			marks.append({"frame": _int(k.get("frame")), "kind": k.kind})
	var tags := []
	for g in _arr(t.get("tags")):
		if g is Dictionary and _num(g.get("frame")):
			tags.append({"side": 1 if _int(g.get("side")) == 1 else 0, "frame": _int(g.frame)})
	var talk := []
	for q in _arr(t.get("talk")).slice(0, 600):
		if not q is Dictionary:
			continue
		if q.get("c") is Array:
			var clips := []
			for x in q.c:
				if x is Array and x.size() >= 3 and x[0] is String and _num(x[1]) and _num(x[2]):
					clips.append([String(x[0]).substr(0, 80), float(x[1]), float(x[2])])
			if not clips.is_empty() and q.get("v") in ["p", "c", "r"]:
				talk.append({"f": _int(q.get("f")), "c": clips, "e": _int(q.get("e")), "v": q.v, "w": float(q.w) if _num(q.get("w")) else 0.6})
		elif _num(q.get("x")):
			talk.append({"f": _int(q.get("f")), "x": _int(q.x), "fade": maxf(0.0, float(q.fade)) if _num(q.get("fade")) else 0.0})
	var out := {
		"a": _bot(t.get("a")), "b": _bot(t.get("b")), "seed": float(int(t.seed) & 0xffffffff), "partners": null,
		"arena": "grand", "cut": maxi(-1, int(t.cut)) if _num(t.get("cut")) else -1,
		"intro": float(t.intro) if _num(t.get("intro")) else -1.0,
		"coach": coach, "tags": tags, "end": _int(t.end), "marks": marks, "talk": talk,
		"result": _summary(t.get("result")), "me": 1 if _int(t.get("me")) == 1 else 0, "online": t.get("online") == true, "teams": ["", ""],
	}
	if t.get("arena") is String and (t.arena == "titan" or TEvents.ARENAS.has(t.arena)):
		out.arena = t.arena
	var p = t.get("partners")
	if p is Dictionary and p.get("a") is Dictionary and p.get("b") is Dictionary:
		out.partners = {"a": _bot(p.a), "b": _bot(p.b)}
	var teams = t.get("teams")
	if teams is Array and teams.size() == 2:
		out.teams = [str(teams[0]).substr(0, 24), str(teams[1]).substr(0, 24)]
	return out


static func _bot(raw):
	return Store.keep_skin(TSaves.sanitizeBot(raw), raw)


static func _arr(v) -> Array:
	return v if v is Array else []


static func _num(v) -> bool:
	return (v is float or v is int) and is_finite(float(v))


static func _int(v) -> int:
	return maxi(0, int(v)) if _num(v) else 0
