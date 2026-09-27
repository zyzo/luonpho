import * as THREE from 'three';
import { box, ball, cyl, rod } from '../scene/primitives.ts';
import { mat, C } from '../scene/materials.ts';
import { batch } from '../scene/batching.ts';

export function makeScooter(
  color: string,
  shirt: string,
  helmet: string,
  passenger = false,
) {
  const g = new THREE.Group();
  const paint = mat(color, 'paint');
  const clothing = mat(shirt, 'fabric');
  for (const z of [-0.7, 0.65]) {
    cyl(g, mat(C.tire, 'rubber'), 0, 0.37, z, 0.34, 0.2, 0, Math.PI / 2);
    cyl(g, mat(C.steel, 'steel'), 0, 0.37, z, 0.2, 0.22, 0, Math.PI / 2);
    cyl(g, C.dark, 0, 0.37, z, 0.06, 0.25, 0, Math.PI / 2);
  }
  box(g, C.dark, 0, 0.56, 0.12, 0.42, 0.13, 1.25);
  ball(g, paint, 0, 0.77, 0.52, 0.34, 0.37, 0.49);
  box(g, paint, 0, 0.76, -0.67, 0.5, 0.77, 0.22, 0.18);
  ball(g, paint, 0, 1.24, -0.65, 0.3, 0.16, 0.16);
  box(g, C.cream, 0, 1.25, -0.8, 0.26, 0.13, 0.04);
  box(g, C.dark, 0, 1.02, 0.38, 0.53, 0.13, 0.8);
  box(g, '#b94b30', 0, 0.83, 0.94, 0.33, 0.13, 0.05);
  box(g, C.white, 0, 0.57, 0.99, 0.25, 0.17, 0.025);
  box(g, mat(C.steel, 'steel'), 0.25, 0.32, 0.47, 0.09, 0.12, 0.65);
  rod(g, C.dark, [-0.42, 1.23, -0.62], [0.42, 1.23, -0.62], 0.045);
  for (const a of [-1, 1]) {
    rod(
      g,
      mat(C.steel, 'steel'),
      [a * 0.31, 1.27, -0.63],
      [a * 0.42, 1.58, -0.69],
      0.018,
    );
    ball(g, C.dark, a * 0.43, 1.58, -0.69, 0.105, 0.07, 0.035);
  }
  box(g, clothing, 0, 1.49, 0.19, 0.57, 0.72, 0.38, -0.12);
  ball(g, C.skin, 0, 1.97, 0.1, 0.22, 0.25, 0.21);
  ball(g, mat(helmet, 'paint'), 0, 2.09, 0.12, 0.26, 0.24, 0.25);
  box(g, C.cream, 0, 1.9, -0.08, 0.28, 0.09, 0.04);
  for (const a of [-1, 1]) {
    rod(g, clothing, [a * 0.28, 1.73, 0.09], [a * 0.38, 1.38, -0.24], 0.105);
    rod(g, C.skin, [a * 0.38, 1.38, -0.24], [a * 0.36, 1.23, -0.6], 0.075);
    rod(g, '#344952', [a * 0.2, 1.11, 0.28], [a * 0.32, 0.88, -0.12], 0.13);
    rod(g, '#344952', [a * 0.32, 0.88, -0.12], [a * 0.28, 0.56, 0.03], 0.095);
    box(g, C.cream, a * 0.28, 0.55, -0.05, 0.18, 0.12, 0.33);
  }
  if (passenger) {
    box(g, '#e6b44e', 0, 1.47, 0.69, 0.5, 0.58, 0.32);
    ball(g, C.skin, 0, 1.94, 0.69, 0.2, 0.22, 0.19);
    ball(g, C.red, 0, 2.04, 0.69, 0.24, 0.22, 0.23);
  }
  return batch(g);
}
export function makeVan() {
  const g = new THREE.Group();
  box(g, '#d8cfae', 0, 1.16, 0, 1.85, 1.65, 3.5);
  box(g, C.green, 0, 0.67, 0, 1.9, 0.35, 3.6);
  box(g, mat('#436366', 'glass'), 0, 1.58, -1.76, 1.62, 0.67, 0.02);
  box(g, mat('#436366', 'glass'), 0, 1.59, 1.76, 1.6, 0.6, 0.02);
  for (const a of [-1, 1]) {
    for (const z of [-1.15, 1.15])
      cyl(
        g,
        mat(C.tire, 'rubber'),
        a * 0.94,
        0.43,
        z,
        0.38,
        0.15,
        0,
        Math.PI / 2,
      );
    box(g, C.cream, a * 0.65, 0.91, -1.8, 0.31, 0.2, 0.05);
    box(g, C.red, a * 0.7, 0.89, 1.8, 0.17, 0.25, 0.05);
    box(g, mat('#436366', 'glass'), a * 0.94, 1.6, -0.75, 0.02, 0.64, 1.3);
  }
  return batch(g);
}
