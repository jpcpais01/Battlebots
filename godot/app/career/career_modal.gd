## A card over the dimmed scene (style.css .modal and .modal .box, app.ts openModal): the Parts
## Market and the trophy room open in one. The back button or a tap on the dim closes it.
class_name CareerModal
extends Control

## Runs once, when the modal closes (app.ts openModal's onClose).
var on_close := Callable()
## The card, and the column its contents go in.
var box: PanelContainer
var column: VBoxContainer
var _closing := false


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	theme = UiTheme.theme()
	mouse_filter = Control.MOUSE_FILTER_STOP
	process_mode = Node.PROCESS_MODE_ALWAYS
	var dim := ColorRect.new()
	# .modal: rgba(3, 5, 9, 0.62)
	dim.color = Color(0.012, 0.02, 0.035, 0.62)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	# (taps on it do nothing: the card's own close button and Back close it, as on the web)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)


## Fill the card (`fill(column)`) and bring it up, `want` units big at most (the web's width and
## max-height), inside the screen's margins.
func open(title: String, fill: Callable, want: Vector2) -> void:
	name = "Modal " + title
	box = PanelContainer.new()
	box.theme_type_variation = &"Box"
	box.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(box)
	column = VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 9)
	box.add_child(column)
	var h2 := Label.new()
	h2.text = title
	h2.theme_type_variation = &"H2"
	column.add_child(h2)
	fill.call(column)
	_place(want)
	resized.connect(_place.bind(want))
	# .modal fadeIn 0.2 s; .box boxIn 0.35 s (up 0.8em, from 0.97)
	modulate.a = 0.0
	var tw := CareerKit.tween(self)
	tw.tween_property(self, "modulate:a", 1.0, 0.2)
	box.scale = Vector2(0.97, 0.97)
	var to_y := box.position.y
	box.position.y += 12.8
	var tb: Tween = CareerKit.ease_out(CareerKit.tween(box).set_parallel(true))
	tb.tween_property(box, "scale", Vector2.ONE, 0.35)
	tb.tween_property(box, "position:y", to_y, 0.35)


func _place(want: Vector2) -> void:
	if box == null:
		return
	var m := FightHud.side_margin(self)
	var top := 12.0
	var avail := Vector2(size.x - m * 2.0, size.y - top * 2.0)
	var s := Vector2(minf(want.x, avail.x), minf(want.y, avail.y))
	box.size = s
	box.position = Vector2((size.x - s.x) * 0.5, top + (avail.y - s.y) * 0.5)
	box.pivot_offset = s * 0.5


## Take it down (and tell whoever opened it).
func close() -> void:
	if _closing:
		return
	_closing = true
	if on_close.is_valid():
		on_close.call()
	queue_free()


## The Android back button closes the card first.
func _unhandled_input(e: InputEvent) -> void:
	if e.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		close()
