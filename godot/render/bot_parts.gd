## The robot armour baked from the web game's part builders (godot/tools/bake/bake_parts.ts).
## Parts are unpacked on first use and kept: a fight needs about thirty of them.
class_name BotParts
extends RefCounted

const BIN := "res://assets/bots/parts.bin"
const JSON_PATH := "res://assets/bots/parts.json"
## The armour as the app draws it, simplified from parts.bin (tools/bake/bake_lite.gd).
const LITE_BIN := "res://assets/bots/parts_lite.bin"

## Opaque material keys, in the order the bake numbers them.
const OPAQUE_KEYS := ["paint", "paint2", "metal", "chrome", "dark", "joint", "brass", "glass", "rubber", "steel", "carbon", "alu"]


## One material family of a part: welded corners in the bone's rest frame, size-ordered.
class Family extends RefCounted:
	var pos: PackedVector3Array
	var nor: PackedVector3Array
	## Opaque: material key. Glow: 0 accent, 1 core, 2 rarity.
	var tag: PackedFloat32Array
	var index: PackedInt32Array
	## Size-ordered runs of pieces: bounding radius (-1 = always drawn) and where each run ends in `index`.
	var radii: PackedFloat32Array
	var ends: PackedInt32Array


class Part extends RefCounted:
	var opaque: Family
	var glow: Family


## The whole file, read once (inside an APK it is a compressed asset: seeking around in it
## would inflate it from the start again and again).
static var _data: PackedByteArray
static var _table := {}
static var _cache := {}
static var info: Dictionary
static var _lite: PackedByteArray
static var _lite_table := {}
## Draw the simplified armour (BB_FULL_PARTS=1 draws the full bake, to compare).
static var lite := not OS.has_environment("BB_FULL_PARTS")


static func _open() -> void:
	if not _data.is_empty():
		return
	info = JSON.parse_string(FileAccess.get_file_as_string(JSON_PATH))
	_data = FileAccess.get_file_as_bytes(BIN)
	assert(_data.size() > 12 and _data.slice(0, 4).get_string_from_ascii() == "BBPK", "missing " + BIN)
	var n := _data.decode_u32(8)
	var o := 12
	for i in n:
		var kl := _data.decode_u16(o)
		var key := _data.slice(o + 2, o + 2 + kl).get_string_from_utf8()
		o += 2 + kl
		_table[key] = [_data.decode_u32(o), _data.decode_u32(o + 4), _data.decode_u32(o + 8)]
		o += 12
	if not FileAccess.file_exists(LITE_BIN):
		return
	_lite = FileAccess.get_file_as_bytes(LITE_BIN)
	if _lite.size() < 12 or _lite.slice(0, 4).get_string_from_ascii() != "BBLT":
		return
	n = _lite.decode_u32(8)
	o = 12
	for i in n:
		var kl := _lite.decode_u16(o)
		var key := _lite.slice(o + 2, o + 2 + kl).get_string_from_utf8()
		o += 2 + kl
		var t: Array = _table.get(key, [])
		# (only where it was made from the parts.bin entry there now)
		if not t.is_empty() and t[1] == _lite.decode_u32(o + 12) and t[2] == _lite.decode_u32(o + 16):
			_lite_table[key] = [_lite.decode_u32(o), _lite.decode_u32(o + 4), _lite.decode_u32(o + 8)]
		o += 20


static func has(key: String) -> bool:
	_open()
	return _table.has(key)


static func get_part(key: String) -> Part:
	_open()
	var p: Part = _cache.get(key)
	if p != null:
		return p
	var t: Array = _lite_table.get(key, []) if lite else []
	var src := _lite if not t.is_empty() else _data
	if t.is_empty():
		t = _table[key]
	var buf := src.slice(t[0], t[0] + t[1]).decompress(t[2], FileAccess.COMPRESSION_ZSTD)
	p = Part.new()
	var o := [0]
	p.opaque = _family(buf, o)
	p.glow = _family(buf, o)
	_cache[key] = p
	return p


static func _family(buf: PackedByteArray, o: Array) -> Family:
	var at: int = o[0]
	var nv := buf.decode_u32(at)
	var ni := buf.decode_u32(at + 4)
	var ng := buf.decode_u32(at + 8)
	at += 12
	var f := Family.new()
	f.pos = buf.slice(at, at + nv * 12).to_vector3_array()
	at += nv * 12
	f.nor = buf.slice(at, at + nv * 12).to_vector3_array()
	at += nv * 12
	f.tag = buf.slice(at, at + nv * 4).to_float32_array()
	at += nv * 4
	f.index = buf.slice(at, at + ni * 4).to_int32_array()
	at += ni * 4
	f.radii.resize(ng)
	f.ends.resize(ng)
	for g in ng:
		f.radii[g] = buf.decode_float(at)
		f.ends[g] = buf.decode_u32(at + 4)
		at += 8
	o[0] = at
	_unmix(f)
	return f


## Give every triangle one material key at all three corners. The shaders read the key as a flat
## varying, which takes it from ONE corner: the last on GL (the container's shots), the first on
## Vulkan (the phones). The simplified armour has a few triangles whose corners disagree (the
## simplifier only sees positions), and each drew in another part's paint on a phone only. Such a
## triangle takes the key most of its corners have (all three different: the last corner's, as
## GL shows it) on copies of the odd corners.
static func _unmix(f: Family) -> void:
	var tag := f.tag
	var idx := f.index
	var pos := f.pos
	var nor := f.nor
	var copies := {}
	for t in range(0, idx.size(), 3):
		var a: float = tag[idx[t]]
		var b: float = tag[idx[t + 1]]
		var c: float = tag[idx[t + 2]]
		if a == b and b == c:
			continue
		var k := a if a == b or a == c else c
		for j in 3:
			var v: int = idx[t + j]
			if tag[v] == k:
				continue
			var key := v * 64 + int(k)
			var nv: int = copies.get(key, -1)
			if nv < 0:
				nv = pos.size()
				pos.append(pos[v])
				if not nor.is_empty():
					nor.append(nor[v])
				tag.append(k)
				copies[key] = nv
			idx[t + j] = nv
	if copies.is_empty():
		return
	f.tag = tag
	f.index = idx
	f.pos = pos
	f.nor = nor
