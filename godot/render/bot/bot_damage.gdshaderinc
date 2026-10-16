// Battle damage on the robots' own surfaces: a port of src/render/damageLook.ts.
//
// The metal really bends. Every blow punches a dent where it struck (a rounded bowl pushed in
// along the blow, a lip of displaced metal round it, a creased floor); blows landing close
// together deepen and widen the same dent; a worn part's plates buckle all over. The armour is
// tessellated finely enough (bake_parts.ts keeps skin.ts SkinBuilder's splitting) for this to
// change the silhouette; normals are the true normals of the bent surface; and since Godot draws
// the shadow pass with this same vertex(), the shadows bend the same way.
//
// Everything is read from the part's own rest-space coordinates (the bone's frame, the core's
// halves carried on to the torso's), so the damage stays stuck to the metal as it moves, and on a
// torn-off piece flying away.

// per body part (sim/damage.ts P): 1 - condition
uniform float wear[15];
// dents in a bone's own frame: xyz centre (on the plating), w radius
uniform vec4 dent_p[32];
// per dent: xyz the push direction scaled by its depth, w the bone it is on (-1: none)
uniform vec4 dent_n[32];
// the dents on each bone (bot_model.gd _push_damage), so a corner only visits its own bone's:
// dent_list from (dent_at[bone] & 63), (dent_at[bone] >> 6) of them, as dent slots
uniform int dent_list[32];
uniform int dent_at[31];
// the core's two halves, baked on chest 0: where this chest moves them in the torso's frame
uniform vec3 core_shift[2];

float dmg_hash(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float dmg_noise(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(dmg_hash(i), dmg_hash(i + vec3(1, 0, 0)), f.x), mix(dmg_hash(i + vec3(0, 1, 0)), dmg_hash(i + vec3(1, 1, 0)), f.x), f.y),
			mix(mix(dmg_hash(i + vec3(0, 0, 1)), dmg_hash(i + vec3(1, 0, 1)), f.x), mix(dmg_hash(i + vec3(0, 1, 1)), dmg_hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

// dmg_noise (the same value) and its gradient in .yzw, worked out with it: the trilinear blend
// written as a polynomial in the eased fractions, differentiated term by term
vec4 dmg_noise_d(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	vec3 u = f * f * (3.0 - 2.0 * f);
	vec3 du = 6.0 * f * (1.0 - f);
	float a = dmg_hash(i);
	float b = dmg_hash(i + vec3(1, 0, 0));
	float c = dmg_hash(i + vec3(0, 1, 0));
	float d = dmg_hash(i + vec3(1, 1, 0));
	float e = dmg_hash(i + vec3(0, 0, 1));
	float g = dmg_hash(i + vec3(1, 0, 1));
	float h = dmg_hash(i + vec3(0, 1, 1));
	float k = dmg_hash(i + vec3(1, 1, 1));
	float k1 = b - a;
	float k2 = c - a;
	float k3 = e - a;
	float k4 = a - b - c + d;
	float k5 = a - c - e + h;
	float k6 = a - b - e + g;
	float k7 = -a + b + c - d + e - g - h + k;
	float v = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
	vec3 grad = du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k4 * u.x + k5 * u.z + k7 * u.x * u.z, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
	return vec4(v, grad);
}

// a worn part's plates buckle in big, smooth folds, deepest around a few spots
vec3 dmg_crumple(vec3 p, float w) {
	if (w < 0.01) return vec3(0.0);
	float vis = 1.0 - (1.0 - w) * (1.0 - w);
	float heavy = smoothstep(0.45, 1.0, w);
	heavy *= heavy;
	vec3 q = p * 11.0;
	vec3 big = vec3(dmg_noise(q), dmg_noise(q + 17.3), dmg_noise(q + 41.7)) - 0.5;
	float crater = smoothstep(0.3, 0.62, dmg_noise(p * 6.0 + 3.7));
	return big * (vis * 0.024 + heavy * 0.065) * (0.45 + crater * 1.1);
}

// dents punched in by blows: a rounded bowl pushed in along the blow, a lip of displaced metal
// round it, and a creased floor. `cav`: how deep in a bowl p sits, 0..1 (kept at its max)
vec3 dmg_dents(vec3 p, float bone, inout float cav) {
	vec3 d = vec3(0.0);
	int at = dent_at[int(bone + 0.5)];
	int end = (at & 63) + (at >> 6);
	for (int j = at & 63; j < end; j++) {
		int k = dent_list[j];
		vec4 N = dent_n[k];
		float depth = length(N.xyz);
		if (depth < 1e-5) continue;
		vec4 C = dent_p[k];
		vec3 n = N.xyz / depth;
		vec3 v = p - C.xyz;
		float along = dot(v, n);
		vec3 lat = v - along * n;
		// the plate the blow lands on gives way; metal deeper inside the part barely follows
		float s2 = (dot(lat, lat) + along * along * 3.2) / (C.w * C.w);
		if (s2 > 2.25) continue;
		float s = sqrt(s2);
		float bowl = s2 < 1.0 ? (1.0 - s2) * (1.0 - s2) : 0.0;
		float t = clamp((s - 0.75) * 1.3333, 0.0, 1.0);
		float lip = 16.0 * t * t * (1.0 - t) * (1.0 - t);
		// not a perfect spoon: the floor folds unevenly
		float fold = 0.7 + 0.6 * dmg_noise(lat * (2.2 / C.w) + float(k) * 7.31);
		d += n * (depth * (bowl * fold - lip * 0.14));
		cav = max(cav, bowl * min(1.0, depth / (C.w * 0.25)));
	}
	return d;
}

// how the plating is bent at rest point p: a function of the rest position alone, so corners
// shared by two faces (and pieces lying on each other) move together and nothing cracks open
vec3 dmg_deform(vec3 p, float bone, float w, inout float cav) {
	return dmg_crumple(p, w) + dmg_dents(p, bone, cav);
}

// dmg_deform, adding its Jacobian (column j: how the bend moves as p moves along axis j) into J,
// worked out exactly alongside it rather than by bending three nearby points as well
vec3 dmg_deform_j(vec3 p, float bone, float w, inout float cav, inout mat3 J) {
	vec3 d = vec3(0.0);
	if (w >= 0.01) {
		// dmg_crumple: big * amp * (0.45 + crater * 1.1)
		float vis = 1.0 - (1.0 - w) * (1.0 - w);
		float heavy = smoothstep(0.45, 1.0, w);
		heavy *= heavy;
		vec3 q = p * 11.0;
		vec4 nx = dmg_noise_d(q);
		vec4 ny = dmg_noise_d(q + 17.3);
		vec4 nz = dmg_noise_d(q + 41.7);
		vec3 big = vec3(nx.x, ny.x, nz.x) - 0.5;
		vec4 nc = dmg_noise_d(p * 6.0 + 3.7);
		float s = clamp((nc.x - 0.3) / 0.32, 0.0, 1.0);
		float crater = s * s * (3.0 - 2.0 * s);
		vec3 g_crater = nc.yzw * (6.0 * 6.0 * s * (1.0 - s) / 0.32);
		float amp = vis * 0.024 + heavy * 0.065;
		float f = 0.45 + crater * 1.1;
		d = big * (amp * f);
		J += transpose(mat3(nx.yzw, ny.yzw, nz.yzw)) * (11.0 * amp * f) + outerProduct(big, g_crater * (1.1 * amp));
	}
	// dmg_dents: n * depth * (bowl * fold - lip * 0.14) per dent
	int at = dent_at[int(bone + 0.5)];
	int end = (at & 63) + (at >> 6);
	for (int j = at & 63; j < end; j++) {
		int k = dent_list[j];
		vec4 N = dent_n[k];
		float depth = length(N.xyz);
		if (depth < 1e-5) continue;
		vec4 C = dent_p[k];
		vec3 n = N.xyz / depth;
		vec3 v = p - C.xyz;
		float along = dot(v, n);
		vec3 lat = v - along * n;
		float ir2 = 1.0 / (C.w * C.w);
		float s2 = (dot(lat, lat) + along * along * 3.2) * ir2;
		if (s2 > 2.25) continue;
		float s = sqrt(s2);
		float bowl = s2 < 1.0 ? (1.0 - s2) * (1.0 - s2) : 0.0;
		float t = clamp((s - 0.75) * 1.3333, 0.0, 1.0);
		float lip = 16.0 * t * t * (1.0 - t) * (1.0 - t);
		vec4 fn = dmg_noise_d(lat * (2.2 / C.w) + float(k) * 7.31);
		float fold = 0.7 + 0.6 * fn.x;
		d += n * (depth * (bowl * fold - lip * 0.14));
		cav = max(cav, bowl * min(1.0, depth / (C.w * 0.25)));
		// d/dp of s2, bowl and lip (through s2), and of fold (through lat = (I - n n^T) v)
		vec3 g_s2 = (2.0 * lat + 6.4 * along * n) * ir2;
		float bowl_s2 = s2 < 1.0 ? -2.0 * (1.0 - s2) : 0.0;
		float t_s2 = t > 0.0 && t < 1.0 ? 0.66665 / s : 0.0;
		float lip_s2 = 32.0 * t * (1.0 - t) * (1.0 - 2.0 * t) * t_s2;
		vec3 g_fold = (fn.yzw - n * dot(n, fn.yzw)) * (0.6 * 2.2 / C.w);
		J += outerProduct(n, ((fold * bowl_s2 - 0.14 * lip_s2) * g_s2 + bowl * g_fold) * depth);
	}
	return d;
}

// The rest-space point and bone the damage is read from (the core's halves ride the torso).
void dmg_rest(vec3 vertex, int bone, out vec3 p, out float b) {
	p = vertex;
	b = float(bone);
	if (bone >= 29) {
		p += core_shift[bone - 29];
		b = 0.0;
	}
}
