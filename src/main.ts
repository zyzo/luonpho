declare global {
  interface Window {
    __ride?: {
      readonly time: number;
      readonly soundOn: boolean;
      getStats: ReturnType<typeof createWorld>['getStats'];
      readonly steering: {
        x: number;
        lean: number;
        speed: number;
        speedKmh: number;
      };
      seek(value: number): void;
      renderAt(value: number): void;
      audio: StreetAudio;
    };
  }
}
import './style.css';
import { createWorld, DURATION } from './world.ts';
import { StreetAudio } from './audio.ts';
import { createSteering } from './steering.ts';

const steering = createSteering();

function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}
function getVolumeInput(): HTMLInputElement {
  const element = $('volume');
  if (!(element instanceof HTMLInputElement))
    throw new Error('Missing volume input');
  return element;
}
const volume = getVolumeInput();
const audio = new StreetAudio();
const speedValue = $('speed-value');
const speedGauge = $('speed-gauge');
const speedNeedle = $('speed-needle');
let world: ReturnType<typeof createWorld>;
let time = 0;
let started = false;
let soundOn = false;
let previous = performance.now();
let cinema = false;
function setSoundUi() {
  $('sound-label').textContent = soundOn ? 'Sound on' : 'Sound off';
  $('sound').setAttribute(
    'aria-label',
    soundOn ? 'Mute street sound' : 'Turn street sound on',
  );
  $('sound').setAttribute('aria-pressed', String(soundOn));
  $('sound-waves').setAttribute(
    'd',
    soundOn ? 'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14' : 'm16 9 6 6m0-6-6 6',
  );
}
async function enableSound() {
  try {
    const result = await audio.start();
    if (result === false) throw new Error('Audio unavailable');
    audio.setMuted(false);
    audio.setVolume(Number(volume.value));
    audio.setHidden(document.hidden);
    soundOn = true;
  } catch (error) {
    console.warn('Street audio could not start:', error);
    soundOn = false;
  }
  setSoundUi();
}
async function start() {
  world.resetCollisions();
  steering.clear();
  steering.distance = 0;
  time = 0;
  started = true;
  document.body.classList.add('riding');
  $('intro').inert = true;
  $('intro').setAttribute('aria-hidden', 'true');
  $('sound').focus({ preventScroll: true });
  await enableSound();
}
async function toggleSound() {
  if (soundOn) {
    soundOn = false;
    audio.setMuted(true);
    setSoundUi();
  } else await enableSound();
}
function toggleCinema() {
  cinema = !cinema;
  document.body.classList.toggle('cinema', cinema);
  $('cinema').setAttribute('aria-pressed', String(cinema));
}
$('start').addEventListener('click', start);
$('sound').addEventListener('click', toggleSound);
$('volume').addEventListener('input', () =>
  audio.setVolume(Number(volume.value)),
);
$('cinema').addEventListener('click', toggleCinema);
addEventListener('keydown', (event) => {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable)
  )
    return;
  if (
    event.code === 'ArrowLeft' ||
    event.code === 'ArrowRight' ||
    (event.code === 'Space' && started)
  ) {
    event.preventDefault();
    steering.press(event.code);
    return;
  }
  if (event.key.toLowerCase() === 'm') toggleSound();
  if (event.key.toLowerCase() === 'h' || (event.key === 'Escape' && cinema))
    toggleCinema();
});
addEventListener('keyup', (event) => {
  if (
    event.code === 'Space' &&
    started &&
    !(event.target instanceof HTMLInputElement) &&
    !(event.target instanceof HTMLTextAreaElement) &&
    !(event.target instanceof HTMLElement && event.target.isContentEditable)
  )
    event.preventDefault();
  steering.release(event.code);
});
addEventListener('blur', () => steering.clear());
addEventListener('pointermove', (event) => {
  if (!world) return;
  world.pointer.x = (event.clientX / innerWidth - 0.5) * 2;
  world.pointer.y = -(event.clientY / innerHeight - 0.5) * 2;
});
addEventListener('pointerout', (event) => {
  if (!event.relatedTarget && world) {
    world.pointer.x = 0;
    world.pointer.y = 0;
  }
});
addEventListener('resize', () => world?.resize());
document.addEventListener('visibilitychange', () => {
  previous = performance.now();
  steering.clear();
  audio.setHidden(document.hidden);
});
try {
  world = createWorld($('scene'));
  world.renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    audio.setMuted(true);
    $('error').hidden = false;
    $('error').textContent =
      'The graphics connection was interrupted. Reload to hop back on.';
  });
  function frame(now: number) {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    if (!document.hidden && !world.renderer.getContext().isContextLost()) {
      time = (time + dt) % DURATION;
      steering.update(dt, started && !world.isPlayerCrashed());
      world.render(time, started, dt, steering);
      speedValue.textContent = String(Math.round(steering.speedKmh)).padStart(
        3,
        '0',
      );
      speedGauge.setAttribute(
        'aria-valuenow',
        String(Math.round(steering.speedKmh)),
      );
      speedNeedle.setAttribute(
        'transform',
        `rotate(${-220 + (steering.speedKmh * 260) / 120} 120 120)`,
      );
      if (soundOn)
        audio.update(
          time,
          1 + (steering.speedKmh - 30) / 50,
          0.88 + 0.12 * Math.sin((time / DURATION) * Math.PI * 12),
        );
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Read-only scene diagnostics and deterministic seeking support visual verification.
  if (import.meta.env.DEV)
    window.__ride = {
      get time() {
        return time;
      },
      get soundOn() {
        return soundOn;
      },
      getStats: world.getStats,
      get steering() {
        return {
          x: steering.x,
          lean: steering.lean,
          speed: steering.speed,
          speedKmh: steering.speedKmh,
        };
      },
      seek(value: number) {
        time = ((value % DURATION) + DURATION) % DURATION;
        world.render(time, started, 1, steering);
      },
      renderAt(value: number) {
        world.render(value, started, 1, steering);
      },
      audio,
    };
} catch (error) {
  console.error(error);
  $('error').hidden = false;
  $('error').textContent =
    'This ride needs a browser with WebGL enabled. Please enable hardware acceleration and reload.';
}
addEventListener('pagehide', () => audio.dispose(), { once: true });
