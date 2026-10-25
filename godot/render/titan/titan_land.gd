## The titan city's landmarks, far off round the harbour (render/titan): what the long lenses see
## behind the titans, and what tells the eye how far that is. The suspension bridge across the
## harbour mouth, backlit by the low sun; the container terminal on the far shore, its cranes
## over a ship at the berth and its stacks of boxes; the lighthouse at the mouth; tower cranes
## over downtown; the hills round the bay; the rest of the city running off into the haze. All
## real-sized (one unit is 15 m), built into TitanProps' steel (titan_prop.gdshader) and its
## containers, laid out the same every fight.
class_name TitanLand
extends RefCounted

## The bridge: along x = BRIDGE_X across the mouth, its deck 60 m over the water.
const BRIDGE_X := -50.0
const DECK_Y := TitanCity.WATER_Y + 4.0
const TOWER_Z := [-24.5, -52.5]
const TOWER_TOP := 10.6
const CABLE_SAG := 0.6
## The terminal's quay (the far shore's edge) and its cranes.
const CRANE_X := [-30.0, -19.0, -8.0, 3.0, 14.0, 25.0]


static func build(p: TitanProps) -> void:
	_bridge(p.steel)
	_terminal(p)
	_lighthouse(p.steel)
	_tower_cranes(p.steel)
	_hills(p.steel)
	_far_city(p.steel)


static func _paint(det: float) -> Vector2:
	return Vector2(TitanProps.P_PAINT, det)


## The suspension bridge: two towers in international orange, the deck slung between them on two
## main cables, red beacons on the towers' tops.
static func _bridge(b: TitanBuild) -> void:
	var x := BRIDGE_X
	var hw := 0.85
	var z0 := TitanCity.QUAY_Z + 3.0
	var z1 := TitanCity.FAR_Z - 3.0
	# the deck: its underside, a stiffening truss either side, the roadway on top
	b.box(Vector3(x - hw, DECK_Y - 0.28, z1), Vector3(x + hw, DECK_Y, z0), _paint(0.0), Color.WHITE, Vector4.ZERO, Vector4.ZERO, false, true, 0)
	for s in [-1.0, 1.0]:
		var sx: float = x + hw * s
		b.face(Vector3(sx, DECK_Y - 0.28, z0), Vector3(sx, DECK_Y - 0.28, z1), Vector3(sx, DECK_Y + 0.12, z1), Vector3(sx, DECK_Y + 0.12, z0), Vector3(s, 0, 0), Vector2(0, 0), Vector2(z0 - z1, 0.4), Vector2(TitanProps.P_LATTICE, 0.0))
	b.box(Vector3(x - hw, DECK_Y, z1), Vector3(x + hw, DECK_Y + 0.02, z0), Vector2(TitanProps.P_DARK, 0), Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, false, 0)
	# the approaches down to the shore either end
	b.box(Vector3(x - hw, TitanCity.PLAZA_Y, z0), Vector3(x + hw, DECK_Y, z0 + 0.6), Vector2(TitanProps.P_CONCRETE, 0))
	b.box(Vector3(x - hw, TitanCity.PLAZA_Y, z1 - 0.6), Vector3(x + hw, DECK_Y, z1), Vector2(TitanProps.P_CONCRETE, 0))
	# the towers: two legs, three portal struts, a beacon each side
	for tz in TOWER_Z:
		for s in [-1.0, 1.0]:
			var lx: float = x + (hw + 0.05) * s
			b.box(Vector3(lx - 0.2, TitanCity.WATER_Y - 0.1, tz - 0.3), Vector3(lx + 0.2, TOWER_TOP, tz + 0.3), _paint(0.0))
			var top := Vector3(lx, TOWER_TOP, tz)
			b.box(top + Vector3(-0.05, 0.0, -0.05), top + Vector3(0.05, 0.12, 0.05), Vector2(TitanProps.P_BEACON, 0.3 if s > 0.0 else 0.8))
		for h in [DECK_Y - 0.5, 6.9, TOWER_TOP - 0.45]:
			b.box(Vector3(x - hw, h - 0.25, tz - 0.22), Vector3(x + hw, h + 0.25, tz + 0.22), _paint(0.0), Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, true)
		# the pier it stands on
		b.box(Vector3(x - hw - 0.5, TitanCity.WATER_Y - 0.2, tz - 0.6), Vector3(x + hw + 0.5, TitanCity.WATER_Y + 0.35, tz + 0.6), Vector2(TitanProps.P_CONCRETE, 0))
	# the main cables: from the anchorages up over the towers' saddles, sagging across each span
	var ta: float = TOWER_Z[0]
	var tb: float = TOWER_Z[1]
	var spans := [[z0 + 0.3, DECK_Y + 0.1, ta, TOWER_TOP - 0.05, 0.25], [ta, TOWER_TOP - 0.05, tb, TOWER_TOP - 0.05, 1.0], [tb, TOWER_TOP - 0.05, z1 - 0.3, DECK_Y + 0.1, 0.25]]
	for s in [-1.0, 1.0]:
		var cx: float = x + (hw + 0.05) * s
		for sp in spans:
			_cable(b, Vector3(cx, sp[1], sp[0]), Vector3(cx, sp[3], sp[2]), (sp[1] + sp[3]) * 0.5 - DECK_Y - CABLE_SAG if sp[4] > 0.5 else 0.6, 18)


## A main cable from a to b along z, hanging `sag` below its chord's middle (a ribbon in the
## bridge's plane, 1.2 m thick).
static func _cable(b: TitanBuild, a: Vector3, c: Vector3, sag: float, segs: int) -> void:
	var th := 0.07
	var prev := a
	for i in segs:
		var t := float(i + 1) / segs
		var p := a.lerp(c, t) - Vector3(0, sag * 4.0 * t * (1.0 - t), 0)
		b.face(prev - Vector3(0, th, 0), p - Vector3(0, th, 0), p + Vector3(0, th, 0), prev + Vector3(0, th, 0), Vector3(1, 0, 0), Vector2.ZERO, Vector2(1, 1), Vector2(TitanProps.P_CABLE, 0))
		prev = p


## The container terminal on the far shore: ship-to-shore cranes along the quay, their booms out
## over a container ship at the berth, the stacks of boxes behind.
static func _terminal(p: TitanProps) -> void:
	var b := p.steel
	var fy := TitanCity.PLAZA_Y + 0.02
	var qz := TitanCity.FAR_Z
	for i in CRANE_X.size():
		var cx: float = CRANE_X[i]
		var det := 4.0 if i % 2 == 0 else 2.0
		var g := 3.4
		# the portal: four legs, sills, the girder and the boom out over the water
		for lz in [qz - 0.4, qz - 2.4]:
			for s in [-1.0, 1.0]:
				b.box(Vector3(cx + s * 0.9 - 0.08, fy, lz - 0.08), Vector3(cx + s * 0.9 + 0.08, fy + g, lz + 0.08), _paint(det))
			b.box(Vector3(cx - 0.98, fy + g - 0.25, lz - 0.08), Vector3(cx + 0.98, fy + g, lz + 0.08), _paint(det), Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, true)
		for s in [-1.0, 1.0]:
			b.box(Vector3(cx + s * 0.5 - 0.1, fy + g, qz - 4.0), Vector3(cx + s * 0.5 + 0.1, fy + g + 0.3, qz + 4.2), _paint(det), Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, true)
		# the A-frame and its stays to the boom's tip and tail
		var apex := Vector3(cx, fy + g + 2.0, qz - 1.4)
		for s in [-1.0, 1.0]:
			b.beam(Vector3(cx + s * 0.5, fy + g + 0.3, qz - 0.6), apex + Vector3(s * 0.45, 0, 0), 0.12, 0.12, Vector3.FORWARD, _paint(det))
			b.beam(Vector3(cx + s * 0.5, fy + g + 0.3, qz - 2.2), apex + Vector3(s * 0.45, 0, 0), 0.12, 0.12, Vector3.FORWARD, _paint(det))
			b.beam(apex + Vector3(s * 0.45, 0, 0), Vector3(cx + s * 0.5, fy + g + 0.3, qz + 4.1), 0.04, 0.04, Vector3.UP, Vector2(TitanProps.P_CABLE, 0))
			b.beam(apex + Vector3(s * 0.45, 0, 0), Vector3(cx + s * 0.5, fy + g + 0.3, qz - 3.9), 0.04, 0.04, Vector3.UP, Vector2(TitanProps.P_CABLE, 0))
		b.box(apex + Vector3(-0.5, 0, -0.05), apex + Vector3(0.5, 0.1, 0.05), _paint(det))
		b.box(apex + Vector3(-0.06, 0.1, -0.06), apex + Vector3(0.06, 0.2, 0.06), Vector2(TitanProps.P_BEACON, float(i) * 0.17))
		# the machinery house at the boom's tail, the trolley's cab
		b.box(Vector3(cx - 0.45, fy + g + 0.3, qz - 3.9), Vector3(cx + 0.45, fy + g + 0.75, qz - 2.9), _paint(3.0))
		b.box(Vector3(cx - 0.18, fy + g - 0.25, qz + 0.4 + i * 0.3), Vector3(cx + 0.18, fy + g, qz + 0.8 + i * 0.3), _paint(3.0))
	# the ship at the berth: hull, white superstructure aft, boxes stacked on deck
	var sz := qz + 1.55
	var x0 := -36.0
	var x1 := -14.0
	var deck := TitanCity.WATER_Y + 1.15
	b.box(Vector3(x0, TitanCity.WATER_Y - 0.3, sz - 1.1), Vector3(x1, deck, sz + 1.1), Vector2(TitanProps.P_HULL, 0), Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, false)
	b.beam(Vector3(x1, deck - 0.6, sz), Vector3(x1 + 1.6, deck, sz), 1.2, 1.4, Vector3.UP, Vector2(TitanProps.P_HULL, 0))
	b.box(Vector3(x0 + 0.4, deck, sz - 1.0), Vector3(x0 + 2.0, deck + 1.9, sz + 1.0), Vector2(TitanProps.P_HULL, 1.0))
	b.box(Vector3(x0 + 0.9, deck + 1.9, sz - 0.2), Vector3(x0 + 1.3, deck + 2.5, sz + 0.2), Vector2(TitanProps.P_DARK, 0))
	var rng := RandomNumberGenerator.new()
	rng.seed = 0xb0a7
	# (a bay of boxes is one block, painted box by box: titan_prop's K_STACK)
	var x := x0 + 2.4
	while x < x1 - 0.8:
		var tiers := rng.randi_range(3, 6)
		b.box(Vector3(x - 0.4, deck, sz - 1.0), Vector3(x + 0.4, deck + tiers * 0.174, sz + 1.0), Vector2(TitanProps.P_STACK, 0))
		x += 0.84
	# the stacks behind the quay
	for bx in range(-34, 36, 3):
		for bz in [qz - 5.0, qz - 7.0, qz - 9.0]:
			if rng.randf() < 0.2:
				continue
			var tiers := rng.randi_range(1, 5)
			b.box(Vector3(bx - 1.2, fy, bz - 0.7), Vector3(bx + 1.2, fy + tiers * 0.174, bz + 0.7), Vector2(TitanProps.P_STACK, 0))


## The lighthouse at the harbour mouth, on the far shore's point: white, a red band, its lamp
## flashing out to sea.
static func _lighthouse(b: TitanBuild) -> void:
	var c := Vector3(TitanCity.MOUTH_X + 1.2, 0, TitanCity.FAR_Z - 1.2)
	var y0 := TitanCity.PLAZA_Y
	b.tube(c, 0.32, 0.22, y0, y0 + 1.7, 10, _paint(3.0))
	b.tube(c, 0.29, 0.27, y0 + 0.75, y0 + 1.05, 10, Vector2(TitanProps.P_PAINT, 5.0))
	b.tube(c, 0.3, 0.3, y0 + 1.7, y0 + 1.76, 10, Vector2(TitanProps.P_DARK, 0), Color.WHITE, Vector4.ZERO, true)
	b.tube(c, 0.14, 0.14, y0 + 1.76, y0 + 1.98, 8, Vector2(TitanProps.P_BEACON, 10.0))
	b.tube(c, 0.17, 0.0, y0 + 1.98, y0 + 2.14, 8, Vector2(TitanProps.P_PAINT, 5.0), Color.WHITE, Vector4.ZERO, false)


## Tower cranes over the building sites downtown: a lattice mast, the jib and its counter-jib,
## the counterweights, a beacon on top.
static func _tower_cranes(b: TitanBuild) -> void:
	var sites := [[Vector3(33.0, 0, 52.0), 9.5, 0.6], [Vector3(51.0, 0, 70.0), 12.0, 2.4], [Vector3(46.0, 0, 44.0), 8.0, 4.1], [Vector3(-28.0, 0, 64.0), 7.0, 1.1]]
	var y0 := TitanCity.PLAZA_Y
	for s in sites:
		var c: Vector3 = s[0]
		var h: float = s[1]
		var a: float = s[2]
		var m := 0.11
		var top := y0 + h
		# the mast's four lattice faces
		for k in 4:
			var r0 := Vector3(cos(k * PI / 2.0 + PI / 4.0), 0, sin(k * PI / 2.0 + PI / 4.0)) * m * 1.414
			var r1 := Vector3(cos((k + 1) * PI / 2.0 + PI / 4.0), 0, sin((k + 1) * PI / 2.0 + PI / 4.0)) * m * 1.414
			b.face(c + r0 + Vector3(0, y0, 0), c + r1 + Vector3(0, y0, 0), c + r1 + Vector3(0, top, 0), c + r0 + Vector3(0, top, 0), ((r0 + r1) * 0.5).normalized(), Vector2.ZERO, Vector2(h * 15.0 / 1.8, 1.0), Vector2(TitanProps.P_LATTICE, 1.0))
		var d := Vector3(cos(a), 0, sin(a))
		var jib := c + Vector3(0, top + 0.1, 0)
		b.beam(jib - d * 1.6, jib + d * 5.0, 0.12, 0.16, Vector3.UP, _paint(1.0))
		b.box(jib - d * 1.5 + Vector3(-0.12, -0.25, -0.12), jib - d * 1.1 + Vector3(0.12, -0.05, 0.12), Vector2(TitanProps.P_CONCRETE, 0))
		b.beam(c + Vector3(0, top, 0), c + Vector3(0, top + 0.75, 0), 0.09, 0.09, d, _paint(1.0))
		b.beam(c + Vector3(0, top + 0.75, 0), jib + d * 3.5, 0.02, 0.02, Vector3.UP, Vector2(TitanProps.P_CABLE, 0))
		b.beam(c + Vector3(0, top + 0.75, 0), jib - d * 1.4, 0.02, 0.02, Vector3.UP, Vector2(TitanProps.P_CABLE, 0))
		var tip := c + Vector3(0, top + 0.75, 0)
		b.box(tip + Vector3(-0.04, 0, -0.04), tip + Vector3(0.04, 0.08, 0.04), Vector2(TitanProps.P_BEACON, a))
		var end := jib + d * 5.0
		b.box(end + Vector3(-0.04, 0.08, -0.04), end + Vector3(0.04, 0.16, 0.04), Vector2(TitanProps.P_BEACON, a + 0.5))
		# the hook's line down to a load
		var hook := jib + d * 3.0
		b.beam(hook, hook - Vector3(0, h * 0.45, 0), 0.012, 0.012, d, Vector2(TitanProps.P_CABLE, 0))


## The hills round the bay, behind the far shore and away to the east: a ridge line in the haze.
static func _hills(b: TitanBuild) -> void:
	var segs := 56
	var base := TitanCity.PLAZA_Y - 0.5
	var rng := RandomNumberGenerator.new()
	rng.seed = 0x4111
	var prev_top := Vector3.ZERO
	var prev_bot := Vector3.ZERO
	# (from the open sea in the west-north-west round the north to the east)
	var a0 := deg_to_rad(-158.0)
	var a1 := deg_to_rad(-8.0)
	for i in segs + 1:
		var t := float(i) / segs
		var a := lerpf(a0, a1, t)
		var r := 150.0 + 60.0 * sin(t * 7.3 + 1.0) + rng.randf_range(-10.0, 10.0)
		var h := 9.0 + 7.0 * sin(t * 5.1 + 0.4) + 4.0 * sin(t * 13.7) + rng.randf_range(-1.5, 1.5)
		# low where the sea comes in at the west end
		h *= smoothstep(0.0, 0.14, t)
		var top := Vector3(cos(a) * r, base + maxf(1.0, h), sin(a) * r)
		var bot := Vector3(cos(a) * (r - 8.0), base, sin(a) * (r - 8.0))
		if i > 0:
			var nn := -Vector3(cos(a), -0.4, sin(a)).normalized()
			b.face(prev_bot, bot, top, prev_top, nn, Vector2.ZERO, Vector2.ONE, Vector2(TitanProps.P_HILL, 0))
		prev_top = top
		prev_bot = bot


## The rest of the city beyond the blocks that are built: low boxes off into the haze to the
## south, east and west, a few taller ones.
static func _far_city(b: TitanBuild) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 0xc17
	var y0 := TitanCity.PLAZA_Y
	for i in 70:
		var a := rng.randf_range(deg_to_rad(4.0), deg_to_rad(176.0))
		var r := rng.randf_range(95.0, 170.0)
		var c := Vector3(cos(a) * r, 0, sin(a) * r)
		var w := rng.randf_range(4.0, 10.0)
		var d := rng.randf_range(4.0, 9.0)
		var h := rng.randf_range(0.8, 3.0) * (3.0 if rng.randf() < 0.12 else 1.0)
		b.box(Vector3(c.x - w * 0.5, y0, c.z - d * 0.5), Vector3(c.x + w * 0.5, y0 + h, c.z + d * 0.5), Vector2(TitanProps.P_FARCITY, float(i)), Color.WHITE, Vector4.ZERO, Vector4.ZERO, true, false, 15, rng.randf_range(0.0, PI))
