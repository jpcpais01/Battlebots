// What lit materials (the robots, the ring) take their ambient light and reflections from in an
// event venue: three's hemisphere light (stage.ts hemi: its sky colour above the horizon, its
// ground colour below, over pi, so Godot's ambient integral gives mix(ground, sky, n.y/2 + 1/2)
// as three's does) plus the venue's environment at envIntensity: the sky dome's gradient, glow
// and sun (kit.ts skyDome) over the ground fill below the horizon. Not drawn as the background:
// the venue's own dome (a mesh) is what's seen. Set by render/venues/venue_look.gd.
shader_type sky;

uniform vec3 hemi_sky = vec3(0.1);
uniform vec3 hemi_ground = vec3(0.05);
uniform float env_k = 1.0;
uniform vec3 zenith = vec3(0.1, 0.2, 0.5);
uniform vec3 horizon = vec3(0.5, 0.6, 0.7);
uniform vec3 glow_col = vec3(1.0, 0.7, 0.4);
uniform vec3 haze = vec3(0.6, 0.7, 0.8);
uniform vec3 gnd = vec3(0.2, 0.18, 0.15);
uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0);
uniform vec3 sun_col = vec3(1.0);
// cover, glow size, stars, sun disc (kit.ts uCloud)
uniform vec4 cloud = vec4(0.0, 0.5, 0.0, 1.0);

void sky() {
	vec3 d = EYEDIR;
	float h = d.y;
	vec3 c = mix(horizon, zenith, smoothstep(0.0, 0.55, h));
	c = mix(c, haze, 1.0 - smoothstep(-0.02, 0.12, h));
	float s = max(dot(d, sun_dir), 0.0);
	float g = cloud.y;
	c += glow_col * (pow(s, mix(24.0, 4.0, g)) * 0.55 + pow(s, mix(300.0, 40.0, g)) * 0.6);
	c += sun_col * smoothstep(0.99955, 0.99975, s) * 6.0 * cloud.w;
	// below the horizon: the ground round the venue in its fill light, through the haze
	c = mix(c, mix(haze, gnd, smoothstep(0.0, -0.35, h)), step(h, 0.0));
	COLOR = c * env_k + (h >= 0.0 ? hemi_sky : hemi_ground);
}
