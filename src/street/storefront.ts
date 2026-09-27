import * as THREE from 'three';
import { box, ball, cyl, rod } from '../scene/primitives.ts';
import { mat, C } from '../scene/materials.ts';
import { rand, pick } from '../scene/math.ts';
import { sign } from '../scene/signs.ts';
import { plant, stool, person, dog, umbrella, cart } from '../models/props.ts';

const shops: [string, string, string, string][] = [
  ['CÀ PHÊ', 'CÀ PHÊ SỮA ĐÁ  •  20K', '#244e42', '#f5dfad'],
  ['PHỞ BÒ', 'PHỞ TÁI • NẠM • GẦU', '#b6422b', '#fff0b8'],
  ['BÁNH MÌ', 'NÓNG GIÒN MỖI NGÀY', '#e3b744', '#a53929'],
  ['TẠP HÓA', 'BIA • NƯỚC NGỌT • BÁNH KẸO', '#397e92', '#f3edcb'],
  ['CƠM TẤM', 'SƯỜN • BÌ • CHẢ', '#e3d4a1', '#af3627'],
  ['SỬA XE', 'HONDA • VÁ VỎ • THAY NHỚT', '#365d73', '#f2e4bd'],
  ['BÚN BÒ HUẾ', 'CÔ BA  •  KÍNH MỜI', '#b93f32', '#f6d774'],
  ['HỚT TÓC', 'THANH NAM  •  MÁY LẠNH', '#e6d9b7', '#315648'],
  ['TRÁI CÂY', 'TƯƠI NGON MỖI NGÀY', '#49734b', '#ffeaab'],
  ['NHÀ THUỐC', 'DƯỢC PHẨM • TƯ VẤN', '#e8e2c7', '#377965'],
  ['BIA HƠI', 'LAI RAI • CHUYỆN TRÒ', '#c14730', '#f3df9f'],
  ['ĐIỆN THOẠI', 'MUA BÁN • SỬA CHỮA', '#e9bc3a', '#b92f24'],
];
export function storefront(
  p: THREE.Object3D,
  side: number,
  z: number,
  index: number,
) {
  const g = new THREE.Group();
  const width = 6.25;
  const depth = 5 + rand() * 3;
  const height = 7.5 + Math.floor(rand() * 4) * 2.6;
  const wall = pick([
    '#d3bb88',
    '#c8c8ac',
    '#e4cea3',
    '#b6c7be',
    '#cba38f',
    '#90aaa4',
    '#e1d6ba',
    '#c5b47c',
  ]);
  box(g, wall, 0, height / 2, depth / 2, width, height, depth);
  box(g, '#405451', 0, 1.6, -0.04, 5.7, 2.85, 0.1);
  box(g, '#9d9177', 2.55, 1.5, -0.14, 0.36, 2.8, 0.12);
  box(g, '#b6a887', -2.64, 1.5, -0.14, 0.3, 2.8, 0.12);
  // Open shop interiors read as layered shelves behind a shaded arcade.
  for (let y = 0.65; y < 2.6; y += 0.65) {
    box(g, C.cream, 0, y, 0.08, 4.6, 0.055, 0.18);
    for (let i = 0; i < 8; i++)
      box(
        g,
        pick([C.red, C.yellow, C.green, C.blue, C.cream]),
        -2.1 + i * 0.58,
        y + 0.2,
        -0.04,
        0.27,
        0.32,
        0.18,
      );
  }
  const shop = shops[index % shops.length];
  sign(g, ...shop, 0, 3.55, -0.22, 6.04, 1.38);
  for (let level = 4.9; level < height - 0.7; level += 2.65) {
    for (const x of [-1.55, 1.45]) {
      box(g, C.cream, x, level + 0.52, -0.09, 1.7, 1.98, 0.2);
      box(g, mat('#385754', 'glass'), x, level + 0.54, -0.21, 1.43, 1.7, 0.09);
      box(g, wall, x, level + 0.53, -0.28, 0.07, 1.7, 0.05);
      box(g, C.cream, x, level + 0.5, -0.28, 1.45, 0.05, 0.05);
    }
    if (rand() > 0.28) {
      box(g, wall, 0, level - 0.43, -0.57, 5.9, 0.18, 1.35);
      rod(g, C.dark, [-2.9, level + 0.35, -1.16], [2.9, level + 0.35, -1.16]);
      for (let x = -2.8; x < 3; x += 0.34)
        rod(
          g,
          C.dark,
          [x, level - 0.35, -1.16],
          [x, level + 0.35, -1.16],
          0.019,
        );
      plant(g, -1.8, level - 0.35, -0.6, 0.85);
      if (rand() > 0.4) {
        rod(g, C.dark, [-2, level + 1, -0.8], [2.3, level + 1, -0.8], 0.015);
        for (let j = 0; j < 4; j++)
          box(
            g,
            pick([C.red, C.white, C.blue, C.yellow]),
            -0.9 + j * 0.7,
            level + 0.7,
            -0.81,
            0.45,
            0.6,
            0.04,
          );
      }
    }
    box(g, '#c3c3af', 2.43, level + 0.45, -0.36, 0.72, 0.52, 0.4);
    for (let j = 0; j < 5; j++)
      box(
        g,
        mat(C.steel, 'steel'),
        2.43,
        level + 0.28 + j * 0.07,
        -0.58,
        0.55,
        0.02,
        0.02,
      );
  }
  box(g, C.cream, 0, height + 0.1, depth / 2, width + 0.25, 0.22, depth + 0.25);
  cyl(g, mat(C.steel, 'steel'), 1.5, height + 0.85, 2, 0.65, 1.4);
  rod(g, C.dark, [-2, height, 1], [-2, height + 2.8, 1], 0.025);
  rod(g, C.dark, [-2.8, height + 2.3, 1], [-1.2, height + 2.3, 1], 0.02);
  // Striped fabric awnings project well beyond the shop line.
  for (let i = 0; i < 10; i++)
    box(
      g,
      i % 2 === 0 ? shop[2] : C.cream,
      -2.82 + i * 0.625,
      2.72,
      -1.03,
      0.63,
      0.08,
      1.95,
      -0.16,
    );
  box(g, shop[2], 0, 2.57, -1.99, 6.2, 0.25, 0.05);
  if (index % 2 === 0) {
    sign(
      g,
      shop[0],
      index % 4 ? '24/7' : 'KÍNH MỜI',
      shop[2],
      shop[3],
      -2.88,
      4.5,
      -1.15,
      1.06,
      2.8,
      Math.PI / 2,
      true,
    );
  }
  if (index % 3 === 0) {
    sign(
      g,
      index % 2 ? 'PHỞ' : 'CÀ PHÊ',
      '20K',
      shop[3],
      shop[2],
      1.8,
      1.15,
      -2.4,
      1.15,
      1.65,
      0.2,
    );
    rod(g, C.dark, [1.2, 0.2, -2.5], [1.2, 1.9, -2.4], 0.035);
  }
  if (index % 3 === 1) {
    cart(g, -1.8, -2.65, C.red);
    person(g, -1.7, -1.7, C.cream, Math.PI, false, true);
  } else if (index % 3 === 2) {
    for (let i = 0; i < 3; i++) {
      box(g, '#886b46', -1.9 + i * 1.25, 0.48, -1.2, 1.1, 0.55, 0.8);
      for (let j = 0; j < 8; j++)
        ball(
          g,
          i === 0 ? '#e7ad39' : i === 1 ? '#72904c' : '#b85b35',
          -2.3 + i * 1.25 + (j % 4) * 0.23,
          0.84,
          -1.45 + Math.floor(j / 4) * 0.32,
          0.13,
        );
    }
    person(g, 2, -1, C.blue, 0, false, true);
  } else {
    cyl(g, mat(C.steel, 'steel'), -1.2, 0.9, -2.2, 0.53, 0.08);
    cyl(g, mat(C.steel, 'steel'), -1.2, 0.55, -2.2, 0.035, 0.7);
    stool(g, -2, -2.5);
    stool(g, -0.5, -2.4, C.blue);
    person(g, -2, -2.5, C.cream, -1.4, true);
    cyl(g, C.cream, -1.2, 1.01, -2.2, 0.08, 0.15);
  }
  if (index % 4 === 0) umbrella(g, 1, -2.6, pick([C.green, C.red, C.yellow]));
  plant(g, 2.65, 0.18, -1.2, 1);
  if (index % 5 === 0) dog(g, 0.2, -3.1, 1);
  g.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
  g.position.set(side * 10, 0.18, z);
  p.add(g);
}
