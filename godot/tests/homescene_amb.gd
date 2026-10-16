## How much ambient light the home scenes' lit material (home_std.gdshaderinc) takes on this
## renderer, against Godot's own material: white-ish quads in a grey ambient light, no lights, linear
## tone mapping; prints what comes back (linear).
##   godot/tools/shots/shot.sh res://tests/homescene_amb.gd
extends SceneTree

var _f := 0
var _quads: Array[String] = []


func _init() -> void:
	var root := Node3D.new()
	get_root().add_child.call_deferred(root)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0, 0, 0)
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	# BB_SKY=v: a flat sky of v as the ambient's source too, mixed in at BB_MIX
	if OS.get_environment("BB_SKY") != "":
		var sk := Sky.new()
		var skm := ShaderMaterial.new()
		var sks := Shader.new()
		sks.code = "shader_type sky; void sky() { COLOR = vec3(%s); }" % OS.get_environment("BB_SKY")
		skm.shader = sks
		sk.sky_material = skm
		env.sky = sk
		env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
		env.ambient_light_sky_contribution = float(OS.get_environment("BB_MIX"))
	env.ambient_light_color = Color.WHITE * float(OS.get_environment("BB_AMB") if OS.get_environment("BB_AMB") != "" else "0.4")
	env.ambient_light_energy = float(OS.get_environment("BB_AMBE")) if OS.get_environment("BB_AMBE") != "" else 1.0
	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = 8.0
	cam.position = Vector3(0, 0, 5)
	root.add_child(cam)
	var std := StandardMaterial3D.new()
	std.albedo_color = Color(0.5, 0.5, 0.5).linear_to_srgb()
	std.roughness = 1.0
	_add(root, std, "StandardMaterial3D 0.5")
	for d in ["", "#define AO_ON\n"]:
		var code: String = "shader_type spatial;\nrender_mode diffuse_lambert, cull_back, fog_disabled;\n" + d + "#include \"res://render/home/home_std.gdshaderinc\"\n"
		var sh := Shader.new()
		sh.code = code
		var m := ShaderMaterial.new()
		m.shader = sh
		m.set_shader_parameter("color", Vector3(0.5, 0.5, 0.5))
		m.set_shader_parameter("roughness", 1.0)
		m.set_shader_parameter("metalness", 0.0)
		_add(root, m, "home_std " + d.strip_edges())
	for v in [0.1, 0.2]:
		var um := ShaderMaterial.new()
		var us := Shader.new()
		us.code = "shader_type spatial; render_mode unshaded; void fragment(){ ALBEDO = vec3(%s); }" % v
		um.shader = us
		_add(root, um, "unshaded %s" % v)
	var plain := Shader.new()
	plain.code = "shader_type spatial; render_mode diffuse_lambert; void fragment(){ ALBEDO = vec3(0.5); ROUGHNESS = 1.0; }"
	var pm := ShaderMaterial.new()
	pm.shader = plain
	_add(root, pm, "plain shader")


func _add(root: Node3D, m: Material, label: String) -> void:
	var mi := MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(1.4, 1.4)
	mi.mesh = q
	mi.material_override = m
	mi.position = Vector3(-6.3 + _quads.size() * 1.6, 0, 0)
	root.add_child(mi)
	_quads.append(label)


func _process(_dt: float) -> bool:
	_f += 1
	if _f == 6:
		var img := get_root().get_texture().get_image()
		var w := img.get_width()
		var h := img.get_height()
		for i in _quads.size():
			var x := int(w * 0.5 + (-6.3 + i * 1.6) / 8.0 * h)
			print(_quads[i], " -> ", img.get_pixel(x, h / 2))
		return true
	return false
