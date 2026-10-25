## Click-and-drag scrolling with a mouse (the Windows build). The menus are made for fingers: lists,
## tabs and part tiles scroll by dragging them, with their scroll bars hidden. Godot's
## ScrollContainer only drag-scrolls a touchscreen, so on a PC (the wheel still works) a held left
## button that moves past a few pixels drags the scroll box under it the way a finger would, and
## the button it started on is let go without being pressed.
##
## One per app (App._setup adds it). Touches, and the mouse events a touchscreen makes of them,
## are left to Godot.
class_name DragScroll
extends Node

## How far (in viewport pixels) the mouse moves before a press becomes a drag.
const SLOP := 9.0

## The scroll boxes under the press, nearest first, and the one being dragged once it moves.
var _under: Array[ScrollContainer] = []
var _sc: ScrollContainer = null
var _from := Vector2.ZERO
var _h0 := 0
var _v0 := 0
var _down := false
## (our own events, sent to let the pressed button go)
var _synth := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS


func _input(e: InputEvent) -> void:
	if _synth or e.device == InputEvent.DEVICE_ID_EMULATION:
		return
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var b := e as InputEventMouseButton
		if b.pressed:
			_down = true
			_sc = null
			_from = b.position
			var c := get_viewport().gui_get_hovered_control()
			# (sliders, scroll bars and text fields keep their own drags)
			_under = _scrolls_at(null if c is Range or c is LineEdit or c is TextEdit else c)
		else:
			if _sc != null:
				get_viewport().set_input_as_handled()
			_end()
	elif e is InputEventMouseMotion and _down:
		var m := e as InputEventMouseMotion
		if (m.button_mask & MOUSE_BUTTON_MASK_LEFT) == 0:
			_end()
			return
		var d := m.position - _from
		if _sc == null:
			if _under.is_empty() or d.length() < SLOP:
				return
			_sc = _pick(absf(d.x) > absf(d.y))
			if _sc == null:
				_under.clear()
				return
			_h0 = _sc.scroll_horizontal
			_v0 = _sc.scroll_vertical
			_let_go.call_deferred()
		if not is_instance_valid(_sc) or not _sc.is_visible_in_tree():
			_end()
			return
		var k := _scale(_sc)
		if _sc.horizontal_scroll_mode != ScrollContainer.SCROLL_MODE_DISABLED:
			_sc.scroll_horizontal = _h0 - roundi(d.x / k.x)
		if _sc.vertical_scroll_mode != ScrollContainer.SCROLL_MODE_DISABLED:
			_sc.scroll_vertical = _v0 - roundi(d.y / k.y)
		get_viewport().set_input_as_handled()


func _end() -> void:
	_down = false
	_sc = null
	_under.clear()


## The scroll boxes holding `c` (itself included), nearest first.
static func _scrolls_at(c: Control) -> Array[ScrollContainer]:
	var out: Array[ScrollContainer] = []
	var n: Node = c
	while n != null:
		if n is ScrollContainer:
			out.append(n as ScrollContainer)
		n = n.get_parent()
	return out


## The nearest scroll box that can move the way the mouse went (sideways, or up and down).
func _pick(sideways: bool) -> ScrollContainer:
	for s in _under:
		if not is_instance_valid(s) or not s.is_visible_in_tree():
			continue
		if sideways and s.horizontal_scroll_mode != ScrollContainer.SCROLL_MODE_DISABLED and _room(s.get_h_scroll_bar()):
			return s
		if not sideways and s.vertical_scroll_mode != ScrollContainer.SCROLL_MODE_DISABLED and _room(s.get_v_scroll_bar()):
			return s
	return null


static func _room(bar: ScrollBar) -> bool:
	return bar.max_value - bar.page > 0.5


## Viewport pixels per pixel of the scroll box (a scaled screen or card).
static func _scale(s: ScrollContainer) -> Vector2:
	var t := s.get_global_transform()
	return Vector2(maxf(0.01, t.x.length()), maxf(0.01, t.y.length()))


## Let go of the button (or tile) the drag started on, off screen, so it isn't pressed when the
## mouse comes up: GUI gets a move and a release far away, and the rest of the drag is ours.
func _let_go() -> void:
	var vp := get_viewport()
	if vp == null:
		return
	var far := Vector2(-100000, -100000)
	var m := InputEventMouseMotion.new()
	m.position = far
	m.global_position = far
	m.button_mask = MOUSE_BUTTON_MASK_LEFT
	var r := InputEventMouseButton.new()
	r.button_index = MOUSE_BUTTON_LEFT
	r.pressed = false
	r.position = far
	r.global_position = far
	_synth = true
	vp.push_input(m, true)
	vp.push_input(r, true)
	_synth = false
