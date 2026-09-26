# Lượn Phố

A stylized, third-person motorcycle ride through a busy Vietnamese street. Built with Three.js, vanilla JavaScript, and Web Audio. The full scene repeats every 180 seconds.

## Run

```sh
npm install
npm run dev
```

Open the local URL and choose **Take a ride** to enable sound. `npm run build` produces `dist/`; `npm run preview` serves the production build.

## Controls

- **Space** — pause/resume
- **M** — mute/unmute
- **H** or the expand button — cinema mode; **Escape** also exits
- Timeline — scrub anywhere in the three-minute ride
- Volume slider — adjust the street mix
- Pointer — subtle camera look-around

## Scene

96 procedural shop houses with Vietnamese signs, projecting signs, striped awnings, balconies, laundry, air conditioners, water tanks, utility cables, food carts, sidewalk cafés, fruit stalls, plants, pedestrians, and dogs. 45 moving scooters, a passing van, parked scooters, and a distinct rider with a backpack. Warm sunlight, cool sky fill, procedural environment reflections, and distinct paint, steel, rubber, fabric, and window finishes give the scene depth. Materials are cached by color and finish, and geometry batches preserve shadow settings so roads receive shadows without casting them. Distance haze and material-batched geometry keep the scene lightweight. No downloaded model or texture assets are required. Interface fonts use Google Fonts, with system fallbacks.

`src/world.js` builds the scene and computes periodic motion. `src/main.js` owns playback and accessible controls. `src/audio.js` is a separate synthesized soundscape, authored by a dedicated GPT-6 Astra agent. Its 205-event score repeats every three minutes with overlapping scooter/car horns, engines, spatial pass-bys, wind, street murmur, cooking, bells, and dogs. The audio is synthesized, not a field recording or intelligible Vietnamese speech. Audio starts only after a user gesture and fades out on pause or a hidden tab.

## Verification

- Production build succeeds.
- Desktop and narrow browser layouts visually checked.
- Ride start enables audio; pause, seeking, and automatic 03:00 → 00:00 wrapping checked in the browser.
- Browser console checked for runtime errors.
- Audio agent verified two identical 180-second event schedules, pause/seek/disposal, and bounded concurrent voices. Offline audio rendering found no clipping or invalid samples.
