// towers.ts searchlights: beams sweeping the sky from the towers' tops and the plaza at night, a
// MultiMesh of open cones the map turns each frame.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, fog_disabled;
#include "res://render/map/shaders/map_common.gdshaderinc"

varying float vAlong;
varying vec3 vWorld;
varying vec3 vN;

void vertex() {
	vAlong = VERTEX.y / 700.0;
	vec4 w = MODEL_MATRIX * vec4(VERTEX, 1.0);
	vWorld = w.xyz - uMapShift;
	vN = normalize(mat3(MODEL_MATRIX) * NORMAL);
}

void fragment() {
	vec3 V = normalize((CAMERA_POSITION_WORLD - uMapShift) - vWorld);
	// brightest down the middle of the beam as seen, fading along it
	float core = pow(abs(dot(normalize(vN), V)), 1.6);
	float k = core * pow(1.0 - vAlong, 1.4) * smoothstep(0.0, 0.03, vAlong);
	k *= 0.2 * uNight * uGlow * 0.4;
	MAP_OUT_ADD(vec3(0.75, 0.85, 1.0) * k)
}
