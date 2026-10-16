// Oil puddles and oily footprints on the canvas (oil.ts `pools`): a slick, irregular blob with a
// few satellite droplets (oil.ts blobTexture, drawn here from its ten dots), spreading out
// (quickly at first, then slowly) and fading in. Instance (FxOil._write_pool): origin = centre,
// basis x = (radius, target radius, since when), basis y = (turn, aspect, born),
// basis z = (peak alpha, footprint).
shader_type spatial;
render_mode skip_vertex_transform, blend_mix, depth_draw_never, cull_back;
#include "res://render/fx/oil_common.gdshaderinc"

uniform float now;

varying vec3 v_world;
varying vec2 v_px;
varying float v_fade;

// blobTexture's dots (x, y, radius) on its 128 px canvas
const vec3 DOTS[10] = vec3[](vec3(64.0, 64.0, 34.0), vec3(80.0, 56.0, 24.0), vec3(50.0, 74.0, 22.0), vec3(70.0, 82.0, 18.0), vec3(46.0, 50.0, 16.0),
	vec3(96.0, 76.0, 7.0), vec3(26.0, 66.0, 6.0), vec3(84.0, 28.0, 5.0), vec3(38.0, 98.0, 4.0), vec3(106.0, 50.0, 3.5));

void vertex() {
	vec3 o = MODEL_MATRIX[3].xyz;
	float r0 = MODEL_MATRIX[0].x;
	float target = MODEL_MATRIX[0].y;
	float r = target - (target - r0) * exp(-1.4 * max(0.0, now - MODEL_MATRIX[0].z));
	float rot = MODEL_MATRIX[1].x;
	float aspect = MODEL_MATRIX[1].y;
	bool print = MODEL_MATRIX[2].y > 0.5;
	// prints are long and narrow; puddles a little oval
	vec2 sc = print ? vec2(r * 1.1, r * 2.4) : vec2(r * aspect * 2.0, r * 2.0 / aspect);
	// the quad shrunk to the dots' bounds (x 20..110, y 23..102 of 128): under half the pixels
	vec2 qv = mix(vec2(20.0, 23.0), vec2(110.0, 102.0), VERTEX.xz + 0.5) / 128.0 - 0.5;
	vec2 l = qv * sc;
	vec2 t = vec2(l.x * cos(rot) + l.y * sin(rot), -l.x * sin(rot) + l.y * cos(rot));
	vec3 wp = vec3(o.x + t.x, 0.003, o.z + t.y);
	v_world = wp;
	// the plane's uv on three's flipped canvas: x across, z down the image
	v_px = (qv + 0.5) * 128.0;
	v_fade = MODEL_MATRIX[2].x * min(1.0, (now - MODEL_MATRIX[1].z) * 8.0);
	VERTEX = (VIEW_MATRIX * vec4(wp, 1.0)).xyz;
	// (the web's polygon offset: a hair toward the camera, so it never fights the canvas)
	VERTEX -= normalize(VERTEX) * 0.004;
	NORMAL = normalize(mat3(VIEW_MATRIX) * vec3(0.0, 1.0, 0.0));
	POSITION = (r <= 0.0 || MODEL_MATRIX[1].y <= 0.0) ? vec4(2.0, 2.0, 2.0, 1.0) : PROJECTION_MATRIX * vec4(VERTEX, 1.0);
}

void fragment() {
	// white dots composited over black: the alpha map
	float clear = 1.0;
	for (int i = 0; i < 10; i++) {
		float d = distance(v_px, DOTS[i].xy) / DOTS[i].z;
		clear *= 1.0 - clamp((1.0 - d) / 0.18, 0.0, 1.0);
	}
	float a = (1.0 - clear) * v_fade;
	if (a < 0.003) {
		discard;
	}
	vec3 alb;
	vec3 em;
	oil_surface(v_world, VIEW, NORMAL, 0.07, alb, em);
	ALBEDO = alb;
	ROUGHNESS = 0.05;
	METALLIC = 0.25;
	EMISSION = em * v_fade;
	ALPHA = a;
}
