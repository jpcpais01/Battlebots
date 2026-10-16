## Headless checks of the live crowd: its sounds load, its bus is there, the mood calls the
## web's reactions for a few moments, and the faders ease like crowd.ts's AudioParams.
##   godot --headless --path godot -s res://tests/crowd_audio_test.gd
extends SceneTree

var _fails := 0


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _cues(mood: CrowdMoodCues) -> String:
	var s := PackedStringArray()
	for c in mood.cues:
		s.append("%s %.2f @%.2f" % [c.kind, c.gain, c.delay])
	mood.cues.clear()
	return ", ".join(s)


func _initialize() -> void:
	var crowd := CrowdAudio.new()
	get_root().add_child.call_deferred(crowd)
	await process_frame
	_check(crowd._murmur.stream != null and crowd._roar.stream != null and crowd._applause.stream != null, "beds loaded")
	_check(crowd._murmur.playing and (crowd._murmur.stream as AudioStreamOggVorbis).loop, "beds loop")
	_check(crowd._shots.ooh.size() == 2 and crowd._shots.cheer.size() == 2 and crowd._shots.boo.size() == 1, "a session's reactions: 2 ooh, 2 cheer, 1 boo")
	_check(crowd._whistles.size() >= 8, "whistles loaded (%d)" % crowd._whistles.size())
	_check(AudioServer.get_bus_index(CrowdAudio.TONE_BUS) >= 0 and crowd._tone != null, "tone bus")

	# the mood's reactions (crowd.ts CrowdMood), on a fresh mood
	var mood := CrowdMoodCues.new()
	mood.tick(0.1, "intro", 60.0, 1.0, 1.0)
	_check(_cues(mood) == "cheer 0.70 @0.10", "walk-out cheer")
	mood.tick(2.0, "countdown", 60.0, 1.0, 1.0)
	mood.event("count", 3)
	_check(_cues(mood) == "cheer 0.25 @0.05", "count 3")
	mood.event("fightStart", null)
	mood.event("count", 0)
	# (count 0's cheer comes inside fightStart's cooldown, as in the web where hud.ts hears it second)
	_check(_cues(mood) == "cheer 0.70 @0.00", "fightStart")
	_check(mood.applause == 0.6, "fightStart claps")
	var hit := {"attacker": {"index": 0}, "blocked": false, "shielded": false, "guardBreak": false, "damage": 70.0, "crit": false, "counter": false, "knockdown": false}
	mood.tick(0.2, "fight", 50.0, 1.0, 1.0)
	mood.event("hit", hit)
	_check(_cues(mood) == "ooh 0.78 @0.04", "big hit: ooh")
	mood.tick(0.2, "fight", 50.0, 1.0, 1.0)
	mood.event("hit", hit)
	mood.tick(0.2, "fight", 50.0, 1.0, 1.0)
	mood.event("hit", hit)
	# (the second and third oohs fall inside the first one's cooldown)
	_check(_cues(mood) == "whistle 0.50 @0.15", "third in a row: whistle")
	mood.event("ko", null)
	_check(_cues(mood) == "cheer 1.00 @0.05, ooh 0.60 @0.00, cheer 0.80 @0.80, whistle 0.60 @0.60, whistle 0.50 @1.50", "ko")
	var restless := CrowdMoodCues.new()
	restless.tick(0.1, "fight", 50.0, 1.0, 1.0)
	restless.cues.clear()
	for i in 80:
		restless.tick(0.1, "fight", 50.0, 1.0, 1.0)
	var s := _cues(restless)
	_check(s == "boo 0.50 @0.00" or s == "whistle 0.40 @0.00", "nothing landing: %s" % s)

	# faders: the bus eases to the ambience with tau 0.6 s; the duck dips with tau 0.06 s
	crowd.ambience(1.0)
	var st := CrowdAudio.State.new()
	st.phase = "fight"
	st.clock = 50.0
	for i in 18:
		crowd.tick(1.0 / 30.0, st)
	_check(absf(crowd._f_bus.value - (1.0 - exp(-0.6 / 0.6))) < 1e-6, "ambience tau 0.6 s")
	crowd.duck(0.44)
	for i in 3:
		crowd.tick(1.0 / 30.0, st)
	_check(absf(crowd._f_duck.value - (0.56 + 0.44 * exp(-0.1 / 0.06))) < 1e-6, "duck to 0.56, tau 0.06 s")
	st.phase = "countdown"
	crowd.tick(1.0 / 30.0, st)
	_check(crowd._f_duck.target == 0.85, "before the bell the duck stops at 0.85")
	crowd.free()
	print("%d failed" % _fails)
	quit(1 if _fails > 0 else 0)
