## The robot armour as the app draws it: assets/bots/parts.bin simplified once with the editor's
## mesh simplifier into assets/bots/parts_lite.bin. Run after bake_parts.ts:
##   godot --headless --path godot -s res://tools/bake/bake_lite.gd
##
## The web game splits the armour finely so blows can dent it, far more finely than a plate needs.
## Each size-ordered run of pieces is simplified as if the plating were already buckled (the baked
## shape moved by the wear's crumple noise at BUCKLE, by rest position as the shader does), so the
## corners a dent or a fold needs to bend smoothly stay, within ERROR. The corners no triangle uses
## any more are dropped. Runs smaller than MIN_TRIS keep their triangles. A fight's two robots go
## from about 309k triangles to 94k, and dented close-ups look the same (tests/bots_lab.gd with
## BB_FULL_PARTS=1 draws the full bake to compare).
##
## File: "BBLT" u32 version u32 parts, then a table of (key: u16 length + utf8, u32 offset,
## u32 packed size, u32 raw size, u32 source packed size, u32 source raw size: the parts.bin entry
## it was made from, so BotParts can tell a stale one), then zstd-packed entries laid out as in
## parts.bin (BotParts._family).
extends SceneTree

const OUT := "res://assets/bots/parts_lite.bin"
const VERSION := 1
## How far the simplifier pretends the plating buckles, in metres (enough to keep the corners the
## crumple and the dents bend; more keeps far more triangles for no visible gain).
const BUCKLE := 0.01
## The most a simplified run may stray from the baked shape, in the part's metres.
## (BB_LITE_ERROR=<metres> overrides it, to try others.)
const ERROR := 0.004
const MIN_TRIS := 64


func _hash(p: Vector3) -> float:
	p = p * 0.3183099 + Vector3(0.11, 0.17, 0.13)
	p = (p - p.floor()) * 17.0
	var v := p.x * p.y * p.z * (p.x + p.y + p.z)
	return v - floorf(v)


## bot_damage.gdshaderinc dmg_noise
func _noise(x: Vector3) -> float:
	var i := x.floor()
	var f := x - i
	f = f * f * (Vector3.ONE * 3.0 - 2.0 * f)
	return lerpf(lerpf(lerpf(_hash(i), _hash(i + Vector3(1, 0, 0)), f.x), lerpf(_hash(i + Vector3(0, 1, 0)), _hash(i + Vector3(1, 1, 0)), f.x), f.y),
		lerpf(lerpf(_hash(i + Vector3(0, 0, 1)), _hash(i + Vector3(1, 0, 1)), f.x), lerpf(_hash(i + Vector3(0, 1, 1)), _hash(i + Vector3(1, 1, 1)), f.x), f.y), f.z)


## Run `slice` simplified within `err` (the coarsest level the simplifier offers inside it), or as
## it is.
func _simplify(pos: PackedVector3Array, nor: PackedVector3Array, slice: PackedInt32Array, err: float) -> PackedInt32Array:
	if slice.size() < MIN_TRIS * 3:
		return slice
	var im := ImporterMesh.new()
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	if not nor.is_empty():
		arr[Mesh.ARRAY_NORMAL] = nor
	arr[Mesh.ARRAY_INDEX] = slice
	im.add_surface(Mesh.PRIMITIVE_TRIANGLES, arr)
	im.generate_lods(25.0, 60.0, [])
	var out := slice
	for l in im.get_surface_lod_count(0):
		var idx := im.get_surface_lod_indices(0, l)
		if im.get_surface_lod_size(0, l) <= err and idx.size() >= 3 and idx.size() < out.size():
			out = idx
	return out


## One family simplified, its unused corners dropped, written as parts.bin lays it out.
func _family(f: BotParts.Family, buf: StreamPeerBuffer, stats: Array) -> void:
	# (moved by the rest position alone, as the shader bends it: corners on a crease stay together)
	var buckled := f.pos.duplicate()
	for i in buckled.size():
		var q := f.pos[i] * 11.0
		buckled[i] = f.pos[i] + (Vector3(_noise(q), _noise(q + Vector3.ONE * 17.3), _noise(q + Vector3.ONE * 41.7)) - Vector3.ONE * 0.5) * 2.0 * _buckle
	var index := PackedInt32Array()
	var ends := PackedInt32Array()
	var start := 0
	for g in f.radii.size():
		var slice := f.index.slice(start, f.ends[g])
		start = f.ends[g]
		index.append_array(_simplify(buckled, f.nor, slice, _err))
		ends.append(index.size())
	# keep the corners still in use, in their order
	var remap := PackedInt32Array()
	remap.resize(f.pos.size())
	remap.fill(-1)
	for v in index:
		remap[v] = 0
	var keep := PackedInt32Array()
	for i in remap.size():
		if remap[i] == 0:
			remap[i] = keep.size()
			keep.append(i)
	for k in index.size():
		index[k] = remap[index[k]]
	var nv := keep.size()
	buf.put_u32(nv)
	buf.put_u32(index.size())
	buf.put_u32(f.radii.size())
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var tag := PackedFloat32Array()
	pos.resize(nv)
	nor.resize(nv)
	tag.resize(nv)
	for i in nv:
		pos[i] = f.pos[keep[i]]
		if not f.nor.is_empty():
			nor[i] = f.nor[keep[i]]
		tag[i] = f.tag[keep[i]]
	buf.put_data(pos.to_byte_array())
	buf.put_data(nor.to_byte_array())
	buf.put_data(tag.to_byte_array())
	buf.put_data(index.to_byte_array())
	for g in f.radii.size():
		buf.put_float(f.radii[g])
		buf.put_u32(ends[g])
	stats[0] += f.index.size() / 3
	stats[1] += index.size() / 3
	stats[2] += f.pos.size()
	stats[3] += nv


var _err := ERROR
var _buckle := BUCKLE


func _init() -> void:
	if OS.has_environment("BB_LITE_ERROR"):
		_err = OS.get_environment("BB_LITE_ERROR").to_float()
	if OS.has_environment("BB_LITE_BUCKLE"):
		_buckle = OS.get_environment("BB_LITE_BUCKLE").to_float()
	# (from the full bake, never a lite one already there)
	BotParts.lite = false
	BotParts.has("neck")
	var keys: Array = BotParts._table.keys()
	keys.sort()
	var table := StreamPeerBuffer.new()
	var blobs := StreamPeerBuffer.new()
	var stats := [0, 0, 0, 0]
	var t0 := Time.get_ticks_msec()
	for key: String in keys:
		var p := BotParts.get_part(key)
		var buf := StreamPeerBuffer.new()
		_family(p.opaque, buf, stats)
		_family(p.glow, buf, stats)
		var raw := buf.data_array
		var packed := raw.compress(FileAccess.COMPRESSION_ZSTD)
		var kb := key.to_utf8_buffer()
		var src: Array = BotParts._table[key]
		table.put_u16(kb.size())
		table.put_data(kb)
		table.put_u32(blobs.get_position())
		table.put_u32(packed.size())
		table.put_u32(raw.size())
		table.put_u32(src[1])
		table.put_u32(src[2])
		blobs.put_data(packed)
	# offsets in the table are from the start of the blobs: shift them past the header and table
	var head := 12 + table.get_size()
	var out := StreamPeerBuffer.new()
	out.put_data("BBLT".to_ascii_buffer())
	out.put_u32(VERSION)
	out.put_u32(keys.size())
	table.seek(0)
	for key: String in keys:
		var kl := table.get_u16()
		out.put_u16(kl)
		out.put_data(table.get_data(kl)[1])
		out.put_u32(table.get_u32() + head)
		for k in 4:
			out.put_u32(table.get_u32())
	out.put_data(blobs.data_array)
	var file := FileAccess.open(OUT, FileAccess.WRITE)
	file.store_buffer(out.data_array)
	file.close()
	print("bake_lite: %.1f mm: triangles %d -> %d (%d%%), corners %d -> %d (%d%%)" % [_err * 1000.0,
		stats[0], stats[1], roundi(100.0 * stats[1] / stats[0]), stats[2], stats[3], roundi(100.0 * stats[3] / stats[2])])
	print("bake_lite: %d parts, %d KB, %.1f s" % [keys.size(), out.get_size() / 1024, (Time.get_ticks_msec() - t0) / 1000.0])
	quit()
