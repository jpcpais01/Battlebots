## three.js Vector3 for the translated sim: double precision and the same operation order
## as three's own methods, so the Godot sim stays bit-identical with the web one.
class_name V3
extends RefCounted

var x: float
var y: float
var z: float


func _init(ax: float = 0.0, ay: float = 0.0, az: float = 0.0) -> void:
	x = ax
	y = ay
	z = az


func set3(ax: float, ay: float, az: float) -> V3:
	x = ax
	y = ay
	z = az
	return self


func setX(v: float) -> V3:
	x = v
	return self


func setY(v: float) -> V3:
	y = v
	return self


func setZ(v: float) -> V3:
	z = v
	return self


func copy(v: V3) -> V3:
	x = v.x
	y = v.y
	z = v.z
	return self


func clone() -> V3:
	return V3.new(x, y, z)


func add(v: V3) -> V3:
	x += v.x
	y += v.y
	z += v.z
	return self


func addVectors(a: V3, b: V3) -> V3:
	x = a.x + b.x
	y = a.y + b.y
	z = a.z + b.z
	return self


func addScaledVector(v: V3, s: float) -> V3:
	x += v.x * s
	y += v.y * s
	z += v.z * s
	return self


func sub(v: V3) -> V3:
	x -= v.x
	y -= v.y
	z -= v.z
	return self


func subVectors(a: V3, b: V3) -> V3:
	x = a.x - b.x
	y = a.y - b.y
	z = a.z - b.z
	return self


func multiplyScalar(s: float) -> V3:
	x *= s
	y *= s
	z *= s
	return self


func divideScalar(s: float) -> V3:
	return multiplyScalar(1.0 / s)


func negate() -> V3:
	x = -x
	y = -y
	z = -z
	return self


func dot(v: V3) -> float:
	return x * v.x + y * v.y + z * v.z


func lengthSq() -> float:
	return x * x + y * y + z * z


func length() -> float:
	return sqrt(x * x + y * y + z * z)


func normalize() -> V3:
	var l := sqrt(x * x + y * y + z * z)
	return multiplyScalar(1.0 / (l if l != 0.0 else 1.0))


func setLength(l: float) -> V3:
	return normalize().multiplyScalar(l)


func lerp(v: V3, a: float) -> V3:
	x += (v.x - x) * a
	y += (v.y - y) * a
	z += (v.z - z) * a
	return self


func lerpVectors(v1: V3, v2: V3, a: float) -> V3:
	x = v1.x + (v2.x - v1.x) * a
	y = v1.y + (v2.y - v1.y) * a
	z = v1.z + (v2.z - v1.z) * a
	return self


func crossVectors(a: V3, b: V3) -> V3:
	var ax := a.x
	var ay := a.y
	var az := a.z
	var bx := b.x
	var by := b.y
	var bz := b.z
	x = ay * bz - az * by
	y = az * bx - ax * bz
	z = ax * by - ay * bx
	return self


func cross(v: V3) -> V3:
	return crossVectors(self, v)


func distanceToSquared(v: V3) -> float:
	var dx := x - v.x
	var dy := y - v.y
	var dz := z - v.z
	return dx * dx + dy * dy + dz * dz


func distanceTo(v: V3) -> float:
	return sqrt(distanceToSquared(v))


func equals(v: V3) -> bool:
	return x == v.x and y == v.y and z == v.z


## For the renderer (single precision).
func v() -> Vector3:
	return Vector3(x, y, z)
