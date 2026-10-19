## A quiet paradise beach (src/render/home/beach.ts Beach): white coral sand on a turquoise lagoon,
## palms leaning out over the water's edge, a thatched shade and a hammock strung between two
## palms, an outrigger pulled up on the sand, the reef's surf far out and green islands on the
## horizon. The robot lies on its sun lounger with a coconut. On Fight, its phone buzzes: the arena
## is calling. It answers, tosses the coconut, flips its shades up with its eyes blazing, gets up
## and squares up to the camera.
##
## Everything that stands still is the web game's own build of it, baked (godot/assets/home/beach.*,
## tools/bake/web/homescene_bake.ts) and rebuilt by BakedScene with HomeMaterials; the water, the
## sky, the swash and the plants' breeze move in their shaders on bb_time. This script plays the
## performance: the puppet's poses, the props in its hands, the frigatebirds and the camera.
class_name HomeBeach
extends Node3D

const BAKE := "res://assets/home/beach"
## beachWorld.ts SUN (towards the sun), SEA.
const SUN := Vector3(-0.3989640385035983, 0.6383424616057572, -0.6582906635309371)
const SEA := -0.12
const FAR := 110.0
## beachWorld.ts LOOK.
const LOOK := {
	"background": 0xbfdcf0, "fog": 0xbcdaee, "fogDensity": 0.0058, "envIntensity": 0.7,
	"hemi": {"sky": 0xbcd8f6, "ground": 0xe8d2a8, "intensity": 1.05},
	"key": {"color": 0xfff0d6, "intensity": 3.9, "pos": [SUN.x * FAR, SUN.y * FAR, SUN.z * FAR], "target": [0, 0, 0], "angle": 1.4, "penumbra": 0.04, "near": FAR - 18, "far": FAR + 22, "focus": 0.1},
	"rims": [
		{"color": 0xfff1dc, "intensity": 4, "distance": 8, "pos": [-1.6, 0.4, -2.6]},
		{"color": 0xa9d2ff, "intensity": 6, "distance": 10, "pos": [2.2, 2.8, 2.8]},
	],
}
## The frigatebirds' circles: centre x, z, height, radius, turn rate, phase (beach.ts flyBirds).
const RINGS := [[55.0, -14.0, 24.0, 16.0, 0.07, 0.0], [70.0, 4.0, 30.0, 22.0, -0.05, 2.0], [-35.0, -20.0, 27.0, 14.0, 0.06, 4.0]]
const SCREEN_ON := 0x2fd0ff
const SCREEN_OFF := 0x0c1a22

var look := LOOK
## Crowd level heard here (the arena is somewhere off in the distance).
var crowd := 0.0
## The way out has reached its cut to the arena.
var over := false
var scene: BakedScene
var mats := HomeMaterials.new()

## The robot's corner (lounger, table, shade, the things on the sand), scaled to its size.
var _near: Node3D
var _phone: Node3D
var _screen: ShaderMaterial
var _coconut: Node3D
var _glasses: Node3D
var _holo: Node3D
var _holo_mat: ShaderMaterial
var _birds: MultiMesh
var _water: ShaderMaterial
var _sky: Sky
var _pose := PackedFloat32Array()
var _mode := "idle"
var _t := 0.0
var _size := 1.0
## The coconut: in the hand, or flying (position, velocity, spin, turned so far), bouncing, at rest.
var _coco_held := true
var _coco_pos := Vector3.ZERO
var _coco_vel := Vector3.ZERO
var _coco_spin := Vector3.ZERO
var _coco_rot := Vector3.ZERO
var _coco_resting := false
var _coco_bounced := 0
var _phone_held := false
var _phone_drop := -1.0
var _last_hand := Vector3.ZERO
var _hand_vel := Vector3.ZERO
var _beats := {}
var _next_ring := 0.0
var _eyes := 1.0


func _init() -> void:
	name = "beach"
	_pose.resize(HomePuppet.N)
	scene = BakedScene.open(BAKE)
	scene.factory = mats.make
	scene.build(self)
	HomeBeach.instance_nodes(scene)
	var n := scene.named
	_near = n.near
	_phone = n.phone
	_screen = _material(n.phoneScreen)
	_coconut = n.coconut
	_glasses = n.glasses
	_holo = n.holo
	_holo_mat = _material(_holo)
	var birds: MultiMeshInstance3D = n.birds
	_birds = birds.multimesh
	_water = _material(n.water)
	# the sky the metal reflects: this sky over this sand (beach.ts env)
	var sky_mat := ShaderMaterial.new()
	sky_mat.shader = preload("res://render/home/beach_env.gdshader")
	var dome := _material(n.sky)
	for p in ["sun", "zenith", "horizon", "glow", "sun_col", "noise"]:
		sky_mat.set_shader_parameter(p, dome.get_shader_parameter(p))
	sky_mat.set_shader_parameter("intensity", look.envIntensity)
	_sky = Sky.new()
	_sky.sky_material = sky_mat
	_sky.process_mode = Sky.PROCESS_MODE_QUALITY
	_sky.radiance_size = Sky.RADIANCE_SIZE_128
	# the shadows: what the web casts (the near props, the hero palms, the bushes)
	for node in scene.nodes:
		var gi := node as GeometryInstance3D
		if gi != null and not (node.get_meta("bake") as Dictionary).castShadow:
			gi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_fly_birds(0.0)
	# (the bake's geometry bytes are on the GPU now: let them go)
	scene.release()


static func _material(node: Node) -> ShaderMaterial:
	var mi := node as GeometryInstance3D
	if mi is MultiMeshInstance3D:
		return (mi as MultiMeshInstance3D).multimesh.mesh.surface_get_material(0) as ShaderMaterial
	return (mi as MeshInstance3D).mesh.surface_get_material(0) as ShaderMaterial


## The bake's instanced meshes (three's InstancedMesh: the plants, the birds) as MultiMeshes, each
## instance's colour in its custom data.
static func instance_nodes(s: BakedScene) -> void:
	for i in s.nodes.size():
		var rec: Dictionary = s.json.nodes[i]
		if not rec.has("instanceMatrix"):
			continue
		var mi := s.nodes[i] as MeshInstance3D
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_custom_data = rec.has("instanceColor")
		mm.mesh = mi.mesh
		var count: int = rec.instanceMatrix.count
		mm.instance_count = count
		var m := s.floats(int(rec.instanceMatrix.buffer))
		var c := s.floats(int(rec.instanceColor.buffer)) if mm.use_custom_data else PackedFloat32Array()
		for k in count:
			var o := k * 16
			mm.set_instance_transform(k, Transform3D(Basis(Vector3(m[o], m[o + 1], m[o + 2]), Vector3(m[o + 4], m[o + 5], m[o + 6]), Vector3(m[o + 8], m[o + 9], m[o + 10])), Vector3(m[o + 12], m[o + 13], m[o + 14])))
			if mm.use_custom_data:
				mm.set_instance_custom_data(k, Color(c[k * 3], c[k * 3 + 1], c[k * 3 + 2], 1.0))
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.name = mi.name
		mmi.transform = mi.transform
		mmi.cast_shadow = mi.cast_shadow
		mmi.set_meta("bake", rec)
		var parent := mi.get_parent()
		parent.add_child(mmi)
		parent.move_child(mmi, mi.get_index())
		parent.remove_child(mi)
		mi.free()
		s.nodes[i] = mmi
		if rec.name != "":
			s.named[rec.name] = mmi


## The reflections and ambient light of this place (HomeStage puts it in the world environment).
func env_sky() -> Sky:
	return _sky


## Fewer plants and a plainer lagoon on the Low tier (beach.ts: quality 'low').
func set_low(low: bool) -> void:
	_water.set_shader_parameter("low", low)
	for nm in ["bush", "vine", "tuft"]:
		var mmi := scene.named.get(nm) as MultiMeshInstance3D
		if mmi != null:
			var mm := mmi.multimesh
			mm.visible_instance_count = mm.instance_count / 2 if low else -1


# ------------------------------------------------------------------ the frigatebirds

## The birds wheel slowly on the breeze, high over the bay, now and then tilting into a turn.
func _fly_birds(time: float) -> void:
	for i in RINGS.size():
		var r: Array = RINGS[i]
		var a: float = time * r[4] + r[5]
		var s := signf(r[4])
		var p := Vector3(r[0] + cos(a) * r[3], r[2] + 1.5 * sin(time * 0.13 + i), r[1] + sin(a) * r[3])
		var heading := atan2(-sin(a) * s, cos(a) * s)
		var b := Basis.from_euler(Vector3(0.0, PI / 2.0 - heading, -s * (0.32 + 0.08 * sin(time * 0.4 + i))), EULER_ORDER_YXZ)
		_birds.set_instance_transform(i, Transform3D(b.scaled(Vector3.ONE * 1.05), p))


# ------------------------------------------------------------------ the performance

func _at(x: float, y: float, z: float) -> Vector3:
	return Vector3(x * _size, y * _size, -z * _size)


## (Re)start the idle performance with this actor.
func start(k) -> void:
	var a: HomeActor = k.actor
	_size = a.size
	_near.scale = Vector3.ONE * _size
	_mode = "idle"
	_t = 0.0
	over = false
	_beats.clear()
	_coco_held = true
	_coco_resting = false
	_coco_bounced = 0
	_phone_held = false
	_phone_drop = -1.0
	_eyes = 1.0
	_holo.visible = false
	_set_screen(0.0)
	for o in [_phone, _coconut, _holo]:
		o.scale = Vector3.ONE * _size
	_phone.position = _at(BeachPoses.PHONE_AT.x, BeachPoses.PHONE_AT.y, BeachPoses.PHONE_AT.z)
	_phone.rotation = Vector3(0, 0.3, 0)
	_coconut.rotation = Vector3.ZERO
	_coco_rot = Vector3.ZERO
	var p := a.puppet
	p.root = Vector3.ZERO
	p.yaw = PI
	a.live_on = false
	a.live_w = 0.0
	a.walk = null
	a.look_at = null
	a.model.glow_boost = 1.0
	_glasses.visible = true
	if k.sound != null:
		k.sound.home_scene("beach")
	_idle_cam(k, 0.0, true)


## Take the actor's props back (the actor is about to be replaced).
func release(_k) -> void:
	_glasses.visible = false


## The player hit Fight: play the way out.
func outro(_k) -> void:
	if _mode == "outro":
		return
	_mode = "outro"
	_t = 0.0
	_next_ring = 0.0


func _once(id: String, at: float) -> bool:
	if _t < at or _beats.has(id):
		return false
	_beats[id] = true
	return true


## From behind the robot, 20 degrees round to its left (João): over its shoulder and the
## backrest to the lagoon and the horizon, drifting slowly.
func _idle_cam(k, time: float, snap := false) -> void:
	var z := _size
	# the robot's left is the world's -x, its back (the backrest end) the world's +z: `a` is the
	# angle round from its left, so straight behind is 90 degrees and 20 to the left is 70
	var a := deg_to_rad(70.0) + 0.06 * sin(time * 0.06)
	var r := (3.4 + 0.1 * sin(time * 0.045)) * z
	var c: HomeStage.SceneCam = k.cam
	c.look = Vector3(0, 0.95 * z, -0.2 * z)
	c.pos = Vector3(-cos(a) * r, (1.75 + 0.06 * sin(time * 0.09)) * z, c.look.z + sin(a) * r)
	c.fov = 1.0
	c.roll = 0.0
	c.lambda = 1.5
	c.cut = snap


func update(dt: float, time: float, k) -> void:
	_t += dt
	var t := _t
	var a: HomeActor = k.actor
	_fly_birds(time)
	var o := _pose
	if _mode == "idle":
		HomePuppet.sample(o, BeachPoses.idle(), fmod(t, BeachPoses.IDLE_LEN))
		# breathing, a slow nod along to the music, a lazily tapping foot. The nod eases in and out
		# of each beat and rests while it drinks.
		var u := fmod(t, BeachPoses.IDLE_LEN)
		var lounging := 1.0 - _ramp(u, 5.6, 6.3) + _ramp(u, 8.2, 8.9)
		var beat := maxf(0.0, sin(time * PI * 1.3))
		o[HomePuppet.SPINE] += 0.018 * sin(time * 1.3)
		o[HomePuppet.HEAD + 1] += 0.22 * sin(time * 0.17) * lounging
		o[HomePuppet.HEAD] += 0.03 * beat * beat * lounging
		o[HomePuppet.FLEX + 1] += 0.22 * maxf(0.0, sin(time * PI * 1.3))
		_idle_cam(k, time)
	else:
		_outro_step(k)
	if t < BeachPoses.CALL.stand + 0.6 or _mode == "idle":
		a.puppet.solve(o)
	a.step(dt)
	a.draw(time)
	_props(dt, time, k)


func _outro_step(k) -> void:
	var t := _t
	var a: HomeActor = k.actor
	var C: Dictionary = BeachPoses.CALL
	var z := _size
	var cam: HomeStage.SceneCam = k.cam
	if t < C.stand + 0.6:
		HomePuppet.sample(_pose, BeachPoses.outro(), t)
	var sfx = k.sfx
	var snd: HomeSound = k.sound
	# ringing until it's picked up
	if t < C.grab and t >= _next_ring:
		_next_ring = t + 1.0
		snd.ring()
	if _once("music", 0.3):
		snd.home_music(false)
	if _once("answer", C.ear):
		snd.phone_beep()
	if _once("grab", C.grab):
		_phone_held = true
	if _once("down", C.putDown):
		_phone_held = false
		_phone_drop = 0.0
	if _once("toss", C.toss):
		_coco_held = false
		_coco_pos = _coconut.position
		_coco_vel = _hand_vel * 0.5 + Vector3(0.9, 3.3, 1.9) * sqrt(z)
		_coco_spin = Vector3(5, 2, 3)
		_coco_rot = _coconut.basis.orthonormalized().get_euler(EULER_ORDER_XYZ)
		if sfx != null:
			sfx.whoosh(false, false, 0.8)
	if _once("shades", C.shades):
		if sfx != null:
			sfx.charge(false)
		if k.fx != null:
			k.fx.flash(a.model.joints[HomePuppet.J_HEAD], a.spec.paint.accent, 0.6 * z, 0.25)
	# the shades flip up onto the forehead, and the eyes light up
	_eyes = 1.0 + 1.9 * _ramp(t, C.shades + 0.05, C.shades + 0.25) - 0.6 * _ramp(t, C.shades + 0.6, C.shades + 1.4)
	a.model.glow_boost = _eyes
	if _once("swing", C.swing) and sfx != null:
		sfx.whoosh(false, true, 0.6)
	if _once("feet", 4.0):
		if sfx != null:
			sfx.step(0)
		if k.fx != null:
			k.fx.dust(_at(BeachPoses.STAND_AT.x - 0.1, 0.02, BeachPoses.STAND_AT.z), 10, 0.4)

	# the live fighter takes over once it's up
	var stand_w := _at(BeachPoses.STAND_AT.x, 0, BeachPoses.STAND_AT.z)
	var hero := Vector3(3.15 * z, 0.48 * z, -1.05 * z)
	if _once("live", C.live):
		a.place_live(stand_w, PI - BeachPoses.STAND_YAW)
		a.face(hero)
		a.look_at = hero
	a.live_w = _ramp(t, C.live, C.live + 0.45)
	if _once("emote", C.emote):
		a.show.preview("gloveTap", atan2(hero.x - stand_w.x, hero.z - stand_w.z))
	if _once("cutWhite", C.cut):
		over = true

	# camera
	cam.cut = false
	cam.roll = 0.0
	if t < 1.35:
		# cut round to the front as the phone rings (the idle shot is from the robot's side), then push in
		var first := _once("cutRing", 0.0)
		cam.pos = Vector3(-2.2 * z, 1.45 * z, -1.95 * z) if first else Vector3(-1.6 * z, 1.32 * z, -1.3 * z)
		cam.look = Vector3(-0.3 * z, 0.95 * z, 0.22 * z)
		cam.fov = 0.82
		cam.lambda = 100.0 if first else 1.7
		cam.cut = first
	elif t < C.shades - 0.05:
		cam.pos = Vector3(-1.15 * z, 1.22 * z, -0.78 * z)
		cam.look = Vector3(-0.15 * z, 1.08 * z, 0.32 * z)
		cam.fov = 0.7
		cam.lambda = 1.6
	elif t < 3.4:
		var first := _once("cutFace", 0.0)
		cam.pos = Vector3(0.12 * z, 1.36 * z, (-1.05 + 0.18 * _ramp(t, C.shades, 3.4)) * z)
		cam.look = Vector3(0.02 * z, 1.38 * z, 0.05 * z)
		cam.fov = 0.56
		cam.lambda = 100.0 if first else 6.0
		cam.cut = first
	elif t < C.live - 0.05:
		var first := _once("cutWide", 0.0)
		cam.pos = Vector3(3.3 * z, 1.05 * z, -2.0 * z)
		cam.look = Vector3(0.65 * z, 0.82 * z, -0.1 * z)
		cam.fov = 0.95
		cam.lambda = 100.0 if first else 1.0
		cam.cut = first
	else:
		var first := _once("cutHero", 0.0)
		var u := _ramp(t, C.live, C.cut)
		cam.pos = hero.lerp(Vector3(2.55 * z, 0.55 * z, -0.82 * z), u)
		cam.look = Vector3(stand_w.x, 1.2 * z, stand_w.z)
		cam.fov = 0.8 - 0.08 * u
		cam.lambda = 100.0 if first else 8.0
		cam.cut = first


## The phone, the coconut, the shades and the hologram follow the hands and the head.
func _props(dt: float, time: float, k) -> void:
	var a: HomeActor = k.actor
	var j := a.model.joints
	var z := _size
	# the right hand's speed (for the toss)
	if dt > 0.0:
		_hand_vel = (j[HomePuppet.J_HAND_R] - _last_hand) / dt
	_last_hand = j[HomePuppet.J_HAND_R]

	if _coco_held:
		var fore := (j[HomePuppet.J_HAND_R] - j[HomePuppet.J_EL_R]).normalized()
		var pos := j[HomePuppet.J_HAND_R] + fore * (0.07 * z) + Vector3(0, 0.02 * z, 0)
		# upright, tipping its straw to the mouth when it's lifted to drink
		var to_head := j[HomePuppet.J_HEAD] - pos
		var near := 1.0 - _smooth((to_head.length() / z - 0.25) / 0.2)
		var up := Vector3.UP.lerp(to_head.normalized(), near * 0.8).normalized()
		_coconut.transform = Transform3D(_from_to(Vector3.UP, up).scaled(Vector3.ONE * z), pos)
	elif not _coco_resting:
		_coco_vel.y -= 9.8 * dt
		_coco_pos += _coco_vel * dt
		_coco_rot.x += _coco_spin.x * dt
		_coco_rot.z += _coco_spin.z * dt
		var floor_y := HomeBeach.ground_h(_coco_pos.x, _coco_pos.z) + 0.1 * z
		if _coco_pos.y < floor_y:
			_coco_pos.y = floor_y
			if absf(_coco_vel.y) > 1.0:
				if k.fx != null:
					k.fx.dust(_coco_pos, 8, 0.45)
				if k.sfx != null:
					k.sfx.thud(0.15)
			_coco_vel = Vector3(_coco_vel.x * 0.5, -_coco_vel.y * 0.3, _coco_vel.z * 0.5)
			_coco_spin *= 0.5
			_coco_bounced += 1
			if _coco_bounced > 3 or _coco_vel.length_squared() < 0.05:
				_coco_resting = true
		_coconut.transform = Transform3D(Basis.from_euler(_coco_rot, EULER_ORDER_XYZ).scaled(Vector3.ONE * z), _coco_pos)

	# the phone: buzzing on the table, at the ear, then dropped on the cushion
	var C: Dictionary = BeachPoses.CALL
	var ringing: bool = _mode == "outro" and _t < C.grab
	if _phone_held:
		var fore := (j[HomePuppet.J_HAND_L] - j[HomePuppet.J_EL_L]).normalized()
		_phone.transform = Transform3D(_from_to(Vector3.BACK, fore).scaled(Vector3.ONE * z), j[HomePuppet.J_HAND_L] + fore * (0.05 * z))
	elif _phone_drop >= 0.0:
		_phone_drop += dt
		var rest := _at(-0.28, BeachPoses.LOUNGER.seatY + 0.008, 0.4)
		var q := _phone.quaternion.slerp(Quaternion.from_euler(Vector3(0, -0.6, 0)), 1.0 - exp(-dt * 12.0))
		_phone.transform = Transform3D(Basis(q).scaled(Vector3.ONE * z), _phone.position.lerp(rest, 1.0 - exp(-dt * 14.0)))
	elif ringing:
		var p := _at(BeachPoses.PHONE_AT.x, BeachPoses.PHONE_AT.y, BeachPoses.PHONE_AT.z)
		var buzz := sin(time * 70.0) * 0.004 * z * (1.0 if sin(_t * PI * 2.0) > -0.2 else 0.0)
		p.x += buzz
		_phone.transform = Transform3D(Basis(Vector3.UP, 0.3 + buzz * 4.0).scaled(Vector3.ONE * z), p)
	var lit := 0.6 + 0.4 * sin(_t * 12.0) if ringing else 0.8 if _phone_held else 0.0
	_set_screen(lit)

	# the call hovers over the phone as a hologram
	var h := _ramp(_t, 0.05, 0.3) * (1.0 - _ramp(_t, C.grab + 0.1, C.grab + 0.45)) if _mode == "outro" else 0.0
	_holo.visible = h > 0.01
	if _holo.visible:
		var hp := _phone.position + Vector3(0.05 * z, (0.24 + 0.02 * sin(time * 3.0)) * z, -0.05 * z)
		var cam_pos: Vector3 = k.cam.pos
		var b := Basis.looking_at(hp - cam_pos, Vector3.UP) if (hp - cam_pos).length_squared() > 1e-6 else Basis()
		_holo.transform = Transform3D(b.scaled(Vector3.ONE * (z * (0.6 + 0.4 * h))), hp)
		var g := 1.8 * h * (0.85 + 0.15 * sin(time * 40.0))
		_holo_mat.set_shader_parameter("color", Vector3(g, g, g))

	# shades worn on the head bone, so they turn with it; on Fight they flip up onto the forehead
	var flip := _ramp(_t, C.shades, C.shades + 0.22) if _mode == "outro" else 0.0
	var m := a.model
	var bone := Transform3D(m._rot[BotModel.HEAD].scaled(Vector3.ONE * m.size), m._pos[BotModel.HEAD])
	_glasses.global_transform = bone * Transform3D(Basis(Vector3.RIGHT, -flip * 1.25), Vector3(0, flip * 0.1, flip * -0.03))


func _set_screen(lit: float) -> void:
	var c: Vector3
	if lit > 0.0:
		c = _lin3(SCREEN_ON) * (0.4 + lit * 2.2)
	else:
		c = _lin3(SCREEN_OFF)
	_screen.set_shader_parameter("color", c)


# ------------------------------------------------------------------ helpers (scene.ts, beachWorld.ts)

static func _lin3(hex: int) -> Vector3:
	var c := Color.hex(hex << 8 | 0xff).srgb_to_linear()
	return Vector3(c.r, c.g, c.b)


## The rotation taking `a` onto `b` (three's Quaternion.setFromUnitVectors).
static func _from_to(a: Vector3, b: Vector3) -> Basis:
	var d := a.dot(b)
	if d < -0.999999:
		var ax := Vector3.RIGHT.cross(a)
		if ax.length_squared() < 1e-6:
			ax = Vector3.UP.cross(a)
		return Basis(ax.normalized(), PI)
	return Basis(Quaternion(a, b))


static func _smooth(u: float) -> float:
	var k := clampf(u, 0.0, 1.0)
	return k * k * (3.0 - 2.0 * k)


## 0 -> 1 as t goes a -> b, smoothly (scene.ts ramp).
static func _ramp(t: float, a: float, b: float) -> float:
	return _smooth((t - a) / (b - a))


## Cheap deterministic hash noise in 0..1 (scene.ts hash).
static func hash01(n: float) -> float:
	var s := sin(n * 127.1 + 311.7) * 43758.5453
	return s - floor(s)


## Smooth value noise in 0..1 (beachWorld.ts vnoise).
static func vnoise(x: float, y: float) -> float:
	var ix := floorf(x)
	var iy := floorf(y)
	var fx := x - ix
	var fy := y - iy
	var ux := fx * fx * (3.0 - 2.0 * fx)
	var uy := fy * fy * (3.0 - 2.0 * fy)
	var h00 := hash01(ix * 57.31 + iy * 113.7 + 0.5)
	var h10 := hash01((ix + 1.0) * 57.31 + iy * 113.7 + 0.5)
	var h01 := hash01(ix * 57.31 + (iy + 1.0) * 113.7 + 0.5)
	var h11 := hash01((ix + 1.0) * 57.31 + (iy + 1.0) * 113.7 + 0.5)
	var a := h00 + (h10 - h00) * ux
	var c := h01 + (h11 - h01) * ux
	return a + (c - a) * uy


static func _ridged(x: float, y: float) -> float:
	var s := 0.0
	var amp := 0.55
	var f := 1.0
	var w := 1.0
	for o in 4:
		var n := 1.0 - absf(vnoise(x * f + o * 7.1, y * f - o * 3.7) * 2.0 - 1.0)
		n *= n * w
		w = minf(1.0, n * 1.8)
		s += n * amp
		amp *= 0.5
		f *= 2.07
	return s


static func _sstep(a: float, b: float, x: float) -> float:
	return _smooth((x - a) / (b - a))


## The shore line: z of the water's edge at x (beachWorld.ts shoreZ).
static func shore_z(x: float) -> float:
	return -3.3 - 0.0055 * x * x + 0.35 * sin(0.11 * x)


static func _reef_z(x: float) -> float:
	return -60.0 + 3.0 * sin(0.045 * x + 0.8) + 1.2 * sin(0.13 * x)


static func _bed_depth(x: float, z: float) -> float:
	var d := shore_z(x) - z
	var rr := _reef_z(x) - z
	var depth := 1.6 * (1.0 - exp(-d / 9.0)) + 0.015 * d
	return depth * (1.0 - 0.85 * exp(-(rr * rr) / 45.0)) + 9.0 * _sstep(0.0, 14.0, rr)


## Ground height anywhere (beachWorld.ts groundH): the sea bed, the beach's face, the flat sand,
## then up through the plants into the hills.
static func ground_h(x: float, z: float) -> float:
	var l := z - shore_z(x)
	if l < 0.0:
		return SEA - _bed_depth(x, z)
	var q := 1.0 - minf(l / 2.2, 1.0)
	var h := SEA + 0.12 * (1.0 - q * q)
	h += 0.2 * _sstep(6.0, 12.0, l) + 0.35 * _sstep(11.0, 22.0, l) + _sstep(9.0, 16.0, l) * 0.4 * (vnoise(x * 0.17, z * 0.17) - 0.5)
	var ends := _sstep(46.0, 90.0, absf(x))
	var hh := 2.2 + 8.5 * ends + 5.5 * _ridged(x * 0.021 + 3.1, z * 0.021 - 1.7)
	var lo := 12.0 - 6.0 * ends
	h += hh * _sstep(lo, lo + 24.0, l) * (1.0 - _sstep(96.0, 116.0, Vector2(x, z).length()))
	return h
