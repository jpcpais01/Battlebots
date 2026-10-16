## Whole fights stepped as fast as possible with every sim event going through fight.gd's
## _arena_event and the arena's per-frame calls (2 sim steps a frame): catches payload mistakes
## and reports how worked up the house gets.
##   godot --headless --path godot -s res://tests/arena_soak.gd -- <fights>
extends SceneTree

var _fight
var _f := 0
var _events := []


func _init() -> void:
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _q(type: String, data) -> void:
	_events.append([type, data])


func _process(_dt: float) -> bool:
	_f += 1
	if _f < 3:
		return false
	_fight._sync()
	_fight.set_process(false)
	var arena: Arena = _fight.arena
	var mood: CrowdMood = _fight.crowd_mood
	var n := int(OS.get_cmdline_user_args()[0]) if OS.get_cmdline_user_args().size() > 0 else 3
	var counts := {}
	var t0 := Time.get_ticks_usec()
	var frames := 0
	var arena_us := 0
	for k in n:
		var rng := TMath.Rng.new(float(1000 + k * 77))
		var a = TLoadout.randomBot(rng)
		var b = TLoadout.randomBot(rng, 0.35, a.paint)
		var m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
		m.on(_q)
		m.skipIntro()
		var peak := 0.0
		while m.phase != "end" and m.frame < 30000:
			m.step(1.0 / 120.0)
			m.step(1.0 / 120.0)
			for e in _events:
				counts[e[0]] = counts.get(e[0], 0) + 1
				_fight._arena_event(e[0], e[1])
			_events.clear()
			var dt := 1.0 / 60.0
			var ta := Time.get_ticks_usec()
			var bodies := []
			for i in 2:
				var js: Array[Vector3] = []
				for j in 16:
					var p = m.fighters[i].body.pos[j]
					js.append(Vector3(p.x, p.y, p.z))
				bodies.append(js)
			arena.press_ropes(bodies, [1.0, 1.0])
			mood.tick(dt, m.phase, m.clock, m.fighters[0].hpRatio, m.fighters[1].hpRatio)
			arena.crowd.update(dt, mood.excite, m.phase == "fight" or m.phase == "greet")
			arena.score(dt, {"names": [m.fighters[0].name_, m.fighters[1].name_], "hp": [m.fighters[0].hpRatio, m.fighters[1].hpRatio], "clock": m.clock, "phase": m.phase, "presenting": int(m.presenting)})
			arena.update(dt, frames * dt)
			arena_us += Time.get_ticks_usec() - ta
			peak = maxf(peak, arena.hype)
			frames += 1
		print("fight %d: %s at frame %d, peak hype %.2f, mood %.2f" % [k, m.result, m.frame, peak, mood.excite])
	print("events: ", counts)
	print("frames %d, %.3f ms each incl. sim; arena calls %.3f ms" % [frames, (Time.get_ticks_usec() - t0) / 1000.0 / frames, arena_us / 1000.0 / frames])
	return true
