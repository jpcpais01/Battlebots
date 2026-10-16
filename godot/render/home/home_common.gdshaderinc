// Shared by the home scenes' shaders: three's FogExp2 (the place's fog, set by HomeStage into the
// bb_fog globals while it shows), and three's tangent-free normal mapping.
global uniform vec3 bb_fog_color;
global uniform float bb_fog_density;

vec4 home_fog(vec3 view_pos) {
	float d = -view_pos.z * bb_fog_density;
	return vec4(bb_fog_color, 1.0 - exp(-d * d));
}

// The fog folded into a lit surface (in fragment()), after ALBEDO and EMISSION are written: what
// three draws, mix(lit, fog colour, f), for all but the highlights. (Godot's own FOG output
// doesn't dim the lights on the Compatibility renderer, so far things glowed white.)
#define HOME_FOG_LIT { vec4 fg_ = home_fog(VERTEX); ALBEDO *= 1.0 - fg_.a; EMISSION = EMISSION * (1.0 - fg_.a) + fg_.rgb * fg_.a; }

// three's perturbNormal2Arb: a normal map on a mesh without tangents, the frame taken from the
// screen-space derivatives of the (view-space) position and the uv
vec3 perturb_normal(vec3 eye_pos, vec3 surf_norm, vec2 uv, vec3 mapN) {
	vec3 q0 = dFdx(eye_pos);
	vec3 q1 = dFdy(eye_pos);
	vec2 st0 = dFdx(uv);
	vec2 st1 = dFdy(uv);
	vec3 N = normalize(surf_norm);
	vec3 q1perp = cross(q1, N);
	vec3 q0perp = cross(N, q0);
	vec3 T = q1perp * st0.x + q0perp * st1.x;
	vec3 B = q1perp * st0.y + q0perp * st1.y;
	float det = max(dot(T, T), dot(B, B));
	float scale = det == 0.0 ? 0.0 : inversesqrt(det);
	return normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + N * mapN.z);
}
