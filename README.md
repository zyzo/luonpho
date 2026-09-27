# Lượn Phố

A stylized, third-person motorcycle ride through a busy Vietnamese street. Built with Three.js, TypeScript, and Web Audio. The full scene repeats every 180 seconds.

## Run

```sh
npm install
npm run dev
```

Open the local URL and choose **Take a ride** to enable sound. `npm run build` produces `dist/`; `npm run preview` serves the production build.

## Development checks

- `npm run typecheck` — check application, tests, and Vite configuration with strict TypeScript.
- `npm run lint` / `npm run lint:fix` — run Oxlint or apply automatic fixes.
- `npm run format` / `npm run format:check` — format with Prettier or check formatting.
- `npm test` — run the collision and steering tests through `tsx` and Node's test runner.
- `npm run check` — run type checking, linting, formatting checks, and tests.
- `npm run build` — type-check before producing the production bundle.

Vite transforms TypeScript for the browser; `tsc --noEmit` checks types without
writing another set of JavaScript files. Three.js types describe scene objects,
geometry, and materials. Oxlint checks code correctness separately from Prettier's
formatting. Generated output and bundled skills are excluded from both tools.

## Controls

- **Space** (hold) — accelerate progressively from 30 to 80 km/h in five seconds; release to coast back to 30 km/h
- **← / →** — steer
- **M** — mute/unmute
- **H** or the expand button — cinema mode; **Escape** also exits
- Timeline — scrub anywhere in the three-minute ride
- Volume slider — adjust the street mix
- Pointer — subtle camera look-around

## Scene

96 procedural shop houses with Vietnamese signs, projecting signs, striped awnings, balconies, laundry, air conditioners, water tanks, utility cables, food carts, sidewalk cafés, fruit stalls, plants, pedestrians, and dogs. 45 moving scooters, a passing van, parked scooters, and a distinct rider with a backpack. Warm sunlight, cool sky fill, procedural environment reflections, and distinct paint, steel, rubber, fabric, and window finishes give the scene depth. Materials are cached by color and finish, and geometry batches preserve shadow settings so roads receive shadows without casting them. Distance haze and material-batched geometry keep the scene lightweight. No downloaded model or texture assets are required. Interface fonts use Google Fonts, with system fallbacks.

`src/world.ts` builds the scene and computes periodic motion. `src/main.ts` owns playback and accessible controls. `src/audio.ts` is a separate synthesized soundscape, authored by a dedicated GPT-6 Astra agent. Its 205-event score repeats every three minutes with overlapping scooter/car horns, engines, spatial pass-bys, wind, street murmur, cooking, bells, and dogs. The audio is synthesized, not a field recording or intelligible Vietnamese speech. Audio starts only after a user gesture and fades out when the tab is hidden.

## Verification

- Production build succeeds.
- Desktop and narrow browser layouts visually checked.
- Ride start enables audio; seeking and automatic 03:00 → 00:00 wrapping checked in the browser.
- Browser console checked for runtime errors.
- Audio agent verified two identical 180-second event schedules, seek/disposal, and bounded concurrent voices. Offline audio rendering found no clipping or invalid samples.
