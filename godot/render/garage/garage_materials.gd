## Godot ports of the workshop's materials (src/render/garage.ts), for BakedScene: what the arena
## shares goes through VenueMaterials; on top of it come the baked prop meshes (bake.ts
## vertexPBR: colour, metalness and roughness per corner) and the scan ring's sheet.
class_name GarageMaterials
extends VenueMaterials

const SCAN_SHADER := preload("res://render/garage/garage_scan.gdshader")


func make(rec: Dictionary, node: Dictionary, scene: BakedScene) -> Array:
	var attrs: Dictionary = scene.json.geometries[int(node.geometry)].attributes
	if rec.type == "MeshStandardMaterial" and attrs.has("mr"):
		# (colours ride in a float slot: Godot keeps COLOR in 8 bits, too coarse for the dark steel)
		return [_cached(str(rec.hash()), func(): return _props(rec)), {"mr": "CUSTOM0", "color": "CUSTOM1"}]
	if rec.type == "ShaderMaterial" and rec.get("kind", "") == "garage_scan":
		return [_cached(str(rec.hash()), func(): return _scan(rec)), {}]
	return super.make(rec, node, scene)


## bake.ts vertexPBR(MeshStandardMaterial) with its contact occlusion (garage.ts props()).
func _props(rec: Dictionary) -> Material:
	var ao: Dictionary = rec.userData.get("ao", {})
	var code := "shader_type spatial;\n" + _render_mode(rec, false) + NO_CLEAR
	if ao.get("spheres", false):
		code += "#define AO_SPHERES\n"
	code += PROPS_BODY
	var m := ShaderMaterial.new()
	m.shader = _shader(code)
	var g: Dictionary = ao.get("ground", {"y": 0.0, "height": 0.35, "k": 0.45})
	m.set_shader_parameter("ao_g", Vector3(g.y, g.height, g.k))
	m.set_shader_parameter("ao_direct", float(ao.get("direct", 0.5)))
	return m


const PROPS_BODY := """
#include "res://render/venue/common.gdshaderinc"
#include "res://render/ao/contact_ao.gdshaderinc"
uniform float ao_direct = 0.5;
uniform vec3 ao_g = vec3(0.0, 0.35, 0.45);
varying vec3 w_pos;
varying vec3 v_col;
varying vec2 v_mr;
void vertex() {
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_col = CUSTOM1.rgb;
	v_mr = CUSTOM0.xy;
}
void fragment() {
	CLEAR_VIEW
	ALBEDO = v_col;
	METALLIC = v_mr.x;
	ROUGHNESS = v_mr.y;
	vec3 n_w = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float ao = ao_ground(w_pos, n_w, ao_g.x, ao_g.y, ao_g.z);
#ifdef AO_SPHERES
	ao *= ao_spheres(w_pos, n_w, 1.0);
#endif
	AO = ao;
	AO_LIGHT_AFFECT = ao_direct;
	FOG = bb_fog(VERTEX);
}
"""


## The equip scan's glowing sheet (garage.ts sheetMat): fades in towards its top edge.
func _scan(rec: Dictionary) -> Material:
	var m := ShaderMaterial.new()
	m.shader = SCAN_SHADER
	var c = rec.uniforms.uColor
	m.set_shader_parameter("color", Vector3(c.color[0], c.color[1], c.color[2]))
	m.set_shader_parameter("a", 0.0)
	if not by_kind.has("garage_scan"):
		by_kind["garage_scan"] = []
	by_kind["garage_scan"].append(m)
	return m
