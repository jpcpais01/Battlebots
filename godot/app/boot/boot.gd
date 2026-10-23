## The app's start (src/main.ts boot): the loading screen comes up straight away, and the game is
## made behind it.
##   1. Every script and scene the game is made of loads on worker threads (ResourceLoader's
##      threaded load of the app's scene), while the screen moves on this one.
##   2. A worker builds the heavy parts of the world ahead (the arena, the fight effects, the beach):
##      they're all built away from the scene tree, so this thread only has to add them in.
##   3. The app sets itself up (saves, the world, the screens), handing back between steps.
##   4. The arena and then the beach are drawn a few frames each behind the screen, small, so
##      their looks are ready, and the screen lifts away onto the beach.
## The 3D world isn't drawn otherwise while the screen is up: the screen covers it, and drawing
## the arena every frame behind it was most of what made the screen stutter on a phone.
## This script uses no other game script directly: it's up before they've loaded.
extends Node

const SCREEN := preload("res://app/boot/boot_screen.gd")
const MAIN := "res://app/main.tscn"
## Ray tracing's Heavy mode (ui/settings.gd): the file asking for Forward+, and a mark left while
## a start on it is under way. A mark still there at the next start means that start never got
## to the beach, so Heavy is taken back (Light from the next start) rather than failing again.
const RENDERER_CFG := "user://renderer.cfg"
const TRIAL := "user://renderer_trial"
const SETTINGS := "user://settings.cfg"
## Frames each place is drawn behind the screen to warm it up, and the 3D resolution they're
## drawn at (the looks, shaders and pipelines are made the same at any size; the GPU's cost per
## frame is mostly per pixel).
const WARM_FRAMES := 4
const WARM_SCALE := 0.25
## Built ahead on the worker thread: Game.made. The arena and its effects, the beach, then the
## fight's other pieces (Game._take) and the app's screens (App._setup, "screen:<id>"): made off
## the scene tree, so this thread only has to add them in. (Their first making also loads what
## they use, which held the screen up for a while each when it was done on this thread.)
const AHEAD := [
	["arena", "res://render/venue/arena.gd"],
	["effects", "res://render/fx/fight_fx.gd"],
	["home:beach", "res://render/home/beach.gd"],
	["hud", "res://game/fight_hud.gd"],
	["ray", "res://render/rt/ray_trace.gd"],
	["drones", "res://render/drones.gd"],
	["referee", "res://render/referee/referee.gd"],
	["stretcher", "res://render/stretcher/stretcher.gd"],
	["contact_ao", "res://render/ao/contact_ao.gd"],
]

## The world's parts built ahead (the app hands them to the Game).
var made := {}
var app: Node
var screen: Control
var _layer: CanvasLayer
var _phase := -1
var _clock := 0.0
## What the start loaded ahead for the app (kept loaded until it's used).
var _kept := []
## What's built ahead: AHEAD, then the app's screens (App.SCREENS: id -> script).
var _ahead := []
var _screens := {}


func _ready() -> void:
	_guard_renderer()
	get_viewport().disable_3d = true
	_layer = CanvasLayer.new()
	_layer.layer = 100
	add_child(_layer)
	screen = SCREEN.new()
	_layer.add_child(screen)
	# (the weights: each job's share of the wait on a phone)
	screen.job("load", "Getting ready", 24)
	screen.job("arena", "Building the arena", 16)
	screen.job("beach", "Setting up the beach", 20)
	screen.job("app", "Getting your bot ready", 12)
	screen.job("warm", "Warming up", 28)
	_start()


func _process(dt: float) -> void:
	_clock += dt


func _start() -> void:
	# the screen's first frame up before anything else
	await get_tree().process_frame
	await get_tree().process_frame
	screen.set_job("load", 0.0)
	# 1. the scripts and scenes, on worker threads
	ResourceLoader.load_threaded_request(MAIN, "", true)
	var progress := []
	while true:
		var st := ResourceLoader.load_threaded_get_status(MAIN, progress)
		if st == ResourceLoader.THREAD_LOAD_LOADED:
			break
		if st != ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			screen.fail("couldn't load the game (%d)" % st)
			return
		screen.set_job("load", 0.6 * (float(progress[0]) if progress.size() > 0 else 0.0), 0.6)
		await get_tree().process_frame
	var packed := ResourceLoader.load_threaded_get(MAIN) as PackedScene
	# then what the app loads by path as it sets up (the world, its screens, the results), on
	# worker threads too: read and compiled on this thread, they held the screen up for a second
	# or more. Kept here so they stay loaded until the app asks for them.
	var more := _by_path()
	for p in more:
		ResourceLoader.load_threaded_request(p, "", true)
	while true:
		var k := 0.0
		var waiting := false
		for p in more:
			var st := ResourceLoader.load_threaded_get_status(p, progress)
			if st == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
				waiting = true
				k += float(progress[0]) if progress.size() > 0 else 0.0
			else:
				k += 1.0
		if not waiting:
			break
		screen.set_job("load", 0.6 + 0.4 * k / maxf(1.0, more.size()))
		await get_tree().process_frame
	for p in more:
		var r := ResourceLoader.load_threaded_get(p)
		if r != null:
			_kept.append(r)
	screen.done("load")
	# the translated game data's tables (TInit), which the arena's corners read as it's built
	load("res://gen/init.gd").run()
	# 2. the heavy parts of the world, on a worker
	_ahead = AHEAD.duplicate()
	for id in _screens:
		_ahead.append(["screen:" + id, _screens[id]])
	var task := WorkerThreadPool.add_task(_build_ahead, true, "build ahead")
	var shown := -1
	while not WorkerThreadPool.is_task_completed(task):
		if _phase != shown and _phase >= 0:
			shown = _phase
			# (the arena is most of the first job; the beach about half of the second, the rest
			# shared out)
			if _phase < 2:
				screen.set_job("arena", 0.0 if _phase == 0 else 0.7, 0.7 if _phase == 0 else 1.0)
			else:
				screen.done("arena")
				var n := maxf(1.0, _ahead.size() - 3)
				var k0 := 0.0 if _phase == 2 else 0.5 + 0.5 * (_phase - 3) / n
				screen.set_job("beach", k0, 0.5 if _phase == 2 else 0.5 + 0.5 * (_phase - 2) / n)
		await get_tree().process_frame
	WorkerThreadPool.wait_for_task_completion(task)
	screen.done("arena")
	screen.done("beach")
	# 3. the app (it calls step() between its own steps)
	screen.set_job("app", 0.0, 0.5)
	await get_tree().process_frame
	app = packed.instantiate()
	app.boot = self
	add_child(app)


## The scripts, scenes and clips the app loads by path (App.SCREENS, App.RESULTS, the world's
## scene, the game data's tables, Sfx's clips), read off their scripts now that they're loaded.
func _by_path() -> Array:
	var paths := ["res://game/fight.tscn", "res://gen/init.gd"]
	var consts := (load("res://app/app.gd") as Script).get_script_constant_map()
	_screens = consts.get("SCREENS", {})
	for p in _screens.values():
		paths.append(p)
	if consts.has("RESULTS"):
		paths.append(consts.RESULTS)
	# the fight's sound clips (Sfx loads them all as it's made)
	var sfx := (load("res://audio/sfx.gd") as Script).get_script_constant_map()
	var bank := (load("res://audio/sfx_bank.gd") as Script).get_script_constant_map()
	for c in bank.get("CLIPS", []):
		if not String(c).begins_with("walkon_"):
			paths.append(String(sfx.get("CLIP_DIR", "")) + c + ".ogg")
	return paths.filter(func(p: String) -> bool: return ResourceLoader.exists(p))


## Build the arena, the fight effects, the beach scene, the fight's other pieces and the screens
## (on a worker thread: none of them is in the scene tree yet).
func _build_ahead() -> void:
	for i in _ahead.size():
		_phase = i
		var path: String = _ahead[i][1]
		if ResourceLoader.exists(path):
			made[_ahead[i][0]] = load(path).new()


## The app's next step (App._setup): "screens" (the world is made), "arena" (the screens are
## made; the arena shows behind the loading screen), "home" (the app has gone to the beach).
func step(what: String) -> void:
	match what:
		"screens":
			screen.set_job("app", 0.5, 1.0)
			await get_tree().process_frame
		"arena":
			screen.done("app")
			screen.set_job("warm", 0.0, 0.35)
			await _warm()
			screen.set_job("warm", 0.35, 0.5)
		"home":
			# (the app dips through black to the beach: wait for it to arrive)
			var t0 := _clock
			while app.game.place != "home" and _clock - t0 < 3.0:
				await get_tree().process_frame
			screen.set_job("warm", 0.5, 1.0)
			await _warm()
			screen.done("warm")
			_finish()


## The world drawn a few frames behind the screen, small (WARM_FRAMES, WARM_SCALE), then hidden
## again.
func _warm() -> void:
	var vp := get_viewport()
	var scale := vp.scaling_3d_scale
	vp.scaling_3d_scale = WARM_SCALE
	vp.disable_3d = false
	for i in WARM_FRAMES:
		await get_tree().process_frame
	vp.disable_3d = true
	vp.scaling_3d_scale = scale


func _guard_renderer() -> void:
	var heavy := RenderingServer.get_current_rendering_method() == "forward_plus" and FileAccess.file_exists(RENDERER_CFG)
	if not heavy:
		_remove(TRIAL)
		return
	if FileAccess.file_exists(TRIAL):
		push_warning("boot: the last start on Forward+ didn't finish; back to Light ray tracing")
		_remove(TRIAL)
		_remove(RENDERER_CFG)
		var cfg := ConfigFile.new()
		cfg.load(SETTINGS)
		cfg.set_value("graphics", "rt", "light")
		cfg.save(SETTINGS)
		return
	var f := FileAccess.open(TRIAL, FileAccess.WRITE)
	if f != null:
		f.store_string("starting")


static func _remove(path: String) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


func _finish() -> void:
	# (made it to the beach: Heavy works on this device)
	_remove(TRIAL)
	# the home screen's words rise in as the loading screen lifts off them
	screen.lifting.connect(func() -> void:
		# the world shows again as the screen lifts off it
		get_viewport().disable_3d = false
		var s = app.screens.get(app.current)
		if s != null and app.current == "home":
			s.enter())
	await screen.finish()
	_layer.queue_free()
	screen = null
