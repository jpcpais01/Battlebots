## Runs fights in the fight scene (headless is fine) and logs what the booth says and when, next
## to what just happened in the fight, to check the lines fit the action and that replies and
## conversations chain as in the web.
##   godot --headless --path godot -s res://tests/booth_log.gd -- <fights> [speed] [text.json]
## speed scales time (Engine.time_scale; default 4). text.json maps line ids to their text (dump
## it from scripts/voice/bank.mjs readBank), so the log reads as a transcript.
extends SceneTree

var _fight
var _fights := 2
var _done := 0
var _text := {}
## Recent sim events: [time, description].
var _recent: Array = []
var _lock := Mutex.new()
var _t := 0.0
var _lines := 0
var _replies := 0
var _cuts := 0
var _by_voice := {"p": 0, "c": 0, "r": 0}
var _talk_secs := 0.0
var _intro_hold := 0.0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_fights = int(args[0])
	Engine.time_scale = float(args[1]) if args.size() > 1 else 4.0
	if args.size() > 2 and FileAccess.file_exists(args[2]):
		_text = JSON.parse_string(FileAccess.get_file_as_string(args[2]))
	_fight = load("res://game/fight.tscn").instantiate()
	_fight.booth = Booth.new(null)
	_fight.voice = Voice.new()
	_fight.booth.out = _fight.voice
	_fight.booth.said.connect(_on_said)
	_fight.booth.cut_off.connect(_on_cut)
	get_root().add_child.call_deferred(_fight)


func _desc(type: String, d) -> String:
	match type:
		"hit":
			var s: String = "%s %s %d" % [d.attacker.name_, d.move.id, int(d.damage)]
			for k in ["blocked", "shielded", "crit", "counter", "heavy", "knockdown", "stagger"]:
				if JS.truthy(d.get(k)):
					s += " " + k
			return "hit(" + s + ")"
		"phase":
			return "phase(" + str(d) + ")"
		"ko", "decision", "end":
			return type + "(" + str(d.get("kind", d.get("result", ""))) + ")"
		"detach":
			return "detach(%s part %d fatal %s)" % [d.f.name_, int(d.part), str(d.fatal)]
		"wear":
			return "wear(%s part %d level %d)" % [d.f.name_, int(d.part), int(d.level)]
		"brain":
			return "brain(%s %s)" % [d.f.name_ if d.get("f") != null else "-", d.kind]
		"finisher", "finisherBlow":
			return "%s(%s)" % [type, d.id]
	if d is Dictionary and d.get("f") != null:
		return "%s(%s)" % [type, d.f.name_]
	return type


## (on the sim's worker thread: stamped with the sim clock, handed over under a lock)
func _on_event(type: String, data) -> void:
	if type in ["engage", "entrance", "static", "fistBump", "clinch", "emote", "coach"]:
		return
	if type == "hit" and float(data.damage) < 30.0 and not JS.truthy(data.get("knockdown")):
		return
	var d := _desc(type, data)
	_lock.lock()
	_recent.append([_fight.m.time, d])
	if _recent.size() > 40:
		_recent.pop_front()
	_lock.unlock()


func _on_said(info: Dictionary) -> void:
	_lines += 1
	_by_voice[info.v] += 1
	_talk_secs += info.dur
	if String(info.id).contains(".") and _fight.booth._replies.values().any(func(a): return a.any(func(l): return l.id == info.id)):
		_replies += 1
	var m = _fight.m
	var ctx: Array = []
	_lock.lock()
	for e in _recent:
		if m.time - e[0] < 1.5:
			ctx.append(e[1])
	_lock.unlock()
	var line := "  %6.1f %-9s clk %4.1f | %s e%d %-24s %s%s" % [info.t, m.phase, m.clock, String(info.v).to_upper(), info.e, info.id, ("[" + info.name + "] ") if info.name != "" else "", _text.get(info.id, "")]
	print(line)
	if not ctx.is_empty():
		print("         <- ", ", ".join(ctx.slice(maxi(0, ctx.size() - 4))))


func _on_cut(info: Dictionary) -> void:
	_cuts += 1
	print("  %6.1f   (talked over: %s, fade %.1f)" % [info.t, info.id, info.fade])


func _process(dt: float) -> bool:
	_t += dt
	if _fight.m == null:
		return false
	if not _fight.m.listeners.has(_on_event):
		_fight._sync()
		_lock.lock()
		_recent.clear()
		_lock.unlock()
		_fight.m.on(_on_event)
		print("=== fight %d: %s vs %s (%s vs %s)" % [_done, _fight.m.fighters[0].name_, _fight.m.fighters[1].name_, _fight.m.brains[0].traits.style, _fight.m.brains[1].traits.style])
	if _fight.m.phase == "countdown" and _intro_hold == 0.0:
		_intro_hold = _fight.m.introLength
		print("  (intro held to %.1f s for the booth; default %.1f)" % [_intro_hold, TEntrance.PRESENT * 2.0])
	if _fight._end_time >= 0 and _fight._time - _fight._end_time > 9.0:
		print("  result ", _fight.m.result)
		_done += 1
		_intro_hold = 0.0
		if _done >= _fights:
			print("lines %d (p %d c %d r %d), bound replies %d, talked over %d, voiced %.0f s" % [_lines, _by_voice.p, _by_voice.c, _by_voice.r, _replies, _cuts, _talk_secs])
			return true
		_fight.new_fight()
	return false
