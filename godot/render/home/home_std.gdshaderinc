// The home scenes' lit materials (three's MeshStandardMaterial and the web's hooks on it), built
// by HomeMaterials with #defines in front of this body:
//   VCOL   vertex colours (in CUSTOM1: Godot keeps COLOR in 8 bits, too coarse for dark paint)
//   MR     metalness and roughness per vertex (bake.ts vertexPBR's `mr`, in CUSTOM0)
//   MAP / NMAP   a colour map and a tangent-free normal map; ROUGH_MAP a roughness map (green)
//   WEAR   gym.ts wearPatch: grime and wear laid over the colour from a second texture, on UV2
//   ALPHA_TEST, INST_COL (an instance's colour, in INSTANCE_CUSTOM), INSTANCED (a MultiMesh)
//   BREEZE beachFlora.ts breeze (the `sway` weight in CUSTOM2), BACKLIT (leaves against the sun)
//   WOOD_X / WOOD_Z beach.ts woodGrain, TOWEL / THATCH their hanging hems stirring
//   AO_* contact occlusion round the robot (ao.ts patch options)
//   DETAIL lounge.ts detailed: a fine finish by the kind tagged on each vertex (`dkind`, in CUSTOM2)
//   WINLIGHT lounge.ts windowLit: the city's light through the rainy window, on the floor and rug
//   SHEEN  the velvet's sheen (three's MeshPhysicalMaterial sheen: Charlie sheen in a light() of its own)
//   CURTAIN lounge.ts curtains: the hems stirring in the draught off the glass
//   VOLUME_NORMALS the normals are the plant's shape, the same from either side (see fragment())
global uniform float bb_time;
// the home key light's position and its shadow camera's near plane (0: none), set by HomeStage
global uniform vec4 bb_home_key;
#include "res://render/home/home_common.gdshaderinc"
#include "res://render/lit_safe.gdshaderinc"
#ifdef AO_ON
#include "res://render/ao/contact_ao.gdshaderinc"
uniform float ao_strength = 1.0;
uniform float ao_direct = 0.35;
uniform vec3 ao_g = vec3(0.0, 0.5, 0.0);
#endif
uniform vec3 color = vec3(1.0);
uniform float opacity = 1.0;
uniform float metalness = 0.0;
uniform float roughness = 1.0;
uniform vec3 emissive = vec3(0.0);
uniform float alpha_test = 0.5;
#ifdef MAP
uniform sampler2D map : MAP_HINT filter_linear_mipmap_anisotropic, MAP_WRAP;
uniform vec4 map_xf = vec4(1.0, 1.0, 0.0, 0.0);
#endif
#ifdef NMAP
uniform sampler2D normal_map : filter_linear_mipmap_anisotropic, NMAP_WRAP;
uniform vec4 normal_map_xf = vec4(1.0, 1.0, 0.0, 0.0);
uniform vec2 normal_scale = vec2(1.0);
#endif
#ifdef ROUGH_MAP
uniform sampler2D roughness_map : filter_linear_mipmap_anisotropic, ROUGH_MAP_WRAP;
uniform vec4 roughness_map_xf = vec4(1.0, 1.0, 0.0, 0.0);
#endif
#ifdef WEAR
uniform sampler2D wear : WEAR_HINT filter_linear_mipmap_anisotropic, WEAR_WRAP;
#endif
#if defined(WOOD_X) || defined(WOOD_Z) || defined(DETAIL) || defined(WINLIGHT)
uniform sampler2D noise : repeat_enable, filter_linear_mipmap;
#endif
#ifdef WINLIGHT
// the window's light: how strong (the lightning lifts it), its colour
uniform float win_k = 0.3;
uniform vec3 win_col = vec3(0.32, 0.42, 0.72);
// lounge.ts WIN.z
const float WIN_Z = -2.38;
// lounge.ts WINLIGHT_GLSL: the city's cold light falling through the window, crossed by the
// frames' shadows and rippling with the rain running down the glass
vec3 win_light(vec3 p) {
	vec3 L = normalize(vec3(0.14, -0.55, 1.0));
	float t = (p.z - WIN_Z) / L.z;
	vec3 q = p - L * t;
	float in_x = smoothstep(-3.65, -3.4, q.x) * (1.0 - smoothstep(3.4, 3.65, q.x));
	float in_y = smoothstep(0.3, 0.5, q.y) * (1.0 - smoothstep(2.55, 2.8, q.y));
	float mx = abs(fract((q.x + 3.6) / 1.8 + 0.5) - 0.5) * 1.8;
	float bars = smoothstep(0.02, 0.09, mx) * smoothstep(0.02, 0.09, abs(q.y - 2.2));
	float r = texture(noise, vec2(q.x * 0.9, q.y * 0.35 + bb_time * 0.18)).g;
	float r2 = texture(noise, vec2(q.x * 2.1 + 0.3, q.y * 0.8 + bb_time * 0.31)).b;
	float rain = 0.5 + 0.9 * smoothstep(0.3, 0.8, r * 0.6 + r2 * 0.5);
	return win_col * (win_k * in_x * in_y * bars * rain * step(0.0, t) / (1.0 + t * 0.3));
}
#endif
#ifdef SHEEN
uniform vec3 sheen_color = vec3(0.212, 0.631, 0.578);
uniform float sheen_roughness = 0.35;
// the light from the room the sheen picks up all round (three: the hemisphere light's and the
// environment's irradiance), from above and from below
uniform vec3 sheen_sky = vec3(0.0);
uniform vec3 sheen_ground = vec3(0.0);

// three's IBLSheenBRDF (r186): how much the sheen reflects of light from all round, seen at n.v
float sheen_ibl(float n_v, float r) {
	float r2 = r * r;
	float ri = 1.0 / (r + 0.1);
	float a = -1.9362 + 1.0678 * r + 0.4573 * r2 - 0.8469 * ri;
	float b = -0.6014 + 0.5538 * r - 0.467 * r2 - 0.1255 * ri;
	return clamp(exp(a * n_v + b), 0.0, 1.0);
}

// three's RE_Direct_Physical with sheen (BRDF_Sheen, then BRDF_GGX and BRDF_Lambert on what the
// sheen leaves): what Godot would light, plus the velvet's soft glow at grazing angles.
// LIGHT_COLOR carries Godot's pi, so LIGHT_COLOR * ATTENUATION * n.l is three's irradiance; Godot
// multiplies the diffuse light by the albedo afterwards.
void light() {
	float n_l = clamp(dot(NORMAL, LIGHT), 0.0, 1.0);
	float n_v = clamp(dot(NORMAL, VIEW), 1e-4, 1.0);
	vec3 irr = LIGHT_COLOR * ATTENUATION * n_l;
	vec3 h = normalize(LIGHT + VIEW);
	float n_h = clamp(dot(NORMAL, h), 0.0, 1.0);
	// D_Charlie and V_Neubelt
	float sa = sheen_roughness * sheen_roughness;
	float inv = 1.0 / sa;
	float sin2h = max(1.0 - n_h * n_h, 0.0078125);
	float d_sh = (2.0 + inv) * pow(sin2h, inv * 0.5) / (2.0 * PI);
	float v_sh = clamp(1.0 / (4.0 * (n_l + n_v - n_l * n_v)), 0.0, 1.0);
	vec3 sheen_spec = irr * sheen_color * (d_sh * v_sh);
	// the light the sheen takes leaves the layers under it
	float sm = max(sheen_color.r, max(sheen_color.g, sheen_color.b));
	irr *= 1.0 - sm * max(sheen_ibl(n_v, sheen_roughness), sheen_ibl(n_l, sheen_roughness));
	float al = ROUGHNESS * ROUGHNESS;
	float a2 = al * al;
	float dd = n_h * n_h * (a2 - 1.0) + 1.0;
	float d_ggx = a2 / (PI * dd * dd);
	float gv = n_l * sqrt(n_v * n_v * (1.0 - a2) + a2);
	float gl = n_v * sqrt(n_l * n_l * (1.0 - a2) + a2);
	float vis = 0.5 / max(gv + gl, 1e-6);
	float f = 0.04 + 0.96 * pow(1.0 - clamp(dot(VIEW, h), 0.0, 1.0), 5.0);
	// (what the specular reflects is not there for the diffuse: three's fresnel mix)
	DIFFUSE_LIGHT += irr * ((1.0 - f) / PI);
	SPECULAR_LIGHT += irr * (f * d_ggx * vis * SPECULAR_AMOUNT) + sheen_spec;
}
#endif
#ifdef DETAIL
varying vec3 v_dp;
varying vec3 v_dn;
varying float v_dk;
// one leaning loop of a knitted V stitch
float stitch_lobe(vec2 f, float s) {
	vec2 a = f - vec2(0.24 * s, 0.0);
	a = vec2(a.x * 0.88 + a.y * 0.47 * s, a.y * 0.88 - a.x * 0.47 * s);
	a /= vec2(0.2, 0.46);
	return max(0.0, 1.0 - dot(a, a));
}
#endif
#ifdef BREEZE
uniform float breeze_amp = 0.1;
#endif
#ifdef BACKLIT
uniform float backlit_k = 1.0;
uniform vec3 sun = vec3(-0.399, 0.638, -0.658);
#endif

varying vec3 w_pos;
#if defined(VCOL) || defined(INST_COL)
varying vec3 v_col;
#endif
#ifdef MR
varying vec2 v_mr;
#endif
#if defined(WOOD_X) || defined(WOOD_Z)
varying vec3 v_wood;
#endif

void vertex() {
#ifdef VCOL
	v_col = CUSTOM1.rgb;
#elif defined(INST_COL)
	v_col = vec3(1.0);
#endif
#ifdef INST_COL
	v_col *= INSTANCE_CUSTOM.rgb;
#endif
#ifdef MR
	v_mr = CUSTOM0.xy;
#endif
#if defined(WOOD_X) || defined(WOOD_Z)
	v_wood = VERTEX;
#endif
#ifdef DETAIL
	v_dk = CUSTOM2.x;
	v_dp = VERTEX;
	v_dn = NORMAL;
#endif
#ifdef CURTAIN
	{
		// a cold draught off the glass stirs the hems
		float low = 1.0 - smoothstep(0.1, 2.6, VERTEX.y);
		VERTEX.z += low * (0.012 * sin(bb_time * 0.55 + VERTEX.x * 2.0) + 0.005 * sin(bb_time * 1.3 + VERTEX.y * 3.0 + VERTEX.x * 7.0));
		VERTEX.x += low * 0.006 * sin(bb_time * 0.4 + VERTEX.x * 5.0);
	}
#endif
#ifdef BREEZE
	// leaves stirring in the breeze: `sway` (0 at the stem, 1 at the tips) weights it; instances get their own phase
#ifdef INSTANCED
	vec2 sp = MODEL_MATRIX[3].xz;
#else
	vec2 sp = VERTEX.xz * 0.35;
#endif
	float sw = CUSTOM2.x * CUSTOM2.x;
	float gust = 0.6 + 0.4 * sin(bb_time * 0.23 + sp.x * 0.05);
	VERTEX += vec3(
		sin(bb_time * 1.05 + sp.x * 0.9 + sp.y * 0.6 + VERTEX.y * 0.3) * 0.7 + 0.5,
		0.45 * sin(bb_time * 1.7 + sp.y * 1.1 + VERTEX.x * 0.4),
		cos(bb_time * 0.85 + sp.x * 0.7 + VERTEX.z * 0.3) * 0.6) * breeze_amp * sw * gust;
#endif
#ifdef TOWEL
	// a towel over the backrest, hanging down behind it and stirring in the breeze
	float hang = CUSTOM2.x;
	vec3 p0 = VERTEX;
	VERTEX.z += hang * (0.03 + 0.02 * sin(bb_time * 1.9 + p0.x * 7.0));
	VERTEX.x += hang * 0.01 * sin(bb_time * 2.6 + p0.y * 9.0);
#endif
#ifdef THATCH
	// the thatch's ragged hem stirring
	float hem = 1.0 - UV.y;
	float ta = atan(VERTEX.z, VERTEX.x);
	float tk = 1.0 + hem * 0.012 * sin(bb_time * 2.2 + ta * 7.0);
	VERTEX.xz *= tk;
	VERTEX.y += hem * 0.01 * sin(bb_time * 2.9 + ta * 11.0);
#endif
	w_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	// three's spot leaves out of its shadows what is nearer than its shadow camera's near plane (the
	// gym's lamp shade, right under the light). Godot's has no near plane: in that light's own shadow
	// pass (the view sits at the light), fold such vertices onto the light, where they draw nothing.
	if (bb_home_key.w > 0.0 && distance(INV_VIEW_MATRIX[3].xyz, bb_home_key.xyz) < 0.01 && distance(w_pos, bb_home_key.xyz) < bb_home_key.w) {
		VERTEX = (inverse(MODEL_MATRIX) * vec4(bb_home_key.xyz, 1.0)).xyz;
	}
}

void fragment() {
#ifdef VOLUME_NORMALS
	// beachFlora.ts: the bush's leaves face outwards, like the dome they make, and the grass is
	// lit like the ground it grows from. Godot turns a two-sided card's normal round on the side
	// it calls the back, and these cards are wound inside out (the bush's fronts face into the
	// dome), so every leaf we saw was lit with its normal pointing away from us: lit as if from
	// behind, and on phones holed with the black lit_safe explains. Their own normals instead,
	// seen from either side:
	NORMAL = FRONT_FACING ? NORMAL : -NORMAL;
#endif
	vec3 c = color;
	float a = opacity;
#if defined(VCOL) || defined(INST_COL)
	c *= v_col;
#endif
#ifdef MAP
	vec4 t = texture(map, UV * map_xf.xy + map_xf.zw);
	c *= t.rgb;
	a *= t.a;
#endif
#ifdef WEAR
	{
		vec4 wr = texture(wear, UV2);
		c = mix(c, wr.rgb, wr.a);
	}
#endif
#ifdef ALPHA_TEST
	if (a < alpha_test) discard;
#endif
#if defined(WOOD_X) || defined(WOOD_Z)
	{
		// wood grain running along one axis of the mesh
#ifdef WOOD_X
		vec3 wq = v_wood.zyx;
#else
		vec3 wq = v_wood.xyz;
#endif
		float warp = texture(noise, vec2(wq.z * 0.4, (wq.x + wq.y) * 1.7)).r;
		float rings = 0.5 + 0.5 * sin((wq.x * 0.6 + wq.y) * 210.0 + warp * 14.0 + wq.z * 2.0);
		float streak = texture(noise, vec2(wq.z * 0.08, (wq.x * 0.6 + wq.y) * 6.0)).g;
		c *= (0.84 + 0.2 * rings * rings) * (0.88 + 0.24 * streak);
	}
#endif
	ALBEDO = c;
#ifdef MR
	METALLIC = v_mr.x;
	ROUGHNESS = v_mr.y;
#else
	METALLIC = metalness;
	ROUGHNESS = roughness;
#endif
#ifdef ROUGH_MAP
	ROUGHNESS *= texture(roughness_map, UV * roughness_map_xf.xy + roughness_map_xf.zw).g;
#endif
#ifdef NMAP
	vec2 nuv = UV * normal_map_xf.xy + normal_map_xf.zw;
	vec3 mapN = texture(normal_map, nuv).xyz * 2.0 - 1.0;
	mapN.xy *= normal_scale;
	NORMAL = perturb_normal(VERTEX, NORMAL, nuv, mapN);
#endif
#ifdef DETAIL
	if (v_dk > 0.5) {
		// lounge.ts DETAIL_APPLY, in each piece's own space: wood grain, crushed velvet, chunky
		// knit, wicker, marble veins, glazed ceramic and gritty clay
		vec3 P = v_dp;
		vec3 an = abs(v_dn);
		// two coordinates across the face it most nearly faces
		vec2 q = an.y > max(an.x, an.z) ? P.xz : (an.x > an.z ? P.zy : P.xy);
		float px = length(fwidth(P));
		float alb = 1.0, rgh = 1.0, h = 0.0, amp = 0.0, size = 0.01;
		if (v_dk < 3.5) {
			// wood: long grain lines over a slow figure, running along the board
			vec2 g;
			if (v_dk < 1.5) g = an.x > max(an.y, an.z) ? P.zy : vec2(P.x, an.y > an.z ? P.z : P.y);
			else if (v_dk < 2.5) g = an.z > max(an.x, an.y) ? P.xy : vec2(P.z, an.y > an.x ? P.x : P.y);
			else g = an.y > max(an.x, an.z) ? P.xz : vec2(P.y, an.x > an.z ? P.z : P.x);
			float fig = texture(noise, vec2(g.x * 0.12, g.y * 1.7)).g;
			float ln = texture(noise, vec2(g.x * 0.3 + fig * 0.4, g.y * 9.0 + fig * 1.5)).r;
			float lines = smoothstep(0.5, 0.78, ln);
			alb = 0.84 + 0.32 * fig - 0.26 * lines;
			rgh = 0.9 + 0.3 * lines;
			h = -lines;
			amp = 0.0003;
			size = 0.012;
		} else if (v_dk < 4.5) {
			// velvet and wool: the pile crushed one way and another
			float cr = texture(noise, q * 0.55 + texture(noise, q * 0.21).g * 0.35).b;
			alb = 0.8 + 0.4 * smoothstep(0.25, 0.8, cr);
			rgh = 1.08 - 0.2 * cr;
			h = texture(noise, q * 7.0).g;
			amp = 0.0003;
			size = 0.012;
		} else if (v_dk < 5.5) {
			// chunky knit: columns of V stitches
			vec2 f = fract(q * vec2(38.0, 28.0)) - 0.5;
			h = sqrt(max(stitch_lobe(f, -1.0), stitch_lobe(f, 1.0)));
			alb = 0.72 + 0.34 * h;
			amp = 0.0035;
			size = 0.026;
		} else if (v_dk < 6.5) {
			// wicker: strands woven over and under
			vec2 cw = q * vec2(32.0, 26.0);
			vec2 f = fract(cw);
			float over = mod(floor(cw.x) + floor(cw.y), 2.0);
			h = over > 0.5 ? sin(f.y * 3.14159) : sin(f.x * 3.14159);
			alb = 0.62 + 0.46 * h;
			amp = 0.003;
			size = 0.031;
		} else if (v_dk < 7.5) {
			// marble: soft grey veins
			float w = texture(noise, q * 0.35).r;
			float v = abs(sin((q.x * 0.8 + q.y * 1.3) * 9.0 + w * 9.0));
			alb = 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.12, v)) - 0.06 * w;
		} else if (v_dk < 8.5) {
			// glazed ceramic: speckled, a faint ripple in the glaze
			float sp = texture(noise, q * 6.0).b;
			alb = 1.0 - 0.2 * smoothstep(0.7, 0.8, sp);
			h = texture(noise, q * 1.6).g;
			amp = 0.0006;
		} else {
			// terracotta, cork, card: mottled and gritty
			float mo = texture(noise, q * 0.9).r;
			float gr = texture(noise, q * 9.0).g;
			alb = 0.82 + 0.3 * mo + 0.14 * (gr - 0.5);
			h = gr;
			amp = 0.0006;
		}
		// finer than a few pixels the pattern settles to its average
		float fade = 1.0 - smoothstep(size * 0.15, size * 0.4, px);
		alb = mix(v_dk > 4.5 && v_dk < 6.5 ? 0.86 : alb, alb, fade);
		ALBEDO *= alb;
		ROUGHNESS = clamp(ROUGHNESS * rgh, 0.04, 1.0);
		// the relief, as a bump from the screen-space slope of h (three's perturbNormalArb)
		vec3 sdx = dFdx(VERTEX);
		vec3 sdy = dFdy(VERTEX);
		vec3 nn = normalize(NORMAL);
		vec3 r1 = cross(sdy, nn);
		vec3 r2 = cross(nn, sdx);
		float det = dot(sdx, r1);
		vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2) * amp * fade;
		if (abs(det) > 0.0) NORMAL = normalize(abs(det) * nn - grad);
	}
#endif
	// (whatever bent it, the normal leaves here facing the eye: no NaN out of the phones' lighting)
	NORMAL = lit_safe(NORMAL, VIEW);
	vec3 e = emissive;
#ifdef WINLIGHT
	e += win_light(w_pos) * ALBEDO;
#endif
#ifdef SHEEN
	{
		vec3 sn = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
		e += sheen_color * (sheen_ibl(clamp(dot(NORMAL, VIEW), 0.0, 1.0), sheen_roughness) / PI) * mix(sheen_ground, sheen_sky, 0.5 + 0.5 * sn.y);
	}
#endif
#ifdef BACKLIT
	// sunlight glowing through leaves seen against the sun
	vec3 sun_view = normalize((VIEW_MATRIX * vec4(sun, 0.0)).xyz);
	e += c * vec3(1.0, 0.96, 0.7) * backlit_k * pow(max(dot(normalize(VERTEX), sun_view), 0.0), 3.0);
#endif
	EMISSION = e;
#ifdef BLEND
	ALPHA = a;
#endif
#ifdef AO_ON
	vec3 n_w = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float ao = 1.0;
#ifdef AO_SPHERES
	ao *= ao_spheres(w_pos, n_w, ao_strength);
#endif
#ifdef AO_GROUND
	ao *= ao_ground(w_pos, n_w, ao_g.x, ao_g.y, ao_g.z);
#endif
	AO = ao;
	AO_LIGHT_AFFECT = ao_direct;
#endif
	HOME_FOG_LIT
}
