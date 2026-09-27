import * as THREE from 'three';

const materials = new Map<string, THREE.MeshStandardMaterial>();
const finishes = {
  plaster: { roughness: 0.9 },
  paint: { roughness: 0.3, metalness: 0.05 },
  steel: { roughness: 0.36, metalness: 0.85 },
  rubber: { roughness: 0.96 },
  fabric: { roughness: 1 },
  // Opaque tinted windows keep reflections without a transmission render pass.
  glass: { roughness: 0.16, metalness: 0, envMapIntensity: 1.3 },
};
function mat(color: string, finish: keyof typeof finishes = 'plaster') {
  const key = `${finish}:${color}`;
  if (!materials.has(key)) {
    materials.set(
      key,
      new THREE.MeshStandardMaterial({ color, ...finishes[finish] }),
    );
  }
  return materials.get(key)!;
}

const C = {
  cream: '#e7d7b0',
  dark: '#293c3a',
  steel: '#647577',
  red: '#c34832',
  yellow: '#e5b84d',
  green: '#477862',
  blue: '#658b9a',
  tire: '#28302d',
  skin: '#bf8c63',
  leaf: '#568051',
  white: '#f1e9cf',
};

export { mat, C };
export function clearMaterialCache() {
  materials.clear();
}
