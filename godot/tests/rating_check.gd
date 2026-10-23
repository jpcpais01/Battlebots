## The crowd's ratings (app/pilot/rating.gd) headless: whole AI fights rated one after another.
## Prints how the stars spread and how often each headline comes up (most fights should land
## around three stars, five stars rare), and checks a rating survives a save.
##   godot --headless --path godot -s res://tests/rating_check.gd -- <fights> [seed]
extends SceneTree

var _fails := 0


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _init() -> void:
	TInit.run()
	var n := int(OS.get_cmdline_user_args()[0]) if OS.get_cmdline_user_args().size() > 0 else 40
	var rng := TMath.Rng.new(float(OS.get_cmdline_user_args()[1]) if OS.get_cmdline_user_args().size() > 1 else 777.0)
	var spread := {}
	var heads := {}
	var total := 0.0
	var one = null
	for k in n:
		var a = TLoadout.randomBot(rng)
		var b = TLoadout.randomBot(rng, 0.35, a.paint)
		var m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
		var fl := Pilot.FightLog.new(m, 0)
		m.on(fl.event)
		m.skipIntro()
		while m.phase != "end" and m.frame < 40000:
			m.step(1.0 / 120.0)
		var r := FightRating.rate(fl.crowd, m.result)
		one = r
		total += float(r.stars)
		spread[r.stars] = int(spread.get(r.stars, 0)) + 1
		heads[r.head] = int(heads.get(r.head, 0)) + 1
		print("F " + JSON.stringify(r.f))
		print("%4.1f  %-18s %-10s %3ds  %s" % [float(r.stars), r.title, str(m.result), int(r.secs), ", ".join(r.why)])
	print("\naverage %.2f stars over %d fights" % [total / n, n])
	for s in [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]:
		var c := int(spread.get(s, 0))
		print("  %3.1f  %3d  %s" % [s, c, "#".repeat(c)])
	for h in heads:
		print("  %-12s %d" % [h, int(heads[h])])
	# a rating on a saved tape comes back the same
	var back = FightRating.sanitize(JSON.parse_string(JSON.stringify(TInit.to_json(one))))
	_check(back != null and float(back.stars) == float(one.stars) and back.head == one.head and back.flow == one.flow, "a rating survives a save")
	_check(FightRating.sanitize({"stars": 3, "head": "nope"}) == null, "a broken rating is dropped")
	_check(FightRating.xp(5.0) == 40 and FightRating.xp(1.0) == 2, "five stars pays 40 XP, one pays 2")
	print("%d failed" % _fails if _fails > 0 else "all ok")
	quit(1 if _fails > 0 else 0)
