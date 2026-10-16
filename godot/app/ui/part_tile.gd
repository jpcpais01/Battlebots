## One fitted part as a square tile (style.css .hero-tiles .tile on the home screen, .bcard .g on a
## bot card): a dark rounded face glowing in the part's rarity colour, with the part's picture
## (Game.thumbs, once the garage's renders are there) or its slot's line icon in that colour.
## The face sits in a Rise, so the web's tileIn / gearIn entrance can play without moving the
## layout.
class_name PartTile
extends Button

## "hero" (.tile) or "card" (.bcard .g).
var kind := "hero"
var slot := ""
var item
var rarity := 0.0
var rise: Rise
var _face: ColorRect
var _pic := TextureRect.new()
var _shadow: Panel
var _has_pic := false


## A tile for `slot` wearing `item` at `rarity`, `px` square.
static func make(kind_: String, px: float) -> PartTile:
	var t := PartTile.new()
	t.kind = kind_
	t.custom_minimum_size = Vector2(px, px)
	t._build()
	return t


func _build() -> void:
	var none := StyleBoxEmpty.new()
	for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
		add_theme_stylebox_override(s, none)
	focus_mode = Control.FOCUS_NONE
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var holder := Control.new()
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rise = Rise.wrap(holder)
	rise.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(rise)
	var hero := kind == "hero"
	if hero:
		# box-shadow: 0 6px 18px rgba(0,0,0,0.35)
		_shadow = Panel.new()
		var sb := MenuKit.box(Color(0.04, 0.05, 0.08, 0.92), 0)
		sb.shadow_color = Color(0, 0, 0, 0.35)
		sb.shadow_size = 9
		sb.shadow_offset = Vector2(0, 6)
		_shadow.add_theme_stylebox_override(&"panel", sb)
		_shadow.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_shadow.set_anchors_preset(Control.PRESET_FULL_RECT)
		holder.add_child(_shadow)
	_face = MenuKit.grad_panel({
		"c0": Color(30 / 255.0, 36 / 255.0, 50 / 255.0, 0.9) if hero else Color(1, 1, 1, 0.04),
		"c1": Color(10 / 255.0, 13 / 255.0, 20 / 255.0, 0.92) if hero else Color(1, 1, 1, 0.04),
		"angle": 180.0,
		"tint_at": Vector2(0.5, 0.38 if hero else 0.4),
		"tint_r": 0.7,
		"border": UiTheme.LINE,
		"border_w": 1.0,
	})
	_face.set_anchors_preset(Control.PRESET_FULL_RECT)
	holder.add_child(_face)
	_pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_pic.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	holder.add_child(_pic)
	holder.resized.connect(_layout.bind(holder))
	UiTheme.press_feedback(self, 0.92)


func _layout(holder: Control) -> void:
	var s := holder.size
	# .tile: border-radius 24%; .bcard .g: 12px
	var r := s.x * 0.24 if kind == "hero" else 12.0
	(_face.material as ShaderMaterial).set_shader_parameter("radius", r)
	if _shadow != null:
		var sb := _shadow.get_theme_stylebox(&"panel") as StyleBoxFlat
		sb.set_corner_radius_all(int(r))
	# img 90%; the slot icon 44% (.tile svg) or 45% (.bcard .g svg)
	var k := 0.9 if _has_pic else (0.44 if kind == "hero" else 0.45)
	_pic.size = s * k
	_pic.position = (s - _pic.size) * 0.5


## Show `item` at `rarity` in `paint` (`game` for its part pictures; null: the slot icon).
func show_part(game, slot_: String, item_, rarity_: float, paint, loadout = null) -> void:
	slot = slot_
	item = item_
	rarity = rarity_
	var rc := Color.html(String(TItems.partTint(item)))
	(_face.material as ShaderMaterial).set_shader_parameter("tint", Color(rc, 0.26 if kind == "hero" else 0.24))
	var tex := picture(game, item, rarity, paint, loadout)
	_has_pic = tex != null
	if _has_pic:
		_pic.texture = tex
		_pic.modulate = Color.WHITE
	else:
		_pic.texture = UiTheme.icon("slot:" + slot, 40)
		_pic.modulate = rc
	tooltip_text = "%s: %s" % [TItems.SLOT_LABEL[slot], item.name_] if kind == "hero" else String(item.name_)
	_layout(rise.get_child(0) as Control)


## Whether the tile shows the part's real picture (not yet: the slot icon).
func has_picture() -> bool:
	return _has_pic


## A part's picture from the garage's renders (Game.thumbs: thumb(item, rarity, paint[, loadout])),
## or null while there are none (botCard.ts: no thumbnail, the slot icon).
static func picture(game, item_, rarity_: float, paint, loadout = null) -> Texture2D:
	if game == null:
		return null
	var th = game.get("thumbs")
	if th == null or not th.has_method("thumb"):
		return null
	var four: bool = loadout != null and th.get_method_argument_count("thumb") >= 4
	var t = th.thumb(item_, rarity_, paint, loadout) if four else th.thumb(item_, rarity_, paint)
	return t if t is Texture2D else null
