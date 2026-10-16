extends SceneTree
## The menus headless: home (hero, tiles, the patch notes popup, a Modal.ask), a fight run to its
## end, the loser's stretcher ride (the results wait for it, Skip shown), the results card and its
## actions, and a map event's fight billing its rival in the intro. Prints the per-frame costs of
## the home screen's tick and the stretcher's update.
##   godot --headless --path godot -s res://tests/menus_flow.gd

var app: App
var _t := 0
var _stage := 0
var _fails := 0
var _picked := -9


func _init() -> void:
	DirAccess.make_dir_recursive_absolute("user://save")
	for f in ["player", "record", "saves", "prefs"]:
		DirAccess.remove_absolute("user://save/%s.json" % f)
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(app)
	process_frame.connect(_frame)


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _buttons(c: Node) -> Array[String]:
	var out: Array[String] = []
	for b in c.find_children("*", "Button", true, false):
		var l := b.find_child("Text", true, false) as Label
		if l != null and (b as Control).is_visible_in_tree():
			out.append(l.text)
	return out


func _step_to(m, until: Callable) -> void:
	app.game._sync()
	for i in 20000:
		if until.call(m):
			break
		m.step(1.0 / 120.0)


func _frame() -> void:
	_t += 1
	match _stage:
		0:
			if _t < 5:
				return
			var home = app.screens.home
			_check(app.current == "home", "starts on home")
			_check(home._tiles.size() == 6, "six part tiles")
			# the home tick, per frame
			var t0 := Time.get_ticks_usec()
			for i in 200:
				home.tick(1.0 / 60.0)
			print("cost home tick: %.1f us/frame" % ((Time.get_ticks_usec() - t0) / 200.0))
			home._notes.pressed.emit()
			_check(Modal.current(app.ui) != null, "patch notes open")
			_check(Store.pref("notesSeen", "") == HomeScreen.latest_notes(), "the newest notes are marked seen")
			Modal.current(app.ui).close()
			var ask := Modal.ask(app.ui, "Sure?", "Really.", [["BtnSmall", "No"], ["BtnPrimary", "Yes"]])
			ask.picked.connect(func(i: int) -> void: _picked = i)
			for b in ask.find_children("*", "Button", true, false):
				var l := b.find_child("Text", true, false) as Label
				if l != null and l.text == "Yes":
					(b as Button).pressed.emit()
			_stage = 1
		1:
			_check(_picked == 1, "Modal.ask reports the button picked")
			_check(Modal.current(app.ui) == null, "the modal closes")
			app.fight()
			_stage = 2
		2:
			app.game.m.skipIntro()
			_step_to(app.game.m, func(m) -> bool: return m.phase == "end")
			_stage = 3
			_t = 0
		3:
			if _t < 3:
				return
			var g = app.game
			_check(g.carrying, "the loser is being carried out")
			_check(app._skip_btn != null and app.results == null, "the results wait, with Skip")
			var m = g.m
			var hold: float = Stretcher.ride_end(m.result) - Stretcher.RIDE
			_step_to(m, func(mm) -> bool: return mm.phaseTime >= hold + 3.0)
			_stage = 4
			_t = 0
		4:
			if _t < 3:
				return
			var g = app.game
			var st: Stretcher = g.stretcher
			_check(st.on and st.posed and not st.shot.is_empty(), "the stretcher is under way and filmed")
			_check(g.models[st.loser].visible, "the loser rides it")
			# the stretcher's update, per frame
			var t0 := Time.get_ticks_usec()
			var base: float = g._mv.phaseTime
			for i in 200:
				st.update(base + i / 600.0, 1.0 / 60.0, g.models[st.loser], g.effects.debris, null, true)
			print("cost stretcher update: %.1f us/frame" % ((Time.get_ticks_usec() - t0) / 200.0))
			_step_to(g.m, func(mm) -> bool: return not g.carrying or mm.phaseTime >= Stretcher.ride_end(mm.result) + 0.1)
			_stage = 5
			_t = 0
		5:
			if app.results == null and _t < 120:
				return
			_check(app.results != null, "the results come up once the ride is over")
			_check(app._skip_btn == null, "Skip goes")
			_check(not app.game.models[app.game.stretcher.loser].visible, "the loser has gone down the tunnel")
			var names := _buttons(app.results)
			_check(names.has("Garage") and names.has("Home") and (names.has("Next fight") or names.has("Rematch")), "results actions: %s" % [names])
			# a map event's round: its rival is billed
			app.fight_event(TEvents.EVENTS[0])
			_stage = 6
		6:
			var rv = app.game.hud.rival_intro
			_check(rv != null and str(rv.taunt) != "", "the event's rival is billed")
			_check(app.game.hud._intro._cards.size() == 2, "two bot cards")
			_check(app.results == null, "the results card went")
			app.game.forfeit()
			_stage = 7
		7:
			_check(app.current == "map" or app.current == "home", "forfeiting the round leaves the arena")
			print("menus_flow: %d failed" % _fails)
			quit(1 if _fails else 0)
