export interface Bike {
  id: string | number;
  x: number;
  z: number;
  speed: number;
  mass: number;
  yaw: number;
  roll?: number;
}
interface CollisionState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  cooldown: number;
  crash: {
    start: number;
    roadTravel: number;
    x: number;
    z: number;
    side: number;
    vx: number;
    vz: number;
    yaw: number;
  } | null;
  bump: { start: number; side: number } | null;
}

// Positions are camera-relative; subtract road scrolling before comparing momentum.
export function createCollisions(baseRoadSpeed: number) {
  const states = new Map<Bike['id'], CollisionState>();
  let previousTime: number | undefined;
  let clock = 0;
  let impacts = 0;
  let roadTravel = 0;
  function reset() {
    states.clear();
    previousTime = undefined;
    clock = 0;
    impacts = 0;
    roadTravel = 0;
  }
  function update<T extends Bike>(
    time: number,
    bikes: T[],
    roadSpeed = baseRoadSpeed,
  ) {
    const elapsed =
      previousTime === undefined ? 0 : (time - previousTime + 180) % 180;
    previousTime = time;
    if (elapsed > 0.2) {
      reset();
      previousTime = time;
    }
    const dt = elapsed <= 0.2 ? elapsed : 0;
    clock += dt;
    roadTravel += roadSpeed * dt;
    for (const bike of bikes) {
      let state = states.get(bike.id)!;
      if (!state) {
        state = {
          x: bike.x,
          z: bike.z,
          vx: 0,
          vz: bike.speed,
          cooldown: clock + 0.3,
          crash: null,
          bump: null,
        };
        states.set(bike.id, state);
      }
      const wrapped = Math.abs(bike.z - state.z) > 40;
      state.vx = dt && !wrapped ? (bike.x - state.x) / dt : 0;
      state.vz =
        dt && !wrapped ? (bike.z - state.z) / dt - roadSpeed : bike.speed;
      if (wrapped) state.cooldown = clock + 0.3;
      state.x = bike.x;
      state.z = bike.z;
    }
    if (dt)
      for (let i = 0; i < bikes.length; i++)
        for (let j = i + 1; j < bikes.length; j++) {
          const a = bikes[i],
            b = bikes[j],
            sa = states.get(a.id)!,
            sb = states.get(b.id)!;
          if (a.id !== 'player' && b.id !== 'player') continue;
          if (
            sa.crash ||
            sb.crash ||
            clock < sa.cooldown ||
            clock < sb.cooldown
          )
            continue;
          // Sweep the relative motion so a fast oncoming bike cannot skip contact.
          const dx = (a.x - b.x) / 0.78,
            dz = (a.z - b.z) / 1.75;
          const vx = ((sa.vx - sb.vx) * dt) / 0.78,
            vz = ((sa.vz - sb.vz) * dt) / 1.75;
          const length = vx * vx + vz * vz;
          const back = length
            ? Math.max(0, Math.min(1, (dx * vx + dz * vz) / length))
            : 0;
          if ((dx - vx * back) ** 2 + (dz - vz * back) ** 2 > 1) continue;
          const relativeSpeed = Math.hypot(sa.vx - sb.vx, sa.vz - sb.vz);
          if (relativeSpeed < 0.6) continue;
          const forceA = a.mass * Math.hypot(sa.vx, sa.vz);
          const forceB = b.mass * Math.hypot(sb.vx, sb.vz);
          const loser = forceA <= forceB ? a : b;
          const player = a.id === 'player' ? a : b;
          states.get(player.id)!.bump = {
            start: clock,
            side: player === a ? -1 : 1,
          };
          const affected = loser === player ? [] : [loser];
          for (const bike of affected) {
            const other = bike === a ? b : a;
            const state = states.get(bike.id)!;
            const speed = Math.max(0.5, Math.hypot(state.vx, state.vz));
            const side = Math.sign(bike.x - other.x) || (bike === a ? -1 : 1);
            state.crash = {
              start: clock,
              roadTravel,
              x: bike.x,
              z: bike.z,
              side,
              vx: (-state.vx / speed) * 7 + side * 2,
              vz: (-state.vz / speed) * Math.min(12, 6 + relativeSpeed * 0.5),
              yaw: bike.yaw,
            };
          }
          sa.cooldown = sb.cooldown = clock + 1.2;
          impacts++;
        }
    return bikes.map((bike) => {
      const state = states.get(bike.id)!;
      const crash = state.crash;
      if (!crash) {
        const age = state.bump ? clock - state.bump.start : 1;
        const envelope = Math.max(0, 1 - age / 0.6);
        const wobble = state.bump
          ? Math.sin(age * 28) * envelope * state.bump.side
          : 0;
        if (age >= 0.6) state.bump = null;
        return {
          ...bike,
          crashed: false,
          roll: (bike.roll || 0) + wobble * 0.065,
          pitch: wobble * 0.025,
          y: 0.014 + Math.abs(wobble) * 0.025,
          shock: wobble * 0.045,
        };
      }
      const age = clock - crash.start;
      const skid = Math.min(2, Math.max(0, age - 0.16));
      const distance = (1 - Math.exp(-skid * 1.8)) / 1.8;
      const fall = Math.max(0, Math.min(1, (age - 0.35) / 0.65));
      const smooth = fall * fall * (3 - 2 * fall);
      const x = Math.max(-5.3, Math.min(5.3, crash.x + crash.vx * distance));
      // Once the skid ends, only road scrolling moves the fallen bike on screen.
      const z = crash.z + roadTravel - crash.roadTravel + crash.vz * distance;
      return {
        ...bike,
        crashed: true,
        x,
        z,
        shock: Math.sin(age * 45) * Math.exp(-age * 5) * 0.25,
        y: 0.014 + 0.35 * smooth,
        yaw:
          crash.yaw +
          crash.side *
            (Math.sin(age * 24) * 0.22 * Math.exp(-age * 3) + smooth * 0.55),
        roll:
          crash.side * smooth * 1.48 +
          Math.sin(age * 35) * 0.16 * Math.exp(-age * 4),
        pitch: -0.13 * Math.sin(Math.min(1, age / 0.2) * Math.PI),
      };
    });
  }
  return {
    update,
    reset,
    isCrashed: (id: Bike['id']) => Boolean(states.get(id)?.crash),
    getStats: () => ({
      impacts,
      fallen: [...states.values()].filter((s) => s.crash).length,
    }),
  };
}
