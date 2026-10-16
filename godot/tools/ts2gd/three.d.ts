// Type shim for the parts of three.js the translated code uses (see ts2gd.mjs).
export class Vector3 {
  constructor(x?: number, y?: number, z?: number);
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): this;
  setX(x: number): this;
  setY(y: number): this;
  setZ(z: number): this;
  copy(v: Vector3): this;
  clone(): Vector3;
  add(v: Vector3): this;
  addVectors(a: Vector3, b: Vector3): this;
  addScaledVector(v: Vector3, s: number): this;
  sub(v: Vector3): this;
  subVectors(a: Vector3, b: Vector3): this;
  multiplyScalar(s: number): this;
  divideScalar(s: number): this;
  negate(): this;
  dot(v: Vector3): number;
  lengthSq(): number;
  length(): number;
  normalize(): this;
  setLength(l: number): this;
  lerp(v: Vector3, a: number): this;
  lerpVectors(a: Vector3, b: Vector3, t: number): this;
  cross(v: Vector3): this;
  crossVectors(a: Vector3, b: Vector3): this;
  distanceTo(v: Vector3): number;
  distanceToSquared(v: Vector3): number;
  equals(v: Vector3): boolean;
}
