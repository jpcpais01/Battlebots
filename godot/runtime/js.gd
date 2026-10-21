## JavaScript semantics the translated sim relies on: int32 bit operations, Math.round,
## stable sorting, array helpers that pass indexes, number formatting.
## Every JS number is a GDScript float in the translated code; these keep it that way.
class_name JS
extends RefCounted

const TWO32 := 4294967296.0
## Set while SimSnap makes blank instances of the translated classes on thread BLANK_THREAD:
## their constructors return at once there (every one starts with this check), and SimSnap
## fills the fields in itself. (Other threads construct as usual meanwhile.)
static var BLANK := false
static var BLANK_THREAD := -1


static func i32(x: float) -> int:
	if not is_finite(x):
		return 0
	var n: int
	if x > -9.0e18 and x < 9.0e18:
		n = int(x)
	else:
		n = int(fmod(x if x >= 0.0 else -x, TWO32)) * (1 if x >= 0.0 else -1)
	n &= 0xFFFFFFFF
	return n - 0x100000000 if n >= 0x80000000 else n


static func u32i(x: float) -> int:
	return i32(x) & 0xFFFFFFFF


static func bor(a: float, b: float) -> float:
	return float(i32(a) | i32(b))


static func band(a: float, b: float) -> float:
	return float(i32(a) & i32(b))


static func bxor(a: float, b: float) -> float:
	return float(i32(a) ^ i32(b))


static func bnot(a: float) -> float:
	return float(~i32(a))


static func shl(a: float, b: float) -> float:
	var n := (i32(a) << (u32i(b) & 31)) & 0xFFFFFFFF
	return float(n - 0x100000000 if n >= 0x80000000 else n)


static func shr(a: float, b: float) -> float:
	return float(i32(a) >> (u32i(b) & 31))


static func ushr(a: float, b: float) -> float:
	return float(u32i(a) >> (u32i(b) & 31))


static func imul(a: float, b: float) -> float:
	var n := (i32(a) * i32(b)) & 0xFFFFFFFF
	return float(n - 0x100000000 if n >= 0x80000000 else n)


## Math.round: halves go up.
static func round(x: float) -> float:
	return floorf(x + 0.5)


static func trunc(x: float) -> float:
	return floorf(x) if x >= 0.0 else ceilf(x)


static func sign(x: float) -> float:
	return 1.0 if x > 0.0 else (-1.0 if x < 0.0 else x)


## JS `%` on numbers.
static func mod(a: float, b: float) -> float:
	return fmod(a, b)


## String(n) for the numbers the game prints (names, labels).
static func s(v: Variant) -> String:
	if v is float:
		var f: float = v
		if f == floorf(f) and absf(f) < 1e21:
			return str(int(f))
		if f != f:
			return "NaN"
		if f == INF:
			return "Infinity"
		if f == -INF:
			return "-Infinity"
		return str(f)
	if v == null:
		return "null"
	if v is bool:
		return "true" if v else "false"
	return str(v)


static func to_fixed(x: float, d: float) -> String:
	return String.num(x, int(d)).pad_decimals(int(d)) if d > 0.0 else str(int(round(x)))


## Number.toLocaleString('en-US') for whole numbers: "1,250".
static func to_locale(x: float) -> String:
	var t := s(x)
	var neg := t.begins_with("-")
	if neg:
		t = t.substr(1)
	var dot := t.find(".")
	var whole := t if dot < 0 else t.substr(0, dot)
	var out := ""
	while whole.length() > 3:
		out = "," + whole.substr(whole.length() - 3) + out
		whole = whole.substr(0, whole.length() - 3)
	return ("-" if neg else "") + whole + out + ("" if dot < 0 else t.substr(dot))


static func pad_start(s: String, n: float, c: String = " ") -> String:
	var out := s
	while out.length() < int(n):
		out = c + out
	return out


static func join(a: Array, sep: String = ",") -> String:
	var parts := PackedStringArray()
	for v in a:
		parts.append(s(v) if v != null else "")
	return sep.join(parts)


static func filled(n: float, v: Variant) -> Array:
	var a := []
	a.resize(int(n))
	a.fill(v)
	return a


static func f64(n: float) -> PackedFloat64Array:
	var a := PackedFloat64Array()
	a.resize(int(n))
	return a


static func f32(n: float) -> PackedFloat32Array:
	var a := PackedFloat32Array()
	a.resize(int(n))
	return a


static func f64_of(src: Array) -> PackedFloat64Array:
	return PackedFloat64Array(src)


static func array_from(n: float, fn: Callable) -> Array:
	var a := []
	a.resize(int(n))
	for i in int(n):
		a[i] = fn.call(null, float(i))
	return a


static func array_copy(src: Variant, fn: Variant = null) -> Array:
	var a := []
	var i := 0.0
	for v in src:
		a.append(fn.call(v, i) if fn != null else v)
		i += 1.0
	return a


## Array.prototype.map / filter / forEach / some / every / find / findIndex with (value, index).
static func map(a: Variant, fn: Callable) -> Array:
	var out := []
	out.resize(a.size())
	var i := 0
	for v in a:
		out[i] = fn.call(v, float(i))
		i += 1
	return out


static func map1(a: Variant, fn: Callable) -> Array:
	var out := []
	out.resize(a.size())
	var i := 0
	for v in a:
		out[i] = fn.call(v)
		i += 1
	return out


static func filter(a: Variant, fn: Callable) -> Array:
	var out := []
	var i := 0.0
	for v in a:
		if fn.call(v, i):
			out.append(v)
		i += 1.0
	return out


static func for_each(a: Variant, fn: Callable) -> void:
	var i := 0.0
	for v in a:
		fn.call(v, i)
		i += 1.0


static func some(a: Variant, fn: Callable) -> bool:
	var i := 0.0
	for v in a:
		if fn.call(v, i):
			return true
		i += 1.0
	return false


static func every(a: Variant, fn: Callable) -> bool:
	var i := 0.0
	for v in a:
		if not fn.call(v, i):
			return false
		i += 1.0
	return true


static func find(a: Variant, fn: Callable) -> Variant:
	var i := 0.0
	for v in a:
		if fn.call(v, i):
			return v
		i += 1.0
	return null


static func find_index(a: Variant, fn: Callable) -> float:
	var i := 0.0
	for v in a:
		if fn.call(v, i):
			return i
		i += 1.0
	return -1.0


static func reduce(a: Variant, fn: Callable, acc: Variant) -> Variant:
	var i := 0.0
	for v in a:
		acc = fn.call(acc, v, i)
		i += 1.0
	return acc


static func index_of(a: Variant, v: Variant) -> float:
	var i := 0.0
	for x in a:
		if typeof(x) == typeof(v) and x == v:
			return i
		i += 1.0
	return -1.0


static func includes(a: Variant, v: Variant) -> bool:
	return index_of(a, v) >= 0.0


## Array.prototype.sort: stable (merge sort), comparator returns a number.
static func sort(a: Array, cmp: Variant = null) -> Array:
	var n := a.size()
	if n < 2:
		return a
	var src := a.duplicate()
	var dst := a.duplicate()
	var width := 1
	while width < n:
		var lo := 0
		while lo < n:
			var mid := mini(lo + width, n)
			var hi := mini(lo + 2 * width, n)
			var i := lo
			var j := mid
			var k := lo
			while i < mid and j < hi:
				var c: float
				if cmp != null:
					c = cmp.call(src[j], src[i])
				else:
					c = -1.0 if s(src[j]) < s(src[i]) else 1.0
				if c < 0.0:
					dst[k] = src[j]
					j += 1
				else:
					dst[k] = src[i]
					i += 1
				k += 1
			while i < mid:
				dst[k] = src[i]
				i += 1
				k += 1
			while j < hi:
				dst[k] = src[j]
				j += 1
				k += 1
			lo += 2 * width
		var t := src
		src = dst
		dst = t
		width *= 2
	for i in n:
		a[i] = src[i]
	return a


static func splice(a: Array, start: float, count: float = INF, items: Array = []) -> Array:
	var n := a.size()
	var st := int(start)
	if st < 0:
		st = maxi(0, n + st)
	st = mini(st, n)
	var c := n - st if count == INF else clampi(int(count), 0, n - st)
	var removed := a.slice(st, st + c)
	for i in c:
		a.remove_at(st)
	for i in items.size():
		a.insert(st + i, items[i])
	return removed


static func push(a: Variant, v: Variant) -> float:
	a.append(v)
	return float(a.size())


static func at(a: Variant, i: float) -> Variant:
	var n: int = a.size()
	var k := int(i)
	if k < 0:
		k += n
	if k < 0 or k >= n:
		return null
	return a[k]


## Element read that yields null (undefined) when out of range or missing.
static func idx(o: Variant, k: Variant) -> Variant:
	if o is Dictionary:
		return o.get(k)
	if o is String:
		var ki := int(k)
		return o[ki] if ki >= 0 and ki < o.length() else null
	if o == null:
		return null
	var ki := int(k)
	if ki < 0 or ki >= o.size():
		return null
	return o[ki]


## Field read that yields null when missing (optional interface fields).
static func get_field(o: Variant, k: StringName) -> Variant:
	if o is Dictionary:
		return o.get(k)
	if o == null:
		return null
	return o.get(k)


## Spread of object literals: {...a, ...b}.
static func merge(parts: Array) -> Dictionary:
	var out := {}
	for p in parts:
		if p is Dictionary:
			out.merge(p, true)
		elif p != null:
			for prop in p.get_property_list():
				if prop.usage & PROPERTY_USAGE_SCRIPT_VARIABLE:
					out[prop.name] = p.get(prop.name)
	return out


static func keys(o: Variant) -> Array:
	return o.keys() if o is Dictionary else []


static func values(o: Variant) -> Array:
	return o.values() if o is Dictionary else []


static func entries(o: Variant) -> Array:
	var out := []
	if o is Dictionary:
		for k in o:
			out.append([k, o[k]])
	return out


static func typeof_(v: Variant) -> String:
	match typeof(v):
		TYPE_NIL:
			return "undefined"
		TYPE_BOOL:
			return "boolean"
		TYPE_INT, TYPE_FLOAT:
			return "number"
		TYPE_STRING, TYPE_STRING_NAME:
			return "string"
		TYPE_CALLABLE:
			return "function"
	return "object"


## Truthiness as JS sees it (empty arrays and objects are true).
static func truthy(v: Variant) -> bool:
	match typeof(v):
		TYPE_NIL:
			return false
		TYPE_BOOL:
			return v
		TYPE_INT:
			return v != 0
		TYPE_FLOAT:
			return v != 0.0 and v == v
		TYPE_STRING, TYPE_STRING_NAME:
			return v != ""
	return true


static func str_index_of(s: String, sub: String) -> float:
	return float(s.find(sub))


static func char_code_at(s: String, i: float) -> float:
	var k := int(i)
	return float(s.unicode_at(k)) if k >= 0 and k < s.length() else NAN


static func fill(a: Variant, v: Variant) -> Variant:
	a.fill(v)
	return a


static func reverse(a: Array) -> Array:
	a.reverse()
	return a


## TypedArray.prototype.set(src, offset).
static func typed_set(a: Variant, src: Variant, offset: float = 0.0) -> void:
	var o := int(offset)
	for i in src.size():
		a[o + i] = src[i]


static func from_entries(e: Variant) -> Dictionary:
	var out := {}
	for kv in e:
		out[kv[0]] = kv[1]
	return out


static func assign(target: Variant, a: Variant = null, b: Variant = null, c: Variant = null) -> Variant:
	for src in [a, b, c]:
		if src is Dictionary:
			for k in src:
				target[k] = src[k]
	return target


## === between values whose type the translator could not see.
static func same(a: Variant, b: Variant) -> bool:
	if typeof(a) != typeof(b):
		if (a is float or a is int) and (b is float or b is int):
			return float(a) == float(b)
		return false
	match typeof(a):
		TYPE_ARRAY, TYPE_DICTIONARY, TYPE_OBJECT, TYPE_PACKED_FLOAT64_ARRAY, TYPE_PACKED_FLOAT32_ARRAY:
			return is_same(a, b)
	return a == b


static func or_v(a: Variant, b: Variant) -> Variant:
	return a if truthy(a) else b


static func and_v(a: Variant, b: Variant) -> Variant:
	return b if truthy(a) else a


static func nullish(a: Variant, b: Variant) -> Variant:
	return a if a != null else b


static func has_key(o: Variant, k: Variant) -> bool:
	if o is Dictionary:
		return o.has(k)
	if o is Object:
		return k in o
	return false


static func reduce1(a: Variant, fn: Callable) -> Variant:
	var acc: Variant = a[0]
	for i in range(1, a.size()):
		acc = fn.call(acc, a[i], float(i))
	return acc


static func flat_map(a: Variant, fn: Callable) -> Array:
	var out := []
	var i := 0.0
	for v in a:
		var r: Variant = fn.call(v, i)
		if r is Array:
			out.append_array(r)
		else:
			out.append(r)
		i += 1.0
	return out


static func map_from(entries: Variant) -> Dictionary:
	var out := {}
	if entries is Dictionary:
		return entries.duplicate()
	for kv in entries:
		out[kv[0]] = kv[1]
	return out


static func set_from(items: Variant) -> Dictionary:
	var out := {}
	if items is Dictionary:
		for k in items:
			out[k] = true
		return out
	if items == null:
		return out
	for v in items:
		out[v] = true
	return out


static func map_set(m: Dictionary, k: Variant, v: Variant) -> Dictionary:
	m[k] = v
	return m


static func map_for_each(m: Dictionary, fn: Callable) -> void:
	for k in m:
		fn.call(m[k], k)


static func pad_end(s: String, n: float, c: String = " ") -> String:
	var out := s
	while out.length() < int(n):
		out += c
	return out


static func str_slice(s: String, a: float, b: Variant = null) -> String:
	var n := s.length()
	var st := int(a)
	if st < 0:
		st = maxi(0, n + st)
	var en := n if b == null else int(b)
	if en < 0:
		en = maxi(0, n + en)
	st = mini(st, n)
	en = mini(en, n)
	return s.substr(st, maxi(0, en - st))


static func str_replace(s: String, what: String, with: String) -> String:
	var i := s.find(what)
	if i < 0:
		return s
	return s.substr(0, i) + with + s.substr(i + what.length())


## Number.isInteger: false for anything that isn't a number (a save may hold anything).
static func is_integer(x: Variant) -> bool:
	return (x is float or x is int) and is_finite(x) and x == floorf(x)


static func fround(x: float) -> float:
	var a := PackedFloat32Array([x])
	return a[0]


## Engine maths (outside the deterministic sim only).
static func math_sin(x: float) -> float:
	return sin(x)


static func math_cos(x: float) -> float:
	return cos(x)


static func math_tan(x: float) -> float:
	return tan(x)


static func math_atan2(y: float, x: float) -> float:
	return atan2(y, x)


static func math_atan(x: float) -> float:
	return atan(x)


static func math_asin(x: float) -> float:
	return asin(x)


static func math_acos(x: float) -> float:
	return acos(x)


static func math_exp(x: float) -> float:
	return exp(x)


static func math_log(x: float) -> float:
	return log(x)


static func math_pow(x: float, y: float) -> float:
	return pow(x, y)


static func math_hypot(x: float, y: float, z: float = 0.0) -> float:
	return sqrt(x * x + y * y + z * z)


static func math_cbrt(x: float) -> float:
	return signf(x) * pow(absf(x), 1.0 / 3.0)


static func math_log2(x: float) -> float:
	return log(x) / log(2.0)


static func math_log10(x: float) -> float:
	return log(x) / log(10.0)


## Extra properties JavaScript code hangs on arrays (a Float32Array with a .def): kept aside,
## found by identity. Only used while building tables at start-up.
static var _xprops: Array = []


static func xprop_set(o: Variant, k: String, v: Variant) -> void:
	for e in _xprops:
		if is_same(e[0], o) and e[1] == k:
			e[2] = v
			return
	_xprops.append([o, k, v])


static func xprop_get(o: Variant, k: String) -> Variant:
	for e in _xprops:
		if is_same(e[0], o) and e[1] == k:
			return e[2]
	return null
