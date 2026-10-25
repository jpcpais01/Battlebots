// The titan city's built things that aren't buildings (titan_props.gd): the steel barriers that
// hold the crowd back, the scaffold camera towers in the press pen, the big screens' frames, and
// far off the harbour's landmarks: the suspension bridge across its mouth, the container
// cranes on the far shore, the ship at the terminal, the tower cranes over downtown, the
// lighthouse, the hills round the bay and the rest of the city running away into the haze.
// Lit by the venue's sun. UV2: (kind, detail); UV: metres-ish along the piece (kind's own).
shader_type spatial;
render_mode cull_disabled;
#include "res://render/titan/titan_common.gdshaderinc"

const float K_BARRIER = 0.0;
const float K_SCAFFOLD = 1.0;
const float K_PLATE = 2.0;
const float K_DARK = 3.0;
const float K_CONCRETE = 4.0;
const float K_PAINT = 5.0;
const float K_LATTICE = 6.0;
const float K_HULL = 7.0;
const float K_HILL = 8.0;
const float K_FARCITY = 9.0;
const float K_CABLE = 10.0;
const float K_BEACON = 11.0;
const float K_SCREEN = 12.0;
const float K_DISH = 13.0;
const float K_LAMP = 14.0;
const float K_CANVAS = 15.0;
const float K_STACK = 16.0;

// The big screens' picture (the arena's scoreboard).
uniform sampler2D screen_tex : source_color, filter_linear;
uniform float screen_on = 1.0;

varying vec3 v_world;
varying flat vec2 v_kind;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_kind = UV2;
}

void fragment() {
	vec3 cam = CAMERA_POSITION_WORLD;
	float kind = v_kind.x;
	float det = v_kind.y;
	vec3 albedo = vec3(0.4);
	float rough = 0.6;
	float metal = 0.0;
	vec3 emit = vec3(0.0);
	vec2 uv = UV;
	float fw = max(fwidth(uv.x), fwidth(uv.y));
	float dist = length(v_world - cam);

	if (kind < 0.5) {
		// crowd barriers: a galvanised frame, upright bars (UV in metres: along, up)
		float bar = t_band(uv.x, 0.12, 0.03, fwidth(uv.x));
		float frame = max(step(uv.y, 0.06), step(1.02, uv.y)) + t_band(uv.x, 2.3, 0.06, fwidth(uv.x));
		float solid = max(bar, frame);
		// far off the bars average out to a grey veil
		float far_k = smoothstep(0.02, 0.06, fw);
		if (far_k < 0.5 && solid < 0.5) discard;
		if (far_k >= 0.5 && t_hash2(floor(FRAGCOORD.xy)) > 0.45) discard;
		albedo = vec3(0.55, 0.56, 0.56);
		metal = 0.7;
		rough = 0.45;
	} else if (kind < 1.5) {
		// scaffold: standards, ledgers and braces of tube (UV in metres: along, up)
		vec2 g = vec2(uv.x / 2.0, uv.y / 2.0);
		float stand = t_band(uv.x, 2.0, 0.08, fwidth(uv.x));
		float ledger = t_band(uv.y, 2.0, 0.08, fwidth(uv.y));
		float brace = t_band(uv.x - uv.y, 4.0, 0.1, fw * 1.4);
		float solid = max(max(stand, ledger), brace);
		if (solid < 0.5 && smoothstep(0.03, 0.1, fw) < 0.5) discard;
		albedo = vec3(0.6, 0.6, 0.58);
		metal = 0.7;
		rough = 0.45;
	} else if (kind < 2.5) {
		// a platform's boards
		albedo = vec3(0.32, 0.28, 0.22) * (0.85 + 0.15 * step(0.5, fract(uv.x / 0.3)));
		rough = 0.8;
	} else if (kind < 3.5) {
		// dark kit: cameras, generators, speaker stacks
		albedo = vec3(0.03, 0.03, 0.035);
		rough = 0.5;
		metal = 0.3;
	} else if (kind < 4.5) {
		// concrete: piers, the lighthouse's base, the bridge's approaches
		albedo = vec3(0.55, 0.53, 0.5) * (0.85 + 0.2 * t_noise(v_world.xz * 3.0 + v_world.y * 5.0));
		rough = 0.9;
	} else if (kind < 5.5) {
		// painted steel: det picks the paint (0 international orange, 1 crane yellow, 2 grey-blue,
		// 3 white, 4 red and white bands, 5 red)
		vec3 c = det < 0.5 ? vec3(0.62, 0.13, 0.04) : det < 1.5 ? vec3(0.8, 0.55, 0.04) : det < 2.5 ? vec3(0.25, 0.3, 0.36) : vec3(0.78, 0.78, 0.76);
		if (det > 3.5) c = step(0.5, fract(v_world.y / 0.6)) > 0.5 ? vec3(0.7, 0.05, 0.03) : vec3(0.8);
		if (det > 4.5) c = vec3(0.62, 0.05, 0.03);
		albedo = c * (0.9 + 0.1 * t_noise(uv * 2.0));
		metal = 0.5;
		rough = 0.5;
	} else if (kind < 6.5) {
		// lattice steel: a crane's boom, the bridge's stiffening truss (det: paint as above)
		vec3 c = det < 0.5 ? vec3(0.62, 0.13, 0.04) : det < 1.5 ? vec3(0.8, 0.55, 0.04) : vec3(0.25, 0.3, 0.36);
		float chord = max(step(uv.y, 0.12), step(0.88, uv.y));
		float web = t_band(uv.x - uv.y * 0.9, 1.8, 0.16, fw * 1.4) + t_band(uv.x + uv.y * 0.9, 1.8, 0.16, fw * 1.4);
		float solid = max(chord, min(web, 1.0));
		if (solid < 0.5 && smoothstep(0.08, 0.3, fw) < 0.5) discard;
		albedo = c;
		metal = 0.5;
		rough = 0.5;
	} else if (kind < 7.5) {
		// a ship: dark hull, red below the waterline, white superstructure (det 1)
		if (det > 0.5) {
			albedo = vec3(0.85, 0.84, 0.8);
			// rows of windows
			float wrow = step(0.55, fract(uv.y / 3.0)) * step(0.3, fract(uv.x / 2.0));
			albedo = mix(albedo, vec3(0.05, 0.06, 0.08), wrow * 0.8);
			emit = vec3(1.0, 0.8, 0.5) * wrow * step(0.7, t_hash2(floor(uv / vec2(2.0, 3.0)))) * 0.6;
		} else {
			albedo = v_world.y < T_WATER_Y + 0.08 ? vec3(0.35, 0.06, 0.04) : vec3(0.06, 0.08, 0.12);
		}
		rough = 0.6;
		metal = 0.3;
	} else if (kind < 8.5) {
		// the hills round the bay: scrub and woods, houses scattered up them, lights coming on
		float n = t_fbm(v_world.xz * 0.06);
		albedo = mix(vec3(0.12, 0.13, 0.06), vec3(0.22, 0.2, 0.12), n);
		float houses = step(0.82, t_hash2(floor(v_world.xz * 1.5))) * smoothstep(0.6, 0.3, n);
		albedo = mix(albedo, vec3(0.6, 0.55, 0.5), houses * 0.6);
		emit = vec3(1.0, 0.7, 0.4) * houses * step(0.6, t_hash2(floor(v_world.xz * 1.5) + 7.0)) * 0.5;
		rough = 0.95;
	} else if (kind < 9.5) {
		// the rest of the city: blocks of buildings in the haze, windows lighting up
		vec2 g = vec2(uv.x / 0.22, uv.y / 0.22);
		float win = step(0.35, fract(g.x)) * step(0.4, fract(g.y)) * step(0.4, t_hash2(floor(g) + det * 17.0));
		albedo = mix(vec3(0.35, 0.33, 0.32), vec3(0.5, 0.46, 0.42), t_hash(det * 3.1));
		float on = step(0.75, t_hash2(floor(g) * 1.3 + det * 5.0));
		albedo = mix(albedo, vec3(0.1, 0.11, 0.13), win * 0.7 * (1.0 - smoothstep(0.1, 0.4, fw * 4.0)));
		emit = vec3(1.0, 0.72, 0.42) * win * on * 0.9;
		rough = 0.8;
	} else if (kind < 10.5) {
		// cables and hangers
		albedo = vec3(0.5, 0.12, 0.05);
		metal = 0.5;
		rough = 0.4;
	} else if (kind < 11.5) {
		// aviation warning lights, blinking (det: phase); det 10 and up: the lighthouse's lamp,
		// a white flash every five seconds
		albedo = vec3(0.2, 0.0, 0.0);
		emit = vec3(1.0, 0.05, 0.02) * 12.0 * step(0.55, fract(TIME * 0.75 + det));
		if (det > 9.5) {
			float f = fract(TIME / 5.0);
			albedo = vec3(0.6);
			emit = vec3(1.0, 0.95, 0.85) * (0.6 + 30.0 * smoothstep(0.0, 0.02, f) * (1.0 - smoothstep(0.04, 0.12, f)));
		}
	} else if (kind < 12.5) {
		// a big screen: the arena's scoreboard on a wall of LEDs
		vec3 pic = texture(screen_tex, vec2(uv.x, 1.0 - uv.y)).rgb;
		vec2 px = fract(uv * vec2(480.0, 270.0));
		float led = smoothstep(0.5, 0.2, length(px - 0.5));
		albedo = vec3(0.02);
		emit = pic * mix(1.0, led * 1.6, 1.0 - smoothstep(0.0005, 0.002, fw)) * 2.2 * screen_on;
		rough = 0.3;
	} else if (kind < 13.5) {
		// a satellite dish: white
		albedo = vec3(0.85, 0.85, 0.83);
		rough = 0.4;
	} else if (kind < 14.5) {
		// a light tower's bank of lamps, on for the evening (UV: 0..1 over the bank)
		vec2 g = fract(UV * vec2(2.0, 2.0));
		float lamp = 1.0 - smoothstep(0.3, 0.42, length(g - 0.5));
		albedo = vec3(0.05);
		emit = vec3(1.0, 0.9, 0.75) * (lamp * 8.0 + 0.5);
		rough = 0.3;
	} else if (kind > 15.5) {
		// containers stacked in their rows: each box its own colour, dark seams between them
		// (40 ft boxes, 12 x 2.4 x 2.6 m)
		vec3 cell = floor(vec3(v_world.x / 0.8, v_world.y / 0.174, v_world.z / 0.163));
		float h = t_hash2(cell.xz * 1.7 + cell.y * 13.1);
		vec3 c = h < 0.17 ? vec3(0.05, 0.25, 0.45) : h < 0.34 ? vec3(0.55, 0.12, 0.06) : h < 0.48 ? vec3(0.15, 0.32, 0.18) : h < 0.62 ? vec3(0.7, 0.5, 0.1) : h < 0.78 ? vec3(0.45, 0.45, 0.45) : h < 0.9 ? vec3(0.6, 0.25, 0.08) : vec3(0.8, 0.8, 0.78);
		vec3 f = fract(vec3(v_world.x / 0.8, v_world.y / 0.174, v_world.z / 0.163));
		vec3 nw = (INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz;
		float seam = abs(nw.y) > 0.5 ? max(step(0.97, f.x), step(0.9, f.z)) : max(step(0.94, f.y), step(abs(nw.x) > 0.5 ? 0.9 : 0.97, abs(nw.x) > 0.5 ? f.z : f.x));
		float fade = smoothstep(0.02, 0.08, fw);
		albedo = mix(c * (0.85 + 0.15 * step(0.5, fract(f.x * 40.0))), vec3(0.1), seam * (1.0 - fade) * 0.8);
		rough = 0.7;
		metal = 0.4;
	} else {
		// a marquee's canvas: white, its seams (UV in metres)
		albedo = vec3(0.86, 0.86, 0.84) * (0.92 + 0.08 * step(0.5, fract(uv.x / 3.0)));
		rough = 0.85;
	}
	ALBEDO = albedo;
	ROUGHNESS = rough;
	METALLIC = metal;
	EMISSION = emit;
	FOG = t_haze(v_world, cam);
}
