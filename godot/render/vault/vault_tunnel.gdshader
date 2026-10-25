// Inside the vault (vault_stage.gd), seen through its round door: a steel tube (drawn from inside)
// ringed with brass ribs, its sides lined with lit niches, each holding a glowing pod's silhouette
// in a colour of its own; and at its far end (`cap`) a blaze of light. All of it brightens as the
// door swings open (`open`), tinted by `tint`.
shader_type spatial;
render_mode cull_front;

uniform bool cap = false;
uniform float open = 0.0;
uniform vec3 tint = vec3(1.0, 0.8, 0.55);
// the tube's length (its local y runs -len/2..len/2, the door's end at +len/2)
uniform float len = 7.0;

varying vec3 v_p;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void vertex() {
	v_p = VERTEX;
}

void fragment() {
	float lit = 0.25 + open * 0.75;
	if (cap) {
		// the far end: a white-hot middle in the vault's light, rings of it round
		float r = length(v_p.xy);
		float rings = smoothstep(0.85, 1.0, sin(r * 9.0 - TIME * 2.0)) * (1.0 - smoothstep(1.0, 2.5, r));
		ALBEDO = vec3(0.0);
		EMISSION = (tint * (exp(-r * 1.4) * 4.0 + rings * 0.8) + vec3(1.0) * exp(-r * 4.0) * 2.0) * lit;
	} else {
		NORMAL = -NORMAL;
		// round the tube, and along it from the door
		float a = atan(v_p.z, v_p.x);
		float d = len * 0.5 - v_p.y;
		vec2 g = vec2(a * 14.0 / TAU, d / 0.9);
		vec2 id = floor(g);
		vec2 f = fract(g);
		float rib = smoothstep(0.42, 0.45, abs(f.y - 0.5));
		// the niches on the sides (not along the floor or the crown: the tube lies on its side,
		// so its local -z is up)
		float sidew = step(abs(sin(a)), 0.8);
		vec2 nq = abs(f - 0.5) * vec2(2.4, 0.9);
		float niche = (1.0 - smoothstep(0.3, 0.34, max(nq.x, nq.y))) * sidew;
		float hp = hash(id);
		vec3 pc = 0.5 + 0.5 * cos(6.2831 * (hp + vec3(0.0, 0.33, 0.67)));
		// a pod's silhouette in each niche: a lit capsule shape
		vec2 pq = (f - 0.5) * vec2(2.4 * 0.62, 0.9);
		float pod = 1.0 - smoothstep(0.13, 0.16, length(vec2(pq.x, max(abs(pq.y) - 0.12, 0.0))));
		ALBEDO = mix(vec3(0.12, 0.12, 0.14), vec3(0.7, 0.5, 0.22), rib);
		METALLIC = 1.0;
		ROUGHNESS = mix(0.35, 0.2, rib);
		ALBEDO = mix(ALBEDO, vec3(0.02), niche);
		vec3 em = (pc * pod * 2.5 + tint * niche * 0.25) * niche;
		// deeper in, brighter (the light at the far end)
		em += tint * smoothstep(1.0, len, d) * 0.35 * (1.0 - niche);
		EMISSION = em * lit;
	}
}
