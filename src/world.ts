import * as THREE from 'three';
import { type Bike, createCollisions } from './collisions.ts';
import { DURATION, WORLD, CHUNK, SPEED } from './street/config.ts';
import { TAU, rand, pick, wrap, resetRandom } from './scene/math.ts';
import { C, clearMaterialCache } from './scene/materials.ts';
import { clearSignCache } from './scene/signs.ts';
import { box, rod } from './scene/primitives.ts';
import { setupEnvironment } from './scene/environment.ts';
import { createChunk } from './street/chunk.ts';
import { makeScooter, makeVan } from './models/vehicles.ts';
export { DURATION } from './street/config.ts';
export { makeScooter } from './models/vehicles.ts';

export function createWorld(container: HTMLElement) {
  resetRandom();
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(
    57,
    innerWidth / innerHeight,
    0.1,
    180,
  );
  const environment = setupEnvironment(scene, renderer);
  const ground = box(scene, '#858782', 0, -0.32, -60, 180, 0.1, 240);
  ground.castShadow = false;
  const chunks: THREE.Group[] = [];
  for (let i = 0; i < WORLD / CHUNK; i++) {
    const chunk = createChunk(i);
    scene.add(chunk);
    chunks.push(chunk);
  }
  const rider = makeScooter('#b64d33', '#e4b947', '#e7d8b0');
  rider.scale.setScalar(1.08);
  scene.add(rider);
  // Small luggage and helmet stripe make the followed rider easy to recognize.
  box(rider, '#587664', 0, 1.5, 0.46, 0.42, 0.52, 0.19);
  rod(rider, '#d2be8f', [-0.2, 1.73, 0.32], [-0.2, 1.21, 0.32], 0.026);
  rod(rider, '#d2be8f', [0.2, 1.73, 0.32], [0.2, 1.21, 0.32], 0.026);
  const traffic: {
    object: THREE.Group;
    lane: number;
    offset: number;
    cycles: number;
    span: number;
    oncoming: boolean;
    phase: number;
  }[] = [];
  for (let i = 0; i < 45; i++) {
    const oncoming = i % 4 === 0;
    const bike = makeScooter(
      pick([C.red, C.blue, C.cream, C.green, '#59555c', '#bf9c62']),
      pick([C.white, C.blue, C.red, C.green, '#dda14a', '#8c7886']),
      pick([C.white, C.red, C.blue, C.yellow]),
      i % 7 === 0,
    );
    const lane = oncoming ? -3.1 - (i % 3) * 0.7 : 1.2 + (i % 3) * 1.5;
    const span = 160;
    const cycles = oncoming ? 9 : pick([2, 3, 4]);
    if (i % 8 === 0) {
      box(bike, '#ae8657', 0, 1.37, 0.9, 0.83, 0.64, 0.58);
      box(bike, C.cream, 0, 1.7, 0.9, 0.86, 0.04, 0.6);
      rod(bike, C.dark, [-0.25, 1.72, 0.63], [-0.25, 1.72, 1.2], 0.025);
    }
    bike.rotation.y = oncoming ? Math.PI : 0;
    scene.add(bike);
    traffic.push({
      object: bike,
      lane,
      offset: (-i * span) / 45,
      cycles,
      span,
      oncoming,
      phase: rand() * TAU,
    });
  }
  const van = makeVan();
  scene.add(van);
  // Distant roof silhouettes keep the vanishing point embedded in the city.
  for (let i = 0; i < 18; i++)
    box(
      scene,
      pick(['#a9bfb5', '#b6c6b9', '#b1bbb0']),
      (i - 9) * 9,
      8 + rand() * 8,
      -140,
      7,
      16 + rand() * 16,
      10,
    );
  const collisions = createCollisions(SPEED);
  let lookX = 0,
    lookY = 0;
  const pointer = { x: 0, y: 0 };
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  function render(
    time: number,
    started = false,
    dt = 1 / 60,
    steering: { x: number; lean: number; distance?: number; speed?: number } = {
      x: 1.15,
      lean: 0,
    },
  ) {
    const t = wrap(time, DURATION),
      phase = (t / DURATION) * TAU,
      extraTravel = (steering.distance || 0) * SPEED,
      travel = t * SPEED + extraTravel;
    const roadSpeed = SPEED * (steering.speed || 1);
    chunks.forEach((g, i) => {
      g.position.z = wrap(i * CHUNK + travel + 40, WORLD) - WORLD + 40;
    });
    const riderX = steering.x;
    const bikes: (Bike & { object: THREE.Group })[] = [
      {
        id: 'player',
        object: rider,
        x: riderX,
        z: 3,
        yaw: -steering.lean * 0.1,
        roll: -steering.lean * 0.14,
        speed: -roadSpeed,
        mass: 190,
      },
    ];
    traffic.forEach((car, i) => {
      const z =
        wrap(
          car.offset +
            (t / DURATION) * car.span * car.cycles +
            extraTravel +
            20,
          car.span,
        ) -
        car.span +
        20;
      let x = car.lane + Math.sin(phase * car.cycles + car.phase) * 0.3;
      const clearance = Math.exp(-Math.pow((z - 3) / 5, 2));
      if (!car.oncoming && car.lane < 2) x += clearance * 1.3;
      bikes.push({
        id: i,
        object: car.object,
        x,
        z,
        yaw: car.oncoming ? Math.PI : 0,
        roll: Math.cos(phase * car.cycles + car.phase) * 0.018,
        speed: (car.span * car.cycles) / DURATION - SPEED,
        mass: 170 + (i % 7 === 0 ? 60 : 0) + (i % 8 === 0 ? 25 : 0),
      });
    });
    const poses = collisions.update(t, bikes, roadSpeed);
    const playerPose = poses[0];
    for (const bike of poses) {
      bike.object.position.set(bike.x, bike.y, bike.z);
      bike.object.rotation.set(bike.pitch, bike.yaw, bike.roll);
    }
    van.position.set(
      -3.7,
      0,
      wrap(-60 + (t / DURATION) * 540 + extraTravel, 180) - 145,
    );
    van.rotation.y = Math.PI;
    lookX += (pointer.x - lookX) * Math.min(1, dt * 2);
    lookY += (pointer.y - lookY) * Math.min(1, dt * 2);
    const mobile = innerWidth < 700;
    camera.position.set(
      playerPose.x + playerPose.shock + (started ? -0.15 : -2.1) + lookX * 0.6,
      (mobile ? 5.2 : 4.6) + lookY * 0.25 + playerPose.shock * 0.5,
      playerPose.z + (started ? 11 : 12),
    );
    camera.lookAt(
      playerPose.x + (started ? 0 : 2.8) + lookX * 1.6,
      1.8 + lookY * 0.5,
      playerPose.z - 22,
    );
    renderer.render(scene, camera);
  }
  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const usedMaterials = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      meshMaterials.forEach((material) => usedMaterials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    usedMaterials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial)
        material.map?.dispose();
      material.dispose();
    });
    environment.dispose();
    clearMaterialCache();
    clearSignCache();
    renderer.dispose();
    renderer.domElement.remove();
  }
  return {
    render,
    resize,
    dispose,
    pointer,
    renderer,
    scene,
    camera,
    isPlayerCrashed: () => collisions.isCrashed('player'),
    resetCollisions: collisions.reset,
    getStats: () => ({
      ...collisions.getStats(),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    }),
  };
}
