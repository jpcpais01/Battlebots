## The Titan Colosseum's geometry (render/titan/titan_venue.gd), built in code: the plain, the
## raised fighting deck with its pylons and energy ropes, the stone bowl with its three tiers, the
## two titan gates, the attic arcade, the steel roof ring and its masts, the screens and banners.
##
## One world unit is a robot metre, and the titans are 15 times that (a robot ~2 m tall is a
## 30 m titan), so the stadium is the titans' size: the plain is 630 m across, the bowl 1.5 km,
## the rim 400 m up. People are built at 1/15: a seat row is 6 cm deep here (90 cm).
##
## The fight itself is the ordinary sim, unchanged: the deck is the sim's ring (its canvas, its
## step and the floor round it at the sim's own heights, body.ts groundAt), and the ring's ropes
## are energy beams between pylons at the corner posts.
class_name TitanBuild
extends RefCounted

## The plain round the deck: the sim's arena floor (body.ts ARENA_FLOOR).
const GROUND_Y := -0.62
## The deck: canvas edge and the stone step round it (body.ts CANVAS_EDGE, BASE_EDGE, BASE_Y),
## as octagon apothems.
const CANVAS_A := 5.55 * 0.9238795325112867
const BASE_A := 5.75 * 0.9238795325112867
const BASE_Y := -0.12
## Corner posts (body.ts RING_CORNER): the pylons stand on them.
const RING_CORNER := 5.0
const ROPE_HEIGHTS: Array[float] = [0.55, 0.95, 1.35]
const PYLON_H := 1.82
## The bowl: the podium wall round the plain and its top.
const R_IN := 21.0
const PODIUM_TOP := 1.2
## The three tiers: front radius, rows, row depth, first tread height, rise per row.
const TIERS := [
	[21.8, 152, 0.06, 1.55, 0.038],
	[32.2, 146, 0.06, 8.9, 0.04],
	[42.4, 112, 0.06, 16.2, 0.043],
]
## The attic arcade round the top (inner and outer faces), its top, and the roof ring's inner edge.
const R_ATTIC := 49.4
const R_RIM := 51.0
const H_RIM := 26.6
const R_CANOPY := 42.5
const H_CANOPY := 26.0
## The two titan gates, on the x axis (where the stretcher takes the loser out: stretcher.gd's
## tunnel gate at x = +-21): half the angle each gate block cuts out of the lower tier.
const GATE_HALF := 0.115
const GATE_TOP := 9.4
## The gate's opening: half width, height to where the arch springs, the arch's radius.
const PORTAL_HW := 1.6
const PORTAL_SPRING := 2.0
## Segments round the bowl.
const SEGS := 256

## Mesh buffers: build with vert/tri/quad, then make().
var v := PackedVector3Array()
var n := PackedVector3Array()
var uv := PackedVector2Array()
var uv2 := PackedVector2Array()
var col := PackedColorArray()
var c0 := PackedFloat32Array()
var c1 := PackedFloat32Array()
var idx := PackedInt32Array()
var custom := false


static func ring(a: float, r: float, y: float) -> Vector3:
	return Vector3(cos(a) * r, y, sin(a) * r)


func vert(p: Vector3, nn: Vector3, u := Vector2.ZERO, u2 := Vector2.ZERO, c := Color.WHITE, a0 := Vector4.ZERO, a1 := Vector4.ZERO) -> int:
	v.append(p)
	n.append(nn)
	uv.append(u)
	uv2.append(u2)
	col.append(c)
	c0.append_array([a0.x, a0.y, a0.z, a0.w])
	c1.append_array([a1.x, a1.y, a1.z, a1.w])
	return v.size() - 1


## A triangle facing the side its first vertex's normal points to (Godot's front faces wind
## clockwise as seen from the front).
func tri(a: int, b: int, c: int) -> void:
	var g := (v[b] - v[a]).cross(v[c] - v[a])
	if g.dot(n[a] + n[b] + n[c]) > 0.0:
		idx.append_array([a, c, b])
	else:
		idx.append_array([a, b, c])


func quad(a: int, b: int, c: int, d: int) -> void:
	tri(a, b, c)
	tri(a, c, d)


func tris() -> int:
	return idx.size() / 3


func make(mat: Material) -> ArrayMesh:
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_NORMAL] = n
	arr[Mesh.ARRAY_TEX_UV] = uv
	arr[Mesh.ARRAY_TEX_UV2] = uv2
	arr[Mesh.ARRAY_COLOR] = col
	arr[Mesh.ARRAY_INDEX] = idx
	var flags := 0
	if custom:
		arr[Mesh.ARRAY_CUSTOM0] = c0
		arr[Mesh.ARRAY_CUSTOM1] = c1
		flags = (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) | (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT)
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, flags)
	m.surface_set_material(0, mat)
	return m


## A band of a surface of revolution between profile points (ra, ya) and (rb, yb), from angle a0
## to a1 in `segs` steps, facing left of the profile's direction (a wall drawn upwards faces the
## middle; a floor drawn outwards faces up). UV is (arc length at the band's mid radius, height
## or radius along it), UV2.x the stone's pattern for titan_stone.gdshader.
func lathe(ra: float, ya: float, rb: float, yb: float, a0: float, a1: float, segs: int, pattern: float, extra := 0.0) -> void:
	var dr := rb - ra
	var dy := yb - ya
	var len := sqrt(dr * dr + dy * dy)
	var nr := -dy / len
	var ny := dr / len
	var rm := (ra + rb) * 0.5
	var base := v.size()
	for i in segs + 1:
		var a := lerpf(a0, a1, float(i) / segs)
		var nn := Vector3(cos(a) * nr, ny, sin(a) * nr)
		var s := a * rm
		# walls run up the v axis in height; floors in radius
		var va := ya if absf(dy) > absf(dr) else ra
		var vb := yb if absf(dy) > absf(dr) else rb
		vert(ring(a, ra, ya), nn, Vector2(s, va), Vector2(pattern, extra))
		vert(ring(a, rb, yb), nn, Vector2(s, vb), Vector2(pattern, extra))
	for i in segs:
		var k := base + i * 2
		quad(k, k + 2, k + 3, k + 1)


## The same band round the whole bowl except the gate blocks' cuts (when `gated`).
func lathe_round(ra: float, ya: float, rb: float, yb: float, pattern: float, gated: bool, extra := 0.0) -> void:
	if not gated:
		lathe(ra, ya, rb, yb, 0.0, TAU, SEGS, pattern, extra)
		return
	var half := SEGS / 2
	lathe(ra, ya, rb, yb, GATE_HALF, PI - GATE_HALF, half, pattern, extra)
	lathe(ra, ya, rb, yb, PI + GATE_HALF, TAU - GATE_HALF, half, pattern, extra)


## A box centred on `at`, `hx` along `ax`, `hz` along `az` (both level) and `hy` up: its four
## sides and top (it stands on something).
func box(at: Vector3, ax: Vector3, az: Vector3, hx: float, hz: float, hy: float, pattern: float, extra := 0.0) -> void:
	var x := ax.normalized() * hx
	var z := az.normalized() * hz
	var y := Vector3(0, hy, 0)
	var c := [at - x - z, at + x - z, at + x + z, at - x + z]
	for i in 4:
		var a: Vector3 = c[i]
		var b: Vector3 = c[(i + 1) % 4]
		var nn: Vector3 = ((a + b) * 0.5 - at)
		nn.y = 0.0
		panel(a - y, b - y, b + y, a + y, nn.normalized(), pattern, extra)
	panel(c[0] + y, c[1] + y, c[2] + y, c[3] + y, Vector3.UP, pattern, extra)


## A flat quad from four points (facing `nn`), UV in metres-ish along it.
func panel(a: Vector3, b: Vector3, c: Vector3, d: Vector3, nn: Vector3, pattern: float, extra := 0.0) -> void:
	var w := a.distance_to(b)
	var h := a.distance_to(d)
	var i := vert(a, nn, Vector2(0, a.y), Vector2(pattern, extra))
	var j := vert(b, nn, Vector2(w, b.y), Vector2(pattern, extra))
	var k := vert(c, nn, Vector2(w, c.y), Vector2(pattern, extra))
	var l := vert(d, nn, Vector2(0, d.y), Vector2(pattern, extra))
	quad(i, j, k, l)


# ------------------------------------------------------------------ the stone bowl

## Stone patterns (titan_stone.gdshader): 0 ashlar, 1 the podium's blind arcade, 2 paving,
## 3 a tier front with an LED ribbon, 4 the attic's open arcade, 5 the perimeter boards, 6 a gate
## block, 7 the tunnel, 8 dark concrete.
static func bowl() -> TitanBuild:
	var b := TitanBuild.new()
	var t0: Array = TIERS[0]
	var t1: Array = TIERS[1]
	var t2: Array = TIERS[2]
	# the podium wall round the plain, its walk and the perimeter boards at the front of the lower tier
	b.lathe_round(R_IN, GROUND_Y, R_IN, PODIUM_TOP, 1.0, true)
	b.lathe_round(R_IN, PODIUM_TOP, t0[0] - 0.04, PODIUM_TOP, 2.0, true)
	b.lathe_round(t0[0] - 0.04, PODIUM_TOP, t0[0] - 0.04, t0[3] + 0.07, 5.0, true)
	b.lathe_round(t0[0] - 0.04, t0[3] + 0.07, t0[0], t0[3] + 0.07, 8.0, true)
	# each tier's back, the walkway behind it and the next tier's front wall
	var nexts := [t1, t2]
	for k in 2:
		var t: Array = TIERS[k]
		var nt: Array = nexts[k]
		var r_back: float = t[0] + t[1] * t[2]
		var y_last: float = t[3] + (t[1] - 1) * t[4]
		var y_walk := y_last + 0.06
		b.lathe_round(r_back, y_last, r_back, y_walk, 8.0, k == 0)
		b.lathe_round(r_back, y_walk, nt[0] - 0.04, y_walk, 2.0, k == 0)
		b.lathe_round(nt[0] - 0.04, y_walk, nt[0] - 0.04, nt[3] + 0.07, 3.0, false, float(k))
		b.lathe_round(nt[0] - 0.04, nt[3] + 0.07, nt[0], nt[3] + 0.07, 8.0, false)
	# the upper tier's back walk and the attic arcade, open to the sky, with the rim on top
	var r_back2: float = t2[0] + t2[1] * t2[2]
	var y_last2: float = t2[3] + (t2[1] - 1) * t2[4]
	b.lathe_round(r_back2, y_last2, r_back2, y_last2 + 0.06, 8.0, false)
	b.lathe_round(r_back2, y_last2 + 0.06, R_ATTIC, y_last2 + 0.06, 2.0, false)
	b.lathe_round(R_ATTIC, y_last2 + 0.06, R_ATTIC, H_RIM, 4.0, false, 0.0)
	b.lathe_round(R_RIM, H_RIM, R_RIM, y_last2 + 0.06, 4.0, false, 1.0)
	b.lathe_round(R_ATTIC, H_RIM, R_RIM, H_RIM, 2.0, false)
	# the outside of the outer wall, seen through the arches
	b.lathe_round(R_RIM + 0.01, y_last2 + 0.06, R_RIM + 0.01, H_RIM, 4.0, false, 1.0)
	for g in 2:
		b._gate(g * PI)
	return b


## A titan gate: a stone block standing out of the bowl on the x axis, cutting through the lower
## tier, with an arched portal at its foot (a tunnel behind it), crowned with a screen deck.
func _gate(a: float) -> void:
	var r_front := R_IN - 0.4
	var r_back: float = TIERS[0][0] + TIERS[0][1] * TIERS[0][2] + 0.05
	var c := Vector3(cos(a), 0.0, sin(a))
	var side := Vector3(-c.z, 0.0, c.x)
	var hw := r_front * tan(GATE_HALF)
	var hw2 := r_back * tan(GATE_HALF)
	var y0 := GROUND_Y
	var y1 := GATE_TOP
	var front := c * r_front
	var inward := -c
	# the facade, with the portal cut out: two piers, then the span over the arch
	var p := PORTAL_HW
	var spring := y0 + PORTAL_SPRING
	for s in [-1.0, 1.0]:
		var e0: Vector3 = front + side * s * hw
		var e1: Vector3 = front + side * s * p
		var q := [e0 + Vector3(0, y0, 0), e1 + Vector3(0, y0, 0), e1 + Vector3(0, y1, 0), e0 + Vector3(0, y1, 0)]
		panel(q[0], q[1], q[2], q[3], inward, 6.0)
	var arch := 18
	for i in arch:
		var u0 := PI * float(i) / arch
		var u1 := PI * float(i + 1) / arch
		var a0 := front + side * cos(u0) * p + Vector3(0, spring + sin(u0) * p, 0)
		var a1 := front + side * cos(u1) * p + Vector3(0, spring + sin(u1) * p, 0)
		var top0 := Vector3(a0.x, y1, a0.z)
		var top1 := Vector3(a1.x, y1, a1.z)
		panel(a0, a1, top1, top0, inward, 6.0)
	# its sides and top
	for s in [-1.0, 1.0]:
		var f0: Vector3 = front + side * s * hw
		var k0: Vector3 = c * r_back + side * s * hw2
		var nn: Vector3 = side * s
		panel(f0 + Vector3(0, y0, 0), k0 + Vector3(0, y0, 0), k0 + Vector3(0, y1, 0), f0 + Vector3(0, y1, 0), nn, 6.0, 1.0)
	var tl := front - side * hw + Vector3(0, y1, 0)
	var tr := front + side * hw + Vector3(0, y1, 0)
	var bl := c * r_back - side * hw2 + Vector3(0, y1, 0)
	var br := c * r_back + side * hw2 + Vector3(0, y1, 0)
	panel(tl, tr, br, bl, Vector3.UP, 2.0)
	# crowned with a cornice and a battlement along its front and sides
	var corn := 0.14
	var ytop := y1 + 0.22
	box(front + side * 0.0 + Vector3(0, y1 + 0.11, 0) + c * 0.0, side, c, hw + corn, corn, 0.11, 6.0, 2.0)
	for s in [-1.0, 1.0]:
		var mid: Vector3 = c * (r_front + r_back) * 0.5 + side * s * (hw + hw2) * 0.5 + Vector3(0, y1 + 0.11, 0)
		var along: Vector3 = (c * r_back + side * s * hw2 - (front + side * s * hw)).normalized()
		var across := Vector3(-along.z, 0, along.x)
		box(mid + across * 0.0, across, along, corn, (r_back - r_front) * 0.5, 0.11, 6.0, 2.0)
	var merlon := 0.34
	var n_front := int(floor(hw * 2.0 / (merlon * 2.0)))
	for i in n_front:
		var u := -hw + merlon * 0.5 + (hw * 2.0 - merlon) * float(i) / maxf(1.0, n_front - 1)
		box(front + side * u + Vector3(0, ytop + 0.22, 0) - c * 0.02, side, c, merlon * 0.5, 0.1, 0.22, 6.0, 2.0)
	for s in [-1.0, 1.0]:
		var f0: Vector3 = front + side * s * hw
		var k0: Vector3 = c * r_back + side * s * hw2
		var along: Vector3 = (k0 - f0).normalized()
		var across := Vector3(-along.z, 0, along.x)
		var n_side := int(floor(f0.distance_to(k0) / (merlon * 2.0)))
		for i in range(1, n_side):
			box(f0.lerp(k0, float(i) / n_side) + Vector3(0, ytop + 0.22, 0) - side * s * 0.02, across, along, 0.1, merlon * 0.5, 0.22, 6.0, 2.0)
	# the tunnel: a vaulted passage running back under the stands, dark and deep
	var depth := 7.0
	var vault := 12
	for i in vault:
		var u0 := PI * float(i) / vault
		var u1 := PI * float(i + 1) / vault
		var d0 := side * cos(u0) * p + Vector3(0, spring + sin(u0) * p, 0)
		var d1 := side * cos(u1) * p + Vector3(0, spring + sin(u1) * p, 0)
		var nn := -(side * cos((u0 + u1) * 0.5) + Vector3(0, sin((u0 + u1) * 0.5), 0))
		panel(front + d0, front + d1, front + c * depth + d1, front + c * depth + d0, nn, 7.0)
	for s in [-1.0, 1.0]:
		var w0: Vector3 = front + side * s * p
		panel(w0 + Vector3(0, y0, 0), w0 + c * depth + Vector3(0, y0, 0), w0 + c * depth + Vector3(0, spring, 0), w0 + Vector3(0, spring, 0), -side * s, 7.0)
	panel(front - side * p + Vector3(0, y0 + 0.001, 0), front + side * p + Vector3(0, y0 + 0.001, 0), front + side * p + c * depth + Vector3(0, y0 + 0.001, 0), front - side * p + c * depth + Vector3(0, y0 + 0.001, 0), Vector3.UP, 7.0, 1.0)
	var back := front + c * depth
	panel(back - side * p + Vector3(0, y0, 0), back + side * p + Vector3(0, y0, 0), back + side * p + Vector3(0, spring + p, 0), back - side * p + Vector3(0, spring + p, 0), inward, 7.0, 2.0)


## The crowd's envelope: per tier, the cone at the fans' head height and its front, carrying the
## tier's numbers for titan_crowd.gdshader (CUSTOM0 r0, depth, y0, rise; CUSTOM1 rows, tier).
static func crowd() -> TitanBuild:
	var b := TitanBuild.new()
	b.custom = true
	for k in TIERS.size():
		var t: Array = TIERS[k]
		var r0: float = t[0]
		var rows: float = t[1]
		var dep: float = t[2]
		var y0: float = t[3]
		var rise: float = t[4]
		var head := 0.13
		var r1 := r0 + rows * dep
		var y_top := y0 + (rows - 1) * rise + head
		var a0 := Vector4(r0, dep, y0, rise)
		var a1 := Vector4(rows, k, 0, 0)
		var spans := [[0.0, TAU]]
		if k == 0:
			spans = [[GATE_HALF, PI - GATE_HALF], [PI + GATE_HALF, TAU - GATE_HALF]]
		for sp in spans:
			var segs := SEGS / spans.size()
			var base := b.v.size()
			for i in segs + 1:
				var a := lerpf(sp[0], sp[1], float(i) / segs)
				var nn := Vector3(-cos(a), 1.0, -sin(a)).normalized()
				b.vert(ring(a, r0, y0 + 0.07), nn, Vector2.ZERO, Vector2.ZERO, Color.WHITE, a0, a1)
				b.vert(ring(a, r0, y0 + head), nn, Vector2.ZERO, Vector2.ZERO, Color.WHITE, a0, a1)
				b.vert(ring(a, r1, y_top), nn, Vector2.ZERO, Vector2.ZERO, Color.WHITE, a0, a1)
			for i in segs:
				var q := base + i * 3
				b.quad(q, q + 3, q + 4, q + 1)
				b.quad(q + 1, q + 4, q + 5, q + 2)
	return b


# ------------------------------------------------------------------ the field

## The plain: grass from the deck's foot to the podium wall (lit: it takes the robots' shadows).
static func plain() -> TitanBuild:
	var b := TitanBuild.new()
	var segs := 160
	var rings := [0.0, 0.03, 0.08, 0.16, 0.28, 0.45, 0.65, 0.82, 1.0]
	for i in segs + 1:
		var a := TAU * float(i) / segs
		# the deck's octagonal foot, then out to the round wall
		var oct := BASE_A / cos(fposmod(a + PI / 8.0, PI / 4.0) - PI / 8.0)
		for k in rings.size():
			var r := lerpf(oct, R_IN + 0.05, rings[k])
			var p := ring(a, r, GROUND_Y)
			b.vert(p, Vector3.UP, Vector2(p.x, p.z))
	var w := rings.size()
	for i in segs:
		for k in w - 1:
			var q := i * w + k
			b.quad(q, q + w, q + w + 1, q + 1)
	return b


## The fighting deck: a turfed octagon (the sim's canvas) on a stone step and wall, standing out of
## the plain. UV2.x: 0 turf, 1 the stone kerb and wall.
static func deck() -> TitanBuild:
	var b := TitanBuild.new()
	var cr := CANVAS_A / cos(PI / 8.0)
	var br := BASE_A / cos(PI / 8.0)
	# the turf: rings out from the middle (per-pixel lit, so a few are plenty)
	var c := b.vert(Vector3(0, 0, 0), Vector3.UP, Vector2.ZERO)
	var rings := [0.25, 0.5, 0.75, 1.0]
	var first := b.v.size()
	for i in 8:
		var a := (i + 0.5) * PI / 4.0
		for k in rings.size():
			var p := ring(a, cr * rings[k], 0.0)
			b.vert(p, Vector3.UP, Vector2(p.x, p.z))
	for i in 8:
		var j := (i + 1) % 8
		var q0 := first + i * 4
		var q1 := first + j * 4
		b.tri(c, q0, q1)
		for k in 3:
			b.quad(q0 + k, q1 + k, q1 + k + 1, q0 + k + 1)
	# the step's stone: the canvas edge down to the step, the step's top, the wall to the plain
	for i in 8:
		var a0 := (i + 0.5) * PI / 4.0
		var a1 := (i + 1.5) * PI / 4.0
		var mid := (i + 1.0) * PI / 4.0
		var out := Vector3(cos(mid), 0, sin(mid))
		b.panel(ring(a0, cr, BASE_Y), ring(a1, cr, BASE_Y), ring(a1, cr, 0.0), ring(a0, cr, 0.0), out, 1.0)
		b.panel(ring(a0, cr, BASE_Y), ring(a1, cr, BASE_Y), ring(a1, br, BASE_Y), ring(a0, br, BASE_Y), Vector3.UP, 1.0, 1.0)
		b.panel(ring(a0, br, GROUND_Y), ring(a1, br, GROUND_Y), ring(a1, br, BASE_Y), ring(a0, br, BASE_Y), out, 1.0, 2.0)
	return b


## The eight pylons on the corner posts: tapered stone and steel shafts with an emitter crown at
## each rope height. UV.y is the height up the pylon, UV2.x 0 shaft, 1 emitter band.
static func pylons() -> TitanBuild:
	var b := TitanBuild.new()
	var sides := 8
	# (height, radius, part) up the shaft: plinth, shaft, emitter collars at the rope heights, cap
	var prof := [[0.0, 0.3, 0.0], [0.12, 0.3, 0.0], [0.14, 0.24, 0.0]]
	for h in ROPE_HEIGHTS:
		prof.append([h - 0.07, 0.205 - h * 0.03, 0.0])
		prof.append([h - 0.05, 0.25 - h * 0.03, 1.0])
		prof.append([h + 0.05, 0.25 - h * 0.03, 1.0])
		prof.append([h + 0.07, 0.205 - h * 0.03, 0.0])
	prof.append_array([[PYLON_H - 0.2, 0.15, 0.0], [PYLON_H - 0.12, 0.2, 1.0], [PYLON_H, 0.06, 1.0]])
	for k in 8:
		var pa := (k + 0.5) * PI / 4.0
		var at := ring(pa, RING_CORNER, 0.0)
		for s in prof.size() - 1:
			var lo: Array = prof[s]
			var hi: Array = prof[s + 1]
			var part: float = hi[2] if hi[2] == lo[2] else 0.0
			var dr: float = hi[1] - lo[1]
			var dy: float = hi[0] - lo[0]
			for i in sides:
				var a0 := TAU * float(i) / sides + pa
				var a1 := TAU * float(i + 1) / sides + pa
				var am := (a0 + a1) * 0.5
				var nn := Vector3(cos(am) * dy, -dr, sin(am) * dy).normalized()
				var p00 := at + Vector3(cos(a0) * lo[1], lo[0], sin(a0) * lo[1])
				var p10 := at + Vector3(cos(a1) * lo[1], lo[0], sin(a1) * lo[1])
				var p11 := at + Vector3(cos(a1) * hi[1], hi[0], sin(a1) * hi[1])
				var p01 := at + Vector3(cos(a0) * hi[1], hi[0], sin(a0) * hi[1])
				var i0 := b.vert(p00, nn, Vector2(float(i) / sides, lo[0]), Vector2(part, 0))
				var i1 := b.vert(p10, nn, Vector2(float(i + 1) / sides, lo[0]), Vector2(part, 0))
				var i2 := b.vert(p11, nn, Vector2(float(i + 1) / sides, hi[0]), Vector2(part, 0))
				var i3 := b.vert(p01, nn, Vector2(float(i) / sides, hi[0]), Vector2(part, 0))
				b.quad(i0, i1, i2, i3)
	return b


## The energy ropes: per side and height, a beam between two pylons, as two crossed ribbons, bowed
## by the rope physics (arena.gd uploads it) in titan_energy.gdshader. CUSTOM0: rope index (side
## * 3 + height), t post to post, across -1..1, ribbon (0 flat, 1 upright); UV2 outward xz.
static func ropes() -> TitanBuild:
	var b := TitanBuild.new()
	b.custom = true
	var steps := 28
	var w := 0.026
	for side in 8:
		var pa := ring((side - 0.5) * PI / 4.0, RING_CORNER, 0.0)
		var pb := ring((side + 0.5) * PI / 4.0, RING_CORNER, 0.0)
		var out := Vector2(cos(side * PI / 4.0), sin(side * PI / 4.0))
		var along := (pb - pa).normalized()
		var flat_off := Vector3(out.x, 0, out.y) * w
		for h in 3:
			var y: float = ROPE_HEIGHTS[h]
			for ribbon in 2:
				var off := flat_off if ribbon == 0 else Vector3(0, w, 0)
				var nn := Vector3.UP if ribbon == 0 else Vector3(-out.x, 0, -out.y)
				var base := b.v.size()
				for i in steps + 1:
					var t := float(i) / steps
					# (the beam starts at the pylon's collar, not its centre)
					var p := pa.lerp(pb, t) + along * 0.0 + Vector3(0, y, 0)
					for s in [-1.0, 1.0]:
						b.vert(p + off * s, nn, Vector2(t, s), out, Color.WHITE, Vector4(side * 3 + h, t, s, ribbon))
				for i in steps:
					var q := base + i * 2
					b.quad(q, q + 2, q + 3, q + 1)
	return b


# ------------------------------------------------------------------ the roof

## The steel roof ring over the upper tier: radial ribs from the attic out over the seats, a
## front ring beam carrying the floodlights, the translucent membrane between, and masts on the
## rim with their stays. UV2.x: 0 steel, 1 the floodlight faces.
static func roof() -> TitanBuild:
	var b := TitanBuild.new()
	var ribs := 96
	for i in ribs:
		var a := TAU * float(i) / ribs
		var c := Vector3(cos(a), 0, sin(a))
		var sd := Vector3(-c.z, 0, c.x)
		# a tapering box girder: deep at the rim, shallow at its tip
		var p0 := c * R_RIM + Vector3(0, H_RIM, 0)
		var p1 := c * R_CANOPY + Vector3(0, H_CANOPY, 0)
		var d0 := 1.1
		var d1 := 0.35
		var w := 0.16
		var pts := [p0 + sd * w, p0 - sd * w, p1 - sd * w, p1 + sd * w]
		var bot := [pts[0] - Vector3(0, d0, 0), pts[1] - Vector3(0, d0, 0), pts[2] - Vector3(0, d1, 0), pts[3] - Vector3(0, d1, 0)]
		b.panel(bot[0], bot[3], pts[3], pts[0], sd, 0.0)
		b.panel(bot[2], bot[1], pts[1], pts[2], -sd, 0.0)
		b.panel(bot[1], bot[2], bot[3], bot[0], Vector3.DOWN, 0.0)
	# the front ring beam, its floodlight faces turned down onto the plain
	var segs := 192
	var prof := [[R_CANOPY + 0.05, H_CANOPY + 0.12], [R_CANOPY - 0.25, H_CANOPY + 0.05], [R_CANOPY - 0.3, H_CANOPY - 0.45], [R_CANOPY + 0.05, H_CANOPY - 0.5]]
	for k in 3:
		var pa: Array = prof[k]
		var pb: Array = prof[k + 1]
		b.lathe(pa[0], pa[1], pb[0], pb[1], 0.0, TAU, segs, 1.0 if k == 1 else 0.0)
	# masts on the rim, raking outwards, with stays down to the roof's front ring
	var masts := 24
	for i in masts:
		var a := TAU * (float(i) + 0.5) / masts
		var c := Vector3(cos(a), 0, sin(a))
		var sd := Vector3(-c.z, 0, c.x)
		var foot := c * (R_RIM + 0.3) + Vector3(0, H_RIM, 0)
		var tip := c * (R_RIM + 1.6) + Vector3(0, H_RIM + 9.0, 0)
		var r0 := 0.28
		var r1 := 0.08
		for s in 6:
			var u0 := TAU * s / 6.0
			var u1 := TAU * (s + 1) / 6.0
			var o0 := (c * cos(u0) + sd * sin(u0))
			var o1 := (c * cos(u1) + sd * sin(u1))
			b.panel(foot + o0 * r0, foot + o1 * r0, tip + o1 * r1, tip + o0 * r1, (o0 + o1).normalized(), 0.0)
		# its stays: thin ribbons to the roof's front ring either side
		for s in [-1.0, 1.0]:
			var to := ring(a + s * TAU / masts * 0.5, R_CANOPY + 0.2, H_CANOPY + 0.1)
			var dir := (to - tip).normalized()
			var wv := dir.cross(Vector3.UP).normalized() * 0.03
			b.panel(tip - wv, tip + wv, to + wv, to - wv, Vector3.UP, 0.0, 2.0)
			b.panel(tip - Vector3(0, 0.03, 0), tip + Vector3(0, 0.03, 0), to + Vector3(0, 0.03, 0), to - Vector3(0, 0.03, 0), wv.normalized(), 0.0, 2.0)
	return b


## The roof's membrane between the ribs: a translucent sheet the low sun glows through.
static func membrane() -> TitanBuild:
	var b := TitanBuild.new()
	b.lathe(R_RIM, H_RIM + 0.02, R_CANOPY, H_CANOPY + 0.14, 0.0, TAU, 192, 0.0)
	return b


# ------------------------------------------------------------------ banners and screens

## Tall banners hanging from the middle tier's front wall over the walkway, in the two corners'
## colours (UV2.x: which corner; UV: across 0..1, down 0..1 for the wave).
static func banners() -> TitanBuild:
	var b := TitanBuild.new()
	var t1: Array = TIERS[1]
	var r: float = t1[0] - 0.08
	var top: float = t1[3] + 0.0
	var count := 56
	var w := 0.7
	var h := 1.25
	var rows := 6
	for i in count:
		var a := TAU * (float(i) + 0.5) / count
		# none in front of the gates
		if absf(wrapf(a, -PI, PI)) < 0.2 or absf(wrapf(a - PI, -PI, PI)) < 0.2:
			continue
		var c := Vector3(cos(a), 0, sin(a))
		var sd := Vector3(-c.z, 0, c.x)
		var base := b.v.size()
		for k in rows + 1:
			var y := top - h * float(k) / rows
			for s in 2:
				var p := c * r + sd * (float(s) - 0.5) * w + Vector3(0, y, 0)
				b.vert(p, -c, Vector2(s, float(k) / rows), Vector2(0.0 if c.x > 0.0 else 1.0, float(i)))
		for k in rows:
			var q := base + k * 2
			b.quad(q, q + 1, q + 3, q + 2)
	return b


## The giant screens: one over each gate, set back on the gate block's top, and one hung from the
## roof over each side between them, all facing the plain. Returns [TitanBuild for the frames,
## Array of screen quad meshes].
static func screens(screen_mat: Material) -> Array:
	var frames := TitanBuild.new()
	var quads: Array[ArrayMesh] = []
	var spots := [[0.0, R_IN + 1.6, GATE_TOP + 0.25], [PI, R_IN + 1.6, GATE_TOP + 0.25], [PI * 0.5, R_CANOPY - 0.6, H_CANOPY - 4.6], [PI * 1.5, R_CANOPY - 0.6, H_CANOPY - 4.6]]
	var w := 6.4
	var h := 3.6
	for sp in spots:
		var a: float = sp[0]
		var c := Vector3(cos(a), 0, sin(a))
		var sd := Vector3(-c.z, 0, c.x)
		var at: Vector3 = c * float(sp[1]) + Vector3(0, sp[2], 0)
		# tilt the roof ones down towards the plain
		var tilt := 0.0 if sp[2] < 15.0 else 0.18
		var up := (Vector3.UP * cos(tilt) + c * sin(tilt)).normalized()
		var face := -c * cos(tilt) + Vector3.UP * sin(tilt)
		var sb := TitanBuild.new()
		var o := at + face * 0.02
		# (the screen faces the plain: the side vector runs left to right as seen from there, and
		# the board's UVs are three's, v up)
		var i0 := sb.vert(o - sd * w * 0.5, face, Vector2(0, 0))
		var i1 := sb.vert(o + sd * w * 0.5, face, Vector2(1, 0))
		var i2 := sb.vert(o + sd * w * 0.5 + up * h, face, Vector2(1, 1))
		var i3 := sb.vert(o - sd * w * 0.5 + up * h, face, Vector2(0, 1))
		sb.quad(i0, i1, i2, i3)
		quads.append(sb.make(screen_mat))
		# a steel frame round it and a back
		var m := 0.18
		var bl := at - sd * (w * 0.5 + m) - up * m
		var br := at + sd * (w * 0.5 + m) - up * m
		var tr := at + sd * (w * 0.5 + m) + up * (h + m)
		var tl := at - sd * (w * 0.5 + m) + up * (h + m)
		var back := c * 0.35
		frames.panel(bl, br, tr, tl, face, 0.0)
		frames.panel(br + back, bl + back, tl + back, tr + back, -face, 0.0)
		frames.panel(tl, tr, tr + back, tl + back, up, 0.0)
		frames.panel(bl + back, br + back, br, bl, -up, 0.0)
		frames.panel(bl + back, bl, tl, tl + back, -sd, 0.0)
		frames.panel(br, br + back, tr + back, tr, sd, 0.0)
		if sp[2] > 15.0:
			# hung from the roof on two stays
			for s in [-1.0, 1.0]:
				var top: Vector3 = tl.lerp(tr, 0.5 + s * 0.4) + back * 0.5
				var hook := Vector3(top.x, H_CANOPY - 0.3, top.z)
				frames.panel(top - sd * 0.03, top + sd * 0.03, hook + sd * 0.03, hook - sd * 0.03, face, 0.0, 2.0)
	return [frames, quads]
