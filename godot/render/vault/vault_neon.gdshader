// Lights in the Skin Vault (vault_stage.gd): unshaded glow in `color` (linear, HDR). On a
// MultiMesh (the machine's bulbs), each instance takes its turn in a chase running round them.
shader_type spatial;
render_mode unshaded, cull_back, shadows_disabled;

uniform vec3 color = vec3(1.0);
uniform float energy = 3.0;
// the chase: how many bulbs in the loop, how fast (0: steady), and a flash over all of them
uniform float count = 1.0;
uniform float speed = 0.0;
uniform float flash = 0.0;
uniform vec3 color2 = vec3(1.0);
// alpha: a soft fade by the view angle (rings and haloes), 0 for a solid bulb
uniform float soft = 0.0;
// a white-hot middle (the ten-pull's lights), 0 for none
uniform float core = 0.0;

varying float v_k;
varying vec3 v_col;

void vertex() {
	float i = float(INSTANCE_ID);
	float ph = fract(i / count - TIME * speed);
	v_k = speed > 0.0 ? 0.25 + 0.75 * smoothstep(0.55, 0.95, ph) : 1.0;
	v_col = mix(color, color2, mod(i, 2.0));
}

void fragment() {
	float f = abs(dot(NORMAL, VIEW));
	ALBEDO = mix(v_col, vec3(1.0), core * pow(f, 3.0)) * energy * (v_k + flash);
	if (soft > 0.0) {
		ALPHA = clamp(pow(f, soft), 0.0, 1.0);
	}
}
