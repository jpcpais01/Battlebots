## A box as tall as it is wide times `ratio` (CSS aspect-ratio), its children filling it.
extends Container

var ratio := 1.0


func _init(r := 1.0) -> void:
	ratio = r
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(update_minimum_size)


func _get_minimum_size() -> Vector2:
	return Vector2(0, size.x * ratio)


func _notification(what: int) -> void:
	if what == NOTIFICATION_SORT_CHILDREN:
		for c in get_children():
			if c is Control and not (c as Control).top_level:
				fit_child_in_rect(c, Rect2(Vector2.ZERO, size))
