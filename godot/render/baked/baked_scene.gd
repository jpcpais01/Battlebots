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
var _textures := {}
var _meshes := {}
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
	return s


func buffer(id: int) -> PackedByteArray:
	var b: Dictionary = json.buffers[id]
	return _bin.slice(int(b.offset), int(b.offset) + int(b.bytes))


func floats(id: int) -> PackedFloat32Array:
	return buffer(id).to_float32_array()


## Texture `id` as the web game samples it: canvas textures (flipY) are turned up the right way.
func texture(id: int) -> Texture2D:
	if _textures.has(id):
		return _textures[id]
	var t: Dictionary = json.textures[id]
	var img := Image.new()
	if t.has("raw"):
		# a data texture (row 0 is v = 0 in three and in Godot alike)
		var r: Dictionary = t.raw
		var fmt := Image.FORMAT_RGBA8
		var flt: bool = int(r.type) == 1015
		match int(r.format):
			1023:
				fmt = Image.FORMAT_RGBAF if flt else Image.FORMAT_RGBA8
			1028:
				fmt = Image.FORMAT_RF if flt else Image.FORMAT_R8
			1030:
				fmt = Image.FORMAT_RGF if flt else Image.FORMAT_RG8
		img = Image.create_from_data(int(r.width), int(r.height), false, fmt, buffer(int(r.buffer)))
	elif t.has("png"):
		var p: Dictionary = t.png
		img.load_png_from_buffer(_bin.slice(int(p.offset), int(p.offset) + int(p.bytes)))
		img.convert(Image.FORMAT_RGBA8)
		if t.flipY:
			img.flip_y()
	if t.get("mipmaps", true) and t.get("minFilter", 1008) >= 1004:
		img.generate_mipmaps()
	var tex := ImageTexture.create_from_image(img)
	_textures[id] = tex
	return tex


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
	for mid in n.materials:
		var rec: Dictionary = json.materials[int(mid)]
		var made: Array = factory.call(rec, n, self)
		mats.append(made[0])
		slots = made[1]
		if made.size() > 2:
			margin = maxf(margin, made[2])
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
	var prim := Mesh.PRIMITIVE_POINTS if n.primitive == "points" else Mesh.PRIMITIVE_LINES if n.primitive == "lines" else Mesh.PRIMITIVE_TRIANGLES
	var mesh := ArrayMesh.new()
	var groups: Array = g.groups
	if groups.is_empty():
		groups = [[0, index.size(), 0]]
	for gr in groups:
		var mat: Material = mats[mini(int(gr[2]), mats.size() - 1)]
		if mat == null:
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
