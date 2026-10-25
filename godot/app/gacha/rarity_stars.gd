## A reveal's rarity as stars (app/gacha/pull_show.gd): one for a Common, two for a Rare, three
## for an Epic, filled in the rarity's colour with a soft glow behind each. pop() stamps them in
## one after another, each overshooting and settling with a flash.
class_name RarityStars
extends Control

var count := 1
var col := Color.WHITE
## Each star's size (0 not in yet) and its flash.
var _s: Array[float] = []
var _flash: Array[float] = []
var _d := 32.0


func _init(n: int, c: Color, d: float) -> void:
	count = n
	col = c
	_d = d
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(n * d * 1.18, d * 1.2)
	size = custom_minimum_size
	for i in n:
		_s.append(0.0)
		_flash.append(0.0)


## In they come, `gap` seconds apart after `delay`; `on_star(i)` as each lands (for its sound).
func pop(delay: float, gap: float, on_star: Callable) -> void:
	var tw := create_tween()
	tw.tween_interval(delay)
	for i in count:
		var k := i
		tw.tween_callback(func() -> void:
			_flash[k] = 1.0
			on_star.call(k))
		tw.tween_method(func(v: float) -> void:
			_s[k] = v
			queue_redraw(), 2.4, 1.0, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		if i < count - 1:
			tw.tween_interval(maxf(0.0, gap - 0.28))


func _process(dt: float) -> void:
	var any := false
	for i in _flash.size():
		if _flash[i] > 0.0:
			_flash[i] = maxf(0.0, _flash[i] - dt * 2.5)
			any = true
	if any:
		queue_redraw()


func _draw() -> void:
	var r := _d * 0.5
	for i in count:
		var s := _s[i]
		if s <= 0.0:
			continue
		var c := Vector2(r * 1.1 + i * _d * 1.18, size.y * 0.5)
		var f := _flash[i]
		# the glow behind it
		for k in 4:
			var gr := r * s * (1.9 - k * 0.3) * (1.0 + f * 0.6)
			draw_circle(c, gr, Color(col, (0.06 + 0.05 * f) * (k + 1) * 0.5))
		var pts := PackedVector2Array()
		for k in 10:
			var a := -PI * 0.5 + k * PI / 5.0
			var rr := r * s * (1.0 if k % 2 == 0 else 0.45)
			pts.append(c + Vector2(cos(a), sin(a)) * rr)
		draw_colored_polygon(pts, col.lerp(Color.WHITE, 0.25 + 0.6 * f))
		# a bright edge on its upper facets
		var hi := PackedVector2Array([pts[9], pts[0], pts[1]])
		draw_polyline(hi, Color(1, 1, 1, 0.55), maxf(1.0, r * 0.08), true)
