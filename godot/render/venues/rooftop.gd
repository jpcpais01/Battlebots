## Skydeck 88 (src/render/venues/rooftop.ts RooftopVenue): its tick, ported, with the world map's
## city below it (rooftop.ts cityBelow: map/city.ts, towers.ts, roads.ts). The deck's searchlights
## sweep the sky and the masts' red lights blink; down in the city the mega towers' searchlights
## sweep, the maglev train runs its loop, the Ferris wheel and the wind turbines turn, the
## lighthouse lamp spins and the lift climbs its hill. The bake read each back from the web's own
## objects and checked it (venues_bake.ts rooftopAnim). Left still: the hologram robot's pose.
extends OutdoorVenue

## Per deck searchlight: node, phase.
var _beams: Array = []
## Per steady turn: node, axis (0 x, 1 y, 2 z), rate, rotation at 0.
var _spins: Array = []
## Per city MultiMesh: the bake's record, its MultiMesh, its node's placement.
var _inst: Array = []
var _beacons: Node3D
var _train: Dictionary = {}
var _train_mm: MultiMesh
var _train_glow: MultiMesh
var _train_pts := PackedVector3Array()
var _lift: Node3D
var _lift_pts := PackedVector3Array()


func _setup() -> void:
	for b in anim.get("beams", []):
		var n := node(b.name)
		if n:
			_beams.append([n, float(b.ph)])
	for s in anim.get("spins", []):
		var n := node(s.name)
		if n:
			_spins.append([n, int(s.axis), float(s.rate), Vector3(s.rot[0], s.rot[1], s.rot[2])])
	for r in anim.get("inst", []):
		var n := node(r.name) as MultiMeshInstance3D
		if n:
			_inst.append([r, n.multimesh, inst_base.get(r.name, Transform3D.IDENTITY)])
	_beacons = node("beacons")
	_train = anim.get("train", {})
	if not _train.is_empty():
		var tm := node(_train.name) as MultiMeshInstance3D
		var tg := node(_train.get("glow", "")) as MultiMeshInstance3D
		_train_mm = tm.multimesh if tm else null
		_train_glow = tg.multimesh if tg else null
		_train_pts = _vec3s(_train.pts)
	var lift: Dictionary = anim.get("lift", {})
	if not lift.is_empty():
		_lift = node(lift.name)
		_lift_pts = _vec3s(lift.pts)


static func _vec3s(a: Array) -> PackedVector3Array:
	var out := PackedVector3Array()
	out.resize(a.size() / 3)
	for i in out.size():
		out[i] = Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2])
	return out


func _tick(_dt: float, t: float) -> void:
	# rooftop.ts searchlights
	for b in _beams:
		var ph: float = b[1]
		b[0].basis = euler_yxz(0.42 + 0.2 * sin(t * 0.23 + ph * 2.0), t * 0.13 + ph, 0.0)
	# rooftop.ts beacons: blinking together
	if _beacons:
		_beacons.visible = fmod(t, 1.6) < 0.5
	# city.ts wheel (the turning rim) and lighthouseBeam (the lamp's spin)
	for s in _spins:
		var r: Vector3 = s[3]
		r[s[1]] += s[2] * t
		s[0].basis = euler_xyz(r.x, r.y, r.z)
	for e in _inst:
		_inst_tick(e[0], e[1], e[2], t)
	if _train_mm:
		_train_tick(t)
	if _lift:
		# roads.ts lift: up, wait, down, wait, a 70 s round trip
		var k := fmod(t, 70.0) / 0.25
		var i := mini(int(k), _lift_pts.size() - 2)
		_lift.position = _lift_pts[i].lerp(_lift_pts[i + 1], k - i)


func _inst_tick(r: Dictionary, mm: MultiMesh, base: Transform3D, t: float) -> void:
	match r.kind:
		"sweep":
			# towers.ts searchlights: a slow sweep round, leaning out and back
			var ps: Array = r.p
			var phs: Array = r.ph
			for i in mini(ps.size(), mm.instance_count):
				var ph: float = phs[i]
				var b := euler_yxz(0.32 + 0.14 * sin(t * 0.21 + ph * 2.0), t * 0.12 + ph, 0.0)
				mm.set_instance_transform(i, base * Transform3D(b, Vector3(ps[i][0], ps[i][1], ps[i][2])))
		"rotor":
			# city.ts rotors
			var ps: Array = r.p
			var a0: Array = r.a0
			for i in mini(ps.size(), mm.instance_count):
				mm.set_instance_transform(i, base * Transform3D(Basis(Vector3.BACK, t * 0.9 + float(a0[i])), Vector3(ps[i][0], ps[i][1], ps[i][2])))
		"gondola":
			# city.ts wheel: the gondolas round the rim
			var rad: float = r.r
			var n := mm.instance_count
			for k in n:
				var a := t * 0.05 + float(k) / n * TAU
				mm.set_instance_transform(k, base * Transform3D(Basis.IDENTITY, Vector3(cos(a) * rad, rad + 4.0 + sin(a) * rad, 0.0)))


## city.ts Train: six cars round the maglev loop at 24 m/s, each with its strip of light.
func _train_tick(t: float) -> void:
	var length: float = _train.len
	var ds: float = _train.ds
	var n := _train_pts.size()
	var base: Transform3D = inst_base.get(_train.name, Transform3D.IDENTITY)
	for i in mini(6, _train_mm.instance_count):
		var s := fposmod(t * 24.0 - i * (15.0 + 0.8), length)
		var a := _train_at(s / ds, n)
		var b := _train_at(fposmod(s + 2.0, length) / ds, n)
		var rot := Basis(Vector3.UP, -atan2(b.z - a.z, b.x - a.x))
		_train_mm.set_instance_transform(i, base * Transform3D(rot, a + Vector3(0.0, 1.8, 0.0)))
		if _train_glow and i < _train_glow.instance_count:
			_train_glow.set_instance_transform(i, base * Transform3D(rot, a + Vector3(0.0, 0.2, 0.0)))


func _train_at(k: float, n: int) -> Vector3:
	var i := int(k)
	return _train_pts[i % n].lerp(_train_pts[(i + 1) % n], k - i)
