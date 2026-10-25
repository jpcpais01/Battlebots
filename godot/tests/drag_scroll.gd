extends SceneTree
## Mouse drag-scrolling (app/ui/drag_scroll.gd, the Windows build): a drag scrolls the box under
## it (up and down, or sideways for a strip inside it) without pressing the button it started
## on, a click still presses it, and a slider keeps its drag.
##   godot --headless --path godot -s res://tests/drag_scroll.gd

var _fails := 0
var _pressed := 0
## (headless, the window is 64 px: the test runs in a viewport of its own)
var _vp := SubViewport.new()


func _init() -> void:
	_run.call_deferred()


func _run() -> void:
	_vp.size = Vector2i(400, 400)
	_vp.handle_input_locally = true
	root.add_child(_vp)
	var ds := DragScroll.new()
	_vp.add_child(ds)
	var page := ScrollContainer.new()
	page.position = Vector2(0, 0)
	page.size = Vector2(300, 300)
	page.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	page.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	_vp.add_child(page)
	var col := VBoxContainer.new()
	col.custom_minimum_size = Vector2(300, 0)
	page.add_child(col)
	var strip := ScrollContainer.new()
	strip.custom_minimum_size = Vector2(300, 80)
	strip.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	strip.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var row := HBoxContainer.new()
	strip.add_child(row)
	for i in 10:
		var t := Button.new()
		t.custom_minimum_size = Vector2(100, 80)
		row.add_child(t)
	col.add_child(strip)
	var slider := HSlider.new()
	slider.custom_minimum_size = Vector2(300, 40)
	col.add_child(slider)
	for i in 20:
		var b := Button.new()
		b.text = "Item %d" % i
		b.custom_minimum_size = Vector2(300, 60)
		b.pressed.connect(func() -> void: _pressed += 1)
		col.add_child(b)
	for i in 4:
		await process_frame
	# a click on a button presses it
	await _drag(Vector2(150, 200), Vector2.ZERO)
	_check(_pressed == 1, "a click presses the button (%d)" % _pressed)
	_check(page.scroll_vertical == 0, "a click doesn't scroll")
	# a drag up scrolls the page and presses nothing
	await _drag(Vector2(150, 250), Vector2(0, -120))
	_check(_pressed == 1, "a drag doesn't press the button it started on (%d)" % _pressed)
	_check(page.scroll_vertical > 100, "the drag scrolled the page (%d)" % page.scroll_vertical)
	# then the button still clicks
	await _drag(Vector2(150, 250), Vector2.ZERO)
	_check(_pressed == 2, "and a click after it presses again (%d)" % _pressed)
	# a sideways drag on the strip scrolls the strip, not the page
	page.scroll_vertical = 0
	for i in 2:
		await process_frame
	await _drag(Vector2(250, 40), Vector2(-150, 4))
	_check(strip.scroll_horizontal > 120, "a sideways drag scrolls the strip (%d)" % strip.scroll_horizontal)
	_check(page.scroll_vertical == 0, "and not the page (%d)" % page.scroll_vertical)
	# an up-and-down drag starting on the strip scrolls the page
	await _drag(Vector2(250, 40), Vector2(3, -90))
	_check(page.scroll_vertical > 70, "a drag up from the strip scrolls the page (%d)" % page.scroll_vertical)
	# a slider keeps its own drag, even up and down
	page.scroll_vertical = 0
	for i in 2:
		await process_frame
	await _drag(Vector2(150, 100), Vector2(5, -60))
	_check(page.scroll_vertical == 0, "a drag on a slider leaves the page (%d)" % page.scroll_vertical)
	print("drag_scroll: %s" % ("PASS" if _fails == 0 else "%d FAILED" % _fails))
	quit(1 if _fails > 0 else 0)


func _drag(at: Vector2, by: Vector2) -> void:
	_send_motion(at, 0)
	await process_frame
	var b := InputEventMouseButton.new()
	b.button_index = MOUSE_BUTTON_LEFT
	b.pressed = true
	b.position = at
	b.global_position = at
	b.button_mask = MOUSE_BUTTON_MASK_LEFT
	_vp.push_input(b, true)
	await process_frame
	var steps := 8 if by != Vector2.ZERO else 0
	for i in steps:
		_send_motion(at + by * float(i + 1) / steps, MOUSE_BUTTON_MASK_LEFT)
		await process_frame
	var r := InputEventMouseButton.new()
	r.button_index = MOUSE_BUTTON_LEFT
	r.pressed = false
	r.position = at + by
	r.global_position = at + by
	_vp.push_input(r, true)
	await process_frame
	await process_frame


func _send_motion(p: Vector2, mask: int) -> void:
	var m := InputEventMouseMotion.new()
	m.position = p
	m.global_position = p
	m.button_mask = mask
	_vp.push_input(m, true)


func _check(ok: bool, what: String) -> void:
	print(("  ok   " if ok else "  FAIL ") + what)
	if not ok:
		_fails += 1
