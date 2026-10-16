// Ring ropes: an armoured sleeve round a neon core (web: arena.ts rope material). Unlit: the
// core's light shows through where the tube faces the camera and the sleeve darkens its edges.
shader_type spatial;
render_mode unshaded;

uniform vec3 core = vec3(0.084, 0.79, 1.15);
uniform vec3 sleeve = vec3(0.012, 0.014, 0.02);
uniform float time = 0.0;
uniform float hype = 0.3;

varying float v_u;

void vertex() {
	v_u = UV.y;
}

void fragment() {
	float facing = abs(dot(NORMAL, VIEW));
	float ripple = 0.85 + 0.15 * sin(v_u * 18.0 - time * (2.0 + 4.0 * hype));
	ALBEDO = mix(sleeve, core * ripple, smoothstep(0.35, 0.9, facing));
}
