## This renderer's tone curve (the container's GL compatibility path on llvmpipe): unshaded quads
## of known linear values through the fight's ACES environment, printed as "x out" pairs, for
## tools/shots-style correction of map shots (scratch worldmap fix.py): what comes back is
## contrastier than the true ACES curve a phone shows.
extends SceneTree

var VALS: Array[float] = []
var _f := 0


func _init() -> void:
	for i in 40:
		VALS.append(0.004 * pow(1.25, i))
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
	var s := Shader.new()
	s.code = "shader_type spatial; render_mode unshaded; uniform float v; void fragment(){ ALBEDO = vec3(v); }"
	for i in VALS.size():
		var mi := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(0.3, 0.3)
		mi.mesh = q
		var m := ShaderMaterial.new()
		m.shader = s
		m.set_shader_parameter("v", VALS[i])
		mi.material_override = m
		mi.position = Vector3(-6.0 + (i % 20) * 0.6, 1.0 - (i / 20) * 2.0, 0)
		root.add_child(mi)


func _process(_dt: float) -> bool:
	_f += 1
	if _f == 6:
		var img := get_root().get_texture().get_image()
		var w := img.get_width()
		var h := img.get_height()
		for i in VALS.size():
			var x := int(w * 0.5 + (-6.0 + (i % 20) * 0.6) / 8.0 * h)
			var y := int(h * 0.5 - (1.0 - (i / 20) * 2.0) / 8.0 * h)
			print("tone %.6f %.6f" % [VALS[i], img.get_pixel(x, y).r])
		return true
	return false
