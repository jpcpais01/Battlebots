## A scene graph baked from the web game (godot/tools/bake/web/scene_bake.ts): nodes with their
## transforms, meshes and textures, rebuilt here. Materials come from a factory (VenueMaterials)
## that maps each web material to its Godot port; the factory also says which vertex attribute
## goes in which Godot slot.
class_name BakedScene
extends RefCounted

## Three's blending modes (material.blending).
const NO_BLEND := 0
const NORMAL_BLEND := 1
const ADDITIVE_BLEND := 2
const CUSTOM_BLEND := 5

var json: Dictionary
var _bin: PackedByteArray
## release() has let go of the bin: buffers can't be read any more.
var _released := false
## Lighter triangle lists for some geometries (tools/bake/slim_scene.gd, <bake>.slim): per
## geometry id, [index, groups].
var _slim := {}
## Per node id, the instances (of its instanceMatrix) the slim bake keeps.
var slim_instances := {}
## Draw the slim bakes (BB_FULL_SCENES=1 draws the full ones, to compare).
static var use_slim := not OS.has_environment("BB_FULL_SCENES")
var _textures := {}
## Textures already uploaded by any scene, by what's in them (see _tex_key): the same picture is
## in several bakes (the world map's 1024x2048 atlas three times, the crowd atlas in the arena
## and every venue, a sheet the three home scenes share), and each copy was decoded, mipmapped
## and uploaded again. Held weakly: a texture goes once no scene's materials use it. Scenes are
## built on worker threads, hence the lock.
static var _shared := {}
static var _shared_lock := Mutex.new()
## Share them (BB_NO_TEXSHARE=1 makes every scene its own, to compare).
static var share_textures := not OS.has_environment("BB_NO_TEXSHARE")
## Every built node, by its index in the bake.
var nodes: Array[Node3D] = []
## Named nodes (the bake names what the game animates).
var named := {}
## Builds a Material for (material record, node record, BakedScene), or null to leave the drawable out.
var factory: Callable


static func open(path: String) -> BakedScene:
	var s := BakedScene.new()
	s.json = JSON.parse_string(FileAccess.get_file_as_string(path + ".json"))
	var raw := FileAccess.get_file_as_bytes(path + ".bin")
	if raw.slice(0, 4).get_string_from_ascii() == "BBZ1":
		s._bin = raw.slice(8).decompress(raw.decode_u32(4), FileAccess.COMPRESSION_ZSTD)
	else:
		s._bin = raw
	if use_slim and FileAccess.file_exists(path + ".slim"):
		s._read_slim(FileAccess.get_file_as_bytes(path + ".slim"))
	return s


## The slim bake: "BBSL", u32 version, u32 raw size, then zstd: u32 geometries, each (u32 id,
## u32 source index count, u32 groups, groups as u32 start/count/material, u32 index count, the
## indices), then u32 instanced nodes, each (u32 node id, u32 source count, u32 kept, the kept
## instance numbers). An entry no longer matching the bake (re-baked since) is left out.
func _read_slim(raw: PackedByteArray) -> void:
	if raw.size() < 12 or raw.slice(0, 4).get_string_from_ascii() != "BBSL":
		return
	var b := raw.slice(12).decompress(raw.decode_u32(8), FileAccess.COMPRESSION_ZSTD)
	var o := 0
	var geos: Array = json.geometries
	var n := b.decode_u32(o)
	o += 4
	for k in n:
		var id := b.decode_u32(o)
		var src := b.decode_u32(o + 4)
		var ng := b.decode_u32(o + 8)
		o += 12
		var groups := []
		for g in ng:
			groups.append([b.decode_u32(o), b.decode_u32(o + 4), b.decode_u32(o + 8)])
			o += 12
		var ni := b.decode_u32(o)
		o += 4
		var index := b.slice(o, o + ni * 4).to_int32_array()
		o += ni * 4
		if id < geos.size() and int(json.buffers[int(geos[id].index.buffer)].bytes) / 4 == src:
			_slim[id] = [index, groups]
	n = b.decode_u32(o)
	o += 4
	for k in n:
		var id := b.decode_u32(o)
		var src := b.decode_u32(o + 4)
		var kept := b.decode_u32(o + 8)
		o += 12
		var list := b.slice(o, o + kept * 4).to_int32_array()
		o += kept * 4
		var node: Dictionary = json.nodes[id] if id < json.nodes.size() else {}
		if node.has("instanceMatrix") and int(node.instanceMatrix.count) == src:
			slim_instances[id] = list


func buffer(id: int) -> PackedByteArray:
	if _released:
		push_error("BakedScene.buffer(%d) after release()" % id)
		return PackedByteArray()
	var b: Dictionary = json.buffers[id]
	return _bin.slice(int(b.offset), int(b.offset) + int(b.bytes))


func floats(id: int) -> PackedFloat32Array:
	return buffer(id).to_float32_array()


## Texture `id` as the web game samples it: canvas textures (flipY) are turned up the right way.
## The same picture made the same way by another scene that's still around is shared, not made
## again (see _shared).
func texture(id: int) -> Texture2D:
	if _textures.has(id):
		return _textures[id]
	if _released:
		push_error("BakedScene.texture(%d) after release()" % id)
		return null
	var t: Dictionary = json.textures[id]
	var mips: bool = t.get("mipmaps", true) and t.get("minFilter", 1008) >= 1004
	var bytes := PackedByteArray()
	var fmt := Image.FORMAT_RGBA8
	var how := ""
	if t.has("raw"):
		# a data texture (row 0 is v = 0 in three and in Godot alike)
		var r: Dictionary = t.raw
		var flt: bool = int(r.type) == 1015
		match int(r.format):
			1023:
				fmt = Image.FORMAT_RGBAF if flt else Image.FORMAT_RGBA8
			1028:
				fmt = Image.FORMAT_RF if flt else Image.FORMAT_R8
			1030:
				fmt = Image.FORMAT_RGF if flt else Image.FORMAT_RG8
		bytes = buffer(int(r.buffer))
		how = "raw %dx%d f%d" % [int(r.width), int(r.height), fmt]
	elif t.has("png"):
		var p: Dictionary = t.png
		bytes = _bin.slice(int(p.offset), int(p.offset) + int(p.bytes))
		how = "png" + (" flip" if t.flipY else "")
	var key := ""
	if share_textures and not bytes.is_empty():
		key = _tex_key(bytes, how + (" mips" if mips else ""))
		var hit := _shared_get(key)
		if hit != null:
			_textures[id] = hit
			return hit
	var img := Image.new()
	if t.has("raw"):
		var r: Dictionary = t.raw
		img = Image.create_from_data(int(r.width), int(r.height), false, fmt, bytes)
	elif t.has("png"):
		img.load_png_from_buffer(bytes)
		img.convert(Image.FORMAT_RGBA8)
		if t.flipY:
			img.flip_y()
	if mips:
		img.generate_mipmaps()
	var tex: Texture2D = ImageTexture.create_from_image(img)
	if key != "" and tex != null:
		tex = _shared_put(key, tex)
	_textures[id] = tex
	return tex


## What a texture is made of and how: a hash of its bytes (SHA-1: no two different pictures
## will ever meet by accident, and quicker than SHA-256 next to the PNG decode), their size, and
## everything else that changes the result (raw: size and format; PNG: flipped or not; either:
## mipmapped or not). PNGs always end up RGBA8; sRGB or not and the wrapping are the materials'
## business, not the texture's.
static func _tex_key(bytes: PackedByteArray, how: String) -> String:
	var h := HashingContext.new()
	h.start(HashingContext.HASH_SHA1)
	h.update(bytes)
	return "%s %d %s" % [h.finish().hex_encode(), bytes.size(), how]


## The live texture made from `key` by any scene, or null.
static func _shared_get(key: String) -> Texture2D:
	_shared_lock.lock()
	var w: WeakRef = _shared.get(key)
	var tex: Texture2D = w.get_ref() if w != null else null
	_shared_lock.unlock()
	return tex


## Offers a texture just made for `key`; another thread may have made it meanwhile, in which
## case that one is returned (this one is dropped) so every scene really holds the same texture.
static func _shared_put(key: String, tex: Texture2D) -> Texture2D:
	_shared_lock.lock()
	var w: WeakRef = _shared.get(key)
	var had: Texture2D = w.get_ref() if w != null else null
	if had != null:
		tex = had
	else:
		# (forget the ones every scene has let go of)
		for k in _shared.keys():
			if (_shared[k] as WeakRef).get_ref() == null:
				_shared.erase(k)
		_shared[key] = weakref(tex)
	_shared_lock.unlock()
	return tex


## Lets go of what only building needed: the decompressed bin (8-27 MB a scene), the slim index
## lists and the json's buffer and geometry tables. Kept: nodes, named, slim_instances, the
## json's nodes, materials, textures and every other key (look, anim, far, map, weld...), and the
## textures made so far. After it, buffer(), floats(), _mesh() and texture() of a texture not
## made yet can't work, so the owner calls it once it has built everything and read every buffer
## it needs.
func release() -> void:
	_released = true
	_bin = PackedByteArray()
	_slim = {}
	json.erase("buffers")
	json.erase("geometries")


## Build the whole tree under `parent`.
func build(parent: Node3D) -> void:
	var list: Array = json.nodes
	nodes.resize(list.size())
	for i in list.size():
		var n: Dictionary = list[i]
		var node := _node(n)
		nodes[i] = node
		var p: int = n.parent
		(parent if p < 0 else nodes[p]).add_child(node)
		if n.name != "":
			if not named.has(n.name):
				named[n.name] = node
			node.name = n.name
	# the slim index lists only feed _mesh, which nothing calls once the tree is built (the
	# world map builds its own nodes with _mesh and never calls build)
	_slim = {}


func _node(n: Dictionary) -> Node3D:
	var node: Node3D
	if n.has("geometry"):
		var mi := MeshInstance3D.new()
		mi.mesh = _mesh(n)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if n.castShadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if not n.frustumCulled:
			mi.extra_cull_margin = 16384.0
		node = mi
	else:
		node = Node3D.new()
	var m: Array = n.matrix
	node.transform = Transform3D(Basis(Vector3(m[0], m[1], m[2]), Vector3(m[4], m[5], m[6]), Vector3(m[8], m[9], m[10])), Vector3(m[12], m[13], m[14]))
	node.visible = n.visible
	node.set_meta("bake", n)
	return node


func _mesh(n: Dictionary) -> ArrayMesh:
	var g: Dictionary = json.geometries[int(n.geometry)]
	var mats: Array = []
	var slots := {}
	var margin := 0.0
	var sprites := false
	for mid in n.materials:
		var rec: Dictionary = json.materials[int(mid)]
		var made: Array = factory.call(rec, n, self)
		mats.append(made[0])
		slots = made[1]
		if made.size() > 2:
			margin = maxf(margin, made[2])
		if made.size() > 3:
			sprites = sprites or made[3]
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	var flags := 0
	var custom := 0
	for name in g.attributes:
		var a: Dictionary = g.attributes[name]
		var slot: String = slots.get(name, _default_slot(name))
		if slot == "":
			continue
		var w: int = a.itemSize
		var bytes := buffer(int(a.buffer))
		match slot:
			"VERTEX":
				arrays[Mesh.ARRAY_VERTEX] = bytes.to_vector3_array() if w == 3 else _pad3(bytes.to_float32_array(), w)
			"NORMAL":
				arrays[Mesh.ARRAY_NORMAL] = bytes.to_vector3_array()
			"UV":
				arrays[Mesh.ARRAY_TEX_UV] = bytes.to_vector2_array() if w == 2 else _to2(bytes.to_float32_array(), w)
			"UV2":
				arrays[Mesh.ARRAY_TEX_UV2] = bytes.to_vector2_array() if w == 2 else _to2(bytes.to_float32_array(), w)
			"COLOR":
				arrays[Mesh.ARRAY_COLOR] = bytes.to_color_array()
			_:
				var k := int(slot.substr(6))
				arrays[Mesh.ARRAY_CUSTOM0 + k] = bytes.to_float32_array()
				flags |= ([Mesh.ARRAY_CUSTOM_R_FLOAT, Mesh.ARRAY_CUSTOM_RG_FLOAT, Mesh.ARRAY_CUSTOM_RGB_FLOAT, Mesh.ARRAY_CUSTOM_RGBA_FLOAT][w - 1]) << (Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT + k * Mesh.ARRAY_FORMAT_CUSTOM_BITS)
	var index := buffer(int(g.index.buffer)).to_int32_array()
	var groups: Array = g.groups
	var slim: Array = _slim.get(int(n.geometry), [])
	if sprites:
		# sprites (the crowd): whole quads, nearest the ring first, whatever the slim bake has
		index = _front_first(index, arrays[Mesh.ARRAY_VERTEX])
	elif not slim.is_empty():
		index = slim[0]
		groups = slim[1]
	var prim := Mesh.PRIMITIVE_POINTS if n.primitive == "points" else Mesh.PRIMITIVE_LINES if n.primitive == "lines" else Mesh.PRIMITIVE_TRIANGLES
	var mesh := ArrayMesh.new()
	if groups.is_empty():
		groups = [[0, index.size(), 0]]
	for gr in groups:
		var mat: Material = mats[mini(int(gr[2]), mats.size() - 1)]
		# the slim bake can hide every triangle of a group
		if mat == null or (int(gr[1]) == 0 and prim != Mesh.PRIMITIVE_POINTS):
			continue
		var a2 := arrays.duplicate()
		if prim == Mesh.PRIMITIVE_POINTS:
			a2[Mesh.ARRAY_INDEX] = null
		else:
			a2[Mesh.ARRAY_INDEX] = index.slice(int(gr[0]), int(gr[0]) + int(gr[1]))
		mesh.add_surface_from_arrays(prim, a2, [], {}, flags)
		mesh.surface_set_material(mesh.get_surface_count() - 1, mat)
	# shaders that move vertices say how far (crowd sprites stand up from their seats)
	if not n.frustumCulled:
		mesh.custom_aabb = AABB(Vector3(-200, -50, -200), Vector3(400, 150, 400))
	elif margin > 0.0 and mesh.get_surface_count() > 0:
		mesh.custom_aabb = mesh.get_aabb().grow(margin)
	return mesh


## A sprite mesh's quads (six indices each, every corner at its sprite's centre `at`) ordered
## out from the ring, the front rows first. A fan's pixels that the fan in front of it already
## covers then fail the depth test before they are shaded (the fans discard round their
## outlines, so the GPU can't sort that out for itself ahead of drawing them).
##
## Whole quads, not one triangle twice a quad's size: that saved a triangle a fan but drew every
## fan over twice its pixels, and the crowd's pixels are what it costs.
static func _front_first(index: PackedInt32Array, at: PackedVector3Array) -> PackedInt32Array:
	var n := index.size() / 6
	if n * 6 != index.size() or at.is_empty():
		return index
	var order := []
	order.resize(n)
	for q in n:
		var c := at[index[q * 6]]
		order[q] = Vector2(Vector2(c.x, c.z).length() + c.y * 0.5, q)
	order.sort()
	var out := PackedInt32Array()
	out.resize(index.size())
	for k in n:
		var q := int((order[k] as Vector2).y)
		for j in 6:
			out[k * 6 + j] = index[q * 6 + j]
	return out


static func _default_slot(name: String) -> String:
	match name:
		"position":
			return "VERTEX"
		"normal":
			return "NORMAL"
		"uv":
			return "UV"
		"color":
			return "COLOR"
	return ""


static func _pad3(f: PackedFloat32Array, w: int) -> PackedVector3Array:
	var n := f.size() / w
	var out := PackedVector3Array()
	out.resize(n)
	for i in n:
		out[i] = Vector3(f[i * w], f[i * w + 1] if w > 1 else 0.0, f[i * w + 2] if w > 2 else 0.0)
	return out


static func _to2(f: PackedFloat32Array, w: int) -> PackedVector2Array:
	var n := f.size() / w
	var out := PackedVector2Array()
	out.resize(n)
	for i in n:
		out[i] = Vector2(f[i * w], f[i * w + 1] if w > 1 else 0.0)
	return out
