## How the arena is lit in each venue (src/render/stage.ts applyLook, with game.ts useVenue's far
## plane and outer ground): the background, the fog (Godot's and the bb_fog_* globals the baked
## materials read), the ambient (the hemisphere light and the environment, as an ambient sky),
## the key spot standing in for the sun, and the two rims. The set of lights never changes, only
## their colours and placement. The indoor arena's own setup (game/fight.gd _build_world) is
## captured the first time and handed back for the Grand Championship and quick fights.
class_name VenueLook
extends RefCounted

const SKY_SHADER := preload("res://render/venues/venue_sky.gdshader")

var _indoor := {}
var _sky: ShaderMaterial


## The indoor arena's lighting as fight.gd built it (called before the first venue's look).
func capture(game) -> void:
	if not _indoor.is_empty():
		return
	var env: Environment = game._env
	var key: SpotLight3D = game._key
	var rims := []
	for r in game._rims:
		rims.append([r.light_color, r.light_energy, r.omni_range, r.position])
	_indoor = {
		"bg": env.background_color,
		"fog": env.fog_light_color,
		"fog_density": env.fog_density,
		"ambient": env.ambient_light_energy,
		"sky": env.sky.sky_material if env.sky else null,
		"key": [key.light_color, key.light_energy, key.transform, key.spot_angle, key.spot_angle_attenuation, key.spot_range],
		"rims": rims,
		"rims_look": game.rims_look.duplicate(true),
		"bb_fog_color": ProjectSettings.get_setting("shader_globals/bb_fog_color", {}).get("value", Vector3(0.0021, 0.0031, 0.0062)),
		"bb_fog_density": ProjectSettings.get_setting("shader_globals/bb_fog_density", {}).get("value", 0.016),
	}


## Back to the indoor arena's light.
func restore(game) -> void:
	if _indoor.is_empty():
		return
	var env: Environment = game._env
	env.background_color = _indoor.bg
	env.fog_light_color = _indoor.fog
	env.fog_density = _indoor.fog_density
	env.ambient_light_energy = _indoor.ambient
	if env.sky and _indoor.sky:
		env.sky.sky_material = _indoor.sky
	var key: SpotLight3D = game._key
	var k: Array = _indoor.key
	key.light_color = k[0]
	key.light_energy = k[1]
	key.transform = k[2]
	key.spot_angle = k[3]
	key.spot_angle_attenuation = k[4]
	key.spot_range = k[5]
	for i in game._rims.size():
		var r: Array = _indoor.rims[i]
		game._rims[i].light_color = r[0]
		game._rims[i].light_energy = r[1]
		game._rims[i].omni_range = r[2]
		game._rims[i].position = r[3]
	game.rims_look = _indoor.rims_look.duplicate(true)
	game.follow.level = 1.0
	RenderingServer.global_shader_parameter_set("bb_fog_color", _indoor.bb_fog_color)
	RenderingServer.global_shader_parameter_set("bb_fog_density", _indoor.bb_fog_density)


## stage.ts applyLook for a venue's LightLook `l` (hex colours, three's intensities, as baked), with
## its sky dome's material `dome` for the ambient sky's colours.
func apply(game, l: Dictionary, dome: ShaderMaterial) -> void:
	capture(game)
	var env: Environment = game._env
	env.background_color = _hex(l.background)
	env.fog_light_color = _hex(l.fog)
	# Godot's fog is exp, three's exp2: scaled from the indoor pair (0.006 for three's 0.016)
	env.fog_density = float(_indoor.fog_density) * float(l.fogDensity) / 0.016
	RenderingServer.global_shader_parameter_set("bb_fog_color", _lin3(l.fog))
	RenderingServer.global_shader_parameter_set("bb_fog_density", float(l.fogDensity))
	# the hemisphere light and the environment as one ambient sky (venue_sky.gdshader)
	if env.sky:
		if _sky == null:
			_sky = ShaderMaterial.new()
			_sky.shader = SKY_SHADER
		var h: Dictionary = l.hemi
		_sky.set_shader_parameter("hemi_sky", _lin3(h.sky) * float(h.intensity) / PI)
		_sky.set_shader_parameter("hemi_ground", _lin3(h.ground) * float(h.intensity) / PI)
		_sky.set_shader_parameter("env_k", float(l.envIntensity))
		if dome:
			for k in ["uZenith", "uHorizon", "uGlowCol", "uHaze", "uGnd", "uSunDir", "uSunCol", "uCloud"]:
				_sky.set_shader_parameter(k.substr(1).to_snake_case(), dome.get_shader_parameter(k))
		env.sky.sky_material = _sky
		env.ambient_light_energy = 1.0
	# the key spot stands in for the sun (outdoor.ts sunLook), as fight.gd sets up the indoor one
	var kl: Dictionary = l.key
	var key: SpotLight3D = game._key
	key.light_color = _hex(kl.color)
	key.light_energy = float(kl.intensity) / PI
	var pos := _v3(kl.pos)
	var target := _v3(kl.target)
	key.look_at_from_position(pos, target)
	key.spot_angle = rad_to_deg(float(kl.angle))
	# (fight.gd: three's penumbra 0.8 -> 0.6)
	key.spot_angle_attenuation = 0.6 * float(kl.penumbra) / 0.8
	# three's spot reaches forever: far enough for the ring and the floor round it
	key.spot_range = maxf(18.0, pos.distance_to(target) + 16.0)
	var rl: Array = l.rims
	var looks := []
	for i in mini(rl.size(), game._rims.size()):
		var r: Dictionary = rl[i]
		var o: OmniLight3D = game._rims[i]
		o.light_color = _hex(r.color)
		o.light_energy = float(r.intensity) / PI
		o.omni_range = float(r.distance)
		o.position = _v3(r.pos)
		looks.append([_hex(r.color).srgb_to_linear(), float(r.intensity)])
	game.rims_look = looks
	# the follow spots stand out less against daylight (hemisphere 0.7..1.1 outdoors)
	game.follow.level = clampf(1.25 - 0.75 * float(l.hemi.intensity), 0.4, 1.0)


static func _hex(h) -> Color:
	var i := int(h)
	return Color8((i >> 16) & 255, (i >> 8) & 255, i & 255)


static func _lin3(h) -> Vector3:
	var c := _hex(h).srgb_to_linear()
	return Vector3(c.r, c.g, c.b)


static func _v3(a: Array) -> Vector3:
	return Vector3(a[0], a[1], a[2])
