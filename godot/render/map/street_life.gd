## The city's street life and roof clutter, which the web map doesn't have (its traffic is only
## points of light): cars, vans and taxis driving the traffic's own lanes, buses in the avenues'
## bus lanes, cars parked in the streets' bays, people walking the pavements, and condensers, air
## handlers and stair housings on the roofs (some roofs given solar panels instead, drawn by the
## building shader), with every one's shadow on the ground. Made from the bake's own tables when
## the world map is built: the traffic, the buildings, the terrain's street grid. Four draws:
## vehicles, walkers, roof kit and shadows; WorldMap shows them only nearer than SHOW_DIST, past
## which they're all smaller than a pixel.
##
## Vehicles and walkers move in their shaders (shaders/map_life.gdshaderinc). Their instance
## transforms aren't placements but numbers for those shaders (full floats on every renderer,
## where instance colours aren't): see _vehicle and _walker.
class_name StreetLife
extends Node3D

## Shown when the map's camera is nearer than this (m).
const SHOW_DIST := 900.0
## layout.ts CITY_Y: the city's ground.
const CITY_Y := 3.2
## A bridge's deck is this far over the street (plan.ts bridges: CITY_Y + 1.4).
const DECK := 1.4
## Vehicle kinds (map_life.gdshaderinc lifeDims): car, taxi, van, bus; and their lengths.
const CAR := 0
const TAXI := 1
const VAN := 2
const BUS := 3
const LENGTH := [4.4, 4.4, 5.3, 12.0]
## The shadow shader's kinds for walkers and roof kit.
const WALKER := 10
const KIT := 20
## Roof kit: condenser, air handler, stair housing.
const CONDENSER := 0
const HANDLER := 1
const HOUSING := 2
## The city: everything here stays inside this (the draws' bounds).
const BOUNDS := AABB(Vector3(-700, -40, -800), Vector3(1400, 400, 1400))

const DIR := "res://render/map/shaders/"

## How many of each there are (for the report and tests).
var counts := {}

var _rng := RandomNumberGenerator.new()
# the traffic's lanes, read and evened out in prepare(): per lane [A, B, offset, speed, phases]
var _lanes: Array = []
var _shadows := PackedFloat32Array()
var _shadow_n := 0
var _ground_tex: Texture2D
var _ground_k := Vector3(1600, 12.5, 257)
var _ground: Callable
# street-level buildings by 24 m cell: "i,j" -> [Rect2...]
var _cells := {}


# ---------------------------------------------------------------- the traffic's lanes

## Before the map's nodes are built: even out the traffic (city.ts traffic gives every car its own
## speed, so they drive through each other): every lane's cars take its average speed and are
## spaced along it, so they never meet. Written back into the bake, so the lights the web draws
## (traffic.gdshader) ride on the bodies drawn here.
func prepare(scene: BakedScene) -> void:
	_rng.seed = 88
	for n in scene.json.nodes:
		if not n.has("geometry") or _kind(scene, n) != "traffic":
			continue
		var at: Dictionary = scene.json.geometries[int(n.geometry)].attributes
		var a := scene.floats(int(at.aA.buffer))
		var b := scene.floats(int(at.aB.buffer))
		var car_id := int(at.aCar.buffer)
		var car := scene.floats(car_id)
		var lanes := {}
		for i in car.size() / 4:
			if car[i * 4 + 3] >= 2.0:
				continue
			var key := "%d,%d,%d,%d,%.1f" % [roundi(a[i * 2]), roundi(a[i * 2 + 1]), roundi(b[i * 2]), roundi(b[i * 2 + 1]), car[i * 4 + 2]]
			if not lanes.has(key):
				lanes[key] = []
			lanes[key].append(i)
		for key in lanes:
			var list: Array = lanes[key]
			var i0: int = list[0]
			var A := Vector2(a[i0 * 2], a[i0 * 2 + 1])
			var B := Vector2(b[i0 * 2], b[i0 * 2 + 1])
			var L := A.distance_to(B)
			var speed := 0.0
			for i in list:
				speed += car[i * 4 + 1]
			speed /= list.size()
			# the bodies: a car's length and room to spare between each; any more just add
			# their lights to one in front
			var keep := mini(list.size(), int(L / 24.0))
			var phases := PackedFloat32Array()
			var start := _rng.randf()
			var room := 1.0 - 10.0 * keep / L
			for k in keep:
				phases.append(fposmod(start + (k + (_rng.randf() - 0.5) * room) / keep, 1.0))
			for k in list.size():
				var i: int = list[k]
				car[i * 4] = phases[k % keep]
				car[i * 4 + 1] = speed
			_lanes.append([A, B, car[i0 * 4 + 2], speed, phases])
		scene.set_floats(car_id, car)
		return


static func _kind(scene: BakedScene, n: Dictionary) -> String:
	for m in n.get("materials", []):
		return str(scene.json.materials[int(m)].get("kind", ""))
	return ""


# ---------------------------------------------------------------- building it all

## Make it all (WorldMap._finish, before the bake's buffers go): `buildings` the city's
## buildings MultiMesh (its roofs' solar panels are marked in it here), `signs` the neon signs'
## (kept clear of), `terrain` the terrain material (its street grid uniforms), `ground` a
## ground_at(x, z) callable and its grid (heights, n, cell, half).
func build(buildings: MultiMesh, signs: MultiMesh, terrain: ShaderMaterial, ground: Callable, grid: PackedFloat32Array, gn: int, gcell: float, ghalf: float) -> void:
	name = "street_life"
	_ground = ground
	_ground_k = Vector3(ghalf, gcell, gn)
	var img := Image.create_from_data(gn, gn, false, Image.FORMAT_RF, grid.to_byte_array())
	img.convert(Image.FORMAT_RH)
	_ground_tex = ImageTexture.create_from_image(img)
	var boxes := _boxes(buildings)
	for b in boxes:
		if float(b[1]) < CITY_Y + 0.5:
			var r: Rect2 = b[0]
			for i in range(floori(r.position.x / 24.0), floori(r.end.x / 24.0) + 1):
				for j in range(floori(r.position.y / 24.0), floori(r.end.y / 24.0) + 1):
					var key := "%d,%d" % [i, j]
					if not _cells.has(key):
						_cells[key] = []
					_cells[key].append(r)
	var streets := _streets(terrain)
	var vehicles := PackedFloat32Array()
	var nv := 0
	nv += _drive(vehicles)
	nv += _buses(vehicles, streets)
	var moving := nv
	nv += _park(vehicles, streets)
	counts.vehicles = moving
	counts.parked = nv - moving
	var walkers := PackedFloat32Array()
	counts.walkers = _walk(walkers, streets)
	var kit := PackedFloat32Array()
	counts.kit = _roofs(kit, buildings, boxes, signs)
	var vm := _multimesh(_car_mesh(), vehicles, nv, false)
	add_child(_draw("vehicles", vm, "life_vehicle"))
	add_child(_draw("walkers", _multimesh(_quad_mesh(), walkers, counts.walkers, false), "life_walker"))
	add_child(_draw("roof_kit", _multimesh(_box_mesh(), kit, counts.kit, true), "life_kit"))
	# every one's shadow in one draw: the vehicles' and walkers' numbers again, then the kit's
	var sh := vehicles.duplicate()
	sh.append_array(walkers)
	sh.append_array(_shadows)
	var sm := _multimesh(_hex_mesh(), sh, nv + counts.walkers + _shadow_n, false)
	var sd := _draw("shadows", sm, "life_shadow")
	add_child(sd)


func _draw(id: String, mm: MultiMesh, shader: String) -> MultiMeshInstance3D:
	var mmi := MultiMeshInstance3D.new()
	mmi.name = id
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var m := ShaderMaterial.new()
	m.shader = load(DIR + shader + ".gdshader")
	m.set_shader_parameter("uGround", _ground_tex)
	m.set_shader_parameter("uGroundK", _ground_k)
	mmi.material_override = m
	return mmi


func _multimesh(mesh: Mesh, buf: PackedFloat32Array, count: int, extra: bool) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = extra
	mm.use_custom_data = extra
	mm.mesh = mesh
	mm.instance_count = count
	if count > 0:
		mm.buffer = buf
	# (the instances move in the shader: they're all somewhere in the city)
	mm.custom_aabb = BOUNDS
	return mm


## Instance numbers, as the shaders read them from MODEL_MATRIX's columns 0..3.
static func _put(buf: PackedFloat32Array, c0: Vector3, c1: Vector3, c2: Vector3, c3: Vector3) -> void:
	buf.append_array([c0.x, c1.x, c2.x, c3.x, c0.y, c1.y, c2.y, c3.y, c0.z, c1.z, c2.z, c3.z])


# ---------------------------------------------------------------- vehicles

## One vehicle: on the street from A along d (to B), `off` across it (its sign: which way it
## drives), at `phase` of the way along at time 0 and `speed` m/s (0: parked); a bridge's deck
## from b0 to b1 m along it.
func _vehicle(buf: PackedFloat32Array, a: Vector2, d: Vector2, off: float, phase: float, speed: float, kind: int, b0 := 0.0, b1 := 0.0) -> void:
	_put(buf, Vector3(d.x, d.y, off), Vector3(phase, speed, kind), Vector3(_rng.randf(), b0, b1), Vector3(a.x, CITY_Y, a.y))


## The traffic's own cars (as prepare() spaced them), a bridge's deck where a lane crosses the river.
func _drive(buf: PackedFloat32Array) -> int:
	var n := 0
	for lane in _lanes:
		var a: Vector2 = lane[0]
		var d: Vector2 = (lane[1] as Vector2) - a
		var br := _bridge(a, d)
		for ph in lane[4]:
			var r := _rng.randf()
			_vehicle(buf, a, d, lane[2], ph, lane[3], TAXI if r < 0.09 else VAN if r < 0.2 else CAR, br.x, br.y)
			n += 1
	return n


## Where a street crosses the river (the ground under it dips below the water's edge): the
## deck's start and end, metres along it (0, 0: none).
func _bridge(a: Vector2, d: Vector2) -> Vector2:
	var L := d.length()
	var lo := INF
	var hi := -INF
	var s := 0.0
	while s < L:
		var p := a + d * (s / L)
		if float(_ground.call(p.x, p.y)) < 2.0:
			lo = minf(lo, s)
			hi = maxf(hi, s)
		s += 2.0
	return Vector2(lo - 10.0, hi + 10.0) if hi > lo else Vector2.ZERO


## Buses in the avenues' bus lanes (the outer lane each way), a bus every 140 m or so.
func _buses(buf: PackedFloat32Array, streets: Array) -> int:
	var n := 0
	for st in streets:
		if not st.avenue:
			continue
		var d: Vector2 = st.b - st.a
		var L := d.length()
		var br := _bridge(st.a, d)
		for side in [-1.0, 1.0]:
			var k := int(L / 140.0)
			var start := _rng.randf()
			for i in k:
				_vehicle(buf, st.a, d, side * 8.3, fposmod(start + (i + (_rng.randf() - 0.5) * 0.5) / maxf(1.0, k), 1.0), 9.0, BUS, br.x, br.y)
				n += 1
	return n


## Cars parked in the streets' bays (both kerbs, a bay every 6 m, a little over half taken),
## none near the junctions, over the river or where a building comes out to the kerb.
func _park(buf: PackedFloat32Array, streets: Array) -> int:
	var n := 0
	for st in streets:
		if st.avenue:
			continue
		var d: Vector2 = st.b - st.a
		var L := d.length()
		var dir := d / L
		var across := Vector2(-dir.y, dir.x)
		for side in [-1.0, 1.0]:
			var s := 3.0
			while s < L - 3.0:
				var p: Vector2 = st.a + dir * s + across * side * 5.4
				if _rng.randf() < 0.58 and not _near_junction(st, s) and _clear(p, 3.4) and float(_ground.call(p.x, p.y)) > 2.6:
					var q := s + (_rng.randf() - 0.5) * 0.6
					_vehicle(buf, st.a, d, side * 5.4, q / L, 0.0, VAN if _rng.randf() < 0.12 else CAR)
					n += 1
				s += 6.0
	return n


static func _near_junction(st: Dictionary, s: float) -> bool:
	for c in st.cross:
		if absf(s - float(c[0])) < float(c[1]) + 8.0:
			return true
	return false


## Nothing (no building at street level) within r (at most 24 m) of p.
func _clear(p: Vector2, r: float) -> bool:
	for i in range(floori((p.x - r) / 24.0), floori((p.x + r) / 24.0) + 1):
		for j in range(floori((p.y - r) / 24.0), floori((p.y + r) / 24.0) + 1):
			for b in _cells.get("%d,%d" % [i, j], []):
				if (b as Rect2).grow(r).has_point(p):
					return false
	return true


# ---------------------------------------------------------------- the street grid

## The terrain's street grid (terrain.gdshader gridLine): every street with its ends, whether
## it's an avenue, and where the streets crossing it are (metres along it, their half width).
func _streets(terrain: ShaderMaterial) -> Array:
	var grid: Vector4 = terrain.get_shader_parameter("uGrid")
	var width: Vector2 = terrain.get_shader_parameter("uStreet")
	var k: Vector4 = terrain.get_shader_parameter("uLineK")
	var lines: Array = terrain.get_shader_parameter("uLines")
	var out := []
	for axis in 2:
		var count := int(k.z if axis == 0 else k.w)
		for i in count:
			var L: Vector4 = lines[i + (0 if axis == 0 else int(k.z))]
			if L.y <= L.x:
				continue
			var c := (grid.x if axis == 0 else grid.y) + ((k.x if axis == 0 else k.y) + i) * grid.z
			# (x lines run along z, z lines along x)
			var a := Vector2(c, L.x) if axis == 0 else Vector2(L.x, c)
			var b := Vector2(c, L.y) if axis == 0 else Vector2(L.y, c)
			out.append({"a": a, "b": b, "avenue": L.z > 0.5, "hw": width.y if L.z > 0.5 else width.x, "axis": axis, "c": c, "cross": []})
	for st in out:
		for o in out:
			if o.axis == st.axis:
				continue
			# o crosses st where st's coordinate along runs into o's line
			var along: float = st.a.y if st.axis == 0 else st.a.x
			var o_lo: float = o.a.y if o.axis == 0 else o.a.x
			var o_hi: float = o.b.y if o.axis == 0 else o.b.x
			if float(st.c) >= o_lo - 1.0 and float(st.c) <= o_hi + 1.0:
				st.cross.append([float(o.c) - along, float(o.hw)])
	return out


# ---------------------------------------------------------------- people

## People walking the pavements: up and down a stretch of pavement each (and across the side
## streets on the way), at their own pace; none over the river's bridges (no pavements there) or
## where a building stands on the pavement.
func _walk(buf: PackedFloat32Array, streets: Array) -> int:
	var n := 0
	for st in streets:
		var d: Vector2 = st.b - st.a
		var L := d.length()
		var dir := d / L
		var across := Vector2(-dir.y, dir.x)
		for side in [-1.0, 1.0]:
			# the stretches of pavement that are clear, 4 m at a time
			var runs := []
			var s0 := -1.0
			var s := 0.0
			while s <= L:
				var p: Vector2 = st.a + dir * s + across * side * (float(st.hw) + 1.8)
				var ok := _clear(p, 1.2) and float(_ground.call(p.x, p.y)) > 2.6
				if ok and s0 < 0.0:
					s0 = s
				elif not ok and s0 >= 0.0:
					runs.append(Vector2(s0, s - 4.0))
					s0 = -1.0
				s += 4.0
			if s0 >= 0.0:
				runs.append(Vector2(s0, L))
			for r in runs:
				var len: float = r.y - r.x
				if len < 12.0:
					continue
				# busier on the avenues
				var k := int(len / (11.0 if st.avenue else 17.0))
				for i in k:
					var lane: float = float(st.hw) + 0.7 + _rng.randf() * 2.4
					var a: Vector2 = st.a + dir * r.x + across * side * lane
					var span := minf(len, 25.0 + _rng.randf() * 90.0)
					var at := _rng.randf() * (len - span)
					a += dir * at
					var g := float(_ground.call(a.x, a.y))
					_put(buf, Vector3(dir.x * span, dir.y * span, 0.0), Vector3(_rng.randf() * 2.0, 1.1 + _rng.randf() * 0.5, WALKER), Vector3(_rng.randf(), 0.0, 0.0), Vector3(a.x, g, a.y))
					n += 1
	return n


# ---------------------------------------------------------------- roofs

## The buildings as [Rect2 footprint, base y, top y, style, index]; rooftop kit (style 5) too.
static func _boxes(mm: MultiMesh) -> Array:
	var out := []
	var b := mm.buffer
	var stride := 20
	for i in mm.instance_count:
		var o := i * stride
		var sx := b[o]
		var sz := b[o + 10]
		out.append([Rect2(b[o + 3] - sx * 0.5, b[o + 11] - sz * 0.5, sx, sz), b[o + 7], b[o + 7] + b[o + 5], b[o + 16], i])
	return out


## Kit on the flat roofs: a stair housing, an air handler on the big ones, a row or two of
## condensers; solar panels over part of some roofs instead (the building shader draws them,
## from the roof number written here). Clear of the kit and signs already up there.
func _roofs(buf: PackedFloat32Array, mm: MultiMesh, boxes: Array, signs: MultiMesh) -> int:
	var n := 0
	var sign_at := []
	if signs != null:
		for i in signs.instance_count:
			var t := signs.get_instance_transform(i)
			sign_at.append([Vector2(t.origin.x, t.origin.z), maxf(t.basis.x.length(), t.basis.z.length()) * 0.5 + 1.0, t.origin.y])
	var kits := boxes.filter(func(o) -> bool: return float(o[3]) > 4.5)
	# (the buildings' numbers, read and written in the buffer: the renderer keeps them there)
	var data := mm.buffer
	for bx in boxes:
		var i: int = bx[4]
		var style: float = bx[3]
		if style > 3.5 or data[i * 20 + 19] > 0.5:
			continue
		var r: Rect2 = bx[0]
		var top: float = bx[2]
		if r.size.x < 9.0 or r.size.y < 9.0:
			continue
		# what's up there already: rooftop kit boxes standing on this roof, signs over it
		var taken: Array[Rect2] = []
		for o in kits:
			if absf(float(o[1]) - top) < 0.6 and r.intersects(o[0]):
				taken.append((o[0] as Rect2).grow(0.8))
		for sg in sign_at:
			if r.grow(1.0).has_point(sg[0]) and float(sg[2]) > top - 1.0 and float(sg[2]) < top + 14.0:
				taken.append(Rect2(sg[0] - Vector2.ONE * sg[1], Vector2.ONE * 2.0 * sg[1]))
		var area := r.size.x * r.size.y
		var inner := r.grow(-1.8)
		# solar panels over the first part of some roofs (x from the west edge)
		if area > 260.0 and _rng.randf() < 0.42:
			var s := 0.35 + _rng.randf() * 0.3
			var pv := Rect2(r.position + Vector2(1.8, 1.8), Vector2((r.size.x - 3.6) * s, r.size.y - 3.6))
			var free := true
			for t in taken:
				if t.intersects(pv):
					free = false
			if free:
				data[i * 20 + 19] = 3.0 + s
				taken.append(pv.grow(0.6))
		var col := Color(data[i * 20 + 12], data[i * 20 + 13], data[i * 20 + 14])
		var tall := top - CITY_Y
		# a stair housing (on buildings tall enough to have a lift), in a corner
		if tall > 12.0:
			n += _place(buf, inner, taken, Vector3(3.4 + _rng.randf(), 2.8 + _rng.randf() * 0.8, 3.0 + _rng.randf()), top, HOUSING, col, r, true)
		# an air handler on the bigger roofs
		if area > 320.0:
			n += _place(buf, inner, taken, Vector3(4.5 + _rng.randf() * 2.0, 1.8 + _rng.randf() * 0.5, 2.2 + _rng.randf() * 0.6), top, HANDLER, Color(0.6, 0.61, 0.6), r, false)
		# condensers, in a row
		var rows := clampi(int(area / 260.0), 1, 3)
		for k in rows:
			var units := 2 + _rng.randi() % 4
			var size := Vector3(1.35, 1.1, 1.25)
			n += _row(buf, inner, taken, size, units, top, r)
	mm.buffer = data
	return n


## Put one box (size w, h, d) somewhere free on the roof (a few tries; corner: start from one).
func _place(buf: PackedFloat32Array, inner: Rect2, taken: Array[Rect2], size: Vector3, top: float, kind: int, col: Color, roof: Rect2, corner: bool) -> int:
	for t in 8:
		var fp := Vector2(size.x, size.z)
		if inner.size.x < fp.x or inner.size.y < fp.y:
			return 0
		var p: Vector2
		if corner and t < 4:
			p = inner.position + Vector2(0 if t % 2 == 0 else inner.size.x - fp.x, 0 if t < 2 else inner.size.y - fp.y)
		else:
			p = inner.position + Vector2(_rng.randf() * (inner.size.x - fp.x), _rng.randf() * (inner.size.y - fp.y))
		var rect := Rect2(p, fp)
		if _free(rect, taken):
			taken.append(rect.grow(0.7))
			_kit(buf, rect, size.y, top, kind, col, roof)
			return 1
	return 0


## A row of `units` condensers side by side.
func _row(buf: PackedFloat32Array, inner: Rect2, taken: Array[Rect2], size: Vector3, units: int, top: float, roof: Rect2) -> int:
	var along_x := _rng.randf() < 0.5
	var gap := 0.45
	var span := units * size.x + (units - 1) * gap
	var fp := Vector2(span, size.z) if along_x else Vector2(size.z, span)
	for t in 8:
		if inner.size.x < fp.x or inner.size.y < fp.y:
			return 0
		var p := inner.position + Vector2(_rng.randf() * (inner.size.x - fp.x), _rng.randf() * (inner.size.y - fp.y))
		var rect := Rect2(p, fp)
		if not _free(rect, taken):
			continue
		taken.append(rect.grow(0.8))
		for u in units:
			var o := u * (size.x + gap)
			var unit := Rect2(p + (Vector2(o, 0) if along_x else Vector2(0, o)), Vector2(size.x, size.z) if along_x else Vector2(size.z, size.x))
			_kit(buf, unit, size.y, top, CONDENSER, Color(0.78, 0.78, 0.74), roof)
		return units
	return 0


static func _free(r: Rect2, taken: Array[Rect2]) -> bool:
	for t in taken:
		if t.intersects(r):
			return false
	return true


## One piece of kit: its box (a real placement: the kit shader is a plain box shader), its
## colour and kind, and its shadow (clipped to its roof).
func _kit(buf: PackedFloat32Array, r: Rect2, h: float, top: float, kind: int, col: Color, roof: Rect2) -> void:
	var c := r.get_center()
	buf.append_array([r.size.x, 0, 0, c.x, 0, h, 0, top, 0, 0, r.size.y, c.y])
	buf.append_array([col.r, col.g, col.b, 1.0])
	buf.append_array([kind, _rng.randf(), 0, 0])
	# the shadow's numbers: size, kind, the roof it falls on
	_put(_shadows, Vector3(r.size.x, h, r.size.y), Vector3(roof.end.y, 0, KIT), Vector3(roof.position.x, roof.position.y, roof.end.x), Vector3(c.x, top, c.y))
	_shadow_n += 1


# ---------------------------------------------------------------- meshes

## A box's five faces (no bottom) from corners lo..hi, outward; UV: part, face (0 top, 1 side,
## 3 front +z, 4 back -z).
static func _box(st: SurfaceTool, lo: Vector3, hi: Vector3, part: float) -> void:
	var c := [
		[Vector3(lo.x, hi.y, hi.z), Vector3(hi.x, hi.y, hi.z), Vector3(hi.x, hi.y, lo.z), Vector3(lo.x, hi.y, lo.z), 0.0],
		[Vector3(hi.x, lo.y, hi.z), Vector3(hi.x, lo.y, lo.z), Vector3(hi.x, hi.y, lo.z), Vector3(hi.x, hi.y, hi.z), 1.0],
		[Vector3(lo.x, lo.y, lo.z), Vector3(lo.x, lo.y, hi.z), Vector3(lo.x, hi.y, hi.z), Vector3(lo.x, hi.y, lo.z), 2.0],
		[Vector3(lo.x, lo.y, hi.z), Vector3(hi.x, lo.y, hi.z), Vector3(hi.x, hi.y, hi.z), Vector3(lo.x, hi.y, hi.z), 3.0],
		[Vector3(hi.x, lo.y, lo.z), Vector3(lo.x, lo.y, lo.z), Vector3(lo.x, hi.y, lo.z), Vector3(hi.x, hi.y, lo.z), 4.0],
	]
	for f in c:
		var uv := Vector2(part, f[4])
		# (each face's corners anticlockwise from outside; Godot's front faces wind clockwise)
		for k in [0, 2, 1, 0, 3, 2]:
			st.set_uv(uv)
			st.add_vertex(f[k])


## A vehicle: a body and a cabin on it, in unit numbers the vehicle shader shapes per kind
## (x: -0.5..0.5 across, y: 0 bottom 1 top of each part, z: -0.5 back .. 0.5 front).
static func _car_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_box(st, Vector3(-0.5, 0, -0.5), Vector3(0.5, 1, 0.5), 0.0)
	_box(st, Vector3(-0.5, 0, -0.5), Vector3(0.5, 1, 0.5), 1.0)
	var m := st.commit()
	m.custom_aabb = BOUNDS
	return m


## A box from (-0.5, 0, -0.5) to (0.5, 1, 0.5).
static func _box_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_box(st, Vector3(-0.5, 0, -0.5), Vector3(0.5, 1, 0.5), 0.0)
	return st.commit()


## A walker's card: x -0.5..0.5, y 0..1.
static func _quad_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for v in [Vector3(-0.5, 0, 0), Vector3(0.5, 1, 0), Vector3(0.5, 0, 0), Vector3(-0.5, 0, 0), Vector3(-0.5, 1, 0), Vector3(0.5, 1, 0)]:
		st.add_vertex(v)
	var m := st.commit()
	m.custom_aabb = BOUNDS
	return m


## A shadow: six corners (x: which), fanned from the first (life_shadow.gdshader places them).
static func _hex_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for t in [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]]:
		for k in t:
			st.add_vertex(Vector3(k, 0, 0))
	var m := st.commit()
	m.custom_aabb = BOUNDS
	return m
