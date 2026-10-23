extends SceneTree
## The Gauntlet in the app headless: home's button, Start run, a stage fought to its end with the
## run's boosts on, the results' Gauntlet section and Pick your boost, the pick on the ladder, a
## forfeit ending the run, and cashing out.
##   godot --headless --path godot -s res://tests/gauntlet_flow.gd

var app: App
var _t := 0
var _stage := 0
var _fails := 0
var _won := false


func _init() -> void:
	DirAccess.make_dir_recursive_absolute("user://save")
	for f in ["player", "record", "saves", "prefs", "pilot", "gauntlet", "skins"]:
		DirAccess.remove_absolute("user://save/%s.json" % f)
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(app)
	process_frame.connect(_frame)


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _press(c: Node, name: String) -> bool:
	var b := c.find_child(name, true, false) as Button
	if b == null or b.disabled:
		return false
	b.pressed.emit()
	return true


func _frame() -> void:
	_t += 1
	match _stage:
		0:
			if _t < 5:
				return
			var home = app.screens.home
			_check(_press(home, "Gauntlet") and app.current == "gauntlet", "home's Gauntlet button opens it")
			_stage = 10
			_t = 0
		10:
			# (through the dip to black: the screen comes up after it)
			if _t < 30:
				return
			var gs = app.screens.gauntlet
			_check(_press(gs, "Start") and app.gauntlet.run != null, "Start run starts a run")
			_check(gs.find_child("Fight", true, false) != null and gs.find_child("Rival", true, false) != null, "the first rival is up")
			_check(Gauntlet.load_state().run != null, "the run is saved")
			if app.gauntlet.run == null:
				_stage = 9
				return
			# a run already holding boosts, so the fight shows they reach the sim
			app.gauntlet.run.boosts = ["frame", "frame"]
			_press(gs, "Fight")
			_stage = 1
		1:
			_check(app.current == "fight" and app.gauntlet_on and app.game.m != null, "Fight starts the stage")
			var m = app.game.m
			var plain = TItems.computeBuild(app.player.loadout, float(app.player.get("size_", 1.0)))
			_check(is_equal_approx(float(m.fighters[0].build.stats.maxHp), float(plain.stats.maxHp) + 200.0), "the run's boosts are on the player's bot")
			_check(float(m.fighters[1].build.stats.maxHp) < float(TItems.computeBuild(m.specs[1].loadout, float(m.specs[1].get("size_", 1.0))).stats.maxHp), "stage 1's rival is rusty")
			_check(app.player.get("boost") == null, "the saved bot never wears them")
			m.skipIntro()
			_stage = 2
		2:
			app.game._sync()
			var m = app.game.m
			for i in 600:
				if m.phase == "end":
					break
				m.step(1.0 / 120.0)
			if m.phase == "end":
				_won = m.winner != null and int(m.winner.index) == 0
				_stage = 3
				_t = 0
		3:
			if app.results == null:
				app.skip_ride()
			if app.results != null:
				_check(app.results.find_child("Gauntlet", true, false) != null, "the results show the Gauntlet")
				var run = app.gauntlet.run
				if _won:
					_check(run != null and int(run.stage) == 1 and int(run.bank) == Gauntlet.purse(1) and run.offer.size() == 3, "a win banks the purse and offers boosts")
					_check(_press(app.results, "Primary") and app.current == "gauntlet", "Pick your boost goes to the ladder")
					var gs = app.screens.gauntlet
					var id: String = run.offer[0]
					_check(_press(gs, "Boost_" + id) and app.gauntlet.run.boosts.has(id) and app.gauntlet.run.offer.is_empty(), "a boost card picks it")
					_check(gs.find_child("Fight", true, false) != null, "the next rival is up")
				else:
					_check(run == null and app.gauntlet.last != null, "a loss ends the run")
					print("(lost stage 1: no boost pick checked)")
					app.close_results()
					app.go("gauntlet")
					Gauntlet.start(app.gauntlet)
					Gauntlet.settle(app.gauntlet, true, false)
					Gauntlet.pick(app.gauntlet, app.gauntlet.run.offer[0])
				_stage = 4
				_t = 0
			elif _t > 400:
				_check(false, "results come up")
				_stage = 9
		4:
			# walk out of the next stage: the run is over, back on the ladder
			app.start_gauntlet()
			_check(app.current == "fight", "the next stage starts")
			app.game.forfeited.emit()
			_check(app.gauntlet.run == null and app.current == "gauntlet", "a forfeit ends the run, back on the ladder")
			# cash out: a won stage, then take the bank
			Gauntlet.start(app.gauntlet)
			Gauntlet.settle(app.gauntlet, true, false)
			Gauntlet.pick(app.gauntlet, app.gauntlet.run.offer[0])
			var c0 := float(app.record.career.credits)
			var took := Gauntlet.cash_out(app.gauntlet)
			app.gauntlet_pay(took, 0)
			_check(took == Gauntlet.purse(1) and is_equal_approx(float(app.record.career.credits), c0 + took), "cashing out pays the bank")
			_check(Gauntlet.load_state().run == null and int(Gauntlet.load_state().best) >= 1, "the end of the run is saved, with the best")
			_stage = 9
		9:
			print("gauntlet_flow: %d failed" % _fails)
			quit(1 if _fails > 0 else 0)
