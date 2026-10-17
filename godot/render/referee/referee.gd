## The referee: a little hovering drone that runs the fight from inside the ropes. Render only:
## it reads the fight (the frame's view of the match, its events and the HUD's ten count) and
## never touches the sim, so online fights stay in step.
##
## It's built like a pro broadcast drone (a glossy white crown, the referee's black-and-white
## stripes round its middle, two ducted fans either side with navigation lights, an antenna
## beacon) with a glass LED screen for a face and two small arms in white gloves to signal with.
## Through a fight it:
## - drops in from the rafters for the walk-outs and presents each robot as its lift arrives,
## - counts 3-2-1 on its face, then chops the air for FIGHT! and backs off to watch,
## - circles to the side of the action away from the camera, eyes on the exchange, flinching at
##   big hits, throwing its hands up at finishers and torn-off parts, breaking up clinches,
## - flies over to a robot that's down and counts it, the number on its face, its arm pumping
##   with each count (in step with the HUD's count), and waves it on when the robot beats it,
## - waves the fight off at a K.O. (K.O. on its face) and then raises the winner's hand with a
##   happy spin, lit in the winner's colours.
## Between fights it idles over the ring, blinking, glancing at the lens.
##
## One rigid-skinned mesh (nine bones: body, two fan pods, each arm's upper arm, forearm and
## glove) in two draws: the body (referee_body.gdshader) and the fans' blur discs.
class_name Referee
extends Node3D

## The hull ellipsoid's radii (referee_body.gdshader HULL), the fan pods' centres, the shoulders
## (all on the +X side, mirrored) and the arm bones' lengths.
const HULL := Vector3(0.235, 0.2, 0.225)
const POD := Vector3(0.33, 0.035, -0.015)
const DUCT_R := 0.095
## What the arms keep clear of round each pod (its own frame): the rim's reach, plus a little air,
## and the slab from under the rim to over the glow ring.
const POD_R := DUCT_R + 0.037
const POD_MID := 0.004
const POD_HALF := 0.05
const SHOULDER := Vector3(0.175, -0.1, 0.085)
const UPPER := 0.12
const FORE := 0.11
## Arm a's side: arm 0 on +X (the drone's left, the viewer's right when it faces you), arm 1 on -X.
const SIDE := [1.0, -1.0]
const SCALE := 1.15
## How far from the centre it may fly (inside the ropes, RING_CORNER 5).
const RING_R := 3.7
## Where it watches the fight from: this far out from between the robots.
const WATCH_R := 2.7

## Surfaces (CUSTOM0.y, referee_body.gdshader): the hull, graphite, white, status glow, port and
## starboard navigation lights, the beacon, chrome, glossy white trim.
enum { K_HULL, K_GRAPHITE, K_WHITE, K_GLOW, K_PORT, K_STARBOARD, K_BEACON, K_CHROME, K_HULL_WHITE }

## Face and status colours (linear, brightness included).
const EYE_COL := Color(0.85, 1.9, 2.7)
const IDLE_COL := Color(0.9, 1.6, 2.2)
const COUNT_COL := Color(2.8, 1.35, 0.25)
const WARN_COL := Color(3.2, 0.35, 0.18)
const UP_COL := Color(0.4, 2.8, 0.75)
const KO_COL := Color(3.4, 0.2, 0.14)
const WIN_COL := Color(2.9, 1.9, 0.45)


## The way an elbow bends: forward (and a little up), or up (a hand raised over the head).
const FWD := Vector3(0, 0.35, 1.0)
const UP := Vector3(0, 1.0, 0.15)


## One arm's pose: where the upper arm points (body space), how far the elbow bends and which way.
class Arm extends RefCounted:
	var dir := Vector3(0.3, -1.0, 0.3).normalized()
	var bend := 1.0
	var hint := FWD
	var want_dir := Vector3(0.3, -1.0, 0.3).normalized()
	var want_bend := 1.0
	var want_hint := FWD
	var rate := 7.0


## Builds the mesh: vertices in their bone's own space, each tagged with its bone and surface.
class Builder extends RefCounted:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var c := PackedFloat32Array()
	var uv := PackedVector2Array()
	var i := PackedInt32Array()

	func vert(p: Vector3, nrm: Vector3, bone: int, key: int, t := Vector2.ZERO) -> int:
		v.append(p)
		n.append(nrm)
		c.append_array([float(bone), float(key), 0.0, 0.0])
		uv.append(t)
		return v.size() - 1

	## A triangle facing the way its vertices' normals do (Godot's front faces wind clockwise).
	func tri(a: int, b: int, d: int) -> void:
		if (v[b] - v[a]).cross(v[d] - v[a]).dot(n[a] + n[b] + n[d]) > 0.0:
			i.append_array([a, d, b])
		else:
			i.append_array([a, b, d])

	## rows x cols quads; f(row, col) gives [position, normal].
	func grid(rows: int, cols: int, f: Callable, bone: int, key: int) -> void:
		var base := v.size()
		for r in rows + 1:
			for k in cols + 1:
				var pn: Array = f.call(r, k)
				vert(pn[0], pn[1], bone, key)
		for r in rows:
			for k in cols:
				var a := base + r * (cols + 1) + k
				var d := a + cols + 1
				tri(a, d, a + 1)
				tri(a + 1, d, d + 1)

	func ellipsoid(at: Vector3, radii: Vector3, bone: int, key: int, rows := 12, cols := 20) -> void:
		grid(rows, cols, func(r: int, k: int) -> Array:
			var th := PI * r / rows
			var ph := TAU * k / cols
			var u := Vector3(sin(th) * sin(ph), cos(th), sin(th) * cos(ph))
			return [at + u * radii, (u / radii).normalized()], bone, key)

	## A ring round `axis` (a unit vector) through `at`; its section `small` across and `tall`
	## along the axis (0: round).
	func torus(at: Vector3, axis: Vector3, big: float, small: float, bone: int, key: int, rows := 28, cols := 10, tall := 0.0) -> void:
		var b := _frame(axis)
		var h := small if tall <= 0.0 else tall
		grid(rows, cols, func(r: int, k: int) -> Array:
			var a := TAU * r / rows
			var t := TAU * k / cols
			var out: Vector3 = b.x * cos(a) + b.z * sin(a)
			var nrm: Vector3 = (out * (cos(t) / small) + b.y * (sin(t) / h)).normalized()
			return [at + out * (big + cos(t) * small) + b.y * (sin(t) * h), nrm], bone, key)

	## A rod with round ends from p to q.
	func capsule(p: Vector3, q: Vector3, r: float, bone: int, key: int, cols := 12) -> void:
		var b := _frame((q - p).normalized())
		var half := 4
		grid(half * 2 + 1, cols, func(row: int, k: int) -> Array:
			# rows 0..half: the cap at q; half+1..: the cap at p (the band between is the rod)
			var top := row <= half
			var th := PI * 0.5 * (row if top else row - 1) / half
			var ph := TAU * k / cols
			var u: Vector3 = b.y * cos(th) + (b.x * sin(ph) + b.z * cos(ph)) * sin(th)
			return [(q if top else p) + u * r, u], bone, key)

	## A flat disc round `axis` (the fans' blur), UV -1..1 across it.
	func disc(at: Vector3, r: float, bone: int, key: int, segs := 24) -> void:
		var mid := vert(at, Vector3.UP, bone, key)
		var base := v.size()
		for k in segs + 1:
			var a := TAU * k / segs
			vert(at + Vector3(cos(a), 0.0, sin(a)) * r, Vector3.UP, bone, key, Vector2(cos(a), sin(a)))
		for k in segs:
			tri(mid, base + k, base + k + 1)

	static func _frame(axis: Vector3) -> Basis:
		var y := axis.normalized()
		var x := Vector3.FORWARD.cross(y) if absf(y.z) < 0.9 else Vector3.RIGHT.cross(y)
		x = x.normalized()
		return Basis(x, y, x.cross(y))

	func mesh() -> ArrayMesh:
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = v
		arrays[Mesh.ARRAY_NORMAL] = n
		arrays[Mesh.ARRAY_TEX_UV] = uv
		arrays[Mesh.ARRAY_CUSTOM0] = c
		arrays[Mesh.ARRAY_INDEX] = i
		var m := ArrayMesh.new()
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT)
		# the bones carry it: keep it drawn wherever they put the parts
		m.custom_aabb = AABB(Vector3(-0.8, -0.8, -0.8), Vector3(1.6, 1.6, 1.6))
		return m


var _body_mat: ShaderMaterial
var _rotor_mat: ShaderMaterial
var _bones := PackedVector4Array()
var _arms: Array[Arm] = [Arm.new(), Arm.new()]
var _rng := RandomNumberGenerator.new()

## Where it is and how it's moving (world), the way it faces, and its lean.
var pos := Vector3(0, 2.2, 0)
var _vel := Vector3.ZERO
var _yaw := 0.0
var _pitch := 0.0
var _roll := 0.0
## What's left of a celebratory turn (radians).
var _spin := 0.0
## Squash and stretch (+ taller), and its spring's speed.
var _squash := 0.0
var _squash_v := 0.0
var _pod_tilt := [0.0, 0.0]
var _t := 0.0
## The lens, this frame.
var _campos := Vector3.ZERO

# the face
var _eyes := Vector4(1, 0, 0, 0)
var _gaze := Vector2.ZERO
var _face_col := EYE_COL
var _status := IDLE_COL
var _blink_in := 2.0
var _blink_t := -1.0
## A quick glance somewhere (a dodge): seconds left.
var _dart := 0.0
var _dart_to := Vector2.ZERO
var _idle_look := Vector3.ZERO
var _idle_look_in := 3.0

# the fight, as its events told it
var _accent: Array[Color] = [Color(0.2, 0.8, 1.0), Color(1.0, 0.4, 0.1)]
var _in_match := false
## Which side of the robots it watches from (+1 / -1 across their line), and its angle round them.
var _side := 1.0
var _az := 0.0
var _az_ok := false
## A gesture over everything else: its name, seconds into it, its length.
var _act := ""
var _act_t := 0.0
var _act_len := 0.0
## Eyes wide after a big hit nearby, seconds left; and that hit's spot.
var _wide := 0.0
var _hit_at := Vector3.ZERO
var _hit_look := 0.0
var _clinch := false
var _clinch_t := 0.0
## The countdown number on its face, and seconds since it last changed.
var _cd_n := -1
var _cd_t := 9.0
## The ten count (from the HUD's): the number, seconds since it moved, whose.
var _count_n := -1
var _count_t := 9.0
var _up_t := -1.0
## Seconds since the fight was stopped (K.O. or the final bell), -1 before; and its result.
var _ko_t := -1.0
var _winner := -1
var _loser := -1
var _decision := false
var _won_spun := false


func _init() -> void:
	name = "referee"
	_rng.randomize()
	_bones.resize(27)
	var body := Builder.new()
	var fans := Builder.new()
	_build(body, fans)
	_body_mat = _material("res://render/referee/referee_body.gdshader")
	_rotor_mat = _material("res://render/referee/referee_rotor.gdshader")
	var mi := MeshInstance3D.new()
	mi.mesh = body.mesh()
	mi.material_override = _body_mat
	add_child(mi)
	var fi := MeshInstance3D.new()
	fi.mesh = fans.mesh()
	fi.material_override = _rotor_mat
	fi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(fi)
	scale = Vector3.ONE * SCALE
	_pose_bones()


static func _material(path: String) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load(path)
	return m


## The drone, part by part, each in its bone's space.
func _build(b: Builder, f: Builder) -> void:
	# the hull: crown, stripes, face and belly are all the shader's (referee_body.gdshader)
	b.ellipsoid(Vector3.ZERO, HULL, 0, K_HULL, 26, 44)
	# the antenna and its beacon, raked back
	b.capsule(Vector3(0, 0.185, -0.07), Vector3(0, 0.275, -0.1), 0.0055, 0, K_GRAPHITE, 8)
	b.ellipsoid(Vector3(0, 0.282, -0.102), Vector3.ONE * 0.012, 0, K_BEACON, 6, 8)
	# a sensor dome under the belly
	b.ellipsoid(Vector3(0, -0.198, 0.03), Vector3(0.035, 0.02, 0.035), 0, K_CHROME, 6, 12)
	for a in 2:
		var s: float = SIDE[a]
		var pod := 1 + a
		# the strut out to the fan
		b.capsule(Vector3(s * 0.19, 0.03, -0.015), Vector3(s * (POD.x - DUCT_R - 0.01), POD.y, POD.z), 0.017, 0, K_GRAPHITE)
		# the duct (pod space: centred on the fan), its glowing lip, hub, spokes and nav light
		b.torus(Vector3.ZERO, Vector3.UP, DUCT_R, 0.024, pod, K_GRAPHITE, 32, 12, 0.042)
		b.torus(Vector3(0, 0.04, 0), Vector3.UP, DUCT_R + 0.002, 0.007, pod, K_GLOW, 32, 6)
		b.torus(Vector3(0, -0.026, 0), Vector3.UP, DUCT_R + 0.017, 0.012, pod, K_HULL_WHITE, 32, 8)
		b.ellipsoid(Vector3(0, -0.006, 0), Vector3(0.024, 0.02, 0.024), pod, K_CHROME, 6, 10)
		for k in 3:
			var ang := TAU * k / 3.0 + 0.4
			var out := Vector3(cos(ang), 0, sin(ang))
			b.capsule(out * 0.02 + Vector3(0, -0.012, 0), out * (DUCT_R - 0.02) + Vector3(0, -0.012, 0), 0.005, pod, K_GRAPHITE, 6)
		b.ellipsoid(Vector3(s * (DUCT_R + 0.03), -0.026, 0), Vector3.ONE * 0.013, pod, K_PORT if s > 0.0 else K_STARBOARD, 6, 8)
		f.disc(Vector3(0, 0.004, 0), DUCT_R - 0.008, pod, 0)
		# the shoulder socket
		b.ellipsoid(Vector3(s * SHOULDER.x, SHOULDER.y, SHOULDER.z), Vector3.ONE * 0.032, 0, K_GRAPHITE, 8, 12)
		# the arm: upper arm and elbow, forearm and cuff, then the glove (mitten and thumb)
		var up := 3 + a * 3
		b.capsule(Vector3.ZERO, Vector3(0, -UPPER, 0), 0.02, up, K_WHITE)
		b.ellipsoid(Vector3(0, -UPPER, 0), Vector3.ONE * 0.024, up, K_GRAPHITE, 8, 12)
		b.capsule(Vector3.ZERO, Vector3(0, -FORE + 0.01, 0), 0.0185, up + 1, K_WHITE)
		b.torus(Vector3(0, -FORE + 0.012, 0), Vector3.UP, 0.021, 0.008, up + 1, K_GRAPHITE, 16, 6)
		b.ellipsoid(Vector3(0, -0.032, 0.002), Vector3(0.033, 0.04, 0.026), up + 2, K_WHITE, 10, 14)
		b.ellipsoid(Vector3(-s * 0.026, -0.018, 0.012), Vector3(0.011, 0.019, 0.011), up + 2, K_WHITE, 6, 8)


## A new fight: it drops in from the rafters for the walk-outs.
func start(m) -> void:
	_in_match = true
	for i in 2:
		_accent[i] = _lin(int(m.specs[i].paint.accent))
	pos = Vector3(0, 7.5, 0)
	_vel = Vector3.ZERO
	_az_ok = false
	_act = ""
	_wide = 0.0
	_clinch = false
	_cd_n = -1
	_count_n = -1
	_count_t = 9.0
	_up_t = -1.0
	_ko_t = -1.0
	_winner = -1
	_loser = -1
	_decision = false
	_won_spun = false
	_spin = 0.0


## The fight's gone from the screen: back to idling over the ring.
func stop() -> void:
	_in_match = false
	_act = ""
	_ko_t = -1.0
	_count_n = -1


static func _lin(hex: int) -> Color:
	return Color.hex((hex << 8) | 0xff).srgb_to_linear()


static func _v(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)


## A sim event (main thread, sim idle): what it reacts to, copied out.
func on_event(type: String, d) -> void:
	match type:
		"fightStart":
			_gesture("chop", 1.0)
		"fistBump":
			_gesture("clap", 0.8)
		"hit":
			if d.shielded or d.blocked:
				return
			var dmg := float(d.damage)
			var crit := JS.truthy(d.get("crit"))
			if dmg >= 32.0 or crit or JS.truthy(d.knockdown):
				_flinch(_v(d.point), minf(1.0, 0.35 + dmg / 90.0 + (0.3 if crit else 0.0)))
			elif dmg >= 12.0:
				_hit_at = _v(d.point)
				_hit_look = 0.5
		"knockdown":
			_gesture("whoa", 0.7)
		"stagger", "getupFail":
			_gesture("wince", 0.7)
		"detach":
			_gesture("whoa", 1.3)
			_wide = 1.2
			_squash_v -= 2.0
		"dodge":
			_dart = 0.35
			_dart_to = Vector2(_rng.randf_range(-1.0, 1.0), _rng.randf_range(-0.3, 0.4))
		"clinch":
			_clinch = true
			_clinch_t = 0.0
		"clinchBreak":
			_clinch = false
		"finisher":
			_gesture("whoa", 1.8)
			_wide = 1.8
		"finisherBlow":
			_flinch(_v(d.point), 1.0)
		"ko":
			_ko_t = 0.0
			_winner = int(d.winner.index)
			_loser = int(d.loser.index)
			_decision = false
			_act = ""
		"decision":
			_ko_t = 0.0
			_winner = -1 if d.winner == null else int(d.winner.index)
			_loser = -1 if _winner < 0 else 1 - _winner
			_decision = true
			_act = ""


func _gesture(name_: String, length: float) -> void:
	# a quick wince doesn't cut short a bigger signal
	if _act != "" and _act_t < _act_len and (name_ == "wince" or name_ == "clap") and _act != "wince" and _act != "clap":
		return
	_act = name_
	_act_t = 0.0
	_act_len = length


## A big blow near it: it jumps back from it, eyes wide.
func _flinch(at: Vector3, k: float) -> void:
	_hit_at = at
	_hit_look = 0.8
	_wide = maxf(_wide, 0.4 + k * 0.4)
	_squash_v -= 3.0 * k
	var away := pos - at
	var d := away.length()
	if d < 3.5 and d > 1e-3:
		_vel += (away / d + Vector3(0, 0.4, 0)) * (1.8 * k * (1.0 - d / 3.5))
	if k > 0.7:
		_gesture("whoa", 0.6)


## Fly, look, signal. `dt` runs with the fight (its slow motion and speed); `mv` is the frame's
## view of the match (null between fights), `models` the robots as posed this frame and `calls`
## the HUD's calls layer (its ten count).
func update(dt: float, cam: Camera3D, mv, models: Array, calls) -> void:
	if not visible:
		return
	dt = clampf(dt, 0.0, 0.05)
	_t += dt
	var campos := cam.global_position
	_campos = campos
	var target: Vector3
	var look: Vector3
	var lam := 2.3
	var eyes := Vector4(1, 0, 0, 0)
	var face := 0
	var num := 0
	var fcol := EYE_COL
	var status := IDLE_COL
	for a in 2:
		_rest(a)
	_act_t += dt
	if _act != "" and _act_t >= _act_len:
		_act = ""
	_wide = maxf(0.0, _wide - dt)
	_hit_look = maxf(0.0, _hit_look - dt)
	_dart = maxf(0.0, _dart - dt)
	_cd_t += dt
	_count_t += dt
	if _clinch:
		_clinch_t += dt

	var fight: bool = _in_match and mv != null and models.size() == 2
	if not fight:
		# idling over the ring between fights: drifting, glancing round, now and then at the lens
		target = Vector3(sin(_t * 0.21) * 0.7, 2.05 + sin(_t * 0.37) * 0.15, cos(_t * 0.17) * 0.55)
		_idle_look_in -= dt
		if _idle_look_in <= 0.0:
			_idle_look_in = _rng.randf_range(2.5, 5.0)
			_idle_look = campos if _rng.randf() < 0.5 else Vector3(_rng.randf_range(-6, 6), _rng.randf_range(0.5, 4.0), _rng.randf_range(-6, 6))
		look = _idle_look if _idle_look != Vector3.ZERO else campos
		lam = 1.2
	else:
		var p0 := _joint(models, 0, 0)
		var p1 := _joint(models, 1, 0)
		var h0 := _joint(models, 0, 3)
		var h1 := _joint(models, 1, 3)
		var top := maxf(h0.y, h1.y)
		var mid := (p0 + p1) * 0.5
		mid.y = 0.0
		var ax := Vector2(p1.x - p0.x, p1.z - p0.z)
		ax = ax.normalized() if ax.length() > 0.05 else Vector2(1, 0)
		var perp := Vector2(-ax.y, ax.x)
		var cd := Vector2(campos.x - mid.x, campos.z - mid.z)
		cd = cd.normalized() if cd.length() > 0.05 else Vector2(0, 1)
		var phase: String = mv.phase
		var watch := (h0 + h1) * 0.5
		look = watch
		if _ko_t >= 0.0:
			_ko_t += dt
		if phase == "intro":
			# presenting each robot as it rides up out of its corner
			var i := int(mv.presenting)
			target = Vector3(-cd.x * 0.9, maxf(2.6, top + 0.6), -cd.y * 0.9)
			lam = 1.6
			if i >= 0 and i < 2:
				var hx: Array = TEntrance.hatchXZ(float(i))
				var te: float = mv.phaseTime - i * TEntrance.PRESENT
				var arrive: float = TEntrance.ENTRY.arrive
				look = _joint(models, i, 3) if te > arrive - 0.3 else Vector3(hx[0], 0.3, hx[1])
				if te > arrive - 0.15:
					_point(_near_arm(look), look + Vector3(0, 0.5, 0), 0.2, 9.0)
					if te < arrive + 1.4:
						eyes = Vector4(1, 1, 0, 0)
		elif phase == "countdown":
			# 3, 2, 1 on its face, to the camera, a finger raised with each
			var n := int(TMatch.COUNTDOWN) - floori(float(mv.phaseTime))
			if n != _cd_n:
				_cd_n = n
				_cd_t = 0.0
				_squash_v += 1.2
			if n >= 1:
				face = 1
				num = n
			# (back past the robots, so the screen's big numbers don't hide it)
			target = Vector3(mid.x - cd.x * 1.5, maxf(2.55, top + 0.6), mid.z - cd.y * 1.5)
			look = campos
			# (the arm jumps up with each number and settles)
			_raise(0, 14.0, 0.25, 0.85 - 0.5 * (1.0 - smoothstep(0.0, 0.3, _cd_t)))
			fcol = Color(2.6, 2.4, 2.0)
			status = Color(2.0, 2.0, 2.0)
		else:
			# the fight (and the greet before it): watching from the side away from the lens
			if perp.dot(cd) * _side > 0.2:
				_side = -_side
			var want_az := atan2(perp.y * _side, perp.x * _side) + sin(_t * 0.19) * 0.35
			var cur_az := atan2(pos.z - mid.z, pos.x - mid.x)
			if not _az_ok:
				_az = cur_az
				_az_ok = true
			var turn := wrapf(want_az - _az, -PI, PI)
			_az += clampf(turn, -1.5 * dt, 1.5 * dt)
			var r := WATCH_R
			var h := maxf(2.35, top + 0.4)
			if _clinch and _clinch_t > 0.6:
				# in close to break them up
				r = 1.9
				h = maxf(2.15, top + 0.2)
			if _act == "whoa":
				r += 0.6
				h += 0.3
			target = Vector3(mid.x + cos(_az) * r, h, mid.z + sin(_az) * r)
			if phase == "greet" and _act == "chop":
				target = Vector3(mid.x - cd.x * 0.6, maxf(2.45, top + 0.45), mid.z - cd.y * 0.6)
			if _hit_look > 0.0:
				look = _hit_at
			var cn: int = calls.ref_n if calls != null else -1
			var cs: String = calls.ref_state if calls != null else ""
			if _ko_t < 0.0 and cs != "" and cn >= 0:
				# a robot's down: over to it, and count
				var i: int = calls.ref_side
				var pd := _joint(models, i, 0)
				var po := _joint(models, 1 - i, 0)
				var away := Vector2(pd.x - po.x, pd.z - po.z)
				away = away.normalized() if away.length() > 0.05 else ax
				var across := Vector2(-away.y, away.x)
				if across.dot(cd) > 0.0:
					across = -across
				var dir := (away * 0.45 + across).normalized()
				target = Vector3(pd.x + dir.x * 1.35, 1.55, pd.z + dir.y * 1.35)
				look = _joint(models, i, 3)
				lam = 3.2
				if cs == "down":
					if cn != _count_n:
						_count_n = cn
						_count_t = 0.0
						_squash_v += 0.8
					_up_t = -1.0
					if cn >= 1:
						face = 1
						num = cn
					else:
						eyes = Vector4(1, 0, 0.6, 0.4)
					fcol = WARN_COL if cn >= 8 else COUNT_COL
					status = fcol
					var a := _near_arm(look)
					if _count_t < 0.14:
						_raise(a, 20.0, 0.35, 0.6)
					else:
						_point(a, look, 0.15, 16.0)
					_pose(1 - a, Vector3(SIDE[1 - a] * 0.75, -0.55, -0.2), 1.7, 6.0)
				else:
					# it beat the count: glad, green, and the wave to fight on
					if _up_t < 0.0:
						_up_t = 0.0
					_up_t += dt
					eyes = Vector4(1, 1, 0, 0)
					fcol = UP_COL
					status = UP_COL
					for a in 2:
						var s: float = SIDE[a]
						if _up_t < 0.35:
							_pose(a, Vector3(-s * 0.45, -0.15, 0.9), 0.15, 16.0)
						else:
							_pose(a, Vector3(s, 0.05, 0.3), 0.1, 10.0)
			else:
				_count_n = -1
		if _ko_t >= 0.0:
			_stopped(models, mid, cd, top)
			target = _ko_target
			look = _ko_look
			lam = _ko_lam
			eyes = _ko_eyes
			face = _ko_face
			fcol = _ko_col
			status = _ko_status
		# the gestures over the top
		if _act != "" and _ko_t < 0.0:
			var k := _act_t / _act_len
			match _act:
				"chop":
					# FIGHT!: the arm high, then down between them
					var a := 0
					if _act_t < 0.3:
						_raise(a, 14.0)
					else:
						_pose(a, Vector3(0.0, -0.35, 1.0), 0.0, 22.0)
					eyes = Vector4(1, 0, 0, 1)
					look = watch
				"clap":
					var clap := 0.12 + 0.12 * cos(_act_t * 18.0)
					for a in 2:
						_pose(a, Vector3(-SIDE[a] * clap, -0.35, 0.95), 0.35, 20.0)
					eyes = Vector4(1, 1, 0, 0)
				"whoa":
					for a in 2:
						_pose(a, Vector3(SIDE[a] * 0.85, 0.1, 0.45), 1.25, 14.0, UP)
					eyes = Vector4(1, 0, 1, 0)
				"wince":
					eyes = Vector4(0.4 + 0.3 * k, 0, 0, 0.5)
		if _clinch and _clinch_t > 0.6 and _ko_t < 0.0 and _act == "":
			# break it up: both hands pushing between them
			for a in 2:
				_pose(a, Vector3(SIDE[a] * 0.3, -0.15, 1.0), 0.25 + 0.3 * (0.5 + 0.5 * sin(_t * 9.0)), 10.0)
			eyes = Vector4(1, 0, 0, 1)
		if _wide > 0.0 and face == 0:
			eyes.z = maxf(eyes.z, minf(1.0, _wide * 2.5))
			eyes.y = 0.0
		# clear of both robots, and inside the ropes
		for j in 2:
			var c := _joint(models, j, 1)
			var dx := Vector2(target.x - c.x, target.z - c.z)
			if dx.length() < 1.15 and target.y < top + 0.3:
				dx = dx.normalized() if dx.length() > 0.01 else perp
				target.x = c.x + dx.x * 1.15
				target.z = c.z + dx.y * 1.15
	var hr := Vector2(target.x, target.z)
	if hr.length() > RING_R:
		hr = hr.normalized() * RING_R
		target.x = hr.x
		target.z = hr.y

	# fly there, a damped spring with a top speed
	var acc := (target - pos) * (lam * lam) - _vel * (2.0 * lam)
	_vel += acc * dt
	var sp := _vel.length()
	if sp > 4.5:
		_vel *= 4.5 / sp
	pos += _vel * dt
	# keep off the lens
	var off := pos - campos
	var dcam := off.length()
	if dcam < 1.5 and dcam > 1e-3:
		pos += off / dcam * (1.5 - dcam) * minf(1.0, dt * 8.0)

	# face what it watches, leaning into its moves
	var to := look - pos
	var want_yaw := atan2(to.x, to.z)
	_yaw += wrapf(want_yaw - _yaw, -PI, PI) * minf(1.0, dt * 4.5)
	if _spin > 0.0:
		var s := minf(_spin, dt * 7.5)
		_yaw += s
		_spin -= s
	var fx := sin(_yaw)
	var fz := cos(_yaw)
	var af := acc.x * fx + acc.z * fz
	var ar := acc.x * fz - acc.z * fx
	var lk := minf(1.0, dt * 6.0)
	_pitch += (clampf(af * 0.045, -0.4, 0.4) + sin(_t * 0.9) * 0.03 - _pitch) * lk
	_roll += (clampf(-ar * 0.045, -0.4, 0.4) + sin(_t * 1.3 + 1.0) * 0.03 - _roll) * lk
	var vf := _vel.x * fx + _vel.z * fz
	for a in 2:
		var tilt := clampf(vf * 0.22, -0.45, 0.45) + sin(_t * 2.1 + a * 1.7) * 0.05
		_pod_tilt[a] += (tilt - _pod_tilt[a]) * minf(1.0, dt * 5.0)
	_squash_v += (-_squash * 140.0 - _squash_v * 9.0) * dt
	_squash = clampf(_squash + _squash_v * dt, -0.25, 0.25)
	var bob := Vector3(0, sin(_t * 1.7) * 0.025, 0)
	transform = Transform3D(Basis.from_euler(Vector3(_pitch, _yaw, _roll), EULER_ORDER_YXZ).scaled(Vector3.ONE * SCALE), pos + bob)

	# the face: blinks, and the eyes follow what it watches
	if face == 0 and eyes.y < 0.5:
		_blink_in -= dt
		if _blink_in <= 0.0:
			_blink_in = _rng.randf_range(1.8, 4.5)
			_blink_t = 0.0
	if _blink_t >= 0.0:
		_blink_t += dt
		if _blink_t < 0.16:
			eyes.x *= 1.0 - sin(PI * _blink_t / 0.16) * 0.92
		else:
			_blink_t = -1.0
	var ek := minf(1.0, dt * 14.0)
	_eyes += (eyes - _eyes) * ek
	var local := transform.basis.inverse() * (look - pos)
	var g := Vector2(clampf(atan2(local.x, local.z) / 0.7, -1.0, 1.0), clampf(atan2(local.y, Vector2(local.x, local.z).length()) / 0.6, -1.0, 1.0))
	if _dart > 0.0:
		g = _dart_to
	_gaze += (g - _gaze) * minf(1.0, dt * 12.0)
	var ck := minf(1.0, dt * 8.0)
	_face_col = _face_col.lerp(fcol, ck)
	_status = _status.lerp(status, minf(1.0, dt * 4.0))
	# K.O. blinks
	var shown := _face_col
	if face == 2 and fmod(_t, 0.5) > 0.36:
		shown = _face_col * 0.15
	_body_mat.set_shader_parameter("eyes", _eyes)
	_body_mat.set_shader_parameter("gaze", _gaze)
	_body_mat.set_shader_parameter("face_mode", face)
	_body_mat.set_shader_parameter("face_num", num)
	_body_mat.set_shader_parameter("face_col", Vector3(shown.r, shown.g, shown.b))
	_body_mat.set_shader_parameter("status", Vector3(_status.r, _status.g, _status.b))

	for a in 2:
		var arm := _arms[a]
		var k := 1.0 - exp(-arm.rate * dt)
		arm.dir = arm.dir.slerp(arm.want_dir, k).normalized()
		arm.bend += (arm.want_bend - arm.bend) * k
		arm.hint = arm.hint.lerp(arm.want_hint, k)
	_pose_bones()


# what _stopped worked out for the end of the fight
var _ko_target := Vector3.ZERO
var _ko_look := Vector3.ZERO
var _ko_lam := 2.3
var _ko_eyes := Vector4(1, 0, 0, 0)
var _ko_face := 0
var _ko_col := EYE_COL
var _ko_status := IDLE_COL


## The fight's over: wave it off over the fallen robot (K.O. on the face), then raise the
## winner's hand. On points: a beat in the middle, then the winner. A draw: both hands up.
func _stopped(models: Array, mid: Vector3, cd: Vector2, top: float) -> void:
	_ko_lam = 2.6
	_ko_eyes = Vector4(1, 0, 0, 0)
	_ko_face = 0
	_ko_col = EYE_COL
	_ko_status = IDLE_COL
	var first := 1.3 if _decision else 2.3
	if _ko_t < first or _winner < 0:
		if _decision:
			# the final bell: in the middle, hands crossing at the waist
			_ko_target = Vector3(mid.x - cd.x * 0.5, maxf(2.4, top + 0.45), mid.z - cd.y * 0.5)
			_ko_look = _joint(models, 0, 3).lerp(_joint(models, 1, 3), 0.5)
			var w := sin(_ko_t * TAU * 1.4)
			for a in 2:
				var s: float = SIDE[a]
				if _winner < 0:
					# a draw: both hands up
					_raise(a, 10.0, 0.0, 0.85 + 0.2 * w)
				else:
					_pose(a, Vector3(s * (0.1 + 0.6 * w), -0.15, 0.85), 0.1, 14.0)
			if _winner < 0:
				_ko_eyes = Vector4(1, 0.6, 0, 0)
			return
		# K.O.: over the robot that's out, waving it off
		var i := maxi(0, _loser)
		var pd := _joint(models, i, 0)
		var po := _joint(models, 1 - i, 0)
		var away := Vector2(pd.x - po.x, pd.z - po.z)
		away = away.normalized() if away.length() > 0.05 else Vector2(1, 0)
		var across := Vector2(-away.y, away.x)
		if across.dot(cd) > 0.0:
			across = -across
		var dir := (away * 0.4 + across).normalized()
		_ko_target = Vector3(pd.x + dir.x * 1.3, 1.7, pd.z + dir.y * 1.3)
		_ko_look = _joint(models, i, 3)
		_ko_lam = 3.2
		_ko_face = 2
		_ko_col = KO_COL
		_ko_status = KO_COL
		var wave := sin(_ko_t * TAU * 1.5)
		for a in 2:
			var s: float = SIDE[a]
			# forearms swinging over its head, crossing
			_pose(a, Vector3(s * 0.8, 0.45, 0.3), 1.15 + 0.6 * wave, 16.0, UP)
		return
	# the winner: alongside it, its hand raised high, a happy spin when it gets there
	var w := _winner
	var pw := _joint(models, w, 0)
	var hw := _joint(models, w, 3)
	var pl := _joint(models, 1 - w, 0)
	var away := Vector2(pw.x - pl.x, pw.z - pl.z)
	away = away.normalized() if away.length() > 0.05 else Vector2(1, 0)
	var across := Vector2(-away.y, away.x)
	if across.dot(cd) > 0.0:
		across = -across
	var dir := (across * 0.9 + away * 0.3).normalized()
	_ko_target = Vector3(pw.x + dir.x * 1.15, hw.y + 0.3, pw.z + dir.y * 1.15)
	_ko_look = hw
	var there := pos.distance_to(_ko_target) < 0.5
	if there and not _won_spun:
		_won_spun = true
		_spin = TAU
		_squash_v += 1.5
	if _won_spun and _spin <= 0.0:
		# then to the crowd: to the camera
		_ko_look = _ko_look.lerp(_campos, 0.6)
	var a := _near_arm(hw)
	var lift := 0.06 * sin(_ko_t * 7.0)
	_raise(a, 12.0, lift)
	# ...and the other hand presents it: this one!
	_point(1 - a, hw, 0.15, 8.0)
	_ko_eyes = Vector4(1, 1, 0, 0)
	_ko_col = WIN_COL
	_ko_status = _accent[w] * 2.6


## A robot's joint as drawn this frame, with its lift in the intro (the model sits at its chest,
## raised or lowered by the lift: fight.gd).
static func _joint(models: Array, i: int, j: int) -> Vector3:
	var bm: BotModel = models[i]
	return bm.joints[j] + (bm.position - bm.joints[BotModel.J_CHEST])


## The arm on the side of a point (world).
func _near_arm(at: Vector3) -> int:
	var local := transform.basis.inverse() * (at - transform.origin)
	return 0 if local.x >= 0.0 else 1


## Hands hanging relaxed, elbows a little bent.
func _rest(a: int) -> void:
	var s: float = SIDE[a]
	_pose(a, Vector3(s * 0.35, -1.0, 0.28), 1.0 + 0.12 * sin(_t * 1.3 + a * 2.0), 5.0)


func _pose(a: int, dir: Vector3, bend: float, rate: float, hint := FWD) -> void:
	var arm := _arms[a]
	arm.want_dir = dir.normalized()
	arm.want_bend = bend
	arm.want_hint = hint
	arm.rate = rate


## Arm a's hand raised over its head: the upper arm out and up past the hull, the forearm upright.
func _raise(a: int, rate: float, lean := 0.0, bend := 0.85) -> void:
	_pose(a, Vector3(SIDE[a] * 0.62, 0.62, 0.42 + lean), bend, rate, UP)


## Arm a pointing at a spot in the world.
func _point(a: int, at: Vector3, bend: float, rate: float) -> void:
	var s: float = SIDE[a]
	var sh := transform * Vector3(SHOULDER.x * s, SHOULDER.y, SHOULDER.z)
	var d := transform.basis.inverse() * (at - sh)
	if d.length() < 1e-4:
		return
	_pose(a, d, bend, rate)


## The bones from the arms' poses, the fans' tilt and the squash.
func _pose_bones() -> void:
	var sq := _squash
	var b0 := Transform3D(Basis.from_scale(Vector3(1.0 - sq * 0.5, 1.0 + sq, 1.0 - sq * 0.5)), Vector3.ZERO)
	_set_bone(0, b0)
	for a in 2:
		var s: float = SIDE[a]
		_set_bone(1 + a, b0 * Transform3D(Basis(Vector3.RIGHT, _pod_tilt[a]), Vector3(POD.x * s, POD.y, POD.z)))
		var arm := _arms[a]
		var dir := _clear_pod(a, arm.dir, arm.bend, arm.hint)
		var up := b0 * Transform3D(_arm_basis(dir, arm.hint), Vector3(SHOULDER.x * s, SHOULDER.y, SHOULDER.z))
		var fore := up * Transform3D(Basis(Vector3.RIGHT, -arm.bend), Vector3(0, -UPPER, 0))
		var hand := fore * Transform3D(Basis(Vector3.RIGHT, -arm.bend * 0.3), Vector3(0, -FORE, 0))
		_set_bone(3 + a * 3, up)
		_set_bone(4 + a * 3, fore)
		_set_bone(5 + a * 3, hand)
	_body_mat.set_shader_parameter("bones", _bones)
	_rotor_mat.set_shader_parameter("bones", _bones)


## The arm's direction swung forward just enough that the arm and glove pass in front of its
## fan pod instead of through the duct (raises, waves and the shrug all lift the arm past it).
## The least swing that clears, so the arm slides round the pod as it moves.
func _clear_pod(a: int, d: Vector3, bend: float, hint: Vector3) -> Vector3:
	if not _hits_pod(a, d, bend, hint):
		return d
	var lo := 0.0
	var hi := 3.0
	if _hits_pod(a, (d + Vector3(0, 0, hi)).normalized(), bend, hint):
		return (d + Vector3(0, 0, hi)).normalized()
	for i in 10:
		var mid := (lo + hi) * 0.5
		if _hits_pod(a, (d + Vector3(0, 0, mid)).normalized(), bend, hint):
			lo = mid
		else:
			hi = mid
	return (d + Vector3(0, 0, hi)).normalized()


## Whether arm a, posed so, touches its fan pod (the duct ring and its rim, a flat cylinder in the
## pod's tilted frame), sampling the upper arm, elbow, forearm and glove with their thickness.
func _hits_pod(a: int, d: Vector3, bend: float, hint: Vector3) -> bool:
	var s: float = SIDE[a]
	var sh := Vector3(SHOULDER.x * s, SHOULDER.y, SHOULDER.z)
	var b_up := _arm_basis(d, hint)
	var b_fore := b_up * Basis(Vector3.RIGHT, -bend)
	var b_hand := b_fore * Basis(Vector3.RIGHT, -bend * 0.3)
	var elbow := sh + b_up * Vector3(0, -UPPER, 0)
	var wrist := elbow + b_fore * Vector3(0, -FORE, 0)
	var pod_inv: Basis = Basis(Vector3.RIGHT, _pod_tilt[a]).inverse()
	var pod := Vector3(POD.x * s, POD.y, POD.z)
	for p: Vector4 in [
		_ball((sh + elbow) * 0.5, 0.02),
		_ball(elbow, 0.024),
		_ball((elbow + wrist) * 0.5, 0.019),
		_ball(wrist, 0.021),
		_ball(wrist + b_hand * Vector3(0, -0.032, 0), 0.034),
		_ball(wrist + b_hand * Vector3(0, -0.068, 0), 0.02),
	]:
		var l := pod_inv * (Vector3(p.x, p.y, p.z) - pod)
		if absf(l.y - POD_MID) < POD_HALF + p.w and Vector2(l.x, l.z).length() < POD_R + p.w:
			return true
	return false


static func _ball(c: Vector3, r: float) -> Vector4:
	return Vector4(c.x, c.y, c.z, r)


## The upper arm's frame: its -Y down the arm towards `d`, its +Z (the way the elbow bends) as
## near `hint` as that allows.
static func _arm_basis(d: Vector3, hint: Vector3) -> Basis:
	var y := -d.normalized()
	var z := hint - y * hint.dot(y)
	if z.length_squared() < 1e-4:
		z = Vector3.UP - y * y.y
	z = z.normalized()
	return Basis(y.cross(z), y, z)


func _set_bone(b: int, t: Transform3D) -> void:
	var m := t.basis
	var p := t.origin
	_bones[b * 3] = Vector4(m.x.x, m.y.x, m.z.x, p.x)
	_bones[b * 3 + 1] = Vector4(m.x.y, m.y.y, m.z.y, p.y)
	_bones[b * 3 + 2] = Vector4(m.x.z, m.y.z, m.z.z, p.z)
