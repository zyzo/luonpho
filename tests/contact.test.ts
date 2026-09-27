import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContact } from '../src/contact.ts';
import { createCollisions } from '../src/collisions.ts';

test('fast motion stops on the entry side of a vehicle', () => {
  const obstacle = { x: 0, z: 0 };
  const result = resolveContact(
    { x: 0, z: 10 },
    { x: 0, z: -10 },
    obstacle,
    obstacle,
  );
  assert.ok(result.z > 2.24);
});
test('side contact permits sliding along the vehicle', () => {
  const obstacle = { x: 0, z: 0 };
  const result = resolveContact(
    { x: 2, z: 0 },
    { x: 0, z: 1 },
    obstacle,
    obstacle,
  );
  assert.ok(result.x > 1.16);
  assert.equal(result.z, 1);
});
test('van uses its larger footprint', () => {
  const van = { x: 0, z: 0, halfWidth: 1.05, halfLength: 1.85 };
  const result = resolveContact({ x: 1.5, z: 8 }, { x: 1.5, z: -8 }, van, van);
  assert.ok(result.z > 2.97);
});
test('stationary overlaps are separated', () => {
  const body = { x: 0, z: 0 };
  const result = resolveContact(body, body, body, body);
  assert.ok(Math.abs(result.x) >= 1.16 || Math.abs(result.z) >= 2.24);
});
test('repeated input cannot bypass a solid obstacle during impact cooldown', () => {
  const collisions = createCollisions(5);
  for (let i = 0; i < 100; i++) {
    const result = collisions.update(i / 100, [
      { id: 'player', x: 0, z: 4 - i * 0.1, speed: -5, mass: 190, yaw: 0 },
      {
        id: 'van',
        x: 0,
        z: 0,
        speed: 0,
        mass: 1800,
        yaw: 0,
        solid: true,
        halfWidth: 1.05,
        halfLength: 1.85,
      },
    ]);
    assert.ok(result[0].z >= 2.97);
    assert.equal(result[1].crashed, false);
  }
});
