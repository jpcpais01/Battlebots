## Godot ports of the web arena's materials, for BakedScene. Plain three materials
## (MeshBasicMaterial, MeshStandardMaterial) become generated shaders with the same options;
## each ShaderMaterial `kind` (named by the bake) has a hand-ported shader in render/venue/.
class_name VenueMaterials
extends RefCounted

const SIDES := ["cull_back", "cull_front", "cull_disabled"]

## Per kind: its shader, and which baked attribute goes in which Godot vertex slot.
const KINDS := {
	"crowd": ["res://render/venue/crowd.gdshader", {"iPos": "VERTEX", "position": "UV", "iData": "CUSTOM0", "iShirt": "CUSTOM1", "iHair": "CUSTOM2", "iAccent": "CUSTOM3"}, 4.2],
	"led_ads": ["res://render/venue/led_ads.gdshader", {"aLed": "CUSTOM0"}],
	"led": ["res://render/venue/led.gdshader", {"aLed": "CUSTOM0"}],
	"tunnel_led": ["res://render/venue/tunnel_led.gdshader", {"aChase": "CUSTOM0", "color": "CUSTOM1"}],
	"gate": ["res://render/venue/gate.gdshader", {}],
	"glow_points": ["res://render/venue/glow_points.gdshader", {}],
	"glow_points_steady": ["res://render/venue/glow_points.gdshader", {}],
	"skirt": ["res://render/venue/skirt.gdshader", {}],
	"hatch_ring": ["res://render/venue/hatch_ring.gdshader", {}],
	"beam_column": ["res://render/venue/beam.gdshader", {}],
	"beam_spot": ["res://render/venue/beam.gdshader", {}],
	"floor_glow_points": ["res://render/venue/floor_glow_points.gdshader", {}],
	"photo_flash": ["res://render/venue/photo_flash.gdshader", {}],
	"truss_beams": ["res://render/venue/truss_beams.gdshader", {"aAlong": "CUSTOM0", "aSway": "CUSTOM1"}],
	"show_beams": ["res://render/venue/show_beams.gdshader", {"aPos": "CUSTOM0", "aId": "CUSTOM1"}],
	"show_heads": ["res://render/venue/show_heads.gdshader", {"aId": "CUSTOM0"}],
	"pyro_fire": ["res://render/venue/pyro_fire.gdshader", {"aE": "CUSTOM0", "aR": "CUSTOM1", "aK": "CUSTOM2"}],
	"pyro_sparks": ["res://render/venue/pyro_sparks.gdshader", {"aE": "CUSTOM0", "aR": "CUSTOM1"}],
	"confetti": ["res://render/venue/confetti.gdshader", {"aR": "CUSTOM0"}],
}

## The materials built so far, by bake material id and use.
var _cache := {}
var _shaders := {}
## Nodes under the venue (house-lit), by bake node index.
var _house_nodes := {}
## Every ShaderMaterial built for a kind, so the game can drive their uniforms.
var by_kind := {}


func make(rec: Dictionary, node: Dictionary, scene: BakedScene) -> Array:
	var house := _in_venue(node, scene)
	var key := str(rec.hash()) + ("h" if house else "")
	if rec.get("kind", "") == "" and node.name == "ropes":
		return [_cached(key, func(): return _ropes(rec)), {"aRope": "CUSTOM0", "aH": "CUSTOM1", "aKind": "CUSTOM2", "aT": "CUSTOM3", "aOut": "UV2"}]
	match rec.type:
		"MeshBasicMaterial":
			var spots: bool = scene.json.geometries[int(node.geometry)].attributes.has("aSpot")
			# vertex colours ride in a float slot: Godot keeps COLOR in 8 bits, and glow colours go past 1
			return [_cached(key, func(): return _basic(rec, scene, house, spots)), {"aSpot": "CUSTOM0", "color": "CUSTOM1"}]
		"MeshStandardMaterial":
			# the lighting truss hangs above everything that casts a shadow: skip the shadow lookups
			var lit_only: bool = node.name == "truss"
			return [_cached(key + ("s" if lit_only else ""), func(): return _standard(rec, scene, house, lit_only)), {}]
		"ShaderMaterial":
			var kind: String = rec.kind
			if not KINDS.has(kind):
				return [null, {}]
			var k: Array = KINDS[kind]
			if not ResourceLoader.exists(k[0]):
				return [null, {}]
			return [_cached(key, func(): return _kind(kind, k[0], rec, scene)), k[1], k[2] if k.size() > 2 else 0.0]
	return [null, {}]


## ClearView (clearView.ts apply): every material of something rising above the floor may
## dissolve when it stands between the lens and the robots; floor-level ones never do.
func mark_clear(scene: BakedScene) -> void:
	var world: Array[Transform3D] = []
	world.resize(scene.nodes.size())
	for i in scene.nodes.size():
		var n: Node3D = scene.nodes[i]
		var p: int = scene.json.nodes[i].parent
		world[i] = n.transform if p < 0 else world[p] * n.transform
		var mi := n as MeshInstance3D
		if mi == null or mi.mesh == null:
			continue
		if (world[i] * mi.mesh.get_aabb()).end.y < 0.3:
			continue
		for k in mi.mesh.get_surface_count():
			var sm := mi.mesh.surface_get_material(k) as ShaderMaterial
			# (additive light only brightens: a faint haze in front of the robots can stay)
			if sm == null or sm.shader.code.contains("blend_add"):
				continue
			if sm.shader.code.contains(NO_CLEAR):
				sm.shader = _shader(sm.shader.code.replace(NO_CLEAR, ""))
			sm.set_shader_parameter("clear_ok", true)


## Generated shaders leave the clear-view discard out until mark_clear puts it in (common.gdshaderinc).
const NO_CLEAR := "#define NO_CLEAR\n"


func _cached(key: String, build: Callable) -> Material:
	if not _cache.has(key):
		_cache[key] = build.call()
	return _cache[key]


## House lights dim everything room-lit in the venue (house.ts apply): not glow, not additive, not custom shaders.
func _in_venue(node: Dictionary, scene: BakedScene) -> bool:
	var p: int = node.parent
	while p >= 0:
		var n: Dictionary = scene.json.nodes[p]
		if n.name == "venue":
			return true
		p = n.parent
	return false


static func _lin(c) -> Color:
	if c is Dictionary and c.has("color"):
		return Color(c.color[0], c.color[1], c.color[2])
	return Color(1, 1, 1)


func _render_mode(rec: Dictionary, unshaded: bool, no_shadows := false) -> String:
	var modes := []
	if unshaded:
		modes.append("unshaded")
	if no_shadows:
		modes.append("shadows_disabled")
	modes.append(SIDES[int(rec.side)])
	var blend: int = rec.blending
	if blend == BakedScene.ADDITIVE_BLEND or (blend == BakedScene.CUSTOM_BLEND and rec.blend[0] == 201 and rec.blend[1] == 201):
		modes.append("blend_add")
		# fog would add its colour to the light (the shaders fade additive light themselves)
		modes.append("fog_disabled")
	if not rec.depthWrite or (rec.transparent and blend != BakedScene.NORMAL_BLEND):
		modes.append("depth_draw_never")
	if not rec.depthTest:
		modes.append("depth_test_disabled")
	return "render_mode " + ", ".join(modes) + ";\n"


func _shader(code: String) -> Shader:
	if not _shaders.has(code):
		var s := Shader.new()
		s.code = code
		_shaders[code] = s
	return _shaders[code]


## How a map is sampled: sRGB colour (decoded to linear) or raw data, repeating or clamped.
static func _map_defs(scene: BakedScene, ref, name: String) -> Array:
	var t: Dictionary = scene.json.textures[int(ref.tex)]
	return [
		name + "_HINT " + ("source_color," if t.get("srgb", true) else ""),
		name + "_WRAP " + ("repeat_enable" if int(t.wrap[0]) == 1000 or int(t.wrap[1]) == 1000 else "repeat_disable"),
	]


static func _tex_params(scene: BakedScene, m: ShaderMaterial, name: String, ref) -> void:
	var id: int = ref.tex
	var t: Dictionary = scene.json.textures[id]
	m.set_shader_parameter(name, scene.texture(id))
	m.set_shader_parameter(name + "_xf", Vector4(t.repeat[0], t.repeat[1], t.offset[0], t.offset[1]))


## MeshBasicMaterial: unlit colour x vertex colour x map, alpha test, house light, follow-spots.
func _basic(rec: Dictionary, scene: BakedScene, house: bool, spots: bool) -> Material:
	var additive: bool = rec.blending == BakedScene.ADDITIVE_BLEND
	house = house and rec.toneMapped and not additive and rec.userData.get("house", true) != false
	# the stands' own material does its house light itself (userData.house = false), plus the spots
	if spots:
		house = true
	var defs := []
	if rec.vertexColors:
		defs.append("VCOL")
	if rec.has("map"):
		defs.append("MAP")
		defs.append_array(_map_defs(scene, rec.map, "MAP"))
	if float(rec.alphaTest) > 0.0:
		defs.append("ALPHA_TEST")
	if rec.transparent or additive:
		defs.append("BLEND")
	if additive:
		defs.append("ADDITIVE")
	if house:
		defs.append("HOUSE")
	if spots:
		defs.append("SPOTS")
	var code := "shader_type spatial;\n" + _render_mode(rec, true) + NO_CLEAR
	for d in defs:
		code += "#define " + d + "\n"
	code += BASIC_BODY
	var m := ShaderMaterial.new()
	m.shader = _shader(code)
	var c := _lin(rec.get("color"))
	m.set_shader_parameter("color", Vector3(c.r, c.g, c.b))
	m.set_shader_parameter("opacity", float(rec.opacity))
	m.set_shader_parameter("alpha_test", float(rec.alphaTest))
	if rec.has("map"):
		_tex_params(scene, m, "map", rec.map)
	return m


const BASIC_BODY := """
#include "res://render/venue/common.gdshaderinc"
uniform vec3 color = vec3(1.0);
uniform float opacity = 1.0;
uniform float alpha_test = 0.0;
#ifdef MAP
uniform sampler2D map : MAP_HINT filter_linear_mipmap_anisotropic, MAP_WRAP;
uniform vec4 map_xf = vec4(1.0, 1.0, 0.0, 0.0);
#endif
varying vec3 w_pos;
varying float v_spot;
varying vec4 v_col;
void vertex() {
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
#ifdef SPOTS
	v_spot = CUSTOM0.x;
#endif
#ifdef VCOL
	v_col = CUSTOM1;
#endif
}
void fragment() {
	CLEAR_VIEW
	vec3 c = color;
	float a = opacity;
#ifdef VCOL
	c *= v_col.rgb;
#endif
#ifdef MAP
	vec4 t = texture(map, UV * map_xf.xy + map_xf.zw);
	c *= t.rgb;
	a *= t.a;
#endif
#ifdef ALPHA_TEST
	if (a < alpha_test) discard;
#endif
#ifdef HOUSE
	c *= house_light(w_pos);
#endif
#ifdef SPOTS
	float sk = spot_k(bb_spot0, w_pos) + spot_k(bb_spot1, w_pos) + spot_k(bb_spot2, w_pos);
	c += vec3(1.0, 0.95, 0.85) * 0.22 * v_spot * sk * step(w_pos.y, 22.0);
#endif
	vec4 fog = bb_fog(VERTEX);
#ifdef ADDITIVE
	ALBEDO = c * (1.0 - fog.a);
	ALPHA = a;
#else
	ALBEDO = c;
#ifdef BLEND
	ALPHA = a;
#endif
	FOG = fog;
#endif
}
"""


## MeshStandardMaterial: lit, metal/rough, emissive (map), house light in the venue.
func _standard(rec: Dictionary, scene: BakedScene, house: bool, no_shadows := false) -> Material:
	house = house and rec.toneMapped and rec.blending != BakedScene.ADDITIVE_BLEND and rec.userData.get("house", true) != false
	var defs := []
	if rec.has("map"):
		defs.append("MAP")
		defs.append_array(_map_defs(scene, rec.map, "MAP"))
	if rec.has("emissiveMap"):
		defs.append("EMAP")
		defs.append_array(_map_defs(scene, rec.emissiveMap, "EMAP"))
	if rec.vertexColors:
		defs.append("VCOL")
	if house:
		defs.append("HOUSE")
	if rec.transparent:
		defs.append("BLEND")
	# contact occlusion near the robots (ao.ts patch options, kept by the bake)
	var ao: Dictionary = rec.userData.get("ao", {})
	if not ao.is_empty():
		defs.append("AO_ON")
		if ao.get("floor", false):
			defs.append("AO_FLOOR")
		if ao.get("spheres", false):
			# a flat floor at the map's strength reads the top-down map instead of looping
			defs.append("AO_MAP" if ao.get("floor", false) and float(ao.get("strength", 1.0)) == 2.0 else "AO_SPHERES")
		if ao.has("ground"):
			defs.append("AO_GROUND")
		if ao.has("stage"):
			defs.append("AO_STAGE")
	var code := "shader_type spatial;\n" + _render_mode(rec, false, no_shadows) + NO_CLEAR
	for d in defs:
		code += "#define " + d + "\n"
	code += STANDARD_BODY
	var m := ShaderMaterial.new()
	m.shader = _shader(code)
	var c := _lin(rec.get("color"))
	m.set_shader_parameter("color", Vector3(c.r, c.g, c.b))
	m.set_shader_parameter("opacity", float(rec.opacity))
	m.set_shader_parameter("metalness", float(rec.get("metalness", 0.0)))
	m.set_shader_parameter("roughness", float(rec.get("roughness", 1.0)))
	var e := _lin(rec.get("emissive"))
	if not rec.has("emissive"):
		e = Color(0, 0, 0)
	m.set_shader_parameter("emissive", Vector3(e.r, e.g, e.b) * float(rec.get("emissiveIntensity", 1.0)))
	if rec.has("map"):
		_tex_params(scene, m, "map", rec.map)
	if rec.has("emissiveMap"):
		_tex_params(scene, m, "emap", rec.emissiveMap)
	if not ao.is_empty():
		m.set_shader_parameter("ao_strength", float(ao.get("strength", 1.0)))
		m.set_shader_parameter("ao_direct", float(ao.get("direct", 0.35)))
		var g: Dictionary = ao.get("ground", {})
		if not g.is_empty():
			m.set_shader_parameter("ao_g", Vector3(g.y, g.height, g.k))
		var st: Dictionary = ao.get("stage", {})
		if not st.is_empty():
			m.set_shader_parameter("ao_s", Vector3(st.r0, st.r1, st.k))
	return m


const STANDARD_BODY := """
#include "res://render/venue/common.gdshaderinc"
#ifdef AO_ON
#include "res://render/ao/contact_ao.gdshaderinc"
uniform float ao_strength = 1.0;
uniform float ao_direct = 0.35;
uniform vec3 ao_g = vec3(0.0, 0.5, 0.0);
uniform vec3 ao_s = vec3(5.9, 8.2, 0.0);
#endif
uniform vec3 color = vec3(1.0);
uniform float opacity = 1.0;
uniform float metalness = 0.0;
uniform float roughness = 1.0;
uniform vec3 emissive = vec3(0.0);
#ifdef MAP
uniform sampler2D map : MAP_HINT filter_linear_mipmap_anisotropic, MAP_WRAP;
uniform vec4 map_xf = vec4(1.0, 1.0, 0.0, 0.0);
#endif
#ifdef EMAP
uniform sampler2D emap : EMAP_HINT filter_linear_mipmap_anisotropic, EMAP_WRAP;
uniform vec4 emap_xf = vec4(1.0, 1.0, 0.0, 0.0);
#endif
varying vec3 w_pos;
void vertex() {
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
	CLEAR_VIEW
	vec3 c = color;
	float a = opacity;
#ifdef VCOL
	c *= COLOR.rgb;
#endif
#ifdef MAP
	vec4 t = texture(map, UV * map_xf.xy + map_xf.zw);
	c *= t.rgb;
	a *= t.a;
#endif
	vec3 e = emissive;
#ifdef EMAP
	e *= texture(emap, UV * emap_xf.xy + emap_xf.zw).rgb;
#endif
#ifdef HOUSE
	float h = house_light(w_pos);
	c *= h;
	e *= h;
#endif
	ALBEDO = c;
	METALLIC = metalness;
	ROUGHNESS = roughness;
	EMISSION = e;
#ifdef BLEND
	ALPHA = a;
#endif
#ifdef AO_ON
#ifdef AO_FLOOR
	vec3 n_w = vec3(0.0, 1.0, 0.0);
#else
	vec3 n_w = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
#endif
	float ao = 1.0;
#ifdef AO_MAP
	ao *= ao_floor_map(w_pos.xz);
#endif
#ifdef AO_SPHERES
	ao *= ao_spheres(w_pos, n_w, ao_strength);
#endif
#ifdef AO_GROUND
	ao *= ao_ground(w_pos, n_w, ao_g.x, ao_g.y, ao_g.z);
#endif
#ifdef AO_STAGE
	ao *= ao_stage(w_pos, ao_s.x, ao_s.y, ao_s.z);
#endif
	// ambient and reflections take all of it, direct light the `direct` share (ao.ts patch)
	AO = ao;
	AO_LIGHT_AFFECT = ao_direct;
#endif
	FOG = bb_fog(VERTEX);
}
"""


## A hand-ported ShaderMaterial: its uniforms copied over by name (globals are the game's).
func _kind(kind: String, path: String, rec: Dictionary, scene: BakedScene) -> Material:
	var m := ShaderMaterial.new()
	m.shader = load(path)
	for k in rec.uniforms:
		var v = rec.uniforms[k]
		if v is Dictionary and v.has("global"):
			continue
		var name: String = k.substr(1).to_snake_case() if k.begins_with("u") else k
		if v is Dictionary:
			if v.has("tex"):
				_tex_params(scene, m, name, v)
			elif v.has("color"):
				m.set_shader_parameter(name, Vector3(v.color[0], v.color[1], v.color[2]))
			elif v.has("vec"):
				var a: Array = v.vec
				m.set_shader_parameter(name, Vector2(a[0], a[1]) if a.size() == 2 else Vector3(a[0], a[1], a[2]) if a.size() == 3 else Vector4(a[0], a[1], a[2], a[3]))
		elif v is float or v is int or v is bool:
			m.set_shader_parameter(name, v)
		elif v is Array and not v.is_empty() and v[0] is Dictionary:
			var arr := []
			for e in v:
				if e.has("color"):
					arr.append(Vector3(e.color[0], e.color[1], e.color[2]))
				elif e.has("vec"):
					var a: Array = e.vec
					arr.append(Vector2(a[0], a[1]) if a.size() == 2 else Vector3(a[0], a[1], a[2]) if a.size() == 3 else Vector4(a[0], a[1], a[2], a[3]))
			m.set_shader_parameter(name, arr)
	match kind:
		"glow_points_steady":
			m.set_shader_parameter("steady", true)
		"beam_column":
			m.set_shader_parameter("fade_top", true)
	if not by_kind.has(kind):
		by_kind[kind] = []
	by_kind[kind].append(m)
	return m


func _ropes(rec: Dictionary) -> Material:
	var m := ShaderMaterial.new()
	m.shader = load("res://render/venue/ropes.gdshader")
	var c := _lin(rec.get("color"))
	m.set_shader_parameter("color", Vector3(c.r, c.g, c.b))
	by_kind["ropes"] = [m]
	return m
