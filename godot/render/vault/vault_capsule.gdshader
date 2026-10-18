// A skin capsule (vault_stage.gd): a glossy two-tone pill, its top half in the capsule's colour
// and its bottom half pearly white, joined at a seam that glows in the colour of what's inside
// as it charges (`charge`), with cracks of light spreading over it before it bursts (`crack`).
// `half`: 0 the whole capsule, 1 its top only, 2 its bottom only (the halves flying apart).
// On a MultiMesh (the pile in the globe) the instance colour is the top's.
shader_type spatial;

uniform vec3 top_col : source_color = vec3(0.9, 0.2, 0.4);
uniform bool use_instance = false;
uniform vec3 seam_col = vec3(0.6, 0.75, 1.0);
uniform float charge = 0.0;
uniform float crack = 0.0;
uniform int half = 0;
// half the pill's length (the mesh's y runs -len..len)
uniform float len = 0.45;

varying vec3 v_p;
varying vec3 v_inst;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void vertex() {
	v_p = VERTEX;
	v_inst = use_instance ? COLOR.rgb : top_col;
}

void fragment() {
	vec3 p = v_p;
	if ((half == 1 && p.y < -0.004) || (half == 2 && p.y > 0.004)) {
		discard;
	}
	float top = step(0.0, p.y);
	vec3 tc = v_inst;
	ALBEDO = mix(vec3(0.86, 0.87, 0.92), tc, top);
	METALLIC = 0.0;
	ROUGHNESS = mix(0.22, 0.12, top);
	SPECULAR = 0.7;
	float y = p.y / len;
	// the seam: a dark groove, and a ring of trim either side of it
	float g = abs(y);
	float groove = 1.0 - smoothstep(0.012, 0.03, g);
	float trim = step(g, 0.09) * (1.0 - groove);
	ALBEDO = mix(ALBEDO, vec3(0.75, 0.62, 0.3), trim * 0.8);
	METALLIC = mix(METALLIC, 1.0, trim);
	ROUGHNESS = mix(ROUGHNESS, 0.25, trim);
	ALBEDO *= 1.0 - groove * (1.0 - charge);
	vec3 em = seam_col * groove * (0.6 + charge * 18.0);
	em += seam_col * exp(-g * 12.0) * charge * 3.0;
	// the light leaking through the shell
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.0);
	em += seam_col * fres * charge * charge * 3.0;
	// a little of the night's violet glow round its edge (the ones drifting in the dark)
	em += mix(vec3(0.5, 0.25, 0.9), tc, 0.5) * fres * 0.45;
	// the emblem on the top cap: a ring lit from inside
	vec2 e = p.xz / len;
	float cap = smoothstep(0.75, 0.9, y);
	float er = length(e);
	float ring = 1.0 - smoothstep(0.03, 0.06, abs(er - 0.32));
	em += seam_col * ring * cap * (0.5 + charge * 6.0);
	// cracks of light spreading from the seam
	if (crack > 0.0) {
		float ang = atan(p.z, p.x);
		float k = 0.0;
		for (int i = 0; i < 3; i++) {
			float fi = float(i);
			float lnv = abs(fract(ang * (1.3 + fi * 0.7) + sin(y * (5.0 + fi * 3.0) + fi * 2.0) * 0.35 + hash(vec2(fi, 3.0))) - 0.5);
			k = max(k, 1.0 - smoothstep(0.0, 0.035, lnv));
		}
		float reach = 1.0 - smoothstep(crack * 0.9, crack * 0.9 + 0.1, g);
		em += seam_col * k * reach * 10.0 * crack;
	}
	EMISSION = em;
}
