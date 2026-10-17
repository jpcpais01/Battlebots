## The "Ray tracing" setting's traced lighting (port of src/render/rt.ts ScreenSpaceLighting):
## screen-space bounce light, ambient occlusion, contact shadows from the key light, and glossy
## reflections on the canvas and the venue's floor (ray_trace.gdshader). It is one quad that
## covers the screen, drawn first in the transparent pass; hidden, it costs nothing.
##
## Settings picks the mode: "light" runs all of it on the phone's usual renderer (Mobile);
## "heavy" runs the app on Forward+, where Godot's own SSAO and SSIL take over the occlusion and
## the bounce, and this keeps only the contact shadows and the floor reflections.
class_name RayTrace
extends MeshInstance3D

## The ring's canvas: a lacquered print with a satin gloss, the same in every venue (rt.ts
## CANVAS_GLOSS): strength, roughness.
const CANVAS_GLOSS := Vector2(0.6, 0.3)
## The floor round the stage per venue (venue.ts / outdoor.ts reflect.floor): strength,
## roughness (the venue floor's roughness less 0.3, kept in 0.1..0.8), height (bowl.ts FLOOR).
## A venue left out has a matte floor.
const FLOORS := {
	"grand": Vector3(0.95, 0.14, -0.62),
	"harbor": Vector3(0.5, 0.32, -0.62),
	"rooftop": Vector3(0.65, 0.25, -0.62),
	"falls": Vector3(0.35, 0.6, -0.62),
}
## How much of each part shows, per mode: occlusion, bounce, contact shadows, reflections (rt.ts
## AO_STRENGTH, BOUNCE_STRENGTH).
const AMOUNTS := {
	"light": Vector4(0.85, 0.45, 1.0, 1.0),
	"heavy": Vector4(0.0, 0.0, 1.0, 1.0),
}

## "off", "light" or "heavy" (Settings.rt_mode).
var mode := "off"
var _mat := ShaderMaterial.new()
var _place := "arena"
var _arena_id := "grand"


func _init() -> void:
	name = "RayTrace"
	var quad := QuadMesh.new()
	quad.size = Vector2(2, 2)
	# (its vertices go straight to the screen: never culled, wherever the camera looks)
	quad.custom_aabb = AABB(Vector3.ONE * -1e5, Vector3.ONE * 2e5)
	mesh = quad
	_mat.shader = preload("res://render/rt/ray_trace.gdshader")
	# first of the transparent pass: it reads the opaque scene, and what's see-through draws over it
	_mat.render_priority = Material.RENDER_PRIORITY_MIN
	material_override = _mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	ignore_occlusion_culling = true
	visible = false


## The key light, whose contact shadows are traced (its place in the world).
func set_key(key: Light3D) -> void:
	if key != null:
		_mat.set_shader_parameter("key_pos", key.global_position if key.is_inside_tree() else key.position)


func set_mode(m: String) -> void:
	mode = m
	_sync()


## The world's place (Game.set_place): the map has none of it, and only the arena has the
## canvas, the key light and the venue's floor.
func set_place(p: String) -> void:
	_place = p
	_sync()


## The venue the fights are in (EventVenues.arena_id), for its floor's gloss.
func set_arena(id: String) -> void:
	_arena_id = id
	_sync()


func _sync() -> void:
	visible = mode != "off" and _place != "map"
	if not visible:
		return
	var arena := _place == "arena"
	var k: Vector4 = AMOUNTS.get(mode, AMOUNTS.light)
	# away from the arena the key light is off and there's no canvas (the home scenes, the garage)
	if not arena:
		k.z = 0.0
		k.w = 0.0
	_mat.set_shader_parameter("amounts", k)
	_mat.set_shader_parameter("canvas_look", CANVAS_GLOSS if arena else Vector2.ZERO)
	_mat.set_shader_parameter("floor_look", FLOORS.get(_arena_id, Vector3(0.0, 0.5, -0.62)) if arena else Vector3.ZERO)
