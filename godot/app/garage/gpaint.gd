## A CSS box as a Control (gpaint.gdshader): rounded corners, a fill, up to two gradient layers
## and a line pattern, inset shadows, a border and outer shadows, in one draw. It doesn't take
## taps. The garage's tiles, swatches, balls and glows are these, sized by their containers.
##
## setup() takes a CSS-like description (every key optional):
##   radius, fill: Color, border: [width, Color], alpha,
##   a / b: a gradient layer (b over a): G.lin(angle, stops), G.rad(center, stops, radii),
##          G.conic(center, stops); stops are [[Color, position 0..1], ...],
##   stripes: [kind 4 rings | 5 vertical lines, center, period, Color, on-width],
##   inset: [height, Color] (inset 0 -h 0), iglow: [blur, Color] (inset 0 0 blur),
##   ring: [width, Color] (0 0 0 w), glow: [blur, Color, offset], drop: [blur, Color, offset].
extends Control

const SHADER := preload("res://app/garage/gpaint.gdshader")

var _mat := ShaderMaterial.new()
## How far outside the box its shadows reach (the draw covers that much more on each side).
var _pad := 0.0
## As a PanelContainer's background it is fitted inside the panel's padding: it reaches back
## out over it (left, top, right, bottom) to cover the whole panel.
var _grow := Vector4.ZERO


func _init(spec: Dictionary = {}) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mat.shader = SHADER
	material = _mat
	resized.connect(_resized)
	if not spec.is_empty():
		setup(spec)


func _notification(what: int) -> void:
	if what == NOTIFICATION_PARENTED:
		var p := get_parent() as PanelContainer
		_grow = Vector4.ZERO
		if p != null and p.get_child_count() > 0 and p.get_child(0) == self:
			var sb := p.get_theme_stylebox(&"panel")
			if sb != null:
				_grow = Vector4(sb.content_margin_left, sb.content_margin_top, sb.content_margin_right, sb.content_margin_bottom)
				_grow = _grow.max(Vector4.ZERO)
		_resized()


func _resized() -> void:
	_mat.set_shader_parameter(&"size", size + Vector2(_grow.x + _grow.z, _grow.y + _grow.w))
	_mat.set_shader_parameter(&"origin", Vector2(_grow.x, _grow.y))
	queue_redraw()


## Describe the box (see the class notes). Keys left out keep their last value.
func setup(s: Dictionary) -> void:
	var m := _mat
	if s.has("radius"):
		m.set_shader_parameter(&"radius", float(s.radius))
	if s.has("fill"):
		m.set_shader_parameter(&"fill", s.fill)
	if s.has("alpha"):
		m.set_shader_parameter(&"alpha", float(s.alpha))
	if s.has("border"):
		m.set_shader_parameter(&"border_w", float(s.border[0]))
		m.set_shader_parameter(&"border_col", s.border[1])
	for k in ["a", "b"]:
		if s.has(k):
			_layer(k, s[k])
	if s.has("stripes"):
		var st: Array = s.stripes
		m.set_shader_parameter(&"s_kind", int(st[0]))
		m.set_shader_parameter(&"s_center", st[1])
		m.set_shader_parameter(&"s_period", float(st[2]))
		m.set_shader_parameter(&"s_c", PackedColorArray([st[3], Color(0, 0, 0, 0), Color(0, 0, 0, 0)]))
		m.set_shader_parameter(&"s_p", PackedFloat32Array([float(st[4]), 0.0, 0.0]))
	if s.has("inset"):
		m.set_shader_parameter(&"inset_h", float(s.inset[0]))
		m.set_shader_parameter(&"inset_col", s.inset[1])
	if s.has("iglow"):
		m.set_shader_parameter(&"iglow_blur", float(s.iglow[0]))
		m.set_shader_parameter(&"iglow_col", s.iglow[1])
	if s.has("ring"):
		m.set_shader_parameter(&"ring_w", float(s.ring[0]))
		m.set_shader_parameter(&"ring_col", s.ring[1])
	for k in ["glow", "drop"]:
		if s.has(k):
			var g: Array = s[k]
			m.set_shader_parameter(k + "_blur", float(g[0]))
			m.set_shader_parameter(k + "_col", g[1])
			m.set_shader_parameter(k + "_off", g[2] if g.size() > 2 else Vector2.ZERO)
	var reach := 0.0
	var ring = m.get_shader_parameter(&"ring_w")
	reach = maxf(reach, float(ring) if ring != null else 0.0)
	for k in ["glow", "drop"]:
		var col = m.get_shader_parameter(k + "_col")
		if col != null and (col as Color).a > 0.0:
			var off = m.get_shader_parameter(k + "_off")
			reach = maxf(reach, float(m.get_shader_parameter(k + "_blur")) * 1.6 + (off as Vector2).length() if off != null else 0.0)
	if reach != _pad:
		_pad = ceilf(reach + 1.0)
		queue_redraw()


## One gradient layer: {kind, stops, angle, center, rad} (G.lin, G.rad, G.conic make them; null
## takes the layer away).
func _layer(k: String, l) -> void:
	var m := _mat
	if l == null:
		m.set_shader_parameter(k + "_kind", 0)
		return
	var cs := PackedColorArray()
	var ps := PackedFloat32Array()
	for st in l.stops:
		cs.append(st[0])
		ps.append(float(st[1]))
	var n := cs.size()
	while cs.size() < 7:
		cs.append(cs[cs.size() - 1])
		ps.append(ps[ps.size() - 1])
	m.set_shader_parameter(k + "_kind", int(l.kind))
	m.set_shader_parameter(k + "_n", n)
	m.set_shader_parameter(k + "_c", cs)
	m.set_shader_parameter(k + "_p", ps)
	m.set_shader_parameter(k + "_angle", float(l.get("angle", 180.0)))
	m.set_shader_parameter(k + "_center", l.get("center", Vector2(0.5, 0.5)))
	m.set_shader_parameter(k + "_rad", l.get("rad", Vector2.ZERO))


## One shader value by name (a tween can drive these: "alpha", "glow_col"...).
func set_param(k: StringName, v: Variant) -> void:
	_mat.set_shader_parameter(k, v)


func get_param(k: StringName) -> Variant:
	return _mat.get_shader_parameter(k)


func _draw() -> void:
	var o := Vector2(_grow.x, _grow.y)
	var full := size + Vector2(_grow.x + _grow.z, _grow.y + _grow.w)
	draw_rect(Rect2(-o - Vector2(_pad, _pad), full + Vector2(_pad, _pad) * 2.0), Color.WHITE)
