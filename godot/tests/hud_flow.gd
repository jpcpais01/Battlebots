## The fight HUD's taps in the app, with real input events (hud.ts: the intro skips on a tap, the
## coach's calls reach the fight, the speed and zoom buttons cycle):
##   godot/tools/shots/shot.sh res://tests/hud_flow.gd
## (under Xvfb: the headless display takes no taps). Prints ok/FAIL lines and "hud flow: N failed".
extends SceneTree

var app: App
var _fails := 0
var _coached := ""


func _init() -> void:
	Settings.path = "user://hud_flow_settings.cfg"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Settings.path))
	for f in ["player", "record", "saves", "prefs"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path("user://save/%s.json" % f))
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	get_root().add_child.call_deferred(app)
	_run.call_deferred()


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _frames(n: int) -> void:
	for i in n:
		await process_frame


## A tap at `at` (canvas units), as a mouse press and release.
func _tap(at: Vector2) -> void:
	var vp := get_root()
	var p := vp.get_final_transform() * at
	for down in [true, false]:
		var e := InputEventMouseButton.new()
		e.button_index = MOUSE_BUTTON_LEFT
		e.pressed = down
		e.position = p
		e.global_position = p
		Input.parse_input_event(e)
		await process_frame


func _center(c: Control) -> Vector2:
	return c.get_global_rect().get_center()


func _run() -> void:
	await _frames(10)
	var g: Game = app.game
	g.match_event.connect(func(t: String, d) -> void:
		if t == "coach":
			_coached = str(d.kind))
	app.fight()
	await _frames(20)
	var hud := g.hud
	_check(g.m.phase == "intro", "the fight opens on the intro")
	await _tap(get_root().get_visible_rect().size * 0.5)
	await _frames(4)
	_check(g.m.phase == "countdown", "a tap on the intro skips to the countdown")
	# into the fight, past the greeting
	var n := 0
	while g.m.phase != "fight" and n < 3000:
		await process_frame
		n += 1
	await _frames(30)
	_check(g.m.phase == "fight", "the fight is on")
	var go: Control = hud.coach._btns[0]
	_check(go.is_visible_in_tree() and not go.disabled, "the coach's Go in! is up and ready")
	await _tap(_center(go))
	n = 0
	while _coached == "" and n < 60:
		await process_frame
		n += 1
	_check(_coached == "go", "tapping Go in! makes the call (%s)" % _coached)
	await _frames(6)
	_check(go.disabled, "the calls wait out their cooldown")
	await _tap(_center(hud.controls._speed))
	await _frames(2)
	_check(is_equal_approx(g.speed, 2.0), "the speed button doubles the fight's speed")
	await _tap(_center(hud.controls._speed))
	await _tap(_center(hud.controls._speed))
	await _frames(2)
	_check(is_equal_approx(g.speed, 1.0), "...and cycles back through half to normal")
	var z0: String = g.director.zoom
	await _tap(_center(hud.controls._zoom))
	await _frames(2)
	_check(g.director.zoom != z0, "the zoom button changes the framing (%s -> %s)" % [z0, g.director.zoom])
	print("hud flow: %d failed" % _fails)
	quit()
