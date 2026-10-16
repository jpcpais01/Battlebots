## Godot ports of the world map's materials, for BakedScene (godot/assets/map/world, baked by
## tools/bake/web/worldmap_bake.ts from src/render/map/**). Every map material is a web
## ShaderMaterial; the bake names its `kind` and each kind has a hand-ported shader in
## render/map/shaders/ that keeps the GLSL's uniform names, so uniforms are copied by name as
## they are. The day/night values are shader globals (map_common.gdshaderinc); the shared
## textures (the clouds' noise, the shadow height map) are set on every material here.
class_name MapMaterials
extends RefCounted

const DIR := "res://render/map/shaders/"

## Per kind: its shader, which baked attribute goes in which Godot vertex slot ("" leaves it out:
## a MultiMesh carries it per instance), and how far (m) its shader may move a vertex.
const KINDS := {
	"far": ["far", {"color": "CUSTOM0"}],
	"terrain": ["terrain", {"color": "CUSTOM0", "aMask": "CUSTOM1"}],
	"ribbon": ["ribbon", {"aRoad": "CUSTOM0"}],
	"lit": ["lit", {"color": "CUSTOM0", "uv": ""}],
	"glow": ["glow", {"color": "CUSTOM0", "uv": ""}],
	"lights": ["lights", {"color": "CUSTOM0", "aInfo": "CUSTOM1"}],
	"road_traffic": ["road_traffic", {"aCar": "CUSTOM0", "aLen": "CUSTOM1"}],
	"sea": ["sea", {}],
	"fresh": ["fresh", {"aFlow": "CUSTOM0", "aBed": "CUSTOM1"}],
	"building": ["building", {"aSize": "", "aInfo": "", "aNeon": ""}],
	"sign": ["sign", {"aSign": ""}],
	"window": ["window", {"color": "CUSTOM0"}],
	"traffic": ["traffic", {"aA": "CUSTOM0", "aB": "CUSTOM1", "aCar": "CUSTOM2"}, 30.0],
	"beacons": ["beacons", {}],
	"lamps": ["lamps", {}],
	"lh_beam": ["lh_beam", {}],
	"tower": ["tower", {"color": "CUSTOM0", "aUV": "CUSTOM1", "aKind": "CUSTOM2"}],
	"searchlight": ["searchlight", {}],
	"koi": ["koi", {}, 40.0],
	"whale": ["whale", {}, 40.0],
	"robot": ["robot", {"aBone": "CUSTOM0"}],
	"holo_ads": ["holo_ads", {"aAt": "CUSTOM0", "aAd": "CUSTOM1"}],
	"projections": ["projections", {"aBeam": "CUSTOM0", "aAt": "CUSTOM1", "aSz": "CUSTOM2", "aFrom": "CUSTOM3"}],
	"tree": ["tree", {"aCrown": "CUSTOM0"}, 2.0],
	"pillar": ["pillar", {"color": "CUSTOM0", "aY": "CUSTOM1"}],
	"mist": ["mist", {"aPuff": "CUSTOM0"}],
	"wake": ["wake", {}],
	"clouds": ["clouds", {"aCentre": "CUSTOM0", "aSize": "CUSTOM1", "aSeed": "CUSTOM2"}],
}

## Uniforms the web's materials carry that the ports don't read (three's fog, the point-size scale:
## Godot's shaders size points off VIEWPORT_SIZE).
const SKIP := ["fogDensity", "fogNear", "fogFar", "fogColor", "uPx"]

var _cache := {}
var _shaders := {}
var _textures := {}
var _noise: Texture2D
var _shadow: Texture2D
## Every material built for a kind (the map drives a few: the pillars' boost, the robot's bones).
var by_kind := {}
## Kinds the bake has that no port handles (left out of the scene), for the report.
var missing := {}


## The shared textures (the bake's `map.textures`).
func setup(scene: BakedScene) -> void:
	var t: Dictionary = scene.json.map.textures
	_noise = texture(scene, int(t.noise))
	_shadow = texture(scene, int(t.shadow))


## BakedScene's factory: [material, slots, margin] for a material record on a node.
func make(rec: Dictionary, node: Dictionary, scene: BakedScene) -> Array:
	var kind: String = rec.get("kind", "")
	if not KINDS.has(kind):
		missing[kind if kind != "" else str(rec.type)] = true
		return [null, {}]
	var k: Array = KINDS[kind]
	var order := clampi(int(node.renderOrder), -128, 127) if rec.transparent else 0
	var key := kind + str(order) + JSON.stringify(_own_uniforms(rec))
	if not _cache.has(key):
		_cache[key] = _build(kind, DIR + str(k[0]) + ".gdshader", rec, scene, order)
	return [_cache[key], k[1], k[2] if k.size() > 2 else 0.0]


## A texture of the bake, as the web samples it. The shadow height map is half floats, which
## BakedScene doesn't read.
func texture(scene: BakedScene, id: int) -> Texture2D:
	if _textures.has(id):
		return _textures[id]
	var t: Dictionary = scene.json.textures[id]
	var tex: Texture2D
	if t.has("raw") and int(t.raw.type) == 1016:
		var r: Dictionary = t.raw
		var fmt := Image.FORMAT_RH if int(r.format) == 1028 else Image.FORMAT_RGH if int(r.format) == 1030 else Image.FORMAT_RGBAH
		tex = ImageTexture.create_from_image(Image.create_from_data(int(r.width), int(r.height), false, fmt, scene.buffer(int(r.buffer))))
	else:
		tex = scene.texture(id)
	_textures[id] = tex
	return tex


static func _own_uniforms(rec: Dictionary) -> Dictionary:
	var out := {}
	for k in rec.get("uniforms", {}):
		var v = rec.uniforms[k]
		if k in SKIP or (v is Dictionary and v.has("global")):
			continue
		out[k] = v
	return out


func _shader(path: String) -> Shader:
	if not _shaders.has(path):
		_shaders[path] = load(path)
	return _shaders[path]


func _build(kind: String, path: String, rec: Dictionary, scene: BakedScene, order: int) -> Material:
	var m := ShaderMaterial.new()
	m.shader = _shader(path)
	m.render_priority = order
	m.set_shader_parameter("uNoise", _noise)
	m.set_shader_parameter("uShadow", _shadow)
	var u := _own_uniforms(rec)
	for name in u:
		var v = u[name]
		if v is Dictionary:
			if v.has("tex"):
				m.set_shader_parameter(name, texture(scene, int(v.tex)))
			elif v.has("color"):
				m.set_shader_parameter(name, Vector3(v.color[0], v.color[1], v.color[2]))
			elif v.has("vec"):
				m.set_shader_parameter(name, _vec(v.vec))
		elif v is float or v is int or v is bool:
			m.set_shader_parameter(name, v)
		elif v is Array and not v.is_empty():
			if v[0] is float or v[0] is int:
				m.set_shader_parameter(name, PackedFloat32Array(v))
			elif v[0] is Dictionary and v[0].has("color"):
				var a := PackedVector3Array()
				for e in v:
					a.append(Vector3(e.color[0], e.color[1], e.color[2]))
				m.set_shader_parameter(name, a)
			elif v[0] is Dictionary and v[0].has("vec"):
				var a := []
				for e in v:
					a.append(_vec(e.vec))
				m.set_shader_parameter(name, a)
			# (matrix arrays, the robot's bones, are posed every frame by the map)
	if not by_kind.has(kind):
		by_kind[kind] = []
	by_kind[kind].append(m)
	return m


static func _vec(a: Array) -> Variant:
	match a.size():
		2:
			return Vector2(a[0], a[1])
		3:
			return Vector3(a[0], a[1], a[2])
	return Vector4(a[0], a[1], a[2], a[3])
