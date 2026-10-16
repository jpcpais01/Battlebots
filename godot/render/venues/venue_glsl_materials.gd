## Materials for an event venue's bake (godot/tools/bake/web/venues_bake.ts), for BakedScene: the
## venue ShaderMaterials (kit.ts vMaterial, map/kit.ts mapMaterial: kind "glsl") get the Godot
## shader the bake translated from their own GLSL (assets/venues/shaders/, see venues_glsl.ts) with
## every uniform copied over under its web name; the kinds the indoor arena already has a port
## for (crowd, LED boards, tunnel gates, phone lights) and plain three materials go through
## VenueMaterials, as the indoor arena's do.
class_name VenueGlslMaterials
extends RefCounted

## The arena's own factory, for everything that isn't "glsl" (its by_kind holds the crowd's, gates'...).
var base := VenueMaterials.new()
## Every glsl material built, by shader path.
var by_shader := {}
var _cache := {}
var _shaders := {}


func make(rec: Dictionary, node: Dictionary, scene: BakedScene) -> Array:
	if rec.get("kind", "") != "glsl":
		return base.make(rec, node, scene)
	# which of the node's materials this is: the bake translated each per drawable
	var gd: Dictionary = {}
	var mats: Array = node.materials
	var list: Array = node.get("gd", [])
	for k in mats.size():
		if is_same(scene.json.materials[int(mats[k])], rec) and k < list.size() and list[k] is Dictionary:
			gd = list[k]
			break
	if gd.is_empty():
		push_warning("venue material without a port on node '%s'" % node.name)
		return [null, {}]
	var path: String = gd.shader
	var prio := clampi(int(gd.get("priority", 0)), -127, 127)
	var key := "%d|%s|%d" % [_id_of(rec, scene), path, prio]
	if not _cache.has(key):
		_cache[key] = _build(rec, path, prio, scene)
	return [_cache[key], gd.slots]


func _id_of(rec: Dictionary, scene: BakedScene) -> int:
	var list: Array = scene.json.materials
	for i in list.size():
		if is_same(list[i], rec):
			return i
	return -1


func _shader(path: String) -> Shader:
	if not _shaders.has(path):
		_shaders[path] = load(path)
	return _shaders[path]


func _build(rec: Dictionary, path: String, prio: int, scene: BakedScene) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _shader(path)
	# transparent draws keep the web's order (renderOrder); the sky dome goes first, before them all
	m.render_priority = -128 if m.shader.code.contains("ALPHA = 1.0;") else prio
	for k in rec.uniforms:
		var v = rec.uniforms[k]
		if v == null:
			continue
		if v is Dictionary:
			if v.has("global"):
				continue
			if v.has("tex"):
				m.set_shader_parameter(k, scene.texture(int(v.tex)))
			elif v.has("color"):
				m.set_shader_parameter(k, Vector3(v.color[0], v.color[1], v.color[2]))
			elif v.has("vec"):
				m.set_shader_parameter(k, _vec(v.vec))
			elif v.has("mat"):
				var a: Array = v.mat
				m.set_shader_parameter(k, Projection(Vector4(a[0], a[1], a[2], a[3]), Vector4(a[4], a[5], a[6], a[7]), Vector4(a[8], a[9], a[10], a[11]), Vector4(a[12], a[13], a[14], a[15])))
			elif v.has("array"):
				m.set_shader_parameter(k, PackedFloat32Array(v.array))
		elif v is float or v is int or v is bool:
			m.set_shader_parameter(k, v)
		elif v is Array and not v.is_empty():
			var arr := []
			for e in v:
				if e is Dictionary and e.has("color"):
					arr.append(Vector3(e.color[0], e.color[1], e.color[2]))
				elif e is Dictionary and e.has("vec"):
					arr.append(_vec(e.vec))
				else:
					arr.append(e)
			m.set_shader_parameter(k, arr)
	if not by_shader.has(path):
		by_shader[path] = []
	by_shader[path].append(m)
	return m


static func _vec(a: Array):
	match a.size():
		2:
			return Vector2(a[0], a[1])
		3:
			return Vector3(a[0], a[1], a[2])
	return Vector4(a[0], a[1], a[2], a[3])
