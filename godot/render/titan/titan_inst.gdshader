// The titan city's many small things, drawn in their hundreds (titan_props.gd's MultiMeshes):
// the cars, vans, buses and trucks in its streets and round the stage, the street lamps, the
// trees, the shipping containers. Each is one of a few plain meshes, painted here by its kind;
// they are real-sized (a car is 4.5 m: 0.3 units), which is the whole point of them: next to a
// titan's foot a fire engine is a toy.
//
// INSTANCE_CUSTOM = (kind, seed, speed, lane): a vehicle with a speed drives on along its lane
// (its own +x) at that many units a second, round and round the lane's length, at real speed.
// COLOR: the paint. Vehicles' meshes are unit boxes (x along, y up, z across) scaled by their
// instance; lamps and trees are built at size.
shader_type spatial;
render_mode cull_back;
#include "res://render/titan/titan_common.gdshaderinc"

// The kinds.
const float K_SEDAN = 0.0;
const float K_HATCH = 1.0;
const float K_TAXI = 2.0;
const float K_POLICE = 3.0;
const float K_VAN = 4.0;
const float K_TRUCK = 5.0;
const float K_AMBULANCE = 6.0;
const float K_FIRE = 7.0;
const float K_BUS = 8.0;
const float K_OB = 9.0;
const float K_CONTAINER = 10.0;
const float K_LAMP = 20.0;
const float K_TREE = 30.0;

// A titan crashing down near the stage sets the cars' alarms off: (x, z, radius, how fresh).
uniform vec4 alarm = vec4(0.0);

varying vec3 v_local;
varying vec3 v_nl;
varying vec3 v_size;
varying flat vec4 v_info;
varying vec3 v_world;

void vertex() {
	v_info = INSTANCE_CUSTOM;
	v_local = VERTEX;
	v_nl = NORMAL;
	v_size = vec3(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz), length(MODEL_MATRIX[2].xyz));
	if (INSTANCE_CUSTOM.z != 0.0 && INSTANCE_CUSTOM.w > 0.0) {
		// driving on round its lane
		float lane = INSTANCE_CUSTOM.w;
		float at = mod(TIME * INSTANCE_CUSTOM.z + INSTANCE_CUSTOM.y * lane, lane);
		VERTEX.x += at / max(v_size.x, 1e-4);
	}
	if (INSTANCE_CUSTOM.x > 29.5 && INSTANCE_CUSTOM.x < 30.5) {
		// the trees' crowns sway in the evening breeze
		float h = max(VERTEX.y - 0.35, 0.0);
		float ph = INSTANCE_CUSTOM.y * 40.0;
		VERTEX.x += sin(TIME * 1.3 + ph) * 0.02 * h;
		VERTEX.z += sin(TIME * 1.7 + ph * 1.3) * 0.015 * h;
	}
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

vec3 glass_col(vec3 nw, vec3 d) {
	vec3 r = reflect(d, nw);
	r.y = abs(r.y);
	return mix(vec3(0.03, 0.04, 0.05), t_sky(r) * 0.75, 0.3 + 0.55 * pow(1.0 - max(dot(-d, nw), 0.0), 3.0));
}

void fragment() {
	vec3 cam = CAMERA_POSITION_WORLD;
	vec3 d = normalize(v_world - cam);
	vec3 nw = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	vec3 nl = normalize(v_nl);
	float kind = v_info.x;
	float seed = v_info.y;
	vec3 paint = COLOR.rgb;
	vec3 albedo = paint;
	float rough = 0.4;
	float metal = 0.3;
	float spec = 0.5;
	vec3 emit = vec3(0.0);
	vec3 q = v_local;
	// metres on this face (for wheels, stripes)
	vec3 m = q * v_size * 15.0;
	float blink = step(0.5, fract(TIME * 2.2 + seed * 7.0));
	float fresh_alarm = alarm.w * (1.0 - smoothstep(alarm.z * 0.6, alarm.z, distance(v_world.xz, alarm.xy)));

	if (kind < 19.5) {
		bool side = abs(nl.z) > 0.7;
		bool front = nl.x > 0.7;
		bool back = nl.x < -0.7;
		bool top = nl.y > 0.7;
		rough = 0.35;
		metal = 0.4;
		if (kind < 3.5) {
			// cars: the body to the waist, glass above it, a roof
			float waist = 0.55;
			if (q.y > waist && !top) {
				albedo = glass_col(nw, d);
				rough = 0.08;
				metal = 0.0;
				spec = 0.8;
				// the pillars between the windows
				if (side && (abs(q.x + 0.04) < 0.03 || q.y > 0.95)) {
					albedo = paint * 0.6;
				}
			}
			if (abs(kind - K_TAXI) < 0.5 && top && q.y > 0.99 && abs(q.x + 0.05) < 0.08) {
				emit += vec3(1.0, 0.85, 0.4) * 0.8;
			}
			if (abs(kind - K_POLICE) < 0.5) {
				// white doors on the black and white car, the bar of lights on its roof
				if (side && q.y < waist && abs(q.x) < 0.22) albedo = vec3(0.85);
				if (top && q.y > 0.99 && abs(q.x + 0.04) < 0.05) {
					float lr = step(0.0, q.z);
					vec3 lc = mix(vec3(1.0, 0.05, 0.03), vec3(0.05, 0.2, 1.0), lr);
					emit += lc * 6.0 * (lr > 0.5 ? blink : 1.0 - blink);
					albedo = vec3(0.1);
				}
			}
		} else if (abs(kind - K_CONTAINER) < 0.5) {
			// a container: corrugated steel, its doors at one end
			if (side) albedo *= 0.82 + 0.18 * step(0.5, fract(m.x / 0.3));
			if (back) albedo *= 0.8 + 0.2 * step(0.5, fract(m.z / 1.2));
			rough = 0.7;
			metal = 0.5;
		} else if (abs(kind - K_BUS) > 0.5) {
			// vans, trucks, the emergency services, the TV trucks: a cab and a body
			bool cab = q.x > 0.27;
			bool screen = cab && q.y > 0.45 && (front || side) && !top;
			if (screen) {
				albedo = glass_col(nw, d);
				rough = 0.08;
				metal = 0.0;
				spec = 0.8;
			}
			if (abs(kind - K_AMBULANCE) < 0.5 && !screen) {
				albedo = vec3(0.9, 0.9, 0.86);
				if (side && abs(m.y - 1.1) < 0.18) albedo = vec3(0.8, 0.08, 0.06);
			}
			if (abs(kind - K_FIRE) < 0.5 && !screen) {
				albedo = vec3(0.62, 0.04, 0.03);
				if (side && abs(m.y - 0.9) < 0.1) albedo = vec3(0.9, 0.85, 0.7);
				// the lockers: shutters down the sides
				if (side && !cab && q.y < 0.7) albedo *= 0.85 + 0.15 * step(0.5, fract(m.x / 1.2));
			}
			if (abs(kind - K_OB) < 0.5 && !screen) {
				albedo = vec3(0.88, 0.88, 0.86);
				if (side && !cab && abs(m.y - 2.3) < 0.35) albedo = paint;
			}
			if ((abs(kind - K_AMBULANCE) < 0.5 || abs(kind - K_FIRE) < 0.5) && top && q.y > 0.99 && cab) {
				float lr = step(0.0, q.z);
				vec3 lc = abs(kind - K_FIRE) < 0.5 ? vec3(1.0, 0.1, 0.03) : mix(vec3(1.0, 0.05, 0.03), vec3(0.05, 0.25, 1.0), lr);
				emit += lc * 6.0 * (lr > 0.5 ? blink : 1.0 - blink);
			}
		}
		if (abs(kind - K_BUS) < 0.5) {
			// a long band of windows
			if (side && q.y > 0.42 && q.y < 0.86) {
				albedo = glass_col(nw, d);
				rough = 0.1;
				metal = 0.0;
			}
			if (front && q.y > 0.4) albedo = glass_col(nw, d);
		}
		if (kind < 9.5) {
			// the sills and bumpers darker, the gap under the body
			if ((side || front || back) && m.y < 0.5) albedo *= 0.55;
			if ((side || front || back) && m.y < 0.18) albedo = vec3(0.02);
			// a crease along the flanks, the doors' shut lines
			if (side && abs(m.y - 0.85) < 0.03) albedo *= 0.7;
			if (side && kind < 3.5 && q.y < 0.55 && abs(abs(q.x + 0.04) - 0.0) < 0.004) albedo *= 0.5;
			// wheels: tyres and grey hubs in their arches
			if (side) {
				float ax = abs(abs(m.x) - (v_size.x * 15.0 * 0.5 - 1.2));
				float wr = length(vec2(ax, m.y - 0.36));
				if (wr < 0.46) albedo = vec3(0.02);
				if (wr < 0.36) albedo = vec3(0.025);
				if (wr < 0.2) albedo = vec3(0.35);
				if (wr < 0.46) { rough = 0.8; metal = 0.0; }
			}
			// headlights and tail lights (lit for the evening, more when a titan sets the alarms off)
			if (front && q.y < 0.5 && q.y > 0.2 && abs(q.z) > 0.28) emit += vec3(1.0, 0.92, 0.75) * 1.6;
			if (back && q.y < 0.55 && q.y > 0.3 && abs(q.z) > 0.3) emit += vec3(1.0, 0.04, 0.02) * (0.8 + 2.0 * fresh_alarm * blink);
			if (fresh_alarm > 0.01 && (front || back) && q.y > 0.2 && q.y < 0.55 && abs(q.z) > 0.28) emit += vec3(1.0, 0.6, 0.1) * 3.0 * fresh_alarm * blink;
			if (top && kind < 3.5) rough = 0.25;
		}
	} else if (kind < 25.0) {
		// a street lamp: dark green-grey iron, its lamp warm underneath
		albedo = vec3(0.07, 0.09, 0.08);
		metal = 0.6;
		rough = 0.5;
		if (nl.y < -0.6 && q.y > 0.45) emit = vec3(1.0, 0.7, 0.38) * 4.0;
	} else if (kind < 35.0) {
		// a tree: the trunk, and the crown's leaves catching the low sun
		if (q.y < 0.32 && length(q.xz) < 0.06) {
			albedo = vec3(0.12, 0.09, 0.07);
			rough = 0.9;
			metal = 0.0;
		} else {
			float n = t_fbm(v_world.xz * 30.0 + v_world.y * 20.0 + seed * 9.0);
			vec3 leaf = mix(vec3(0.07, 0.13, 0.03), vec3(0.2, 0.28, 0.06), n);
			leaf = mix(leaf, vec3(0.32, 0.24, 0.05), smoothstep(0.65, 0.85, fract(seed * 13.7)) * 0.5);
			albedo = leaf * (0.7 + 0.5 * smoothstep(0.3, 0.9, q.y));
			rough = 0.85;
			metal = 0.0;
			spec = 0.2;
			// light through the leaves on the side away from the sun
			float through = pow(max(dot(d, T_SUN_DIR), 0.0), 4.0);
			emit = vec3(0.25, 0.3, 0.05) * through * 0.6 * n;
		}
	}
	ALBEDO = albedo;
	ROUGHNESS = rough;
	METALLIC = metal;
	SPECULAR = spec;
	EMISSION = emit;
	FOG = t_haze(v_world, cam);
}
