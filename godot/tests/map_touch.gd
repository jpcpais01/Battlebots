## The world map's camera under a phone's touches (render/map/map_camera.gd), fed the events in the
## order Android delivers them: the first finger's emulated mouse press comes just before its touch.
##   godot --headless --path . -s res://tests/map_touch.gd
## Prints ok/FAIL lines and "map touch: N failed".
extends SceneTree

var _fails := 0


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _touch(cam: MapCamera, i: int, at: Vector2, down: bool) -> void:
	if i == 0:
		# (Input's emulate_mouse_from_touch: a mouse event from the first finger, dispatched first)
		var mb := InputEventMouseButton.new()
		mb.device = InputEvent.DEVICE_ID_EMULATION
		mb.button_index = MOUSE_BUTTON_LEFT
		mb.pressed = down
		mb.position = at
		cam.handle_input(mb)
	var t := InputEventScreenTouch.new()
	t.index = i
	t.pressed = down
	t.position = at
	cam.handle_input(t)


func _drag(cam: MapCamera, i: int, at: Vector2) -> void:
	if i == 0:
		var mm := InputEventMouseMotion.new()
		mm.device = InputEvent.DEVICE_ID_EMULATION
		mm.position = at
		cam.handle_input(mm)
	var d := InputEventScreenDrag.new()
	d.index = i
	d.position = at
	cam.handle_input(d)


func _init() -> void:
	var el := Control.new()
	el.size = Vector2(1280, 720)
	get_root().add_child(el)
	var cam := MapCamera.new()
	cam.attach(el)
	cam.set_view(Vector3(60, 3, -40), 800.0)
	# one finger drags twice: the map pans, the distance stays
	for n in 2:
		var t0 := cam.target
		_touch(cam, 0, Vector2(640, 360), true)
		for k in range(1, 11):
			_drag(cam, 0, Vector2(640 - 30 * k, 360 + 10 * k))
		_touch(cam, 0, Vector2(340, 460), false)
		_check(is_equal_approx(cam.dist, 800.0), "drag %d keeps the zoom (%.1f)" % [n + 1, cam.dist])
		_check(cam.target.distance_to(t0) > 50.0, "drag %d pans the map (%.1f m)" % [n + 1, cam.target.distance_to(t0)])
	_check(not cam.busy, "no finger is left on the map after letting go")
	# two fingers spread: zoom in
	var d0 := cam.dist
	_touch(cam, 0, Vector2(600, 360), true)
	_touch(cam, 1, Vector2(680, 360), true)
	for k in range(1, 11):
		_drag(cam, 0, Vector2(600 - 20 * k, 360))
		_drag(cam, 1, Vector2(680 + 20 * k, 360))
	_check(cam.dist < d0 * 0.5, "spreading two fingers zooms in (%.0f -> %.0f)" % [d0, cam.dist])
	var d1 := cam.dist
	_touch(cam, 1, Vector2(880, 360), false)
	_drag(cam, 0, Vector2(380, 400))
	_drag(cam, 0, Vector2(360, 420))
	_check(is_equal_approx(cam.dist, d1), "the finger left behind pans without zooming")
	_touch(cam, 0, Vector2(360, 420), false)
	_check(not cam.busy, "both fingers up")
	print("map touch: %d failed" % _fails)
	quit()
