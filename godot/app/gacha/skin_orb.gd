## A skin's swatch: a turning ball of armour wearing it (render/skins/skin_orb.gdshader), with a
## halo in its rarity's colour. Square: give it a minimum size or let a container size it.
class_name SkinOrb
extends ColorRect

const SHADER := preload("res://render/skins/skin_orb.gdshader")

var skin = null
var mat := ShaderMaterial.new()


func _init(s = null, px := 96.0, veiled := false) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	color = Color.WHITE
	custom_minimum_size = Vector2(px, px)
	mat.shader = SHADER
	material = mat
	set_skin(s, veiled)


## Show a skin (null: a plain grey ball), veiled or not.
func set_skin(s, veiled := false) -> void:
	skin = s
	Skins.apply(mat, s, 0)
	mat.set_shader_parameter("veil", 1.0 if veiled else 0.0)
	if s != null:
		var c: Color = Skins.RARITY_COL[int(s.r)]
		mat.set_shader_parameter("halo", Color(c, 0.35 + 0.3 * float(s.r)))
		# each skin turns from its own angle, so a grid of them doesn't move as one
		mat.set_shader_parameter("phase", float(String(s.id).hash() % 1000) / 1000.0)
	else:
		mat.set_shader_parameter("halo", Color(1, 1, 1, 0))


## How strong the halo is (the reveal flares it).
func set_halo(k: float) -> void:
	if skin == null:
		return
	var c: Color = Skins.RARITY_COL[int(skin.r)]
	mat.set_shader_parameter("halo", Color(c, k))


func set_spin(turns_per_s: float) -> void:
	mat.set_shader_parameter("spin", turns_per_s)
