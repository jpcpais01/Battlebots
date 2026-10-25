## The Titan Ring (render/titan): the steel stage the titans fight on, in the middle of the city's
## harbour square. It is the sim's own ring at the titans' scale (body.ts): the deck is the
## canvas (y 0, octagon apothem CANVAS_A), the steel lip round it the stage's base (BASE_Y, to
## BASE_A), and the square below is the arena floor (ARENA_FLOOR, 9.3 m down). The corner posts
## are 26 m steel pylons with their floodlights, and the ropes are bridge cables, bowed by the
## same rope physics as the indoor ring's (arena.gd uploads `rope` to the cables' material).
##
## Every piece is in one of TitanSteel's kinds (UV2.x): see titan_steel.gdshader.
class_name TitanRing
extends RefCounted

const RING_CORNER := 5.0
const CANVAS_A := 5.55 * 0.9238795325112867
const BASE_A := 5.75 * 0.9238795325112867
const BASE_Y := -0.12
const PLAZA_Y := -0.62
const POST_R := 0.16
const POST_TOP := 1.76
const ROPE_HEIGHTS: Array[float] = [0.55, 0.95, 1.35]
## The cables' radius (0.45 m at the titans' scale) and how many segments each is drawn in.
const CABLE_R := 0.032
const CABLE_SEGS := 22
## titan_steel.gdshader kinds.
const K_DECK := 0.0
const K_LIP := 1.0
const K_SKIRT := 2.0
const K_GIRDER := 3.0
const K_PYLON := 4.0
const K_COLLAR := 5.0
const K_LAMP := 6.0
const K_PLINTH := 7.0
const K_DARK := 8.0
const K_STAIR := 9.0


## Corner k of an octagon with apothem `a` (the corners sit at (k + 1/2) * 45 degrees).
static func corner(k: int, a: float, y: float) -> Vector3:
	var ang := (k + 0.5) * PI / 4.0
	var r := a / cos(PI / 8.0)
	return Vector3(cos(ang) * r, y, sin(ang) * r)


## Outward normal of octagon side s (the sides face s * 45 degrees).
static func side_n(s: int) -> Vector3:
	var ang := s * PI / 4.0
	return Vector3(cos(ang), 0, sin(ang))


## The deck, its lip and the stage's walls down to the square, with the girders that carry it.
static func stage() -> TitanBuild:
	var b := TitanBuild.new()
	# the deck: one fan of plates (the shader draws the plates, the emblem and the hatches)
	var c := b.vert(Vector3.ZERO, Vector3.UP, Vector2.ZERO, Vector2(K_DECK, 0))
	var first := b.v.size()
	for k in 9:
		var p := corner(k % 8, CANVAS_A, 0.0)
		b.vert(p, Vector3.UP, Vector2(p.x, p.z), Vector2(K_DECK, 0))
	for k in 8:
		b.tri(c, first + k, first + k + 1)
	for s in 8:
		var nn := side_n(s)
		var a0 := corner(s - 1 if s > 0 else 7, CANVAS_A, 0.0)
		var a1 := corner(s, CANVAS_A, 0.0)
		# (corner(s - 1) .. corner(s) is side s: corners at (s -/+ 1/2) * 45 degrees)
		var w := a0.distance_to(a1)
		# the deck's edge, down to the lip
		b.face(a0, a1, a1 + Vector3(0, BASE_Y, 0), a0 + Vector3(0, BASE_Y, 0), nn, Vector2(0, 0), Vector2(w, -BASE_Y), Vector2(K_LIP, 0))
		# the lip's top
		var o0 := corner(s - 1 if s > 0 else 7, BASE_A, BASE_Y)
		var o1 := corner(s, BASE_A, BASE_Y)
		var i0 := a0 + Vector3(0, BASE_Y, 0)
		var i1 := a1 + Vector3(0, BASE_Y, 0)
		var q0 := b.vert(i0, Vector3.UP, Vector2(i0.x, i0.z), Vector2(K_LIP, 1))
		var q1 := b.vert(i1, Vector3.UP, Vector2(i1.x, i1.z), Vector2(K_LIP, 1))
		var q2 := b.vert(o1, Vector3.UP, Vector2(o1.x, o1.z), Vector2(K_LIP, 1))
		var q3 := b.vert(o0, Vector3.UP, Vector2(o0.x, o0.z), Vector2(K_LIP, 1))
		b.quad(q0, q1, q2, q3)
		# the stage's wall down to the square: steel panels between the girders
		var wo := o0.distance_to(o1)
		b.face(o0, o1, o1 + Vector3(0, PLAZA_Y - BASE_Y, 0), o0 + Vector3(0, PLAZA_Y - BASE_Y, 0), nn, Vector2(0, -BASE_Y), Vector2(wo, -PLAZA_Y), Vector2(K_SKIRT, s))
		# girders standing proud of it, a concrete plinth at their feet
		var along := (o1 - o0) / wo
		var cols := 6
		for g in cols + 1:
			var f := float(g) / cols
			var at := o0.lerp(o1, f) + nn * 0.045 - along * (0.0 if g == 0 else 0.0)
			var lo := Vector3(at.x, PLAZA_Y + 0.05, at.z)
			var hi := Vector3(at.x, BASE_Y - 0.01, at.z)
			var gw := 0.11 if g == 0 or g == cols else 0.075
			b.beam(lo, hi, gw, 0.09, nn, Vector2(K_GIRDER, 0))
		# cross-bracing between them (an X in each bay, set back in the panel)
		for g in cols:
			var pa := o0.lerp(o1, float(g) / cols) + nn * 0.02
			var pb := o0.lerp(o1, float(g + 1) / cols) + nn * 0.02
			var y0 := PLAZA_Y + 0.08
			var y1 := BASE_Y - 0.06
			b.beam(Vector3(pa.x, y0, pa.z), Vector3(pb.x, y1, pb.z), 0.028, 0.02, nn, Vector2(K_GIRDER, 1))
			b.beam(Vector3(pa.x, y1, pa.z), Vector3(pb.x, y0, pb.z), 0.028, 0.02, nn, Vector2(K_GIRDER, 1))
		# the plinth
		var p0 := corner(s - 1 if s > 0 else 7, BASE_A + 0.1, PLAZA_Y)
		var p1 := corner(s, BASE_A + 0.1, PLAZA_Y)
		var wp := p0.distance_to(p1)
		b.face(p0 + Vector3(0, 0.05, 0), p1 + Vector3(0, 0.05, 0), p1, p0, nn, Vector2(0, 0), Vector2(wp, 0.05), Vector2(K_PLINTH, 0))
		var t0 := b.vert(o0 + Vector3(0, PLAZA_Y + 0.05 - BASE_Y, 0), Vector3.UP, Vector2(o0.x, o0.z), Vector2(K_PLINTH, 1))
		var t1 := b.vert(o1 + Vector3(0, PLAZA_Y + 0.05 - BASE_Y, 0), Vector3.UP, Vector2(o1.x, o1.z), Vector2(K_PLINTH, 1))
		var t2 := b.vert(p1 + Vector3(0, 0.05, 0), Vector3.UP, Vector2(p1.x, p1.z), Vector2(K_PLINTH, 1))
		var t3 := b.vert(p0 + Vector3(0, 0.05, 0), Vector3.UP, Vector2(p0.x, p0.z), Vector2(K_PLINTH, 1))
		b.quad(t0, t1, t2, t3)
	# service stairs up the stage's north and south walls (sides 2 and 6), people-sized
	for s in [2, 6]:
		_stair(b, s)
	return b


## A zig-zag of steel stairs up the stage's wall on side s, for the crews (1/15 scale: a flight
## is 2.1 m wide). A scale cue as much as anything: next to it the titans' feet are buildings.
static func _stair(b: TitanBuild, s: int) -> void:
	var nn := side_n(s)
	var along := Vector3(-nn.z, 0, nn.x)
	var base := nn * (BASE_A + 0.12)
	var w := 0.14
	var flights := 3
	var rise := (BASE_Y - PLAZA_Y) / flights
	var run := 0.55
	for f in flights:
		var dir := 1.0 if f % 2 == 0 else -1.0
		var y0 := PLAZA_Y + rise * f
		var x0 := -run * 0.5 * dir
		var a := base + along * x0 + Vector3(0, y0, 0)
		var c := base + along * (x0 + run * dir) + Vector3(0, y0 + rise, 0)
		# the flight's stringers and treads as one sloped slab, a landing at its top
		b.beam(a, c, w, 0.012, nn.cross(along) if dir > 0.0 else -nn.cross(along), Vector2(K_STAIR, 0))
		var land := c + along * 0.1 * dir
		b.box(Vector3(minf(c.x, land.x) - 0.07, land.y - 0.012, minf(c.z, land.z) - 0.07), Vector3(maxf(c.x, land.x) + 0.07, land.y, maxf(c.z, land.z) + 0.07), Vector2(K_STAIR, 1))
		# handrails: a thin bar on the outer side, a metre up (0.07)
		var off := nn * (w * 0.5)
		b.beam(a + off + Vector3(0, 0.07, 0), c + off + Vector3(0, 0.07, 0), 0.006, 0.006, Vector3.UP, Vector2(K_STAIR, 2))
	# the posts holding it off the wall
	for k in 4:
		var x := lerpf(-run * 0.5, run * 0.5, k / 3.0)
		var p := base + along * x
		b.beam(Vector3(p.x, PLAZA_Y, p.z), Vector3(p.x, BASE_Y, p.z), 0.02, 0.02, nn, Vector2(K_STAIR, 0))


## The eight corner pylons (the sim's corner posts, POST_R by POST_TOP): steel columns with the
## cable collars at the rope heights, a floodlight bank on top facing the deck, an aviation mast.
static func pylons() -> TitanBuild:
	var b := TitanBuild.new()
	for k in 8:
		var a := (k + 0.5) * PI / 4.0
		var p := Vector3(cos(a), 0, sin(a)) * RING_CORNER
		var inward := -Vector3(cos(a), 0, sin(a))
		# footing, column, collars
		b.tube(p, POST_R + 0.07, POST_R + 0.05, 0.0, 0.06, 12, Vector2(K_COLLAR, 0), Color.WHITE, Vector4.ZERO, true, PI / 12.0)
		b.tube(p, POST_R, POST_R * 0.8, 0.06, POST_TOP, 12, Vector2(K_PYLON, k), Color.WHITE, Vector4.ZERO, false, PI / 12.0)
		for h in ROPE_HEIGHTS:
			b.tube(p, POST_R * 1.25, POST_R * 1.25, h - 0.05, h + 0.05, 12, Vector2(K_COLLAR, 1), Color.WHITE, Vector4.ZERO, true, PI / 12.0)
			b.disc(p, 0.0, POST_R * 1.25, h - 0.05, 12, false, Vector2(K_COLLAR, 1))
		# the head: a platform, the floodlight bank tilted down at the deck, a mast with its beacon
		var top := p + Vector3(0, POST_TOP, 0)
		b.box(top + Vector3(-0.2, 0.0, -0.2), top + Vector3(0.2, 0.06, 0.2), Vector2(K_COLLAR, 2), Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, true, 15, -a)
		var side := Vector3(-inward.z, 0, inward.x)
		var lc := top + Vector3(0, 0.2, 0) + inward * 0.12
		var tilt := (inward * 0.5 - Vector3(0, 0.86, 0)).normalized()
		var up := tilt.cross(side).normalized()
		if up.y < 0.0:
			up = -up
		var hw := 0.24
		var hh := 0.13
		var c0 := lc - side * hw - up * hh
		var c1 := lc + side * hw - up * hh
		var c2 := lc + side * hw + up * hh
		var c3 := lc - side * hw + up * hh
		# the lamps' faces, and the housing behind them
		b.face(c0, c1, c2, c3, tilt, Vector2(0, 0), Vector2(1, 1), Vector2(K_LAMP, 0))
		var back := -tilt * 0.07
		b.face(c1 + back, c0 + back, c3 + back, c2 + back, -tilt, Vector2(0, 0), Vector2(1, 1), Vector2(K_DARK, 0))
		b.face(c3, c2, c2 + back, c3 + back, up, Vector2(0, 0), Vector2(1, 1), Vector2(K_DARK, 0))
		b.face(c1, c0, c0 + back, c1 + back, -up, Vector2(0, 0), Vector2(1, 1), Vector2(K_DARK, 0))
		b.face(c0, c3, c3 + back, c0 + back, -side, Vector2(0, 0), Vector2(1, 1), Vector2(K_DARK, 0))
		b.face(c2, c1, c1 + back, c2 + back, side, Vector2(0, 0), Vector2(1, 1), Vector2(K_DARK, 0))
		b.beam(top + Vector3(0, 0.06, 0), lc + back * 0.5, 0.05, 0.05, Vector3.UP, Vector2(K_DARK, 1))
		var mast := top - inward * 0.12
		b.tube(mast, 0.018, 0.012, 0.06, 0.42, 6, Vector2(K_DARK, 1))
	return b


## The ring's cables: per rope a ribbon the vertex shader turns to face the lens (titan_cable),
## bowed by the rope physics. CUSTOM0 = (rope side * 3 + height, t post to post, across -1..1, 0),
## UV2 = the side's outward direction (xz).
static func cables() -> TitanBuild:
	var b := TitanBuild.new()
	b.custom = true
	for side in 8:
		var pa := Vector3(cos((side - 0.5) * PI / 4.0), 0, sin((side - 0.5) * PI / 4.0)) * RING_CORNER
		var pb := Vector3(cos((side + 0.5) * PI / 4.0), 0, sin((side + 0.5) * PI / 4.0)) * RING_CORNER
		var out := Vector2(cos(side * PI / 4.0), sin(side * PI / 4.0))
		var along := (pb - pa).normalized()
		for h in 3:
			var y: float = ROPE_HEIGHTS[h]
			var base := b.v.size()
			for i in CABLE_SEGS + 1:
				var t := float(i) / CABLE_SEGS
				var p := pa.lerp(pb, t) + Vector3(0, y, 0)
				for s in [-1.0, 1.0]:
					b.vert(p, Vector3(out.x, 0, out.y), Vector2(t * (pb - pa).length(), s), out, Color.WHITE, Vector4(side * 3 + h, t, s, 0), Vector4(along.x, along.y, along.z, 0))
			for i in CABLE_SEGS:
				var q := base + i * 2
				b.idx.append_array([q, q + 2, q + 1, q + 1, q + 2, q + 3])
	return b
