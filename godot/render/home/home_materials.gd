## Godot ports of the home scenes' web materials, for BakedScene (as render/venue/venue_materials.gd
## does for the arena). Plain three materials become shaders generated from home_std.gdshaderinc
## with the same options; the web's onBeforeCompile hooks (tagged by the bake with their program
## key in userData.key: the wood grain, the plants' breeze, the towel's hem...) turn on the matching
## #define; each ShaderMaterial kind (sky, flare, water) and the sand have a hand-ported shader.
class_name HomeMaterials
extends RefCounted

const SIDES := ["cull_back", "cull_front", "cull_disabled"]

## Per web ShaderMaterial kind: its shader and which baked attribute goes in which Godot slot.
const KINDS := {
	"sky": ["res://render/home/beach_sky.gdshader", {}],
	"flare": ["res://render/home/beach_flare.gdshader", {"corner": "CUSTOM0", "el": "CUSTOM1", "tint": "CUSTOM2"}],
	"water": ["res://render/home/beach_water.gdshader", {}],
	"shaft": ["res://render/home/gym_shaft.gdshader", {}],
	"window": ["res://render/home/lounge_window.gdshader", {}],
	"sweep": ["res://render/home/lounge_sweep.gdshader", {}],
	"steam": ["res://render/home/lounge_steam.gdshader", {}],
	"motes": ["res://render/home/lounge_motes.gdshader", {"seed": "CUSTOM0"}],
}
## Web uniform names whose Godot name differs from the snake_case rule (uFoo -> foo).
const RENAME := {"uFoam": "foam_col"}
## The hooks of a program key (beach.ts / beachFlora.ts): defines and uniforms to set.
const HOOKS := {
	"beach-frond": [["BREEZE", "BACKLIT"], {"breeze_amp": 0.11, "backlit_k": 1.4}],
	"beach-bush": [["BREEZE", "BACKLIT", "VOLUME_NORMALS"], {"breeze_amp": 0.035, "backlit_k": 0.6}],
	"beach-tuft": [["BREEZE", "BACKLIT", "VOLUME_NORMALS"], {"breeze_amp": 0.08, "backlit_k": 0.8}],
	"beach-canopy": [["BREEZE", "BACKLIT", "VOLUME_NORMALS"], {"breeze_amp": 0.05, "backlit_k": 0.5}],
	"beach-wood-x": [["WOOD_X"], {}],
	"beach-wood-z": [["WOOD_Z"], {}],
	"beach-towel-hang": [["TOWEL"], {}],
	"beach-thatch": [["THATCH", "BACKLIT"], {"backlit_k": 0.5}],
	"lounge-floor": [["WINLIGHT"], {}],
	"lounge-rug": [["WINLIGHT"], {}],
	"lounge-curtain-sway": [["CURTAIN"], {}],
}
const SLOTS := {"mr": "CUSTOM0", "color": "CUSTOM1", "sway": "CUSTOM2", "hang": "CUSTOM2", "dkind": "CUSTOM2", "uvW": "UV2"}

## The scene's shared cloudy noise (scene.ts noiseTexture), for hooks that sample it.
var noise: Texture2D
## Every ShaderMaterial built, by kind or key (the scene drives a few: the phone's screen...).
var by_kind := {}
var _cache := {}
var _shaders := {}


func make(rec: Dictionary, node: Dictionary, scene: BakedScene) -> Array:
	var inst: bool = node.has("instanceMatrix")
	var key := str(rec.hash()) + ("i" if inst else "") + ("c" if node.has("instanceColor") else "")
	var attrs: Dictionary = scene.json.geometries[int(node.geometry)].attributes
	var made := _make(rec, node, scene, key, attrs, inst)
	# three's renderOrder sorts the see-through things (the water under the footprints, the flare on top)
	var mat := made[0] as ShaderMaterial
	if mat != null and int(node.get("renderOrder", 0)) != 0:
		mat.render_priority = clampi(int(node.renderOrder), -128, 127)
	return made


func _make(rec: Dictionary, node: Dictionary, scene: BakedScene, key: String, attrs: Dictionary, inst: bool) -> Array:
	match rec.type:
		"ShaderMaterial":
			var kind: String = rec.kind
			if not KINDS.has(kind):
				return [null, {}]
			var k: Array = KINDS[kind]
			return [_cached(key, func(): return _kind(kind, k[0], rec, scene)), k[1]]
		"MeshBasicMaterial":
			return [_cached(key, func(): return _basic(rec, scene, node.has("instanceColor"))), SLOTS]
		"PointsMaterial":
			return [_cached(key, func(): return _points(rec, scene)), {}]
		"MeshStandardMaterial", "MeshPhysicalMaterial":
			var pkey: String = str(rec.userData.get("key", "")).get_slice("|", 0)
			if pkey.begins_with("beach-sand"):
				return [_cached(key, func(): return _sand(rec, scene)), {}]
			return [_cached(key, func(): return _standard(rec, scene, pkey, attrs, inst, node.has("instanceColor"))), SLOTS]
	return [null, {}]


func _cached(key: String, build: Callable) -> Material:
	if not _cache.has(key):
		_cache[key] = build.call()
	return _cache[key]


func _shader(code: String) -> Shader:
	if not _shaders.has(code):
		var s := Shader.new()
		s.code = code
		_shaders[code] = s
	return _shaders[code]


func _keep(kind: String, m: ShaderMaterial) -> ShaderMaterial:
	if not by_kind.has(kind):
		by_kind[kind] = []
	by_kind[kind].append(m)
	return m


static func _lin(c) -> Vector3:
	if c is Dictionary and c.has("color"):
		return Vector3(c.color[0], c.color[1], c.color[2])
	return Vector3.ONE


func _render_mode(rec: Dictionary, unshaded: bool) -> String:
	var modes := ["unshaded"] if unshaded else ["diffuse_lambert"]
	modes.append(SIDES[int(rec.side)])
	var blend: int = rec.blending
	if blend == BakedScene.ADDITIVE_BLEND:
		modes.append("blend_add")
	if not rec.depthWrite or (rec.transparent and blend != BakedScene.NORMAL_BLEND):
		modes.append("depth_draw_never")
	if not rec.depthTest:
		modes.append("depth_test_disabled")
	if unshaded:
		modes.append("shadows_disabled")
	# (the fog is drawn by the shader itself: home_common.gdshaderinc)
	modes.append("fog_disabled")
	return "render_mode " + ", ".join(modes) + ";\n"


## How a map is sampled: sRGB colour (decoded to linear) or raw data, repeating or clamped.
static func _map_defs(scene: BakedScene, ref, name: String) -> Array:
	var t: Dictionary = scene.json.textures[int(ref.tex)]
	return [
		name + "_HINT " + ("source_color," if t.get("srgb", true) else ""),
		name + "_WRAP " + ("repeat_enable" if int(t.wrap[0]) == 1000 or int(t.wrap[1]) == 1000 else "repeat_disable"),
	]


static func _tex(scene: BakedScene, m: ShaderMaterial, name: String, ref) -> void:
	var id: int = ref.tex
	var t: Dictionary = scene.json.textures[id]
	m.set_shader_parameter(name, scene.texture(id))
	m.set_shader_parameter(name + "_xf", Vector4(t.repeat[0], t.repeat[1], t.offset[0], t.offset[1]))


## A web ShaderMaterial's hand port: its uniforms copied by name.
func _kind(kind: String, path: String, rec: Dictionary, scene: BakedScene) -> Material:
	var m := ShaderMaterial.new()
	m.shader = load(path)
	for k in rec.uniforms:
		var v = rec.uniforms[k]
		if v is Dictionary and v.has("global"):
			continue
		var name: String = RENAME.get(k, k.substr(1).to_snake_case() if k.begins_with("u") else k)
		if v is Dictionary:
			if v.has("tex"):
				_tex(scene, m, name, v)
				if name == "noise" and noise == null:
					noise = scene.texture(int(v.tex))
			elif v.has("color"):
				m.set_shader_parameter(name, Vector3(v.color[0], v.color[1], v.color[2]))
			elif v.has("vec"):
				var a: Array = v.vec
				m.set_shader_parameter(name, Vector2(a[0], a[1]) if a.size() == 2 else Vector3(a[0], a[1], a[2]) if a.size() == 3 else Vector4(a[0], a[1], a[2], a[3]))
		elif v is float or v is int or v is bool:
			m.set_shader_parameter(name, v)
	return _keep(kind, m)


## MeshBasicMaterial: unlit colour x map, blended or added (the footprints, the phone's screen, the hologram).
func _basic(rec: Dictionary, scene: BakedScene, inst_col := false) -> Material:
	var defs := []
	if rec.vertexColors:
		defs.append("VCOL")
	if rec.has("map"):
		defs.append("MAP")
		defs.append_array(_map_defs(scene, rec.map, "MAP"))
	if float(rec.alphaTest) > 0.0:
		defs.append("ALPHA_TEST")
	if inst_col:
		defs.append("INST_COL")
	var additive: bool = rec.blending == BakedScene.ADDITIVE_BLEND
	if rec.transparent and not additive:
		defs.append("BLEND")
	if additive:
		defs.append("ADDITIVE")
	var code := "shader_type spatial;\n" + _render_mode(rec, true)
	for d in defs:
		code += "#define " + d + "\n"
	code += BASIC_BODY
	var m := ShaderMaterial.new()
	m.shader = _shader(code)
	m.set_shader_parameter("color", _lin(rec.get("color")))
	m.set_shader_parameter("opacity", float(rec.opacity))
	m.set_shader_parameter("alpha_test", float(rec.alphaTest))
	if rec.has("map"):
		_tex(scene, m, "map", rec.map)
	return _keep("basic", m)


const BASIC_BODY := """
#include "res://render/home/home_common.gdshaderinc"
uniform vec3 color = vec3(1.0);
uniform float opacity = 1.0;
uniform float alpha_test = 0.0;
#ifdef MAP
uniform sampler2D map : MAP_HINT filter_linear_mipmap_anisotropic, MAP_WRAP;
uniform vec4 map_xf = vec4(1.0, 1.0, 0.0, 0.0);
#endif
#if defined(VCOL) || defined(INST_COL)
varying vec3 v_col;
#endif
void vertex() {
#ifdef VCOL
	v_col = CUSTOM1.rgb;
#elif defined(INST_COL)
	v_col = vec3(1.0);
#endif
#ifdef INST_COL
	v_col *= INSTANCE_CUSTOM.rgb;
#endif
}
void fragment() {
	vec3 c = color;
	float a = opacity;
#if defined(VCOL) || defined(INST_COL)
	c *= v_col;
#endif
#ifdef MAP
	vec4 t = texture(map, UV * map_xf.xy + map_xf.zw);
	c *= t.rgb;
	a *= t.a;
#endif
#ifdef ALPHA_TEST
	if (a < alpha_test) discard;
#endif
#ifdef ADDITIVE
	ALBEDO = c * a;
#else
	ALBEDO = c;
#ifdef BLEND
	ALPHA = a;
#endif
	vec4 fg = home_fog(VERTEX);
	ALBEDO = mix(ALBEDO, fg.rgb, fg.a);
#endif
}
"""


## MeshStandardMaterial, and the web's hooks on it.
func _standard(rec: Dictionary, scene: BakedScene, pkey: String, attrs: Dictionary, inst: bool, inst_col: bool) -> Material:
	var defs := []
	var params := {}
	if rec.vertexColors and attrs.has("color"):
		defs.append("VCOL")
	if attrs.has("mr"):
		defs.append("MR")
	if rec.has("map"):
		defs.append("MAP")
		defs.append_array(_map_defs(scene, rec.map, "MAP"))
	if rec.has("normalMap"):
		defs.append("NMAP")
		defs.append(_map_defs(scene, rec.normalMap, "NMAP")[1])
	if rec.has("roughnessMap"):
		defs.append("ROUGH_MAP")
		defs.append(_map_defs(scene, rec.roughnessMap, "ROUGH_MAP")[1])
	# (gym.ts wearPatch: the grime laid over the bricks and the floor, on second uvs; the bake hands
	# it over in the aoMap slot)
	var wear: bool = rec.userData.get("wear", false) and rec.has("aoMap") and attrs.has("uvW")
	if wear:
		defs.append("WEAR")
		defs.append_array(_map_defs(scene, rec.aoMap, "WEAR"))
	if float(rec.alphaTest) > 0.0:
		defs.append("ALPHA_TEST")
	if rec.transparent:
		defs.append("BLEND")
	if inst:
		defs.append("INSTANCED")
	if inst_col:
		defs.append("INST_COL")
	if HOOKS.has(pkey):
		defs.append_array(HOOKS[pkey][0])
		params = HOOKS[pkey][1]
	# (lounge.ts detailed: the fine finish, by the kind tagged on each vertex)
	if str(rec.userData.get("key", "")).contains("|detail") and attrs.has("dkind"):
		defs.append("DETAIL")
	var sheen: Dictionary = rec.userData.get("sheen", {})
	if not sheen.is_empty():
		defs.append("SHEEN")
	var ao: Dictionary = rec.userData.get("ao", {})
	if not ao.is_empty():
		defs.append("AO_ON")
		if ao.get("spheres", false):
			defs.append("AO_SPHERES")
		if ao.has("ground"):
			defs.append("AO_GROUND")
	var code := "shader_type spatial;\n" + _render_mode(rec, false)
	for d in defs:
		code += "#define " + d + "\n"
	code += "#include \"res://render/home/home_std.gdshaderinc\"\n"
	var m := ShaderMaterial.new()
	m.shader = _shader(code)
	m.set_shader_parameter("color", _lin(rec.get("color")))
	m.set_shader_parameter("opacity", float(rec.opacity))
	m.set_shader_parameter("metalness", float(rec.get("metalness", 0.0)))
	m.set_shader_parameter("roughness", float(rec.get("roughness", 1.0)))
	m.set_shader_parameter("alpha_test", float(rec.alphaTest))
	var e := _lin(rec.get("emissive")) if rec.has("emissive") else Vector3.ZERO
	m.set_shader_parameter("emissive", e * float(rec.get("emissiveIntensity", 1.0)))
	if rec.has("map"):
		_tex(scene, m, "map", rec.map)
	if rec.has("normalMap"):
		_tex(scene, m, "normal_map", rec.normalMap)
		var ns: Array = rec.userData.get("normalScale", [1, 1])
		m.set_shader_parameter("normal_scale", Vector2(ns[0], ns[1]))
	if rec.has("roughnessMap"):
		_tex(scene, m, "roughness_map", rec.roughnessMap)
	if wear:
		m.set_shader_parameter("wear", scene.texture(int(rec.aoMap.tex)))
	_noise(scene, m)
	if not sheen.is_empty():
		var sc: Array = sheen.color
		m.set_shader_parameter("sheen_color", Vector3(sc[0], sc[1], sc[2]) * float(sheen.k))
		m.set_shader_parameter("sheen_roughness", float(sheen.roughness))
	for p in params:
		m.set_shader_parameter(p, params[p])
	if not ao.is_empty():
		m.set_shader_parameter("ao_strength", float(ao.get("strength", 1.0)))
		m.set_shader_parameter("ao_direct", float(ao.get("direct", 0.35)))
		var g: Dictionary = ao.get("ground", {})
		if not g.is_empty():
			m.set_shader_parameter("ao_g", Vector3(g.y, g.height, g.k))
	return _keep(pkey if pkey != "" else "standard", m)


## Give `m` the scene's noise, found in the first shader that samples it (whatever order the
## materials are built in).
func _noise(scene: BakedScene, m: ShaderMaterial) -> void:
	if noise == null:
		for r in scene.json.materials:
			var u = r.get("uniforms", {}).get("uNoise")
			if u is Dictionary and u.has("tex"):
				noise = scene.texture(int(u.tex))
				break
	if noise != null:
		m.set_shader_parameter("noise", noise)


## The beach's sand (beachWorld.ts sandMaterial).
func _sand(rec: Dictionary, scene: BakedScene) -> Material:
	var m := ShaderMaterial.new()
	m.shader = load("res://render/home/beach_sand.gdshader")
	_tex(scene, m, "map", rec.map)
	_tex(scene, m, "normal_map", rec.normalMap)
	m.set_shader_parameter("roughness", float(rec.roughness))
	_noise(scene, m)
	var ao: Dictionary = rec.userData.get("ao", {})
	m.set_shader_parameter("ao_strength", float(ao.get("strength", 1.6)))
	m.set_shader_parameter("ao_direct", float(ao.get("direct", 0.6)))
	return _keep("sand", m)


## PointsMaterial: three's round sprites (dust turning in the light), `size` metres across at a
## distance as three's sizeAttenuation draws them, added on. A scene can set them drifting
## (drift_*: gym.ts life's per-point sines, on each point's index) instead of moving them itself.
func _points(rec: Dictionary, scene: BakedScene) -> Material:
	var code := "shader_type spatial;\n" + _render_mode(rec, true)
	if rec.has("map"):
		code += "#define MAP\n"
		for d in _map_defs(scene, rec.map, "MAP"):
			code += "#define " + d + "\n"
	code += POINTS_BODY
	var m := ShaderMaterial.new()
	m.shader = _shader(code)
	m.set_shader_parameter("color", _lin(rec.get("color")))
	m.set_shader_parameter("opacity", float(rec.opacity))
	m.set_shader_parameter("size", float(rec.get("size", 1.0)))
	if rec.has("map"):
		_tex(scene, m, "map", rec.map)
	return _keep("points", m)


const POINTS_BODY := """
global uniform float bb_time;
uniform vec3 color = vec3(1.0);
uniform float opacity = 1.0;
uniform float size = 1.0;
#ifdef MAP
uniform sampler2D map : MAP_HINT filter_linear_mipmap, MAP_WRAP;
uniform vec4 map_xf = vec4(1.0, 1.0, 0.0, 0.0);
#endif
// drift: amplitude, rate and phase (per point index) on x, y and z: x and y sines, z a cosine
uniform vec3 drift_amp = vec3(0.0);
uniform vec3 drift_rate = vec3(0.0);
uniform vec3 drift_phase = vec3(0.0);
// only the first this many are drawn (the Low tier's fewer motes)
uniform int max_points = 1048576;
void vertex() {
	vec3 ph = float(VERTEX_ID) * drift_phase;
	VERTEX += drift_amp * vec3(sin(bb_time * drift_rate.x + ph.x), sin(bb_time * drift_rate.y + ph.y), cos(bb_time * drift_rate.z + ph.z));
	vec4 vp = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	POINT_SIZE = size * VIEWPORT_SIZE.y * 0.5 / max(-vp.z, 0.01);
	POSITION = VERTEX_ID < max_points ? PROJECTION_MATRIX * vp : vec4(0.0, 0.0, 2.0, 1.0);
}
void fragment() {
	vec3 c = color;
	float a = opacity;
#ifdef MAP
	vec4 t = texture(map, vec2(POINT_COORD.x, 1.0 - POINT_COORD.y) * map_xf.xy + map_xf.zw);
	c *= t.rgb;
	a *= t.a;
#endif
	ALBEDO = c * a;
}
"""
