## A skin as a card (app/gacha/card.gdshader): its turning swatch, its name and rarity, and a
## badge (NEW, the shards a duplicate gave, the copies owned, a price). Face down it shows the
## vault's emblem with its edge glowing the colour of what's under it. A button: tap it.
class_name SkinCard
extends Button

const SHADER := preload("res://app/gacha/card.gdshader")
const MARGIN := 18.0

var skin = null
var face_up := true
var bg := ColorRect.new()
var mat := ShaderMaterial.new()
var orb: SkinOrb
var name_l: Label
var tier_l: Label
var badge: PanelContainer
var badge_l: Label
## A check mark: the card is the one being worn.
var worn: TextureRect
var _w := 0.0
var _h := 0.0


func _init(s = null, w := 120.0, h := 168.0) -> void:
	_w = w
	_h = h
	custom_minimum_size = Vector2(w, h)
	size = Vector2(w, h)
	pivot_offset = Vector2(w, h) * 0.5
	focus_mode = Control.FOCUS_NONE
	var none := StyleBoxEmpty.new()
	for st in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
		add_theme_stylebox_override(st, none)
	mat.shader = SHADER
	bg.material = mat
	bg.color = Color.WHITE
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg.position = -Vector2.ONE * MARGIN
	bg.size = Vector2(w, h) + Vector2.ONE * MARGIN * 2.0
	mat.set_shader_parameter("size", Vector2(w, h))
	mat.set_shader_parameter("radius", maxf(8.0, w * 0.11))
	mat.set_shader_parameter("seed", randf() * 10.0)
	add_child(bg)
	var op := w * 0.8
	orb = SkinOrb.new(null, op)
	orb.size = Vector2(op, op)
	orb.position = Vector2((w - op) * 0.5, h * 0.37 - op * 0.5)
	add_child(orb)
	name_l = MenuKit.label("", maxf(10.0, w * 0.105), 750)
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_l.clip_text = true
	name_l.position = Vector2(4, h * 0.71)
	name_l.size = Vector2(w - 8, w * 0.14)
	add_child(name_l)
	tier_l = MenuKit.label("", maxf(8.5, w * 0.075), 800, UiTheme.MUTED, 1)
	tier_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tier_l.position = Vector2(4, h * 0.71 + w * 0.14)
	tier_l.size = Vector2(w - 8, w * 0.1)
	add_child(tier_l)
	var fs := maxf(8.5, w * 0.075)
	badge = MenuKit.pill(MenuKit.box(MenuKit.AMBER, 999, [fs * 0.55, fs * 0.12, fs * 0.55, fs * 0.12]))
	badge_l = MenuKit.label("", fs, 800, UiTheme.INK)
	badge.get_node("Row").add_child(badge_l)
	badge.position = Vector2(w * 0.06, w * 0.06)
	badge.visible = false
	add_child(badge)
	worn = MenuKit.icon("check", w * 0.16, UiTheme.GREEN)
	worn.position = Vector2(w * 0.78, w * 0.05)
	worn.size = Vector2(w * 0.16, w * 0.16)
	worn.visible = false
	add_child(worn)
	set_skin(s)


func set_skin(s, veiled := false) -> void:
	skin = s
	var col: Color = Skins.RARITY_COL[int(s.r)] if s != null else Color(0.6, 0.65, 0.72)
	mat.set_shader_parameter("rim", col)
	mat.set_shader_parameter("tier", float(s.r) if s != null else 0.0)
	mat.set_shader_parameter("dim", 1.0 if veiled else 0.0)
	orb.set_skin(s, veiled)
	name_l.text = s.name if s != null else "Plain paint"
	name_l.add_theme_color_override(&"font_color", UiTheme.TEXT if not veiled else UiTheme.MUTED)
	tier_l.text = (Skins.RARITY_NAME[int(s.r)] if s != null else "Your paint").to_upper()
	tier_l.add_theme_color_override(&"font_color", col if s != null else UiTheme.MUTED)
	set_face(face_up)


## A badge in the top corner ("" hides it): amber for NEW, or a colour of its own.
func set_badge(text: String, bg_col := MenuKit.AMBER, fg := UiTheme.INK) -> void:
	badge.visible = text != ""
	badge_l.text = text
	badge_l.add_theme_color_override(&"font_color", fg)
	(badge.get_theme_stylebox(&"panel") as StyleBoxFlat).bg_color = bg_col


func set_face(up: bool) -> void:
	face_up = up
	mat.set_shader_parameter("front", 1.0 if up else 0.0)
	for c in [orb, name_l, tier_l]:
		c.visible = up
	if not up:
		badge.visible = false
		worn.visible = false


func set_glow(k: float) -> void:
	mat.set_shader_parameter("glow", k)
