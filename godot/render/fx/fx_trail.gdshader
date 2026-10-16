// A swing trail (fx.ts Trail): a camera-facing ribbon through the last 14 places a fist or
// foot was, narrowing to the tail, each point fading 0.12 s after it was laid down.
//
// Mesh: 28 vertices, VERTEX = (point index, side +-1). pts[i] = (where, when it was laid).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled;

uniform vec4 pts[14];
uniform float now;
uniform float width = 0.13;
uniform vec3 color;

varying float v_a;

void vertex() {
	int i = int(VERTEX.x + 0.5);
	vec3 p = pts[i].xyz;
	vec3 q = pts[min(13, i + 1)].xyz;
	vec3 v = p - q;
	if (dot(v, v) < 1e-6) {
		v = vec3(0.0, 1.0, 0.0);
	}
	vec3 w = normalize(cross(v, CAMERA_POSITION_WORLD - p));
	float k = 1.0 - float(i) / 13.0;
	float fade = max(0.0, 1.0 - (now - pts[i].w) / 0.12);
	v_a = k * fade * 0.8;
	POSITION = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(p + w * width * k * VERTEX.y, 1.0));
}

void fragment() {
	ALBEDO = color * v_a;
	ALPHA = v_a;
}
