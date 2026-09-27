import * as THREE from 'three';
import { mat } from './materials.ts';

export type Surface = string | THREE.Material;
export type Point3 = [number, number, number];

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 10, 7);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
export const CONE = new THREE.ConeGeometry(1, 1, 12);
export function mesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  color: Surface,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  const o = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.rotation.set(rx, ry, rz);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
export function box(
  p: THREE.Object3D,
  c: Surface,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  return mesh(p, BOX, c, x, y, z, sx, sy, sz, rx, ry, rz);
}
export function ball(
  p: THREE.Object3D,
  c: Surface,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy = sx,
  sz = sx,
) {
  return mesh(p, SPHERE, c, x, y, z, sx, sy, sz);
}
export function cyl(
  p: THREE.Object3D,
  c: Surface,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  rx = 0,
  rz = 0,
) {
  return mesh(p, CYL, c, x, y, z, r, h, r, rx, 0, rz);
}
export function rod(
  p: THREE.Object3D,
  c: Surface,
  a: Point3,
  b: Point3,
  r = 0.025,
) {
  const av = new THREE.Vector3(...a),
    bv = new THREE.Vector3(...b),
    d = bv.clone().sub(av);
  const o = cyl(
    p,
    c,
    ...av.clone().add(bv).multiplyScalar(0.5).toArray(),
    r,
    d.length(),
  );
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
}
