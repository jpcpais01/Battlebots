## Probe: a touch drag that starts on a button in the garage's lists still scrolls them.
##   godot --headless --path godot -s res://tests/garageui_scroll.gd
extends SceneTree

var app: App
var _fails := 0


func _check(ok: bool, what: String) -> void:
	print(("  ok   " if ok else "  FAIL ") + what)
	if not ok:
		_fails += 1


func _init() -> void:
	for f in ["player", "record", "saves", "prefs"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path("user://save/%s.json" % f))
	OS.set_environment("BB_SCREEN", "garage")
	OS.set_environment("BB_SKIPINTRO", "1")
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	get_root().add_child.call_deferred(app)
	_run.call_deferred()


func _drag(from: Vector2, by: Vector2) -> void:
	# a mouse drag as a phone finger (touch is emulated from the mouse)
	var t := InputEventMouseButton.new()
	t.button_index = MOUSE_BUTTON_LEFT
	t.pressed = true
	t.position = from
	t.global_position = from
	Input.parse_input_event(t)
	await process_frame
	for i in 10:
		var d := InputEventMouseMotion.new()
		d.button_mask = MOUSE_BUTTON_MASK_LEFT
		d.position = from + by * (i + 1) / 10.0
		d.global_position = d.position
		d.relative = by / 10.0
		Input.parse_input_event(d)
		await process_frame
	var u := InputEventMouseButton.new()
	u.button_index = MOUSE_BUTTON_LEFT
	u.pressed = false
	u.position = from + by
	u.global_position = u.position
	Input.parse_input_event(u)
	await process_frame


func _run() -> void:
	get_root().size = Vector2i(1280, 720)
	Input.emulate_touch_from_mouse = true
	for i in 10:
		await process_frame
	var g = app.screens.get("garage")
	g.tab = "emotes"
	g.emote_kind = "win"
	g.refresh_garage()
	for i in 5:
		await process_frame
	var sc: ScrollContainer = g.list_scroll
	var r := sc.get_global_rect()
	var y0 := sc.scroll_vertical
	var walk := r.position + Vector2(r.size.x * 0.5, r.size.y * 0.7)
	await _drag(walk, Vector2(0, -150))
	_check(sc.scroll_vertical > y0 + 100, "a drag from an emote card scrolls the list (%d -> %d)" % [y0, sc.scroll_vertical])
	_check(app.player.get("emotes") == null, "and doesn't equip the emote under the finger")
	g.tab = "part"
	g.slot = "fist"
	g.refresh_garage()
	for i in 5:
		await process_frame
	for s in get_root().find_children("*", "ScrollContainer", true, false):
		if s.is_visible_in_tree() and g.is_ancestor_of(s):
			var rr: Rect2 = s.get_global_rect()
			var before := Vector2(s.scroll_horizontal, s.scroll_vertical)
			var by := Vector2(-150, 0) if s.horizontal_scroll_mode != ScrollContainer.SCROLL_MODE_DISABLED else Vector2(0, -150)
			await _drag(rr.get_center(), by)
			print("%s %s: %s -> %s" % [s.get_path().get_name(s.get_path().get_name_count() - 1), rr, before, Vector2(s.scroll_horizontal, s.scroll_vertical)])
	_check(g.parts.trial == null, "dragging the part lists tries nothing on")
	# a plain tap still taps: the first tile of the column puts a part on trial
	for b in g.parts_root.find_children("*", "Button", true, false):
		var br: Rect2 = b.get_global_rect()
		if b.is_visible_in_tree() and br.size.y > 80 and br.position.y > 220 and br.end.y < 640:
			await _drag(br.get_center(), Vector2(2, 0))
			_check(g.parts.trial != null, "a tap on a tile still tries it on (%s)" % (g.parts.trial.id if g.parts.trial else "none"))
			break
	print("garageui_scroll: %s" % ("PASS" if _fails == 0 else "FAIL (%d)" % _fails))
	quit(1 if _fails > 0 else 0)
