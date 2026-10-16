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
var f: PackedFloat32Array
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
		# a couple of dozen covers two fighters and their next opponents (botModel.ts hullCache)
		if _cache.size() > 24:
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
	# uniform cubic B-spline weights and slopes (contact.ts bspline)
	var su := 1.0 - tu
	var u2 := tu * tu
	var u3 := u2 * tu
	var bu0 := su * su * su / 6.0
	var bu1 := (3.0 * u3 - 6.0 * u2 + 4.0) / 6.0
	var bu2 := (-3.0 * u3 + 3.0 * u2 + 3.0 * tu + 1.0) / 6.0
	var bu3 := u3 / 6.0
	var du0 := -0.5 * su * su
	var du1 := 1.5 * u2 - 2.0 * tu
	var du2 := -1.5 * u2 + tu + 0.5
	var du3 := 0.5 * u2
	var sw := 1.0 - tw
	var w2 := tw * tw
	var w3 := w2 * tw
	var bw0 := sw * sw * sw / 6.0
	var bw1 := (3.0 * w3 - 6.0 * w2 + 4.0) / 6.0
	var bw2 := (-3.0 * w3 + 3.0 * w2 + 3.0 * tw + 1.0) / 6.0
	var bw3 := w3 / 6.0
	var dw0 := -0.5 * sw * sw
	var dw1 := 1.5 * w2 - 2.0 * tw
	var dw2 := -1.5 * w2 + tw + 0.5
	var dw3 := 0.5 * w2
	var sv := 1.0 - tv
	var v2 := tv * tv
	var v3 := v2 * tv
	var bv0 := sv * sv * sv / 6.0
	var bv1 := (3.0 * v3 - 6.0 * v2 + 4.0) / 6.0
	var bv2 := (-3.0 * v3 + 3.0 * v2 + 3.0 * tv + 1.0) / 6.0
	var bv3 := v3 / 6.0
	var dv0 := -0.5 * sv * sv
	var dv1 := 1.5 * v2 - 2.0 * tv
	var dv2 := -1.5 * v2 + tv + 0.5
	var dv3 := 0.5 * v2
	var d := 0.0
	var gx := 0.0
	var gy := 0.0
	var gz := 0.0
	var o := (iv - 1) * row_n + (iw - 1) * nx + iu - 1
	var row_skip := row_n - 4 * nx
	for c in 4:
		# four z rows of four x samples: their x spline and slope, folded along z
		var a0 := f[o]
		var a1 := f[o + 1]
		var a2 := f[o + 2]
		var a3 := f[o + 3]
		var l0 := a0 * bu0 + a1 * bu1 + a2 * bu2 + a3 * bu3
		var x0 := a0 * du0 + a1 * du1 + a2 * du2 + a3 * du3
		o += nx
		a0 = f[o]
		a1 = f[o + 1]
		a2 = f[o + 2]
		a3 = f[o + 3]
		var l1 := a0 * bu0 + a1 * bu1 + a2 * bu2 + a3 * bu3
		var x1 := a0 * du0 + a1 * du1 + a2 * du2 + a3 * du3
		o += nx
		a0 = f[o]
		a1 = f[o + 1]
		a2 = f[o + 2]
		a3 = f[o + 3]
		var l2 := a0 * bu0 + a1 * bu1 + a2 * bu2 + a3 * bu3
		var x2 := a0 * du0 + a1 * du1 + a2 * du2 + a3 * du3
		o += nx
		a0 = f[o]
		a1 = f[o + 1]
		a2 = f[o + 2]
		a3 = f[o + 3]
		var l3 := a0 * bu0 + a1 * bu1 + a2 * bu2 + a3 * bu3
		var x3 := a0 * du0 + a1 * du1 + a2 * du2 + a3 * du3
		o += nx + row_skip
		var s0 := l0 * bw0 + l1 * bw1 + l2 * bw2 + l3 * bw3
		var sx := x0 * bw0 + x1 * bw1 + x2 * bw2 + x3 * bw3
		var sz := l0 * dw0 + l1 * dw1 + l2 * dw2 + l3 * dw3
		var wv := bv0 if c == 0 else (bv1 if c == 1 else (bv2 if c == 2 else bv3))
		var wd := dv0 if c == 0 else (dv1 if c == 1 else (dv2 if c == 2 else dv3))
		d += s0 * wv
		gx += sx * wv
		gz += sz * wv
		gy += s0 * wd
	if d >= margin:
		return Vector4.ZERO
	gx *= INV_GH
	gy *= inv_dy
	gz *= INV_GH
	# the slope is 1 except deep inside, where ways out meet and it flattens: there the push
	# fades rather than flipping round with the gradient
	var k := (margin - d) / maxf(0.35, sqrt(gx * gx + gy * gy + gz * gz))
	return Vector4(gx * k, gy * k, gz * k, margin - d)
