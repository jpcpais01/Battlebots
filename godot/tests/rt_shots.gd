## Ray tracing's Light mode, off and on, from the same fight frame (render/rt/ray_trace.gd), plus
## the setting's plumbing (the mode in force, the renderer file Heavy writes, the row's note).
##   BB_NOSKY=1 [BB_CAM="x,y,z;x,y,z"] godot/tools/shots/shot.sh res://tests/rt_shots.gd <out dir> [steps] [venue]
## Writes off.png and light.png (linear: srgb.py them) and prints PASS/FAIL lines.
extends SceneTree

var _fight
var _n := 0
var _dir := "user://rt"
var _steps := 900
var _venue := ""
var _fails := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_dir = args[0]
	if args.size() > 1:
		_steps = int(args[1])
	if args.size() > 2:
		_venue = args[2]
	DirAccess.make_dir_recursive_absolute(_dir)
	# (settings and the renderer file go to the test's own folder, never the app's)
	Settings.path = _dir + "/settings.cfg"
	Settings.renderer_path = _dir + "/renderer.cfg"
	DirAccess.remove_absolute(Settings.path)
	DirAccess.remove_absolute(Settings.renderer_path)
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _check(ok: bool, what: String) -> void:
	print(("PASS " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _process(_dt: float) -> bool:
	_n += 1
	var s: Settings = _fight.settings if _fight != null else null
	if _n == 2:
		# (run with BB_VENUE_SYNC=1 so the venue is built on the spot)
		if _venue != "":
			_fight.set_arena(_venue)
		_fight._sync()
		for i in _steps:
			if _fight.m.phase == "end":
				break
			_fight.m.step()
		_check(s.rt == "off" and not _fight.ray.visible, "off by default, quad hidden")
	if _n == 6:
		# the same frame twice: everything holds still (the camera too, BB_CAM to choose it)
		_fight.set_process(false)
		_fight.hud.visible = false
		s.set_perf_stats(false)
	if _n == 10:
		get_root().get_texture().get_image().save_png(_dir + "/off.png")
		s.set_rt("light")
		_check(_fight.ray.visible and s.rt_mode() == "light", "light shows the quad")
		_check(not FileAccess.file_exists(Settings.renderer_path), "light writes no renderer file")
		_check(not _fight._env.ssao_enabled, "light leaves Godot's SSAO off")
		# (a light with a size rebuilds the shaders of all it lights: Light keeps Off's builds)
		_check(_fight._key.light_size == 0.0, "light keeps the key hard")
	if _n == 18:
		get_root().get_texture().get_image().save_png(_dir + "/light.png")
		s.set_rt("heavy")
		var cfg := ConfigFile.new()
		_check(cfg.load(Settings.renderer_path) == OK and cfg.get_value("rendering", "renderer/rendering_method.mobile", "") == "forward_plus", "heavy writes Forward+ to the renderer file")
		# (the container runs the GL renderer: Heavy can't start here, so Light stays in force)
		_check(s.rt_mode() == "light" and s.rt_note() == "unsupported", "heavy without Vulkan: Light, noted")
		s.set_rt("off")
		_check(not FileAccess.file_exists(Settings.renderer_path), "off takes the renderer file away")
		_check(not _fight.ray.visible and _fight._key.light_size == 0.0, "off hides the quad, hard key")
		var cfg2 := ConfigFile.new()
		cfg2.load(Settings.path)
		_check(cfg2.get_value("graphics", "rt", "") == "off", "the pick is saved")
		_fight.ray.set_place("map")
		s.set_rt("light")
		_check(not _fight.ray.visible, "no traced light on the map until it's built")
		var tex := ImageTexture.create_from_image(Image.create(4, 4, false, Image.FORMAT_RGBA8))
		_fight.ray.set_map(tex, tex, tex, 1600.0)
		_check(_fight.ray.visible and (_fight.ray.material_override as ShaderMaterial).shader.resource_path.ends_with("map_trace.gdshader"), "the map's own trace on the map")
		_fight.ray.set_place("arena")
		_check(_fight.ray.visible and (_fight.ray.material_override as ShaderMaterial).shader.resource_path.ends_with("/ray_trace.gdshader"), "back in the arena, the arena's")
		s.set_rt("off")
		print("DONE fails=", _fails)
		return true
	return false
