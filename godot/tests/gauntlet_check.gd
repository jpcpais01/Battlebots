## The Gauntlet's rules (app/gauntlet/gauntlet.gd) headless: a run's stages, purses, bosses and
## bank, boosts reaching the sim (BotSpec.boost through computeBuild), the save and a replay tape
## keeping them, and a few whole runs fought out in the GDScript sim (random picks, as
## scripts/gauntlet balance was tuned).
##   godot --headless --path godot -s res://tests/gauntlet_check.gd -- [runs]
extends SceneTree

var _fails := 0


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _init() -> void:
	TInit.run()
	var runs := int(OS.get_cmdline_user_args()[0]) if OS.get_cmdline_user_args().size() > 0 else 2
	var player = TSaves.sanitizeBot(null)
	# boosts reach the build, and never the power rating
	var plain = TItems.computeBuild(player.loadout, 1.0)
	var boosted = TItems.computeBuild(player.loadout, 1.0, Gauntlet.stats_of(["heavy_hands", "heavy_hands", "frame", "welds"]))
	_check(float(boosted.stats.punchPower) > float(plain.stats.punchPower), "Heavy Hands adds punch power")
	_check(is_equal_approx(float(boosted.stats.maxHp), float(plain.stats.maxHp) + 100.0), "Reinforced Frame adds 100 health")
	_check(float(boosted.tough.head) > float(plain.tough.head), "Fresh Welds adds durability")
	_check(int(boosted.rating) == int(plain.rating), "boosts leave the power rating alone")

	# the ladder
	_check(Gauntlet.boss(5) and Gauntlet.boss(10) and not Gauntlet.boss(4), "a boss every fifth stage")
	_check(Gauntlet.purse(1) == 60 and Gauntlet.purse(5) == 3 * 140, "purses")
	_check(Gauntlet.shards(5) == 25 and Gauntlet.shards(10) == 40 and Gauntlet.shards(4) == 0, "boss shards")
	_check(Gauntlet.arena(1) == "grand" and Gauntlet.arena(5) == "grand" and Gauntlet.arena(6) == "harbor" and Gauntlet.arena(31) == "grand", "a venue a floor, round the world")
	_check(String(Gauntlet.boss_def(35).name) == "Gatekeeper II", "bosses come round again with a numeral (%s)" % Gauntlet.boss_def(35).name)
	_check(Gauntlet.threat(1) == "Rusty" and Gauntlet.threat(30) == "Nightmare", "threat words")

	# a run: win, pick, lose
	var g := Gauntlet.fresh()
	Gauntlet.start(g)
	var foe: Dictionary = Gauntlet.foe(g, player)
	_check(foe.boosts.size() == 0 and float(foe.bot.boost.hp) < 0.0, "stage 1's rival is rusty, no boosts")
	_check(Gauntlet.foe(g, player) == foe, "the rival is kept")
	var r := Gauntlet.settle(g, true, false)
	_check(r.purse == 60 and g.run.bank == 60 and g.run.safe == 0 and g.run.offer.size() == 3 and r.best, "a win banks and offers three boosts")
	_check(not Gauntlet.pick(g, "nonsense"), "only an offered boost can be picked")
	var id: String = g.run.offer[1]
	_check(Gauntlet.pick(g, id) and g.run.boosts == [id] and g.run.offer.is_empty(), "a pick is kept")
	_check(Gauntlet.player_bot(g, player).boost.size() > 0 and player.get("boost") == null, "the player's bot wears the boosts on a copy")
	r = Gauntlet.settle(g, false, true)
	_check(r.draw and g.run.stage == 1, "a draw goes again")
	# to the boss and past it
	for s in range(2, 6):
		Gauntlet.foe(g, player)
		r = Gauntlet.settle(g, true, false)
		Gauntlet.pick(g, g.run.offer[0])
	_check(r.boss and r.shards == 25 and g.run.safe == g.run.bank and g.bosses == 1, "a boss locks the bank in and pays shards")
	var f6: Dictionary = Gauntlet.foe(g, player)
	_check(f6.boosts.size() == Gauntlet.foe_boosts(6), "stage 6's rival carries its boosts (%d)" % f6.boosts.size())
	# the save round trip
	var back := Gauntlet.sanitize(TInit.from_json(JSON.parse_string(JSON.stringify(TInit.to_json(g)))))
	_check(back.run.stage == 5 and back.run.boosts == g.run.boosts and back.run.bank == g.run.bank, "a saved run loads back")
	_check(back.run.foe != null and String(back.run.foe.bot.name_) == String(f6.bot.name_) and _same(back.run.foe.bot.boost, f6.bot.boost), "its rival too, with its boosts")
	_check(Gauntlet.sanitize("junk").run == null, "junk loads as no run")
	var bank: int = g.run.bank
	Gauntlet.settle(g, true, false)
	Gauntlet.pick(g, g.run.offer[0])
	r = Gauntlet.settle(g, false, false)
	_check(r.over and r.took == bank and g.run == null and g.last.stage == 6, "a loss ends the run with what was locked in")
	Gauntlet.start(g)
	Gauntlet.settle(g, true, false)
	_check(Gauntlet.cash_out(g) == 60 and g.run == null and g.last.cashed, "cashing out takes the bank")

	# a replay tape keeps a Gauntlet fight's boosts
	var t := ReplayTape.make(Gauntlet.player_bot({"run": {"boosts": ["frame"]}}, player), f6.bot, 7.0)
	var raw = JSON.parse_string(JSON.stringify(TInit.to_json(t)))
	raw["end"] = 100
	var tt = ReplayTape.sanitize(TInit.from_json(raw))
	_check(tt != null and tt.a.get("boost", {}).get("hp") == 100.0 and _same(tt.b.get("boost"), f6.bot.boost), "a saved replay keeps the boosts")
	_check(Store.load_player().get("boost") == null, "a saved bot never wears boosts")

	# whole runs in the sim
	var rng := TMath.Rng.new(99.0)
	var t0 := Time.get_ticks_msec()
	var cleared := []
	for k in runs:
		var me = TLoadout.randomBot(rng, 0.5)
		var run := Gauntlet.fresh()
		Gauntlet.start(run)
		while run.run != null and Gauntlet.next_stage(run) <= 12:
			var fo: Dictionary = Gauntlet.foe(run, me)
			var m = TMatch.Match.new(Gauntlet.player_bot(run, me), fo.bot, rng.int_(0.0, 1e9))
			m.skipIntro()
			while m.phase != "end" and m.frame < 40000:
				m.step(1.0 / 120.0)
			var won: bool = m.winner != null and int(m.winner.index) == 0
			Gauntlet.settle(run, won, m.winner == null)
			if run.run != null and not run.run.offer.is_empty():
				Gauntlet.pick(run, run.run.offer[int(rng.next() * 3.0) % 3])
		cleared.append(int(run.last.stage) if run.run == null else int(run.run.stage))
	print("%d runs in %.1f s: cleared %s" % [runs, (Time.get_ticks_msec() - t0) / 1000.0, cleared])
	print("FAILS: %d" % _fails if _fails > 0 else "all ok")
	quit(1 if _fails > 0 else 0)


static func _same(a, b) -> bool:
	if not (a is Dictionary and b is Dictionary) or a.size() != b.size():
		return false
	for k in a:
		if not b.has(String(k)) or not is_equal_approx(float(a[k]), float(b[String(k)])):
			return false
	return true
