# Shape Chase Runner (prototype)

A shape-only side-scrolling runner prototype: run left to right with the player fixed at screen centre, eat food to keep stamina up, jump / double-jump / crouch past obstacles, and stay ahead of an off-screen chaser shown only as a distance bar. This is a rules prototype: no character art, no sound, no accounts, no ads, no payments.

Stack: Phaser 4.2.1 + TypeScript + Vite. Game rules live in `src/model.ts` (no Phaser dependency); `src/main.ts` draws and handles input.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm test         # model tests, no dependencies needed (Node 24)
```

`npm test` runs `node --experimental-strip-types --test tests/model.test.ts`.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Jump / double jump (press again in the air) | Space / Up | Jump button |
| Crouch (hold) | Down | Crouch button (hold) |
| Pause / resume | P / Esc | Pause button |

The game also pauses when the tab loses focus or the device rotates.

## Rules as implemented (starting values, to be tuned)

- Speeds: normal 6 m/s, exhausted 3.6 m/s, boost 7.8 m/s (x1.3). Chaser 6 m/s.
- Gap to the chaser starts at 30 m, is capped at 60 m, and caught = gap <= 0.
- Stamina 0-100, drains 8/s, food gives +25. Reaching 0 sets "exhausted" and it stays latched until a food brings stamina to 20 or more.
- Gold food: boost for 4 s, re-eating refreshes to 4 s (no stacking). Boost overrides exhausted speed, but the exhausted latch stays and applies again when boost ends.
- Obstacle hit: gap -5 m once per obstacle, then 0.9 s during which further hits are ignored. No other slow-down.
- Obstacles: block (jump), beam (crouch), tower (needs double jump).

## Scope

In: one screen, one mode, geometric shapes, hand-authored repeating course, HUD, pause, restart, local best distance.
Out: art, sound, characters and their abilities, mini-games, chaser acceleration, PWA/app packaging, any use of third-party IP.

## What was actually verified

`tests/model.test.ts` (23 tests, all passing on Node 24.15.0, driving `src/model.ts` at the same 1/120 s step as the game):

- starting state, ready phase ignores steps and input
- speed states and their priority (boost > exhausted > normal)
- stamina drain, latched exhaustion at 0, food +25 with cap 100, latch stays while stamina is 1-19
- exhausted gap shrink (2.4 m/s) and being caught after about 12.5 s from 30 m
- gold: bonus, 4 s boost, refresh without stacking, boost at stamina 0, latch after boost ends
- gap +1.8 m/s in boost, cap at 60 m
- one hit = -5 m exactly once, 0.9 s hit immunity, catching ends the run
- pause freezes distance/gap/stamina/boost/time and drops input; resume continues
- jump physics, double jump, a third press does not add a jump
- real collisions: block (walk = hit, jump = clear, too-early jump = hit), beam (stand = hit, crouch = clear, releasing crouch under a beam is safe), tower (single jump never clears, double jump clears)
- jump timing windows at the three speeds (see below)
- authored course: food before the first block, hazards at least 7 m apart
- same inputs give the same run

## Known issue found by the tests (not fixed here)

Timing windows that clear an obstacle, measured in the model:

| State | Block, single jump | Block, double jump | Tower, double jump |
|---|---|---|---|
| normal | 0.22 s | 0.73 s | 0.27 s |
| boost | 0.30 s | 0.81 s | 0.34 s |
| exhausted | 0.03 s | 0.54 s | 0.07 s |

When exhausted, a single jump over a block leaves only about 0.03 s to time it, and the tower about 0.07 s even with a double jump. That is a few frames at 60 fps, so it is close to unplayable. The chaser also closes in at 2.4 m/s in that state. A wider window needs a change to the speed, jump or obstacle size values, which is outside this test branch.

## Not verified

- Rendering, input handling, HUD and touch buttons in a real browser. No browser tool was available, so only the model was tested. `src/main.ts` is untested.
- `npm run build` and `tsc` type-check on this branch.
- Feel and difficulty with real players; the numbers above are starting guesses.
- Portrait layout and reaction time on small screens.
- Whether using Chiikawa characters in a public app is allowed; this prototype uses no such assets.
