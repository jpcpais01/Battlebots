## Tone check on this renderer: unshaded quads of known linear values through the fight's
## environment; prints what comes back (linear 0..255) next to three's ACES of the same value.
extends SceneTree

const VALS := [0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64]
var _f := 0


func _init() -> void:
	var root := Node3D.new()
	get_root().add_child.call_deferred(root)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0, 0, 0)
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.05 / 0.6 / 1.8
	env.tonemap_white = 16.0
	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = 8.0
	cam.position = Vector3(0, 0, 5)
	root.add_child(cam)
	for i in VALS.size():
		var mi := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(1.6, 1.6)
		mi.mesh = q
		var m := ShaderMaterial.new()
		var s := Shader.new()
		s.code = "shader_type spatial; render_mode unshaded; uniform float v; void fragment(){ ALBEDO = vec3(v); }"
		m.shader = s
		m.set_shader_parameter("v", VALS[i])
		mi.material_override = m
		mi.position = Vector3(-6.3 + i * 1.8, 0, 0)
		root.add_child(mi)


func _aces(x: float) -> float:
	x *= 1.05 / 0.6
	return clampf(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)


func _process(_dt: float) -> bool:
	_f += 1
	if _f == 6:
		var img := get_root().get_texture().get_image()
		var w := img.get_width()
		var h := img.get_height()
		for i in VALS.size():
			var x := int(w * 0.5 + (-6.3 + i * 1.8) / 8.0 * h)
			var c := img.get_pixel(x, h / 2)
			print("%.3f -> %.1f (three ACES approx %.1f)" % [VALS[i], c.r * 255.0, _aces(VALS[i]) * 255.0])
		return true
	return false
