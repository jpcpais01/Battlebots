// The titan city's evening sky (a dome round it all, titan_venue.gd): the sun low over the sea
// to the north-north-west, gold and rose along the horizon deepening to blue overhead, long
// bars of cloud lit from beneath. The same numbers feed the ambient light the titans get
// (VenueLook reads the uniforms as the venue's dome).
shader_type spatial;
render_mode unshaded, cull_front, fog_disabled, shadows_disabled, depth_draw_never;
#include "res://render/titan/titan_common.gdshaderinc"

uniform vec3 uZenith = vec3(0.12, 0.155, 0.29);
uniform vec3 uHorizon = vec3(0.86, 0.56, 0.38);
uniform vec3 uGlowCol = vec3(1.0, 0.5, 0.18);
uniform vec3 uHaze = vec3(0.4, 0.39, 0.45);
uniform vec3 uGnd = vec3(0.16, 0.12, 0.08);
uniform vec3 uSunDir = vec3(-0.4202, 0.2201, -0.8804);
uniform vec3 uSunCol = vec3(1.0, 0.6, 0.34);
uniform vec4 uCloud = vec4(0.5, 0.5, 0.0, 1.0);

varying vec3 v_dir;

void vertex() {
	v_dir = (MODEL_MATRIX * vec4(VERTEX, 0.0)).xyz;
}

void fragment() {
	vec3 d = normalize(v_dir);
	float h = d.y;
	vec3 c = t_sky(d);
	float s = max(dot(d, T_SUN_DIR), 0.0);
	// the sun's disc, flattened and reddened by the thick air at the horizon
	c += vec3(1.0, 0.62, 0.3) * smoothstep(0.99955, 0.99975, s) * 22.0;
	// long bars of cloud: thin, stretched east-west, lit gold underneath near the sun, mauve away
	// (a band over the horizon: higher up, where the bars would come out as big flat blobs, it's
	// clear)
	vec2 cp = d.xz / max(h + 0.06, 0.03);
	float bars = t_fbm(vec2(cp.x * 0.7 + bb_time * 0.002, cp.y * 3.2));
	float cl = smoothstep(0.5, 0.8, bars) * smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.12, 0.32, h));
	vec3 lit = mix(vec3(0.62, 0.42, 0.48), vec3(1.6, 0.85, 0.42), pow(s, 3.0));
	vec3 dark = vec3(0.28, 0.22, 0.3);
	vec3 cloud = mix(dark, lit, smoothstep(0.4, 0.8, bars + s * 0.3));
	c = mix(c, cloud, cl * 0.85);
	// high wisps overhead
	float wisp = smoothstep(0.55, 0.9, t_fbm(cp * vec2(1.4, 2.6) + 11.0)) * smoothstep(0.2, 0.5, h);
	c = mix(c, vec3(0.75, 0.6, 0.62) * (0.6 + 0.6 * s), wisp * 0.22);
	// the horizon's haze
	c = mix(c, mix(T_HAZE, T_HAZE_SUN, pow(s, 4.0)), (1.0 - smoothstep(-0.01, 0.07, h)) * 0.75);
	ALBEDO = c;
}
