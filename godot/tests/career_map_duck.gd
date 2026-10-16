extends SceneTree
## The map screen with a stand-in WorldMap (render/map/world_map.gd's API, src/render/map/world.ts
## in snake_case): the screen attaches the camera to its touch layer, sweeps in the first time,
## frames a venue when its pin is picked, highlights it, puts each pin over its venue, zooms, and
## flips day and night.
##   godot --headless --path godot -s res://tests/career_map_duck.gd

var app: App
var _t := 0
var _stage := 0
var _fails := 0
var _map: Control
var _w: FakeWorld


class FakeCam:
	extends RefCounted
	var calls: Array = []
	var on_tap := Callable()
	var attached: Control = null

	func attach(c: Control) -> void:
		attached = c

	func set_(to: Vector3, d: float) -> void:
		calls.append(["set_", to, d])

	func fly_to(to: Vector3, d: float, dur := 1.2) -> void:
		calls.append(["fly_to", to, d, dur])

	func frame(p: Vector3, d: float, x := 0.0, y := 0.0, dur := 1.2) -> void:
		calls.append(["frame", p, d, x, y, dur])

	func zoom_by(k: float) -> void:
		calls.append(["zoom_by", k])


class FakeSites:
	extends RefCounted
	var anchors := {}
	var lit = null

	func highlight(id) -> void:
		lit = id


class FakeWorld:
	extends Node3D
	var cam := FakeCam.new()
	var sites := FakeSites.new()
	var night := false

	func is_night() -> bool:
		return night

	func set_night(on: bool) -> void:
		night = on


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
			_w = FakeWorld.new()
			# every venue a little way in front of the camera the map leaves us with
			var i := 0
			for e in TEvents.EVENTS:
				_w.sites.anchors[e.id] = Vector3.ZERO
				i += 1
			app.game.add_place("map", _w)
			app.go("map")
			_stage = 1
			_t = 0
		1:
			if _t < 30:
				return
			_map = app.screens.get("map")
			_check(app.game.place == "map", "the world is on the map")
			_check(_w.cam.attached == _map.get_node("Touch"), "the camera reads the touch layer")
			_check((_map.get_node("Touch") as Control).mouse_filter == Control.MOUSE_FILTER_STOP, "the touch layer takes drags")
			var names := _w.cam.calls.map(func(c) -> String: return c[0])
			_check(names.slice(0, 2) == ["set_", "fly_to"], "the first visit sweeps in from the sea")
			_check(not (_map.get_node("List") as Control).visible, "no plain list over a 3D map")
			# put the anchors where the camera can see them
			var cam := app.game.get_viewport().get_camera_3d()
			var k := 0
			for e in TEvents.EVENTS:
				_w.sites.anchors[e.id] = cam.global_transform.origin - cam.global_transform.basis.z * 10.0 + cam.global_transform.basis.x * (k - 2.5)
				k += 1
			_stage = 2
			_t = 0
		2:
			if _t < 3:
				return
			var cam := app.game.get_viewport().get_camera_3d()
			var pin := _map.get_node("Pins/harbor") as Control
			var at := cam.unproject_position(_w.sites.anchors["harbor"])
			_check(pin.visible, "the Harbor Cup pin shows")
			_check(pin.position.distance_to(at - Vector2(20, 62.4)) < 1.0, "the pin's stem stands on its venue")
			pin.pressed.emit()
			_stage = 3
			_t = 0
		3:
			if _t < 3:
				return
			_check(_map.picked == "harbor" and _w.sites.lit == "harbor", "a pin opens its card and lights its venue")
			var fr = _w.cam.calls.back()
			_check(fr[0] == "frame" and fr[2] == 400.0 and fr[3] < 0.0, "the camera frames the venue left of the card")
			var on_tap: Callable = _w.cam.on_tap
			_check(on_tap.is_valid(), "a tap on the map is listened for")
			on_tap.call(10.0, 10.0)
			_check(_map.picked == null and _w.sites.lit == null, "a tap on the map closes the card")
			var zoom := _map.get_node("Zoom")
			(zoom.get_child(2) as Button).pressed.emit()
			_check(_w.cam.calls.back() == ["zoom_by", 0.6], "zoom in")
			(zoom.get_child(0) as Button).pressed.emit()
			_check(_w.night, "the moon turns the night on")
			# per-frame cost of the pins
			var t0 := Time.get_ticks_usec()
			for i in 200:
				_map.tick(0.016)
			print("map screen tick: %.1f us" % ((Time.get_ticks_usec() - t0) / 200.0))
			_stage = 9
		9:
			print("career_map_duck: %d failed" % _fails)
			quit(1 if _fails else 0)
