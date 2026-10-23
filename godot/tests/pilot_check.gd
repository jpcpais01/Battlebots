## The pilot's rules (app/pilot/pilot.gd) headless: whole AI fights with a FightLog on corner 0,
## settled one after another. Prints each contract stat's average a fight and how many fights a
## contract takes, and checks the day roll, the save round trip and the level maths.
##   godot --headless --path godot -s res://tests/pilot_check.gd -- <fights>
extends SceneTree

var _fails := 0


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _init() -> void:
	TInit.run()
	var n := int(OS.get_cmdline_user_args()[0]) if OS.get_cmdline_user_args().size() > 0 else 20
	# the day roll: one of each tier, the same for the same day
	var p := Pilot.fresh()
	Pilot.roll(p, "2026-10-23")
	var ids: Array = p.contracts.map(func(c): return c.id)
	_check(ids.size() == 3, "three contracts")
	for t in 3:
		_check(int(Pilot.CONTRACTS[ids[t]].tier) == t, "contract %d is tier %d (%s)" % [t, t, ids[t]])
	var q := Pilot.fresh()
	Pilot.roll(q, "2026-10-23")
	_check(q.contracts.map(func(c): return c.id) == ids, "the same contracts for the same day")
	_check(not Pilot.roll(p, "2026-10-23"), "no new roll on the same day")
	var seen := {}
	for d in 60:
		var r := Pilot.fresh()
		Pilot.roll(r, "2026-11-%02d" % (d % 28 + 1) if d < 28 else "2026-12-%02d" % (d - 27))
		for c in r.contracts:
			seen[c.id] = true
	print("contracts seen over 60 days: %d of %d" % [seen.size(), Pilot.CONTRACTS.size()])
	# the save round trip
	var s := Pilot.sanitize(JSON.parse_string(JSON.stringify(p)))
	_check(s.contracts.size() == 3 and s.day == p.day, "a saved pilot loads back")
	_check(Pilot.sanitize({"level": 500, "xp": -4}).level == Pilot.MAX_LEVEL, "levels clamp")
	_check(Pilot.sanitize("junk").level == 1, "junk loads as a new pilot")
	# levels
	var lv := Pilot.fresh()
	var ups := Pilot.add_xp(lv, Pilot.need(1) + Pilot.need(2) + 5)
	_check(ups.size() == 2 and lv.level == 3 and lv.xp == 5, "XP carries over two levels")
	_check(Pilot.level_pay(5) == 2 * mini(50 + 50, 300), "every 5th level pays double")

	# whole fights
	var pilot := Pilot.fresh()
	Pilot.roll(pilot, "2026-10-23")
	var sums := {}
	var wins := 0
	var xp := 0
	var credits := 0
	var rng := TMath.Rng.new(4242.0)
	var t0 := Time.get_ticks_msec()
	for k in n:
		var a = TLoadout.randomBot(rng)
		var b = TLoadout.randomBot(rng, 0.35, a.paint)
		var m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
		var fl := Pilot.FightLog.new(m, 0)
		m.on(fl.event)
		m.skipIntro()
		while m.phase != "end" and m.frame < 40000:
			m.step(1.0 / 120.0)
		var won: bool = m.winner != null and int(m.winner.index) == 0
		var draw: bool = m.winner == null
		var ctx := {"won": won, "draw": draw, "kind": m.result}
		var sm := fl.summary(ctx)
		for key in sm:
			sums[key] = int(sums.get(key, 0)) + int(sm[key])
		var rep := Pilot.settle(pilot, fl, ctx)
		wins += 1 if won else 0
		xp += int(rep.xp)
		credits += int(rep.credits)
	print("%d fights in %.1f s; won %d" % [n, (Time.get_ticks_msec() - t0) / 1000.0, wins])
	var keys := sums.keys()
	keys.sort()
	for key in keys:
		print("  %-14s %6.2f a fight" % [key, float(sums[key]) / n])
	print("XP %.0f a fight, credits %.0f a fight; level %d after %d fights" % [float(xp) / n, float(credits) / n, pilot.level, n])
	for id in Pilot.CONTRACTS:
		var def: Dictionary = Pilot.CONTRACTS[id]
		var per := float(sums.get(def.stat, 0)) / n
		print("  %-11s tier %d  ~%s fights" % [id, int(def.tier), "%.1f" % (float(def.n) / per) if per > 0.0 else "never"])
	print("%d failed" % _fails if _fails > 0 else "all ok")
	quit(1 if _fails > 0 else 0)
