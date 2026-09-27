import * as THREE from 'three';

function createEnvironment(renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#8baebf');
  sky.addColorStop(0.45, '#d9e4df');
  sky.addColorStop(0.55, '#c9bd9f');
  sky.addColorStop(1, '#655e4e');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromEquirectangular(texture);
  texture.dispose();
  generator.dispose();
  return environment;
}

export function setupEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
) {
  scene.background = new THREE.Color('#d4dfd5');
  scene.fog = new THREE.Fog('#d4dfd5', 37, 125);
  const environment = createEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight('#dceaf0', '#ad9879', 1.35));
  const sun = new THREE.DirectionalLight('#fff0d8', 3.1);
  sun.position.set(-19, 29, -22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -29,
    right: 29,
    top: 40,
    bottom: -40,
    near: 1,
    far: 100,
  });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.035;
  sun.target.position.set(0, 0, -18);
  scene.add(sun, sun.target);
  return environment;
}
