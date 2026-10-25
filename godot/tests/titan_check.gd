extends SceneTree
## Titan battles end to end, headless: the home screen's Titans button starts a fight in the titan
## city (titans on: the sim's titan pace, the venue's sun), the venue stays inside João's budget
## (100k triangles), the titans move a beat heavier while the round's clock keeps real seconds,
## the fight runs to its results, Next fight stays titan, and the home Fight button goes back to
## the indoor arena.
##   godot --headless --path godot -s res://tests/titan_check.gd

const BUDGET := 100000

var app: App
var _t := 0
var _stage := 0
var _fails := 0
var _clock0 := 0.0
var _real := 0.0
var _slow := false


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


func _run_to_end() -> bool:
	app.game._sync()
	var m = app.game.m
	for i in 600:
		if m.phase == "end":
			break
		m.step(1.0 / 120.0)
	return m.phase == "end"


func _frame() -> void:
	_t += 1
	match _stage:
		0:
			if _t < 5:
				return
			_check(app.current == "home", "starts on home")
			var btn := app.find_child("Titans", true, false) as Button
			_check(btn != null, "home has a Titans button")
			if btn == null:
				_stage = 9
				return
			btn.pressed.emit()
			_stage = 1
			_t = 0
		1:
			# (the home scene plays its outro first)
			if app.current != "fight" or app.game.m == null:
				if _t > 20000:
					_check(false, "the Titans button starts a fight")
					_stage = 9
				return
			var g = app.game
			_check(g.titan, "it is a titan battle")
			_check(app.titan_run, "the app knows it")
			var v = g.venues.current
			_check(v is TitanVenue, "in the titan city")
			if v is TitanVenue:
				print("titan city: %d triangles" % v.tris)
				_check(v.tris <= BUDGET, "the venue stays under %d triangles" % BUDGET)
				_check(v.sun.visible and not g._key.visible, "the sun lights it, not the key spot")
				_check(v.props != null and v.props.tris > 0, "the city is full of people-sized things")
			_check(g.director.titan and g.sfx.titan, "filmed and heard as titans")
			_check(g.m.titan, "the sim runs it as a titan battle (its pace, its clock)")
			g.m.skipIntro()
			_stage = 2
			_t = 0
		2:
			# a second and a half of the round in real time (the frames' own deltas)
			var m = app.game.m
			if m.phase != "fight" and _clock0 == 0.0:
				if _t < 3000:
					return
			elif _clock0 == 0.0:
				_clock0 = m.clock
				_real = 0.0
				_t = 0
				return
			elif _real < 1.5 and _t < 20000 and m.phase == "fight":
				_real += app.get_process_delta_time()
				_slow = _slow or app.game.time_k < 0.95
				return
			var ran: float = _clock0 - m.clock
			print("round clock ran %.2f s in %.2f s (titans at %.2f)" % [ran, _real, app.game.time_k])
			_check(_real > 0.5 and ran > _real * 0.7 and ran < _real * 1.15, "the round's clock keeps real seconds")
			_check(_slow, "the titans move a beat heavier than the clock")
			_stage = 7
		7:
			if _run_to_end():
				_stage = 3
				_t = 0
		3:
			if app.results == null and app.has_method("skip_ride"):
				app.skip_ride()
			if app.results != null:
				var p := app.results.find_child("Primary", true, false) as Button
				_check(p != null, "the results have Next fight")
				if p != null:
					p.pressed.emit()
				_stage = 4
				_t = 0
			elif _t > 400:
				_check(false, "results come up")
				_stage = 9
		4:
			_check(app.game.m != null and app.game.titan and app.titan_run, "Next fight is titans again")
			app.game.forfeit()
			_stage = 5
			_t = 0
		5:
			if _t < 5:
				return
			_check(app.current == "home", "forfeit goes home")
			app.fight()
			_stage = 6
		6:
			_check(app.game.m != null and not app.game.titan and not app.titan_run, "the Fight button is back indoors")
			_check(app.game.venues.current == null and app.game._key.visible, "the indoor arena and its key spot")
			_check(app.game.time_k == 1.0, "indoor time runs at full speed")
			_stage = 9
		9:
			print("titan_check: %d failed" % _fails)
			quit(1 if _fails else 0)
