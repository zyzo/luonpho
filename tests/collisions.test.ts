import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisions } from '../src/collisions.ts';

function scenario() {
  const collisions = createCollisions(5);
  const bikes = (time: number) => [
    { id: 'npc', x: 0, z: 0, speed: -5, mass: 100, yaw: 0 },
    {
      id: 'player',
      x: 0,
      z: -6 + time * 10,
      speed: 5,
      mass: 200,
      yaw: Math.PI,
    },
  ];
  let result!: ReturnType<ReturnType<typeof createCollisions>['update']>;
  for (let i = 0; i <= 50; i++)
    result = collisions.update(i / 100, bikes(i / 100));
  return { collisions, bikes, result };
}
test('lower momentum bike startles while stronger bike keeps riding', () => {
  const { collisions, result } = scenario();
  assert.equal(collisions.getStats().impacts, 1);
  assert.equal(result[0].crashed, true);
  assert.equal(result[1].crashed, false);
  assert.notEqual(result[0].roll, 0);
});
test('loser skids opposite its road velocity, falls, and stays down', () => {
  const { collisions, bikes } = scenario();
  let result!: ReturnType<ReturnType<typeof createCollisions>['update']>;
  for (let i = 51; i <= 170; i++)
    result = collisions.update(i / 100, bikes(i / 100));
  assert.ok(result[0].z > 5 * (1.7 - 0.43));
  assert.ok(Math.abs(result[0].roll) > 1.4);
  for (let i = 171; i <= 510; i++)
    result = collisions.update(i / 100, bikes(i / 100));
  assert.equal(result[0].crashed, true);
  assert.ok(Math.abs(result[0].roll) > 1.4);
});
test('pause freezes collision animation and seeking resets it', () => {
  const { collisions, bikes, result } = scenario();
  assert.deepEqual(collisions.update(0.5, bikes(0.5)), result);
  assert.equal(collisions.update(30, bikes(30))[0].crashed, false);
});
test('parallel bikes and wrapping traffic do not cause false impacts', () => {
  const collisions = createCollisions(5);
  for (let i = 0; i < 100; i++) {
    collisions.update(i / 100, [
      { id: 'player', x: 0, z: 0, mass: 100, speed: -5, yaw: 0 },
      { id: 1, x: 0, z: i < 50 ? 0 : -140, mass: 200, speed: -5, yaw: 0 },
    ]);
  }
  assert.equal(collisions.getStats().impacts, 0);
});

test('fallen bike stays at its road location despite acceleration and route wrapping', () => {
  const { collisions, bikes } = scenario();
  let result!: ReturnType<ReturnType<typeof createCollisions>['update']>;
  for (let i = 51; i <= 300; i++)
    result = collisions.update(i / 100, bikes(i / 100));
  const settled = result[0];
  let scroll = 0;
  // Continue beyond the old recovery time and a complete scene loop.
  for (let i = 301; i <= 18500; i++) {
    const speed = i < 600 ? 10 : 5;
    scroll += speed / 100;
    const routed = bikes(i / 100).map((bike) => ({
      ...bike,
      x: 4,
      z: (bike.z % 160) - 80,
    }));
    result = collisions.update((i / 100) % 180, routed, speed);
    assert.equal(result[0].crashed, true);
    assert.equal(result[0].x, settled.x);
    assert.ok(Math.abs(result[0].z - settled.z - scroll) < 1e-6);
  }
  assert.ok(Math.abs(result[0].roll) > 1.4);
  collisions.reset();
  assert.equal(collisions.update(0, bikes(0))[0].crashed, false);
});

test('NPC pairs do not trigger collisions', () => {
  const collisions = createCollisions(5);
  for (let i = 0; i <= 100; i++)
    collisions.update(i / 100, [
      { id: 0, x: 0, z: 0, speed: -5, mass: 100, yaw: 0 },
      { id: 1, x: 0, z: -6 + i / 10, speed: 5, mass: 200, yaw: Math.PI },
    ]);
  assert.equal(collisions.getStats().impacts, 0);
});

for (const mass of [50, 300])
  test(`player with mass ${mass} keeps riding after a brief bump`, () => {
    const collisions = createCollisions(5);
    const bikes = (time: number) => [
      { id: 'player', x: 0, z: 0, speed: -5, mass, yaw: 0 },
      { id: 1, x: 0, z: -6 + time * 10, speed: 5, mass: 100, yaw: Math.PI },
    ];
    let result!: ReturnType<ReturnType<typeof createCollisions>['update']>;
    for (let i = 0; i <= 60; i++)
      result = collisions.update(i / 100, bikes(i / 100));
    assert.equal(collisions.getStats().impacts, 1);
    assert.equal(result[0].crashed, false);
    assert.equal(result[1].crashed, mass > 100);
    assert.equal(result[0].x, 0);
    assert.equal(result[0].z, 0);
    assert.ok(Math.abs(result[0].roll) < 0.07);
    assert.notEqual(result[0].shock, 0);
    assert.equal(collisions.isCrashed('player'), false);
    for (let i = 61; i <= 150; i++)
      result = collisions.update(i / 100, bikes(i / 100));
    assert.equal(result[0].shock, 0);
    assert.equal(result[0].roll, 0);
    const steered = bikes(1.51);
    steered[0].x = 0.1;
    result = collisions.update(1.51, steered);
    assert.equal(result[0].x, 0.1);
  });
