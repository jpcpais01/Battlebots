## The robots in the real fight scene at a set moment, for comparing with the web game's
## (godot/tools/bake/web/bots_shot.ts renders the same one):
##   BB_CAM="x,y,z;x,y,z" BB_NOHUD=1 shot.sh res://tests/bots_shot.gd <seed> <steps> <out.png> [dents]
## Prints the Rng seed the match was built from: pass it to the web job as n. The fight is frozen
## once the moment is reached (time scale 0); both robots are posed at alpha 0 (the sim's last
## frame), with contact against each other, and `dents` (1) lands the web job's blows.
extends SceneTree

## [defender, part, joint, up, side, out, damage, partCond, kick, crit]: bots_shot.ts BLOWS.
const BLOWS := [
	[0, 1, 1, 0.02, 0.06, 0.3, 40, 0.6, false, false],
	[0, 1, 1, 0.05, 0.08, 0.3, 30, 0.5, false, false],
	[0, 1, 1, -0.12, -0.1, 0.3, 55, 0.4, true, true],
	[0, 0, 3, 0.0, 0.05, 0.25, 35, 0.5, false, false],
	[1, 1, 1, 0.0, 0.0, 0.3, 50, 0.3, false, true],
	[1, 2, 0, 0.0, 0.08, 0.3, 30, 0.5, true, false],
]

var _fight
var _frames := 0
var _seed := 1
var _steps := 600
var _dents := false
var _out := "user://bots.png"
var _ao: ContactAO


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	_seed = int(args[0]) if args.size() > 0 else 1
	_steps = int(args[1]) if args.size() > 1 else 600
	_out = args[2] if args.size() > 2 else _out
	_dents = args.size() > 3 and args[3] == "1"
	# frozen from the start: no real-time steps sneak in before or after the moment
	Engine.time_scale = 0.0
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 2:
		var r := RandomNumberGenerator.new()
		r.seed = _seed
		print("web n=", r.randi_range(1, 2000000000))
		_fight._seed_rng.seed = _seed
		_fight.new_fight()
		_fight._sync()
		var m = _fight.m
		for i in _steps:
			m.step()
		Engine.time_scale = 0.0
		_fight._acc = 0.0
		_fight._alpha = 0.0
		_pose()
		if _dents:
			for bl in BLOWS:
				var f = m.fighters[bl[0]]
				var yaw: float = f.faceYaw
				var fwd := Vector3(sin(yaw), 0, cos(yaw))
				var right := Vector3(fwd.z, 0, -fwd.x)
				var j = f.body.last[bl[2]]
				var p: Vector3 = Vector3(j.x, j.y, j.z) + fwd * float(bl[5]) + right * float(bl[4])
				p.y += bl[3]
				var h := {
					"part": bl[1], "partCond": bl[7], "damage": bl[6], "crit": bl[9], "heavy": bl[6] >= 50,
					"blocked": false, "shielded": false, "move": {"kind": "kick" if bl[8] else "punch"},
					"point": p, "dir": -fwd,
				}
				_fight.models[bl[0]].dent(h, true)
			_pose()
		_ao = ContactAO.new()
		_fight.add_child(_ao)
		for i in 2:
			var f = m.fighters[i]
			print("robot ", i, " chest ", _fight.models[i].joints[1], " facing ", Vector3(sin(f.faceYaw), 0, cos(f.faceYaw)))
	if _frames > 2 and _ao != null:
		for i in 2:
			_ao.set_robot(i, _fight.models[i].joints, _fight.models[i].size)
		_ao.commit()
	if _frames == 10:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false


func _pose() -> void:
	var m = _fight.m
	for i in 2:
		var o = m.fighters[1 - i].body.last[3]
		_fight.models[i].begin(m.fighters[i], 0.0, Vector3(o.x, o.y, o.z))
	for i in 2:
		_fight.models[i].end(m.fighters[i], _fight._time, _fight.models[1 - i])
