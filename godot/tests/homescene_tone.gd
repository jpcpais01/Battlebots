## Colour check on this renderer: unshaded quads of known linear colours (the beach sky's) through
## the fight's tone mapping; prints what comes back, sRGB 0..255, to set against three's ACES.
##   godot/tools/shots/shot.sh res://tests/homescene_tone.gd
extends SceneTree

const VALS0 := [Vector3(0.209, 0.405, 0.729), Vector3(0.489, 0.682, 0.867), Vector3(0.5, 0.5, 0.5), Vector3(0.8, 0.3, 0.05)]
## BB_VALS=a,b,c,d: four greys instead (how dark tones come back)
var VALS: Array = VALS0 if OS.get_environment("BB_VALS") == "" else Array(OS.get_environment("BB_VALS").split(",")).map(func(v): return Vector3.ONE * float(v))
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
	if OS.get_environment("BB_LINEAR") != "":
		env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
		env.tonemap_exposure = float(OS.get_environment("BB_LINEAR"))
	# and a lit white quad in a grey ambient light (is the colour taken as sRGB on this renderer?)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.5, 0.5, 0.5) if OS.get_environment("BB_SUNCOL") == "" else Color(0, 0, 0)
	if OS.get_environment("BB_AMB") != "":
		env.ambient_light_color = Color.WHITE * float(OS.get_environment("BB_AMB"))
	env.ambient_light_energy = 1.0
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
		s.code = "shader_type spatial; render_mode unshaded; uniform vec3 v; void fragment(){ ALBEDO = v; }"
		m.shader = s
		m.set_shader_parameter("v", VALS[i])
		mi.material_override = m
		mi.position = Vector3(-6.3 + i * 1.8, 0, 0)
		root.add_child(mi)
	var lit := MeshInstance3D.new()
	var lq := QuadMesh.new()
	lq.size = Vector2(1.6, 1.6)
	lit.mesh = lq
	var lm := StandardMaterial3D.new()
	lm.albedo_color = Color(1, 1, 1)
	lm.metallic_specular = 0.0
	lm.roughness = 1.0
	lit.material_override = lm
	lit.position = Vector3(-6.3 + VALS.size() * 1.8, 0, 0)
	root.add_child(lit)
	# and a lit white quad half fogged red by its own FOG (how a custom FOG mixes on this renderer)
	var fq := MeshInstance3D.new()
	var fm := QuadMesh.new()
	fm.size = Vector2(1.6, 1.6)
	fq.mesh = fm
	var fs := Shader.new()
	fs.code = "shader_type spatial; void fragment(){ ALBEDO = vec3(1.0); ROUGHNESS = 1.0; SPECULAR = 0.0; FOG = vec4(1.0, 0.0, 0.0, 0.5); }"
	var fmat := ShaderMaterial.new()
	fmat.shader = fs
	fq.material_override = fmat
	fq.position = Vector3(-6.3 + (VALS.size() + 1) * 1.8, 0, 0)
	root.add_child(fq)
	var sun := DirectionalLight3D.new()
	sun.light_energy = 0.0 if OS.get_environment("BB_SUN") == "" else float(OS.get_environment("BB_SUN"))
	sun.shadow_enabled = OS.get_environment("BB_SHADOW") != ""
	if OS.get_environment("BB_SUNCOL") != "":
		sun.light_color = Color(OS.get_environment("BB_SUNCOL"))
	root.add_child(sun)
	env.fog_enabled = OS.get_environment("BB_ENVFOG") != ""


func _process(_dt: float) -> bool:
	_f += 1
	if _f == 6:
		var img := get_root().get_texture().get_image()
		var w := img.get_width()
		var h := img.get_height()
		for i in VALS.size():
			var x := int(w * 0.5 + (-6.3 + i * 1.8) / 8.0 * h)
			var c := img.get_pixel(x, h / 2)
			print(VALS[i], " -> ", Color(c.r, c.g, c.b).linear_to_srgb() * 255.0)
		var lx := int(w * 0.5 + (-6.3 + VALS.size() * 1.8) / 8.0 * h)
		var lc := img.get_pixel(lx, h / 2)
		# (tone mapped: compare with the unshaded greys above, 0.5 -> 198, 0.214 -> ~145)
		print("ambient Color(0.5) on white -> ", Color(lc.r, lc.g, lc.b).linear_to_srgb() * 255.0)
		var fx := int(w * 0.5 + (-6.3 + (VALS.size() + 1) * 1.8) / 8.0 * h)
		var fc := img.get_pixel(fx, h / 2)
		print("white in ambient 0.5, FOG red at 0.5 -> linear ", Color(fc.r, fc.g, fc.b), " (a plain mix: 0.75, 0.25, 0.25 before tone mapping)")
		return true
	return false
