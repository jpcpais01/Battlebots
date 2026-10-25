## The world map events' own venues round the ring (src/game/game.ts venues, loadVenue, setArena,
## useVenue): each built the first time it's wanted (on a worker thread, so picking an event on
## the map can build it ahead: Game.load_venue), then kept. set_arena puts the fights in one: the
## arena swaps the venue round the ring (Arena.set_venue), the light changes to the venue's
## (VenueLook), and so do the camera's far plane and the ground debris lands on outside. "grand"
## (and any id without a venue) is the indoor arena.
class_name EventVenues
extends Node

const BAKE_DIR := "res://assets/venues/"
## Per venue: the script that animates its own things (an OutdoorVenue), "" for the plain one.
const SCRIPTS := {
	"island": "res://render/venues/island.gd",
	"harbor": "res://render/venues/harbor.gd",
	"grove": "",
	"falls": "",
	"rooftop": "res://render/venues/rooftop.gd",
	# the Android app's own: titan battles' city, built in code (render/titan)
	"titan": "res://render/titan/titan_venue.gd",
}

var game: Game
## The venue fights are in now (events.ts ArenaId).
var arena_id := "grand"
## The venue round the ring now, or null: the indoor arena.
var current: OutdoorVenue = null
var look := VenueLook.new()
var _built := {}
var _tasks := {}
var _done := {}
var _mutex := Mutex.new()


func _init(g: Game = null) -> void:
	game = g
	name = "EventVenues"


func _ready() -> void:
	RenderingServer.frame_pre_draw.connect(_pre_draw)


func _exit_tree() -> void:
	if RenderingServer.frame_pre_draw.is_connected(_pre_draw):
		RenderingServer.frame_pre_draw.disconnect(_pre_draw)
	for id in _tasks:
		WorkerThreadPool.wait_for_task_completion(_tasks[id])
	_tasks.clear()


## Whether `id` has a venue of its own (the Grand Championship is fought indoors).
static func has_venue(id: String) -> bool:
	return SCRIPTS.has(id) and (id == "titan" or FileAccess.file_exists(BAKE_DIR + id + ".json"))


## Whether `id`'s venue is built (or needs none).
func is_ready(id: String) -> bool:
	return not has_venue(id) or _built.has(id)


## Build `id`'s venue now, in the background, if it isn't already (game.ts loadVenue).
## BB_VENUE_SYNC=1 builds it on the spot instead (tests).
func load_venue(id: String) -> void:
	if not has_venue(id) or _built.has(id) or _tasks.has(id):
		return
	var tmpl := _crowd_template()
	if OS.get_environment("BB_VENUE_SYNC") != "":
		_finish(id, _make(id, tmpl))
		return
	_tasks[id] = WorkerThreadPool.add_task(_build.bind(id, tmpl), true, "venue " + id)


## Fight in `id`'s venue from now on (game.ts setArena). One still building goes up when it's
## ready; until then the ring stays where it was.
func set_arena(id: String) -> void:
	arena_id = id
	if not has_venue(id):
		_use(null)
	elif _built.has(id):
		_use(_built[id])
	elif id == "titan":
		# a titan fight can't start in the old ring and change round the titans halfway: the
		# city is quick to build, so it is finished now (it is usually built ahead from home)
		if _tasks.has(id):
			WorkerThreadPool.wait_for_task_completion(_tasks[id])
			_tasks.erase(id)
			_mutex.lock()
			var v: OutdoorVenue = _done.get(id)
			_done.erase(id)
			_mutex.unlock()
			_finish(id, v)
		else:
			_finish(id, _make(id, _crowd_template()))
	else:
		load_venue(id)


## The world went to place `p` (Game.set_place): back in the arena, the venue's light again.
func place_changed(p: String) -> void:
	if p == "arena":
		_relight()


func _crowd_template() -> ShaderMaterial:
	var list: Array = game.arena.mats.by_kind.get("crowd", []) if game and game.arena else []
	return list[0] if list.size() > 0 else null


func _make(id: String, tmpl: ShaderMaterial) -> OutdoorVenue:
	var path: String = SCRIPTS[id]
	var script: GDScript = load(path) if path != "" else OutdoorVenue
	return script.new(id, tmpl)


func _build(id: String, tmpl: ShaderMaterial) -> void:
	var v := _make(id, tmpl)
	_mutex.lock()
	_done[id] = v
	_mutex.unlock()


func _process(_dt: float) -> void:
	if _tasks.is_empty():
		return
	for id in _tasks.keys():
		if not WorkerThreadPool.is_task_completed(_tasks[id]):
			continue
		WorkerThreadPool.wait_for_task_completion(_tasks[id])
		_tasks.erase(id)
		_mutex.lock()
		var v: OutdoorVenue = _done.get(id)
		_done.erase(id)
		_mutex.unlock()
		if v != null:
			_finish(id, v)


func _finish(id: String, v: OutdoorVenue) -> void:
	v.visible = false
	game.arena.add_child(v)
	_built[id] = v
	if arena_id == id:
		_use(v)


## game.ts useVenue.
func _use(v: OutdoorVenue) -> void:
	if v == current:
		return
	current = v
	game.arena.set_venue(v)
	if game.ray != null:
		game.ray.set_arena(v.id if v != null else "grand")
	FxDebris.outer_ground_y = v.outer if v != null else NAN
	game.set_titan(v is TitanVenue)
	if game.place == "arena":
		_relight()


func _relight() -> void:
	if current != null:
		look.apply(game, current.look, current.sky_mat)
		game.director.far = current.far
	else:
		look.restore(game)
		game.director.far = 120.0


## Helpers in the venues' shaders can't read the camera themselves (venues_glsl.ts).
func _pre_draw() -> void:
	if current != null and game.cam:
		RenderingServer.global_shader_parameter_set("bb_cam_pos", game.cam.global_position)
