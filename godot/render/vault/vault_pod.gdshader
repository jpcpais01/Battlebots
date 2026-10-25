// A skin pod (vault_stage.gd): a capsule of dark glass between two anodised metal caps, a light
// glowing in its core with rings of it scanning up through the glass, and a seam round its middle
// that blazes in the colour of what's inside as it charges (`charge`), cracks of light spreading
// over it before it bursts (`crack`). `half`: 0 the whole pod, 1 its top only, 2 its bottom only
// (the halves flying apart). On a MultiMesh (the pods on the vault's racks) the instance colour
// is the caps' and the instance's custom data the light's.
shader_type spatial;

uniform vec3 top_col : source_color = vec3(0.9, 0.2, 0.4);
uniform bool use_instance = false;
// the light inside (linear, HDR)
uniform vec3 seam_col = vec3(0.6, 0.75, 1.0);
uniform float charge = 0.0;
uniform float crack = 0.0;
uniform int half = 0;
// half the pod's length (the mesh's y runs -len..len), and half its glass band's
uniform float len = 0.5;
uniform float glass = 0.26;
// how bright the core glows at rest
uniform float idle_glow = 0.35;

varying vec3 v_p;
varying vec3 v_cap;
varying vec3 v_core;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void vertex() {
	v_p = VERTEX;
	v_cap = use_instance ? COLOR.rgb : top_col;
	v_core = use_instance ? INSTANCE_CUSTOM.rgb * 2.0 : seam_col;
}

void fragment() {
	vec3 p = v_p;
	if ((half == 1 && p.y < -0.004) || (half == 2 && p.y > 0.004)) {
		discard;
	}
	vec3 lc = v_core;
	float g = abs(p.y);
	float f = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float fres = pow(1.0 - f, 2.0);
	float is_glass = 1.0 - smoothstep(glass - 0.008, glass, g);
	// the caps: anodised metal in the pod's colour, a chrome collar where they hold the glass
	float collar = smoothstep(glass, glass + 0.008, g) * (1.0 - smoothstep(glass + 0.07, glass + 0.078, g));
	ALBEDO = mix(v_cap * 0.9, vec3(0.93, 0.94, 0.97), collar);
	METALLIC = mix(0.55, 1.0, collar);
	ROUGHNESS = mix(0.32, 0.08, collar);
	SPECULAR = 0.5;
	// the glass: nearly black, mirror smooth
	ALBEDO = mix(ALBEDO, vec3(0.015, 0.018, 0.025), is_glass);
	METALLIC = mix(METALLIC, 0.0, is_glass);
	ROUGHNESS = mix(ROUGHNESS, 0.04, is_glass);
	SPECULAR = mix(SPECULAR, 0.9, is_glass);
	// the light in its core, seen through the glass: brightest straight through
	float core = pow(f, 1.6);
	float lvl = idle_glow + charge * 4.0;
	vec3 em = lc * is_glass * (core * lvl + fres * (0.12 + charge * 0.8));
	// rings of light scanning up through it, quicker as it charges
	float scan = smoothstep(0.8, 1.0, sin(p.y * 55.0 - TIME * (3.0 + charge * 22.0)));
	em += lc * is_glass * scan * core * (0.35 + charge * 2.5);
	// the seam round its middle, and its glow spilling onto the glass
	float groove = 1.0 - smoothstep(0.006, 0.018, g);
	em += lc * groove * (1.2 + charge * 16.0);
	em += lc * exp(-g * 14.0) * charge * 2.5 * is_glass;
	// the collars catch the light too, and the caps keep a little of their colour in the dark
	em += lc * collar * (0.15 + charge * 2.0);
	em += v_cap * (1.0 - is_glass) * (1.0 - collar) * 0.08;
	// a ring lit on the top cap
	float y = p.y / len;
	float cap = smoothstep(0.78, 0.9, y);
	float ring = 1.0 - smoothstep(0.025, 0.05, abs(length(p.xz) / len - 0.3));
	em += lc * ring * cap * (0.6 + charge * 5.0);
	// cracks of light spreading out from the seam
	if (crack > 0.0) {
		float ang = atan(p.z, p.x);
		float k = 0.0;
		for (int i = 0; i < 3; i++) {
			float fi = float(i);
			float lnv = abs(fract(ang * (1.3 + fi * 0.7) + sin(y * (5.0 + fi * 3.0) + fi * 2.0) * 0.35 + hash(vec2(fi, 3.0))) - 0.5);
			k = max(k, 1.0 - smoothstep(0.0, 0.035, lnv));
		}
		float reach = 1.0 - smoothstep(crack * 0.9, crack * 0.9 + 0.1, abs(y));
		em += lc * k * reach * 10.0 * crack;
	}
	EMISSION = em;
}
