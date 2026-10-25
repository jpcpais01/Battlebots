// The people of the titan city one by one (titan_props.gd: a MultiMesh of upright cards), where
// the packed crowd's ray march doesn't reach: the crews round the stage and on its apron, the
// police and the stewards at the barriers, the camera operators up the towers, the people
// watching from the pavements, the roofs and the quay. Each is a figure from the indoor crowd's
// painted atlas, turned to the lens, in its own clothes: a hi-vis vest for the crews. They are
// life-sized (1.75 m: 0.117 units), the yardstick everything else is judged by.
//
// INSTANCE_CUSTOM = (figure, pose, seed, role); the instance's scale is the person's height.
// Roles: 0 onlooker, 1 crew (hi-vis), 2 steward or police, 3 camera operator, 4 firefighter.
shader_type spatial;
render_mode cull_disabled, world_vertex_coords;
#include "res://render/titan/titan_common.gdshaderinc"

uniform sampler2D atlas : filter_linear_mipmap, repeat_disable;
uniform sampler2D bounds : filter_nearest;
uniform vec3 skin[7];
uniform vec3 pants[8];
uniform vec3 team0 = vec3(0.0232, 0.6867, 1.0);
uniform vec3 team1 = vec3(1.0, 0.1946, 0.0232);
// How worked up the city is (the crowd's excitement), and a titan crashing down near them:
// (x, z, radius, how fresh).
uniform float excite = 0.2;
uniform vec4 panic = vec4(0.0);

const float COLS = 34.0;
const float POSES = 7.0;
const float ASPECT = 0.9 / 2.1;

varying flat vec4 v_info;
varying vec3 v_world;
varying flat float v_flip;
varying flat float v_pose;

void vertex() {
	vec3 origin = MODEL_MATRIX[3].xyz;
	float h = length(MODEL_MATRIX[1].xyz);
	vec3 to_cam = CAMERA_POSITION_WORLD - origin;
	to_cam.y = 0.0;
	to_cam = length(to_cam) > 1e-4 ? normalize(to_cam) : vec3(0.0, 0.0, 1.0);
	vec3 right = vec3(to_cam.z, 0.0, -to_cam.x);
	vec4 c = INSTANCE_CUSTOM;
	float seed = c.z;
	// what they're doing: mostly standing, cheering more as the fight heats up, ducking from a
	// titan crashing down close by
	float t = TIME;
	float r = t_hash(floor(t * (0.4 + fract(seed * 7.1) * 0.6) + seed * 13.0) * 1.37 + seed * 91.7);
	float pose = c.y;
	float e = excite * (0.5 + fract(seed * 3.3));
	if (c.w < 0.5) {
		pose = r < 0.7 - e * 0.5 ? 0.0 : r < 0.85 - e * 0.3 ? 1.0 + step(0.5, fract(t * 3.0 + seed * 5.0)) : 3.0 + step(0.6, r);
	}
	float fear = panic.w * (1.0 - smoothstep(panic.z * 0.5, panic.z, distance(origin.xz, panic.xy)));
	if (fear > 0.3 + fract(seed * 4.7) * 0.4) pose = 5.0;
	v_pose = pose;
	float hop = c.w < 0.5 && pose >= 3.0 ? max(0.0, sin(t * 6.0 + seed * 20.0)) * 0.06 * h : 0.0;
	VERTEX = origin + right * (UV.x - 0.5) * h * ASPECT + vec3(0.0, (1.0 - UV.y) * h + hop, 0.0);
	// (tilted up: the sky lights the figures as it would a body, not a card on edge)
	NORMAL = normalize(to_cam + vec3(0.0, 0.8, 0.0));
	v_info = c;
	v_world = VERTEX;
	v_flip = t_hash(seed * 8.1) < 0.5 ? -1.0 : 1.0;
}

void fragment() {
	vec4 c = v_info;
	float seed = c.z;
	float col = c.x;
	float pose = v_pose;
	float lx = (UV.x - 0.5) * v_flip + 0.5;
	float gy = 1.0 - UV.y;
	vec4 bb = texelFetch(bounds, ivec2(int(col + 0.5), int(pose + 0.5)), 0);
	if (lx < bb.x || lx > bb.y || gy < bb.z || gy > bb.w) discard;
	vec4 tex = texture(atlas, vec2((col + lx) / COLS, (pose + 1.0 - gy) / POSES));
	if (tex.a < 0.5) discard;
	float role = c.w;
	vec3 shirt;
	float pick = t_hash(seed * 23.9);
	if (role > 0.5 && role < 1.5) shirt = vec3(0.9, 0.7, 0.02);
	else if (role > 1.5 && role < 2.5) shirt = pick < 0.5 ? vec3(0.9, 0.75, 0.02) : vec3(0.02, 0.025, 0.04);
	else if (role > 2.5 && role < 3.5) shirt = vec3(0.03);
	else if (role > 3.5) shirt = vec3(0.12, 0.1, 0.06);
	else if (pick < 0.4) shirt = mix(team0, team1, step(0.5, t_hash(seed * 5.3))) * (0.4 + 0.4 * t_hash(seed * 4.4));
	else {
		float p2 = t_hash(seed * 31.3);
		shirt = p2 < 0.22 ? vec3(0.62) : p2 < 0.5 ? vec3(0.03) : p2 < 0.6 ? vec3(0.42, 0.05, 0.04)
			: p2 < 0.7 ? vec3(0.6, 0.42, 0.06) : p2 < 0.8 ? vec3(0.05, 0.18, 0.07) : vec3(0.12, 0.14, 0.2);
	}
	vec3 hair = vec3(0.04, 0.025, 0.015) * (0.6 + 1.4 * t_hash(seed * 9.7));
	if (role > 3.5) hair = vec3(0.6, 0.5, 0.05);
	vec3 sk = skin[int(t_hash(seed * 2.9) * 6.99)];
	vec3 pa = role > 0.5 ? vec3(0.04, 0.05, 0.07) : pants[int(t_hash(seed * 6.1) * 7.99)];
	vec3 cc = mix(gy > 0.6 ? hair : pa, shirt, tex.g);
	cc = mix(cc, sk, tex.b * (1.0 - smoothstep(0.5, 0.95, tex.g)));
	// the vests' reflective bands
	if (role > 0.5 && role < 2.5 && tex.g > 0.5 && abs(gy - 0.52) < 0.025) cc = vec3(0.95);
	cc *= tex.r * mix(0.55, 1.0, smoothstep(0.25, 0.62, gy));
	ALBEDO = cc;
	ROUGHNESS = 0.85;
	SPECULAR = 0.25;
	// the reflective bands catch the low sun
	if (role > 0.5 && role < 2.5 && tex.g > 0.5 && abs(gy - 0.52) < 0.025) EMISSION = vec3(0.3);
	FOG = t_haze(v_world, CAMERA_POSITION_WORLD);
}
