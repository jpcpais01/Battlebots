// The gumball machine's glass globe (vault_stage.gd): clear, with the stage's lights caught as
// soft bright windows on it, a cool fresnel rim, and a glow inside that swells as the machine
// works (`glow`, in `glow_col`).
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_back, shadows_disabled;

uniform float glow = 0.0;
uniform vec3 glow_col = vec3(1.0, 0.5, 0.9);

varying vec3 v_n;

void vertex() {
	v_n = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz;
}

void fragment() {
	vec3 n = normalize(NORMAL);
	vec3 v = VIEW;
	float ndv = clamp(dot(n, v), 0.0, 1.0);
	float fres = pow(1.0 - ndv, 3.0);
	vec3 r = (INV_VIEW_MATRIX * vec4(reflect(-v, n), 0.0)).xyz;
	// softbox windows caught on the glass
	float box = smoothstep(0.9, 0.97, dot(r, normalize(vec3(-0.5, 0.7, 0.5))));
	box += smoothstep(0.93, 0.985, dot(r, normalize(vec3(0.7, 0.3, 0.6)))) * 0.7;
	vec3 refl = vec3(1.0, 0.95, 1.0) * box * 1.6 + mix(vec3(0.2, 0.1, 0.4), vec3(0.6, 0.3, 0.9), r.y * 0.5 + 0.5) * fres * 1.2;
	// a thin bright line round the silhouette
	refl += vec3(0.6, 0.85, 1.0) * smoothstep(0.85, 1.0, 1.0 - ndv) * 0.8;
	vec3 inner = glow_col * glow * (0.15 + 0.25 * ndv);
	ALBEDO = refl + inner;
	ALPHA = clamp(0.06 + fres * 0.55 + box * 0.3 + glow * 0.12, 0.0, 1.0);
}
