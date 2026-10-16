## The app's start (src/main.ts boot): the loading screen comes up straight away, and the game is
## made behind it.
##   1. Every script and scene the game is made of loads on worker threads (ResourceLoader's
##      threaded load of the app's scene), while the screen moves on this one.
##   2. A worker builds the heavy parts of the world ahead (the arena, the fight effects, the beach):
##      they're all built away from the scene tree, so this thread only has to add them in.
##   3. The app sets itself up (saves, the world, the screens), handing back between steps.
##   4. The arena and then the beach are drawn a moment each behind the screen, so their looks
##      are ready, and the screen lifts away onto the beach.
## This script uses no other game script directly: it's up before they've loaded.
extends Node

const SCREEN := preload("res://app/boot/boot_screen.gd")
const MAIN := "res://app/main.tscn"
## Built ahead on the worker thread: Game.made.
const AHEAD := [
	["arena", "res://render/venue/arena.gd", "Building the arena"],
	["effects", "res://render/fx/fight_fx.gd", "Building the arena"],
	["home:beach", "res://render/home/beach.gd", "Setting up the beach"],
]

## The world's parts built ahead (the app hands them to the Game).
var made := {}
var app: Node
var screen: Control
var _layer: CanvasLayer
var _phase := -1
var _clock := 0.0


func _ready() -> void:
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
		screen.set_job("load", float(progress[0]) if progress.size() > 0 else 0.0)
		await get_tree().process_frame
	var packed := ResourceLoader.load_threaded_get(MAIN) as PackedScene
	screen.done("load")
	# the translated game data's tables (TInit), which the arena's corners read as it's built
	load("res://gen/init.gd").run()
	# 2. the heavy parts of the world, on a worker
	var task := WorkerThreadPool.add_task(_build_ahead, true, "build ahead")
	var shown := -1
	while not WorkerThreadPool.is_task_completed(task):
		if _phase != shown and _phase >= 0:
			shown = _phase
			var job := "beach" if AHEAD[_phase][0] == "home:beach" else "arena"
			if job == "beach":
				screen.done("arena")
			screen.set_job(job, 0.15 if _phase == 1 else 0.0, 1.0 if _phase != 0 else 0.7)
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


## Build the arena, the fight effects and the beach scene (on a worker thread: none of them is
## in the scene tree yet).
func _build_ahead() -> void:
	for i in AHEAD.size():
		_phase = i
		var path: String = AHEAD[i][1]
		if ResourceLoader.exists(path):
			made[AHEAD[i][0]] = load(path).new()


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
			await _frames(10, 0.5)
			screen.set_job("warm", 0.35, 0.5)
		"home":
			# (the app dips through black to the beach: wait for it to arrive)
			var t0 := _clock
			while app.game.place != "home" and _clock - t0 < 3.0:
				await get_tree().process_frame
			screen.set_job("warm", 0.5, 1.0)
			await _frames(16, 0.9)
			screen.done("warm")
			_finish()


## At least `n` frames and `secs` seconds drawn behind the screen.
func _frames(n: int, secs: float) -> void:
	var t0 := _clock
	var i := 0
	while i < n or _clock - t0 < secs:
		i += 1
		await get_tree().process_frame


func _finish() -> void:
	# the home screen's words rise in as the loading screen lifts off them
	screen.lifting.connect(func() -> void:
		var s = app.screens.get(app.current)
		if s != null and app.current == "home":
			s.enter())
	await screen.finish()
	_layer.queue_free()
	screen = null
