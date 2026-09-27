const TAU = Math.PI * 2;
let seed = 92;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const wrap = (n: number, len: number) => ((n % len) + len) % len;

export function resetRandom() {
  seed = 92;
}
export { TAU, rand, pick, wrap };
