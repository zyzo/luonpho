import * as THREE from 'three';
import { box } from './primitives.ts';
import { C } from './materials.ts';

const signCache = new Map<string, THREE.MeshStandardMaterial>();
function signMaterial(
  title: string,
  subtitle: string,
  bg: string,
  fg: string,
  vertical = false,
) {
  const key = [title, subtitle, bg, fg, vertical].join('|');
  if (signCache.has(key)) return signCache.get(key)!;
  const canvas = document.createElement('canvas');
  canvas.width = vertical ? 256 : 1024;
  canvas.height = vertical ? 768 : 320;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  if (vertical) {
    const words = title.split(' ');
    ctx.font = '900 70px Arial';
    words.forEach((s, i) => ctx.fillText(s, 128, 130 + i * 130, 225));
    ctx.font = '22px Arial';
    ctx.fillText(subtitle, 128, 690, 210);
  } else {
    ctx.font = '500 24px Arial';
    ctx.fillText('ĐẶC SẢN SÀI GÒN  •  TỪ 1998', 512, 53, 940);
    ctx.font = '900 115px Arial';
    ctx.fillText(title, 512, 158, 945);
    ctx.font = '500 31px Arial';
    ctx.fillText(subtitle, 512, 263, 930);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  signCache.set(key, material);
  return material;
}
export function sign(
  p: THREE.Object3D,
  title: string,
  subtitle: string,
  bg: string,
  fg: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  ry = 0,
  vertical = false,
) {
  box(p, C.dark, x, y, z, w + 0.1, h + 0.1, 0.15, 0, ry);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    signMaterial(title, subtitle, bg, fg, vertical),
  );
  plane.position.set(x - Math.sin(ry) * 0.09, y, z - Math.cos(ry) * 0.09);
  plane.rotation.y = ry + Math.PI;
  p.add(plane);
  if (vertical) {
    const back = plane.clone();
    back.position.set(x + Math.sin(ry) * 0.09, y, z + Math.cos(ry) * 0.09);
    back.rotation.y = ry;
    p.add(back);
  }
  return plane;
}

export function clearSignCache() {
  signCache.clear();
}
