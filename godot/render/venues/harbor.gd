## Kairos Harbor (src/render/venues/harbor.ts HarborVenue): its tick, ported. The ship-to-shore
## cranes run their trolleys out over the ship, lift a box, bring it back and set it down on the
## quay on a minute's cycle each (stsCrane), and the tug steams round its circuit in the bay.
extends OutdoorVenue

## bowl.ts FLOOR, harbor.ts WATER_Y and the cranes' boom height.
const FLOOR := -0.62
const WATER_Y := FLOOR - 2.4
const GY := 40.0

## Per crane: x, phase, trolley, box, ropes.
var _cranes: Array = []
var _tug: Node3D


func _setup() -> void:
	var xs: Array = anim.get("cranes", [])
	for i in xs.size():
		_cranes.append([float(xs[i]), i * 23.7, node("crane%d_trolley" % i), node("crane%d_box" % i), node("crane%d_ropes" % i)])
	_tug = node("tug")


## stsCrane's seg: eased 0..1 as the cycle `c` goes from a to b.
static func _seg(c: float, a: float, b: float) -> float:
	var e := clampf((c - a) / (b - a), 0.0, 1.0)
	return e * e * (3.0 - 2.0 * e)


func _tick(_dt: float, t: float) -> void:
	for cr in _cranes:
		# out over the ship, down, up with a box, back over the quay, down onto a truck, up: a cycle
		var c := fmod(t + cr[1], 60.0) / 60.0
		var z := 36.0 + (64.0 - 36.0) * (_seg(c, 0.0, 0.2) - _seg(c, 0.5, 0.7))
		# (just down onto the ship's stacks; all the way down to a truck on the quay)
		var drop: float = 6.0 * (_seg(c, 0.22, 0.32) - _seg(c, 0.36, 0.46)) + 30.0 * (_seg(c, 0.72, 0.82) - _seg(c, 0.86, 0.96))
		var hy := GY - 4.0 - drop
		var x: float = cr[0]
		if cr[2]:
			cr[2].position = Vector3(x, GY + 2.4, z)
		if cr[3]:
			cr[3].position = Vector3(x, hy, z)
		if cr[4]:
			cr[4].transform = Transform3D(Basis.from_scale(Vector3(1.0, GY + 1.3 - hy - 0.25, 1.0)), Vector3(x, hy + 0.25, z))
	if _tug:
		var a := t * 0.018
		_tug.position = Vector3(70.0 + cos(a) * 130.0, WATER_Y + 0.5 + sin(t * 0.8) * 0.12, 190.0 + sin(a) * 60.0)
		# (bow, its +x, along the way it's going)
		_tug.basis = euler_xyz(0.0, -atan2(cos(a) * 60.0, -sin(a) * 130.0), sin(t * 0.7) * 0.03)
