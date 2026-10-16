## A CSS box (careerUi.css, mapScreen.css): padding round its content, a fill drawn by one shader
## (a gradient, its border, a coloured top edge, a shine, and a glow or drop shadow round it). Lays its other children out like a PanelContainer, inside the padding.
class_name CareerBox
extends Container

const SHADER := preload("res://app/career/career_box.gdshader")

## left, top, right, bottom
var pad := Vector4.ZERO:
	set(v):
		pad = v
		queue_sort()
		update_minimum_size()
## The fill (a ColorRect with the box shader), always the first child.
var fill: ColorRect
var mat: ShaderMaterial
## How far the fill reaches past the box for its glow.
var glow_margin := 0.0


func _init(radius := 16.0, bg := Color(0, 0, 0, 0)) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	fill = ColorRect.new()
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fill.color = Color.WHITE
	mat = ShaderMaterial.new()
	mat.shader = SHADER
	fill.material = mat
	add_child(fill, false, Node.INTERNAL_MODE_FRONT)
	fill.resized.connect(func() -> void: mat.set_shader_parameter(&"size", fill.size - Vector2.ONE * glow_margin * 2.0))
	set_radius(radius)
	solid(bg)


func set_radius(r: float) -> CareerBox:
	mat.set_shader_parameter(&"radius", r)
	return self


## One colour all over.
func solid(c: Color) -> CareerBox:
	mat.set_shader_parameter(&"c0", c)
	mat.set_shader_parameter(&"c2", c)
	mat.set_shader_parameter(&"s1", -1.0)
	mat.set_shader_parameter(&"s3", -1.0)
	mat.set_shader_parameter(&"radial", false)
	return self


## linear-gradient(angle, a s0, [b s1,] c s2): stops as fractions; `b` null for two stops.
func linear(angle: float, a: Color, c: Color, s0 := 0.0, s2 := 1.0, b = null, s1 := -1.0) -> CareerBox:
	mat.set_shader_parameter(&"radial", false)
	mat.set_shader_parameter(&"angle", angle)
	_stops(a, c, s0, s2, b, s1)
	return self


## radial-gradient(circle at centre, a s0, c s2), `reach` of the box's width out.
func radial(centre: Vector2, reach: float, a: Color, c: Color, s0 := 0.0, s2 := 1.0) -> CareerBox:
	mat.set_shader_parameter(&"radial", true)
	mat.set_shader_parameter(&"centre", centre)
	mat.set_shader_parameter(&"reach", reach)
	_stops(a, c, s0, s2, null, -1.0)
	return self


func _stops(a: Color, c: Color, s0: float, s2: float, b, s1: float) -> void:
	mat.set_shader_parameter(&"c0", a)
	mat.set_shader_parameter(&"c2", c)
	mat.set_shader_parameter(&"s0", s0)
	mat.set_shader_parameter(&"s2", s2)
	mat.set_shader_parameter(&"c1", b if b != null else a)
	mat.set_shader_parameter(&"s1", s1 if b != null else -1.0)
	mat.set_shader_parameter(&"s3", -1.0)


## Four stops (a hard stop is two at one place): linear-gradient(angle, a s0, b s1, c s2, d s3).
func linear4(angle: float, a: Color, s0: float, b: Color, s1: float, c: Color, s2: float, d: Color, s3: float) -> CareerBox:
	linear(angle, a, c, s0, s2, b, s1)
	mat.set_shader_parameter(&"c3", d)
	mat.set_shader_parameter(&"s3", s3)
	return self


## border: w solid c; and border-top: tw solid tc (tw 0: the same as the sides).
func edge(c: Color, w := 1.0, tc := Color(0, 0, 0, 0), tw := 0.0) -> CareerBox:
	mat.set_shader_parameter(&"border", c)
	mat.set_shader_parameter(&"border_w", w)
	mat.set_shader_parameter(&"top", tc)
	mat.set_shader_parameter(&"top_w", tw)
	return self


## The cr-drop shine's position (-1 off the left .. 2 off the right; < -5 off).
func set_shine(x: float) -> void:
	mat.set_shader_parameter(&"shine", x)


## box-shadow: 0 y blur colour (a glow when y is 0), drawn outside the box only.
func glow(c: Color, blur: float, y := 0.0) -> CareerBox:
	glow_margin = blur + absf(y)
	mat.set_shader_parameter(&"glow_c", c)
	mat.set_shader_parameter(&"glow_b", blur)
	mat.set_shader_parameter(&"glow_off", Vector2(0, y))
	mat.set_shader_parameter(&"margin", glow_margin)
	queue_sort()
	return self


## padding in units: (vertical, horizontal) like CSS `padding: v h`.
func padding(v: float, h: float, b := -1.0) -> CareerBox:
	pad = Vector4(h, v, h, v if b < 0.0 else b)
	return self


func _get_minimum_size() -> Vector2:
	var m := Vector2.ZERO
	for c in get_children():
		var ctl := c as Control
		if ctl == null or not ctl.visible or ctl.top_level:
			continue
		m = m.max(ctl.get_combined_minimum_size())
	return m + Vector2(pad.x + pad.z, pad.y + pad.w)


func _notification(what: int) -> void:
	if what == NOTIFICATION_SORT_CHILDREN:
		fit_child_in_rect(fill, Rect2(Vector2.ONE * -glow_margin, size + Vector2.ONE * glow_margin * 2.0))
		mat.set_shader_parameter(&"size", size)
		var r := Rect2(pad.x, pad.y, size.x - pad.x - pad.z, size.y - pad.y - pad.w)
		for c in get_children():
			var ctl := c as Control
			if ctl != null and ctl.visible and not ctl.top_level:
				fit_child_in_rect(ctl, r)
