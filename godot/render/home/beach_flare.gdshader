// The sun's lens flare (src/render/home/beachWorld.ts FLARE_VERT / FLARE_FRAG): glows, rings and
// ghosts along the line from the sun through the middle of the screen, fading as the sun leaves
// the frame or a cloud drifts over it. Each quad's corner, element (along, size, shape, strength)
// and tint ride in CUSTOM0..2.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, depth_test_disabled, cull_disabled, fog_disabled, shadows_disabled;

#include "res://render/home/beach_world.gdshaderinc"

varying vec2 v_uv;
varying vec3 v_col;
varying float v_shape;

void vertex() {
	vec4 el = CUSTOM1;
	vec4 c = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(CAMERA_POSITION_WORLD + sun * 50.0, 1.0));
	vec2 sp = c.xy / max(c.w, 1e-4);
	float vis = c.w > 0.0 ? 1.0 - smoothstep(0.85, 1.35, max(abs(sp.x), abs(sp.y))) : 0.0;
	// a cloud over the sun dims it
	float cov = cloudCover(sun.y);
	vis *= 1.0 - 0.85 * smoothstep(cov, cov + 0.14, cloudD_lod(cloudUV(sun)));
	float aspect = PROJECTION_MATRIX[1][1] / PROJECTION_MATRIX[0][0];
	vec2 stretch = el.z > 2.5 ? vec2(9.0, 0.35) : vec2(1.0);
	vec2 q = mix(sp, -sp, el.x) + CUSTOM0.xy * el.y * stretch * vec2(1.0 / aspect, 1.0);
	v_uv = CUSTOM0.xy;
	v_col = CUSTOM2.rgb * el.w * vis;
	v_shape = el.z;
	POSITION = vis > 0.001 ? vec4(q, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}

void fragment() {
	float r = length(v_uv);
	float a;
	if (v_shape < 0.5) a = pow(max(1.0 - r, 0.0), 2.2);
	else if (v_shape < 1.5) a = smoothstep(1.0, 0.86, r) * smoothstep(0.62, 0.9, r);
	else if (v_shape < 2.5) {
		vec2 q = abs(v_uv);
		float hx = max(q.x * 0.866 + q.y * 0.5, q.y);
		a = smoothstep(1.0, 0.9, hx) * (0.55 + 0.45 * hx);
	} else a = pow(max(1.0 - abs(v_uv.y), 0.0), 4.0) * pow(max(1.0 - abs(v_uv.x), 0.0), 3.0);
	ALBEDO = v_col * a;
}
