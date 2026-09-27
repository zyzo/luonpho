import * as THREE from 'three';
import { mesh, box, cyl, rod, type Point3 } from '../scene/primitives.ts';
import { mat, C } from '../scene/materials.ts';
import { rand, pick } from '../scene/math.ts';
import { batch } from '../scene/batching.ts';
import { person, tree } from '../models/props.ts';
import { makeScooter } from '../models/vehicles.ts';
import { storefront } from './storefront.ts';
import { CHUNK } from './config.ts';

function wire(p: THREE.Object3D, a: Point3, b: Point3, sag = 0.8) {
  const mid = new THREE.Vector3(
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2 - sag,
    (a[2] + b[2]) / 2,
  );
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(...a),
    mid,
    new THREE.Vector3(...b),
  );
  mesh(
    p,
    new THREE.TubeGeometry(curve, 14, 0.018, 4, false),
    '#394842',
    0,
    0,
    0,
  );
}
export function createChunk(index: number) {
  const g = new THREE.Group();
  const road = box(g, '#858782', 0, -0.14, 0, 12, 0.25, CHUNK);
  road.castShadow = false;
  for (const side of [-1, 1]) {
    box(g, '#b9b59e', side * 8, 0.04, 0, 4, 0.34, CHUNK);
    box(g, '#ddd1ab', side * 6.08, 0.12, 0, 0.16, 0.33, CHUNK);
    for (let z = -20; z < 20; z += 2) {
      box(g, '#9e9f8e', side * 8, 0.219, z, 3.8, 0.012, 0.022);
    }
    for (let j = 0; j < 6; j++)
      storefront(
        g,
        side,
        -16.7 + j * 6.65,
        index * 12 + j + (side === 1 ? 6 : 0),
      );
    for (const z of [-12, 12]) {
      tree(g, side * 6.8, z);
      const bike = makeScooter(
        pick([C.red, C.blue, C.cream, C.green]),
        C.cream,
        C.cream,
      );
      bike.position.set(side * 7.8, 0.18, z + 2);
      bike.rotation.y = side * 1.05;
      bike.scale.setScalar(0.8);
      g.add(bike);
    }
    cyl(g, '#8a8f7e', side * 6.6, 3.5, -4, 0.12, 7);
    box(g, C.dark, side * 6.6, 5.65, -4, 0.42, 0.7, 0.24);
    rod(
      g,
      mat(C.steel, 'steel'),
      [side * 6.6, 6.9, -4],
      [side * 4.3, 7.1, -4],
      0.055,
    );
    box(g, C.cream, side * 4.3, 7.05, -4, 0.65, 0.12, 0.26);
    for (let i = 0; i < 5; i++)
      wire(
        g,
        [side * 6.6, 6 + i * 0.1, -20],
        [side * 6.6, 6 + i * 0.1, 20],
        0.5 + i * 0.08,
      );
    person(
      g,
      side * 6.65,
      -7,
      pick([C.cream, C.red, C.blue]),
      side * 1.2,
      false,
      index % 2 === 0,
    );
    for (let i = 0; i < 5; i++)
      box(g, '#4d5751', side * 5.75, 0.006, -2 + i * 0.14, 0.35, 0.01, 0.06);
  }
  wire(g, [-6.6, 6.5, -4], [6.6, 6.5, -2], 1.3);
  wire(g, [-6.6, 6.7, -4], [6.6, 6.7, -2], 1.1);
  for (let z = -18; z < 20; z += 8)
    box(g, '#dbc994', 0, 0.002, z, 0.12, 0.012, 3.2);
  if (index % 3 === 1) {
    for (let x = -5; x < 6; x += 1.1)
      box(g, '#d5cfb2', x, 0.006, 15, 0.57, 0.012, 3);
  }
  for (let i = 0; i < 8; i++) {
    box(
      g,
      '#737b76',
      (rand() - 0.5) * 10,
      0.006,
      (rand() - 0.5) * 40,
      0.2 + rand(),
      0.009,
      0.04,
      0,
      rand() * 3,
    );
  }
  return batch(g);
}
