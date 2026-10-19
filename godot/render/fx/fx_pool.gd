## A ring of GPU-animated particles: one MultiMesh, one draw. A particle is written once when it
## is born (its 20 floats: a 3x4 "transform" that is really spawn data, a colour and a custom
## vec4) and its shader works out where it is from then on, so a frame costs one uniform, not a
## loop over the pool. Used by Fx, FxSparks, FxSteam and FxOil.
##
## Packing (the shader reads MODEL_MATRIX, so the node stays at the origin): put() takes the
## shader's columns: c0 = MODEL_MATRIX[0].xyz, c1 = [1], c2 = [2], o = [3] (the origin).
## The 12 transform floats are full precision everywhere; colour and custom may be half floats
## (the Compatibility renderer packs them), so times and positions never go there.
class_name FxPool
extends MultiMeshInstance3D

const STRIDE := 20

var count := 0
var buf := PackedFloat32Array()
## Slot the next particle takes (oldest first, like the web's ring buffers).
var next := 0
## Clock time after which nothing in the pool is alive (the pool is hidden then).
var expires := -1.0
var mat: ShaderMaterial
var _used := 0
var _dirty := false
var _colors := true
var _custom := true
var _stride := 20
var _warming := false
## Every pool made (they live as long as the app), for warm().
static var _all: Array[FxPool] = []


func _init(n: int, mesh: Mesh, shader: Shader, colors := true, custom := true) -> void:
	count = n
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = colors
	mm.use_custom_data = custom
	mm.mesh = mesh
	mm.instance_count = n
	mm.visible_instance_count = 0
	multimesh = mm
	_colors = colors
	_custom = custom
	_stride = 12 + (4 if colors else 0) + (4 if custom else 0)
	buf.resize(n * _stride)
	mat = ShaderMaterial.new()
	mat.shader = shader
	material_override = mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# the instance "transforms" are data, so the engine can't bound them: never cull
	custom_aabb = AABB(Vector3(-500, -500, -500), Vector3(1000, 1000, 1000))
	ignore_occlusion_culling = true
	top_level = true
	visible = false
	_all.append(self)


## Draw one (empty) particle of every pool nothing is using, or stop (warm(false)): done behind
## the loading screen, so each pool's look is ready before the first hit that needs it, not
## made on that frame.
static func warm(on: bool) -> void:
	for p in _all:
		if not is_instance_valid(p):
			continue
		if on and p._used == 0 and not p._warming:
			p._warming = true
			p.expires = INF
			p.multimesh.visible_instance_count = 1
			p.visible = true
		elif not on and p._warming:
			p._warming = false
			if p._used == 0:
				p.expires = -1.0
				p.multimesh.visible_instance_count = 0
				p.visible = false


func stride() -> int:
	return _stride


## Claims the next slot and returns the offset of its floats.
func slot() -> int:
	var i := next
	next = (i + 1) % count
	if i >= _used:
		_used = i + 1
	_dirty = true
	return i * _stride


## One particle: the shader's columns c0, c1, c2 and origin o, then colour and custom.
func put(c0: Vector3, c1: Vector3, c2: Vector3, o: Vector3, col := Color(1, 1, 1, 1), cus := Color(0, 0, 0, 0)) -> int:
	var at := slot()
	buf[at] = c0.x
	buf[at + 1] = c1.x
	buf[at + 2] = c2.x
	buf[at + 3] = o.x
	buf[at + 4] = c0.y
	buf[at + 5] = c1.y
	buf[at + 6] = c2.y
	buf[at + 7] = o.y
	buf[at + 8] = c0.z
	buf[at + 9] = c1.z
	buf[at + 10] = c2.z
	buf[at + 11] = o.z
	var k := at + 12
	if _colors:
		buf[k] = col.r
		buf[k + 1] = col.g
		buf[k + 2] = col.b
		buf[k + 3] = col.a
		k += 4
	if _custom:
		buf[k] = cus.r
		buf[k + 1] = cus.g
		buf[k + 2] = cus.b
		buf[k + 3] = cus.a
	return at


## A real transform (for pools drawn with ordinary instancing).
func put_xform(i: int, xf: Transform3D, col := Color(1, 1, 1, 1), cus := Color(0, 0, 0, 0)) -> void:
	if i >= _used:
		_used = i + 1
	_dirty = true
	put_at(i * _stride, xf.basis.x, xf.basis.y, xf.basis.z, xf.origin, col, cus)


func put_at(at: int, c0: Vector3, c1: Vector3, c2: Vector3, o: Vector3, col: Color, cus: Color) -> void:
	_dirty = true
	buf[at] = c0.x
	buf[at + 1] = c1.x
	buf[at + 2] = c2.x
	buf[at + 3] = o.x
	buf[at + 4] = c0.y
	buf[at + 5] = c1.y
	buf[at + 6] = c2.y
	buf[at + 7] = o.y
	buf[at + 8] = c0.z
	buf[at + 9] = c1.z
	buf[at + 10] = c2.z
	buf[at + 11] = o.z
	var k := at + 12
	if _colors:
		buf[k] = col.r
		buf[k + 1] = col.g
		buf[k + 2] = col.b
		buf[k + 3] = col.a
		k += 4
	if _custom:
		buf[k] = cus.r
		buf[k + 1] = cus.g
		buf[k + 2] = cus.b
		buf[k + 3] = cus.a


## Hides slot i (a zero transform draws nothing).
func hide_slot(i: int) -> void:
	var at := i * _stride
	for k in 12:
		buf[at + k] = 0.0
	_dirty = true


## Sets how many slots are drawn (pools that pack their live instances to the front).
func set_used(n: int) -> void:
	if n != _used:
		_used = n
		_dirty = true


## Per frame: the shader clock, visibility, and the upload if anything was born.
func flush(clock: float) -> void:
	visible = _warming or (clock < expires and _used > 0)
	# (a material's every parameter change rebuilds its uniform buffer: a hidden pool's clock waits)
	if visible:
		mat.set_shader_parameter("now", clock)
	if _dirty:
		_dirty = false
		RenderingServer.multimesh_set_buffer(multimesh.get_rid(), buf)
		multimesh.visible_instance_count = _used


## Kills everything (a new fight).
func clear() -> void:
	buf.fill(0.0)
	next = 0
	_used = 0
	expires = -1.0
	_dirty = true
	visible = false
