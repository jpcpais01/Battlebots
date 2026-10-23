// The beach's ground (src/render/home/beachWorld.ts sandMaterial): white coral sand, soaked and
// darker where the swash reaches and glassy for a moment after each wave drains away, wind-rippled
// where it's dry, giving way to soil and leaf litter under the plants and to the jungle floor up
// the hills; dry grains glint in the sun. Contact shadows round the robot (ao.ts patch: spheres,
// strength 1.6, direct 0.6).
shader_type spatial;
render_mode diffuse_lambert, cull_back, fog_disabled;

#include "res://render/home/beach_world.gdshaderinc"
#include "res://render/ao/contact_ao.gdshaderinc"
#include "res://render/home/home_common.gdshaderinc"
#include "res://render/lit_safe.gdshaderinc"

uniform sampler2D map : repeat_enable, filter_linear_mipmap_anisotropic;
uniform sampler2D normal_map : repeat_enable, filter_linear_mipmap_anisotropic;
uniform vec4 normal_map_xf = vec4(1.1, 1.1, 0.0, 0.0);
uniform float normal_scale = 0.5;
uniform float roughness = 0.94;
// beachWorld.ts COL (linear)
uniform vec3 sand = vec3(0.8228, 0.6514, 0.3813);
uniform vec3 sand_pink = vec3(0.8388, 0.5647, 0.4125);
uniform vec3 soil = vec3(0.4564, 0.3515, 0.1746);
uniform vec3 litter = vec3(0.2623, 0.1746, 0.0648);
uniform vec3 jungle = vec3(0.0723, 0.1441, 0.0273);
uniform float ao_strength = 1.6;
uniform float ao_direct = 0.6;

varying vec3 v_bw;

void vertex() {
	v_bw = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 bp = v_bw.xz;
	float bl = bp.y - shoreZ(bp.x);
	float bh = bl < 2.2 ? groundNear(bp) : v_bw.y;
	float bn1 = texture(noise, bp * 0.023).r;
	float bn2 = texture(noise, bp * 0.11 + 0.37).g;
	float bn3 = texture(noise, bp * 0.6 + 0.71).b;
	// drifts of paler and pinker sand, so the grain never reads as a repeating tile
	vec3 bc = sand * (0.91 + 0.13 * bn1 + 0.08 * (bn2 - 0.5));
	bc = mix(bc, sand_pink, smoothstep(0.6, 0.82, bn2) * 0.35);
	float bWet, bFilm;
	sandWet(bp, bh, bWet, bFilm);
	bc *= mix(1.0, 0.6, bWet);
	bc *= mix(vec3(1.0), vec3(0.93, 0.96, 1.0), bWet);
	// the lines of fine grit each wave leaves at the top of its run-up, and the high-water mark
	float mark = bh - (SEA + 0.046 + 0.012 * sin(bp.x * 0.45) + 0.006 * sin(bp.x * 1.7));
	float brk = smoothstep(0.35, 0.65, texture(noise, bp * vec2(0.4, 1.3)).b);
	bc *= 1.0 - 0.16 * exp(-mark * mark * 9000.0) * brk;
	float wrack = bl - (1.75 + 0.25 * sin(bp.x * 0.21) + 0.12 * sin(bp.x * 0.83));
	bc *= 1.0 - 0.28 * exp(-wrack * wrack * 60.0) * smoothstep(0.55, 0.75, bn3) * brk;
	// under the plants: sandy soil and leaf litter, then the jungle floor up the hills
	float bVeg = max(smoothstep(9.0, 13.5, bl + (bn1 - 0.5) * 6.0 + (bn3 - 0.5) * 1.6), smoothstep(0.45, 0.9, v_bw.y + (bn1 - 0.5) * 0.3));
	bc = mix(bc, mix(soil, litter, smoothstep(0.3, 0.7, bn2)), bVeg);
	float bJ = max(smoothstep(16.0, 26.0, bl + (bn1 - 0.5) * 8.0), smoothstep(1.0, 2.5, v_bw.y));
	bc = mix(bc, jungle * (0.75 + 0.5 * bn2), bJ);
	ALBEDO = texture(map, UV).rgb * bc;
	float bRip = (1.0 - bVeg) * (1.0 - 0.8 * bWet);
	vec3 mapN = texture(normal_map, UV * normal_map_xf.xy + normal_map_xf.zw).xyz * 2.0 - 1.0;
	mapN.xy *= normal_scale * bRip;
	NORMAL = lit_safe(perturb_normal(VERTEX, NORMAL, UV * normal_map_xf.xy, mapN), VIEW);
	float r = mix(roughness, 0.5, bWet);
	ROUGHNESS = mix(r, 0.07, bFilm * 0.9);
	// dry sand scatters the sun rather than mirroring it
	SPECULAR = 0.5 * mix(0.3, 1.0, max(bWet, bFilm));
	// dry grains glinting in the sun as the eye moves
	vec2 grain = floor(v_bw.xz * 70.0);
	float gr = fract(sin(dot(grain, vec2(12.9898, 78.233))) * 43758.5453);
	float tw = fract(sin(dot(grain + floor(CAMERA_POSITION_WORLD.xz * 6.0), vec2(39.3468, 11.135))) * 24634.6345);
	EMISSION = vec3(1.0, 0.94, 0.8) * step(0.994, gr) * step(0.6, tw) * (1.0 - bWet) * (1.0 - bVeg) * smoothstep(9.0, 2.0, length(v_bw - CAMERA_POSITION_WORLD)) * 1.4;
	vec3 n_w = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	AO = ao_spheres(v_bw, n_w, ao_strength);
	AO_LIGHT_AFFECT = ao_direct;
	HOME_FOG_LIT
}
