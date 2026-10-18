## Particles, streaking sparks, flying nuts and bolts, impact flashes, swing trails, thruster
## flames and electric arcs (port of src/render/fx.ts Fx). The web simulates its particle pools
## on the CPU every frame; here every pool is GPU-animated (FxPool): a particle costs a few
## writes when it is born and nothing after, so a heavy exchange stays cheap on a phone.
##
## Colours: an int is a web hex colour (sRGB, like three's Color.set(0xrrggbb)), a Color is
## taken as linear.
class_name Fx
extends Node3D

const MAX_PARTICLES := 700
## Smoke puffs and metal flakes (alpha blended, so they can be dark).
const MAX_SMOKE := 420
const MAX_FLASHES := 32
const MAX_ARCS := 16
const FLAMES := 6
const POINTS_SHADER := preload("res://render/fx/fx_points.gdshader")
const SMOKE_SHADER := preload("res://render/fx/fx_smoke.gdshader")
const FLASH_SHADER := preload("res://render/fx/fx_flash.gdshader")
const ARC_SHADER := preload("res://render/fx/fx_arc.gdshader")
const TRAIL_SHADER := preload("res://render/fx/fx_trail.gdshader")
const FLAME_SHADER := preload("res://render/fx/fx_flame.gdshader")

## settings.ts RenderSettings.bloom: the Godot fight always has its glow (bloom) on.
static var bloom := true

var streaks: FxSparks
var bits: FxBits
var clock := 0.0
var _points: FxPool
var _smoke: FxPool
var _flashes: FxPool
var _arcs: FxPool
var _arc_slot := 0.0
var _frame := 0.0
var _flames: Array[MeshInstance3D] = []
var _flame_used := 0
var _trails: Array[FxTrail] = []


## settings.ts RenderSettings.glow: >1 feeds bloom.
static func glow(k: float) -> float:
	return k if bloom else 1.0 + (k - 1.0) * 0.12


## A web colour as linear: an int/float hex is sRGB (three's Color.set), a Color is linear already.
static func col(c) -> Color:
	if c is Color:
		return c
	var h := int(c)
	return Color8((h >> 16) & 255, (h >> 8) & 255, h & 255).srgb_to_linear()


## three's Vector3.randomDirection.
static func rand_dir() -> Vector3:
	var u := randf() * 2.0 - 1.0
	var t := randf() * TAU
	var s := sqrt(1.0 - u * u)
	return Vector3(s * cos(t), u, s * sin(t))


func _init() -> void:
	name = "Fx"
	streaks = FxSparks.new()
	add_child(streaks)
	bits = FxBits.new()
	add_child(bits)
	var quad := QuadMesh.new()
	quad.size = Vector2(1, 1)
	_points = FxPool.new(MAX_PARTICLES, quad, POINTS_SHADER, true, false)
	add_child(_points)
	_smoke = FxPool.new(MAX_SMOKE, quad, SMOKE_SHADER, true, true)
	# (drawn after the glows, like the web's renderOrder 1)
	_smoke.sorting_offset = -1.0
	add_child(_smoke)
	_flashes = FxPool.new(MAX_FLASHES, quad, FLASH_SHADER, true, false)
	add_child(_flashes)
	_arcs = FxPool.new(MAX_ARCS, _arc_mesh(), ARC_SHADER, false, false)
	_arcs.mat.set_shader_parameter("color", col(0x9ad8ff) * glow(3.0))
	add_child(_arcs)
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 0.07
	cone.height = 0.4
	cone.radial_segments = 10
	cone.rings = 0
	cone.cap_top = false
	cone.cap_bottom = false
	var fm := ShaderMaterial.new()
	fm.shader = FLAME_SHADER
	fm.set_shader_parameter("color", col(0xffa040) * glow(4.0))
	for i in FLAMES:
		var m := MeshInstance3D.new()
		m.mesh = cone
		m.material_override = fm
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		m.visible = false
		m.top_level = true
		add_child(m)
		_flames.append(m)


## Four branches of five line segments each: VERTEX = (branch, step, end).
static func _arc_mesh() -> ArrayMesh:
	var v := PackedVector3Array()
	for b in 4:
		for s in 5:
			v.append(Vector3(b, s, 0))
			v.append(Vector3(b, s, 1))
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_LINES, arr)
	return mesh


func _emit(p: Vector3, vx: float, vy: float, vz: float, color: Color, life: float, size: float, drag := 2.0, grav := 9.0) -> void:
	_points.put(Vector3(vx, vy, vz), Vector3(clock, life, size), Vector3(drag, grav, 0.0), p, color)
	_points.expires = maxf(_points.expires, clock + life)


func _emit_smoke(p: Vector3, vx: float, vy: float, vz: float, gray: float, life: float, size: float, grow: float, alpha: float, grav: float, drag: float) -> void:
	_smoke.put(Vector3(vx, vy, vz), Vector3(clock, life, size), Vector3(drag, grav, 0.0), p, Color(gray, gray, gray * 1.05), Color(grow, alpha, 0, 0))
	_smoke.expires = maxf(_smoke.expires, clock + life)


## A puff of coloured dust or smoke (linear `c`): the titans' footfalls and landings (TitanFx).
func dust_puff(p: Vector3, v: Vector3, c: Color, life: float, size: float, grow: float, alpha: float, grav := -0.05, drag := 1.6) -> void:
	_smoke.put(v, Vector3(clock, life, size), Vector3(drag, grav, 0.0), p, c, Color(grow, alpha, 0, 0))
	_smoke.expires = maxf(_smoke.expires, clock + life)


## Small hot or dusty specks thrown from p (TitanFx: clods of turf and grit).
func specks(p: Vector3, v: Vector3, c: Color, life: float, size: float, drag := 1.0, grav := 9.0) -> void:
	_emit(p, v.x, v.y, v.z, c, life, size, drag, grav)


## Dark smoke rising from damaged machinery. `heat` 0..1 thickens and darkens it.
func smoke(p: Vector3, count := 1, heat := 0.5) -> void:
	for i in count:
		var at := p + Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * 0.06
		var g := 0.05 + randf() * 0.08 + (1.0 - heat) * 0.12
		_emit_smoke(at, (randf() - 0.5) * 0.25, 0.35 + randf() * 0.35, (randf() - 0.5) * 0.25, g, 1.1 + randf() * 0.9, 0.12 + heat * 0.08, 0.32 + heat * 0.2, 0.35 + heat * 0.3, -0.25, 1.2)


## A puff of cold white vapour (fog spilling from a lift shaft, a CO2 cannon) moving at (vx, vy, vz).
func vapor(p: Vector3, vx: float, vy: float, vz: float, size := 0.15) -> void:
	var at := Vector3(p.x + (randf() - 0.5) * 0.05, p.y, p.z + (randf() - 0.5) * 0.05)
	_emit_smoke(at, vx, vy, vz, 0.62 + randf() * 0.22, 0.9 + randf() * 0.8, size, 0.75, 0.38, 0.4, 2.2)


## A hot fragment in flight sheds sparks off its torn edge and drags a thread of smoke
## (FxBits calls this for every hot fragment still flying).
func frag_trail(p: Vector3, v: Vector3, heat: float) -> void:
	if randf() < 0.55 * heat:
		streaks.emit(p, v.x * 0.25 + (randf() - 0.5), v.y * 0.25 + randf() * 0.6, v.z * 0.25 + (randf() - 0.5), Color(1, 0.5, 0.12), 0.12 + randf() * 0.2, 0.004 + heat * 0.004)
	if randf() < 0.18 * heat:
		_emit_smoke(p, v.x * 0.05, 0.25, v.z * 0.05, 0.16, 0.5 + randf() * 0.4, 0.035, 0.5, 0.25 * heat, -0.2, 2.0)


## A camera-facing ribbon that follows a limb through its strikes (push() it each frame).
func make_trail(color, width := 0.16) -> FxTrail:
	var t := FxTrail.new(col(color) * glow(1.8), width)
	_trails.append(t)
	add_child(t)
	return t


## Drops a trail made by make_trail (a new fight's robots bring their own).
func remove_trail(t: FxTrail) -> void:
	_trails.erase(t)
	t.queue_free()


## Hot sparks thrown along `dir` (spread 0 = a jet, 1 = a wide fan).
func sparks(p: Vector3, dir: Vector3, count: int, color, speed := 6.0, spread := 1.0) -> void:
	streaks.spray(p, dir, count, col(color), speed, spread)


## The sparks of a blow landing, shaped by which way it travelled (`dir`) and how hard it was
## (k 0..1): a jet carried on past the contact in the direction of the blow, a flat sheet
## skating off sideways across the plate, a few ricochets kicking back, and a handful of very
## fast, short-lived streaks right at the contact that make the hit pop.
func impact(p: Vector3, dir: Vector3, k: float, color) -> void:
	var c := col(color)
	var sp := streaks
	sp.spray(p, dir, roundi(10 + k * 26), c, 6 + k * 6, 0.45, 1 + k * 0.4)
	# the sheet: perpendicular to the blow, glancing off the surface
	var t := Vector3(-dir.z, 0, dir.x)
	if t.length_squared() < 1e-4:
		t = Vector3(1, 0, 0)
	t = t.normalized()
	var b := dir.cross(t).normalized()
	for i in roundi(6 + k * 16):
		var a := randf() * TAU
		var v := (t * cos(a) + b * sin(a) + dir * 0.35).normalized()
		var s := (3.5 + k * 4.0) * (0.4 + randf() * 0.8)
		sp.emit(p, v.x * s, v.y * s + 0.6, v.z * s, c, 0.18 + randf() * 0.3, 0.006 + randf() * 0.006)
	# ricochets
	for i in 2 + roundi(k * 4):
		var v := (Vector3(randf() - 0.5, 0.5 + randf() * 0.5, randf() - 0.5) - dir * 0.9).normalized()
		var s := 2.5 + randf() * 2.5
		sp.emit(p, v.x * s, v.y * s, v.z * s, c, 0.4 + randf() * 0.4, 0.008)
	# the pop: a star of very fast, very short streaks
	var white := Color(1, 0.96, 0.88)
	for i in 4 + roundi(k * 5):
		var v := (Vector3(randf() * 2 - 1, randf() * 2 - 1, randf() * 2 - 1) * 0.8 + dir).normalized()
		var s := 16.0 + randf() * 10.0 + k * 8.0
		sp.emit(p, v.x * s, v.y * s, v.z * s, white, 0.05 + randf() * 0.04, 0.014 + k * 0.01, 6.0, 0.0)


## A ring of dust kicked off the canvas.
func dust(p: Vector3, count: int, strength := 1.0) -> void:
	var c := col(0x8a93a6) * 0.35
	for i in count:
		var a := randf() * TAU
		var s := (0.8 + randf() * 1.8) * strength
		_emit(Vector3(p.x + cos(a) * 0.2, 0.05, p.z + sin(a) * 0.2), cos(a) * s, 0.3 + randf() * 0.8, sin(a) * s, c, 0.8 + randf() * 0.6, 0.35 + randf() * 0.3, 2.5, -0.3)


## A ball of glowing motes.
func burst(p: Vector3, color, count := 30, speed := 3.0) -> void:
	var c := col(color) * glow(2.0)
	for i in count:
		var v := rand_dir() * (speed * (0.5 + randf() * 0.5))
		_emit(p, v.x, v.y, v.z, c, 0.4 + randf() * 0.3, 0.06, 3.0, 0.0)


## Energy siphon: motes flowing from a to b.
func siphon(a: Vector3, b: Vector3, color) -> void:
	var c := col(color) * glow(2.0)
	for i in 12:
		var v := (b - a) * (1.6 + randf())
		_emit(a + rand_dir() * 0.12, v.x, v.y + 0.6, v.z, c, 0.5, 0.05, 0.5, 0.0)


## A flash of light where something hit.
func flash(p: Vector3, color, size := 0.8, life := 0.14) -> void:
	_flashes.put(Vector3(clock, life, size), Vector3.ZERO, Vector3.ZERO, p, col(color) * glow(3.5))
	_flashes.expires = maxf(_flashes.expires, clock + life)


## Electric arcs crackling round `pos` for `t` seconds. (The web draws every arc in one
## colour whatever `color` says, and so does this.)
func arc(pos: Vector3, t := 0.4, _color = 0x9ad8ff) -> void:
	_arc_slot = fmod(_arc_slot + 1.0, 97.0)
	_arcs.put(Vector3(clock, t, _arc_slot), Vector3.ZERO, Vector3.ZERO, pos)
	_arcs.expires = maxf(_arcs.expires, clock + t)


## Attach a thruster flame for this frame. Call `begin_frame` first.
func flame(at: Vector3, dir: Vector3, scale := 1.0) -> void:
	if _flame_used >= _flames.size():
		return
	var m := _flames[_flame_used]
	_flame_used += 1
	m.visible = true
	var to := -dir.normalized()
	var q := Quaternion(Vector3.UP, to) if to.dot(Vector3.UP) > -0.9999 else Quaternion(Vector3.RIGHT, PI)
	var flick := 0.8 + randf() * 0.4
	m.transform = Transform3D(Basis(q) * Basis.from_scale(Vector3(scale, scale * flick, scale)), at)


func begin_frame() -> void:
	_flame_used = 0
	for f in _flames:
		f.visible = false


## Per frame (real time, not the fight's slowed clock): moves every effect on.
func update(dt: float, _camera: Camera3D = null) -> void:
	streaks.update(dt)
	bits.update(dt, self)
	clock += dt
	_frame += 1.0
	_points.flush(clock)
	_smoke.flush(clock)
	_flashes.flush(clock)
	_arcs.mat.set_shader_parameter("frame", _frame)
	_arcs.flush(clock)
	for t in _trails:
		t.update(clock)


## A clean slate (a new fight).
func clear() -> void:
	streaks.clear()
	bits.clear()
	_points.clear()
	_smoke.clear()
	_flashes.clear()
	_arcs.clear()
	begin_frame()
