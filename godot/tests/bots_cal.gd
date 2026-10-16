## Three spheres under the lab's light (godot/tools/bake/web/bots_cal.ts draws the same).
##   shot.sh res://tests/bots_cal.gd <out.png> <amb> <sun>
extends SceneTree

var _frames := 0
var _out := ""


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	_out = args[0]
	var amb := float(args[1]) if args.size() > 1 else 0.0
	var sun_e := float(args[2]) if args.size() > 2 else 1.0
	var root := Node3D.new()
	get_root().add_child(root)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color.BLACK
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color.WHITE
	env.ambient_light_energy = amb
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.05 / 0.6 / 1.8
	env.tonemap_white = 16.0
	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_energy = sun_e
	root.add_child(sun)
	sun.look_at_from_position(Vector3(2, 3, 4), Vector3.ZERO)
	var mats := [[0xf06aa0, 0.25, 0.34], [0xcccccc, 0.0, 0.8], [0xd9dee6, 1.0, 0.14]]
	for i in 3:
		var mi := MeshInstance3D.new()
		var sp := SphereMesh.new()
		sp.radius = 0.5
		sp.height = 1.0
		sp.radial_segments = 64
		sp.rings = 32
		mi.mesh = sp
		var m := StandardMaterial3D.new()
		m.albedo_color = Color.hex((int(mats[i][0]) << 8) | 0xff)
		m.metallic = mats[i][1]
		m.roughness = mats[i][2]
		mi.material_override = m
		mi.position = Vector3((i - 1) * 1.2, 0, 0)
		root.add_child(mi)
	var cam := Camera3D.new()
	cam.fov = 38
	root.add_child(cam)
	cam.look_at_from_position(Vector3(0, 0, 5), Vector3.ZERO)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 5:
		get_root().get_texture().get_image().save_png(_out)
		return true
	return false
