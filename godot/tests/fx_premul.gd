## Checks how blend_premul_alpha treats ALBEDO (does Godot multiply it by ALPHA again?).
extends SceneTree

var _n := 0


func _init() -> void:
	var root := Node3D.new()
	get_root().add_child.call_deferred(root)
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.position = Vector3(0, 0, 2)
	var mi := MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(4, 4)
	mi.mesh = q
	var sm := ShaderMaterial.new()
	sm.shader = Shader.new()
	sm.shader.code = "shader_type spatial; render_mode unshaded, blend_premul_alpha, fog_disabled; void fragment(){ ALBEDO = vec3(0.5); ALPHA = 0.5; }"
	mi.material_override = sm
	root.add_child(mi)
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color(0, 0, 0)
	root.add_child(env)


func _process(_dt: float) -> bool:
	_n += 1
	if _n == 5:
		print("premul pixel ", get_root().get_texture().get_image().get_pixel(640, 360))
		return true
	return false
