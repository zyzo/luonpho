import { resolveContact } from './contact.ts';
export interface Bike {
  id: string | number;
  x: number;
  z: number;
  speed: number;
  mass: number;
  yaw: number;
  roll?: number;
  halfWidth?: number;
  halfLength?: number;
  solid?: boolean;
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
  let playerOffset = { x: 0, z: 0 };
  let previousPoses = new Map<Bike['id'], Bike>();
  function reset() {
    states.clear();
    previousPoses.clear();
    playerOffset = { x: 0, z: 0 };
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
    const requestedPlayer = bikes.find((bike) => bike.id === 'player');
    const requested = requestedPlayer
      ? { x: requestedPlayer.x, z: requestedPlayer.z }
      : undefined;
    bikes = bikes.map((bike) =>
      bike.id === 'player'
        ? {
            ...bike,
            x: Math.max(-5.1, Math.min(5.1, bike.x + playerOffset.x)),
            z: bike.z + playerOffset.z,
          }
        : bike,
    );
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
          const oldA = previousPoses.get(a.id) ?? a;
          const oldB = previousPoses.get(b.id) ?? b;
          const contact = resolveContact(oldA, a, oldB, b);
          if (contact.x === a.x && contact.z === a.z) continue;
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
          const affected = loser === player || loser.solid ? [] : [loser];
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
    const poses = bikes.map((bike) => {
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
          roll: (bike.roll || 0) + wobble * 0.22,
          pitch: wobble * 0.1,
          y: 0.014 + Math.abs(wobble) * 0.025,
          shock: wobble * 0.18,
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
    const player = poses.find((bike) => bike.id === 'player');
    if (player && requested) {
      const previous = previousPoses.get('player') ?? player;
      let contact = false;
      // Revisit contacts after each correction so adjacent vehicles remain solid.
      for (let pass = 0; pass < 4; pass++) {
        for (const obstacle of poses) {
          if (obstacle === player) continue;
          const old = previousPoses.get(obstacle.id) ?? obstacle;
          const before = Math.abs(old.z - obstacle.z) > 40 ? obstacle : old;
          const resolved = resolveContact(
            pass === 0 ? previous : player,
            player,
            pass === 0 ? before : obstacle,
            obstacle,
          );
          if (resolved.x !== player.x || resolved.z !== player.z) {
            contact = true;
            player.x = resolved.x;
            player.z = resolved.z;
          }
        }
      }
      if (contact && dt) {
        const state = states.get('player')!;
        if (!state.bump) {
          state.bump = {
            start: clock,
            side: Math.sign(player.x - requested.x) || 1,
          };
        }
      }
      playerOffset = { x: player.x - requested.x, z: player.z - requested.z };
    }
    previousPoses = new Map(poses.map((pose) => [pose.id, { ...pose }]));
    return poses;
  }
  return {
    update,
    reset,
    rebasePlayer(z: number) {
      playerOffset = { x: 0, z: playerOffset.z - z };
      for (const state of states.values()) {
        state.z -= z;
        if (state.crash) state.crash.z -= z;
      }
      for (const pose of previousPoses.values()) pose.z -= z;
    },
    isCrashed: (id: Bike['id']) => Boolean(states.get(id)?.crash),
    getStats: () => ({
      impacts,
      fallen: [...states.values()].filter((s) => s.crash).length,
    }),
  };
}
