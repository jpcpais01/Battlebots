## The titans' own effects (titan battles: render/titan): everything that tells the eye these
## robots weigh thousands of tonnes. Each footfall raises a puff of dust and shakes the lens a
## little when it is close; a body slamming down throws up a cloud of earth and turf, rocks the
## camera and leaves a scar in the ground (titan_grass.gdshader's scars); torn-off plates land in
## dust. The dust is the fight's own smoke pool (Fx.dust_puff), so it moves on the fight's
## slowed clock like everything else.
class_name TitanFx
extends Node3D

const J_PELVIS := 0
const J_CHEST := 1
const J_HEAD := 3
const J_FOOT_L := 12
const J_FOOT_R := 15
## The dust's colour (linear): sunlit dry earth.
const DUST := Color(0.42, 0.34, 0.25)
const EARTH := Color(0.12, 0.085, 0.05)
const TURF := Color(0.09, 0.16, 0.035)
const SCARS := 12

var game: Game
var _scars := PackedVector4Array()
var _next_scar := 0
var _ground_prev := [[false, false, false], [false, false, false]]


func _init(g: Game = null) -> void:
	game = g
	name = "TitanFx"
	_scars.resize(SCARS)


## A new fight: the ground is clean again.
func start() -> void:
	clear()


func clear() -> void:
	for i in SCARS:
		_scars[i] = Vector4(0, 0, 0, 0)
	_next_scar = 0
	_ground_prev = [[false, false, false], [false, false, false]]
	_upload()


func _fx() -> Fx:
	return game.effects.fx


## The ground under p: the deck's turf (the sim's canvas, y 0) or the plain round it.
static func ground_y(p: Vector3) -> float:
	var oct := _oct(p.x, p.z)
	return 0.0 if oct < TitanBuild.CANVAS_A else TitanBuild.BASE_Y if oct < TitanBuild.BASE_A else TitanBuild.GROUND_Y


static func _oct(x: float, z: float) -> float:
	var a := atan2(z, x)
	var s := roundf(a / (PI / 4.0)) * PI / 4.0
	return x * cos(s) + z * sin(s)


## A puff of dust rolling out from p (k: 0..1+ how hard the ground was hit).
func dust(p: Vector3, k: float, count: int) -> void:
	var fx := _fx()
	var gy := ground_y(p)
	for i in count:
		var a := randf() * TAU
		var s := (0.35 + randf() * 0.9) * (0.6 + k * 0.8)
		var at := Vector3(p.x + cos(a) * 0.12 * k, gy + 0.03, p.z + sin(a) * 0.12 * k)
		var v := Vector3(cos(a) * s, 0.15 + randf() * 0.35 * k, sin(a) * s)
		var c := DUST * (0.75 + randf() * 0.4)
		fx.dust_puff(at, v, c, 2.2 + randf() * 2.0 + k, 0.16 + 0.1 * k, 0.5 + 0.3 * k, 0.32 + 0.12 * minf(k, 1.0), -0.02, 1.4)


## Clods of earth and turf thrown up where something heavy came down.
func clods(p: Vector3, k: float, count: int) -> void:
	var fx := _fx()
	var gy := ground_y(p)
	for i in count:
		var a := randf() * TAU
		var s := 0.6 + randf() * 2.2 * k
		var v := Vector3(cos(a) * s, 1.2 + randf() * 2.5 * k, sin(a) * s)
		fx.dust_puff(Vector3(p.x, gy + 0.04, p.z), v, (EARTH if randf() < 0.6 else TURF) * (0.7 + randf() * 0.5), 1.0 + randf() * 0.8, 0.025 + randf() * 0.03, 0.0, 0.95, 9.0, 0.3)


## A scar in the ground at p (radius r): churned earth and cracks for the rest of the fight.
func scar(p: Vector3, r: float) -> void:
	# (a fresh one near an old one deepens it rather than stacking)
	for i in SCARS:
		var s := _scars[i]
		if s.w > 0.0 and Vector2(s.x - p.x, s.y - p.z).length() < (s.z + r) * 0.5:
			_scars[i] = Vector4((s.x + p.x) * 0.5, (s.y + p.z) * 0.5, maxf(s.z, r) * 1.1, 1.0)
			_upload()
			return
	_scars[_next_scar] = Vector4(p.x, p.z, r, 1.0)
	_next_scar = (_next_scar + 1) % SCARS
	_upload()


func _upload() -> void:
	var v = game.venues.current if game != null and game.venues != null else null
	if v == null or not (v is TitanVenue):
		return
	v.grass_deck.set_shader_parameter("scars", _scars)
	v.grass_plain.set_shader_parameter("scars", _scars)


## A torn-off part landing (FightFx debris on_land): dust where it hit.
func land(p: Vector3, sp: float) -> void:
	var k := clampf(sp / 5.0, 0.2, 1.2)
	dust(p, k, 6 + roundi(k * 8.0))
	clods(p, k * 0.6, 4 + roundi(k * 6.0))


## Sim events: footfalls, falls, finisher slams.
func event(type: String, data) -> void:
	match type:
		"step":
			var i := int(data.f.index)
			if i >= game.models.size():
				return
			var foot: Vector3 = game.models[i].joints[J_FOOT_L if int(data.get("foot", 0)) == 0 else J_FOOT_R]
			dust(foot, 0.35, 3)
			# the ground shakes under the lens when it's close
			var d := game.cam.global_position.distance_to(foot)
			if d < 6.0:
				game.director.shake(0.05 * (1.0 - d / 6.0))
		"knockdown":
			game.director.shake(0.35)
		"finisherBlow":
			if str(data.get("kind")) == "slam":
				var p := Vector3(data.point.x, 0.0, data.point.z)
				dust(p, 1.4, 20)
				clods(p, 1.3, 18)
				scar(p, 0.9)


## Each frame: bodies hitting the ground (the sim's grounded flags, as FightFx.ground_impacts).
func update(_dt: float, _flow: float, mv, models: Array) -> void:
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
					dust(p, kk, 6 + roundi(kk * 10.0))
					clods(p, kk, 4 + roundi(kk * 8.0))
					if sp > 2.2:
						scar(p, 0.35 + minf(0.6, sp * 0.12))
			_ground_prev[i][k] = g
