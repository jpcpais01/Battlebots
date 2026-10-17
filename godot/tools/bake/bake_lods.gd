## Simplified detail levels for the robot armour (assets/bots/parts.bin), baked once with the
## editor's mesh simplifier into assets/bots/parts_lod.bin. Run after bake_parts.ts:
##   godot --headless --path godot -s res://tools/bake/bake_lods.gd
##
## The armour is split finely so blows can dent it (bot_damage.gdshaderinc), far more finely
## than a plate needs while it is whole: a torso's 46k triangles stand within 0.3 mm of 6k. Each
## size-ordered run of pieces gets two sets of levels, each level a triangle list over the part's
## own corners (so the corners, and everything the shader does to them, stay as they are) with
## the error it makes, in the part's metres:
##   clean: simplified as baked, for armour no blow has touched;
##   safe: simplified as if the plating were already buckled (the baked shape pushed along its
##     normals by the wear's crumple noise at SAFE_AMP), so the corners a dent or a fold needs
##     to bend smoothly are kept. BotModel switches to these once the robot takes damage.
## BotModel picks levels per screen size (Godot's mesh LOD); a part whose corners or triangles no
## longer match what was baked here is drawn at full detail.
##
## File: "BBLD" u32 version u32 parts, then a table of (key: u16 length + utf8, u32 offset,
## u32 packed size, u32 raw size), then zstd-packed entries. An entry, per family (opaque, then
## glow): u32 corners, u32 indices (as baked: a check), u32 runs; per run u32 sets (2); per set
## u32 levels; per level f32 error, u32 count, then count u32 indices (as they are, so loading
## them is one native copy).
extends SceneTree

const OUT := "res://assets/bots/parts_lod.bin"
const VERSION := 1
## How far the safe set pretends the plating buckles, in metres (the wear's crumple is a few
## centimetres at its worst, dents a few more; this keeps the corners that bend them).
const SAFE_AMP := 0.02
## Runs smaller than this keep their triangles (and are dropped whole when they're tiny on
## screen, BotModel.LOD_RADII).
const MIN_TRIS := 64
## The errors BotModel's levels are cut at (metres, before the robot's size): each set keeps,
## per run, the coarsest level within each (the safe set from 1 mm: finer it barely saves).
const CLEAN_AT := [0.0005, 0.002, 0.008, 0.02]
const SAFE_AT := [0.001, 0.0025, 0.006, 0.014]


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


func _levels(pos: PackedVector3Array, nor: PackedVector3Array, slice: PackedInt32Array, at: Array) -> Array:
	var im := ImporterMesh.new()
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	if not nor.is_empty():
		arr[Mesh.ARRAY_NORMAL] = nor
	arr[Mesh.ARRAY_INDEX] = slice
	im.add_surface(Mesh.PRIMITIVE_TRIANGLES, arr)
	im.generate_lods(25.0, 60.0, [])
	var out := []
	var last := slice.size()
	for cut in at:
		# the coarsest level within this error
		var pick := -1
		for l in im.get_surface_lod_count(0):
			if im.get_surface_lod_size(0, l) <= cut and im.get_surface_lod_indices(0, l).size() >= 3:
				pick = l
		if pick < 0:
			continue
		var idx := im.get_surface_lod_indices(0, pick)
		# (a level only when it saves a tenth over the one before)
		if idx.size() > last * 0.9:
			continue
		out.append([im.get_surface_lod_size(0, pick), idx])
		last = idx.size()
	return out


func _family(f: BotParts.Family, buf: StreamPeerBuffer, stats: Array) -> void:
	buf.put_u32(f.pos.size())
	buf.put_u32(f.index.size())
	buf.put_u32(f.radii.size())
	var safe_pos := f.pos.duplicate()
	if not f.nor.is_empty():
		for i in safe_pos.size():
			safe_pos[i] = f.pos[i] + f.nor[i] * SAFE_AMP * (_noise(f.pos[i] * 11.0) - 0.5) * 2.0
	var start := 0
	for g in f.radii.size():
		var slice := f.index.slice(start, f.ends[g])
		start = f.ends[g]
		buf.put_u32(2)
		for set in 2:
			var lv := [] if slice.size() < MIN_TRIS * 3 else _levels(f.pos if set == 0 else safe_pos, f.nor, slice, CLEAN_AT if set == 0 else SAFE_AT)
			buf.put_u32(lv.size())
			for l in lv:
				buf.put_float(l[0])
				var idx: PackedInt32Array = l[1]
				buf.put_u32(idx.size())
				buf.put_data(idx.to_byte_array())
			stats[set].append([slice.size() / 3, lv])


func _init() -> void:
	BotParts.has("neck")
	var keys: Array = BotParts._table.keys()
	keys.sort()
	var table := StreamPeerBuffer.new()
	var blobs := StreamPeerBuffer.new()
	var stats := [[], []]
	var t0 := Time.get_ticks_msec()
	for key: String in keys:
		var p := BotParts.get_part(key)
		var buf := StreamPeerBuffer.new()
		_family(p.opaque, buf, stats)
		_family(p.glow, buf, stats)
		var raw := buf.data_array
		var packed := raw.compress(FileAccess.COMPRESSION_ZSTD)
		var kb := key.to_utf8_buffer()
		table.put_u16(kb.size())
		table.put_data(kb)
		table.put_u32(blobs.get_position())
		table.put_u32(packed.size())
		table.put_u32(raw.size())
		blobs.put_data(packed)
	# offsets in the table are from the start of the blobs: shift them past the header and table
	var head := 12 + table.get_size()
	var out := StreamPeerBuffer.new()
	out.put_data("BBLD".to_ascii_buffer())
	out.put_u32(VERSION)
	out.put_u32(keys.size())
	table.seek(0)
	for key: String in keys:
		var kl := table.get_u16()
		out.put_u16(kl)
		out.put_data(table.get_data(kl)[1])
		out.put_u32(table.get_u32() + head)
		out.put_u32(table.get_u32())
		out.put_u32(table.get_u32())
	out.put_data(blobs.data_array)
	var file := FileAccess.open(OUT, FileAccess.WRITE)
	file.store_buffer(out.data_array)
	file.close()
	# what it buys at a few errors (opaque and glow together)
	for set in 2:
		var line: String = ["clean", "safe"][set] + ":"
		for e in [0.0005, 0.001, 0.002, 0.004, 0.008]:
			var full := 0
			var kept := 0
			for s in stats[set]:
				full += s[0]
				var best: int = s[0]
				for l in s[1]:
					if l[0] <= e:
						best = (l[1] as PackedInt32Array).size() / 3
				kept += best
			line += "  %.1f mm %d%%" % [e * 1000.0, roundi(100.0 * kept / maxf(1.0, full))]
		print(line)
	print("bake_lods: %d parts, %d KB, %.1f s" % [keys.size(), out.get_size() / 1024, (Time.get_ticks_msec() - t0) / 1000.0])
	quit()
