## A burst of sparks off a card as it turns over on a Rare or better (app/gacha/pull_show.gd):
## streaks in the rarity's colour flying out from the card's edge and a ring, drawn additively,
## gone in under a second. Frees itself.
class_name CardSparks
extends Control

const LIFE := 0.85

var col := Color.WHITE
var _rect := Rect2()
var _t := 0.0
var _sparks: Array = []


## Sparks round `rect` (the card, in the parent's coordinates); more and faster for an Epic.
func _init(rect: Rect2, c: Color, tier: int) -> void:
	_rect = rect
	col = c
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var add := CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	material = add
	var n := 18 if tier <= Skins.RARE else 34
	var mid := rect.get_center()
	for i in n:
		var a := randf() * TAU
		var dir := Vector2(cos(a), sin(a))
		# from the card's edge, roughly: the rect's border along that direction
		var k := minf(rect.size.x * 0.5 / maxf(absf(dir.x), 1e-3), rect.size.y * 0.5 / maxf(absf(dir.y), 1e-3))
		var sp := randf_range(0.6, 1.0) * rect.size.x * (2.2 if tier > Skins.RARE else 1.6)
		_sparks.append({
			"p": mid + dir * k * 0.92,
			"v": dir * sp,
			"len": randf_range(0.05, 0.11) * rect.size.x,
			"w": randf_range(1.2, 2.4),
			"life": randf_range(0.55, 1.0) * LIFE,
		})


func _process(dt: float) -> void:
	_t += dt
	for s in _sparks:
		s.p += s.v * dt
		s.v *= 1.0 - minf(1.0, dt * 3.2)
	if _t >= LIFE:
		queue_free()
	queue_redraw()


func _draw() -> void:
	# the ring off the card's edge
	var k := _t / LIFE
	var ring := _rect.grow(k * _rect.size.x * 0.35)
	var ra := (1.0 - k) * (1.0 - k) * 0.7
	draw_rect(ring, Color(col.lerp(Color.WHITE, 0.3), ra), false, 2.5 * (1.0 - k) + 0.5)
	for s in _sparks:
		var f: float = _t / float(s.life)
		if f >= 1.0:
			continue
		var v: Vector2 = s.v
		var tail: Vector2 = v.normalized() * float(s.len) * (1.0 - f * 0.5)
		var a := (1.0 - f) * (1.0 - f)
		draw_line(s.p - tail, s.p, Color(col.lerp(Color.WHITE, 0.55), a), float(s.w))
