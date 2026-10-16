// Confetti from the rig when a fight is won (show.ts buildConfetti): opaque point flakes released
// over two seconds from `start`, fluttering down over the ring and the arena floor, flipping as they
// fall (a flash as a piece turns face-up). CUSTOM0 aR (four randoms).
shader_type spatial;
render_mode unshaded, cull_disabled, fog_disabled;
#include "res://render/venue/common.gdshaderinc"

uniform float start = -99.0;
uniform vec3 col = vec3(1.0, 0.195, 0.014);
uniform float life = 18.0;
// bowl.ts FLOOR (uFloor: "floor" is a built-in function here)
uniform float floor_y = -0.62;

varying vec3 v_c;
varying float v_spin;

void vertex() {
	vec4 a_r = CUSTOM0;
	// released over the first two seconds from the rig, spread over the ring and the floor
	float tau = bb_time - start - a_r.x * 2.0;
	float alive = step(0.0, tau) * step(tau, life);
	float rad = sqrt(a_r.y) * 15.0, a = a_r.z * 6.2831853;
	float fall = 1.6 + a_r.w * 1.2;
	float y0 = 22.0 + a_r.x * 2.0;
	float ground = rad < 5.6 ? 0.03 : floor_y + 0.02;
	float y = max(ground, y0 - fall * tau);
	float air = step(ground + 0.001, y);
	// fluttering: drifting side to side and flipping while it falls
	float sway = sin(tau * (1.5 + a_r.w) + a_r.y * 40.0) * 0.6 * min(tau, (y0 - ground) / fall);
	vec3 p = vec3(cos(a) * rad + sway, y, sin(a) * rad + cos(tau * 1.1 + a_r.z * 30.0) * 0.4);
	v_spin = mix(1.0, abs(sin(tau * (6.0 + a_r.w * 6.0) + a_r.x * 50.0)), air);
	float pick = fract(a_r.w * 7.13);
	vec3 c = pick < 0.45 ? col : pick < 0.7 ? vec3(1.0, 0.82, 0.3) : pick < 0.9 ? vec3(0.95) : col * 0.6 + 0.4;
	// a flash of the light from above as a piece turns face-up
	v_c = c * (0.55 + 0.45 * v_spin) * (1.0 - 0.35 * (1.0 - air));
	vec4 mv = MODELVIEW_MATRIX * vec4(p, 1.0);
	POINT_SIZE = alive * VIEWPORT_SIZE.y * 0.075 / -mv.z;
	POSITION = alive > 0.0 ? PROJECTION_MATRIX * mv : vec4(2.0, 2.0, 2.0, 1.0);
}

void fragment() {
	// a little rectangle that narrows as it turns edge-on
	vec2 d = abs(POINT_COORD - 0.5);
	if (d.y > 0.5 * max(0.18, v_spin) || d.x > 0.32) discard;
	ALBEDO = v_c;
}
