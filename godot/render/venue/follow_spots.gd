## Two follow spots up in the rigging, one on each robot, so the fight reads from any angle.
## Each hangs on a ring round the truss and slides along it to stay a little off the line between
## the robots on its fighter's opponent's side, so it lights the face the cameras mostly see, from
## high up (a clean top light, the pool on the canvas under the robot). Unshadowed (the key spot
## already casts the robots' shadows), and only their transforms and energies change at runtime:
## a light's size or angle changing rebuilds pipelines on the Mobile renderer.
class_name FollowSpots
extends Node3D

## Where the lamps ride: radius round the ring and height (just above the truss).
const RING := 5.8
const HIGH := 10.2
## How far round from straight behind the opponent each lamp sits (radians): the two lamps come
## in from opposite diagonals.
const SWING := 0.6
## Cone half angle (degrees) and its edge: a pool a little wider than a robot at the canvas.
const ANGLE := 11.0
const EDGE := 0.85
## The render layer the lamps light (and nothing else): the robots and the canvas carry it
## (BotModel, Arena). Every lit surface a light reaches pays for it on every pixel, aimed at it or
## not, and the lamps' cones reach most of the ring's box: the truss, posts and apron would pay
## for two lamps that never fall on them.
const LAYER := 2
## Physical units over pi like the key spot (fight.gd), slightly cool white.
const ENERGY := 3.0 / PI
const COLOR := Color(0.93, 0.96, 1.0)

## 0..1 overall level: the venue's look scales it (bright daylight venues want less).
var level := 1.0

var _lamps: Array[SpotLight3D] = []
var _aim: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
var _yaw: Array[float] = [0.0, 0.0]
var _k: Array[float] = [0.0, 0.0]
var _fresh := true


func _init() -> void:
	name = "FollowSpots"
	for i in 2:
		var s := SpotLight3D.new()
		s.light_color = COLOR
		s.light_energy = 0.0
		s.spot_range = 22.0
		s.spot_attenuation = 0.0
		s.spot_angle = ANGLE
		s.spot_angle_attenuation = EDGE
		s.shadow_enabled = false
		s.light_cull_mask = LAYER
		s.light_specular = 0.6
		s.visible = false
		add_child(s)
		_lamps.append(s)


## Each frame of a fight: the two robots' chests (world), and whether each is to be lit.
func track(dt: float, chests: Array, lit: Array) -> void:
	var e := 1.0 - exp(-dt * 7.0)
	for i in 2:
		var c: Vector3 = chests[i]
		var o: Vector3 = chests[1 - i]
		# aim between chest and hips: the pool takes in the head and the feet
		var aim := Vector3(c.x, c.y * 0.72, c.z)
		var away := Vector2(o.x - c.x, o.z - c.z)
		var yaw := atan2(away.y, away.x) + (SWING if i == 0 else -SWING) if away.length() > 0.05 else _yaw[i]
		if _fresh:
			_aim[i] = aim
			_yaw[i] = yaw
		else:
			_aim[i] = _aim[i].lerp(aim, e)
			# the lamps slide round the rig slowly, as an operator would swing them
			_yaw[i] += wrapf(yaw - _yaw[i], -PI, PI) * (1.0 - exp(-dt * 1.2))
		_k[i] = move_toward(_k[i], 1.0 if lit[i] else 0.0, dt / 0.6)
		var s := _lamps[i]
		var g := _k[i] * _k[i] * (3.0 - 2.0 * _k[i]) * level
		s.visible = g > 0.005
		if not s.visible:
			continue
		s.light_energy = ENERGY * g
		var at := Vector3(_aim[i].x + cos(_yaw[i]) * RING, HIGH, _aim[i].z + sin(_yaw[i]) * RING)
		s.look_at_from_position(at, _aim[i], Vector3.UP)
	_fresh = false


## Lights out at once (the fight ended, a menu, the titans' stadium).
func off() -> void:
	for i in 2:
		_k[i] = 0.0
		_lamps[i].visible = false
	_fresh = true
