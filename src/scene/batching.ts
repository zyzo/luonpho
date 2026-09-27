import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Batch before positioning the root group: transforms are baked into vertices.
export function batch(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const buckets = new Map<
    string,
    {
      material: THREE.Material | THREE.Material[];
      castShadow: boolean;
      receiveShadow: boolean;
      geometries: THREE.BufferGeometry[];
    }
  >();
  const remove: THREE.Object3D[] = [];
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.unbatch) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    // Shadow flags are part of the batch identity so roads stay receive-only.
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        material: object.material,
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow,
        geometries: [],
      });
    }
    buckets.get(key)!.geometries.push(geometry);
    remove.push(object);
  });
  remove.forEach((object) => object.removeFromParent());
  for (const {
    material,
    castShadow,
    receiveShadow,
    geometries,
  } of buckets.values()) {
    const object = new THREE.Mesh(mergeGeometries(geometries, false), material);
    object.castShadow = castShadow;
    object.receiveShadow = receiveShadow;
    group.add(object);
    geometries.forEach((geometry) => geometry.dispose());
  }
  return group;
}
