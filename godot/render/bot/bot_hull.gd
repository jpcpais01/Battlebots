## The armour of one bone as a smooth signed distance field (negative inside), in the bone's frame:
## a port of src/render/contact.ts Hull. The field is built by the web code itself at bake time
## (godot/tools/bake/bake_parts.ts -> assets/bots/hulls.bin) and only read back here, through the
## same cubic B-spline, so both the distance and the way out change smoothly everywhere.
class_name BotHull
extends RefCounted

const BIN := "res://assets/bots/hulls.bin"
## Grid spacing across a field (bone units; contact.ts GH).
const GH := 0.025
const INV_GH := 1.0 / GH
## The bake's units: 1/10000 m.
const Q := 1.0 / 10000.0
## The uniform cubic B-spline's four weights at t (B3 t^3 + B2 t^2 + B1 t + B0) and their slopes
## (D2 t^2 + D1 t + D0), one weight per lane.
const B3 := Vector4(-1.0, 3.0, -3.0, 1.0) / 6.0
const B2 := Vector4(3.0, -6.0, 3.0, 0.0) / 6.0
const B1 := Vector4(-3.0, 0.0, 3.0, 0.0) / 6.0
const B0 := Vector4(1.0, 4.0, 1.0, 0.0) / 6.0
const D2 := Vector4(-0.5, 1.5, -1.5, 0.5)
const D1 := Vector4(1.0, -2.0, 1.0, 0.0)
const D0 := Vector4(-0.5, 0.0, 0.5, 0.0)
## Anything under the field's ceiling (contact.ts FAR = 0.24) counts as within reach.
const FAR_IN := 0.2399

var dy: float
var inv_dy: float
var ox: float
var oy: float
var oz: float
var nx: int
var ny: int
## The hull's own rows in z (the off-grid test); `stride` is how many are stored.
var nz: int
var stride: int
## The field while it loads (cleared after: f4 holds it).
var f: PackedFloat32Array
## The field, four x neighbours at a time: f4[o] = f[o .. o + 3], so the spline reads a row of
## its 4 x 4 x 4 block in one go and folds it with the engine's own 4 x 4 maths.
var f4: PackedVector4Array
## Per cell, the least of the 4 x 4 x 4 values a spline in that cell reads (a bound on it).
var low: PackedFloat32Array
## Where the field is closer than FAR (local box, its centre and radius): nothing outside is touched.
var lo: Vector3
var hi: Vector3
var centre: Vector3
var radius: float

static var _data: PackedByteArray
static var _table := {}
## Fields by key: a hull only depends on its armour, so robots wearing the same share one.
static var _cache := {}
static var _mutex := Mutex.new()


static func _open() -> void:
	if not _data.is_empty():
		return
	_data = FileAccess.get_file_as_bytes(BIN)
	assert(_data.size() > 12 and _data.slice(0, 4).get_string_from_ascii() == "BBHL", "missing " + BIN)
	var n := _data.decode_u32(8)
	var o := 12
	for i in n:
		var kl := _data.decode_u16(o)
		var key := _data.slice(o + 2, o + 2 + kl).get_string_from_utf8()
		o += 2 + kl
		_table[key] = [_data.decode_u32(o), _data.decode_u32(o + 4), _data.decode_u32(o + 8)]
		o += 12


## The torso's hull: the chest with the front unit of its core (botModel.ts shapes.torso).
static func torso(chest: int, core: int) -> BotHull:
	return _fetch("torso/%d/%d" % [chest, core])


static func head(look: int) -> BotHull:
	return _fetch("head/%d" % look)


static func pelvis(look: int) -> BotHull:
	return _fetch("pelvis/%d" % look)


static func _fetch(key: String) -> BotHull:
	_mutex.lock()
	_open()
	var h: BotHull = _cache.get(key)
	if h == null:
		h = _load(key)
		_cache[key] = h
		# a dozen covers two fighters and their next opponents (three hulls a robot; botModel.ts
		# keeps two dozen, but a field here is held four times over: f4, ~0.85 MB)
		if _cache.size() > 12:
			_cache.erase(_cache.keys()[0])
	_mutex.unlock()
	return h


static func _raw(key: String) -> PackedByteArray:
	var t: Array = _table[key]
	return _data.slice(t[0], t[0] + t[1]).decompress(t[2], FileAccess.COMPRESSION_ZSTD)


## Undo the bake's coding: second differences along each x row (minus the bare chest's field).
static func _codes(buf: PackedByteArray, nx: int) -> PackedInt32Array:
	var c := buf.slice(52).to_int32_array()
	var n := c.size()
	var i := 0
	while i < n:
		var a := c[i]
		var b := a + c[i + 1]
		c[i + 1] = b
		for k in range(i + 2, i + nx):
			var v := c[k] + 2 * b - a
			c[k] = v
			a = b
			b = v
		i += nx
	return c


static func _load(key: String) -> BotHull:
	var buf := _raw(key)
	var h := BotHull.new()
	h.dy = buf.decode_double(0)
	h.inv_dy = 1.0 / h.dy
	h.ox = buf.decode_double(8)
	h.oy = buf.decode_double(16)
	h.oz = buf.decode_double(24)
	h.nx = buf.decode_u32(32)
	h.ny = buf.decode_u32(36)
	h.nz = buf.decode_u32(40)
	h.stride = buf.decode_u32(44)
	var c := _codes(buf, h.nx)
	var n := c.size()
	h.f.resize(n)
	if buf.decode_u32(48) == 1:
		var ref := _codes(_raw("torsoBase/" + key.split("/")[1]), h.nx)
		for i in n:
			h.f[i] = (c[i] + ref[i]) * Q
	else:
		for i in n:
			h.f[i] = c[i] * Q
	h._reach_box()
	h._low()
	h._rows()
	# (only the loading reads the plain field)
	h.f = PackedFloat32Array()
	return h


## low[cell] = the least value over cells -1..+2 along each axis: three passes of a window of 4.
func _low() -> void:
	var a := f.duplicate()
	var b := PackedFloat32Array()
	b.resize(a.size())
	var n := a.size()
	for axis in 3:
		var step := 1 if axis == 0 else (nx if axis == 1 else stride * nx)
		var count := nx if axis == 0 else (stride if axis == 1 else ny)
		for o in n:
			var i := (o / step) % count
			var m := a[o]
			if i > 0:
				var v := a[o - step]
				if v < m:
					m = v
			if i + 1 < count:
				var v := a[o + step]
				if v < m:
					m = v
			if i + 2 < count:
				var v := a[o + 2 * step]
				if v < m:
					m = v
			b[o] = m
		var t := a
		a = b
		b = t
	low = a


## f4 from f (the last three entries, which no spline reads in full, stay zero).
func _rows() -> void:
	var n := f.size()
	f4.resize(n)
	for o in n - 3:
		f4[o] = Vector4(f[o], f[o + 1], f[o + 2], f[o + 3])


## The box (local) outside which the field reads FAR: every margin is less, so nothing there is
## touched. Grown by the two cells a spline reaches past its nearest value.
func _reach_box() -> void:
	var i0 := nx
	var i1 := -1
	var j0 := nz
	var j1 := -1
	var k0 := ny
	var k1 := -1
	var o := 0
	for k in ny:
		for j in stride:
			for i in nx:
				if f[o] < FAR_IN:
					i0 = mini(i0, i)
					i1 = maxi(i1, i)
					j0 = mini(j0, j)
					j1 = maxi(j1, j)
					k0 = mini(k0, k)
					k1 = maxi(k1, k)
				o += 1
	if i1 < 0:
		lo = Vector3.ZERO
		hi = Vector3.ZERO
		radius = -1.0
		return
	lo = Vector3(ox + (i0 - 2) * GH, oy + (k0 - 2) * dy, oz + (j0 - 2) * GH)
	hi = Vector3(ox + (i1 + 2) * GH, oy + (k1 + 2) * dy, oz + (j1 + 2) * GH)
	centre = (lo + hi) * 0.5
	radius = (hi - lo).length() * 0.5


## If local point p is closer than `margin` to the armour: the push (local) that takes it out to
## `margin` in xyz and how deep it is in w; else zero. Continuous, with a continuous direction.
func penetration(p: Vector3, margin: float) -> Vector4:
	var u := (p.x - ox) * INV_GH
	var v := (p.y - oy) * inv_dy
	var w := (p.z - oz) * INV_GH
	# off the grid is further than any margin
	if u < 1.0 or v < 1.0 or w < 1.0 or u >= nx - 2 or v >= ny - 2 or w >= nz - 2:
		return Vector4.ZERO
	var iu := int(u)
	var iv := int(v)
	var iw := int(w)
	var tu := u - iu
	var tv := v - iv
	var tw := w - iw
	var row_n := stride * nx
	# the spline is a weighted mean of the 64 values round it: none under the margin, no contact
	if low[iv * row_n + iw * nx + iu] >= margin:
		return Vector4.ZERO
	# uniform cubic B-spline weights and slopes (contact.ts bspline), as polynomials in t
	var tu2 := tu * tu
	var tv2 := tv * tv
	var tw2 := tw * tw
	var bu := B3 * (tu2 * tu) + B2 * tu2 + B1 * tu + B0
	var du := D2 * tu2 + D1 * tu + D0
	var bv := B3 * (tv2 * tv) + B2 * tv2 + B1 * tv + B0
	var dv := D2 * tv2 + D1 * tv + D0
	var bw := B3 * (tw2 * tw) + B2 * tw2 + B1 * tw + B0
	var dw := D2 * tw2 + D1 * tw + D0
	# each of the four y slices is a 4 x 4 block (z rows of x runs): folded along x by one
	# vector-matrix product (`v * P` dots v with each column, here each row of the field), the
	# x spline and its slope for the four rows; those four slices' rows are folded along z the
	# same way, and the y fold is a dot. 16 reads instead of 64, the sums in the engine's maths.
	var o := (iv - 1) * row_n + (iw - 1) * nx + iu - 1
	var n2 := nx + nx
	var n3 := n2 + nx
	var m := Projection(f4[o], f4[o + nx], f4[o + n2], f4[o + n3])
	var l0 := bu * m
	var x0 := du * m
	o += row_n
	m = Projection(f4[o], f4[o + nx], f4[o + n2], f4[o + n3])
	var l1 := bu * m
	var x1 := du * m
	o += row_n
	m = Projection(f4[o], f4[o + nx], f4[o + n2], f4[o + n3])
	var l2 := bu * m
	var x2 := du * m
	o += row_n
	m = Projection(f4[o], f4[o + nx], f4[o + n2], f4[o + n3])
	var l3 := bu * m
	var x3 := du * m
	var ls := Projection(l0, l1, l2, l3)
	var s0 := bw * ls
	var sz := dw * ls
	var sx := bw * Projection(x0, x1, x2, x3)
	var d := s0.dot(bv)
	var gx := sx.dot(bv)
	var gy := s0.dot(dv)
	var gz := sz.dot(bv)
	if d >= margin:
		return Vector4.ZERO
	gx *= INV_GH
	gy *= inv_dy
	gz *= INV_GH
	# the slope is 1 except deep inside, where ways out meet and it flattens: there the push
	# fades rather than flipping round with the gradient
	var k := (margin - d) / maxf(0.35, sqrt(gx * gx + gy * gy + gz * gz))
	return Vector4(gx * k, gy * k, gz * k, margin - d)
