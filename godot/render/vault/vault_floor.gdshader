// The Skin Vault's floor (vault_stage.gd): polished black stone in big tiles. The robot stands in
// the middle of a brass combination dial inlaid in it (`dial` turns it while the door's wheel
// spins), on a turntable ring glowing in the colour of what's being pulled. A lit lane of neon
// runs from the vault door to the dial, the open door spills its light across the stone, a pod
// gliding over it casts a pool of its own light, and the ten-pull's pads light up in an arc.
// The walls' neon and the door's ring glow faintly in the polish.
shader_type spatial;
render_mode cull_back;

// the turntable's middle (world xz), its radius and colour (linear); the dial's turn
uniform vec2 table = vec2(0.0);
uniform float table_r = 1.15;
uniform vec3 table_col = vec3(0.9, 0.3, 1.0);
uniform float dial = 0.0;
// a pulse rolling out over the floor from `pulse_at` (a burst, a skin painted on)
uniform float pulse = 0.0;
uniform vec3 pulse_col = vec3(1.0, 0.8, 0.3);
uniform vec2 pulse_at = vec2(0.0);
// the room's two neon colours (linear, HDR)
uniform vec3 mood_a = vec3(1.0, 0.12, 0.6);
uniform vec3 mood_b = vec3(0.1, 0.75, 1.0);
// the door: the middle of its opening (world), its radius, its ring's colour, how open it is and
// the light that comes out
uniform vec3 door = vec3(1.6, 2.95, -11.0);
uniform float door_r = 2.6;
uniform vec3 ring_col = vec3(1.0, 0.1, 0.1);
uniform float open = 0.0;
uniform vec3 spill_col = vec3(1.0, 0.8, 0.55);
// a pod over the floor: xz, its light's strength, and its colour
uniform vec3 pod = vec3(0.0);
uniform vec3 pod_col = vec3(1.0);
// the ten-pull's pads (world xz) and how lit they are
uniform vec2 slots[10];
uniform float pads = 0.0;
uniform float flash = 0.0;
uniform vec3 flash_col = vec3(1.0);
// half the room's width (the walls' glow in the polish)
uniform float half_w = 11.0;

varying vec3 v_world;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// distance from p to the segment a-b, and how far along it (0..1)
vec2 seg(vec2 p, vec2 a, vec2 b) {
	vec2 ab = b - a;
	float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
	return vec2(length(p - a - ab * h), h);
}

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = v_world.xz;
	float t = TIME;
	// the stone: big tiles, each a slightly different black, with faint grey veins
	vec2 tile = p / 1.6;
	vec2 tf = abs(fract(tile) - 0.5);
	float h = hash(floor(tile));
	float vein = noise(p * 1.3 + h * 17.0) * 0.6 + noise(p * 3.7) * 0.4;
	vein = 1.0 - smoothstep(0.0, 0.05, abs(vein - 0.5));
	vec3 alb = vec3(0.016, 0.015, 0.02) * (0.75 + 0.5 * h) + vec3(0.03, 0.028, 0.035) * vein * 0.5;
	float joint = smoothstep(0.488, 0.497, max(tf.x, tf.y));
	alb *= 1.0 - joint * 0.7;
	float rough = mix(0.07 + 0.06 * h, 0.5, joint);
	float metal = 0.0;
	vec3 em = vec3(0.0);
	// the dial round the robot: two brass rings with the ticks of a combination lock between
	vec2 q = p - table;
	float rt = length(q);
	float ang = atan(q.y, q.x) + dial;
	float aa = fwidth(rt) * 1.5;
	float brass_r = (1.0 - smoothstep(0.0, aa, abs(rt - 2.32) - 0.045)) + (1.0 - smoothstep(0.0, aa, abs(rt - 1.62) - 0.025));
	float tk = ang * 60.0 / TAU;
	float tick_d = abs(fract(tk + 0.5) - 0.5) * TAU / 60.0 * rt;
	float major = step(abs(fract(tk / 5.0 + 0.1) - 0.1) * 5.0, 0.5);
	float tick = (1.0 - smoothstep(0.012, 0.012 + aa, tick_d)) * step(1.7, rt) * step(rt, mix(1.9, 2.22, major));
	float brass = clamp(brass_r + tick, 0.0, 1.0);
	alb = mix(alb, vec3(0.75, 0.52, 0.22), brass);
	metal = mix(metal, 1.0, brass);
	rough = mix(rough, 0.22, brass);
	em += mood_b * tick * major * 0.25;
	// the turntable: a disc with a bright rim and segments chasing round
	float tr = rt - table_r;
	float rim = exp(-abs(tr) * 40.0) * 2.4 + exp(-abs(tr) * 8.0) * 0.4;
	float seg_l = smoothstep(0.3, 0.7, sin(ang * 12.0 - t * 3.0)) * step(abs(tr + 0.12), 0.05);
	em += table_col * (rim + seg_l * 1.6 + (1.0 - smoothstep(-0.02, 0.0, tr)) * 0.05);
	alb = mix(alb, vec3(0.05, 0.05, 0.06), 1.0 - smoothstep(-0.03, 0.0, tr));
	// the lane from the door to the dial: two rails of neon with light running down them
	vec2 d0 = vec2(door.x, door.z + 0.6);
	vec2 d1 = table + normalize(d0 - table) * 2.45;
	vec2 dir = normalize(d1 - d0);
	vec2 side = vec2(-dir.y, dir.x);
	float lane_len = length(d1 - d0);
	for (int k = -1; k <= 1; k += 2) {
		vec2 off = side * 0.78 * float(k);
		vec2 s = seg(p, d0 + off, d1 + off);
		float line = 1.0 - smoothstep(0.018, 0.018 + fwidth(s.x) * 1.5, s.x);
		float run = smoothstep(0.75, 1.0, fract(s.y * lane_len * 0.6 - t * (1.0 + open * 2.0)));
		em += mood_b * line * (0.5 + open * 1.2 + run * (0.6 + open * 2.0));
		alb = mix(alb, vec3(0.1), line);
	}
	// the light out of the open door, fanning across the floor
	vec2 dz = p - vec2(door.x, door.z);
	float w = door_r * 0.75 + dz.y * 0.3;
	float fan = (1.0 - smoothstep(w * 0.55, w, abs(dz.x))) * step(0.0, dz.y) * exp(-dz.y * 0.16);
	em += spill_col * open * fan * 0.45;
	// the door's ring and the walls' neon, faint in the polish
	em += ring_col * 0.35 * exp(-length(dz * vec2(0.45, 0.9))) * step(0.0, dz.y);
	float dw = half_w - max(abs(p.x), abs(p.y));
	em += mix(mood_a, mood_b, 0.5 + 0.5 * sin(p.x * 0.3 + p.y * 0.2)) * exp(-dw * 2.2) * 0.35;
	// a pod's own pool of light
	em += pod_col * pod.z * exp(-length(p - pod.xy) * 2.2);
	// the ten-pull's pads: a ring of light each, with a soft glow inside
	if (pads > 0.001) {
		for (int i = 0; i < 10; i++) {
			float d = length(p - slots[i]);
			em += mood_b * pads * (exp(-abs(d - 0.42) * 45.0) * 2.0 + exp(-d * 4.0) * 0.4);
		}
	}
	// a burst's pulse rolling out
	float pr = pulse * 14.0;
	float rp = length(p - pulse_at);
	em += pulse_col * exp(-abs(rp - pr) * 3.0) * (1.0 - pulse) * 2.2;
	em += flash_col * flash * 0.12;
	ALBEDO = alb;
	METALLIC = metal;
	ROUGHNESS = rough;
	SPECULAR = 0.6;
	EMISSION = em;
}

// The lights only graze the stone (a soft pool and a small sharp glint) so it reads polished and
// its inlays stay bright; the brass takes them as metal.
void light() {
	float nl = max(dot(NORMAL, LIGHT), 0.0);
	vec3 hv = normalize(LIGHT + VIEW);
	float m = METALLIC;
	float glint = pow(max(dot(NORMAL, hv), 0.0), mix(180.0, 30.0, m));
	DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * nl * mix(0.3, 0.6, m) / PI;
	SPECULAR_LIGHT += LIGHT_COLOR * ATTENUATION * nl * glint * mix(0.45, 0.6, m) * mix(vec3(1.0), ALBEDO * 3.0, m);
}
