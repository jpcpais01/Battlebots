## Mesh buffers for the titan city (render/titan): vertices with a normal, two UVs, a colour and
## two custom vec4s, built up with vert/tri/quad and the shape helpers (box, prism, tube), then
## made into an ArrayMesh with make(). TitanRing and TitanCity build every piece of the venue
## with these.
class_name TitanBuild
extends RefCounted

var v := PackedVector3Array()
var n := PackedVector3Array()
var uv := PackedVector2Array()
var uv2 := PackedVector2Array()
var col := PackedColorArray()
var c0 := PackedFloat32Array()
var c1 := PackedFloat32Array()
var idx := PackedInt32Array()
## Whether the mesh carries CUSTOM0 and CUSTOM1 (set before make()).
var custom := false


func vert(p: Vector3, nn: Vector3, u := Vector2.ZERO, u2 := Vector2.ZERO, c := Color.WHITE, a0 := Vector4.ZERO, a1 := Vector4.ZERO) -> int:
	v.append(p)
	n.append(nn)
	uv.append(u)
	uv2.append(u2)
	col.append(c)
	c0.append_array([a0.x, a0.y, a0.z, a0.w])
	c1.append_array([a1.x, a1.y, a1.z, a1.w])
	return v.size() - 1


## A triangle facing the side its vertices' normals point to (Godot's front faces wind clockwise
## as seen from the front).
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


## A flat four-sided face from its corners (in order round it), facing `nn`. UV: `u0`..`u1` across
## its corners in the same order (a->u0, b->(u1.x,u0.y), c->u1, d->(u0.x,u1.y)).
func face(a: Vector3, b: Vector3, c: Vector3, d: Vector3, nn: Vector3, u0 := Vector2.ZERO, u1 := Vector2.ONE, u2 := Vector2.ZERO, cc := Color.WHITE, a0 := Vector4.ZERO, a1 := Vector4.ZERO) -> void:
	var i0 := vert(a, nn, u0, u2, cc, a0, a1)
	var i1 := vert(b, nn, Vector2(u1.x, u0.y), u2, cc, a0, a1)
	var i2 := vert(c, nn, u1, u2, cc, a0, a1)
	var i3 := vert(d, nn, Vector2(u0.x, u1.y), u2, cc, a0, a1)
	quad(i0, i1, i2, i3)


## An upright box from `lo` to `hi` turned `yaw` about its own vertical axis through (cx, cz). Its
## walls' UV is (metres along the wall from its left edge, height above `lo`), the top's its world
## xz. `bottom`: draw the underside too. `sides`: which walls to draw (bits: 1 -x, 2 +x, 4 -z, 8 +z).
func box(lo: Vector3, hi: Vector3, u2 := Vector2.ZERO, cc := Color.WHITE, a0 := Vector4.ZERO, a1 := Vector4.ZERO, top := true, bottom := false, sides := 15, yaw := 0.0) -> void:
	var c := (lo + hi) * 0.5
	var b := Basis(Vector3.UP, yaw)
	var p := func(x: float, y: float, z: float) -> Vector3:
		return Vector3(c.x, 0.0, c.z) + b * Vector3(x - c.x, 0.0, z - c.z) + Vector3(0.0, y, 0.0)
	var h := hi.y - lo.y
	var wx := hi.x - lo.x
	var wz := hi.z - lo.z
	# -x wall (looking at it from outside: left edge at +z)
	if sides & 1:
		face(p.call(lo.x, lo.y, hi.z), p.call(lo.x, lo.y, lo.z), p.call(lo.x, hi.y, lo.z), p.call(lo.x, hi.y, hi.z), b * Vector3.LEFT, Vector2(0, 0), Vector2(wz, h), u2, cc, a0, a1)
	if sides & 2:
		face(p.call(hi.x, lo.y, lo.z), p.call(hi.x, lo.y, hi.z), p.call(hi.x, hi.y, hi.z), p.call(hi.x, hi.y, lo.z), b * Vector3.RIGHT, Vector2(0, 0), Vector2(wz, h), u2, cc, a0, a1)
	if sides & 4:
		face(p.call(lo.x, lo.y, lo.z), p.call(hi.x, lo.y, lo.z), p.call(hi.x, hi.y, lo.z), p.call(lo.x, hi.y, lo.z), b * Vector3.FORWARD, Vector2(0, 0), Vector2(wx, h), u2, cc, a0, a1)
	if sides & 8:
		face(p.call(hi.x, lo.y, hi.z), p.call(lo.x, lo.y, hi.z), p.call(lo.x, hi.y, hi.z), p.call(hi.x, hi.y, hi.z), b * Vector3.BACK, Vector2(0, 0), Vector2(wx, h), u2, cc, a0, a1)
	if top:
		var q0: Vector3 = p.call(lo.x, hi.y, lo.z)
		var q1: Vector3 = p.call(hi.x, hi.y, lo.z)
		var q2: Vector3 = p.call(hi.x, hi.y, hi.z)
		var q3: Vector3 = p.call(lo.x, hi.y, hi.z)
		var i0 := vert(q0, Vector3.UP, Vector2(q0.x, q0.z), u2, cc, a0, a1)
		var i1 := vert(q1, Vector3.UP, Vector2(q1.x, q1.z), u2, cc, a0, a1)
		var i2 := vert(q2, Vector3.UP, Vector2(q2.x, q2.z), u2, cc, a0, a1)
		var i3 := vert(q3, Vector3.UP, Vector2(q3.x, q3.z), u2, cc, a0, a1)
		quad(i0, i1, i2, i3)
	if bottom:
		face(p.call(lo.x, lo.y, hi.z), p.call(hi.x, lo.y, hi.z), p.call(hi.x, lo.y, lo.z), p.call(lo.x, lo.y, lo.z), Vector3.DOWN, Vector2(0, 0), Vector2(wx, wz), u2, cc, a0, a1)


## A box between two points of any slant (a beam, a strut): `w` wide and `d` deep across it,
## `up` the side its depth runs towards. UV: (along it, around it).
func beam(a: Vector3, b: Vector3, w: float, d: float, up := Vector3.UP, u2 := Vector2.ZERO, cc := Color.WHITE, a0 := Vector4.ZERO, caps := false) -> void:
	var ax := (b - a)
	var len := ax.length()
	if len < 1e-5:
		return
	var t := ax / len
	var s := t.cross(up)
	if s.length_squared() < 1e-6:
		s = t.cross(Vector3.RIGHT)
	s = s.normalized()
	var u := s.cross(t).normalized()
	var hw := s * (w * 0.5)
	var hd := u * (d * 0.5)
	var corners := [hw + hd, -hw + hd, -hw - hd, hw - hd]
	var norms := [u, -s, -u, s]
	var around := 0.0
	for k in 4:
		var e0: Vector3 = corners[k]
		var e1: Vector3 = corners[(k + 1) % 4]
		var nn: Vector3 = norms[k]
		var wd := (e1 - e0).length()
		face(a + e0, b + e0, b + e1, a + e1, nn, Vector2(0, around), Vector2(len, around + wd), u2, cc, a0)
		around += wd
	if caps:
		face(a + corners[0], a + corners[3], a + corners[2], a + corners[1], -t, Vector2.ZERO, Vector2(w, d), u2, cc, a0)
		face(b + corners[0], b + corners[1], b + corners[2], b + corners[3], t, Vector2.ZERO, Vector2(w, d), u2, cc, a0)


## A tapered tube (or cone, r1 = 0) round the vertical axis at `c` from y0 to y1, `segs` sides.
## UV: (metres round it, height above y0).
func tube(c: Vector3, r0: float, r1: float, y0: float, y1: float, segs: int, u2 := Vector2.ZERO, cc := Color.WHITE, a0 := Vector4.ZERO, cap := false, a_off := 0.0) -> void:
	var slope := (r0 - r1) / maxf(y1 - y0, 1e-5)
	var base := v.size()
	for i in segs + 1:
		var a := a_off + TAU * float(i) / segs
		var dir := Vector3(cos(a), 0, sin(a))
		var nn := (dir + Vector3(0, slope, 0)).normalized()
		vert(c + dir * r0 + Vector3(0, y0, 0), nn, Vector2(a * r0, 0.0), u2, cc, a0)
		vert(c + dir * r1 + Vector3(0, y1, 0), nn, Vector2(a * r1, y1 - y0), u2, cc, a0)
	for i in segs:
		var k := base + i * 2
		quad(k, k + 2, k + 3, k + 1)
	if cap and r1 > 0.0:
		var ci := vert(c + Vector3(0, y1, 0), Vector3.UP, Vector2(c.x, c.z), u2, cc, a0)
		var first := v.size()
		for i in segs + 1:
			var a := a_off + TAU * float(i) / segs
			var p := c + Vector3(cos(a) * r1, y1, sin(a) * r1)
			vert(p, Vector3.UP, Vector2(p.x, p.z), u2, cc, a0)
		for i in segs:
			tri(ci, first + i, first + i + 1)


## A horizontal disc (or annulus) at height y round c, facing up (or down).
func disc(c: Vector3, r_in: float, r_out: float, y: float, segs: int, up := true, u2 := Vector2.ZERO, cc := Color.WHITE, a0 := Vector4.ZERO) -> void:
	var nn := Vector3.UP if up else Vector3.DOWN
	var base := v.size()
	for i in segs + 1:
		var a := TAU * float(i) / segs
		var d := Vector3(cos(a), 0, sin(a))
		var p0 := c + d * r_in + Vector3(0, y, 0)
		var p1 := c + d * r_out + Vector3(0, y, 0)
		vert(p0, nn, Vector2(p0.x, p0.z), u2, cc, a0)
		vert(p1, nn, Vector2(p1.x, p1.z), u2, cc, a0)
	for i in segs:
		var k := base + i * 2
		quad(k, k + 2, k + 3, k + 1)


func make(mat: Material = null) -> ArrayMesh:
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
	if v.is_empty():
		return m
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, flags)
	if mat != null:
		m.surface_set_material(0, mat)
	return m
