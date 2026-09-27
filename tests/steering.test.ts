import test from 'node:test';
import assert from 'node:assert/strict';
import { createSteering } from '../src/steering.ts';

function advance(
  steering: ReturnType<typeof createSteering>,
  seconds: number,
  canControl = true,
) {
  for (let i = 0; i < seconds * 60; i++) steering.update(1 / 60, canControl);
}

test('holding Space builds speed and releasing returns to cruise', () => {
  const steering = createSteering();
  steering.press('Space');
  advance(steering, 2);
  assert.ok(Math.abs(steering.speedKmh - 50) < 1e-8);
  assert.ok(steering.distance > 0);
  advance(steering, 4);
  assert.equal(steering.speedKmh, 80);
  steering.release('Space');
  advance(steering, 4);
  assert.ok(steering.speed >= 1 && steering.speed < 1.01);
});

test('crashes disable acceleration and steering; blur clears held throttle', () => {
  const steering = createSteering();
  steering.press('Space');
  steering.press('ArrowRight');
  advance(steering, 1);
  const x = steering.x;
  advance(steering, 2, false);
  assert.equal(steering.x, x);
  assert.ok(steering.speed < 1.01);
  steering.clear();
  advance(steering, 1);
  assert.equal(steering.speed, 1);
  assert.equal(steering.x, x);
});

test('acceleration starts at 30 km/h and is independent of frame rate', () => {
  const fine = createSteering(),
    coarse = createSteering();
  assert.equal(fine.speedKmh, 30);
  for (const steering of [fine, coarse]) steering.press('Space');
  advance(fine, 3);
  for (let i = 0; i < 30; i++) coarse.update(0.1);
  assert.ok(Math.abs(fine.speedKmh - 60) < 1e-8);
  assert.ok(Math.abs(fine.speedKmh - coarse.speedKmh) < 1e-8);
});
