// Thruster flames (fx.ts Fx.flame): an open additive cone, its tip at the nozzle.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, fog_disabled, shadows_disabled;

uniform vec3 color;

void vertex() {
	// three's ConeGeometry(0.07, 0.4) moved down 0.2: the tip sits on the origin
	VERTEX.y -= 0.2;
}

void fragment() {
	ALBEDO = color;
	ALPHA = 0.85;
}
