import * as THREE from 'three';
import {
  mesh,
  box,
  ball,
  cyl,
  rod,
  CONE,
  type Surface,
} from '../scene/primitives.ts';
import { mat, C } from '../scene/materials.ts';
import { TAU, rand, pick } from '../scene/math.ts';

export function plant(
  p: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  size = 0.8,
) {
  cyl(p, '#a76243', x, y + 0.2 * size, z, 0.26 * size, 0.4 * size);
  rod(p, C.green, [x, y + 0.3 * size, z], [x, y + 1.15 * size, z], 0.035);
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5;
    ball(
      p,
      pick(['#54764c', '#729053', '#3e6750']),
      x + Math.cos(a) * 0.21 * size,
      y + (0.65 + i * 0.12) * size,
      z + Math.sin(a) * 0.2 * size,
      0.24 * size,
      0.12 * size,
      0.24 * size,
    );
  }
}
export function stool(p: THREE.Object3D, x: number, z: number, color = C.red) {
  box(p, color, x, 0.54, z, 0.44, 0.12, 0.44);
  for (const a of [-1, 1])
    for (const b of [-1, 1])
      box(p, color, x + a * 0.15, 0.32, z + b * 0.15, 0.055, 0.4, 0.055);
}
export function person(
  p: THREE.Object3D,
  x: number,
  z: number,
  shirt: string,
  angle = 0,
  sitting = false,
  hat = false,
) {
  const g = new THREE.Group();
  const y = sitting ? 0.45 : 0;
  box(g, shirt, 0, 1.18 - y, 0, 0.43, 0.58, 0.3, 0, 0, -0.03);
  ball(g, C.skin, 0, 1.65 - y, 0, 0.19, 0.24, 0.19);
  ball(g, '#292f2a', 0, 1.82 - y, 0.03, 0.19, 0.1, 0.19);
  if (hat) mesh(g, CONE, '#d8bf83', 0, 1.95 - y, 0, 0.43, 0.22, 0.43);
  for (const side of [-1, 1]) {
    rod(
      g,
      C.skin,
      [side * 0.23, 1.4 - y, 0],
      [side * 0.3, 0.93 - y, -0.15],
      0.075,
    );
    if (sitting) {
      rod(g, '#36474b', [side * 0.12, 0.6, 0], [side * 0.12, 0.55, -0.38], 0.1);
      rod(
        g,
        '#36474b',
        [side * 0.12, 0.55, -0.38],
        [side * 0.12, 0.2, -0.38],
        0.085,
      );
    } else
      rod(
        g,
        '#36474b',
        [side * 0.12, 0.92, 0],
        [side * 0.14, 0.16, side * 0.07],
        0.095,
      );
    box(g, C.dark, side * 0.14, 0.15, sitting ? -0.4 : -0.07, 0.19, 0.13, 0.3);
  }
  g.position.set(x, 0, z);
  g.rotation.y = angle;
  p.add(g);
  return g;
}
export function dog(p: THREE.Object3D, x: number, z: number, angle = 0) {
  const g = new THREE.Group();
  const fur = pick(['#b58b54', '#dfc18a', '#ece2c6']);
  ball(g, fur, 0, 0.48, 0, 0.2, 0.22, 0.43);
  ball(g, fur, 0, 0.68, -0.36, 0.19, 0.21, 0.21);
  ball(g, fur, 0, 0.6, -0.53, 0.12, 0.1, 0.17);
  ball(g, C.dark, 0, 0.63, -0.68, 0.06);
  for (const a of [-1, 1]) {
    mesh(g, CONE, fur, a * 0.13, 0.89, -0.31, 0.09, 0.22, 0.08, 0, 0, a * -0.2);
    ball(g, C.dark, a * 0.15, 0.72, -0.47, 0.025);
    for (const b of [-1, 1])
      rod(g, fur, [a * 0.12, 0.45, b * 0.26], [a * 0.15, 0.12, b * 0.3], 0.055);
  }
  rod(g, fur, [0, 0.55, 0.36], [0, 0.83, 0.62], 0.055);
  g.position.set(x, 0.18, z);
  g.rotation.y = angle;
  p.add(g);
}
export function umbrella(
  p: THREE.Object3D,
  x: number,
  z: number,
  color: Surface,
) {
  cyl(p, mat(C.steel, 'steel'), x, 1.45, z, 0.035, 2.7);
  const cap = mesh(p, CONE, color, x, 2.8, z, 1.5, 0.55, 1.5);
  cap.rotation.y = 0.3;
  cyl(p, color, x, 2.53, z, 1.5, 0.1);
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    rod(
      p,
      C.cream,
      [x, 3.05, z],
      [x + Math.cos(a) * 1.47, 2.51, z + Math.sin(a) * 1.47],
      0.014,
    );
  }
}
export function cart(p: THREE.Object3D, x: number, z: number, color: Surface) {
  box(p, mat(C.steel, 'steel'), x, 0.85, z, 1, 0.9, 1.5);
  box(p, color, x, 1, z + 0.76, 0.95, 0.55, 0.03);
  for (const a of [-1, 1])
    for (const b of [-1, 1]) {
      cyl(
        p,
        mat(C.tire, 'rubber'),
        x + a * 0.52,
        0.3,
        z + b * 0.55,
        0.18,
        0.07,
        0,
        Math.PI / 2,
      );
      rod(
        p,
        mat(C.steel, 'steel'),
        [x + a * 0.45, 1.2, z + b * 0.7],
        [x + a * 0.45, 2.2, z + b * 0.7],
        0.027,
      );
    }
  box(p, C.cream, x, 2.2, z, 1.2, 0.1, 1.8);
  box(p, C.yellow, x, 1.4, z, 0.8, 0.13, 1.3);
  for (let i = 0; i < 6; i++)
    ball(
      p,
      '#d4a74e',
      x - 0.3 + (i % 2) * 0.35,
      1.54,
      z - 0.45 + Math.floor(i / 2) * 0.4,
      0.13,
      0.09,
      0.21,
    );
}
export function tree(p: THREE.Object3D, x: number, z: number) {
  cyl(p, '#6f6c51', x, 2.1, z, 0.19, 4.2);
  rod(p, '#6f6c51', [x, 2.8, z], [x + 0.8, 4.6, z + 0.3], 0.12);
  for (let i = 0; i < 5; i++)
    ball(
      p,
      pick(['#5b805c', '#698859', '#7a945f']),
      x + (rand() - 0.5) * 2.1,
      4.6 + rand() * 1.4,
      z + (rand() - 0.5) * 2.2,
      1.35,
      1,
      1.3,
    );
  box(p, '#a29d82', x, 0.24, z, 1.2, 0.18, 1.2);
}
