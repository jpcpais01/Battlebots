## An old boxing gym (src/render/home/gym.ts Gym): bare brick, a ring in the corner, sunbeams
## through high windows, lamps hanging over the mats, a heavy bag on a chain. The robot trains on
## the bag with its real fighting moves (the live fighter's jabs, hooks and kicks) and the bag
## swings on its chain. On Fight it winds up one huge haymaker in slow motion, sends the bag flying,
## then walks to the arena door and pushes through into the light.
##
## Everything that stands still is the web game's own build of it, baked (godot/assets/home/gym.*,
## tools/bake/web/homescene_bake.ts) and rebuilt by BakedScene with HomeMaterials; the light shafts
## and the dust in them move in their shaders on bb_time. This script plays the performance (the
## training, the bag's swing, the way out and its cameras) and the room's life: the fans, the
## banners, the neon's stutter, the TV, the round timer, the clock, the double-end bag, the
## standing fan, the security camera and the dying tube light.
class_name HomeGym
extends Node3D

const BAKE := "res://assets/home/gym"
## The room: x across, z from the lockers to the arena door, h the ceiling (gym.ts ROOM).
const X0 := -6.0
const X1 := 6.0
const Z0 := -4.5
const Z1 := 5.5
const H := 4.2
## The door to the arena, in the far wall (gym.ts DOOR).
const DOOR_X := -2.6
## The heavy bag hangs this far ahead of the robot (times its size), from a beam this high; its
## radius, length, the gap under it and the swivel over it (size-1 robot).
const BAG_D := 1.05
const HANG_Y := 3.85
const BAG_R := 0.2
const BAG_LEN := 1.05
const BAG_BOTTOM := 0.5
const SWIVEL := 0.28
## The chain's links, this far apart (gym.ts chainGeo).
const LINK_STEP := 0.055
## The double-end bag: where it hangs, the ball's height, its cord's top (gym.ts DEB).
const DEB := Vector3(3.0, 1.3, -2.5)
const DEB_TOP := 3.8
const FLOOR_FAN := Vector2(5.3, -1.55)

## gym.ts LOOK.
const LOOK := {
	"background": 0x15110e, "fog": 0x1c1712, "fogDensity": 0.028, "envIntensity": 0.7,
	"hemi": {"sky": 0xffe2bd, "ground": 0x3a3027, "intensity": 0.8},
	"key": {"color": 0xffe0b4, "intensity": 3.1, "pos": [0.5, 3.75, 0.55], "target": [0, 0.8, 0.5], "angle": 0.98, "penumbra": 0.6, "near": 1, "far": 8, "focus": 0.9},
	"rims": [
		{"color": 0xbcd6ff, "intensity": 10, "distance": 12, "pos": [4.6, 3.1, 0.4]},
		{"color": 0xffae6a, "intensity": 6, "distance": 9, "pos": [-2.6, 2.3, 4.4]},
	],
}

## The training rounds on the bag, looped (gym.ts COMBOS).
const COMBOS := [
	[["jab", "head"], ["cross", "head"]],
	[["jab", "head"], ["jab", "head"], ["cross", "body"]],
	[["jab", "head"], ["cross", "head"], ["leadHook", "head"]],
	[["leadHook", "body"], ["rearUpper", "head"]],
	[["jab", "head"], ["cross", "head"], ["leadHook", "body"], ["cross", "head"]],
	[["roundhouse", "body"]],
	[["jab", "body"], ["rearHook", "head"], ["leadUpper", "head"]],
	[["jab", "head"], ["cross", "head"]],
	[["pushKick", "body"]],
]
## How hard each move rocks the bag (m/s of swing) and how much it twists it (gym.ts PUNCH).
const PUNCH := {
	"jab": [0.35, 0.0], "cross": [0.6, 0.0], "leadHook": [0.55, 1.4], "rearHook": [0.6, -1.4],
	"leadUpper": [0.45, 0.0], "rearUpper": [0.5, 0.0], "haymaker": [2.6, -2.0], "roundhouse": [0.9, -2.2],
	"pushKick": [1.0, 0.0],
}

var look := LOOK
## The crowd heard here (faintly, through the door).
var crowd := 0.05
## The way out has reached its cut to the arena.
var over := false
var scene: BakedScene
var mats := HomeMaterials.new()

var _bag: Node3D
var _bag_body: Node3D
var _chain: MultiMeshInstance3D
var _chain_len := 0.0
## Swing angles (about x, about z, twist) and their rates.
var _ax := 0.0
var _az := 0.0
var _tw := 0.0
var _vx := 0.0
var _vz := 0.0
var _vt := 0.0
var _leaf_l: Node3D
var _leaf_r: Node3D
var _blast: ShaderMaterial
var _leak: ShaderMaterial
var _spill: ShaderMaterial
var _rays: ShaderMaterial
var _beams: ShaderMaterial
var _neon: ShaderMaterial
var _neon_wash: ShaderMaterial
var _led: ShaderMaterial
var _tube: ShaderMaterial
var _motes: ShaderMaterial
var _lamp_dust: ShaderMaterial
var _door_light: OmniLight3D
var _fans: Array[Node3D] = []
var _banners: Array[Node3D] = []
var _hands: Array[Node3D] = []
var _deb_ball: Node3D
var _deb_top: Node3D
var _deb_bot: Node3D
var _fan_head: Node3D
var _fan_blades: Node3D
var _cctv: Node3D
var _tv: HomeCanvas
var _tv_at := -1.0
var _tv_time := 0.0
var _timer: HomeCanvas
var _timer_shown := -1
var _sky: Sky

var _mode := "idle"
var _t := 0.0
var _size := 1.0
var _beats := {}
## Training: which combo, which move of it, when the next starts, the strike that last rocked the bag.
var _combo := 0
var _move := -1
var _next_at := 0.0
var _struck := -1.0
## Slow motion on the last punch (the actor and the bag run at this rate).
var _slow := 1.0
var _hit_at := -1.0
var _phase := "final"
var _phase_t := 0.0
var _wps: Array[Vector3] = []
var _door_t := 0.0
var _shake := 0.0
var _bag_c := Vector3.ZERO
## The double-end bag: the ball's sway off its rest, its rate, and when it's next knocked.
var _deb_x := 0.0
var _deb_z := 0.0
var _deb_vx := 0.0
var _deb_vz := 0.0
var _deb_next := 0.0

## Leaning into the door with both hands (the arms are laid over the live fighter's) (gym.ts PUSH).
static var _push := PackedFloat32Array()


func _init() -> void:
	name = "gym"
	scene = BakedScene.open(BAKE)
	scene.factory = mats.make
	scene.build(self)
	var n := scene.named
	_bag = n.bag
	_bag_body = n.bagBody
	_leaf_l = n.leafL
	_leaf_r = n.leafR
	_blast = _mat(n.blast)
	_leak = _mat(n.leak)
	_spill = _mat(n.spill)
	_rays = _mat(n.ray)
	_neon = _mat(n.neon)
	_neon_wash = _mat(n.neonWash)
	_led = _mat(n.led)
	_tube = _mat(n.tube)
	for i in 2:
		_fans.append(n["fan%d" % i])
		_banners.append(n["banner%d" % i])
	for i in 3:
		_hands.append(n["hand%d" % i])
	_deb_ball = n.debBall
	_deb_top = n.debTop
	_deb_bot = n.debBot
	_fan_head = n.fanHead
	_fan_blades = n.fanBlades
	_cctv = n.cctv
	# the window beams (the shaft material with a v-fade on both sides, renderOrder 2)
	for sm in mats.by_kind.get("shaft", []):
		if sm != _rays and float(sm.get_shader_parameter("sides")) > 0.5:
			_beams = sm
	# dust turning in the sunbeams and round the lamp over the bag (gym.ts life / lifeDetail: each
	# point on its own slow sines, phased by its index)
	_motes = _mat(n.motes)
	_motes.set_shader_parameter("size", 0.022)
	_motes.set_shader_parameter("drift_amp", Vector3(0.18, 0.22, 0.2))
	_motes.set_shader_parameter("drift_rate", Vector3(0.13, 0.09, 0.11))
	_motes.set_shader_parameter("drift_phase", Vector3(1.0, 1.7, 0.6) * 0.37 * 3.0)
	_lamp_dust = _mat(n.lampDust)
	_lamp_dust.set_shader_parameter("size", 0.016)
	_lamp_dust.set_shader_parameter("drift_amp", Vector3(0.12, 0.15, 0.12))
	_lamp_dust.set_shader_parameter("drift_rate", Vector3(0.1, 0.07, 0.09))
	_lamp_dust.set_shader_parameter("drift_phase", Vector3(1.0, 1.3, 0.7) * 0.53 * 3.0)
	# the chain, laid link by link for each robot's size (start)
	var link: MeshInstance3D = n.chainLink
	_chain = MultiMeshInstance3D.new()
	_chain.name = "chain"
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = link.mesh
	_chain.multimesh = mm
	_bag.add_child(_chain)
	# the light through the open door (not baked: a three PointLight)
	_door_light = OmniLight3D.new()
	_door_light.light_color = Color.hex(0xfff2dcff)
	_door_light.light_energy = 0.0
	_door_light.omni_range = 11.0
	_door_light.omni_attenuation = 1.6
	_door_light.position = Vector3(DOOR_X, 1.5, Z1 - 0.4)
	_door_light.visible = false
	add_child(_door_light)
	# the TV and the round timer, drawn as the web draws its canvases
	_tv = HomeCanvas.new(256, 144, _paint_tv)
	add_child(_tv)
	_mat(n.tv).set_shader_parameter("map", _tv.get_texture())
	_timer = HomeCanvas.new(256, 96, _paint_timer)
	add_child(_timer)
	_mat(n.timer).set_shader_parameter("map", _timer.get_texture())
	# the room the metal reflects
	var sky_mat := ShaderMaterial.new()
	sky_mat.shader = preload("res://render/home/gym_env.gdshader")
	sky_mat.set_shader_parameter("intensity", look.envIntensity)
	_sky = Sky.new()
	_sky.sky_material = sky_mat
	_sky.process_mode = Sky.PROCESS_MODE_QUALITY
	_sky.radiance_size = Sky.RADIANCE_SIZE_128
	_doors()
	# (the bake's geometry bytes are on the GPU now: let them go)
	scene.release()


static func _mat(node: Node) -> ShaderMaterial:
	return (node as MeshInstance3D).mesh.surface_get_material(0) as ShaderMaterial


static func push_pose() -> PackedFloat32Array:
	if _push.is_empty():
		_push = HomePuppet.pose({
			"pelvis": [0, 0.88, 0], "hips": [0.1, 0, 0], "spine": [0.16, 0, 0], "head": [-0.06, 0, 0],
			"hands": [
				{"at": [0.17, 0.1, 0.57], "pole": [0.8, -0.6, -0.2], "roll": 0.9},
				{"at": [0.17, 0.1, 0.57], "pole": [0.8, -0.6, -0.2], "roll": 0.9},
			],
			"feet": [{"at": [0.16, 0, 0.1]}, {"at": [0.16, 0, -0.22]}],
		})
	return _push


## The reflections and ambient light of this place (HomeStage puts it in the world environment).
func env_sky() -> Sky:
	return _sky


## Fainter sunbeams and fewer motes on the Low tier (gym.ts: quality 'low').
func set_low(low: bool) -> void:
	if _beams != null:
		_beams.set_shader_parameter("opacity", 0.08 if low else 0.14)
	_motes.set_shader_parameter("max_points", 80 if low else 1 << 20)
	_lamp_dust.set_shader_parameter("max_points", 40 if low else 1 << 20)


# ------------------------------------------------------------------ playing

## (Re)start the training with this actor (gym.ts start).
func start(k) -> void:
	var a: HomeActor = k.actor
	var z := a.size
	_size = z
	_mode = "idle"
	_t = 0.0
	over = false
	_beats.clear()
	_combo = 0
	_move = -1
	_next_at = 0.8
	_struck = -1.0
	_slow = 1.0
	_hit_at = -1.0
	_door_t = 0.0
	_shake = 0.0
	_ax = 0.0
	_az = 0.0
	_tw = 0.0
	_vx = 0.0
	_vz = 0.0
	_vt = 0.0
	# hang the bag at this robot's height
	_bag.transform = Transform3D(Basis(), Vector3(0, HANG_Y, BAG_D * z))
	var len := HANG_Y - (BAG_BOTTOM + BAG_LEN + SWIVEL) * z
	if absf(len - _chain_len) > 0.01:
		_lay_chain(len)
		_chain_len = len
	_bag_body.transform = Transform3D(Basis().scaled(Vector3.ONE * z), Vector3(0, -len, 0))
	_doors()
	a.place_live(Vector3.ZERO, 0.0)
	a.face(_bag_rest())
	a.live_w = 1.0
	a.arm_w = 0.0
	a.walk = null
	a.look_at = null
	a.model.glow_boost = 1.0
	a.on_event = Callable()
	if k.sound != null:
		k.sound.home_scene("gym")
	_idle_cam(k, 0.0, true)


## The chain from the swivel's beam down `len` metres, its links turned alternately (gym.ts chainGeo).
func _lay_chain(len: float) -> void:
	var mm := _chain.multimesh
	var count := maxi(2, roundi(len / LINK_STEP))
	mm.instance_count = count
	for i in count:
		var b := Basis(Vector3.UP, PI / 2.0) if i % 2 == 1 else Basis()
		mm.set_instance_transform(i, Transform3D(b, Vector3(0, -(i + 0.5) * (len / count), 0)))


## Take the actor back (it is about to be replaced or the place left).
func release(k) -> void:
	var a: HomeActor = k.actor
	a.arm_w = 0.0
	a.on_event = Callable()


## The player hit Fight: play the way out.
func outro(k) -> void:
	if _mode == "outro":
		return
	_mode = "outro"
	_t = 0.0
	_phase = "final"
	_phase_t = 0.0
	_hit_at = -1.0
	_beats.clear()
	(k.actor as HomeActor).mark = Vector3.ZERO


func _once(id: String, at: float, t := -1.0) -> bool:
	if t < 0.0:
		t = _t
	if t < at or _beats.has(id):
		return false
	_beats[id] = true
	return true


## The bag's resting spot under the beam, where the robot's mark is.
func _bag_rest() -> Vector3:
	return Vector3(0, 0, BAG_D * _size)


## From the robot's right, a little in front: the bag hangs clear of it, the sunlit wall behind.
func _idle_cam(k, time: float, snap := false) -> void:
	var z := _size
	var a := -0.8 + 0.2 * sin(time * 0.05)
	var r := 3.6 * z
	var c: HomeStage.SceneCam = k.cam
	c.look = Vector3(0.05 * z, 1.0 * z, 0.5 * z)
	c.pos = Vector3(c.look.x + sin(a) * r, (1.45 + 0.1 * sin(time * 0.08)) * z, c.look.z + cos(a) * r)
	c.fov = 1.0
	c.roll = 0.0
	c.lambda = 1.5
	c.cut = snap


func update(dt: float, time: float, k) -> void:
	_t += dt
	var a: HomeActor = k.actor
	_life(dt, time)
	# the bag's centre as it swings (the robot squares up to it)
	var lp := _chain_len + (SWIVEL + BAG_LEN * 0.5) * _size
	_bag_c = _bag.transform * Vector3(0, -lp, 0)
	if _mode == "idle":
		_train(k)
		_idle_cam(k, time)
	else:
		_outro_step(dt, k)
	var sdt := dt * _slow
	a.step(sdt)
	_hits(k)
	_swing_bag(sdt, a)
	if a.arm_w > 0.0:
		var r = a.live.root
		a.puppet.root = Vector3(r.x, r.y, r.z)
		a.puppet.yaw = a.live.faceYaw
		a.puppet.solve(push_pose())
	a.draw(time)


## The training loop: combos on the bag, with breathers and a step round it between them.
func _train(k) -> void:
	var a: HomeActor = k.actor
	var f := a.live
	var z := _size
	a.face(Vector3(_bag_c.x, 0, _bag_c.z))
	if _move < 0:
		if _t < _next_at:
			return
		_move = 0
	var list: Array = COMBOS[_combo % COMBOS.size()]
	if _move < list.size():
		var mv: Array = list[_move]
		f.stamina = f.build.stats.stamina
		f.cooldowns = {}
		if f.tryStrike(mv[0], mv[1], _aim(mv[1], f.root)):
			_move += 1
		return
	if f.action != null:
		return
	# combo done: breathe, and every few, step round the bag
	_move = -1
	_combo += 1
	_next_at = _t + 0.7 + _hash(_combo * 3.7) * 1.1
	var phi: float = [0.0, -0.32, 0.28, 0.0][(_combo / 3) % 4]
	var rest := _bag_rest()
	a.mark = Vector3(rest.x - sin(phi) * BAG_D * z, 0, rest.z - cos(phi) * BAG_D * z)


## Where a strike at the bag aims: its near face, at the zone's height.
func _aim(zone: String, from) -> V3:
	var z := _size
	var c := _bag_c
	var v := Vector2(c.x - from.x, c.z - from.z)
	var d := v.length()
	v /= d if d > 0.0 else 1.0
	var y := (1.42 if zone == "head" else 1.08 if zone == "body" else 0.7) * z
	return V3.new(c.x - v.x * (BAG_R + 0.06) * z, y, c.z - v.y * (BAG_R + 0.06) * z)


## A fist or foot reaching the bag rocks it.
func _hits(k) -> void:
	var a: HomeActor = k.actor
	var s = a.live.strike
	if s == null or s.phase != "active" or _struck == float(s.uid):
		return
	var p = a.striker()
	if p == null:
		return
	var z := _size
	var lp := _chain_len + (SWIVEL + BAG_LEN * 0.5) * z
	# the bag's axis at the striker's height (it leans as it swings)
	var y_top := HANG_Y - _chain_len - SWIVEL * z
	var y_bot := y_top - BAG_LEN * z
	if p.y > y_top + 0.05 or p.y < y_bot - 0.05:
		return
	var u: float = (HANG_Y - p.y) / lp
	var bp := _bag.position
	var ax := bp.x + (_bag_c.x - bp.x) * u
	var az := bp.z + (_bag_c.z - bp.z) * u
	if Vector2(p.x - ax, p.z - az).length() > (BAG_R + 0.07) * z:
		return
	_struck = float(s.uid)
	var pt: Array = PUNCH.get(s.move.id, [0.5, 0.0])
	var power: float = pt[0]
	var twist: float = pt[1]
	# push it away from the robot, hooks a little sideways
	var r = a.live.root
	var w := Vector2(ax - r.x, az - r.z).normalized()
	var side := twist * 0.12
	var vx := (w.x + w.y * side) * power
	var vz := (w.y - w.x * side) * power
	_vx -= vz / lp
	_vz += vx / lp
	_vt += twist * power * 0.6
	var big: bool = s.move.id == "haymaker"
	if k.sound != null:
		k.sound.bag_hit(minf(1.0, power / 1.2))
		k.sound.chain(minf(1.0, power))
	var hp := Vector3(ax - w.x * BAG_R * z, p.y, az - w.y * BAG_R * z)
	if k.fx != null:
		k.fx.dust(hp, 18 if big else 3 + int(power * 4.0), 0.9 if big else 0.25)
	if big:
		_hit_at = _t
		_shake = 1.0
		if k.fx != null:
			k.fx.flash(hp, 0xfff0d8, 0.5 * z, 0.12)
		if k.sfx != null:
			k.sfx.thud(0.6)


## The bag on its chain: a damped pendulum both ways, and a twist.
func _swing_bag(dt: float, a: HomeActor) -> void:
	var z := _size
	var lp := _chain_len + (SWIVEL + BAG_LEN * 0.5) * z
	var w2 := 9.8 / lp
	_vx += (-w2 * sin(_ax) - 0.45 * _vx) * dt
	_vz += (-w2 * sin(_az) - 0.45 * _vz) * dt
	_vt += (-6.0 * _tw - 1.2 * _vt) * dt
	_ax += _vx * dt
	_az += _vz * dt
	_tw += _vt * dt
	# swinging back into the robot: it bumps off
	var r = a.live.root
	var v := Vector2(_bag_c.x - r.x, _bag_c.z - r.z)
	var d := v.length()
	if d < 0.62 * z and a.live_w > 0.5:
		v /= maxf(1e-3, d)
		var lx := _vz * lp
		var lz := -_vx * lp
		var toward := -(lx * v.x + lz * v.y)
		if toward > 0.0:
			_vz += toward * 1.3 * v.x / lp
			_vx -= toward * 1.3 * v.y / lp
	_bag.basis = Basis.from_euler(Vector3(_ax, _tw, _az), EULER_ORDER_XYZ)


## The way out: the haymaker in slow motion, the walk to the door, the push, and through.
func _outro_step(dt: float, k) -> void:
	var a: HomeActor = k.actor
	var f := a.live
	var z := _size
	var cam: HomeStage.SceneCam = k.cam
	var t := _t
	var snd: HomeSound = k.sound
	_phase_t += dt
	cam.cut = false
	cam.roll = 0.0
	var root := Vector3(f.root.x, 0, f.root.z)

	if _phase == "final":
		a.face(Vector3(_bag_c.x, 0, _bag_c.z))
		if _once("music", 0.05) and snd != null:
			snd.home_music(false)
		if _once("wind", 0.35):
			if k.sfx != null:
				k.sfx.charge(false)
			f.stamina = f.build.stats.stamina
			f.cooldowns = {}
			f.forceStrike("haymaker", "head", _aim("head", f.root), 0.9)
		# slow motion through the impact
		if _hit_at >= 0.0:
			var since := t - _hit_at
			_slow = 0.22 if since < 0.5 else 0.22 + 0.78 * _smooth((since - 0.5) / 0.35)
		var first := _once("cutPunch", 0.0)
		var u := _ramp(t, 0.0, 1.6)
		cam.pos = Vector3((1.45 - 0.2 * u) * z, (0.82 + 0.05 * u) * z, (0.82 - 0.1 * u) * z)
		cam.look = Vector3(0.02 * z, 1.28 * z, 0.5 * z)
		cam.fov = 0.74 - 0.06 * _shake
		cam.roll = 0.035 * _shake * sin(t * 47.0)
		cam.lambda = 100.0 if first else 2.2
		cam.cut = first
		var done := t - _hit_at > 1.05 if _hit_at >= 0.0 else t > 1.9
		if done:
			_slow = 1.0
			_phase = "walk"
			_phase_t = 0.0
			_wps = [Vector3(-0.85 * z, 0, 0.45 * z), _approach()]
			a.look_at = Vector3(DOOR_X, 1.5 * z, Z1)
	elif _phase == "walk":
		var wp := _wps[0]
		var v := Vector3(wp.x - root.x, 0, wp.z - root.z)
		var d := v.length()
		var last := _wps.size() == 1
		# look ahead to the door the whole way
		a.face(Vector3(DOOR_X, 0, Z1) if last else wp)
		if _phase_t > 0.12:
			var speed := 1.2 * sqrt(z) * _smooth(_phase_t / 0.5) * (minf(1.0, d / 0.6 + 0.25) if last else 1.0)
			a.walk = v * (speed / maxf(1e-3, d))
		if d < (0.06 if last else 0.3):
			if last:
				a.walk = null
				a.mark = wp
				_phase = "push"
				_phase_t = 0.0
			else:
				_wps.remove_at(0)
		_chase_cam(k, _phase_t < dt * 1.5 and _once("cutBehind", 0.0))
	elif _phase == "push":
		a.face(Vector3(DOOR_X, 0, Z1 + 2.0))
		a.arm_w = _smooth(_phase_t / 0.35)
		if _once("open", 0.28, _phase_t):
			if snd != null:
				snd.door_open()
				snd.home_level(0.15, 0.6)
			if k.crowd != null:
				k.crowd.ambience(0.95)
			if k.fx != null:
				k.fx.dust(Vector3(DOOR_X, 0.05, Z1), 14, 0.5)
		# lean in as the doors give
		if _phase_t > 0.3:
			a.mark = _approach() + Vector3(0, 0, 0.25 * z * _smooth((_phase_t - 0.3) / 0.6))
		if _phase_t > 0.85:
			_phase = "through"
			_phase_t = 0.0
		_chase_cam(k, false)
	else:
		a.arm_w = 1.0 - _smooth(_phase_t / 0.4)
		a.face(Vector3(DOOR_X, 0, Z1 + 4.0))
		a.walk = Vector3(0, 0, 1.15 * sqrt(z) * _smooth(_phase_t / 0.4))
		_chase_cam(k, false, true)
		if _phase_t > 1.35:
			over = true

	# the doors swing open into the light
	if _phase == "push" or _phase == "through":
		_door_t = minf(1.0, _door_t + dt / 0.9)
	_doors()
	_shake = maxf(0.0, _shake - dt * 2.2)


## Where the robot stops to push the doors.
func _approach() -> Vector3:
	return Vector3(DOOR_X, 0, Z1 - 0.66 * _size)


## Behind the robot, a little over its right shoulder, looking on to the door.
func _chase_cam(k, cut: bool, hold := false) -> void:
	var z := _size
	var r = k.actor.live.root
	var cam: HomeStage.SceneCam = k.cam
	var v := Vector2(DOOR_X - r.x, Z1 - r.z)
	var d := v.length()
	v /= d if d > 0.0 else 1.0
	if not hold:
		# right of the heading is (-z, x) in this frame's terms
		cam.pos = Vector3(r.x - v.x * 2.05 * z - v.y * 0.38 * z, 1.55 * z, r.z - v.y * 2.05 * z + v.x * 0.38 * z)
		cam.lambda = 100.0 if cut else 3.2
	else:
		cam.lambda = 1.2
	cam.look = Vector3(DOOR_X, 1.25 * z + 0.15 * _door_t, Z1)
	cam.fov = 0.86 - 0.12 * _door_t
	cam.cut = cut


## The doors' swing and the light pouring through.
func _doors() -> void:
	var o := 1.0 - pow(1.0 - _door_t, 3.0)
	_leaf_l.basis = Basis(Vector3.UP, -o * 1.5)
	_leaf_r.basis = Basis(Vector3.UP, o * 1.5)
	_blast.set_shader_parameter("color", _lin3(0xfff4e2) * Fx.glow(2.0 + o * 9.0))
	_leak.set_shader_parameter("color", _lin3(0xfff0d0) * Fx.glow(1.0) * (1.2 + o * 3.0))
	_spill.set_shader_parameter("opacity", o * 0.9)
	_rays.set_shader_parameter("opacity", o * 0.28)
	_door_light.light_energy = o * 45.0 / PI
	_door_light.visible = o > 0.0


# ------------------------------------------------------------------ the room's life

## The fans, the banners, the neon's stutter, the TV, the round timer (gym.ts life).
func _life(dt: float, time: float) -> void:
	for i in _fans.size():
		_fans[i].basis = Basis(Vector3.UP, time * (2.2 + i * 0.35))
	# the banners stir in the fans' draught
	for i in _banners.size():
		_banners[i].basis = Basis(Vector3.RIGHT, 0.035 * sin(time * 0.7 + i * 1.7))
	# the neon stutters now and then
	var fl := 0.2 if sin(time * 0.37) > 0.6 and _hash(floorf(time * 14.0)) > 0.85 else 1.0
	_neon.set_shader_parameter("color", Vector3.ONE * (Fx.glow(2.2) * fl))
	_neon_wash.set_shader_parameter("opacity", 0.32 * fl)
	# the TV at 12 frames a second
	if time - _tv_at > 1.0 / 12.0 or time < _tv_at:
		_tv_at = time
		_tv_time = time
		_tv.redraw()
	# the round timer counts down three minutes, rests thirty seconds, over and over
	var left := 180 - (int(floorf(time)) % 210)
	if left != _timer_shown:
		_timer_shown = left
		_timer.redraw()
	_life_detail(minf(dt, 0.05), time)


## The clock, the double-end bag, the standing fan, the camera, the dying tube (gym.ts lifeDetail).
func _life_detail(dt: float, time: float) -> void:
	# the clock keeps the player's own time; the second hand ticks (the renderer may read the wall
	# clock: nothing here touches the fight)
	var ls: float = Time.get_unix_time_from_system() + float(Time.get_time_zone_from_system().get("bias", 0)) * 60.0
	var sec := floorf(fmod(ls, 60.0))
	var mn := fmod(ls / 60.0, 60.0)
	var hr := fmod(ls / 3600.0, 12.0)
	_hands[0].basis = Basis(Vector3.BACK, -(hr / 12.0) * TAU)
	_hands[1].basis = Basis(Vector3.BACK, -(mn / 60.0) * TAU)
	_hands[2].basis = Basis(Vector3.BACK, -(sec / 60.0) * TAU)
	# the double-end bag: knocked now and then, it bounces between its cords and settles
	if time >= _deb_next or _deb_next - time > 10.0:
		var ang := _hash(floorf(time * 7.3) + 1.0) * TAU
		var p := 0.25 + _hash(floorf(time * 3.1) + 5.0) * 0.35
		_deb_vx += cos(ang) * p
		_deb_vz += sin(ang) * p
		_deb_next = time + 2.5 + _hash(floorf(time) + 9.0) * 4.0
	_deb_vx += (-30.0 * _deb_x - 1.6 * _deb_vx) * dt
	_deb_vz += (-30.0 * _deb_z - 1.6 * _deb_vz) * dt
	_deb_x = clampf(_deb_x + _deb_vx * dt, -0.25, 0.25)
	_deb_z = clampf(_deb_z + _deb_vz * dt, -0.25, 0.25)
	var ball := Vector3(DEB.x + _deb_x, DEB.y, DEB.z + _deb_z)
	_deb_ball.transform = Transform3D(Basis.from_euler(Vector3(_deb_z * 3.0, _deb_x * 4.0, 0), EULER_ORDER_XYZ), ball)
	_cord(_deb_top, Vector3(DEB.x, DEB_TOP, DEB.z), ball + Vector3(0, 0.115, 0))
	_cord(_deb_bot, ball - Vector3(0, 0.115, 0), Vector3(DEB.x, 0.045, DEB.z))
	# the standing fan sweeps the room
	_fan_head.basis = Basis.from_euler(Vector3(0.08, -PI / 2.0 + 0.7 * sin(time * 0.4), 0), EULER_ORDER_YXZ)
	_fan_blades.basis = Basis(Vector3.BACK, time * 14.0)
	# the camera pans, its light blinks
	_cctv.basis = Basis.from_euler(Vector3(0.4, -PI / 4.0 + 0.45 * sin(time * 0.23), 0), EULER_ORDER_YXZ)
	var blink := fmod(time, 1.6) < 0.18
	_led.set_shader_parameter("color", _lin3(0xff2a1a if blink else 0x2a0806) * Fx.glow(2.4 if blink else 1.0))
	# the old tube: steady most of the time, then a fit of flickering
	var u := fmod(time, 13.0)
	var fit := u < 1.4 or (u > 6.0 and u < 6.3)
	var on := not fit or _hash(floorf(time * 17.0)) > 0.45
	_tube.set_shader_parameter("color", _lin3(0xf2f6ff) * Fx.glow(2.1 if on else 0.25))


## Stretch a unit cord (a mesh from y 0 to 1) from a to e (gym.ts cordTo).
static func _cord(o: Node3D, a: Vector3, e: Vector3) -> void:
	var d := e - a
	var l := d.length()
	if l < 1e-4:
		return
	o.transform = Transform3D(Basis(Quaternion(Vector3.UP, d / l)) * Basis.from_scale(Vector3(1, l, 1)), a)


## The TV: a fight on, live, with the ticker running underneath (gym.ts drawTv).
func _paint_tv(g: CanvasItem) -> void:
	var time := _tv_time
	var w := 256.0
	var h := 144.0
	var c0 := Color("#0b1230")
	var c1 := Color("#2a0d24")
	g.draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(w, 0), Vector2(w, h), Vector2(0, h)]), PackedColorArray([c0, c0, c1, c1]))
	for x in [60.0, 196.0]:
		g.draw_colored_polygon(PackedVector2Array([Vector2(x - 6, 0), Vector2(x + 6, 0), Vector2(x + 50, 112), Vector2(x - 50, 112)]), Color(1.0, 240.0 / 255.0, 200.0 / 255.0, 0.12))
	var ring := PackedVector2Array()
	for i in 40:
		var ang := i / 40.0 * TAU
		ring.append(Vector2(128 + cos(ang) * 104, 112 + sin(ang) * 16))
	g.draw_colored_polygon(ring, Color("#c9c2b4"))
	# two robots trading blows
	var t := time * 2.4
	var a := maxf(0.0, sin(t))
	var b := maxf(0.0, sin(t + PI))
	_tv_bot(g, 104 + a * 6 - b * 4, Color("#3d7bff"), 1.0, a)
	_tv_bot(g, 152 - b * 6 + a * 4, Color("#ff4a3a"), -1.0, b)
	if a > 0.93 or b > 0.93:
		var star := PackedVector2Array()
		for i in 12:
			var r := 4.0 if i % 2 == 1 else 11.0
			var ang := i / 12.0 * TAU
			star.append(Vector2((150.0 if a > b else 106.0) + cos(ang) * r, 79 + sin(ang) * r))
		g.draw_colored_polygon(star, Color(1.0, 230.0 / 255.0, 120.0 / 255.0, 0.95))
	# health bars, the live tag and the ticker
	var rnd := fmod(time, 40.0) / 40.0
	g.draw_rect(Rect2(8, 8, 100, 8), Color("#111111"))
	g.draw_rect(Rect2(148, 8, 100, 8), Color("#111111"))
	g.draw_rect(Rect2(8, 8, 100 * (1 - rnd * 0.7), 8), Color("#3dff6e"))
	g.draw_rect(Rect2(148 + 100 * rnd * 0.55, 8, 100 * (1 - rnd * 0.55), 8), Color("#3dff6e"))
	g.draw_rect(Rect2(116, 6, 24, 12), Color("#ff2a2a") if sin(time * 4.0) > 0.0 else Color("#7a1010"))
	HomeCanvas.text(g, HomeCanvas.sans(), 9, "LIVE", 128, 15, Color.WHITE, 0)
	g.draw_rect(Rect2(0, 126, w, 18), Color(0, 0, 0, 0.75))
	HomeCanvas.text(g, HomeCanvas.sans(), 12, "ROBO FIGHT NIGHT  •  MAIN EVENT TONIGHT  •  NEW CHAMPION CROWNED  •", w - fmod(time * 45.0, 760.0), 139, Color("#ffd36b"))


static func _tv_bot(g: CanvasItem, x: float, col: Color, dir: float, reach: float) -> void:
	g.draw_rect(Rect2(x - 9, 74, 18, 26), col)
	g.draw_rect(Rect2(x - 7, 100, 5, 14), col)
	g.draw_rect(Rect2(x + 2, 100, 5, 14), col)
	g.draw_rect(Rect2(x - 6, 61, 12, 12), col)
	g.draw_rect(Rect2(x + 9 if dir > 0.0 else x - 17 - reach * 16, 77, 8 + reach * 16, 5), col)
	g.draw_rect(Rect2(x + 6 if dir > 0.0 else x - 12, 85, 6, 5), col)
	g.draw_rect(Rect2(x + dir * 2 - 2, 65, 5, 3), Color("#e8fbff"))


## The round timer: the round's minutes and seconds, then the rest's in red (gym.ts life).
func _paint_timer(g: CanvasItem) -> void:
	var left := _timer_shown
	g.draw_rect(Rect2(0, 0, 256, 96), Color("#050505"))
	var rest := left <= 0
	var s := 30 + left if rest else left
	var col := Color("#ff3a2a") if rest else Color("#ffb02a") if left <= 10 else Color("#3dff6e")
	HomeCanvas.text(g, HomeCanvas.mono(), 72, "%d:%02d" % [s / 60, s % 60], 128, 52, col, 0, true)


# ------------------------------------------------------------------ helpers (scene.ts)

static func _lin3(hex: int) -> Vector3:
	var c := Color.hex(hex << 8 | 0xff).srgb_to_linear()
	return Vector3(c.r, c.g, c.b)


static func _smooth(u: float) -> float:
	var k := clampf(u, 0.0, 1.0)
	return k * k * (3.0 - 2.0 * k)


## 0 -> 1 as t goes a -> b, smoothly (scene.ts ramp).
static func _ramp(t: float, a: float, b: float) -> float:
	return _smooth((t - a) / (b - a))


## Cheap deterministic hash noise in 0..1 (scene.ts hash).
static func _hash(n: float) -> float:
	var s := sin(n * 127.1 + 311.7) * 43758.5453
	return s - floor(s)
