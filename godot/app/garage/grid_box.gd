## A CSS grid of equal columns (style.css .pgrid, .sz-rows, .walkons-row, .rarities): `cols`
## columns, or as many as fit at least `min_col` wide (repeat(auto-fill, minmax(min_col, 1fr))),
## `gap` apart. Each row is as tall as its tallest child; `square` makes every cell as tall as it
## is wide (aspect-ratio: 1). Its own height follows its width.
extends Container

var cols := 0
var min_col := 100.0
var gap := Vector2(6, 6)
var square := false


func _init(columns := 0, min_width := 100.0, gaps := Vector2(6, 6), squares := false) -> void:
	cols = columns
	min_col = min_width
	gap = gaps
	square = squares
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	resized.connect(update_minimum_size)


func _columns(w: float) -> int:
	if cols > 0:
		return cols
	return maxi(1, int(floorf((w + gap.x) / (min_col + gap.x))))


func _kids() -> Array[Control]:
	var out: Array[Control] = []
	for c in get_children():
		if c is Control and (c as Control).visible and not (c as Control).top_level:
			out.append(c)
	return out


## Row heights for width `w`.
func _rows(w: float) -> Array[float]:
	var n := _columns(w)
	var cell := (w - gap.x * (n - 1)) / n
	var kids := _kids()
	var rows: Array[float] = []
	for i in kids.size():
		var h := cell if square else kids[i].get_combined_minimum_size().y
		if i % n == 0:
			rows.append(h)
		else:
			rows[rows.size() - 1] = maxf(rows[rows.size() - 1], h)
	return rows


func _get_minimum_size() -> Vector2:
	var rows := _rows(size.x)
	var h := 0.0
	for r in rows:
		h += r
	if rows.size() > 1:
		h += gap.y * (rows.size() - 1)
	return Vector2(0, h)


func _notification(what: int) -> void:
	if what != NOTIFICATION_SORT_CHILDREN:
		return
	var w := size.x
	var n := _columns(w)
	var cell := (w - gap.x * (n - 1)) / n
	var rows := _rows(w)
	var kids := _kids()
	var y := 0.0
	for i in kids.size():
		var r := i / n
		var c := i % n
		if c == 0 and r > 0:
			y += rows[r - 1] + gap.y
		fit_child_in_rect(kids[i], Rect2(c * (cell + gap.x), y, cell, rows[r]))
