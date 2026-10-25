## Everything in the titan city that is people-sized (render/titan): the things the eye measures
## the titans by. Fire engines, ambulances, police cars and TV trucks parked round the stage in
## the press pen; the crews, the stewards and the camera operators among them; the steel barriers
## holding the crowd back; the scaffold camera towers (TitanCam films from them); cars parked
## along every street and traffic still moving on the far ones; street lamps coming on; trees
## down the boulevard; people watching from the pavements, the roofs and the quay; the two big
## screens. All real-sized (a car is 0.3 units, a person 0.117), drawn in a few MultiMeshes
## (titan_inst.gdshader, titan_people.gdshader) and one mesh of steel (titan_prop.gdshader).
##
## Laid out from a fixed seed, so it is the same every fight.
class_name TitanProps
extends RefCounted

const INST := preload("res://render/titan/titan_inst.gdshader")
const PEOPLE := preload("res://render/titan/titan_people.gdshader")
const PROP := preload("res://render/titan/titan_prop.gdshader")

## titan_inst.gdshader kinds.
const SEDAN := 0.0
const HATCH := 1.0
const TAXI := 2.0
const POLICE := 3.0
const VAN := 4.0
const TRUCK := 5.0
const AMBULANCE := 6.0
const FIRE := 7.0
const BUS := 8.0
const OB := 9.0
const CONTAINER := 10.0
const LAMP := 20.0
const TREE := 30.0
## titan_prop.gdshader kinds.
const P_BARRIER := 0.0
const P_SCAFFOLD := 1.0
const P_PLATE := 2.0
const P_DARK := 3.0
const P_CONCRETE := 4.0
const P_PAINT := 5.0
const P_LATTICE := 6.0
const P_HULL := 7.0
const P_HILL := 8.0
const P_FARCITY := 9.0
const P_CABLE := 10.0
const P_BEACON := 11.0
const P_SCREEN := 12.0
const P_DISH := 13.0
const P_LAMP := 14.0
const P_CANVAS := 15.0
const P_STACK := 16.0
## titan_people.gdshader roles.
const ONLOOKER := 0.0
const CREW := 1.0
const STEWARD := 2.0
const OPERATOR := 3.0
const FIREFIGHTER := 4.0

## Sizes (length, height, width) in units: 15 m each.
const SIZES := {
	SEDAN: Vector3(0.3, 0.098, 0.121), HATCH: Vector3(0.27, 0.1, 0.118), TAXI: Vector3(0.31, 0.1, 0.122),
	POLICE: Vector3(0.32, 0.1, 0.124), VAN: Vector3(0.37, 0.16, 0.135), TRUCK: Vector3(0.55, 0.22, 0.165),
	AMBULANCE: Vector3(0.44, 0.19, 0.15), FIRE: Vector3(0.68, 0.22, 0.167), BUS: Vector3(0.8, 0.2, 0.167),
	OB: Vector3(0.86, 0.27, 0.167), CONTAINER: Vector3(0.8, 0.173, 0.163),
}
const CAR_PAINTS := [Color(0.62, 0.62, 0.62), Color(0.04, 0.04, 0.045), Color(0.82, 0.82, 0.8), Color(0.25, 0.27, 0.3), Color(0.35, 0.05, 0.04), Color(0.05, 0.12, 0.3), Color(0.5, 0.48, 0.42), Color(0.12, 0.2, 0.15)]
const CONTAINER_PAINTS := [Color(0.05, 0.25, 0.45), Color(0.55, 0.12, 0.06), Color(0.15, 0.32, 0.18), Color(0.7, 0.5, 0.1), Color(0.45, 0.45, 0.45), Color(0.6, 0.25, 0.08)]
const PERSON_H := 0.117
## Vehicles further out than this from the ring are drawn as plain boxes.
const NEAR_R := 21.0

var tris := 0
var _rng := RandomNumberGenerator.new()
# instances: per mesh, [transforms, customs (Color), colours]
var _cars := [[], [], []]
var _trucks := [[], [], []]
# beyond NEAR_R they're plain boxes, painted the same (a car is a few pixels out there)
var _cars_far := [[], [], []]
var _trucks_far := [[], [], []]
var _buses := [[], [], []]
var _lamps := [[], [], []]
var _trees := [[], [], []]
var _people := [[], [], []]
## The static steel: barriers, towers, screens' frames, dishes.
var steel := TitanBuild.new()
var people_mat: ShaderMaterial
var inst_mat: ShaderMaterial
var prop_mat: ShaderMaterial


func _init() -> void:
	_rng.seed = 0x5ca1e


func _r(a: float, b: float) -> float:
	return _rng.randf_range(a, b)


## Lay it all out and add it to `parent` (the venue). `crowd_tmpl`: the indoor crowd's material,
## for its atlas of people.
func build(parent: Node3D, city: TitanCity, crowd_tmpl: ShaderMaterial) -> void:
	inst_mat = ShaderMaterial.new()
	inst_mat.shader = INST
	people_mat = ShaderMaterial.new()
	people_mat.shader = PEOPLE
	if crowd_tmpl:
		for k in ["atlas", "bounds", "skin", "pants"]:
			people_mat.set_shader_parameter(k, crowd_tmpl.get_shader_parameter(k))
	prop_mat = ShaderMaterial.new()
	prop_mat.shader = PROP
	_press_pen()
	_pen_kit()
	_barrier()
	_towers()
	_screens()
	_streets(city)
	_lamps_and_trees()
	_onlookers(city)
	TitanLand.build(self)
	_add_mm(parent, _car_mesh(), inst_mat, _cars, "cars", true)
	_add_mm(parent, _truck_mesh(), inst_mat, _trucks, "trucks", true)
	_add_mm(parent, _bus_mesh(), inst_mat, _cars_far, "cars_far", false)
	_add_mm(parent, _bus_mesh(), inst_mat, _trucks_far, "trucks_far", false)
	_add_mm(parent, _bus_mesh(), inst_mat, _buses, "buses", true)
	_add_mm(parent, _lamp_mesh(), inst_mat, _lamps, "lamps", false)
	_add_mm(parent, _tree_mesh(), inst_mat, _trees, "trees", true)
	_add_mm(parent, _card_mesh(), people_mat, _people, "people", false)
	var mi := MeshInstance3D.new()
	mi.name = "props"
	mi.mesh = steel.make(prop_mat)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	parent.add_child(mi)
	tris += steel.tris()


func _add_mm(parent: Node3D, b: TitanBuild, mat: Material, list: Array, node_name: String, shadow: bool) -> void:
	var xf: Array = list[0]
	if xf.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = b.make()
	mm.instance_count = xf.size()
	for i in xf.size():
		mm.set_instance_transform(i, xf[i])
		mm.set_instance_custom_data(i, list[1][i])
		mm.set_instance_color(i, list[2][i])
	var mi := MultiMeshInstance3D.new()
	mi.name = node_name
	mi.multimesh = mm
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	tris += b.tris() * xf.size()


# ------------------------------------------------------------------ placing

## A vehicle of kind k at p (on the ground), its front towards `yaw` (radians from +x, round +y
## the way atan2(z, x) runs), driving at `speed` along a lane `lane` long (0: parked).
func vehicle(k: float, p: Vector3, yaw: float, paint := Color.WHITE, speed := 0.0, lane := 0.0) -> void:
	var sz: Vector3 = SIZES[k]
	var b := Basis(Vector3.UP, -yaw).scaled_local(sz)
	var list := _list(k, p)
	list[0].append(Transform3D(b, p))
	list[1].append(Color(k, _rng.randf(), speed, lane))
	list[2].append(paint)


## Which MultiMesh a vehicle of kind k at p goes in.
func _list(k: float, p: Vector3) -> Array:
	if k == BUS or k == CONTAINER:
		return _buses
	var far := Vector2(p.x, p.z).length() > NEAR_R
	if k <= POLICE:
		return _cars_far if far else _cars
	return _trucks_far if far else _trucks


func person(p: Vector3, role: float, pose := 0.0, fig := -1) -> void:
	var f := fig if fig >= 0 else _rng.randi_range(0, 29)
	var h := PERSON_H * _r(0.92, 1.06)
	_people[0].append(Transform3D(Basis().scaled(Vector3(h, h, h)), p))
	_people[1].append(Color(f, pose, _rng.randf(), role))
	_people[2].append(Color.WHITE)


func _ring_at(a: float, r: float) -> Vector3:
	return Vector3(cos(a) * r, TitanCity.PLAZA_Y, sin(a) * r)


## The press pen round the stage: the emergency services standing by, the TV trucks, the crews'
## containers, people everywhere among them; crews on the apron and up the stairs.
func _press_pen() -> void:
	var y := TitanCity.PLAZA_Y
	# [angle (deg), radius, kind, crew]
	var slots := [
		[18.0, 7.0, OB, 3], [48.0, 7.3, FIRE, 5], [66.0, 7.9, VAN, 2], [108.0, 7.6, CONTAINER, 2],
		[124.0, 7.5, AMBULANCE, 3], [140.0, 8.0, VAN, 2], [163.0, 7.1, OB, 3], [198.0, 7.4, AMBULANCE, 3],
		[228.0, 7.3, FIRE, 5], [246.0, 7.9, TRUCK, 2], [288.0, 7.6, CONTAINER, 2], [312.0, 7.5, AMBULANCE, 3],
		[342.0, 7.1, OB, 3], [84.0, 8.3, POLICE, 1], [276.0, 8.3, POLICE, 1], [176.0, 8.5, VAN, 1],
	]
	for s in slots:
		var a := deg_to_rad(s[0])
		var r: float = s[1]
		var k: float = s[2]
		var p := _ring_at(a, r)
		var yaw := a + PI / 2.0 * (1.0 if _rng.randf() < 0.5 else -1.0)
		var paint := Color.WHITE
		if k == OB:
			paint = [Color(0.05, 0.2, 0.55), Color(0.6, 0.05, 0.05), Color(0.05, 0.35, 0.2)][_rng.randi() % 3]
		elif k == CONTAINER:
			paint = CONTAINER_PAINTS[_rng.randi() % CONTAINER_PAINTS.size()]
		elif k == VAN or k == TRUCK:
			paint = Color(0.85, 0.85, 0.83)
		vehicle(k, p, yaw, paint)
		if k == CONTAINER:
			# stacked two high, a third alongside
			vehicle(k, p + Vector3(0, 0.174, 0), yaw + _r(-0.05, 0.05), CONTAINER_PAINTS[_rng.randi() % CONTAINER_PAINTS.size()])
			vehicle(k, p + Vector3(cos(a), 0, sin(a)) * 0.18, yaw, CONTAINER_PAINTS[_rng.randi() % CONTAINER_PAINTS.size()])
		if k == OB:
			# its satellite dish on the roof, tilted at the southern sky
			var sz: Vector3 = SIZES[OB]
			var top := p + Vector3(0, sz.y, 0) + Vector3(cos(yaw), 0, sin(yaw)) * (-0.2)
			_dish(top, 0.075)
		if k == FIRE:
			_ladder(p, yaw)
		# the crew round it
		for i in int(s[3]) + _rng.randi_range(0, 2):
			var q := p + Vector3(_r(-0.35, 0.35), 0, _r(-0.35, 0.35))
			if q.distance_to(p) < 0.14:
				q = p + (q - p).normalized() * 0.16
			person(q, FIREFIGHTER if k == FIRE else CREW)
	# the police cars blocking the boulevard where it meets the square
	for sx in [-1.0, 1.0]:
		for z in [-1.2, -0.35, 0.5, 1.3]:
			vehicle(POLICE, Vector3(sx * (10.4 + _r(-0.15, 0.15)), y, z + _r(-0.08, 0.08)), PI / 2.0 + _r(-0.4, 0.4), Color(0.04, 0.04, 0.05))
		for i in 4:
			person(Vector3(sx * _r(9.9, 10.9), y, _r(-1.6, 1.6)), STEWARD)
	# stewards along the barrier, facing the crowd
	var n := 120
	for i in n:
		var a := TAU * (i + _r(-0.3, 0.3)) / n
		var p := _ring_at(a, TitanVenue.CROWD_R0 - 0.12)
		if absf(p.z) < 2.1 and absf(p.x) > 8.0:
			continue
		person(p, STEWARD)
	# photographers and crew scattered about the pen
	for i in 70:
		var a := _r(0.0, TAU)
		var r := _r(5.75, 9.4)
		person(_ring_at(a, r), CREW if _rng.randf() < 0.6 else OPERATOR)
	# crew on the deck behind the corner pylons (next to one a titan's foot is a building), and
	# up the stairs (the apron's camera keeps clear of the corners: TitanCam.APRON_CLEAR)
	for k in 8:
		for i in _rng.randi_range(1, 2):
			var a := (k + 0.5) * PI / 4.0 + _r(-0.06, 0.06)
			var r := _r(5.3, 5.42)
			person(Vector3(cos(a) * r, 0.0, sin(a) * r), OPERATOR if _rng.randf() < 0.5 else CREW)
	for side in [1.0, -1.0]:
		for i in 3:
			var t := float(i) / 3.0
			person(Vector3(_r(-0.25, 0.25), lerpf(y, TitanRing.BASE_Y, t), side * (TitanRing.BASE_A + 0.14)), CREW)


## The kit between the vehicles in the press pen: white marquees, mobile light towers lighting the
## stage's sides, cable runs from the TV trucks to the stage.
func _pen_kit() -> void:
	var y := TitanCity.PLAZA_Y
	# the medical post, the press tent, the crews' catering
	for s in [[6.0, 8.7], [97.0, 8.6], [186.0, 8.9], [258.0, 8.7], [322.0, 8.6], [140.0, 9.15]]:
		var a := deg_to_rad(s[0])
		_marquee(_ring_at(a, s[1]), a + PI / 2.0, 0.78, 0.48)
		for i in _rng.randi_range(3, 6):
			person(_ring_at(a + _r(-0.06, 0.06), s[1] + _r(-0.4, 0.4)), CREW if _rng.randf() < 0.5 else ONLOOKER)
	# mobile light towers between the stage's corners, their lamps on the stage's sides
	for k in 8:
		var a := k * PI / 4.0 + _r(-0.12, 0.12)
		_light_tower(_ring_at(a, 6.15 + _r(0.0, 0.3)), a)
	# cable runs, a bundle from each TV truck to the stage's foot
	for deg in [18.0, 163.0, 342.0]:
		var a := deg_to_rad(deg)
		var p0 := _ring_at(a, 6.6)
		var p1 := _ring_at(a + _r(-0.05, 0.05), TitanRing.BASE_A / cos(0.2) + 0.02)
		var dir := (p1 - p0).normalized()
		var side := Vector3(-dir.z, 0, dir.x) * 0.012
		var lift := Vector3(0, 0.003, 0)
		steel.face(p0 - side + lift, p1 - side + lift, p1 + side + lift, p0 + side + lift, Vector3.UP, Vector2.ZERO, Vector2.ONE, Vector2(P_DARK, 0))


## A white marquee at p (its ridge along `yaw`): walls, a pitched roof.
func _marquee(p: Vector3, yaw: float, l: float, w: float) -> void:
	var f := Vector3(cos(yaw), 0, sin(yaw)) * l * 0.5
	var s := Vector3(-sin(yaw), 0, cos(yaw)) * w * 0.5
	var eave := Vector3(0, 0.17, 0)
	var ridge := Vector3(0, 0.27, 0)
	var c := [p - f - s, p + f - s, p + f + s, p - f + s]
	var lm := l * 15.0
	var wm := w * 15.0
	# walls
	for i in 4:
		var a: Vector3 = c[i]
		var b: Vector3 = c[(i + 1) % 4]
		var nn := ((a + b) * 0.5 - p).normalized()
		var len := (b - a).length() * 15.0
		steel.face(a, b, b + eave, a + eave, nn, Vector2.ZERO, Vector2(len, 2.5), Vector2(P_CANVAS, 0))
	# the roof's two slopes and its gable ends
	var r0 := p - f + ridge
	var r1 := p + f + ridge
	var up0 := (ridge - eave).normalized()
	steel.face(c[0] + eave, c[1] + eave, r1, r0, (-s.normalized() * 0.1 + up0 * 0.9 + Vector3.UP).normalized(), Vector2.ZERO, Vector2(lm, wm * 0.5), Vector2(P_CANVAS, 0))
	steel.face(c[2] + eave, c[3] + eave, r0, r1, (s.normalized() * 0.1 + up0 * 0.9 + Vector3.UP).normalized(), Vector2.ZERO, Vector2(lm, wm * 0.5), Vector2(P_CANVAS, 0))
	var i0 := steel.vert(c[3] + eave, -f.normalized(), Vector2.ZERO, Vector2(P_CANVAS, 0))
	var i1 := steel.vert(c[0] + eave, -f.normalized(), Vector2(wm, 0), Vector2(P_CANVAS, 0))
	var i2 := steel.vert(r0, -f.normalized(), Vector2(wm * 0.5, 1.5), Vector2(P_CANVAS, 0))
	steel.tri(i0, i1, i2)
	i0 = steel.vert(c[1] + eave, f.normalized(), Vector2.ZERO, Vector2(P_CANVAS, 0))
	i1 = steel.vert(c[2] + eave, f.normalized(), Vector2(wm, 0), Vector2(P_CANVAS, 0))
	i2 = steel.vert(r1, f.normalized(), Vector2(wm * 0.5, 1.5), Vector2(P_CANVAS, 0))
	steel.tri(i0, i1, i2)


## A mobile light tower at p: its trailer, a 9 m mast, a bank of four lamps aimed at the stage.
func _light_tower(p: Vector3, a: float) -> void:
	var to_c := -Vector3(cos(a), 0, sin(a))
	var side := Vector3(-to_c.z, 0, to_c.x)
	steel.box(p - side * 0.05 - to_c * 0.1, p + side * 0.05 + to_c * 0.1 + Vector3(0, 0.07, 0), Vector2(P_PAINT, 1.0), Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, false)
	var top := p + Vector3(0, 0.62, 0)
	steel.beam(p + Vector3(0, 0.07, 0), top, 0.014, 0.014, to_c, Vector2(P_PAINT, 1.0))
	var tilt := (to_c * 0.8 - Vector3(0, 0.35, 0)).normalized()
	var up := tilt.cross(side).normalized()
	if up.y < 0.0:
		up = -up
	var hw := 0.045
	var hh := 0.045
	var c := top + to_c * 0.01
	steel.face(c - side * hw - up * hh, c + side * hw - up * hh, c + side * hw + up * hh, c - side * hw + up * hh, tilt, Vector2.ZERO, Vector2.ONE, Vector2(P_LAMP, 0))
	var back := -tilt * 0.02
	steel.face(c + side * hw - up * hh + back, c - side * hw - up * hh + back, c - side * hw + up * hh + back, c + side * hw + up * hh + back, -tilt, Vector2.ZERO, Vector2.ONE, Vector2(P_DARK, 0))


## An aerial ladder off the back of a fire engine, raised towards the deck.
func _ladder(p: Vector3, yaw: float) -> void:
	var fwd := Vector3(cos(yaw), 0, sin(yaw))
	var base := p + Vector3(0, 0.22, 0) - fwd * 0.18
	var to_c := -Vector3(p.x, 0, p.z).normalized()
	var tip := base + (to_c * 0.9 + Vector3(0, 0.55, 0)) * 0.95
	steel.beam(base, tip, 0.05, 0.02, Vector3.UP, Vector2(P_LATTICE, 0.0))
	steel.beam(base - fwd * 0.02, base + fwd * 0.12, 0.08, 0.05, Vector3.UP, Vector2(P_DARK, 0))
	# the cage at its tip, a firefighter in it
	steel.box(tip + Vector3(-0.025, -0.03, -0.025), tip + Vector3(0.025, 0.0, 0.025), Vector2(P_PAINT, 3.0))
	person(tip + Vector3(0, -0.03, 0), FIREFIGHTER)


## A satellite dish: a shallow cone on a stub, facing south and up.
func _dish(at: Vector3, r: float) -> void:
	var c := at + Vector3(0, r * 0.9, 0)
	var n := Vector3(0.0, 0.65, 0.76).normalized()
	var u := n.cross(Vector3.RIGHT).normalized()
	var v := n.cross(u)
	steel.beam(at, c, 0.012, 0.012, Vector3.FORWARD, Vector2(P_DARK, 0))
	var segs := 10
	var base := steel.v.size()
	steel.vert(c + n * r * 0.25, n, Vector2.ZERO, Vector2(P_DISH, 0))
	for i in segs + 1:
		var a := TAU * i / segs
		var e := c + (u * cos(a) + v * sin(a)) * r
		steel.vert(e, (n + (e - c).normalized() * 0.4).normalized(), Vector2.ZERO, Vector2(P_DISH, 0))
	for i in segs:
		steel.tri(base, base + 1 + i, base + 2 + i)


## The crowd's barrier: steel panels all round the front row, open where the boulevard comes in.
func _barrier() -> void:
	var r := TitanVenue.CROWD_R0 - 0.015
	var segs := 160
	var y0 := TitanCity.PLAZA_Y
	var h := 0.073
	for i in segs:
		var a0 := TAU * i / segs
		var a1 := TAU * (i + 1) / segs
		var p0 := Vector3(cos(a0) * r, y0, sin(a0) * r)
		var p1 := Vector3(cos(a1) * r, y0, sin(a1) * r)
		var mid := (p0 + p1) * 0.5
		if absf(mid.z) < 2.1 and absf(mid.x) > 8.0:
			continue
		var w := p0.distance_to(p1) * 15.0
		var nn := -Vector3(mid.x, 0, mid.z).normalized()
		var u0 := float(i) * w
		steel.face(p0, p1, p1 + Vector3(0, h, 0), p0 + Vector3(0, h, 0), nn, Vector2(u0, 0), Vector2(u0 + w, 1.1), Vector2(P_BARRIER, 0))


## The scaffold camera towers in the press pen (TitanCam.TOWER_DEG): a platform at the deck's
## height, a camera on it and its operator.
func _towers() -> void:
	var y0 := TitanCity.PLAZA_Y
	var top := TitanCam.TOWER_TOP
	for deg in TitanCam.TOWER_DEG:
		var a := deg_to_rad(deg)
		var c := Vector3(cos(a) * TitanCam.TOWER_R, 0, sin(a) * TitanCam.TOWER_R)
		var hw := 0.1
		var lo := Vector3(c.x - hw, y0, c.z - hw)
		var hi := Vector3(c.x + hw, top, c.z + hw)
		# the scaffold's four faces, in metres for the lattice
		var hm := (top - y0) * 15.0
		steel.face(Vector3(lo.x, y0, lo.z), Vector3(hi.x, y0, lo.z), Vector3(hi.x, top, lo.z), Vector3(lo.x, top, lo.z), Vector3.FORWARD, Vector2.ZERO, Vector2(3.0, hm), Vector2(P_SCAFFOLD, 0))
		steel.face(Vector3(hi.x, y0, hi.z), Vector3(lo.x, y0, hi.z), Vector3(lo.x, top, hi.z), Vector3(hi.x, top, hi.z), Vector3.BACK, Vector2.ZERO, Vector2(3.0, hm), Vector2(P_SCAFFOLD, 0))
		steel.face(Vector3(lo.x, y0, hi.z), Vector3(lo.x, y0, lo.z), Vector3(lo.x, top, lo.z), Vector3(lo.x, top, hi.z), Vector3.LEFT, Vector2.ZERO, Vector2(3.0, hm), Vector2(P_SCAFFOLD, 0))
		steel.face(Vector3(hi.x, y0, lo.z), Vector3(hi.x, y0, hi.z), Vector3(hi.x, top, hi.z), Vector3(hi.x, top, lo.z), Vector3.RIGHT, Vector2.ZERO, Vector2(3.0, hm), Vector2(P_SCAFFOLD, 0))
		# the platform, its rail, the camera and the operator
		steel.box(Vector3(c.x - 0.14, top - 0.01, c.z - 0.14), Vector3(c.x + 0.14, top, c.z + 0.14), Vector2(P_PLATE, 0), Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, true)
		var to_c := -Vector3(c.x, 0, c.z).normalized()
		var side := Vector3(-to_c.z, 0, to_c.x)
		for s in [-1.0, 1.0]:
			var e: Vector3 = c + side * 0.14 * s
			steel.face(e - to_c * 0.14 + Vector3(0, top, 0), e + to_c * 0.14 + Vector3(0, top, 0), e + to_c * 0.14 + Vector3(0, top + 0.07, 0), e - to_c * 0.14 + Vector3(0, top + 0.07, 0), side * s, Vector2.ZERO, Vector2(4.2, 1.1), Vector2(P_BARRIER, 0))
		var cam := c + to_c * 0.06 + Vector3(0, top, 0)
		steel.beam(cam, cam + Vector3(0, 0.09, 0), 0.012, 0.012, to_c, Vector2(P_DARK, 0))
		steel.beam(cam + Vector3(0, 0.09, 0) - to_c * 0.04, cam + Vector3(0, 0.1, 0) + to_c * 0.06, 0.035, 0.035, Vector3.UP, Vector2(P_DARK, 0), Color.WHITE, Vector4.ZERO, true)
		person(c - to_c * 0.03 + side * 0.05 + Vector3(0, top, 0), OPERATOR)
		person(c - to_c * 0.08 - side * 0.07 + Vector3(0, top, 0), CREW)


## Two big screens on scaffolds behind the crowd, facing the ring (the arena's scoreboard on them).
func _screens() -> void:
	var y0 := TitanCity.PLAZA_Y
	for sx in [-1.0, 1.0]:
		var c := Vector3(sx * 11.6, 0, 11.6)
		var to_c := -Vector3(c.x, 0, c.z).normalized()
		var side := Vector3(-to_c.z, 0, to_c.x)
		var w := 1.7
		var h := w * 9.0 / 16.0
		var b := y0 + 0.55
		var p0 := c - side * w * 0.5 + Vector3(0, b, 0)
		var p1 := c + side * w * 0.5 + Vector3(0, b, 0)
		steel.face(p0, p1, p1 + Vector3(0, h, 0), p0 + Vector3(0, h, 0), to_c, Vector2(0, 0), Vector2(1, 1), Vector2(P_SCREEN, 0))
		# its black frame and the scaffold holding it up
		var back := -to_c * 0.04
		steel.face(p1 + back, p0 + back, p0 + back + Vector3(0, h, 0), p1 + back + Vector3(0, h, 0), -to_c, Vector2.ZERO, Vector2.ONE, Vector2(P_DARK, 0))
		var sw := w * 15.0
		steel.face(p0 + back * 2.0 + Vector3(0, -b + y0, 0), p1 + back * 2.0 + Vector3(0, -b + y0, 0), p1 + back * 2.0 + Vector3(0, h, 0), p0 + back * 2.0 + Vector3(0, h, 0), to_c, Vector2.ZERO, Vector2(sw, (h + b - y0) * 15.0), Vector2(P_SCAFFOLD, 0))


## Parked cars along the city's streets, traffic still moving on the far ones, buses and TV
## trucks along the boulevard.
func _streets(city: TitanCity) -> void:
	var y := TitanCity.PLAZA_Y
	var P := TitanCity.PITCH
	# streets running east-west (along x) at z = (j + 1/2) P, north-south at x = (i + 1/2) P
	for j in range(-1, TitanCity.J_MAX):
		var z := (j + 0.5) * P
		for side in [-1.0, 1.0]:
			_curb(Vector3(-62, y, z + side * 0.62), Vector3(62, y, z + side * 0.62), 0.42, 0.55, z > 14.0 or j < 0)
	for i in range(-TitanCity.I_MAX, TitanCity.I_MAX):
		var x := (i + 0.5) * P
		if absf(x) < 14.0:
			continue
		for side in [-1.0, 1.0]:
			_curb(Vector3(x + side * 0.62, y, -12.0), Vector3(x + side * 0.62, y, 92.0), 0.42, 0.5, true)
	# traffic on the streets beyond the cordon
	for j in range(2, 8):
		var z := (j + 0.5) * P
		_lane(Vector3(-70, y, z - 0.25), Vector3(1, 0, 0), 140.0, 9)
		_lane(Vector3(70, y, z + 0.25), Vector3(-1, 0, 0), 140.0, 9)
	for i in [-6, -4, -3, 2, 3, 5]:
		var x: float = (i + 0.5) * P
		_lane(Vector3(x + 0.25, y, 22.0), Vector3(0, 0, 1), 75.0, 6)
		_lane(Vector3(x - 0.25, y, 97.0), Vector3(0, 0, -1), 75.0, 6)
	# the boulevard: fans' coaches and TV trucks along its kerbs, out to the cordon
	for sx in [-1.0, 1.0]:
		var x := 15.5
		while x < 44.0:
			for sz in [-1.0, 1.0]:
				if _rng.randf() < 0.75:
					var k := BUS if _rng.randf() < 0.55 else OB if _rng.randf() < 0.4 else VAN
					var paint: Color = Color(0.9, 0.9, 0.88) if k != BUS else [Color(0.85, 0.82, 0.75), Color(0.1, 0.25, 0.55), Color(0.7, 0.1, 0.08)][_rng.randi() % 3]
					vehicle(k, Vector3(sx * (x + _r(0.0, 0.1)), y, sz * 1.55), 0.0 if sx > 0.0 else PI, paint)
			x += _r(0.95, 1.25)


## Cars parked along a kerb from a to b, each `gap` apart give or take, `fill` of the spaces
## taken.
func _curb(a: Vector3, b: Vector3, gap: float, fill: float, allow: bool) -> void:
	if not allow:
		return
	var len := a.distance_to(b)
	var dir := (b - a) / len
	var yaw := atan2(dir.z, dir.x)
	var t := _r(0.0, gap)
	while t < len:
		var p := a + dir * t
		t += gap * _r(0.95, 1.15)
		# not in the square, nor the boulevard, nor too far off to see
		if absf(p.x) < 14.5 and p.z < 14.5:
			continue
		if absf(p.z) < 2.3 and absf(p.x) < 46.0:
			continue
		if Vector2(p.x, p.z).length() > 50.0:
			continue
		if _rng.randf() > fill:
			continue
		var x := _rng.randf()
		var k := SEDAN if x < 0.5 else HATCH if x < 0.75 else TAXI if x < 0.82 else VAN if x < 0.94 else TRUCK
		var paint: Color = CAR_PAINTS[_rng.randi() % CAR_PAINTS.size()]
		if k == TAXI:
			paint = Color(0.85, 0.62, 0.04)
		elif k == VAN or k == TRUCK:
			paint = Color(0.85, 0.85, 0.83)
		vehicle(k, p, yaw + (PI if _rng.randf() < 0.5 else 0.0), paint)


## n cars driving round a lane from `start` along `dir`, `len` long.
func _lane(start: Vector3, dir: Vector3, len: float, n: int) -> void:
	var yaw := atan2(dir.z, dir.x)
	var speed := _r(0.65, 0.95)
	for i in n:
		var x := _rng.randf()
		var k := SEDAN if x < 0.55 else HATCH if x < 0.75 else TAXI if x < 0.85 else VAN if x < 0.95 else BUS
		var paint: Color = CAR_PAINTS[_rng.randi() % CAR_PAINTS.size()]
		if k == TAXI:
			paint = Color(0.85, 0.62, 0.04)
		elif k == BUS:
			paint = Color(0.85, 0.82, 0.75)
		var sz: Vector3 = SIZES[k]
		var b := Basis(Vector3.UP, -yaw).scaled_local(sz)
		var list := _list(k, start)
		list[0].append(Transform3D(b, start))
		list[1].append(Color(k, (float(i) + _r(0.0, 0.4)) / n, speed * _r(0.97, 1.03), len))
		list[2].append(paint)


## Street lamps round the square and down the boulevard; trees along the boulevard's median
## (beyond the square: the stretcher rides out over it) and round the square's edge.
func _lamps_and_trees() -> void:
	var y := TitanCity.PLAZA_Y
	var e := TitanCity.SQ_X + 0.25
	var t := -e
	while t <= e:
		for p in [Vector3(t, y, e), Vector3(-e, y, t), Vector3(e, y, t)]:
			if absf(p.z) < 2.2 and absf(p.x) > 10.0:
				continue
			var to_c := atan2(-p.z, -p.x)
			_lamp(p, to_c)
		t += 1.35
	for sx in [-1.0, 1.0]:
		var x := 15.2
		while x < 62.0:
			for sz in [-1.0, 1.0]:
				_lamp(Vector3(sx * x, y, sz * 1.92), PI / 2.0 * -sz)
			x += 1.7
		x = 24.0
		while x < 70.0:
			_tree(Vector3(sx * (x + _r(-0.1, 0.1)), y, _r(-0.06, 0.06)), _r(0.62, 0.78))
			x += _r(0.62, 0.8)
	t = -e + 0.5
	while t <= e:
		if absf(t) > 2.4:
			_tree(Vector3(t, y, e + 0.45), _r(0.55, 0.72))
		t += _r(0.9, 1.3)


func _lamp(p: Vector3, yaw: float) -> void:
	_lamps[0].append(Transform3D(Basis(Vector3.UP, -yaw), p))
	_lamps[1].append(Color(LAMP, _rng.randf(), 0, 0))
	_lamps[2].append(Color.WHITE)


func _tree(p: Vector3, h: float) -> void:
	var w := h * _r(0.85, 1.1)
	_trees[0].append(Transform3D(Basis(Vector3.UP, _r(0, TAU)).scaled_local(Vector3(w, h, w)), p))
	_trees[1].append(Color(TREE, _rng.randf(), 0, 0))
	_trees[2].append(Color.WHITE)


## People watching from wherever they can: the pavements round the square behind the crowd, the
## quay, the front buildings' roofs.
func _onlookers(city: TitanCity) -> void:
	var y := TitanCity.PLAZA_Y
	for i in 340:
		var a := _r(0.0, TAU)
		var r := _r(13.5, 15.4)
		var p := Vector3(cos(a) * r, y, sin(a) * r)
		if p.z < TitanCity.QUAY_Z + 0.1 or absf(p.x) > 15.3 or p.z > 15.3:
			continue
		if absf(p.z) < 2.2 and absf(p.x) > 10.0:
			continue
		person(p, ONLOOKER)
	# along the quay's edge, looking back at the ring
	for i in 160:
		person(Vector3(_r(-13.0, 13.0), y, TitanCity.QUAY_Z + _r(0.08, 1.3)), ONLOOKER)
	# up on the roofs of the buildings round the square
	for s in city.roof_spots:
		for i in _rng.randi_range(1, 4):
			person(s + Vector3(_r(-0.25, 0.25), -0.12, _r(-0.25, 0.25)), ONLOOKER)


# ------------------------------------------------------------------ meshes

## A car: a body to the waist and a cabin with raked glass (unit box: x along, y up, z across).
func _car_mesh() -> TitanBuild:
	var b := TitanBuild.new()
	b.box(Vector3(-0.5, 0.0, -0.5), Vector3(0.5, 0.55, 0.5), Vector2.ZERO, Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, false)
	# the cabin: a trapezoid along x
	var lo := 0.55
	var hi := 1.0
	var z0 := 0.44
	var z1 := 0.38
	var f0 := 0.26
	var f1 := 0.06
	var r0 := -0.36
	var r1 := -0.24
	var pts := [Vector3(r0, lo, -z0), Vector3(f0, lo, -z0), Vector3(f1, hi, -z1), Vector3(r1, hi, -z1),
		Vector3(r0, lo, z0), Vector3(f0, lo, z0), Vector3(f1, hi, z1), Vector3(r1, hi, z1)]
	b.face(pts[0], pts[1], pts[2], pts[3], Vector3.FORWARD)
	b.face(pts[5], pts[4], pts[7], pts[6], Vector3.BACK)
	b.face(pts[1], pts[5], pts[6], pts[2], Vector3(hi - lo, f0 - f1, 0).normalized())
	b.face(pts[4], pts[0], pts[3], pts[7], Vector3(-(hi - lo), r1 - r0, 0).normalized())
	b.face(pts[3], pts[2], pts[6], pts[7], Vector3.UP)
	return b


## A van, a truck, an ambulance, a fire engine, a TV truck: a cab at the front (+x) and a body.
func _truck_mesh() -> TitanBuild:
	var b := TitanBuild.new()
	b.box(Vector3(0.28, 0.0, -0.5), Vector3(0.5, 0.74, 0.5), Vector2.ZERO, Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, false)
	b.box(Vector3(-0.5, 0.0, -0.5), Vector3(0.27, 1.0, 0.5), Vector2.ZERO, Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, false)
	return b


## A coach or a container: one long box.
func _bus_mesh() -> TitanBuild:
	var b := TitanBuild.new()
	b.box(Vector3(-0.5, 0.0, -0.5), Vector3(0.5, 1.0, 0.5), Vector2.ZERO, Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, false)
	return b


## A street lamp, 8 m: a pole, an arm out over the street (+x), the lamp's head.
func _lamp_mesh() -> TitanBuild:
	var b := TitanBuild.new()
	var h := 0.53
	b.box(Vector3(-0.006, 0.0, -0.006), Vector3(0.006, h, 0.006), Vector2.ZERO, Color.WHITE, Vector4.ZERO, Vector4.ZERO, false)
	b.beam(Vector3(0, h - 0.01, 0), Vector3(0.1, h + 0.005, 0), 0.006, 0.006)
	b.box(Vector3(0.08, h - 0.012, -0.014), Vector3(0.14, h + 0.004, 0.014), Vector2.ZERO, Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, true)
	return b


## A tree (unit height): a trunk and a crown of a dozen leafy faces.
func _tree_mesh() -> TitanBuild:
	var b := TitanBuild.new()
	b.tube(Vector3.ZERO, 0.045, 0.03, 0.0, 0.4, 4)
	var c := Vector3(0, 0.66, 0)
	var rx := 0.36
	var ry := 0.34
	var rings := [[-0.75, 0.62], [0.05, 1.0], [0.72, 0.62]]
	var segs := 6
	var base := b.v.size()
	b.vert(c + Vector3(0, -ry, 0), Vector3.DOWN)
	for r in rings:
		for i in segs:
			var a := TAU * (i + 0.5 * (rings.find(r) % 2)) / segs
			var p := c + Vector3(cos(a) * rx * r[1], ry * r[0], sin(a) * rx * r[1])
			b.vert(p, (p - c).normalized())
	b.vert(c + Vector3(0, ry * 1.05, 0), Vector3.UP)
	var top := b.v.size() - 1
	for i in segs:
		b.tri(base, base + 1 + i, base + 1 + (i + 1) % segs)
	for k in rings.size() - 1:
		var r0 := base + 1 + k * segs
		var r1 := base + 1 + (k + 1) * segs
		for i in segs:
			b.quad(r0 + i, r0 + (i + 1) % segs, r1 + (i + 1) % segs, r1 + i)
	var last := base + 1 + (rings.size() - 1) * segs
	for i in segs:
		b.tri(top, last + (i + 1) % segs, last + i)
	return b


## A person's card: a quad from the feet up (the shader turns it to the lens).
func _card_mesh() -> TitanBuild:
	var b := TitanBuild.new()
	var i0 := b.vert(Vector3(-0.5, 0, 0), Vector3.BACK, Vector2(0, 1))
	var i1 := b.vert(Vector3(0.5, 0, 0), Vector3.BACK, Vector2(1, 1))
	var i2 := b.vert(Vector3(0.5, 1, 0), Vector3.BACK, Vector2(1, 0))
	var i3 := b.vert(Vector3(-0.5, 1, 0), Vector3.BACK, Vector2(0, 0))
	b.quad(i0, i1, i2, i3)
	return b
