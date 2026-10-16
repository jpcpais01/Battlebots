extends SceneTree
## The app's loop headless: home, a fight (run fast to its end), the results, the next fight,
## a forfeit back home. Checks the record counts each fight once.
##   godot --headless --path godot -s res://tests/app_flow.gd

var app: App
var _t := 0
var _stage := 0
var _fails := 0


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


func _frame() -> void:
	_t += 1
	match _stage:
		0:
			if _t < 5:
				return
			_check(app.current == "home", "starts on home")
			_check(app.game.showcase != null, "the player's bot is shown")
			app.fight()
			_stage = 1
		1:
			_check(app.current == "fight" and app.game.m != null, "a fight starts")
			app.game.m.skipIntro()
			_stage = 2
		2:
			# run the sim to its end in big strides (on the main thread: the worker is synced)
			app.game._sync()
			var m = app.game.m
			for i in 600:
				if m.phase == "end":
					break
				m.step(1.0 / 120.0)
			if m.phase == "end":
				_stage = 3
				_t = 0
		3:
			# (the results wait for the loser's stretcher ride: Skip it)
			if app.results == null and app.has_method("skip_ride"):
				app.skip_ride()
			if app.results != null:
				var r = app.record
				_check(r.wins + r.losses + r.draws == 1.0, "the fight is counted once")
				app.fight()
				_stage = 4
			elif _t > 400:
				_check(false, "results come up")
				_stage = 9
		4:
			_check(app.results == null and app.game.m != null, "next fight starts")
			app.game.forfeit()
			_stage = 5
		5:
			_check(app.current == "home" and app.game.m == null, "forfeit goes home")
			var r = app.record
			_check(r.wins + r.losses + r.draws == 2.0 and r.losses >= 1.0, "a forfeit is a loss")
			_check(Store.load_record().losses == r.losses, "the record is saved")
			_stage = 9
		9:
			print("app_flow: %d failed" % _fails)
			quit(1 if _fails else 0)
