## The titans' own effects (titan battles: render/titan): what tells the eye these robots weigh
## thousands of tonnes, at the scale of the city round them. A footfall shakes grit off the
## deck's plates and thumps the lens when it is near; a titan crashing down throws a cloud of
## dust out over the ropes (and over the deck's edge, pouring down onto the press pen), cracks
## the deck (titan_steel's cracks, glowing a moment), jumps every lens in the square, sets the
## car alarms off in the press pen (titan_inst's alarm) and makes the crews nearby duck
## (titan_people's panic). Torn-off plates the size of a house land in dust. A red aviation
## beacon blinks on each titan's head, as on anything else that tall.
##
## The dust lives on the effects' clock (Game.TITAN_FX): a cloud the size of a building takes
## its time. Everything else here (alarms, beacons) runs on the real clock with the city.
class_name TitanFx
extends Node3D

const J_PELVIS := 0
const J_CHEST := 1
const J_HEAD := 3
const J_FOOT_L := 12
const J_FOOT_R := 15
## The dust (linear): the city's grit shaken off a steel deck, in the low sun.
const DUST := Color(0.5, 0.45, 0.39)
const GRIT := Color(0.08, 0.075, 0.07)
## titan_steel.gdshader's cracks[]: (x, z, radius, 1 + how hot).
const CRACKS := 8
## How long a fresh crack glows, the car alarms keep going and the crews keep their heads down (s).
const HOT_S := 2.5
const ALARM_S := 9.0
const PANIC_S := 3.0
## A lens nearer a footfall than this feels it.
const STEP_R := 7.0

var game: Game
var _cracks := PackedVector4Array()
var _next := 0
var _ground_prev := [[false, false, false], [false, false, false]]
## (x, z, radius, how fresh) for titan_inst's alarm and titan_people's panic.
var _alarm := Vector4.ZERO
var _panic := Vector4.ZERO
var _beacons: Array[MeshInstance3D] = []
var _t := 0.0


func _init(g: Game = null) -> void:
	game = g
	name = "TitanFx"
	_cracks.resize(CRACKS)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.disable_receive_shadows = true
	mat.disable_fog = true
	var glow := GradientTexture2D.new()
	glow.fill = GradientTexture2D.FILL_RADIAL
	glow.fill_from = Vector2(0.5, 0.5)
	glow.fill_to = Vector2(1.0, 0.5)
	glow.width = 64
	glow.height = 64
	var gr := Gradient.new()
	gr.offsets = PackedFloat32Array([0.0, 0.12, 0.35, 1.0])
	gr.colors = PackedColorArray([Color(1, 1, 1), Color(1, 0.9, 0.85), Color(0.35, 0.2, 0.18), Color(0, 0, 0)])
	glow.gradient = gr
	mat.albedo_texture = glow
	for i in 2:
		var b := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(0.16, 0.16)
		b.mesh = q
		b.material_override = mat.duplicate()
		b.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		b.name = "beacon%d" % i
		b.visible = false
		add_child(b)
		_beacons.append(b)


## A new fight: the deck is whole again, the city calm.
func start() -> void:
	clear()


func clear() -> void:
	for i in CRACKS:
		_cracks[i] = Vector4(0, 0, 0, 0)
	_next = 0
	_ground_prev = [[false, false, false], [false, false, false]]
	_alarm = Vector4.ZERO
	_panic = Vector4.ZERO
	_upload()
	_upload_city()


func _fx() -> Fx:
	return game.effects.fx


func _venue() -> TitanVenue:
	var v = game.venues.current if game != null and game.venues != null else null
	return v as TitanVenue


## The ground under p: the deck (the sim's canvas, y 0), the stage's step, or the square round it.
static func ground_y(p: Vector3) -> float:
	var oct := _oct(p.x, p.z)
	return 0.0 if oct < TitanRing.CANVAS_A else TitanRing.BASE_Y if oct < TitanRing.BASE_A else TitanRing.PLAZA_Y


static func _oct(x: float, z: float) -> float:
	var a := atan2(z, x)
	var s := roundf(a / (PI / 4.0)) * PI / 4.0
	return x * cos(s) + z * sin(s)


## A cloud of dust rolling out from p along the ground (k: 0..1+ how hard it was hit).
func dust(p: Vector3, k: float, count: int) -> void:
	var fx := _fx()
	var gy := ground_y(p)
	for i in count:
		var a := randf() * TAU
		var s := (0.3 + randf() * 0.9) * (0.5 + k * 0.9)
		var at := Vector3(p.x + cos(a) * 0.15 * k, gy + 0.03, p.z + sin(a) * 0.15 * k)
		var v := Vector3(cos(a) * s, 0.1 + randf() * 0.45 * k, sin(a) * s)
		var c := DUST * (0.7 + randf() * 0.45)
		fx.dust_puff(at, v, c, 2.4 + randf() * 2.2 + k, 0.18 + 0.12 * k, 0.55 + 0.35 * k, 0.3 + 0.14 * minf(k, 1.0), -0.03, 1.3)
	# a body coming down near the deck's edge sends dust pouring off it onto the square
	var ap := _oct(p.x, p.z)
	if k > 0.5 and ap > TitanRing.CANVAS_A - 1.4 and ap < TitanRing.CANVAS_A + 0.3:
		var out := Vector3(p.x, 0, p.z).normalized()
		var edge := out * (TitanRing.CANVAS_A / maxf(0.5, out.dot(_face(p))) + 0.05)
		for i in 4 + roundi(k * 6.0):
			var side := Vector3(-out.z, 0, out.x) * (randf() - 0.5) * 1.2
			fx.dust_puff(Vector3(edge.x, -0.02, edge.z) + side, out * (0.15 + randf() * 0.3) + Vector3(0, -0.05, 0), DUST * (0.8 + randf() * 0.3), 3.0 + randf() * 2.0, 0.12 + randf() * 0.08, 0.7, 0.28, 0.25, 0.9)


## The outward normal of the deck's side nearest p.
static func _face(p: Vector3) -> Vector3:
	var s := roundf(atan2(p.z, p.x) / (PI / 4.0)) * PI / 4.0
	return Vector3(cos(s), 0, sin(s))


## Grit and flakes of paint thrown up where something heavy came down.
func grit(p: Vector3, k: float, count: int) -> void:
	var fx := _fx()
	var gy := ground_y(p)
	for i in count:
		var a := randf() * TAU
		var s := 0.5 + randf() * 2.0 * k
		var v := Vector3(cos(a) * s, 1.0 + randf() * 2.4 * k, sin(a) * s)
		fx.dust_puff(Vector3(p.x, gy + 0.04, p.z), v, GRIT * (0.7 + randf() * 0.8), 1.0 + randf() * 0.8, 0.02 + randf() * 0.025, 0.0, 0.95, 9.0, 0.3)


## A crack in the deck at p (radius r), hot for a moment, there for the rest of the fight.
func crack(p: Vector3, r: float) -> void:
	if _oct(p.x, p.z) > TitanRing.CANVAS_A:
		return
	# (a fresh one near an old one deepens it rather than stacking)
	for i in CRACKS:
		var s := _cracks[i]
		if s.w > 0.0 and Vector2(s.x - p.x, s.y - p.z).length() < (s.z + r) * 0.5:
			_cracks[i] = Vector4((s.x + p.x) * 0.5, (s.y + p.z) * 0.5, minf(1.4, maxf(s.z, r) * 1.1), 2.0)
			_upload()
			return
	_cracks[_next] = Vector4(p.x, p.z, r, 2.0)
	_next = (_next + 1) % CRACKS
	_upload()


## A heavy fall at p (k 0..1+): the square feels it. The ground jumps under every lens, the car
## alarms go off in the press pen on that side and the crews there duck.
func quake(p: Vector3, k: float) -> void:
	var cam := game.cam.global_position
	var d := cam.distance_to(p)
	game.director.thump(0.0035 * k * clampf(9.0 / maxf(d, 1.0), 0.35, 1.6))
	game.director.shake(0.12 * k)
	var r := Vector2(p.x, p.z).length()
	var out := Vector2(p.x, p.z) / maxf(r, 0.01) if r > 0.3 else Vector2(cos(_t), sin(_t))
	var at := out * 7.0
	_alarm = Vector4(at.x, at.y, 2.2 + r * 0.45 + k, 1.0)
	_panic = Vector4(p.x, p.z, 2.0 + k * 1.2, 1.0)
	_upload_city()


func _upload() -> void:
	var v := _venue()
	if v == null:
		return
	v.steel_mat.set_shader_parameter("cracks", _cracks)


func _upload_city() -> void:
	var v := _venue()
	if v == null or v.props == null:
		return
	v.props.inst_mat.set_shader_parameter("alarm", _alarm)
	v.props.people_mat.set_shader_parameter("panic", _panic)


## A torn-off part landing (FightFx debris on_land): dust where it hit.
func land(p: Vector3, sp: float) -> void:
	var k := clampf(sp / 5.0, 0.2, 1.2)
	dust(p, k, 6 + roundi(k * 8.0))
	grit(p, k * 0.6, 4 + roundi(k * 6.0))
	if k > 0.6:
		quake(p, k * 0.5)


## Sim events: footfalls, falls, finisher slams.
func event(type: String, data) -> void:
	match type:
		"step":
			var i := int(data.f.index)
			if i >= game.models.size():
				return
			var foot: Vector3 = game.models[i].joints[J_FOOT_L if int(data.get("foot", 0)) == 0 else J_FOOT_R]
			dust(foot, 0.3, 2)
			# the ground jumps under the lens when it's near
			var d := game.cam.global_position.distance_to(foot)
			if d < STEP_R:
				game.director.thump(0.0009 * (1.0 - d / STEP_R))
		"knockdown":
			game.director.shake(0.3)
		"finisherBlow":
			if str(data.get("kind")) == "slam":
				var p := Vector3(data.point.x, 0.0, data.point.z)
				dust(p, 1.4, 22)
				grit(p, 1.3, 18)
				crack(p, 0.9)
				quake(p, 1.4)


## Each frame: bodies hitting the ground (the sim's grounded flags, as FightFx.ground_impacts),
## the beacons on the titans' heads, the cracks cooling, the city calming down.
func update(_dt: float, _flow: float, mv, models: Array) -> void:
	var rdt := get_process_delta_time()
	_t += rdt
	_beacon_update(models)
	_cool(rdt)
	if mv == null:
		return
	for i in mini(2, models.size()):
		var f = mv.fighters[i]
		if not f.isDown:
			_ground_prev[i] = [false, false, false]
			continue
		var body = f.body
		var joints := [J_PELVIS, J_CHEST, J_HEAD]
		for k in 3:
			var j: int = joints[k]
			var g := JS.truthy(body.grounded[j])
			if g and not _ground_prev[i][k]:
				var sp: float = body.velocity(j, 1.0 / 120.0, V3.new()).length()
				if sp > 1.0:
					var p := Vector3(body.pos[j].x, body.pos[j].y, body.pos[j].z)
					var kk := minf(1.6, sp / 3.0)
					dust(p, kk, 8 + roundi(kk * 12.0))
					grit(p, kk, 4 + roundi(kk * 8.0))
					if sp > 2.2:
						crack(p, 0.35 + minf(0.6, sp * 0.12))
					if k < 2 and sp > 1.8:
						quake(p, kk)
			_ground_prev[i][k] = g


## Fresh cracks cool, the alarms run down, the crews get up again.
func _cool(dt: float) -> void:
	var changed := false
	for i in CRACKS:
		var s := _cracks[i]
		if s.w > 1.0:
			s.w = maxf(1.0, s.w - dt / HOT_S)
			_cracks[i] = s
			changed = true
	if changed:
		_upload()
	if _alarm.w > 0.0 or _panic.w > 0.0:
		_alarm.w = maxf(0.0, _alarm.w - dt / ALARM_S)
		_panic.w = maxf(0.0, _panic.w - dt / PANIC_S)
		_upload_city()


## The red beacon on top of each titan's head, flashing like any tall structure's (a torn-off
## head takes its beacon with it).
func _beacon_update(models: Array) -> void:
	for i in 2:
		var b := _beacons[i]
		if i >= models.size() or not visible:
			b.visible = false
			continue
		var md: BotModel = models[i]
		var h = md.hull_head
		if h == null or h.hull == null or h.s < 1e-4 or not md.visible:
			b.visible = false
			continue
		var top := Vector3((h.hull.lo.x + h.hull.hi.x) * 0.5, h.hull.hi.y - BotHull.FAR_IN, (h.hull.lo.z + h.hull.hi.z) * 0.5)
		b.visible = true
		b.global_position = h.pos + h.rot * (top * h.s) + Vector3(0, 0.025, 0)
		# 40 flashes a minute, each a quick rise and a slower fade (an incandescent lamp's)
		var ph := fmod(_t / 1.5 + float(i) * 0.37, 1.0)
		var on := smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.3, 0.55, ph))
		var m := b.material_override as StandardMaterial3D
		var e := 0.08 + 0.92 * on
		m.albedo_color = Color(1.0 * e, 0.05 * e, 0.02 * e, 1.0)
