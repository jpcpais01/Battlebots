// The deck's pylons (titan_build.gd pylons()): gunmetal shafts on stone plinths, with emitter
// rings at the energy ropes' heights and a beacon cap, glowing in their side's colour. Lit (sun, sky, the robots' rims).
// The camera's clear view dissolves one standing between the lens and the titans.
shader_type spatial;
render_mode cull_back;
#include "res://render/titan/titan_common.gdshaderinc"
#include "res://render/clear/clear_view.gdshaderinc"

// The corners' colours (linear): each pylon glows in the colour of the side of the ring it is on.
uniform vec3 team0 = vec3(0.0232, 0.6867, 1.0);
uniform vec3 team1 = vec3(1.0, 0.1946, 0.0232);
uniform float flare = 0.0;

varying vec3 v_w;
varying vec2 v_pat;

void vertex() {
	v_w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_pat = UV2;
}

void fragment() {
	if (clear_view_gone(v_w.xz, FRAGCOORD.xy)) discard;
	float h = UV.y;
	vec3 col = mix(team1, team0, smoothstep(-1.5, 1.5, v_w.x));
	vec3 c;
	float metal = 0.0;
	float rough = 0.6;
	vec3 glow = vec3(0.0);
	float hum = 0.85 + 0.15 * sin(bb_time * 7.0 + h * 20.0);
	float k = (1.2 + bb_hype * 0.6 + flare * 2.0) * hum;
	if (h < 0.13) {
		c = vec3(0.55, 0.47, 0.37) * (0.8 + 0.3 * t_noise(UV * vec2(8.0, 30.0)));
		rough = 0.9;
	} else if (v_pat.x > 0.5) {
		// an emitter: a dark ring with a thin glowing slot round its middle, where the beam leaves
		float mid = fract(h * 10.0);
		c = vec3(0.05, 0.05, 0.06);
		metal = 0.6;
		rough = 0.35;
		glow = col * k * (1.0 - smoothstep(0.08, 0.16, abs(mid - 0.5))) * 1.6;
		if (h > 1.7) glow = col * k * 1.4 + vec3(0.6) * flare;
	} else {
		// a dark gunmetal shaft of armour plates, a glowing seam running up two of its faces
		float face = floor(UV.x * 8.0 + 0.001);
		vec2 q = vec2(UV.x * 8.0, h * 6.0);
		vec2 f = fract(q);
		float seam = 1.0 - smoothstep(0.015, 0.04, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
		c = vec3(0.045, 0.048, 0.055) * (1.0 - 0.5 * seam) * (0.8 + 0.4 * t_hash2(floor(q)));
		metal = 0.55;
		rough = 0.5;
		if (mod(face, 4.0) == 0.0) {
			float strip = 1.0 - smoothstep(0.04, 0.09, abs(f.x - 0.5));
			float run = 0.6 + 0.4 * sin(h * 14.0 - bb_time * 4.0);
			glow = col * k * strip * run * 0.9;
		}
	}
	ALBEDO = c;
	METALLIC = metal;
	ROUGHNESS = rough;
	EMISSION = glow;
}
