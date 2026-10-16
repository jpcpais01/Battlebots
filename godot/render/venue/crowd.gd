## What the fans in the stands feel (src/render/crowd.ts Crowd: event, stir, update): the arena's
## excitement, each side's joy and dismay, boos in a lull, the Mexican wave in a calm spell and
## the spots where a torn-off part came down among them. All of it is a handful of uniforms on
## the one crowd ShaderMaterial (crowd.gdshader poses and lights every fan on the GPU).
class_name ArenaCrowd
extends RefCounted

## How many spots in the stands can be going wild over flying debris at once (crowd.ts HOT).
const HOT := 4

var _mat: ShaderMaterial
var _wave := 0.0
var _wave_a := 0.0
var _wave_on := false
var _calm := 0.0
var _excite := 0.15
var _joy := [0.0, 0.0]
var _dismay := [0.0, 0.0]
var _hold := [0.0, 0.0]
var _boo := 0.0
var _since_landed := 0.0
var _combo_who := -1
var _combo_n := 0
var _combo_t := -9.0
var _t := 0.0
## Debris among the fans: position and how wild they are (decays in `update`).
var _hot := PackedVector4Array()


func _init(mat: ShaderMaterial) -> void:
	_mat = mat
	_hot.resize(HOT)
	for i in HOT:
		_hot[i] = Vector4(0, -100, 0, 0)
	if _mat:
		_mat.set_shader_parameter("hot", _hot)


func _lift(side: int, joy: float, dismay: float, hold := 0.0) -> void:
	if side < 0 or side > 1:
		return
	_joy[side] = minf(1.6, maxf(_joy[side], 0.0) + joy)
	_dismay[1 - side] = minf(1.6, _dismay[1 - side] + dismay)
	_hold[side] = maxf(_hold[side], hold)
	_hold[1 - side] = maxf(_hold[1 - side], hold)


## Match events (crowd.ts Crowd.event): big shots, combos and knockdowns lift one side and floor
## the other.
func event(type: String, data) -> void:
	match type:
		"fightStart":
			_joy[0] += 0.5
			_joy[1] += 0.5
		"hit":
			if data.shielded:
				return
			var a := int(data.attacker.index)
			if data.blocked:
				if data.guardBreak:
					_lift(a, 0.35, 0.15)
				return
			_since_landed = 0.0
			var k := minf(1.0, float(data.damage) / 100.0)
			if _t - _combo_t < 1.6 and _combo_who == a:
				_combo_n += 1
			else:
				_combo_who = a
				_combo_n = 1
			_combo_t = _t
			if k > 0.3 or data.crit or data.counter:
				_lift(a, 0.2 + 0.8 * k, 0.15 + 0.75 * k)
			if _combo_n >= 3:
				_lift(a, 0.3, 0.2)
		"knockdown":
			_lift(int(data.attacker.index), 1.3, 1.2, 1.2)
		"stagger":
			var att = data.get("attacker") if data is Dictionary else null
			_lift(int(att.index) if att != null else -1, 0.4, 0.4)
		"getUp":
			# relief from the fallen robot's fans
			var f = data.get("f") if data is Dictionary else null
			if f != null:
				var i := int(f.index)
				_joy[i] = maxf(_joy[i], 0.9)
				_dismay[i] = 0.0
		"ko":
			_lift(int(data.winner.index), 1.6, 1.3, 4.0)
		"decision":
			var w = data.get("winner") if data is Dictionary else null
			if w != null:
				_lift(int(w.index), 1.2, 0.7, 2.5)


## A torn-off part is out among the fans at `p` (crowd.ts stir): everyone around it goes wild.
## Call it every frame while it is still stirring them up, so the spot follows it down the rows.
func stir(p: Vector3, k: float) -> void:
	var slot := 0
	var best := INF
	for i in HOT:
		var h := _hot[i]
		var d := Vector3(h.x, h.y, h.z).distance_squared_to(p)
		# follow the same piece (it has moved a little since last frame), else take the quietest spot
		var score := d - 100.0 if d < 4.0 else h.w
		if score < best:
			best = score
			slot = i
	_hot[slot] = Vector4(p.x, p.y, p.z, maxf(_hot[slot].w, minf(1.4, k * 1.4)))


## `excite` is the arena's excitement (CrowdMood.excite, the mood the crowd you hear follows too);
## `fighting` is true while the bell is live (crowd.ts Crowd.update).
func update(dt: float, excite: float, fighting: bool) -> void:
	_t += dt
	# fans take a moment to get up, longer to settle back down
	var k := 1.0 - exp(-dt / 0.35) if excite > _excite else 1.0 - exp(-dt / 1.2)
	_excite += (excite - _excite) * k
	for i in 2:
		if _hold[i] > 0.0:
			_hold[i] -= dt
		else:
			_joy[i] *= exp(-dt / 1.3)
			_dismay[i] *= exp(-dt / 1.6)
	# nothing landing for a while: boos
	_since_landed = _since_landed + dt if fighting else 0.0
	var boo_want := 1.0 if _since_landed > 7.0 else 0.0
	_boo += (boo_want - _boo) * (1.0 - exp(-dt / (1.5 if boo_want > 0.0 else 0.4)))
	# a calm spell gets a Mexican wave going now and then
	_calm = _calm + dt if _excite < 0.3 and _boo < 0.3 else 0.0
	if not _wave_on and _calm > 8.0 and randf() < dt / 12.0:
		_wave_on = true
		_wave_a = randf() * TAU
		_calm = -25.0
	if _wave_on:
		_wave_a += dt * 1.15
		_wave = minf(1.0, _wave + dt * 0.8)
		if _excite > 0.6 or randf() < dt / 9.0:
			_wave_on = false
	else:
		_wave = maxf(0.0, _wave - dt * 0.7)
	var any_hot := false
	for i in HOT:
		var h := _hot[i]
		if h.w > 0.0:
			h.w = maxf(0.0, h.w - dt * 0.35)
			_hot[i] = h
			any_hot = true
	if _mat == null:
		return
	_mat.set_shader_parameter("wave", _wave)
	_mat.set_shader_parameter("wave_a", _wave_a)
	_mat.set_shader_parameter("excite", _excite)
	_mat.set_shader_parameter("boo", _boo)
	_mat.set_shader_parameter("joy", Vector2(_joy[0], _joy[1]))
	_mat.set_shader_parameter("dismay", Vector2(_dismay[0], _dismay[1]))
	if any_hot:
		_mat.set_shader_parameter("hot", _hot)
