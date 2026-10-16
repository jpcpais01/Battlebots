## Torn-off robot parts (port of src/render/debris.ts Debris): rigid pieces that fly off with
## the blow, tumble, bounce and skid across the canvas, glance off the ropes, and get scuffed
## along by the robots' feet. A piece that sails over the top rope keeps going: off the apron,
## over the barrier and into the stands, where it bounces down the rows and the fans around it
## go wild. They trail smoke and spit sparks for a while. Purely visual: the fight never reads
## them. Also home to groundAt, the height of whatever lies under a point (sparks, bits, oil).
class_name FxDebris
extends Node3D

## Top rope: anything flying above it clears the ring.
const TOP_ROPE := 1.35
const RING_CORNER := 5.0
## body.ts ROPE_LINE: the ropes' apothem.
const ROPE_LINE := 4.6193977
## The canvas and the steel base under it (apothems of their octagons).
const CANVAS := 5.1275089
const BASE := 5.3122844
## bowl.ts: the front row's half-extents and corner radius, the arena floor, the tiers.
const AX := 13.0
const AZ := 10.0
const RC := 7.0
const SX := AX - RC
const SZ := AZ - RC
const FLOOR := -0.62
const LOWER_ROWS := 15
const UPPER_ROWS := 18
const SUITE_D := 13.5
const UPPER_Y := 9.4
const ROOF_Y := 25.0
const BACK_D := SUITE_D + UPPER_ROWS * 0.85
const TUNNEL_ROWS := 6
const TUNNEL_W := 3.8
const TUNNEL_OPEN_HW := 1.48
const TUNNEL_D := TUNNEL_ROWS * 0.9
const GRAVITY := 9.81
## body.ts SIDE_NX/SIDE_NZ: outward normals of the octagon's sides (side k faces k * 45 degrees).
const SIDE_NX := [1.0, 0.70710678, 0.0, -0.70710678, -1.0, -0.70710678, 0.0, 0.70710678]
const SIDE_NZ := [0.0, 0.70710678, 1.0, 0.70710678, 0.0, -0.70710678, -1.0, -0.70710678]

## Out of doors: the height of whatever lies past the top of the lower tier (the venue sets it),
## or NAN in the indoor bowl (debris.ts outerGround).
static var outer_ground_y := NAN


class Piece:
	var obj: Node3D
	var pos: Vector3
	var q: Quaternion
	var scl: Vector3
	var vel: Vector3
	var spin: Vector3
	## Points on the hull (local) used for ground contact.
	var hull: Array[Vector3] = []
	## Rough radius, for the ropes and feet.
	var radius := 0.1
	var age := 0.0
	var rest := 0.0
	## Which side of the ropes it was on last step (signed distance past the rope line).
	var rope_out := 0.0
	## Seconds left of stirring up the fans around it (it's out in the crowd).
	var stir := 0.0
	## It has left the ring stage: it's the crowd's now.
	var loose := false
	## Fighter it came off (-1: nobody's).
	var owner := -1
	## Taken out of the physics (something else carries it now).
	var held := false


var _pieces: Array[Piece] = []


func _init() -> void:
	name = "Debris"
	top_level = true


## body.ts ropeSide: the side (0..7) whose ropes a point is up against.
static func rope_side(x: float, z: float) -> int:
	return posmod(roundi(atan2(z, x) / (PI / 4.0)), 8)


## How far a point sits out from the bowl's front-row outline (the bowl.ts `outline(d)` offset).
static func bowl_d(x: float, z: float) -> float:
	var qx := maxf(0.0, absf(x) - SX)
	var qz := maxf(0.0, absf(z) - SZ)
	return sqrt(qx * qx + qz * qz) - RC


## Height of whatever is underfoot at (x, z), all the way out to the back wall: the canvas, the
## stage base, the arena floor, the ringside barrier, the stepped rows of both tiers and the
## tunnel blocks (debris.ts groundAt).
static func ground_at(x: float, z: float) -> float:
	var side := rope_side(x, z)
	var oct: float = x * SIDE_NX[side] + z * SIDE_NZ[side]
	if oct < CANVAS:
		return 0.0
	if oct < BASE:
		return -0.12
	var d := bowl_d(x, z)
	if d < -0.6:
		return FLOOR
	# the barrier with its ad boards (open at the tunnel mouths)
	if d < -0.35:
		return FLOOR if absf(z) < TUNNEL_OPEN_HW and absf(x) > AX - 1.0 else 0.42
	if d < 0.0:
		return FLOOR
	if not is_nan(outer_ground_y) and d >= SUITE_D:
		return outer_ground_y
	if d >= BACK_D:
		return ROOF_Y
	if absf(z) < TUNNEL_W / 2.0 and absf(x) > AX and d < TUNNEL_D:
		return -0.1 + TUNNEL_ROWS * 0.42
	# the stepped rows: the lower tier's 0.9 m treads, then the upper tier's from the suite wall
	if d >= SUITE_D:
		return UPPER_Y + mini(UPPER_ROWS - 1, int((d - SUITE_D) / 0.85)) * 0.56
	return -0.1 + mini(LOWER_ROWS - 1, int(d / 0.9)) * 0.42


## Outward normal of the step/wall at (x, z): off the ring's octagon near it, the bowl's outline further out.
static func wall_normal(x: float, z: float) -> Vector3:
	var side := rope_side(x, z)
	if x * SIDE_NX[side] + z * SIDE_NZ[side] < BASE + 0.3:
		return Vector3(SIDE_NX[side], 0, SIDE_NZ[side])
	var qx := maxf(0.0, absf(x) - SX) * signf(x)
	var qz := maxf(0.0, absf(z) - SZ) * signf(z)
	var l := sqrt(qx * qx + qz * qz)
	return Vector3(qx / l, 0, qz / l) if l > 1e-4 else Vector3(signf(x) if x != 0.0 else 1.0, 0, 0)


## The piece's bounds in its own space: every mesh under it, merged.
static func _bounds(obj: Node3D) -> AABB:
	# (BotModel.detach_piece says where its metal is)
	if obj.has_meta("aabb"):
		return obj.get_meta("aabb")
	var box := AABB()
	var first := true
	var stack: Array = [[obj, Transform3D.IDENTITY]]
	while not stack.is_empty():
		var it: Array = stack.pop_back()
		var n: Node = it[0]
		var xf: Transform3D = it[1]
		if n is MeshInstance3D and (n as MeshInstance3D).mesh != null:
			var b: AABB = xf * (n as MeshInstance3D).get_aabb()
			box = b if first else box.merge(b)
			first = false
		for c in n.get_children():
			if c is Node3D:
				stack.append([c, xf * (c as Node3D).transform])
	if first:
		box = AABB(Vector3(-0.08, -0.08, -0.08), Vector3(0.16, 0.16, 0.16))
	return box


## Launch a piece (already placed in world space). `dir` is the blow's direction and `strength`
## its damage before blocking. `can_fly` lets a big blow send it out of the ring. Returns the
## piece: its position is where the fighter's torn joints now are (debris.ts's anchor).
func spawn(obj: Node3D, dir: Vector3, strength: float, can_fly := true, owner := -1) -> Node3D:
	if obj.get_parent() != null:
		obj.reparent(self, true)
	else:
		add_child(obj)
	var p := Piece.new()
	p.obj = obj
	var xf := obj.transform
	p.pos = xf.origin
	p.q = xf.basis.get_rotation_quaternion()
	p.scl = xf.basis.get_scale()
	# hull points from the geometry's bounds, a little inset so it rests on its plating
	var b := _bounds(obj)
	for i in 8:
		var c := Vector3(b.end.x if i & 1 else b.position.x, b.end.y if i & 2 else b.position.y, b.end.z if i & 4 else b.position.z)
		p.hull.append(c * 0.8)
	p.radius = maxf(0.06, (b.size * p.scl).length() * 0.35)
	# most pieces drop in the ring; a big enough blow sends one sailing out over the ropes
	var big := can_fly and randf() < minf(0.6, 0.2 + strength * 0.0035)
	var speed := 5.5 + randf() * 3.0 + minf(2.5, strength * 0.012) if big else 1.6 + minf(3.0, strength * 0.022)
	var vel := Vector3(dir.x, 0, dir.z).normalized() * speed
	vel.y = 4.0 + randf() * 1.8 if big else 2.0 + randf() * 1.4 + strength * 0.008
	vel.x += (randf() - 0.5) * 1.2
	vel.z += (randf() - 0.5) * 1.2
	p.vel = vel
	p.spin = Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5).normalized() * (7.0 + randf() * 9.0)
	var s0 := rope_side(p.pos.x, p.pos.z)
	p.rope_out = p.pos.x * SIDE_NX[s0] + p.pos.z * SIDE_NZ[s0] - ROPE_LINE
	p.owner = owner
	_pieces.append(p)
	return obj


## Take every piece that came off fighter `owner` out of the physics and hand it over (they stay
## here, and clear() still frees them): [{obj, lift}], lift being the height of its centre above
## whatever it lies on.
func hold(owner: int) -> Array:
	var out := []
	for p in _pieces:
		if p.owner != owner or p.held:
			continue
		p.held = true
		var lift := p.pos.y - ground_at(p.pos.x, p.pos.z) if p.rest > 0.2 else p.radius * 0.6
		out.append({"obj": p.obj, "lift": clampf(lift, 0.03, 0.3)})
	return out


func _lowest(p: Piece, basis: Basis) -> Vector3:
	var low := Vector3(0, INF, 0)
	for h in p.hull:
		var w := basis * h + p.pos
		if w.y < low.y:
			low = w
	return low


## Step every piece. `feet` are world positions that kick pieces about (the robots' feet).
## `on_land(p, speed)` fires on a hard landing; `on_crowd(p, k, first)` while a piece is out
## among the fans (where it is and how wild they go, 0..1).
func update(dt: float, fx: Fx, feet: Array, on_land := Callable(), on_crowd := Callable()) -> void:
	dt = minf(dt, 1.0 / 30.0)
	if dt <= 0.0:
		return
	for p in _pieces:
		if p.held:
			continue
		p.age += dt
		# the robots' feet scuff pieces along the canvas
		for f: Vector3 in feet:
			var dx := p.pos.x - f.x
			var dz := p.pos.z - f.z
			var d := sqrt(dx * dx + dz * dz)
			if d < p.radius + 0.12 and d > 1e-4 and f.y < p.pos.y + p.radius + 0.1:
				var push := (p.radius + 0.12 - d) * 14.0
				p.vel.x += dx / d * push
				p.vel.z += dz / d * push
				p.spin.y += (randf() - 0.5) * 6.0
				p.rest = 0.0
		if p.loose and p.stir > 0.0:
			p.stir -= dt
			if on_crowd.is_valid():
				on_crowd.call(p.pos, minf(1.0, p.stir / 3.0), false)
		if p.rest > 1.5:
			_trail(p, fx, dt)
			continue
		p.vel.y -= GRAVITY * dt
		var prev := p.pos
		p.pos += p.vel * dt
		var w := p.spin.length()
		if w > 1e-4:
			p.q = (Quaternion(p.spin / w, w * dt) * p.q).normalized()
		var basis := Basis(p.q) * Basis.from_scale(p.scl)
		# ground: the lowest hull point stays on whatever is under it (canvas, floor, a row of seats)
		var lowest := _lowest(p, basis)
		var low := lowest.y
		var floor_y := ground_at(p.pos.x, p.pos.z)
		# ran into a step or wall (the ground here is above where its underside just was): back out and bounce off
		if low < floor_y and prev.y - (p.pos.y - low) < floor_y - 0.05:
			p.pos.x = prev.x
			p.pos.z = prev.z
			var n := wall_normal(p.pos.x, p.pos.z)
			# flip the part of its motion that went into the wall, whichever way the wall faces
			var vn := p.vel.x * n.x + p.vel.z * n.z
			p.vel.x -= n.x * vn * 1.45
			p.vel.z -= n.z * vn * 1.45
			p.spin *= 0.7
			if absf(vn) > 1.5:
				if on_land.is_valid():
					on_land.call(p.pos, absf(vn))
				if fx != null:
					fx.sparks(p.pos, Vector3(-n.x * signf(vn), 0.4, -n.z * signf(vn)).normalized(), 5, 0xffb060, 2.5, 1.0)
			floor_y = ground_at(p.pos.x, p.pos.z)
			lowest = _lowest(p, basis)
			low = lowest.y
		if low < floor_y:
			p.pos.y += floor_y - low
			lowest.y = floor_y
			low = floor_y
			if p.vel.y < 0.0:
				var impact := -p.vel.y
				if impact > 1.2 and on_land.is_valid():
					on_land.call(lowest, impact)
				p.vel.y = impact * 0.32 if impact > 0.6 else 0.0
				# the contact corner drags: spin couples into sliding and dies down
				p.vel.x *= 0.72
				p.vel.z *= 0.72
				p.spin *= 0.6
				# tip over the contact corner a little, like a real lump of metal
				var arm := p.pos - lowest
				p.spin.x += arm.z * impact * 6.0
				p.spin.z -= arm.x * impact * 6.0
				if impact > 2.0 and fx != null:
					fx.sparks(lowest, Vector3(p.vel.x, 0.5, p.vel.z).normalized(), 6, 0xffb060, 3.0, 1.0)
			else:
				# sliding friction
				var k := exp(-dt * 4.0)
				p.vel.x *= k
				p.vel.z *= k
				p.spin *= exp(-dt * 5.0)
		# the ropes catch anything below the top rope, from either side; above it, it sails clean over
		var side := rope_side(p.pos.x, p.pos.z)
		var nx: float = SIDE_NX[side]
		var nz: float = SIDE_NZ[side]
		var past := p.pos.x * nx + p.pos.z * nz - ROPE_LINE
		var below := p.pos.y < TOP_ROPE + p.radius * 0.5
		if below and p.rope_out <= 0.0 and past > -p.radius - 0.1 and floor_y >= 0.0:
			# inside: the ropes bounce it back in
			var out := past + p.radius + 0.1
			p.pos.x -= nx * out
			p.pos.z -= nz * out
			var vn := p.vel.x * nx + p.vel.z * nz
			if vn > 0.0:
				p.vel.x -= nx * vn * 1.5
				p.vel.z -= nz * vn * 1.5
		elif below and p.rope_out > 0.0 and past < p.radius + 0.1:
			# outside (on the apron): the ropes keep it out
			var back := p.radius + 0.1 - past
			p.pos.x += nx * back
			p.pos.z += nz * back
			var vn := p.vel.x * nx + p.vel.z * nz
			if vn < 0.0:
				p.vel.x -= nx * vn * 1.5
				p.vel.z -= nz * vn * 1.5
		else:
			p.rope_out = past
		# off the stage: into the crowd's hands
		if not p.loose and bowl_d(p.pos.x, p.pos.z) > -2.5 and low <= floor_y + 0.05:
			p.loose = true
			p.stir = 6.0
			if on_crowd.is_valid():
				on_crowd.call(p.pos, 1.0, true)
		var moving := p.vel.length_squared() + p.spin.length_squared() * 0.01
		p.rest = p.rest + dt if low < floor_y + 0.01 and moving < 0.04 else 0.0
		p.obj.transform = Transform3D(Basis(p.q) * Basis.from_scale(p.scl), p.pos)
		_trail(p, fx, dt)


## Smoke and sparks off a torn piece, dying down over a few seconds.
func _trail(p: Piece, fx: Fx, dt: float) -> void:
	if fx == null:
		return
	var heat := maxf(0.0, 1.0 - p.age / 6.0)
	if heat <= 0.05:
		if randf() < dt * 0.6:
			fx.smoke(p.pos, 1, 0.1)
		return
	if randf() < dt * 14.0 * heat:
		fx.smoke(p.pos, 1, heat)
	if randf() < dt * 5.0 * heat:
		fx.sparks(p.pos, Vector3.UP, 3, 0xffa040, 2.5 * heat + 0.5, 1.0)


## Pieces still in play (not held).
func count() -> int:
	return _pieces.size()


func clear() -> void:
	for p in _pieces:
		if is_instance_valid(p.obj):
			p.obj.queue_free()
	_pieces.clear()
