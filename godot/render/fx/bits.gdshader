// Torn metal fragments (bits.ts Bits.material): flat-shaded lit metal in the instance's colour
// that glows from inside where its heat is up, a freshly torn edge going dull red, orange, then
// yellow-white at the hottest. INSTANCE_CUSTOM.x = heat (1 orange hot .. 0 cold).
shader_type spatial;
render_mode cull_back;

uniform float metalness = 0.75;
uniform float roughness = 0.42;
uniform float heat_glow = 3.2;

varying vec3 v_col;
varying float v_heat;

void vertex() {
	v_col = COLOR.rgb;
	v_heat = INSTANCE_CUSTOM.x;
}

void fragment() {
	// three's flatShading: the face normal from the screen derivatives, turned to the viewer
	vec3 n = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
	NORMAL = dot(n, VIEW) < 0.0 ? -n : n;
	float hh = clamp(v_heat, 0.0, 1.0);
	vec3 hot = mix(vec3(0.55, 0.04, 0.0), vec3(1.0, 0.42, 0.06), smoothstep(0.15, 0.6, hh));
	hot = mix(hot, vec3(1.0, 0.85, 0.55), smoothstep(0.75, 1.0, hh));
	ALBEDO = v_col * (1.0 - 0.6 * hh);
	METALLIC = metalness;
	ROUGHNESS = roughness;
	EMISSION = hot * hh * hh * heat_glow;
}
