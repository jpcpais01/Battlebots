## The lounge robot's poses (src/render/home/loungePoses.ts), in its own frame on the sofa (root
## on the floor under the front of its seat cushion, x to its right, z towards the TV). The sofa
## runs off to its right; its left armrest's inner face is at x -0.55, the seat cushions' top at
## y 0.46 from z -0.42 to 0.24. The coffee table's top is at y 0.42, z 0.78 to 1.22. Built once,
## on first use.
class_name LoungePoses
extends RefCounted

const SOFA := {"seatY": 0.46, "seatZ0": -0.42, "seatZ1": 0.24, "armX": -0.55, "armTop": 0.74}
const TABLE := {"y": 0.42, "z0": 0.78, "z1": 1.22, "halfW": 0.5}
## Where the mug is set down, in the robot's frame.
const MUG_AT := Vector3(0.3, 0.42, 0.92)
## On its feet between the sofa and the table (the live fighter takes over from here).
const STAND_AT := Vector3(0, 0, 0.42)

## Times (s after Fight) of the news's beats.
const NEWS := {"alarm": 0.0, "sitUp": 0.3, "gulp": 0.75, "spit": 1.15, "feet": 1.6, "lean": 1.95, "down": 2.2, "rise": 2.55, "stand": 3.05, "live": 3.2, "emote": 3.45, "cut": 5.0}

## The idle loop: watching, and every so often a sip.
const IDLE_LEN := 10.0

static var _idle: Array = []
static var _outro: Array = []


static func idle() -> Array:
	if _idle.is_empty():
		_build()
	return _idle


static func outro() -> Array:
	if _outro.is_empty():
		_build()
	return _outro


static func _build() -> void:
	# feet up on the coffee table, ankles relaxed
	var feet_up := [
		{"at": [0.15, 0.5, 0.86], "pole": [0.2, 1, 0.3], "air": 1, "flex": 0.45},
		{"at": [0.12, 0.49, 0.8], "pole": [0.2, 1, 0.3], "air": 1, "flex": 0.3},
	]
	# feet down on the rug in front of the sofa
	var feet_down := [
		{"at": [0.17, 0, 0.44], "pole": [0, 0.5, 1], "yaw": 0.1},
		{"at": [0.17, 0, 0.4], "pole": [0, 0.5, 1], "yaw": 0.1},
	]
	# the left hand resting on the armrest
	var armrest := {"at": [-0.64, 0.79, -0.06], "in": "root", "abs": true, "pole": [0.6, -0.6, -0.5], "roll": 1}
	# slumped deep into the cushions, a mug on its belly, feet up on the table, watching TV
	var slouch := HomePuppet.pose({"pelvis": [0, 0.58, -0.05], "hips": [-0.78, 0, 0], "spine": [0.06, 0, 0], "head": [0.66, 0.04, 0],
		"hands": [armrest, {"at": [0.12, -0.3, 0.25], "pole": [1, -0.4, -0.4], "roll": 0.2}], "feet": feet_up})
	# the mug up to the mouth
	var drink := HomePuppet.pose({"pelvis": [0, 0.58, -0.05], "hips": [-0.74, 0, 0], "spine": [0.08, 0, 0], "head": [0.5, 0.04, 0],
		"hands": [armrest, {"at": [0.03, -0.08, 0.2], "in": "head", "pole": [1, -0.6, -0.1], "roll": 0.5}], "feet": feet_up})
	# head back for a long sip
	var sip := HomePuppet.pose({"pelvis": [0, 0.58, -0.05], "hips": [-0.76, 0, 0], "spine": [0.06, 0, 0], "head": [0.3, 0.04, 0],
		"hands": [armrest, {"at": [0.03, -0.06, 0.18], "in": "head", "pole": [1, -0.6, -0.1], "roll": 0.6}], "feet": feet_up})
	_idle = [[0.0, slouch], [5.6, slouch], [6.5, drink], [7.1, sip], [7.9, drink], [8.8, slouch], [10.0, slouch]]

	var feet_alert := [
		{"at": [0.15, 0.5, 0.8], "pole": [0.2, 1, 0.4], "air": 1, "flex": 0.2},
		{"at": [0.12, 0.49, 0.76], "pole": [0.2, 1, 0.4], "air": 1, "flex": 0.1},
	]
	# the TV cuts to the alert: bolt upright, staring at it, mid-sip
	var alerted := HomePuppet.pose({"pelvis": [0, 0.58, -0.04], "hips": [-0.32, 0, 0], "spine": [0.1, 0, 0], "head": [0.12, 0, 0],
		"hands": [armrest, {"at": [0.12, -0.14, 0.3], "pole": [1, -0.5, -0.3], "roll": 0.3}], "feet": feet_alert})
	# a nervous gulp
	var gulp := HomePuppet.pose({"pelvis": [0, 0.58, -0.04], "hips": [-0.3, 0, 0], "spine": [0.04, 0, 0], "head": [-0.08, 0, 0],
		"hands": [armrest, {"at": [0.03, -0.07, 0.19], "in": "head", "pole": [1, -0.6, -0.1], "roll": 0.6}], "feet": feet_alert})
	# ...and out it all comes
	var spit := HomePuppet.pose({"pelvis": [0, 0.58, -0.02], "hips": [-0.12, 0, 0], "spine": [0.28, 0, 0], "head": [0.32, 0, 0],
		"hands": [{"at": [0.22, 0.02, 0.3], "pole": [0.6, -0.6, -0.5], "roll": 0}, {"at": [0.3, -0.12, 0.3], "pole": [1, -0.5, -0.3], "roll": 0.2}],
		"feet": [
			{"at": [0.16, 0.56, 0.72], "pole": [0.2, 1, 0.4], "air": 1, "flex": 0.1},
			{"at": [0.13, 0.55, 0.68], "pole": [0.2, 1, 0.4], "air": 1, "flex": 0.1},
		]})
	# feet down, leaning over to put the mug on the table
	var lean := HomePuppet.pose({"pelvis": [0, 0.58, 0.1], "hips": [0.78, 0, 0], "spine": [0.25, 0, 0], "head": [-0.2, 0, 0],
		"hands": [
			{"at": [-0.22, 0.62, 0.42], "in": "root", "abs": true, "pole": [0.5, -1, -0.2]},
			{"at": [MUG_AT.x, MUG_AT.y + 0.08, MUG_AT.z], "in": "root", "abs": true, "pole": [0.6, -0.6, -0.4], "roll": 0.4},
		], "feet": feet_down})
	# pushing up off the knees
	var rise := HomePuppet.pose({"pelvis": [0, 0.7, 0.28], "hips": [0.62, 0, 0], "spine": [0.2, 0, 0], "head": [-0.25, 0, 0],
		"hands": [
			{"at": [-0.2, 0.56, 0.5], "in": "root", "abs": true, "pole": [0.5, -1, -0.2]},
			{"at": [0.2, 0.56, 0.5], "in": "root", "abs": true, "pole": [0.5, -1, -0.2]},
		], "feet": feet_down})
	var stand := HomePuppet.pose({"pelvis": [0, 0.88, 0.42], "hips": [0.04, 0, 0], "spine": [0.02, 0, 0], "head": [0, 0, 0],
		"hands": [
			{"at": [0.3, -0.36, 0.12], "pole": [0.4, -0.2, -1], "roll": 0.3},
			{"at": [0.3, -0.36, 0.12], "pole": [0.4, -0.2, -1], "roll": 0.3},
		],
		"feet": [
			{"at": [0.17, 0, 0.46], "pole": [0.2, 0.2, 1], "yaw": 0.12},
			{"at": [0.17, 0, 0.4], "pole": [0.2, 0.2, 1], "yaw": 0.12},
		]})
	_outro = [
		[0.0, slouch], [NEWS.sitUp, alerted], [0.55, alerted], [NEWS.gulp, gulp], [1.0, gulp], [NEWS.spit, spit],
		[1.5, spit], [NEWS.lean, lean], [NEWS.down, lean], [NEWS.rise, rise], [NEWS.stand, stand],
	]
