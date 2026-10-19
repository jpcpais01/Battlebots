// What metal reflects at the beach (beach.ts: a PMREM of the sky dome over a disc of sand): the
// same sky as the dome, the far sea at the horizon, and pale sand below. Only lights and reflects
// (the world environment's background stays a colour; the dome is drawn as a mesh). The clouds
// stand still here, so the reflections are only rendered once.
shader_type sky;

uniform vec3 sun = vec3(-0.399, 0.638, -0.658);
uniform vec3 zenith = vec3(0.0080, 0.0887, 0.5394);
uniform vec3 horizon = vec3(0.2664, 0.5271, 0.8070);
uniform vec3 glow = vec3(0.7605, 0.8714, 0.9387);
uniform vec3 sun_col = vec3(1.0, 0.9130, 0.7913);
uniform vec3 ground = vec3(0.6867, 0.6038, 0.4564);
uniform sampler2D noise : repeat_enable, filter_linear_mipmap;
// stage.ts applyLook: the look's environment intensity
uniform float intensity = 0.7;
// the hemisphere light's slope, sky colour above and sand below (HomeStage sets it from the look:
// its even part is the world environment's ambient colour)
uniform vec3 hemi_tilt = vec3(-0.078, 0.0125, 0.133);

vec3 skyCol(vec3 d) {
	float h = clamp(d.y, 0.0, 1.0);
	float s = max(dot(d, sun), 0.0);
	vec3 col = mix(horizon, zenith, pow(h, 0.42));
	col = mix(col, glow, exp(-h * 30.0) * 0.45);
	float side = max(dot(normalize(d.xz + vec2(1e-5)), normalize(sun.xz)), 0.0);
	col += glow * pow(1.0 - h, 6.0) * 0.1 * side * side;
	col += sun_col * (pow(s, 5.0) * 0.1 + pow(s, 48.0) * 0.32 + pow(s, 700.0) * 1.5);
	return col;
}

// three lights with this map at its roughest (getIBLIrradiance: the PMREM at roughness 1), a far
// wider blur than Godot takes for its ambient, which is little more than the radiance straight
// along the normal: so towards the zenith and the nadir this map is that wide blur, measured
// (cosine-weighted and whole-sphere averages of the sky and sand above, half and half) facing up,
// sideways and down. Sideways the two agree, and the horizon (what metal mirrors most) stays sharp.
const vec3 BLUR_UP = vec3(0.232, 0.31, 0.593);
const vec3 BLUR_SIDE = vec3(0.377, 0.428, 0.577);
const vec3 BLUR_DOWN = vec3(0.53, 0.514, 0.518);

void sky() {
	vec3 d = EYEDIR;
	vec3 col;
	// the sand disc (radius 9, 1.2 below the probe) fills everything under about 7.6 degrees down
	if (d.y < -0.1322) {
		col = ground;
	} else if (d.y < 0.0) {
		col = skyCol(normalize(vec3(d.x, 0.0, d.z))) * vec3(0.62, 0.8, 0.92);
	} else {
		col = skyCol(d);
		vec2 uv = d.xz / (max(d.y, 0.0) + 0.07) * 0.15;
		float dens = textureLod(noise, uv, 0.0).r * 0.62 + textureLod(noise, uv * 2.3 + 0.37, 0.0).g * 0.3;
		float cov = mix(0.55, 0.72, smoothstep(0.02, 0.4, d.y));
		float a = smoothstep(cov, cov + 0.14, dens) * smoothstep(0.0, 0.04, d.y);
		col = mix(col, vec3(1.0, 0.99, 0.97), a * 0.9);
		col += sun_col * smoothstep(0.99955, 0.99972, max(dot(d, sun), 0.0)) * 22.0;
	}
	vec3 blur = d.y > 0.0 ? mix(BLUR_SIDE, BLUR_UP, d.y) : mix(BLUR_SIDE, BLUR_DOWN, -d.y);
	col = mix(col, blur, smoothstep(0.15, 0.7, abs(d.y)));
	// (Godot's ambient takes about a cosine-weighted average round the normal: a slope b along y
	// lights a surface facing n by 2/3 b n.y, so the hemisphere's half-difference is 3/4 of it)
	COLOR = max(col * intensity + hemi_tilt * d.y, vec3(0.0));
}
