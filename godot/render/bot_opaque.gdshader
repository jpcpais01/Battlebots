// Robot plating, the one shader that can draw any skin, picked while the shader runs (and the
// sweep that paints a new skin on over the old one). A robot only wears it while a skin paints on:
// the rest of the time it wears a copy built for its one skin (BotModel.opaque_shader), which
// carries none of the other skins' code. The plating itself is render/bot/bot_opaque.gdshaderinc.
shader_type spatial;

#include "res://render/bot/bot_opaque.gdshaderinc"
