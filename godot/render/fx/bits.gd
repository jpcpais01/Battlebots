## Metal torn loose by hits (port of src/render/bits.ts Bits): jagged shards of armour plate,
## curled strips, nuts, bolts and washers. Real-world sized, they come off hard and fast with
## the blow, the freshly torn ones glowing orange and trailing sparks and smoke while they cool;
## they clatter down, skid and lie on the canvas, piling up as a fight wears on. Purely visual.
##
## Only the fragments still moving (or cooling, or being swept away) cost any GDScript in a
## frame: one lying cold on the canvas is skipped until its time is up.
class_name FxBits
extends Node3D

## Slots per kind of fragment.
const PER := 64
## How long a fragment lies on the canvas before it's swept away (s).
const LIFE := 11.0
const KINDS := 7
## Kinds (each its own instanced mesh; the shapes are bits.ts's, baked by tools/bake/web/fx_bake.ts).
enum { SHARD_A, SHARD_B, SHARD_C, STRIP, NUT, BOLT, WASHER }
## Half-thickness of each kind lying flat, at unit scale.
const REST := [0.035, 0.035, 0.035, 0.05, 0.28, 0.24, 0.05]
const SHADER := preload("res://render/fx/bits.gdshader")
const MESHES := preload("res://assets/fx/bits.res")

enum { DEAD, FLYING, SETTLED, COLD }

## A fragment landed hard enough to hear: (where: Vector3, how hard 0..1).
var on_clink := Callable()
var clock := 0.0
var _pools: Array[FxPool] = []
var _next := PackedInt32Array()
var _pos := PackedVector3Array()
var _vel := PackedVector3Array()
var _spin := PackedVector3Array()
var _scale := PackedVector3Array()
var _q: Array[Quaternion] = []
var _born := PackedFloat64Array()
var _heat := PackedFloat32Array()
var _drag := PackedFloat32Array()
var _rest := PackedFloat32Array()
var _col := PackedColorArray()
var _state := PackedByteArray()
## Indices of the fragments alive.
var _live := PackedInt32Array()


func _init() -> void:
	var n := PER * KINDS
	_next.resize(KINDS)
	_pos.resize(n)
	_vel.resize(n)
	_spin.resize(n)
	_scale.resize(n)
	_q.resize(n)
	_q.fill(Quaternion.IDENTITY)
	_born.resize(n)
	_heat.resize(n)
	_drag.resize(n)
	_rest.resize(n)
	_col.resize(n)
	_state.resize(n)
	var plate := _material(0.75, 0.42)
	var hardware := _material(0.9, 0.3)
	for kind in KINDS:
		var m := ArrayMesh.new()
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, MESHES.surface_get_arrays(kind))
		var pool := FxPool.new(PER, m, SHADER, true, true)
		pool.material_override = plate if kind <= STRIP else hardware
		add_child(pool)
		_pools.append(pool)


func _material(metalness: float, roughness: float) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("metalness", metalness)
	mat.set_shader_parameter("roughness", roughness)
	mat.set_shader_parameter("heat_glow", Fx.glow(3.2))
	return mat


## Tears `count` fragments loose at p, thrown along `dir` (the way the blow went) and out
## sideways. `power` 0..1 sets how fast and how hot; `paint` colours the plating (web hex).
func spawn(p: Vector3, dir: Vector3, count: int, paint, power := 0.5) -> void:
	var pw := clampf(power, 0.0, 1.0)
	var paint_lin := Fx.col(paint)
	for n in count:
		var r := randf()
		var kind: int = int(randf() * 3) if r < 0.5 else (STRIP if r < 0.62 else (NUT if r < 0.8 else (BOLT if r < 0.92 else WASHER)))
		var i := _next[kind]
		_next[kind] = (i + 1) % PER
		var gi := kind * PER + i
		if _state[gi] == DEAD:
			_live.append(gi)
		_state[gi] = FLYING
		_born[gi] = clock
		_pos[gi] = p + Fx.rand_dir() * 0.03
		# mostly on through with the blow, the rest bursting out across the plate
		var v := (Vector3(randf() * 2 - 1, randf() * 1.4 - 0.2, randf() * 2 - 1) * 0.9 + dir * 1.1).normalized()
		_vel[gi] = v * ((4.0 + pw * 9.0) * (0.35 + pow(randf(), 0.7) * 0.95))
		_q[gi] = Quaternion.from_euler(Vector3(randf() * 6.3, randf() * 6.3, randf() * 6.3))
		var plate := kind <= STRIP
		_spin[gi] = Fx.rand_dir() * ((25.0 if plate else 15.0) + randf() * 40.0 * (0.5 + pw))
		# freshly torn plate is hot; hardware just gets ripped out
		if plate:
			_heat[gi] = 0.55 + randf() * 0.45 if randf() < 0.3 + pw * 0.5 else randf() * 0.25
		else:
			_heat[gi] = 0.0
		var c: Color
		if plate:
			var k := (0.035 if kind == STRIP else 0.022) + randf() * 0.03 + (0.03 if randf() < pw * 0.25 else 0.0)
			_scale[gi] = Vector3(k * (0.85 + randf() * 0.3), k * (0.7 + randf() * 0.6), k * (0.85 + randf() * 0.3))
			_drag[gi] = 1.1 + randf() * 0.8
			# scuffed paint, or bare and blued steel where it sheared
			if randf() < 0.35:
				c = Color(0.32, 0.33, 0.35) * (0.7 + randf() * 0.5)
			else:
				c = (paint_lin * (0.45 + randf() * 0.3)).lerp(Color(0.18, 0.18, 0.18), 0.25)
		else:
			var k := 0.015 + randf() * 0.007 if kind == NUT else (0.032 + randf() * 0.018 if kind == BOLT else 0.016 + randf() * 0.01)
			_scale[gi] = Vector3(k, k, k)
			_drag[gi] = 0.12
			# zinc plate, black oxide, or the odd brass fitting
			var t := randf()
			c = Color(0.55, 0.56, 0.58) if t < 0.5 else (Color(0.09, 0.09, 0.1) if t < 0.88 else Color(0.62, 0.45, 0.22))
		c.a = 1.0
		_col[gi] = c
		_rest[gi] = REST[kind] * _scale[gi].y
		_write(gi, 1.0)
		_pools[kind].expires = clock + LIFE


func _write(gi: int, fade: float) -> void:
	var xf := Transform3D(Basis(_q[gi]) * Basis.from_scale(_scale[gi] * fade), _pos[gi])
	_pools[gi / PER].put_xform(gi % PER, xf, _col[gi], Color(_heat[gi], 0, 0, 0))


## Steps the fragments; `fx` gets a frag_trail() call for each hot one in flight, so it can
## stream sparks and smoke behind it.
func update(dt: float, fx: Fx = null) -> void:
	if dt > 0.0 and not _live.is_empty():
		var j := 0
		for n in _live.size():
			var gi := _live[n]
			var age := clock + dt - _born[gi]
			if age > LIFE:
				_state[gi] = DEAD
				_pools[gi / PER].hide_slot(gi % PER)
				continue
			_live[j] = gi
			j += 1
			var st := _state[gi]
			if st == COLD and age < LIFE - 0.4:
				continue
			_step(gi, st, age, dt, fx)
		_live.resize(j)
	clock += dt
	for p in _pools:
		p.flush(clock)


func _step(gi: int, st: int, age: float, dt: float, fx: Fx) -> void:
	var kind := gi / PER
	# cools fast in the air, then slowly on the deck
	var heat := maxf(0.0, _heat[gi] - dt * (0.6 if st == FLYING else 0.35))
	_heat[gi] = heat
	if st == FLYING:
		var v := _vel[gi]
		var p := _pos[gi]
		var spin := _spin[gi]
		var q := _q[gi]
		var plate := kind <= STRIP
		var sp := v.length()
		# quadratic-ish air drag: a flat shard brakes hard, a nut barely
		v *= exp(-_drag[gi] * dt * (0.4 + sp * 0.08))
		v.y -= 9.8 * dt
		p += v * dt
		if heat > 0.3 and sp > 2.5 and fx != null:
			fx.frag_trail(p, v, heat)
		var g := FxDebris.ground_at(p.x, p.z) + _rest[gi]
		if p.y <= g:
			p.y = g
			var down := -v.y
			if down > 0.9:
				# a hard landing: clank, a low dead bounce, and it skids on
				if down > 1.6 and on_clink.is_valid():
					on_clink.call(p, minf(1.0, down / 7.0) * (0.7 if plate else 1.0))
				v.y = down * (0.12 + randf() * 0.12 if plate else 0.2 + randf() * 0.15)
				v.x *= 0.55
				v.z *= 0.55
				spin = spin * 0.5 + Fx.rand_dir() * (down * 3.0)
			else:
				v.y = 0.0
				# a bolt rolls, flat metal grinds to a stop
				var fr := exp(-(2.2 if kind == BOLT else (9.0 if plate else 4.5)) * dt)
				v.x *= fr
				v.z *= fr
				spin *= exp(-12.0 * dt)
				if v.x * v.x + v.z * v.z < 0.0004 and spin.length_squared() < 0.05:
					st = SETTLED
			if v.y == 0.0 or st == SETTLED:
				# lie down: plate and nuts flat, a bolt on its side
				var a := q * Vector3.UP
				var t := Vector3(a.x, 0, a.z).normalized() if kind == BOLT else Vector3(0, 1.0 if a.y >= 0.0 else -1.0, 0)
				if t.length_squared() > 0.5:
					var to := a.lerp(t, 1.0 - exp(-14.0 * dt)).normalized()
					if a.dot(to) < 0.999999:
						q = (Quaternion(a, to) * q).normalized()
		var w := spin.length()
		if w > 1e-3:
			q = (Quaternion(spin / w, w * dt) * q).normalized()
		_vel[gi] = v
		_pos[gi] = p
		_spin[gi] = spin
		_q[gi] = q
	elif heat <= 0.0 and age < LIFE - 0.4:
		st = COLD
	_state[gi] = st
	# swept off at the end: a quick shrink once it's long cold and still
	_write(gi, minf(1.0, (LIFE - age) / 0.4))


func clear() -> void:
	for gi in _live:
		_state[gi] = DEAD
	_live.clear()
	for p in _pools:
		p.clear()
