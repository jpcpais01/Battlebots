// The Skin Vault's walls and ceiling (vault_stage.gd), all from the world position and the face's
// direction. The walls: floor to near the ceiling a grid of safe-deposit boxes in brushed steel,
// each with its keyhole plate, brass number tag and status light, split by dark pilasters with a
// line of neon down each; a neon strip along the floor and another over the boxes. Round the vault
// door on the back wall (its opening is cut out: `hole`) a plain steel plate with a ring of rivets
// and the halo of the door's ring. The ceiling: dark with long light panels.
// `alarm` turns every box light red, blinking in waves; `gold` turns them gold.
shader_type spatial;
render_mode cull_back;

uniform vec3 mood_a = vec3(1.0, 0.12, 0.6);
uniform vec3 mood_b = vec3(0.1, 0.75, 1.0);
// the door's opening: x, y, the back wall's z, radius; and the plate round it
uniform vec4 hole = vec4(1.6, 2.95, -11.0, 2.62);
uniform float plate_r = 4.5;
uniform vec3 ring_col = vec3(1.0, 0.1, 0.1);
uniform float alarm = 0.0;
uniform vec3 alarm_col = vec3(1.0, 0.04, 0.02);
uniform float gold = 0.0;
uniform float flash = 0.0;
uniform vec3 flash_col = vec3(1.0);

varying vec3 v_world;
varying vec3 v_n;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_n = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 w = v_world;
	vec3 n = v_n;
	float t = TIME;
	vec3 alb = vec3(0.03, 0.03, 0.035);
	float metal = 0.5;
	float rough = 0.5;
	vec3 em = vec3(0.0);
	if (n.y < -0.5) {
		// the ceiling: long cool panels in rows, a neon line round its edge
		vec2 c = w.xz / vec2(3.2, 4.0);
		vec2 f = abs(fract(c) - 0.5) * vec2(3.2, 4.0);
		float panel = (1.0 - smoothstep(0.12, 0.15, f.x)) * (1.0 - smoothstep(1.3, 1.34, f.y));
		em += vec3(0.7, 0.78, 1.0) * panel * 0.3;
		alb = mix(vec3(0.02, 0.02, 0.025), vec3(0.6), panel);
		float edge = 11.0 - max(abs(w.x), abs(w.z));
		em += mood_b * (1.0 - smoothstep(0.03, 0.06, abs(edge - 0.4))) * 1.5;
	} else {
		// along the wall, and up it
		float u = abs(n.z) > 0.5 ? w.x * sign(n.z) : -w.z * sign(n.x);
		float y = w.y;
		float plate = 0.0;
		float r = 99.0;
		if (n.z > 0.5) {
			vec2 d = vec2(w.x - hole.x, y - hole.y);
			r = length(d);
			if (r < hole.w) {
				discard;
			}
			plate = 1.0 - step(plate_r, r);
		}
		// pilasters every 5.5 m
		float pu = u - round(u / 5.5) * 5.5;
		float pil = 1.0 - step(0.32, abs(pu));
		// the boxes, from 0.45 m up to 5.1 m
		vec2 cell = vec2(0.52, 0.36);
		vec2 g = vec2(u, y - 0.45) / cell;
		vec2 id = floor(g);
		vec2 f = fract(g);
		vec2 m = min(f, 1.0 - f) * cell;
		float gap = 1.0 - smoothstep(0.008, 0.014, min(m.x, m.y));
		float bevel = 1.0 - smoothstep(0.014, 0.03, min(m.x, m.y));
		float hb = hash(id);
		float boxes = step(0.45, y) * step(y, 5.1) * (1.0 - pil) * (1.0 - plate);
		vec3 steel = vec3(0.2, 0.21, 0.235) * (0.85 + 0.3 * hb);
		// brushed: fine streaks along each box
		steel *= 0.92 + 0.08 * hash(vec2(id.x, floor(f.y * 40.0) + id.y * 50.0));
		vec3 box_alb = mix(steel, steel * 1.4, bevel * step(0.5, f.y));
		box_alb *= 1.0 - gap * 0.85;
		// the keyhole plate, the brass tag, the status light
		vec2 lp = (f - vec2(0.84, 0.5)) * cell;
		float kp = 1.0 - smoothstep(0.03, 0.034, length(lp));
		float kh = 1.0 - smoothstep(0.006, 0.009, length(lp * vec2(1.0, 0.6)));
		box_alb = mix(box_alb, vec3(0.75), kp);
		box_alb = mix(box_alb, vec3(0.01), kh);
		vec2 tg = abs((f - vec2(0.45, 0.78)) * cell);
		float tag = (1.0 - step(0.055, tg.x)) * (1.0 - step(0.016, tg.y));
		box_alb = mix(box_alb, vec3(0.7, 0.5, 0.2), tag);
		float led = 1.0 - smoothstep(0.008, 0.013, length((f - vec2(0.12, 0.78)) * cell));
		float on = step(hb, 0.3);
		vec3 led_col = mix(vec3(0.15, 1.0, 0.4), vec3(1.0, 0.6, 0.1), step(0.24, hb));
		led_col *= on * (0.8 + 0.2 * sin(t * 1.3 + hb * 40.0));
		// (the alarm: every light red, blinking in waves rolling along the walls)
		float blink = step(0.45, fract(t * 2.2 - u * 0.06 + y * 0.03));
		led_col = mix(led_col, alarm_col * (0.4 + 2.6 * blink), alarm);
		led_col = mix(led_col, vec3(1.0, 0.62, 0.15) * 2.5, gold);
		alb = mix(alb, box_alb, boxes);
		metal = mix(metal, 0.6, boxes);
		// the strips' light washing over the boxes: magenta up from the floor, cyan down from the
		// top, and a little cool light over all of it
		vec3 wash = mood_a * exp(-max(y - 0.3, 0.0) * 1.0) * 0.9 + mood_b * exp(-max(5.45 - y, 0.0) * 0.8) * 0.7 + vec3(0.07, 0.08, 0.11);
		em += box_alb * wash * boxes * (1.0 - kh);
		rough = mix(rough, 0.32 + 0.12 * hb - kp * 0.2, boxes);
		em += led_col * led * boxes * 2.0;
		em += vec3(1.0, 0.75, 0.4) * tag * boxes * 0.05;
		// the pilasters: dark, a line of neon down the middle
		float pl = 1.0 - smoothstep(0.018, 0.03, abs(pu));
		alb = mix(alb, vec3(0.012, 0.012, 0.016), pil * (1.0 - plate));
		em += mood_a * pl * pil * step(0.3, y) * step(y, 5.55) * (1.0 - plate) * 2.0;
		// the strips: along the floor, and over the boxes
		float cove = 1.0 - smoothstep(0.015, 0.025, abs(y - 0.3));
		float top = 1.0 - smoothstep(0.025, 0.04, abs(y - 5.45));
		em += mood_a * (cove * 2.4 + exp(-abs(y - 0.3) * 14.0) * 0.35) * (1.0 - plate);
		em += mood_b * (top * 2.6 + exp(-abs(y - 5.45) * 12.0) * 0.35);
		alb = mix(alb, vec3(0.015), step(y, 0.27));
		// above: dark panelling
		float above = step(5.6, y);
		float rib = 1.0 - smoothstep(0.01, 0.02, abs(fract(u / 1.1) - 0.5) * 1.1);
		alb = mix(alb, vec3(0.022, 0.022, 0.028) * (1.0 - rib * 0.5), above);
		metal = mix(metal, 0.6, above);
		// round the door: a steel plate, rivets, a brass edge, and the halo of the door's ring
		if (plate > 0.0) {
			float a = atan(w.y - hole.y, w.x - hole.x);
			float riv = 1.0 - smoothstep(0.035, 0.045, length(vec2((fract(a * 36.0 / TAU) - 0.5) * TAU / 36.0 * r, r - (plate_r - 0.3))));
			float conc = smoothstep(0.9, 1.0, sin(r * 7.0));
			alb = mix(vec3(0.09, 0.095, 0.11) * (1.0 - conc * 0.3), vec3(0.6), riv);
			metal = 0.9;
			rough = mix(0.35, 0.2, riv);
			float edge = 1.0 - smoothstep(0.03, 0.05, abs(r - plate_r + 0.06));
			alb = mix(alb, vec3(0.75, 0.52, 0.22), edge);
			em += ring_col * exp(-max(r - 3.5, 0.0) * 1.6) * 0.35;
		}
	}
	em += flash_col * flash * 0.18;
	ALBEDO = alb;
	METALLIC = metal;
	ROUGHNESS = rough;
	EMISSION = em;
}
