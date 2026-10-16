## The robot armour baked from the web game's part builders (godot/tools/bake/bake_parts.ts).
## Parts are unpacked on first use and kept: a fight needs about thirty of them.
class_name BotParts
extends RefCounted

const BIN := "res://assets/bots/parts.bin"
const JSON_PATH := "res://assets/bots/parts.json"

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


static func has(key: String) -> bool:
	_open()
	return _table.has(key)


static func get_part(key: String) -> Part:
	_open()
	var p: Part = _cache.get(key)
	if p != null:
		return p
	var t: Array = _table[key]
	var buf := _data.slice(t[0], t[0] + t[1]).decompress(t[2], FileAccess.COMPRESSION_ZSTD)
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
	return f
