export interface Body {
  x: number;
  z: number;
  halfWidth?: number;
  halfLength?: number;
}

// Sweep a point against the combined footprints (Minkowski sum).
export function resolveContact(
  previous: Body,
  target: Body,
  before: Body,
  obstacle: Body,
) {
  const width = (target.halfWidth ?? 0.58) + (obstacle.halfWidth ?? 0.58);
  const length = (target.halfLength ?? 1.12) + (obstacle.halfLength ?? 1.12);
  const start = [previous.x - before.x, previous.z - before.z];
  const end = [target.x - obstacle.x, target.z - obstacle.z];
  const size = [width, length];
  let enter = 0,
    leave = 1,
    axis = -1;
  for (let i = 0; i < 2; i++) {
    const delta = end[i] - start[i];
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(start[i]) >= size[i]) return target;
      continue;
    }
    const a = (-size[i] - start[i]) / delta;
    const b = (size[i] - start[i]) / delta;
    const near = Math.min(a, b);
    if (near >= enter) {
      enter = near;
      axis = i;
    }
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return target;
  }
  if (axis < 0) {
    if (Math.abs(end[0]) >= width || Math.abs(end[1]) >= length) return target;
    axis = width - Math.abs(end[0]) < length - Math.abs(end[1]) ? 0 : 1;
  }
  const side = Math.sign(start[axis]) || Math.sign(end[axis]) || 1;
  return {
    ...target,
    [axis === 0 ? 'x' : 'z']:
      (axis === 0 ? obstacle.x : obstacle.z) + side * (size[axis] + 0.001),
  };
}
