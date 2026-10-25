## The titan city's layout and its meshes (render/titan): a harbour city round a great square,
## built at the titans' scale (one unit is 15 m). The Titan Ring stands in the middle of the
## square; the square runs down to the quay on the north side, where the harbour opens out to
## the sea and the evening sun; a grand boulevard crosses it east to west (the stretcher takes
## the loser away down it); the city's blocks crowd round the other three sides, low old
## buildings along the square (the titans look over their roofs), taller ones behind, the
## towers of downtown off to the south-east.
##
## Streets are a grid: blocks PITCH apart, BLOCK wide, the streets between them 1.6 (24 m).
## The ground is one shader (titan_ground: the square's paving, the roads and their markings,
## the pavements, the boulevard's gardens, the quay) on a few big quads; the buildings are boxes
## whose facades are drawn by titan_facade. Everything is laid out from one fixed seed, so the
## city is the same every fight (and the camera knows where the roofs are).
class_name TitanCity
extends RefCounted

const PITCH := 9.6
const BLOCK := 8.0
const PLAZA_Y := -0.62
## The quay's edge (the water beyond it) and the water's level.
const QUAY_Z := -15.2
const WATER_Y := -0.84
## The square: its paving (|x| <= SQ_X, SQ_N <= z <= SQ_S), the ring road round it out to the
## blocks.
const SQ_X := 13.6
const SQ_S := 13.6
const SQ_N := -13.6
## The boulevard: |z| <= BLVD across, its median garden |z| <= MEDIAN.
const BLVD := 1.9
const MEDIAN := 0.42
## The far shore across the harbour (the container terminal, the hills behind) and where the
## harbour mouth opens to the sea (west of MOUTH_X).
const FAR_Z := -62.0
const MOUTH_X := -58.0
## How far the built city goes, in blocks either side and south.
const I_MAX := 8
const J_MAX := 10
## One storey (3.3 m) and a tall ground floor (4.5 m).
const STOREY := 0.22
const GROUND_FLOOR := 0.3
## titan_facade.gdshader styles.
const S_CLASSIC := 0.0
const S_PASTEL := 1.0
const S_BRICK := 2.0
const S_OFFICE := 3.0
const S_GLASS := 4.0
const S_SHED := 5.0
## Downtown's towers stand round here.
const DOWNTOWN := Vector2(42.0, 62.0)

const PASTELS := [Color(0.85, 0.62, 0.32), Color(0.86, 0.5, 0.42), Color(0.9, 0.82, 0.62), Color(0.93, 0.78, 0.45), Color(0.55, 0.7, 0.82), Color(0.62, 0.78, 0.66), Color(0.92, 0.9, 0.85), Color(0.78, 0.55, 0.6)]
const STONES := [Color(0.8, 0.74, 0.62), Color(0.72, 0.68, 0.6), Color(0.86, 0.82, 0.72), Color(0.66, 0.6, 0.52)]
const BRICKS := [Color(0.55, 0.25, 0.17), Color(0.45, 0.22, 0.16), Color(0.62, 0.36, 0.24)]
const CONCRETE := [Color(0.62, 0.62, 0.6), Color(0.52, 0.53, 0.55), Color(0.7, 0.68, 0.64)]
const GLASS := [Color(0.25, 0.38, 0.45), Color(0.3, 0.34, 0.4), Color(0.2, 0.3, 0.32), Color(0.42, 0.4, 0.36)]

## Every building: [lo (Vector3), hi (Vector3), style, seed, colour, roof (0 flat, 1 pitched)].
var buildings: Array = []
## Roofs a camera can stand on, facing the square: [position of the lens, the building's top].
var roof_spots: Array[Vector3] = []
var _rng := RandomNumberGenerator.new()


func _init() -> void:
	_rng.seed = 0x7174a2
	_layout()


## Whether block (i, j) is built on (the square, the water and the far blocks are not).
static func has_block(i: int, j: int) -> bool:
	if j < -1:
		return false
	if absi(i) <= 1 and j <= 1:
		return false
	return absi(i) <= I_MAX and j <= J_MAX


func _r(a: float, b: float) -> float:
	return _rng.randf_range(a, b)


func _pick(list: Array):
	return list[_rng.randi() % list.size()]


func _layout() -> void:
	for j in range(-1, J_MAX + 1):
		for i in range(-I_MAX, I_MAX + 1):
			if not has_block(i, j):
				continue
			var cx := i * PITCH
			var cz := j * PITCH
			var lo := Vector2(cx - BLOCK * 0.5 + 0.25, cz - BLOCK * 0.5 + 0.25)
			var hi := Vector2(cx + BLOCK * 0.5 - 0.25, cz + BLOCK * 0.5 - 0.25)
			if j == 0:
				# the boulevard runs through this row: a strip of buildings either side of it
				_strip(Rect2(lo.x, lo.y, hi.x - lo.x, -BLVD - 0.25 - lo.y), i, j, 1)
				_strip(Rect2(lo.x, BLVD + 0.25, hi.x - lo.x, hi.y - BLVD - 0.25), i, j, -1)
				continue
			var d := Vector2(cx, cz).distance_to(DOWNTOWN)
			if d < 26.0 and _rng.randf() < 0.85:
				_tower_block(Rect2(lo, hi - lo), d)
			else:
				_perimeter_block(Rect2(lo, hi - lo), i, j)


## How tall the city stands at block (i, j), in storeys: low and old round the square, rising
## away from it and towards downtown.
func _storeys(i: int, j: int) -> int:
	var ring := maxi(absi(i) - 1, j - 1)
	var front := (absi(i) == 2 and j <= 1) or (j == 2 and absi(i) <= 2)
	if front:
		return _rng.randi_range(4, 7)
	if j == -1:
		# the harbour front: warehouses and a few newer blocks
		return _rng.randi_range(3, 6)
	var base := 5 + ring
	return clampi(_rng.randi_range(base - 2, base + 3), 4, 16)


func _style_for(i: int, j: int, storeys: int) -> Array:
	var front := (absi(i) == 2 and j <= 1) or (j == 2 and absi(i) <= 2)
	var x := _rng.randf()
	if j == -1 and x < 0.55:
		return [S_SHED if x < 0.3 else S_BRICK, _pick(BRICKS) if x >= 0.3 else Color(0.5, 0.48, 0.44).lerp(_pick(BRICKS), 0.4)]
	if front or j == 0:
		if x < 0.55:
			return [S_PASTEL, _pick(PASTELS)]
		return [S_CLASSIC, _pick(STONES)]
	if storeys > 10:
		return [S_OFFICE, _pick(CONCRETE)] if x < 0.5 else [S_GLASS, _pick(GLASS)]
	if x < 0.3:
		return [S_PASTEL, _pick(PASTELS)]
	if x < 0.5:
		return [S_CLASSIC, _pick(STONES)]
	if x < 0.7:
		return [S_BRICK, _pick(BRICKS)]
	return [S_OFFICE, _pick(CONCRETE)]


func _add(lo: Vector3, hi: Vector3, style: float, colour: Color, roof: int) -> void:
	buildings.append([lo, hi, style, _rng.randf(), colour, roof])


## A block built round its edges, a courtyard in the middle: each side a row of buildings of
## their own widths and heights.
func _perimeter_block(r: Rect2, i: int, j: int) -> void:
	var depth := _r(1.7, 2.3)
	var base := _storeys(i, j)
	# north and south sides run the block's full width; east and west fit between them
	for side in 4:
		var horiz := side < 2
		var a0 := r.position.x if horiz else r.position.y + depth
		var a1 := r.end.x if horiz else r.end.y - depth
		var at := a0
		while at < a1 - 0.4:
			var w := minf(_r(1.4, 3.2), a1 - at)
			if a1 - (at + w) < 1.0:
				w = a1 - at
			var st := clampi(base + _rng.randi_range(-1, 1), 3, 18)
			var h := GROUND_FLOOR + STOREY * (st - 1)
			var sty: Array = _style_for(i, j, st)
			var lo: Vector3
			var hi: Vector3
			var dd := depth * _r(0.85, 1.0)
			match side:
				0:
					lo = Vector3(at, PLAZA_Y, r.position.y)
					hi = Vector3(at + w, PLAZA_Y + h, r.position.y + dd)
				1:
					lo = Vector3(at, PLAZA_Y, r.end.y - dd)
					hi = Vector3(at + w, PLAZA_Y + h, r.end.y)
				2:
					lo = Vector3(r.position.x, PLAZA_Y, at)
					hi = Vector3(r.position.x + dd, PLAZA_Y + h, at + w)
				_:
					lo = Vector3(r.end.x - dd, PLAZA_Y, at)
					hi = Vector3(r.end.x, PLAZA_Y + h, at + w)
			var pitched := 1 if st <= 6 and (sty[0] == S_PASTEL or sty[0] == S_CLASSIC) and _rng.randf() < 0.55 else 0
			_add(lo, hi, sty[0], sty[1], pitched)
			_roof_spot(lo, hi, i, j)
			at += w


## A strip of buildings along the boulevard (facing it: `face` +1 its north side faces +z).
func _strip(r: Rect2, i: int, j: int, _face: int) -> void:
	var at := r.position.x
	while at < r.end.x - 0.4:
		var w := minf(_r(1.5, 3.0), r.end.x - at)
		if r.end.x - (at + w) < 1.0:
			w = r.end.x - at
		var st := _rng.randi_range(6, 9) if absi(i) <= 4 else _rng.randi_range(6, 12)
		var h := GROUND_FLOOR + STOREY * (st - 1)
		var sty: Array = _style_for(i, j, st)
		_add(Vector3(at, PLAZA_Y, r.position.y), Vector3(at + w, PLAZA_Y + h, r.end.y), sty[0], sty[1], 0)
		at += w


## A downtown block: a tower on a podium.
func _tower_block(r: Rect2, d: float) -> void:
	var st := int(lerpf(46.0, 18.0, d / 26.0) * _r(0.75, 1.15))
	var pod := GROUND_FLOOR + STOREY * 3.0
	_add(Vector3(r.position.x, PLAZA_Y, r.position.y), Vector3(r.end.x, PLAZA_Y + pod, r.end.y), S_OFFICE, _pick(CONCRETE), 0)
	var cx := r.get_center().x + _r(-0.6, 0.6)
	var cz := r.get_center().y + _r(-0.6, 0.6)
	var hw := _r(1.8, 2.8)
	var hd := _r(1.8, 2.8)
	var h := pod + STOREY * st
	var glass := _rng.randf() < 0.7
	_add(Vector3(cx - hw, PLAZA_Y + pod, cz - hd), Vector3(cx + hw, PLAZA_Y + h, cz + hd), S_GLASS if glass else S_OFFICE, _pick(GLASS) if glass else _pick(CONCRETE), 0)


## A roof over the square a camera crew could film from: the front buildings', at the edge that
## faces the ring.
func _roof_spot(lo: Vector3, hi: Vector3, i: int, j: int) -> void:
	var front := (absi(i) == 2 and j <= 1 and j >= -1) or (j == 2 and absi(i) <= 2)
	if not front:
		return
	var c := (lo + hi) * 0.5
	# the edge nearest the ring, a couple of metres back from the parapet, at eye height
	var to := -Vector2(c.x, c.z).normalized()
	var p := Vector3(clampf(c.x + to.x * 10.0, lo.x + 0.15, hi.x - 0.15), hi.y + 0.12, clampf(c.z + to.y * 10.0, lo.z + 0.15, hi.z - 0.15))
	roof_spots.append(p)


# ------------------------------------------------------------------ meshes

## Every building's walls and roof in one mesh (titan_facade). Walls' UV: (units along the wall
## from its left edge, height above the street); UV2: (style, seed); COLOR: the paint;
## CUSTOM0: (wall width, building height, storeys' height, roof kind). Pitched roofs are their
## own faces (style 9: tiles).
func building_mesh() -> TitanBuild:
	var b := TitanBuild.new()
	b.custom = true
	for bd in buildings:
		var lo: Vector3 = bd[0]
		var hi: Vector3 = bd[1]
		var style: float = bd[2]
		var seed: float = bd[3]
		var c: Color = bd[4]
		var roof: int = bd[5]
		var h := hi.y - lo.y
		var base := b.v.size()
		b.box(lo, hi, Vector2(style, seed), c, Vector4(0, h, STOREY, roof), Vector4.ZERO, roof == 0)
		# each wall knows its own width (for its window grid): walls are 4 verts each, in box() order
		var widths := [hi.z - lo.z, hi.z - lo.z, hi.x - lo.x, hi.x - lo.x]
		for k in 4:
			for q in 4:
				var vi := base + k * 4 + q
				b.c0[vi * 4] = widths[k]
		if roof == 1:
			_pitched(b, lo, hi, seed, c)
	return b


## A tiled roof over a low old building: ridge along its long side, hipped ends on the short.
func _pitched(b: TitanBuild, lo: Vector3, hi: Vector3, seed: float, c: Color) -> void:
	var wx := hi.x - lo.x
	var wz := hi.z - lo.z
	var rise := minf(wx, wz) * 0.32
	var y := hi.y
	var t := Vector2(9.0, seed)
	var a0 := Vector4(0, y + rise - PLAZA_Y, STOREY, 2)
	if wx >= wz:
		var zm := (lo.z + hi.z) * 0.5
		var inset := minf(wz * 0.5, wx * 0.25)
		var r0 := Vector3(lo.x + inset, y + rise, zm)
		var r1 := Vector3(hi.x - inset, y + rise, zm)
		var n0 := Vector3(0, wz * 0.5, -rise).normalized()
		var n1 := Vector3(0, wz * 0.5, rise).normalized()
		b.face(Vector3(lo.x, y, lo.z), Vector3(hi.x, y, lo.z), r1, r0, n0, Vector2(lo.x, 0), Vector2(hi.x, wz * 0.5), t, c, a0)
		b.face(Vector3(hi.x, y, hi.z), Vector3(lo.x, y, hi.z), r0, r1, n1, Vector2(hi.x, 0), Vector2(lo.x, wz * 0.5), t, c, a0)
		var e0 := Vector3(-rise, inset, 0).normalized()
		var e1 := Vector3(rise, inset, 0).normalized()
		var i0 := b.vert(Vector3(lo.x, y, lo.z), e0, Vector2(lo.z, 0), t, c, a0)
		var i1 := b.vert(Vector3(lo.x, y, hi.z), e0, Vector2(hi.z, 0), t, c, a0)
		var i2 := b.vert(r0, e0, Vector2(zm, inset), t, c, a0)
		b.tri(i0, i1, i2)
		var k0 := b.vert(Vector3(hi.x, y, hi.z), e1, Vector2(hi.z, 0), t, c, a0)
		var k1 := b.vert(Vector3(hi.x, y, lo.z), e1, Vector2(lo.z, 0), t, c, a0)
		var k2 := b.vert(r1, e1, Vector2(zm, inset), t, c, a0)
		b.tri(k0, k1, k2)
	else:
		var xm := (lo.x + hi.x) * 0.5
		var inset := minf(wx * 0.5, wz * 0.25)
		var r0 := Vector3(xm, y + rise, lo.z + inset)
		var r1 := Vector3(xm, y + rise, hi.z - inset)
		var n0 := Vector3(-rise, wx * 0.5, 0).normalized()
		var n1 := Vector3(rise, wx * 0.5, 0).normalized()
		b.face(Vector3(lo.x, y, hi.z), Vector3(lo.x, y, lo.z), r0, r1, n0, Vector2(hi.z, 0), Vector2(lo.z, wx * 0.5), t, c, a0)
		b.face(Vector3(hi.x, y, lo.z), Vector3(hi.x, y, hi.z), r1, r0, n1, Vector2(lo.z, 0), Vector2(hi.z, wx * 0.5), t, c, a0)
		var e0 := Vector3(0, inset, -rise).normalized()
		var e1 := Vector3(0, inset, rise).normalized()
		var i0 := b.vert(Vector3(hi.x, y, lo.z), e0, Vector2(hi.x, 0), t, c, a0)
		var i1 := b.vert(Vector3(lo.x, y, lo.z), e0, Vector2(lo.x, 0), t, c, a0)
		var i2 := b.vert(r0, e0, Vector2(xm, inset), t, c, a0)
		b.tri(i0, i1, i2)
		var k0 := b.vert(Vector3(lo.x, y, hi.z), e1, Vector2(lo.x, 0), t, c, a0)
		var k1 := b.vert(Vector3(hi.x, y, hi.z), e1, Vector2(hi.x, 0), t, c, a0)
		var k2 := b.vert(r1, e1, Vector2(xm, inset), t, c, a0)
		b.tri(k0, k1, k2)


## The ground: the land south of the harbour (the square, the streets, the boulevard: all one
## titan_ground draw), the quay's wall down to the water, and the far shore's land. UV2.x: 0 the
## city's ground, 1 the quay wall, 2 the far shore.
static func ground_mesh() -> TitanBuild:
	var b := TitanBuild.new()
	var y := PLAZA_Y
	# the city's ground in a few tiles (so no single triangle spans kilometres)
	var xs := [-420.0, -140.0, -40.0, 0.0, 40.0, 140.0, 420.0]
	var zs := [QUAY_Z, 0.0, 40.0, 140.0, 420.0]
	for a in xs.size() - 1:
		for c in zs.size() - 1:
			var x0: float = xs[a]
			var x1: float = xs[a + 1]
			var z0: float = zs[c]
			var z1: float = zs[c + 1]
			var i0 := b.vert(Vector3(x0, y, z0), Vector3.UP, Vector2(x0, z0))
			var i1 := b.vert(Vector3(x1, y, z0), Vector3.UP, Vector2(x1, z0))
			var i2 := b.vert(Vector3(x1, y, z1), Vector3.UP, Vector2(x1, z1))
			var i3 := b.vert(Vector3(x0, y, z1), Vector3.UP, Vector2(x0, z1))
			b.quad(i0, i1, i2, i3)
	# the quay wall, facing the water
	b.face(Vector3(-420, y, QUAY_Z), Vector3(420, y, QUAY_Z), Vector3(420, WATER_Y - 0.1, QUAY_Z), Vector3(-420, WATER_Y - 0.1, QUAY_Z), Vector3.FORWARD, Vector2(-420, 0.0), Vector2(420, y - WATER_Y + 0.1), Vector2(1, 0))
	# the far shore: the terminal's apron, its own quay wall
	var fy := PLAZA_Y + 0.02
	b.face(Vector3(MOUTH_X, fy, -420), Vector3(420, fy, -420), Vector3(420, fy, FAR_Z), Vector3(MOUTH_X, fy, FAR_Z), Vector3.UP, Vector2(MOUTH_X, -420), Vector2(420, FAR_Z), Vector2(2, 0))
	b.face(Vector3(MOUTH_X, fy, FAR_Z), Vector3(420, fy, FAR_Z), Vector3(420, WATER_Y - 0.1, FAR_Z), Vector3(MOUTH_X, WATER_Y - 0.1, FAR_Z), Vector3.BACK, Vector2(MOUTH_X, 0), Vector2(420, fy - WATER_Y + 0.1), Vector2(1, 1))
	b.face(Vector3(MOUTH_X, fy, -420), Vector3(MOUTH_X, fy, FAR_Z), Vector3(MOUTH_X, WATER_Y - 0.1, FAR_Z), Vector3(MOUTH_X, WATER_Y - 0.1, -420), Vector3.LEFT, Vector2(-420, 0), Vector2(FAR_Z, fy - WATER_Y + 0.1), Vector2(1, 1))
	return b


## The harbour and the sea: one sheet from the quay out past the horizon.
static func water_mesh() -> TitanBuild:
	var b := TitanBuild.new()
	var y := WATER_Y
	var xs := [-900.0, -140.0, -40.0, 40.0, 140.0, 900.0]
	var zs := [-900.0, -140.0, FAR_Z - 2.0, -30.0, QUAY_Z + 0.5]
	for a in xs.size() - 1:
		for c in zs.size() - 1:
			var x0: float = xs[a]
			var x1: float = xs[a + 1]
			var z0: float = zs[c]
			var z1: float = zs[c + 1]
			var i0 := b.vert(Vector3(x0, y, z0), Vector3.UP, Vector2(x0, z0))
			var i1 := b.vert(Vector3(x1, y, z0), Vector3.UP, Vector2(x1, z0))
			var i2 := b.vert(Vector3(x1, y, z1), Vector3.UP, Vector2(x1, z1))
			var i3 := b.vert(Vector3(x0, y, z1), Vector3.UP, Vector2(x0, z1))
			b.quad(i0, i1, i2, i3)
	return b
