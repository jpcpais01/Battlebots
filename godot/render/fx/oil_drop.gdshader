// Oil drops (oil.ts `drops`): thick glossy beads. Hanging ones (mode 0) are posed on the CPU
// (they follow their wound); falling ones (mode 1) fly in closed form from their spawn data
// (drag 0.5, gravity 9.8) and string out along their fall.
//
// Falling instance (FxOil._fall_drop): origin = where it let go, basis x = velocity,
// basis y = (time, life, size).
shader_type spatial;
render_mode skip_vertex_transform, cull_back;
#include "res://render/fx/fx_common.gdshaderinc"
#include "res://render/fx/oil_common.gdshaderinc"

uniform float now;
uniform int mode = 0;

varying vec3 v_world;

void vertex() {
	vec3 wp;
	vec3 wn;
	bool hide = false;
	if (mode == 0) {
		mat3 m = mat3(MODEL_MATRIX);
		wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
		wn = inverse(transpose(m)) * NORMAL;
		hide = abs(determinant(m)) < 1e-12;
	} else {
		vec3 p0 = MODEL_MATRIX[3].xyz;
		vec3 v0 = MODEL_MATRIX[0].xyz;
		float tau = now - MODEL_MATRIX[1].x;
		float s = MODEL_MATRIX[1].z;
		hide = tau < 0.0 || tau >= MODEL_MATRIX[1].y || s <= 0.0;
		float c = fx_carry(0.5, tau);
		float e = exp(-0.5 * tau);
		vec3 pos = vec3(p0.x + v0.x * c, fx_y(p0.y, v0.y, 0.5, 9.8, tau), p0.z + v0.z * c);
		vec3 vel = vec3(v0.x * e, fx_vy(v0.y, 0.5, 9.8, tau), v0.z * e);
		// thick oil strings out along its fall
		float sp = length(vel);
		vec3 y = sp > 1e-4 ? vel / sp : vec3(0.0, 1.0, 0.0);
		vec3 x = normalize(cross(y, abs(y.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
		vec3 z = cross(x, y);
		float st = 1.0 + min(2.6, sp * 0.45);
		vec3 sc = vec3(s / sqrt(st), s * st, s / sqrt(st));
		vec3 l = VERTEX * sc;
		wp = pos + x * l.x + y * l.y + z * l.z;
		vec3 ln = NORMAL / sc;
		wn = x * ln.x + y * ln.y + z * ln.z;
	}
	v_world = wp;
	VERTEX = (VIEW_MATRIX * vec4(wp, 1.0)).xyz;
	NORMAL = normalize(mat3(VIEW_MATRIX) * wn);
	POSITION = hide ? vec4(2.0, 2.0, 2.0, 1.0) : PROJECTION_MATRIX * vec4(VERTEX, 1.0);
}

void fragment() {
	vec3 alb;
	vec3 em;
	oil_surface(v_world, VIEW, NORMAL, 0.05, alb, em);
	ALBEDO = alb;
	ROUGHNESS = 0.05;
	METALLIC = 0.25;
	EMISSION = em;
}
