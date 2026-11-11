import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerModel, RULES, type Platform } from '../src/model.ts';

// Two-level course + variable first jump. Ground-course contracts live in model.test.ts
// (they use { platforms:false }); everything here concerns the platform layer only.
const DT = 1 / 120; // same fixed step as src/main.ts
const F = RULES.floor;
const REACH = RULES.halfHitWidth / RULES.scale; // wall stops the body centre this far before a required step
// Exactly the endurance bot's 132 seeds: 1..128 plus 13579, 99, 2026, 31337, 424242 (99 is already in 1..128).
const SEEDS = [...new Set([13579, 99, 2026, 31337, 424242, ...Array.from({ length: 128 }, (_, i) => i + 1)])];
const isFood = (k: string) => k === 'food' || k === 'gold';

// A controlled course: no generated items, one hand-placed platform.
function stage(p: Partial<Platform> & { required: boolean }, seed = 7): RunnerModel {
  const m = new RunnerModel(seed, false); m.start();
  m.platforms.push({ id: 0, start: 30, end: 50, y: F - RULES.platformHeight, ...p });
  return m;
}
function keepFed(m: RunnerModel) { m.gap = 30; m.stamina = 80; }
// Height reached by the first jump when the button is released `holdSeconds` after the press (null = never).
function apex(holdSeconds: number | null) {
  const m = new RunnerModel(1, false, { platforms: false }); m.start(); m.jump();
  let top = m.y, t = 0;
  for (let i = 0; i < 240; i++) { if (holdSeconds !== null && t >= holdSeconds) m.releaseJump(); m.step(DT); t += DT; top = Math.min(top, m.y); }
  return F - top;
}
// Whole generated course up to `metres` (items are only dropped when stepping, so nothing is lost).
function course(seed: number, metres = 3000) {
  const m = new RunnerModel(seed); m.distance = metres; (m as any).generate(); return m;
}
type Outcome = { onPlatform: boolean; blockedFrames: number; hits: number; fell: boolean; m: RunnerModel };
// Press jump when the platform start is `lead` metres ahead; hold for `holdSeconds` (null = hold forever).
function approach(lead: number, holdSeconds: number | null, mode: 'normal' | 'exhausted' = 'normal', required = true): Outcome {
  const m = stage({ required }); const p = m.platforms[0];
  let pressedAt = -1, blockedFrames = 0, fell = false, onPlatform = false;
  for (let i = 0; i < 120 * 12 && m.phase === 'running'; i++) {
    keepFed(m); m.exhausted = mode === 'exhausted';
    if (pressedAt < 0 && p.start - m.distance <= lead) { m.jump(); pressedAt = m.elapsed; }
    if (pressedAt >= 0 && holdSeconds !== null && m.elapsed - pressedAt >= holdSeconds) m.releaseJump();
    m.step(DT); if (m.blocked) blockedFrames++; if (m.rescue) fell = true;
    if (Math.abs(m.y - p.y) < .01 && m.distance >= p.start && m.distance <= p.end) { onPlatform = true; break; }
  }
  return { onPlatform, blockedFrames, hits: m.hits, fell, m };
}

// ---------------------------------------------------------------- rules contract
test('two-level rules: agreed platform and variable-jump constants', () => {
  assert.deepEqual([RULES.platformHeight, RULES.platformApproach, RULES.platformExit, RULES.platformFirstHazard, RULES.jumpReleaseVelocity],
    [110, 8, 8, 10, -500]);
  // The ground jump arc itself is unchanged.
  assert.deepEqual([RULES.jumpVelocity, RULES.gravity], [-760, 1900]);
});

test('variable jump: a tap cannot reach the platform, a hold can (heights from physics, not constants)', () => {
  const tap = apex(0), full = apex(null);
  assert.ok(tap > 50 && tap < 80, `tap apex ${tap}`);
  assert.ok(Math.abs(full - 149) < 3, `full apex ${full}`);
  assert.ok(tap < RULES.platformHeight, 'minimum tap must not climb a required platform');
  assert.ok(full > RULES.platformHeight + 20, 'full hold must clear the platform with margin');
  // Lower than the platform tops of the upper hazards is not required; only monotonic growth with hold time is.
  let prev = 0;
  for (const h of [0, .02, .05, .1, .15, .3, 1]) { const a = apex(h === 0 ? 0 : h); assert.ok(a >= prev - .01, `monotonic at ${h}`); prev = a; }
});

// ---------------------------------------------------------------- input edges
test('jump input: ground release, double release and the same-frame tap are harmless', () => {
  const m = new RunnerModel(1, false, { platforms: false }); m.start();
  m.releaseJump(); m.releaseJump(); m.step(DT);
  assert.equal(m.vy, 0); assert.equal(m.jumps, 0); assert.equal(m.y, F);
  m.jump(); m.releaseJump(); m.step(DT); // pressed and released before the step: minimum jump
  assert.equal(m.jumps, 1);
  assert.equal(m.vy > RULES.jumpReleaseVelocity - 1e-9 || m.vy === RULES.jumpReleaseVelocity + RULES.gravity * DT, true);
  for (let i = 0; i < 240; i++) m.step(DT);
  assert.equal(m.y, F);
});

test('jump input: holding never auto double-jumps; release then press gives the fixed second jump', () => {
  const m = new RunnerModel(1, false, { platforms: false }); m.start(); m.jump();
  let top = F; for (let i = 0; i < 240; i++) { m.step(DT); top = Math.min(top, m.y); assert.ok(m.jumps <= 1, 'held button must not double-jump'); }
  assert.ok(Math.abs(F - top - apex(null)) < .01);
  const d = new RunnerModel(1, false, { platforms: false }); d.start(); d.jump();
  for (let i = 0; i < 30; i++) d.step(DT);
  d.releaseJump(); d.jump(); d.step(DT);
  assert.equal(d.jumps, 2);
  assert.ok(d.vy < RULES.jumpVelocity + RULES.gravity * 2 * DT + 1, 'second jump is the fixed full-velocity jump');
  // The second jump is never cut short by a later release.
  const before = d.vy; d.releaseJump(); assert.equal(d.vy, before);
});

test('pause releases a held jump so it cannot stay stuck', () => {
  const m = new RunnerModel(1, false, { platforms: false }); m.start(); m.jump();
  for (let i = 0; i < 20; i++) m.step(DT);
  m.pause(); assert.equal(m.phase, 'paused'); m.start();
  const vy = m.vy; m.step(DT); // gravity only; no stuck-hold effect, no auto jump
  assert.ok(m.vy > vy); assert.ok(m.jumps <= 1);
});

// ---------------------------------------------------------------- generation contract
test('platforms:false keeps the pure ground course (no platforms, ever)', () => {
  for (const seed of [1, 13579, 99]) {
    const m = new RunnerModel(seed, true, { platforms: false }); m.distance = 3000; (m as any).generate();
    assert.equal(m.platforms.length, 0);
  }
  assert.ok(new RunnerModel(1).platforms.length > 0, 'platforms are on by default');
});

test('platform schedule: 80 m start, every 180 m, 12/20/36 m long, required/optional alternate (132 seeds)', () => {
  const lengths = new Set<number>();
  for (const seed of SEEDS) {
    const m = course(seed); const ps = m.platforms;
    assert.ok(ps.length >= 15, `seed ${seed}: ${ps.length} platforms`);
    ps.forEach((p, n) => {
      assert.equal(p.id, n); assert.equal(p.start, 80 + 180 * n, `seed ${seed} start`);
      assert.ok([12, 20, 36].includes(p.end - p.start), `seed ${seed} length ${p.end - p.start}`);
      assert.equal(p.y, F - RULES.platformHeight);
      assert.equal(p.required, n % 2 === 1);
      lengths.add(p.end - p.start);
      if (n) assert.ok(p.start > ps[n - 1].end + 100, 'platforms never overlap or crowd');
    });
  }
  assert.deepEqual([...lengths].sort((a, b) => a - b), [12, 20, 36], 'all three lengths occur');
});

test('platform schedule is deterministic per seed and independent of how it was generated', () => {
  const a = course(5).platforms;
  const b = new RunnerModel(5); for (let d = 0; d <= 3000; d += 25) { b.distance = d; (b as any).generate(); }
  assert.deepEqual(b.platforms, a);
});

test('ground hazards keep clear of every branch, its approach and its descent (132 seeds)', () => {
  for (const seed of SEEDS) {
    const m = course(seed);
    for (const p of m.platforms) {
      for (const i of m.items) {
        if (isFood(i.kind)) continue;
        if (i.y < F - 300 && i.kind !== 'beam') continue;
        const upper = i.x >= p.start && i.x <= p.end; // hazards generated for this platform
        if (upper) continue;
        assert.ok(i.x <= p.start - RULES.platformApproach - 3 || i.x >= p.end + RULES.platformExit + 3,
          `seed ${seed}: ${i.kind} at ${i.x.toFixed(1)} too close to platform ${p.start}-${p.end}`);
      }
    }
  }
});

test('upper hazards: none on 12 m branches (36 m gate branches use the vine instead), exactly one 10..14 m after the start on longer ones, sized from the platform floor', () => {
  let seen = { beam: 0, block: 0, long: 0 }, gates = 0;
  for (const seed of SEEDS) {
    const m = course(seed);
    for (const p of m.platforms) {
      const mine = m.items.filter(i => !isFood(i.kind) && i.x >= p.start && i.x <= p.end);
      const length = p.end - p.start;
      if (p.gateX !== undefined) { // lane-switch gate branch: fixed 36 m, the vine (start+20..24) replaces the ordinary upper hazard
        assert.equal(length, 36); assert.ok(p.gateX >= p.start + 20 && p.gateX <= p.start + 24, `gateX ${p.gateX - p.start}`); assert.equal(mine.length, 0, `seed ${seed}: gate branch ${p.id} keeps a hazard`); gates++; continue;
      }
      if (length < 20) { assert.equal(mine.length, 0, `seed ${seed}: short branch ${p.id} has a hazard`); continue; }
      assert.equal(mine.length, 1, `seed ${seed}: branch ${p.id}`);
      const h = mine[0]; assert.ok(h.x >= p.start + 10 - 1e-9 && h.x <= p.start + (length >= 36 ? 14 : 10.5) + 1e-9, `hazard at ${h.x - p.start} on a ${length} m branch`);
      assert.ok(h.x - p.start >= 8 && p.end - h.x >= 9.5 - 1e-9, 'room to land before and after the hazard');
      if (h.kind === 'block') assert.deepEqual([h.y, h.h], [p.y - 64, 64]);
      else if (h.kind === 'long') assert.deepEqual([h.y, h.h], [p.y - 46, 46]);
      else { assert.equal(h.kind, 'beam'); assert.deepEqual([h.y, h.h], [0, p.y - 44]); }
      seen[h.kind as 'beam']++;
    }
  }
  assert.ok(seen.beam > 0 && seen.block > 0 && seen.long > 0 && gates > 0, JSON.stringify({ ...seen, gates }));
});

test('branch food: one dedicated item 3..3.5 m in at 48..100 px over the platform; optional lower lane stays foodless (132 seeds)', () => {
  for (const seed of SEEDS) {
    const m = course(seed);
    for (const p of m.platforms) {
      const dedicated = m.items.find(i => isFood(i.kind) && i.x >= p.start + 3 - 1e-9 && i.x <= p.start + 3.5 + 1e-9 && i.y >= p.y - 100 - 1e-9 && i.y <= p.y - 48 + 1e-9);
      assert.ok(dedicated, `seed ${seed}: branch ${p.id} lacks its dedicated food`);
      // Nothing on the ground lane inside or just around the branch.
      for (const i of m.items) {
        if (!isFood(i.kind) || i === dedicated) continue;
        if (i.x >= p.start - 4 && i.x <= p.end + 4) {
          assert.ok(i.x >= p.start + 3 && i.x <= p.end - 3 && i.y < p.y, `seed ${seed}: ground food ${i.x.toFixed(1)} under branch ${p.start}-${p.end}`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------- climbing and the wall
test('required platform: a minimum tap never climbs, at any timing, normal or exhausted', () => {
  for (const mode of ['normal', 'exhausted'] as const) {
    let ok = 0;
    for (let lead = 0; lead <= 9; lead += .1) if (approach(lead, 0, mode).onPlatform) ok++;
    assert.equal(ok, 0, `${mode}: a tap climbed ${ok} times`);
  }
});

test('required platform: a held jump climbs over a real timing window, normal and exhausted', () => {
  for (const mode of ['normal', 'exhausted'] as const) {
    let ok = 0;
    for (let lead = 0; lead <= 9; lead += .05) { const r = approach(lead, null, mode); if (r.onPlatform) { ok++; assert.equal(r.hits, 0); assert.equal(r.fell, false); } }
    assert.ok(ok >= 8, `${mode}: only ${ok} of 180 leads climb (~${(ok * .05 / (mode === 'normal' ? 6 : 4.2)).toFixed(2)} s)`);
  }
});

test('required platform: a missed jump is blocked at the foot, and can be retried from there', () => {
  const m = stage({ required: true }), p = m.platforms[0];
  for (let i = 0; i < 120 * 7; i++) { keepFed(m); m.step(DT); }
  assert.ok(m.blocked); assert.ok(m.distance <= p.start - REACH + 1e-9, `stopped at ${m.distance}`);
  assert.equal(m.hits, 0, 'a wall stop is not an obstacle hit'); assert.equal(m.rescue, null);
  assert.equal(m.phase, 'running'); assert.equal(m.y, F);
  m.jump(); for (let i = 0; i < 120 * 2; i++) { keepFed(m); m.step(DT); }
  assert.ok(Math.abs(m.y - p.y) < .01, 'retry from the foot lands on the platform'); assert.equal(m.blocked, false);
});

test('blocked: distance and run stop, chase and stamina keep going, no repeated penalty', () => {
  const m = stage({ required: true });
  for (let i = 0; i < 120 * 8; i++) { keepFed(m); m.step(DT); if (m.blocked) break; }
  assert.ok(m.blocked);
  for (let i = 0; i < 20; i++) { keepFed(m); m.step(DT); } // settle on the wall
  const d0 = m.distance, g0 = m.gap = 30, s0 = m.stamina = 80, t0 = m.elapsed;
  for (let i = 0; i < 120; i++) m.step(DT);
  assert.equal(m.distance, d0, 'no progress while blocked');
  assert.ok(Math.abs(m.gap - (g0 - RULES.chaserSpeed)) < 1e-6, `gap ${m.gap}`);
  assert.ok(Math.abs(m.stamina - (s0 - RULES.staminaDrain)) < 1e-6, `stamina ${m.stamina}`);
  assert.ok(Math.abs(m.elapsed - t0 - 1) < 1e-6); assert.equal(m.hits, 0);
});

test('blocked long enough, the chaser catches up as with any other stall', () => {
  const m = stage({ required: true }); m.gap = 12;
  for (let i = 0; i < 120 * 8 && m.phase === 'running'; i++) { m.stamina = 80; m.step(DT); }
  assert.equal(m.phase, 'over'); assert.equal(m.gap, 0);
});

test('golden boost does not pass terrain: the wall still stops a boosting runner', () => {
  const m = stage({ required: true }), p = m.platforms[0];
  for (let i = 0; i < 120 * 6; i++) { keepFed(m); m.boost = 1; m.step(DT); assert.ok(m.distance <= p.start - REACH + 1e-9, `boost passed the wall at ${m.distance}`); }
  assert.ok(m.blocked); assert.equal(m.hits, 0);
});

test('an unblocked run has exactly the old chase arithmetic (gap stays 30 at equal speeds)', () => {
  const m = new RunnerModel(1, false); m.start();
  for (let i = 0; i < 120 * 10; i++) { m.stamina = 80; m.step(DT); }
  assert.equal(m.gap, 30);
});

// ---------------------------------------------------------------- one-way tops, descent
test('optional platform is one-way: running underneath is not blocked and not hit', () => {
  const m = stage({ required: false }), p = m.platforms[0];
  for (let i = 0; i < 120 * 10 && m.distance < p.end + 6; i++) { keepFed(m); m.step(DT); assert.equal(m.blocked, false); assert.equal(m.y, F); }
  assert.ok(m.distance > p.end); assert.equal(m.hits, 0);
});

test('optional platform is one-way upward: a held jump from below lands on top from above only', () => {
  let landed = 0;
  for (let lead = 0; lead <= 9; lead += .1) { const r = approach(lead, null, 'normal', false); if (r.onPlatform) { landed++; assert.equal(r.blockedFrames, 0, 'optional platform never blocks'); } }
  assert.ok(landed > 0);
});

test('walking off the end of a platform drops to the floor with no input, no hit and no rescue', () => {
  const m = stage({ required: false }), p = m.platforms[0];
  m.distance = p.start + 2; m.y = p.y; // standing on the branch
  let sawAir = false;
  for (let i = 0; i < 120 * 8 && m.distance < p.end + 10; i++) {
    keepFed(m); m.step(DT);
    if (m.distance > p.end && m.y < F) sawAir = true;
    assert.equal(m.rescue, null); assert.equal(m.hits, 0);
  }
  assert.ok(sawAir, 'left the platform in the air'); assert.equal(m.y, F); assert.equal(m.vy, 0);
  assert.equal(m.supportY, F);
});

test('standing on a platform: supportY is its top; grounded; double jump available after leaving it', () => {
  const m = stage({ required: false }), p = m.platforms[0];
  m.distance = p.start + 2; m.y = p.y;
  assert.equal(m.supportY, p.y); assert.equal(m.grounded, true);
  m.jump(); m.releaseJump(); m.step(DT); assert.equal(m.jumps, 1);
});

test('upper food is reachable: a held jump from the branch floor grabs the dedicated food', () => {
  const m = new RunnerModel(5, true); m.start();
  const p = m.platforms[0], f = m.items.find(i => isFood(i.kind) && i.x >= p.start + 3 && i.x <= p.start + 3.5 && i.y >= p.y - 100 && i.y <= p.y - 48)!;
  m.distance = f.x - 1; m.y = p.y; m.gap = 30; m.stamina = 40;
  let ate = false; for (let i = 0; i < 120 * 2; i++) { keepFed(m); m.stamina = 40; m.step(DT); if (f.used) { ate = true; break; } }
  assert.ok(ate, 'standing under the food on the branch floor eats it (it is 48..100 px above the floor, 82 px body)');
});

// ---------------------------------------------------------------- upper level behaves like the ground
const SPEEDS = { normal: RULES.speed, exhausted: RULES.exhaustedSpeed, boost: RULES.boostSpeed } as const;
function onBranch(length = 400): RunnerModel {
  const m = stage({ required: false, start: 30, end: 30 + length }); m.distance = 32; m.y = m.platforms[0].y; return m;
}

test('upper level: every step advances exactly speed*dt in normal, exhausted and boost (no layer effect)', () => {
  for (const state of ['normal', 'exhausted', 'boost'] as const) {
    const m = onBranch();
    for (let i = 0; i < 120 * 5; i++) {
      m.stamina = 80; m.exhausted = state === 'exhausted'; m.boost = state === 'boost' ? 1 : 0;
      const d0 = m.distance, y0 = m.y; m.step(DT);
      assert.ok(Math.abs(m.distance - d0 - SPEEDS[state] * DT) < 1e-12, `${state}: step ${i} moved ${m.distance - d0}`);
      assert.equal(m.y, y0); assert.equal(m.blocked, false);
    }
    assert.ok(Math.abs(m.gap - (30 + (SPEEDS[state] - RULES.chaserSpeed) * 5)) < 1e-6, `${state} gap ${m.gap}`);
  }
});

test('upper level: a jump keeps the same horizontal speed as on the ground', () => {
  for (const state of ['normal', 'exhausted'] as const) {
    const up = onBranch(), ground = new RunnerModel(3, false); ground.start();
    up.jump(); ground.jump();
    for (let i = 0; i < 60; i++) { for (const m of [up, ground]) { keepFed(m); m.exhausted = state === 'exhausted'; m.step(DT); } }
    assert.ok(Math.abs((up.distance - 32) - ground.distance) < 1e-9, state);
  }
});

// A beam on the upper level, sized exactly as the generator sizes it.
function beamRun(releaseAt: number | null) {
  const m = onBranch(200), p = m.platforms[0];
  m.items.push({ id: 900, x: 60, y: 0, w: 120, h: p.y - 44, kind: 'beam', used: false });
  let sawHit = false, crouchedFrames = 0;
  for (let i = 0; i < 120 * 12 && m.distance < 70 && m.phase === 'running'; i++) {
    keepFed(m); const ahead = 60 - m.distance;
    m.crouch = ahead < 4 && ahead > -4 && !(releaseAt !== null && ahead < releaseAt);
    if (m.crouch) crouchedFrames++;
    const hits = m.hits; m.step(DT); if (m.hits > hits) sawHit = true;
  }
  return { hits: m.hits, sawHit, crouchedFrames, y: m.y, floor: p.y };
}
test('upper beam: crouching passes it with no hit; standing hits once', () => {
  const ok = beamRun(null); assert.equal(ok.hits, 0); assert.ok(ok.crouchedFrames > 0); assert.equal(ok.y, ok.floor);
  const m = onBranch(200), p = m.platforms[0];
  m.items.push({ id: 901, x: 60, y: 0, w: 120, h: p.y - 44, kind: 'beam', used: false });
  for (let i = 0; i < 120 * 12 && m.distance < 70; i++) { keepFed(m); m.step(DT); }
  assert.equal(m.hits, 1, 'a standing runner is hit exactly once');
});
test('upper beam: releasing the crouch under the beam stands up into it and hits immediately', () => {
  const r = beamRun(1); // released while still under the beam
  assert.equal(r.hits, 1); assert.ok(r.sawHit);
});

test('upper level: the chaser still catches an exhausted runner (gap 0 ends the run)', () => {
  const m = onBranch(); m.gap = 3;
  for (let i = 0; i < 120 * 6 && m.phase === 'running'; i++) { m.stamina = 80; m.exhausted = true; m.step(DT); }
  assert.equal(m.phase, 'over'); assert.equal(m.gap, 0); assert.equal(m.hits, 0);
});
