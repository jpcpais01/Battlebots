## A close-up of the ported camera drones in the arena, posed like godot/tools/bake/web/director_drone.ts
## (two drones at fixed spots, drone clock 1.234 s, a fixed lens), for comparing with the web.
##   BB_NOBOTS=1 BB_NOHUD=1 shot.sh res://tests/director_drone.gd <out.png>
extends SceneTree

var _fight
var _n := 0
var _out := "user://drone.png"


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_n += 1
	if _n == 3:
		_fight.set_process(false)
		var dr: Drones = _fight.drones
		dr._live = 2
		dr._t = 1.234
		dr._drones[0].pos = Vector3(-0.35, 1.6, 0)
		dr._drones[0].yaw = 0.6
		dr._drones[1].pos = Vector3(0.45, 1.35, -0.6)
		dr._drones[1].yaw = -0.4
		dr._drones[1].vel = Vector3(1.5, 0, 0)
		dr._pose(Vector3(0, 1.5, 3), 0.0)
		var cam: Camera3D = _fight.cam
		cam.fov = 38.0
		cam.near = 0.1
		cam.look_at_from_position(Vector3(0.2, 1.75, 1.9), Vector3(0.05, 1.45, -0.2))
	if _n == 8:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false
