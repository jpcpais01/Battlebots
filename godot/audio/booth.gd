## The commentary booth (a port of the Booth class in src/audio/booth.ts): a play-by-play
## caller, a colour analyst and a robot co-commentator, voiced from the web game's pre-recorded
## clips. This is the director only: it listens to the fight, decides who says what and when,
## and hands clips to the audio side (audio/voice.gd). It reads the match and never writes it.
##
## It tries to sound like a live booth rather than a soundboard: replies come in a beat before
## the last line finishes, a big moment talks over whoever was chatting (they trail off under
## it instead of being cut dead), and quiet spells fill up with conversation about the fight,
## the circuit and the gear.
##
## Randomness is the booth's own RandomNumberGenerator (render side: the sim never sees it).
class_name Booth
extends RefCounted

## A line started: {t, frame, v (voice), id, trig, e (energy), clips, prio, name}. For logs and
## tests; the game doesn't need it.
signal said(info: Dictionary)
## A line was talked over: {t, id, fade}.
signal cut_off(info: Dictionary)

const HISTORY_PATH := "user://booth_heard.json"
const HISTORY_MAX := 900
## Lines per trigger (play-by-play, colour, robot) kept loaded and ready. The rest get one each.
const DECK := {
	"hit.solid": [6, 0],
	"hit.big": [6, 3],
	"hit.jab": [3, 1],
	"hit.straight": [4, 1],
	"hit.hook": [4, 1],
	"hit.uppercut": [3, 1],
	"hit.overhand": [2, 1],
	"hit.body": [4, 2],
	"hit.counter": [4, 2],
	"hit.crit": [3, 2],
	"defence.dodge": [4, 2],
	"defence.block": [3, 1],
	"combo.three": [3, 1],
	"combo.five": [3, 1],
	"stagger": [4, 2],
	"knockdown.any": [4, 2],
	"knockdown.first": [3, 1],
	"getup": [4, 2],
	"down.count": [2, 2],
	"ropes.pinned": [3, 2],
	"kick.round": [3, 1],
	"kick.low": [3, 2],
	"kick.push": [2, 1],
	"lull.chatter": [2, 4, 2],
	"lull.pair": [2, 2, 1],
	"lull.convo": [3, 2, 1],
	"lull.tournament": [1, 2, 1],
	"lull.gear": [1, 2, 1],
	"lull.fighters": [1, 2, 1],
	"lull.robot": [1, 1, 2],
	"lull.boo": [1, 2],
	"ko.call": [3, 0],
	"finisher.start": [3, 2, 2],
	"finisher.impact": [3, 0, 0],
	"ko.finisher": [2, 2, 1],
	"ko.colour": [0, 3],
	"tko.call": [2, 2],
	"detach.arm": [2, 2],
	"detach.fatal.head": [2, 2],
	"intro.preview": [0, 3],
	"state.dominating": [1, 3],
	"state.close": [1, 2],
	"decision.win": [2, 2],
}
const STYLE_KEY := {
	"Brawler": "brawler",
	"Swarmer": "swarmer",
	"Out-fighter": "outfighter",
	"Counter-puncher": "counter",
	"Boxer": "boxer",
}
const NAME_TAGS := ["ii", "x", "mk-3", "v", "zero", "9"]
const SPECIAL := {
	"flurry": "special.flurry",
	"shockUpper": "special.shock",
	"rocketPunch": "special.rocket",
	"hammer": "special.hammer",
}
const KICK := {
	"pushKick": "kick.push",
	"roundhouse": "kick.round",
	"lowKick": "kick.low",
	"spinKick": "kick.spin",
	"flyingKnee": "kick.knee",
	"sweep": "kick.sweep",
}
const PUNCH := {
	"cross": "hit.straight",
	"leadHook": "hit.hook",
	"rearHook": "hit.hook",
	"leadUpper": "hit.uppercut",
	"rearUpper": "hit.uppercut",
	"haymaker": "hit.overhand",
}
## src/sim/damage.ts P.
const P_HEAD := 0
const P_CHEST := 1
const P_TORSO := 2
const P_UPL := 3
const P_FOREL := 4
const P_FISTL := 5
const P_UPR := 6
const P_FORER := 7
const P_FISTR := 8
const P_THIGHL := 9
const P_SHINL := 10
const P_FOOTL := 11
const P_THIGHR := 12
const P_SHINR := 13
const P_FOOTR := 14

## The audio side: ready(file), want(files), prime(files), speak(clips, energy, within, voice)
## (audio/voice.gd, or a stand-in in tests).
var out
var rng := RandomNumberGenerator.new()
var enabled := true
var _man = null
var _by_trig := {}
## Bound replies by lead id.
var _replies := {}
var _heard := {}
var _seq := 0
var _dirty := 0
var _t := 0.0
var m = null
var _online := false
var _used := {}
var _cur = null
var _queue: Array = []
var _last_end := -9.0
## Until when a question and its answer have the floor (only a knockdown or a finish talks over).
var _hold := 0.0
var _excite := 0.3
# what has happened in this fight
var _since_landed := 0.0
var _lull_said := false
var _landed_any := false
var _talk := 0.0
var _fight_t := 0.0
var _combo := {"who": -1, "n": 0, "t": -9.0}
var _body := [0, 0]
var _kds := [0, 0]
var _worst := [0.0, 0.0]
var _once := {}
var _next_look := 0.0
var _next_chat := 0.0
var _next_ropes := 0.0
var _prev_clock := 99.0
var _intros := 0
var _last_hit = null
var _ko_pending = null
var _fatal_called := false
## The finisher being performed, if any (its id).
var _fin = null
## What's been said this fight (booth.ts BoothCue): {f, c: [[file, dur, gap]], e, v, w} or {f, x, fade}.
var _script: Array = []
## Playing a recorded script back (a replay) instead of directing: the next cue to play.
var _playback = null
var _play_at := 0
var _played := {}
## Names the player had voiced on this device: used ahead of the shipped ones.
var _custom := {}


func _init(audio_out = null) -> void:
	out = audio_out
	rng.randomize()
	if FileAccess.file_exists(HISTORY_PATH):
		var h = JSON.parse_string(FileAccess.get_file_as_string(HISTORY_PATH))
		if h is Array:
			for id in h:
				_seq += 1
				_heard[id] = _seq


## The key a bot's name is stored under: lower case, without a trailing tag like "II".
static func name_key(name: String) -> String:
	var w := name.strip_edges().to_lower().replace("\t", " ").split(" ", false)
	if w.size() > 2 and NAME_TAGS.has(w[w.size() - 1]):
		w.remove_at(w.size() - 1)
	return " ".join(w)


var loaded: bool:
	get:
		return _man != null


func name_clip(name: String, cut: String):
	var c = _custom.get(name_key(name))
	return c.get(cut) if c != null else null


func set_custom_name(name: String, clips: Dictionary) -> void:
	_custom[name_key(name)] = clips


func set_manifest(man: Dictionary) -> void:
	_man = man
	_by_trig.clear()
	_replies.clear()
	for l in man.lines:
		if l.f.is_empty():
			continue
		var key: String = l.get("r", "")
		if key != "":
			if not _replies.has(key):
				_replies[key] = []
			_replies[key].append(l)
		else:
			if not _by_trig.has(l.t):
				_by_trig[l.t] = []
			_by_trig[l.t].append(l)
	_restock()


func _rnd() -> float:
	return rng.randf()


func _chance(p: float) -> bool:
	return rng.randf() < p


func _ri(n: int) -> int:
	return mini(n - 1, int(rng.randf() * n))


## Keeps the freshest few lines of every trigger loaded, so whatever happens next has something
## ready to say. Played lines get replaced after each fight.
func _restock() -> void:
	var files: Array = []
	for t in _by_trig:
		var lines: Array = _by_trig[t]
		var deck: Array = DECK.get(t, [1, 1, 1])
		var nr: int = deck[2] if deck.size() > 2 else 1
		for vn in [["p", deck[0]], ["c", deck[1]], ["r", nr]]:
			var n: int = vn[1]
			if n <= 0:
				continue
			# (booth.ts sorts with a jittered comparator; a jittered key is the same idea)
			var pool: Array = []
			for l in lines:
				if l.v == vn[0] and not _used.has(l.id):
					pool.append([_fresh(l) * (0.7 + _rnd() * 0.6), l])
			pool.sort_custom(func(a, b): return a[0] > b[0])
			for k in mini(n, pool.size()):
				var l = pool[k][1]
				files.append(l.f[_ri(l.f.size())][0])
				_thread(l.id, files, 4)
	out.want(files)


## The replies chained under a line, so a whole exchange is ready to play.
func _thread(id: String, files: Array, depth: int) -> void:
	if depth <= 0:
		return
	for r in _replies.get(id, []):
		files.append(r.f[0][0])
		_thread(r.id, files, depth - 1)


## How much a line wants to be said: lines not heard for a long time win.
func _fresh(l) -> float:
	var at = _heard.get(l.id)
	var age: float = 3000.0 if at == null else float(_seq - at)
	return pow(minf(age, 3000.0) + 1.0, 1.6)


# ------------------------------------------------------------------ match
## The booth's script of the fight so far (a copy).
var said_script: Array:
	get:
		return _script.duplicate(true)


## A fight starts (or a replay jumps somewhere: `fresh` false, they pick it up from there).
## With a `talk` script, the booth says exactly that, from this step on, instead of directing.
func begin(match_, online: bool, fresh := true, talk = null) -> void:
	end()
	m = match_
	_script = []
	_playback = talk
	_played.clear()
	if talk != null:
		_play_at = talk.size()
		for i in talk.size():
			if talk[i].f >= m.frame:
				_play_at = i
				break
		# everything still to come, loaded ahead
		var files: Array = []
		for i in range(_play_at, talk.size()):
			if talk[i].has("c"):
				for x in talk[i].c:
					files.append(x[0])
		out.prime(files.slice(0, 12))
		out.want(files)
		return
	_online = online
	_used.clear()
	_once.clear()
	_since_landed = 0.0
	_lull_said = false
	_landed_any = false
	_talk = 0.0
	_fight_t = 0.0
	_combo = {"who": -1, "n": 0, "t": -9.0}
	_body = [0, 0]
	_kds = [0, 0]
	_worst = [0.0, 0.0]
	_next_look = 0.0
	_next_chat = 0.0
	_next_ropes = 0.0
	_prev_clock = m.clock
	_intros = 0
	_last_hit = null
	_ko_pending = null
	_fatal_called = false
	_fin = null
	_hold = 0.0
	var names: Array = []
	for f in m.fighters:
		var n = _names(f)
		if n != null:
			for c in n.values():
				names.append(c[0])
	out.prime(names)
	if not enabled or not fresh:
		return
	var reply: Dictionary
	if online and _chance(0.6):
		reply = {"chain": ["intro.online"], "chance": 0.9}
	elif _chance(0.2):
		reply = {"chain": ["intro.sponsor"], "chance": 0.8}
	else:
		reply = {"chain": ["intro.reply"], "chance": 0.85}
	_push({"chain": ["intro.welcome"], "prio": 50, "voice": "p", "reply": reply}, 0.15, 2.0)


## The fight is over and its screen is gone: stop talking.
func end() -> void:
	if _cur != null:
		_cut()
	for sp in _played.values():
		if not sp.done:
			sp.fade(0.4)
	_played.clear()
	_queue.clear()
	if m != null and _man != null:
		_restock()
	m = null
	_save()


# ------------------------------------------------------------------ events
## A sim event (game.ts onEvent hands every one to booth.event).
func event(type: String, data) -> void:
	if _playback != null:
		return
	if m == null or _man == null or not enabled:
		return
	match type:
		"phase":
			if data == "countdown":
				# the crowd counts it down: the booth lets them
				if _cur != null:
					_cut()
				_queue.clear()
				_hold = 0.0
			elif data == "greet":
				_push({"chain": ["countdown.start"], "prio": 40, "voice": "p"}, 1.4, 2.0)
		"fightStart":
			_say({"chain": ["fight.start"], "prio": 80, "voice": "p"}, 0.3)
		"hit":
			_on_hit(data)
		"finisher":
			# the booth goes up for it: the caller names the move over whatever was being said,
			# colour or the robot jumps in on top, and nothing else gets a word in until it's over
			_fin = data.id
			_queue.clear()
			if _cur != null:
				_cut("p")
			_say({"chain": ["finisher." + data.id, "finisher.start", "hit.big"], "prio": 90, "voice": "p", "about": data.f, "name": 0.45, "follow": 0.9}, 0.6)
		"finisherBlow":
			# the last blow: a scream on impact, and the knockout call names it once they land
			# (Headhunter's is called off the head coming off, just before this)
			if not _fatal_called:
				_say({"chain": ["finisher.impact." + data.id, "finisher.impact", "hit.crit"], "prio": 100, "voice": "p"}, 0.4)
		"knockdown":
			_on_knockdown(data)
		"stagger":
			if m.phase == "fight":
				if JS.truthy(data.blocked):
					_say({"chain": ["defence.guardbreak"], "prio": 55, "voice": "p", "follow": 0.4}, 0.3)
				else:
					_say({"chain": ["stagger"], "prio": 72, "voice": "p", "follow": 0.5, "about": data.defender}, 0.3)
		"getUp":
			var f = data.f
			if f.state != "ko" and m.phase == "fight":
				_say({"chain": ["getup.last", "getup"] if f.knockdowns >= 2 else ["getup"], "prio": 60, "voice": "p", "about": f, "name": 0.4, "follow": 0.4}, 0.5)
		"detach":
			var fatal = data.get("fatal")
			if JS.truthy(fatal):
				_fatal_called = true
				var chain: Array = []
				if _fin != null:
					chain.append("finisher.impact." + _fin)
				chain.append("detach.fatal." + fatal)
				_say({"chain": chain, "prio": 100, "voice": "p", "about": data.f}, 0.3)
				var chain2: Array = ["ko.finisher"] if _fin != null else []
				chain2.append_array(["detach.fatal." + fatal, "ko.colour"])
				_push({"chain": chain2, "prio": 96, "voice": "c"}, 0.2, 6.0)
			else:
				var part := int(data.part)
				var arm := part == P_UPL or part == P_UPR or part == P_FOREL or part == P_FORER
				_say({"chain": ["detach.arm" if arm else "detach.leg", "detach.arm"], "prio": 85, "voice": "p", "follow": 0.7, "about": data.f}, 0.3)
		"wear":
			_on_wear(data)
		"ropes":
			if m.phase == "fight" and _t >= _next_ropes and _chance(0.3):
				_next_ropes = _t + 10.0
				_say({"chain": ["ropes.pinned"], "prio": 28, "about": data.f}, 0.5)
		"dodge":
			if m.phase == "fight":
				if JS.truthy(data.s.move.get("ability")):
					_say({"chain": ["defence.dodge.special", "defence.dodge"], "prio": 45, "voice": "p", "about": data.f, "name": 0.3, "follow": 0.5}, 0.3)
				elif _chance(0.28):
					_say({"chain": ["defence.dodge"], "prio": 28, "voice": "p", "about": data.f, "name": 0.2, "follow": 0.12}, 0.3)
		"whiff":
			if m.phase == "fight":
				var mv = data.s.move
				if JS.truthy(mv.get("ability")) and _chance(0.75):
					_say({"chain": ["special.whiff"], "prio": 35, "about": data.f}, 0.4)
				elif JS.truthy(mv.get("power")) and _chance(0.12):
					_say({"chain": ["miss.whiff"], "prio": 18, "about": data.f}, 0.4)
		"brain":
			if m.phase == "fight" and data.get("f") != null:
				var k: String = data.kind
				var trig: String = {"switch": "brain.switch", "retreat": "brain.retreat", "rally": "brain.rally", "read": "brain.read", "adapt": "brain.furious", "taunt": "taunt"}.get(k, "")
				var p := 42 if k == "rally" else (40 if k == "taunt" else 30)
				if trig != "" and _chance(0.75 if k == "taunt" else 0.5):
					_say({"chain": [trig], "prio": p, "about": data.f, "name": 0.5}, 0.8)
		"coach":
			# the corner sends their bot forward: the booth picks up on the charge
			if m.phase == "fight" and data.kind != "defend" and _chance(0.7 if data.kind == "allIn" else 0.4):
				_say({"chain": ["brain.rally"], "prio": 38, "about": data.f, "name": 0.5}, 0.6)
		"ko":
			# the finishing hit is reported right after this, so the call waits for it
			_ko_pending = data
		# a tag team match (no lines of its own yet: the nearest ones)
		"tag":
			if m.phase == "fight" and not JS.truthy(data.get("elim")):
				_say({"chain": ["brain.rally"], "prio": 60, "about": data.to, "name": 0.5}, 0.6)
		"eliminated":
			_say({"chain": ["knockdown.any"], "prio": 92, "about": data.loser}, 0.3)
		"decision":
			_say({"chain": ["decision.time"], "prio": 100, "voice": "p"}, 0.3)
			var w = data.get("winner")
			if w == null:
				_push({"chain": ["decision.draw"], "prio": 96}, 0.2, 8.0)
			else:
				var close := absf(m.fighters[0].hpRatio - m.fighters[1].hpRatio) < 0.1
				_winner(w)
				_push({"chain": ["decision.close", "decision.win"] if close else ["decision.win"], "prio": 94}, 0.2, 10.0)
		"emote":
			if (m.phase == "ko" or m.phase == "end") and data.f == m.winner and not _once.has("celebrate"):
				_once["celebrate"] = true
				if _chance(0.6):
					_push({"chain": ["win.celebrate"], "prio": 30, "about": data.f, "name": 0.3}, 0.5, 6.0)
		"end":
			_push({"chain": ["wrap"], "prio": 90, "voice": "p", "reply": {"chain": ["wrap.reply"], "chance": 0.85}}, 1.8, 8.0)


func _on_hit(h) -> void:
	if _ko_pending != null:
		_finish(h)
		return
	_last_hit = h
	if JS.truthy(h.get("finisher")):
		return
	var a = h.attacker
	var ai := int(a.index)
	var blocked := JS.truthy(h.blocked)
	var shielded := JS.truthy(h.shielded)
	if not blocked and not shielded:
		_since_landed = 0.0
		_lull_said = false
		_landed_any = true
		if h.zone == "body":
			_body[ai] += 1
		if ai == _combo.who and _t - _combo.t < 1.6:
			_combo.n += 1
		else:
			_combo = {"who": ai, "n": 1, "t": _t}
		_combo.t = _t
	if m.phase != "fight" or JS.truthy(h.knockdown) or JS.truthy(h.stagger):
		return
	if shielded:
		if _chance(0.35):
			_say({"chain": ["defence.shield"], "prio": 25, "about": h.defender}, 0.3)
		return
	var kick: bool = h.move.kind == "kick"
	if blocked:
		if JS.truthy(h.get("guardBreak")):
			_say({"chain": ["defence.guardbreak"], "prio": 55, "voice": "p", "follow": 0.4}, 0.3)
		elif kick and _chance(0.25):
			_say({"chain": ["kick.blocked", "defence.block"], "prio": 24, "about": h.defender}, 0.3)
		elif _chance(0.1):
			_say({"chain": ["defence.block"], "prio": 20, "about": h.defender}, 0.3)
		return
	if m.clock < 5.0 and not _once.has("final"):
		_once["final"] = true
		_say({"chain": ["clock.final"], "prio": 64, "voice": "p"}, 0.3)
		return
	if _combo.n == 3 and _chance(0.7):
		_say({"chain": ["combo.three"], "prio": 55, "voice": "p", "about": a, "name": 0.3, "follow": 0.3}, 0.3)
		return
	if _combo.n == 5 or _combo.n == 8:
		_say({"chain": ["combo.five"], "prio": 66, "voice": "p", "about": a, "follow": 0.5}, 0.3)
		return
	var id: String = h.move.id
	var heavy: bool = JS.truthy(h.heavy) or float(h.damage) >= 55.0
	var special: String = SPECIAL.get(id, "")
	# most specific call first; how likely a call is, and how much it matters, follows the best reason
	var acc := {"chain": [], "prio": 0, "p": 0.0, "follow": 0.0}
	var add := func(t: String, pr: int, ch: float, fo: float) -> void:
		acc.chain.append(t)
		acc.prio = maxi(acc.prio, pr)
		acc.p = maxf(acc.p, ch)
		acc.follow = maxf(acc.follow, fo)
	if JS.truthy(h.crit):
		add.call("hit.crit", 60, 0.8, 0.5)
	if JS.truthy(h.counter):
		add.call("hit.counter", 55, 0.7, 0.5)
	if heavy and _chance(0.5):
		add.call("hit.big", 62, 0.9, 0.45)
	if special != "":
		add.call(special, 58, 0.85, 0.45)
	elif KICK.has(id):
		add.call(KICK[id], 45, 0.55, 0.25)
	elif id == "jab":
		add.call("hit.jab", 25, 0.15, 0.1)
	else:
		if h.zone == "body" and _chance(0.5):
			add.call("hit.body", 38, 0.45, 0.2)
		if PUNCH.has(id):
			add.call(PUNCH[id], 38, 0.4, 0.12)
	if heavy:
		add.call("hit.big", 62, 0.9, 0.45)
	if id != "jab":
		add.call("hit.solid", 35, 0.35, 0.12)
	if not _chance(acc.p):
		return
	var side: String = a.leadSide if h.move.limb == "lead" else a.rearSide
	_say({"chain": acc.chain, "prio": acc.prio, "voice": "p", "about": a, "name": 0.3, "follow": acc.follow, "side": side}, 0.25)


func _on_knockdown(h) -> void:
	var d = h.defender
	if m.phase != "fight" or d.state == "ko":
		return
	var di := int(d.index)
	var counted: bool = d.knockdowns > _kds[di]
	_kds[di] = int(d.knockdowns)
	if not counted:
		_say({"chain": ["knockdown.sweep"], "prio": 60, "voice": "p", "follow": 0.4}, 0.3)
		return
	var chain: Array = []
	if h.move.kind == "kick" and _chance(0.5):
		chain.append("knockdown.kick")
	if JS.truthy(h.counter) and _chance(0.6):
		chain.append("knockdown.counter")
	if d.knockdowns == 2:
		chain.append("knockdown.second")
	if m.fighters[0].knockdowns + m.fighters[1].knockdowns == 1:
		chain.append("knockdown.first")
	chain.append("knockdown.any")
	_say({"chain": chain, "prio": 90, "voice": "p", "follow": 0.6}, 0.3)
	_push({"chain": ["down.count"], "prio": 45}, 2.4, 1.6, func() -> bool: return d.state == "down")


func _on_wear(w) -> void:
	if m.phase != "fight":
		return
	var part := int(w.part)
	var level := int(w.level)
	if level == 0:
		if _chance(0.3):
			_say({"chain": ["wear.dented"], "prio": 22, "voice": "c", "about": w.f}, 1.0)
		return
	if level == 2:
		if (part == P_FISTL or part == P_FISTR or part == P_FOOTL or part == P_FOOTR) and _chance(0.7):
			_say({"chain": ["wear.wrecked"], "prio": 40, "about": w.f, "name": 0.4}, 0.8)
		return
	var t := "wear.arm"
	if part == P_HEAD:
		t = "wear.head"
	elif part == P_CHEST:
		t = "wear.chest"
	elif part == P_TORSO:
		t = "wear.torso"
	elif part >= P_THIGHL:
		t = "wear.leg"
	if _chance(0.85):
		_say({"chain": [t], "prio": 58 if part == P_HEAD else 50, "about": w.f, "name": 0.5, "follow": 0.5}, 0.8)


## The finishing call, once the hit that ended it is known.
func _finish(h) -> void:
	var k = _ko_pending
	_ko_pending = null
	if k.kind == "Dismantled":
		if not _fatal_called:
			_say({"chain": ["detach.fatal.%s" % k.reason, "ko.call"], "prio": 100, "voice": "p"}, 0.3)
			_push({"chain": ["detach.fatal.%s" % k.reason, "ko.colour"], "prio": 96, "voice": "c"}, 0.2, 6.0)
	elif k.kind == "TKO":
		_say({"chain": ["tko.call"], "prio": 100, "voice": "p"}, 0.3)
		_push({"chain": ["tko.call", "ko.colour"], "prio": 96, "voice": "c"}, 0.2, 6.0)
	else:
		var chain: Array = []
		var ft := _fight_t
		# a finisher's knockout is called for what it was; the usual calls back it up
		if _fin != null:
			chain.append_array(["ko.finisher." + _fin, "ko.finisher"])
		if h != null and h.move.kind == "kick" and _chance(0.5):
			chain.append("ko.kick")
		if h != null and JS.truthy(h.counter) and _chance(0.6):
			chain.append("ko.counter")
		if m.clock <= 10.0 and _chance(0.6):
			chain.append("ko.late")
		if ft < 20.0 and _chance(0.6):
			chain.append("ko.early")
		if _worst[int(k.winner.index)] < -0.25 and _chance(0.7):
			chain.append("ko.comeback")
		chain.append("ko.call")
		# after a finisher the impact scream may still be ringing out: the call waits for it
		_say({"chain": chain, "prio": 100, "voice": "p"}, 2.5 if _fin != null else 0.3)
		# the specific pools hold colour lines too; the general reaction is the fallback
		var col: Array = chain.filter(func(c): return c != "ko.call")
		col.append("ko.colour")
		_push({"chain": col, "prio": 96, "voice": "c"}, 0.2, 6.0)
	_winner(k.winner)


## "And the winner is..." plus the winner's name, if we have it.
func _winner(f) -> void:
	var n = _names(f)
	if n == null or n.get("scream") == null:
		return
	_push({"chain": ["name.win"], "prio": 95, "voice": "p", "about": f, "name": 1.0}, 0.4, 12.0)


# ------------------------------------------------------------------ tick
## Every frame (game.ts frame): `excite` is the crowd's (CrowdMood.excite), `live` false while
## paused.
func tick(dt: float, excite: float, live: bool) -> void:
	_t += dt
	_excite = excite
	if _playback != null:
		if m != null and enabled:
			_replay(_playback)
		return
	if _ko_pending != null and m != null:
		_finish(_last_hit)
	var c = _cur
	if c != null:
		if m != null and m.phase == "fight":
			_talk += dt
		if c.speech.done or _t > c.until:
			_finished()
		# nearly done: let the next voice in now, the way people answer before the last word
		# has quite landed; this line plays out underneath
		elif not c.handed and c.speech.left() <= c.overlap:
			_hand_off(c)
	if m == null or _man == null or not enabled:
		return
	if live and m.phase == "fight":
		_fight_t += dt
		_since_landed += dt
		_watch()
	_drain()


## Say what the script says up to this step.
func _replay(talk: Array) -> void:
	while _play_at < talk.size() and talk[_play_at].f <= m.frame:
		var i := _play_at
		_play_at += 1
		var c: Dictionary = talk[i]
		if c.has("c"):
			# a cue that's well behind (a fast replay) is skipped rather than piled up
			if m.frame - c.f > 30:
				continue
			var clips: Array = []
			for x in c.c:
				clips.append({"clip": [x[0], x[1]], "gap": x[2]})
			_played[i] = out.speak(clips, c.e, c.w + 0.35, c.v)
		else:
			var sp = _played.get(int(c.x))
			if sp == null:
				continue
			if c.fade > 0:
				sp.fade(c.fade)
			else:
				sp.stop()


func _finished() -> void:
	var c = _cur
	_cur = null
	_last_end = _t
	if not c.stopped and not c.handed:
		_answer(c, 0.12)


## The next voice comes in over the end of this line, which keeps playing on its own.
func _hand_off(c) -> void:
	c.handed = true
	_cur = null
	var left: float = c.speech.left()
	_last_end = _t + left
	_answer(c, 0.0, left)


## Whoever answers a line that has just finished (or is finishing).
func _answer(c, after: float, left := 0.0) -> void:
	if not _reply(c, after, left):
		_hold = minf(_hold, _t + left)


func _reply(c, after: float, left: float) -> bool:
	# a line from the same voice waits for the last one to end; another voice can overlap it
	var lv: String = c.line.v
	var when := func(v: String) -> float: return left + 0.15 if v == lv else after
	var bound: Array = _replies.get(c.line.id, [])
	var cs: Dictionary = c.say
	if not bound.is_empty():
		var line = bound[_ri(bound.size())]
		_push({"chain": [], "line": line, "prio": cs.prio - 1, "quick": true}, when.call(line.v), 2.5)
	elif cs.get("reply") != null and _chance(cs.reply.chance):
		_push({"chain": cs.reply.chain, "prio": cs.prio - 1, "voice": "c", "quick": true}, when.call("c"), 2.5)
	elif cs.get("follow", 0.0) > 0.0 and lv == "p" and _chance(cs.follow):
		# colour usually; the robot chips in with a reading now and then
		var v := "r" if _chance(0.3) and _has(cs.chain, "r") else "c"
		_push({"chain": cs.chain, "prio": cs.prio - 8, "voice": v, "about": cs.get("about"), "side": cs.get("side", ""), "quick": true}, when.call(v) + 0.1, 2.0)
	else:
		return false
	return true


## Waits its turn: someone is answering a question, or a finisher is being called, and this is
## no knockdown or finish.
func _held(s: Dictionary) -> bool:
	return (_t < _hold or (m != null and m.fin != null)) and not s.get("quick", false) and s.prio < 90


## Still talking, or about to: the opening waits for this before the countdown.
var busy: bool:
	get:
		if _cur != null or _t < _hold:
			return true
		for q in _queue:
			if q.until >= _t:
				return true
		return false


## Any line from this voice in these triggers.
func _has(chain: Array, v: String) -> bool:
	for t in chain:
		for l in _by_trig.get(t, []):
			if l.v == v:
				return true
	return false


## Clock calls, the scoreboard, and filling quiet moments.
func _watch() -> void:
	var a = m.fighters[0]
	var b = m.fighters[1]
	var pc := _prev_clock
	_prev_clock = m.clock
	if pc > 60.0 and m.clock <= 60.0:
		_say({"chain": ["clock.60"], "prio": 38}, 1.5)
	if pc > 30.0 and m.clock <= 30.0:
		var lead = a if a.hpRatio >= b.hpRatio else b
		_say({"chain": ["clock.30"], "prio": 48, "about": lead if _chance(0.5) else lead.opp}, 1.5)
	if pc > 10.0 and m.clock <= 10.0:
		_say({"chain": ["clock.10"], "prio": 66, "voice": "p"}, 0.6)
	if _fight_t > 20.0:
		for f in m.fighters:
			var i := int(f.index)
			_worst[i] = minf(_worst[i], f.hpRatio - f.opp.hpRatio)
	if _since_landed > 7.0 and not _lull_said:
		_lull_said = true
		if _chance(0.7):
			_say({"chain": ["lull.boo"], "prio": 25}, 1.5)
	if _cur != null or not _queue.is_empty() or _t - _last_end < 1.2:
		return
	if _t >= _next_look and _t - _last_end > 2.2:
		_next_look = _t + 5.0 + _rnd() * 4.0
		var s = _look()
		if s != null:
			_say(s, 1.0)
			return
	# a quiet spell: talk about the fight, the circuit, the gear, anything; a live booth is
	# rarely silent for long, and a big moment just talks over it
	if _since_landed > 1.5 and _t - _last_end > 1.6 + _rnd() * 1.4 and _t >= _next_chat and _talk < _fight_t * 0.8:
		_next_chat = _t + 2.5 + _rnd() * 2.5
		_say({"chain": [_chat(), "lull.chatter"], "prio": 10}, 1.0)


func _first(key: String) -> bool:
	if _once.has(key):
		return false
	_once[key] = true
	return true


## Something worth pointing out about the state of the fight, if anything.
func _look():
	var ft := _fight_t
	var a = m.fighters[0]
	var b = m.fighters[1]
	# early: the matchup and what the bots are about
	if ft < 25.0 and _intros < 2:
		var opts: Array = []
		for f in m.fighters:
			var i := int(f.index)
			var style: String = STYLE_KEY.get(m.brains[i].traits.style, "")
			if style != "" and _names(f) != null and not _once.has("style%d" % i):
				opts.append({"chain": ["intro.style." + style], "prio": 15, "voice": "c", "about": f, "name": 1.0})
		if not _once.has("matchup"):
			opts.append({"chain": ["intro.matchup"], "prio": 15, "voice": "c"})
		if not _once.has("preview") and ft < 12.0:
			opts.append({"chain": ["intro.preview"], "prio": 15, "voice": "c"})
		if not _landed_any and ft < 8.0 and not _once.has("opening"):
			opts.append({"chain": ["fight.opening"], "prio": 15})
		if not opts.is_empty() and _chance(0.8):
			var s: Dictionary = opts[_ri(opts.size())]
			_intros += 1
			var c0: String = s.chain[0]
			_once["matchup" if c0 == "intro.matchup" else ("preview" if c0 == "intro.preview" else ("opening" if c0 == "fight.opening" else "style%d" % int(s.about.index)))] = true
			return s
	for f in m.fighters:
		if f.hpRatio < 0.2 and _first("low%d" % int(f.index)):
			return {"chain": ["state.lowhp"], "prio": 30, "about": f, "name": 0.6}
	if a.hpRatio < 0.35 and b.hpRatio < 0.35 and _first("bothhurt"):
		return {"chain": ["state.bothhurt"], "prio": 30}
	for f in m.fighters:
		if _worst[int(f.index)] < -0.25 and f.hpRatio >= f.opp.hpRatio and _first("comeback%d" % int(f.index)):
			return {"chain": ["state.comeback"], "prio": 35, "about": f, "name": 0.7}
	for f in m.fighters:
		var i := int(f.index)
		if _body[i] >= 8 and _first("body%d" % i):
			return {"chain": ["state.bodywork"], "prio": 20, "voice": "c", "about": f, "name": 0.5}
		if f.staminaRatio < 0.2 and ft > 30.0 and _first("tired%d" % i):
			return {"chain": ["state.tired"], "prio": 20, "voice": "c", "about": f, "name": 0.6}
		var cond = f.parts.cond
		var legs := minf(cond[P_THIGHL] + cond[P_SHINL], cond[P_THIGHR] + cond[P_SHINR]) / 2.0
		if legs < 0.5 and _first("legs%d" % i):
			return {"chain": ["state.legwork"], "prio": 20, "voice": "c", "about": f, "name": 0.6}
	if ft > 25.0:
		var lead = a if a.hpRatio >= b.hpRatio else b
		var r: float = lead.hpRatio / maxf(0.01, lead.opp.hpRatio)
		var dk := "dom%d" % int(floorf(ft / 25.0))
		if r > 2.0 and not _once.has(dk):
			_once[dk] = true
			var s := {"chain": ["state.dominating"], "prio": 20, "about": lead if _chance(0.7) else lead.opp, "name": 0.6}
			# (booth.ts draws the voice before the bot)
			if _chance(0.8):
				s.voice = "c"
			return s
		var ck := "close%d" % int(floorf(ft / 30.0))
		if absf(a.hpRatio - b.hpRatio) < 0.1 and not _once.has(ck):
			_once[ck] = true
			return {"chain": ["state.close"], "prio": 20}
	return null


# ------------------------------------------------------------------ speaking
## Says it now if it's important enough, otherwise waits up to `wait` seconds for a gap.
func _say(s: Dictionary, wait: float) -> void:
	var c = _cur
	if c == null and not _held(s) and _t - _last_end >= _breath(s) and not _queue_beats(s):
		if _start(s):
			return
	if c != null and not _held(s) and _overrides(s, c):
		_cut(s.get("voice", ""))
		if _start(s):
			return
	_push(s, 0.0, wait)


func _queue_beats(s: Dictionary) -> bool:
	for q in _queue:
		if q.say.prio > s.prio and q.from <= _t:
			return true
	return false


func _push(s: Dictionary, after: float, wait: float, valid = null) -> void:
	var from := _t + after
	_queue.append({"say": s, "from": from, "until": from + wait, "valid": valid})
	# keep the queue short: a reaction that waits behind three others is stale anyway
	if _queue.size() > 6:
		_queue.sort_custom(func(x, y): return x.say.prio > y.say.prio)
		_queue.resize(6)


func _drain() -> void:
	if _queue.is_empty():
		return
	_queue = _queue.filter(func(q): return q.until >= _t and (q.valid == null or q.valid.call()))
	var best = null
	for q in _queue:
		if q.from <= _t and not _held(q.say) and (best == null or q.say.prio > best.say.prio):
			best = q
	if best == null:
		return
	var c = _cur
	if c != null:
		if _overrides(best.say, c):
			var v: String = best.say.get("voice", "")
			if v == "" and best.say.get("line") != null:
				v = best.say.line.v
			_cut(v)
		else:
			return
	elif _t - _last_end < _breath(best.say):
		return
	for i in _queue.size():
		if is_same(_queue[i], best):
			_queue.remove_at(i)
			break
	# a line with nothing ready to say is dropped, and the next one gets its turn
	if not _start(best.say):
		_drain()


## Stops the current line for something bigger. Talked over by someone else, it trails off
## underneath (longer for a conversation); a voice cutting itself off just stops.
func _cut(next := "") -> void:
	var c = _cur
	c.stopped = true
	var convo: bool = c.line.get("n", 0) > 0
	var fade := 0.0 if next != "" and next == c.line.v and not convo else (1.4 if convo else 0.8)
	if fade > 0.0:
		c.speech.fade(fade)
	else:
		c.speech.stop()
	if m != null and c.cue >= 0:
		_script.append({"f": m.frame, "x": c.cue, "fade": fade})
	cut_off.emit({"t": _t, "id": c.line.id, "fade": fade})
	_cur = null
	_last_end = _t


func _start(s: Dictionary) -> bool:
	var line = s.get("line")
	if line == null:
		line = _pick(s)
	if line == null:
		return false
	var takes: Array = line.f.filter(func(f): return out.ready(f[0]))
	if takes.is_empty():
		return false
	var clip: Array = takes[_ri(takes.size())]
	var clips: Array = []
	var about = s.get("about")
	var chain: Array = s.chain
	var c0: String = chain[0] if not chain.is_empty() else ""
	var need_name := _needs_name(s, line)
	var named := ""
	if about != null and line.v != "r" and (need_name or _chance(s.get("name", 0.0))):
		var n = _names(about)
		var cut := "call"
		if line.v == "c":
			cut = "ccall"
		elif c0 == "name.win" or line.e >= 4:
			cut = "scream"
		elif line.e == 3:
			cut = "hype"
		var nc = n.get(cut) if n != null else null
		if nc != null and out.ready(nc[0]):
			named = about.name_
			# the winner's name comes after "And the winner is...", everything else leads with it
			if c0 == "name.win":
				clips = [{"clip": clip, "gap": 0.35}, {"clip": nc, "gap": 0.0}]
			else:
				clips = [{"clip": nc, "gap": 0.22 if line.v == "c" else 0.08}, {"clip": clip, "gap": 0.0}]
		elif need_name:
			return false
	if clips.is_empty():
		clips = [{"clip": clip, "gap": 0.0}]
	var dur := 0.0
	for x in clips:
		dur += float(x.clip[1]) + float(x.gap)
	var within := 0.25 if s.prio >= 40 else 0.6
	var speech = out.speak(clips, line.e, within, line.v)
	var cue := -1
	if m != null:
		var cc: Array = []
		for x in clips:
			cc.append([x.clip[0], x.clip[1], x.gap])
		_script.append({"f": m.frame, "c": cc, "e": line.e, "v": line.v, "w": within})
		cue = _script.size() - 1
	# the answer gets decoded while this line plays, so it lands right on the hand-off
	var answers: Array = _replies.get(line.id, [])
	if not answers.is_empty():
		var files: Array = []
		for r in answers:
			var got: Array = r.f.filter(func(f): return out.ready(f[0]))
			for f in (got if not got.is_empty() else r.f.slice(0, 1)):
				files.append(f[0])
		out.prime(files)
	# big calls jump in hard on the end of the last line; chat leaves a natural beat
	var overlap := 0.2 if line.get("n", 0) > 0 else (0.3 + _rnd() * 0.25 if line.e >= 3 else 0.1 + _rnd() * 0.3)
	_cur = {"say": s, "line": line, "speech": speech, "until": _t + within + dur + 0.25, "stopped": false, "handed": false, "overlap": overlap, "cue": cue}
	# a line someone answers keeps the floor until the answer is over
	var quick: bool = s.get("quick", false)
	if not quick and _t < _hold:
		_queue = _queue.filter(func(q): return not q.say.get("quick", false))
	if not answers.is_empty() or s.get("reply") != null:
		_hold = _t + within + dur + 2.5
	elif quick:
		_hold = _t + within + dur
	else:
		_hold = 0.0
	_used[line.id] = true
	_seq += 1
	_heard[line.id] = _seq
	_dirty += 1
	# (not mid-fight: end() saves when it's over, so no file write lands in a fight's frame)
	if _dirty >= 12 and m == null:
		_save()
	said.emit({"t": _t, "frame": m.frame if m != null else -1.0, "v": line.v, "id": line.id, "trig": line.t, "e": line.e, "clips": clips, "prio": s.prio, "name": named, "chain": chain, "dur": dur})
	return true


## The freshest line that fits, from the first trigger in the chain that has one ready.
func _pick(s: Dictionary):
	var sv: String = s.get("voice", "")
	for t in s.chain:
		var pool = _by_trig.get(t)
		if pool == null:
			continue
		var sum := 0.0
		var ok: Array = []
		for l in pool:
			if _used.has(l.id):
				continue
			# asked for the analyst, the robot may take it instead
			if sv != "" and l.v != sv and not (sv == "c" and l.v == "r"):
				continue
			if l.v == "r" and _needs_name(s, l):
				continue
			if l.has("g") and m != null and not _fits(l.g, s):
				continue
			if not l.f.any(func(f): return out.ready(f[0])):
				continue
			var fit := 1.0 / (1.0 + absf(l.e - (1.0 + _excite * 3.0)) * 0.35)
			var w := _fresh(l) * fit * (0.45 if sv == "c" and l.v == "r" else 1.0)
			ok.append([l, w])
			sum += w
		if ok.is_empty():
			# nothing loaded for this one yet: fetch some for next time
			var fetch: Array = []
			for l in pool:
				if not _used.has(l.id):
					fetch.append(l.f[0][0])
					if fetch.size() >= 2:
						break
			out.want(fetch)
			continue
		var r := _rnd() * sum
		for lw in ok:
			r -= lw[1]
			if r <= 0.0:
				return lw[0]
		return ok[ok.size() - 1][0]
	return null


func _fits(tags: Array, s: Dictionary) -> bool:
	var about = s.get("about")
	for g in tags:
		match g:
			"left", "right":
				if s.get("side", "") != ("L" if g == "left" else "R"):
					return false
			"ahead", "behind":
				if about == null or _names(about) == null:
					return false
				var ahead: bool = about.hpRatio >= about.opp.hpRatio
				if ahead != (g == "ahead"):
					return false
			"early":
				if _fight_t > 30.0:
					return false
			"late":
				if m.clock > 30.0:
					return false
			"online":
				if not _online:
					return false
			"cpu":
				if _online:
					return false
			"any", "once":
				pass
			_:
				# style matchups: "brawler-vs-outfighter", "boxer-vs-any", "same-style"
				var sa: String = STYLE_KEY.get(m.brains[0].traits.style, "")
				var sb: String = STYLE_KEY.get(m.brains[1].traits.style, "")
				if g == "same-style":
					if sa != sb:
						return false
					continue
				var xy: PackedStringArray = g.split("-vs-")
				if xy.size() < 2:
					continue
				if xy[1] == "any":
					if sa != xy[0] and sb != xy[0]:
						return false
				elif not ((sa == xy[0] and sb == xy[1]) or (sa == xy[1] and sb == xy[0])):
					return false
	return true


func _names(f):
	var k := name_key(f.name_)
	var c = _custom.get(k)
	if c != null:
		return c
	return _man.names.get(k) if _man != null else null


func _save() -> void:
	_dirty = 0
	var ids: Array = _heard.keys()
	ids.sort_custom(func(a, b): return _heard[a] < _heard[b])
	if ids.size() > HISTORY_MAX:
		ids = ids.slice(ids.size() - HISTORY_MAX)
	var fh := FileAccess.open(HISTORY_PATH, FileAccess.WRITE)
	if fh != null:
		fh.store_string(JSON.stringify(ids))


## Seconds of silence a line needs after the last one: big moments and answers don't wait.
static func _breath(s: Dictionary) -> float:
	if s.get("quick", false) or s.prio >= 60:
		return 0.05
	return 0.25 if s.prio >= 40 else 0.7


## Whether a new line talks over the current one. Someone else jumping in on a big moment needs
## less of a reason than a voice interrupting itself, and nobody talks over the finish.
static func _overrides(s: Dictionary, c) -> bool:
	if s.prio < 40:
		return false
	var v: String = s.get("voice", "")
	if v == "" and s.get("line") != null:
		v = s.line.v
	return s.prio >= c.say.prio + (10 if v != "" and v != c.line.v else 15)


## Lines that only make sense after a bot's name clip.
static func _needs_name(s: Dictionary, l) -> bool:
	var chain: Array = s.chain
	var c0: String = chain[0] if not chain.is_empty() else ""
	if c0.begins_with("intro.style") or c0 == "name.win":
		return true
	for g in l.get("g", []):
		if g == "ahead" or g == "behind":
			return true
	return false


## What the booth talks about in a quiet spell.
func _chat() -> String:
	var r := _rnd()
	if r < 0.26:
		return "lull.convo"
	if r < 0.42:
		return "lull.chatter"
	if r < 0.54:
		return "lull.pair"
	if r < 0.66:
		return "lull.tournament"
	if r < 0.78:
		return "lull.gear"
	if r < 0.9:
		return "lull.fighters"
	return "lull.robot"
