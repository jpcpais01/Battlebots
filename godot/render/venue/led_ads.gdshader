// The sponsor boards (venue.ts ledMaterial, ADS): each segment rotates its sponsor on its own beat
// with a bright wipe. CUSTOM0 aLed (length, speed, glow).
shader_type spatial;
render_mode unshaded, cull_disabled;
#define ADS
#include "res://render/venue/led.gdshaderinc"
