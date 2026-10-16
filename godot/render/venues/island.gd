## Coral Beach Ring (src/render/venues/island.ts IslandVenue): its tick, ported. The sailboats out
## on the bay bob and roll on the swell, the ferry at the jetty rides it gently. The bake read
## each boat's phase back from the web objects (venues_bake.ts extract).
extends OutdoorVenue

## bowl.ts FLOOR, island.ts WATER_Y.
const FLOOR := -0.62
const WATER_Y := FLOOR - 0.9

## Per sailboat: node, phase, its heading.
var _boats: Array = []
var _ferry: Node3D


func _setup() -> void:
	for b in anim.get("boats", []):
		var n := node(b.name)
		if n:
			_boats.append([n, float(b.ph), float(b.yaw)])
	_ferry = node("ferry")


func _tick(_dt: float, t: float) -> void:
	for b in _boats:
		var n: Node3D = b[0]
		var ph: float = b[1]
		n.position.y = WATER_Y + 0.4 + sin(t * 0.9 + ph) * 0.12
		n.basis = euler_xyz(sin(t * 0.6 + ph * 1.3) * 0.03, b[2], sin(t * 0.7 + ph) * 0.05)
	if _ferry:
		_ferry.position.y = WATER_Y + 0.45 + sin(t * 0.8) * 0.06
