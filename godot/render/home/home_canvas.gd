## A little screen drawn with 2D calls, for a home scene's TV or round timer (the web draws them on
## a canvas and uploads it as a CanvasTexture): an off-screen SubViewport that only renders when
## redraw() is called, so a picture changing a few times a second costs nothing in between.
class_name HomeCanvas
extends SubViewport

## Draws the picture: (CanvasItem) -> void, with the canvas's own 2D calls.
var paint: Callable
var _painter := _Painter.new()


func _init(w: int, h: int, p: Callable) -> void:
	size = Vector2i(w, h)
	disable_3d = true
	transparent_bg = false
	render_target_clear_mode = SubViewport.CLEAR_MODE_ALWAYS
	render_target_update_mode = SubViewport.UPDATE_ONCE
	paint = p
	_painter.host = self
	_flip(_painter)
	add_child(_painter)


## Draw more over the picture, in order: `p` as `paint`, added on if `additive` (the canvas's
## globalCompositeOperation 'lighter').
func add_layer(p: Callable, additive := false) -> void:
	var layer := _Painter.new()
	layer.host = self
	layer.paint = p
	_flip(layer)
	if additive:
		var m := CanvasItemMaterial.new()
		m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		layer.material = m
	add_child(layer)


## Drawn upside down: the baked screens carry three's uvs (v up, for a canvas texture uploaded
## with flipY), and a viewport's texture has its first row at v 0.
func _flip(c: Node2D) -> void:
	c.position = Vector2(0, size.y)
	c.scale = Vector2(1, -1)


## Draw the picture again (rendered once, on the next frame).
func redraw() -> void:
	for c in get_children():
		(c as CanvasItem).queue_redraw()
	render_target_update_mode = SubViewport.UPDATE_ONCE


## A bold sans-serif (the canvas's 'bold Npx sans-serif').
static func sans() -> Font:
	return _font("sans", ["Arial", "Helvetica", "Roboto", "DejaVu Sans", "Liberation Sans", "sans-serif"])


## A bold monospace (the canvas's 'bold Npx "Courier New", monospace').
static func mono() -> Font:
	return _font("mono", ["Courier New", "Liberation Mono", "DejaVu Sans Mono", "Droid Sans Mono", "monospace"])


static var _fonts := {}


static func _font(k: String, names: Array) -> Font:
	if not _fonts.has(k):
		var f := SystemFont.new()
		f.font_names = PackedStringArray(names)
		f.font_weight = 700
		f.antialiasing = TextServer.FONT_ANTIALIASING_GRAY
		_fonts[k] = f
	return _fonts[k]


## Text as the canvas's fillText: at x (left, centre or right of it per `align`: -1, 0, 1), its
## baseline at y, or its middle at y with `middle` (textBaseline 'middle').
static func text(ci: CanvasItem, font: Font, px: int, s: String, x: float, y: float, col: Color, align := -1, middle := false) -> void:
	var w := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
	var x0 := x - (w * 0.5 if align == 0 else w if align > 0 else 0.0)
	var base := y
	if middle:
		base = y + (font.get_ascent(px) - font.get_descent(px)) * 0.5
	ci.draw_string(font, Vector2(x0, base), s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, col)


class _Painter:
	extends Node2D
	var host: HomeCanvas
	## Its own drawing (a layer), else the canvas's `paint`.
	var paint := Callable()

	func _draw() -> void:
		var p := paint if paint.is_valid() else host.paint
		if p.is_valid():
			p.call(self)
