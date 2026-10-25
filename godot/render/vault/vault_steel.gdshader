// The vault door's steel (vault_stage.gd): bright machined metal with fine concentric turning
// marks round the mesh's own y axis (the door is a cylinder on its side, so they ring its face)
// and a few deeper grooves, fading out where they'd shimmer.
shader_type spatial;

uniform vec3 base : source_color = vec3(0.62, 0.64, 0.68);
uniform float rough = 0.26;
// the deeper grooves: how many per metre of radius (0 none)
uniform float grooves = 2.2;

varying vec3 v_p;

void vertex() {
	v_p = VERTEX;
}

void fragment() {
	float r = length(v_p.xz);
	float x = r * 320.0;
	// (the turning marks fade as they get finer than a pixel)
	float fine = (sin(x) * 0.5 + 0.5) * (1.0 - smoothstep(0.5, 2.0, fwidth(x)));
	float gx = r * grooves;
	float groove = grooves > 0.0 ? smoothstep(0.93, 0.99, abs(fract(gx) - 0.5) * 2.0) : 0.0;
	ALBEDO = base * (0.9 + 0.1 * fine) * (1.0 - groove * 0.55);
	METALLIC = 1.0;
	ROUGHNESS = clamp(rough + (fine - 0.5) * 0.1 + groove * 0.2, 0.04, 1.0);
}
