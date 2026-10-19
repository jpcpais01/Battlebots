## A web entrance (style.css heroIn, tileIn, cardIn, gearIn, slideL...: from transparent, offset
## and maybe scaled down, to in place, `both` fill) for any control, inside a container or not:
## this container holds the control and draws it offset while the entrance runs, so the layout
## around it never moves.
##   var r := Rise.wrap(tile)
##   r.play(0.5, 0.15, Vector2(0, 8), 0.9)
class_name Rise
extends Container

## Where the content is drawn from its place, and its scale (about its centre), now.
var off := Vector2.ZERO
var grow := 1.0
var _tw: Tween


## Wrap `c` (it takes c's size flags, so it sits where c would have).
static func wrap(c: Control) -> Rise:
	var r := Rise.new()
	r.size_flags_horizontal = c.size_flags_horizontal
	r.size_flags_vertical = c.size_flags_vertical
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.add_child(c)
	return r


func _get_minimum_size() -> Vector2:
	var m := Vector2.ZERO
	for c in get_children():
		if c is Control and (c as Control).visible:
			m = m.max((c as Control).get_combined_minimum_size())
	return m


func _notification(what: int) -> void:
	if what == NOTIFICATION_SORT_CHILDREN:
		for c in get_children():
			if c is Control:
				var ctl := c as Control
				fit_child_in_rect(ctl, Rect2(off, size))
				ctl.pivot_offset = size * 0.5
				ctl.scale = Vector2(grow, grow)


## Run the entrance: `dur` seconds after `delay`, from `from` units away and `scale_from` big,
## eased like --ease (cubic-bezier(0.2, 0.8, 0.2, 1)); `trans`/`ease` override the curve.
func play(dur: float, delay := 0.0, from := Vector2.ZERO, scale_from := 1.0, trans := Tween.TRANS_QUART, easing := Tween.EASE_OUT) -> Tween:
	if _tw != null:
		_tw.kill()
	_apply(0.0, from, scale_from)
	_tw = create_tween()
	if delay > 0.0:
		_tw.tween_interval(delay)
	_tw.tween_method(_apply.bind(from, scale_from), 0.0, 1.0, dur).set_trans(trans).set_ease(easing)
	return _tw


## Leave: fade to nothing while moving `to` away (presentOut), then hide.
func leave(dur: float, to := Vector2.ZERO) -> Tween:
	if _tw != null:
		_tw.kill()
	_tw = create_tween()
	_tw.tween_method(func(k: float) -> void:
		modulate.a = 1.0 - k
		off = to * k
		queue_sort(), 0.0, 1.0, dur)
	_tw.tween_callback(func() -> void: visible = false)
	return _tw


func _apply(k: float, from: Vector2, scale_from: float) -> void:
	var o := from * (1.0 - k)
	var g := lerpf(scale_from, 1.0, k)
	# (driven every frame by some (the fight intro's gear tiles: BotCard.gear_at), long after the
	# entrance is over: nothing to lay out again when nothing moved)
	if modulate.a == k and off == o and grow == g:
		return
	modulate.a = k
	off = o
	grow = g
	queue_sort()
