import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerModel, RULES, type Encounter } from '../src/model.ts';
import { StickerGame, MINI_RULES, rewardFor, characterFor, CHARACTERS } from '../src/sticker-game.ts';

// NPC encounters and the freeze/resume contract between the runner and the sticker mini game.
const DT = 1 / 120; // same fixed step as src/main.ts
const F = RULES.floor;
const SEEDS = [...new Set([13579, 99, 2026, 31337, 424242, ...Array.from({ length: 128 }, (_, i) => i + 1)])]; // the endurance bot's 132 seeds
const isFood = (k: string) => k === 'food' || k === 'gold';

// An empty course with hand-placed encounters (generation, platforms and scheduling are all off).
function stage(encounters: Partial<Encounter>[] = [{ x: 20 }]): RunnerModel {
  const m = new RunnerModel(5, false, { platforms: false, encounters: false }); m.start();
  encounters.forEach((e, i) => m.encounters.push({ id: i, x: 20, y: F, seed: 100 + i, used: false, ...e }));
  return m;
}
const fed = (m: RunnerModel) => { m.gap = 30; m.stamina = 80; };
function runUntil(m: RunnerModel, seconds: number, before?: (m: RunnerModel) => void) {
  for (let i = 0; i < Math.round(seconds / DT) && m.phase === 'running'; i++) { fed(m); before?.(m); m.step(DT); }
}
const snapshot = (m: RunnerModel) => JSON.stringify([m.phase, m.distance, m.y, m.vy, m.gap, m.stamina, m.exhausted, m.boost, m.eventBoost, m.eventMultiplier, m.elapsed, m.hitFlash, m.jumps, m.hits, m.foods, m.items.length, m.encounters.map(e => e.used)]);
const enter = (m = stage()) => { runUntil(m, 6); assert.equal(m.phase, 'minigame'); return m; };
const course = (seed: number, metres = 3000, options: { platforms?: boolean; encounters?: boolean } = {}) => {
  const m = new RunnerModel(seed, true, options); m.distance = metres; (m as any).generate(); return m;
};

// ---------------------------------------------------------------- schedule
test('encounters:false isolates the course (no encounters) and leaves obstacles/foods/platforms untouched', () => {
  for (const seed of [1, 13579, 99, 424242]) {
    const on = course(seed), off = course(seed, 3000, { encounters: false });
    assert.equal(off.encounters.length, 0); assert.ok(on.encounters.length > 0);
    assert.deepEqual(on.items, off.items, `seed ${seed}: items differ`); assert.deepEqual(on.platforms, off.platforms);
  }
});

test('schedule: first at 200-300 m, then 200-300 m apart, sequential ids, independent seeds (132 seeds, 3000 m)', () => {
  let total = 0; const gaps: number[] = [];
  for (const seed of SEEDS) {
    const es = course(seed).encounters; total += es.length;
    assert.ok(es.length >= 9, `seed ${seed}: only ${es.length}`);
    es.forEach((e, n) => {
      assert.equal(e.id, n); assert.equal(e.used, false);
      const gap = e.x - (n ? es[n - 1].x : 0); gaps.push(gap);
      assert.ok(gap >= 200 && gap <= 300.001, `seed ${seed} #${n}: gap ${gap.toFixed(1)}`);
    });
    assert.equal(new Set(es.map(e => e.seed)).size, es.length, `seed ${seed}: duplicate mini seeds`);
  }
  assert.ok(Math.min(...gaps) < 215 && Math.max(...gaps) > 285, 'spacing actually varies across the range');
  assert.ok(total / SEEDS.length > 9);
});

test('schedule is deterministic for the same seed and the same generation steps', () => {
  const sliced = (seed: number) => { const m = new RunnerModel(seed); for (let d = 0; d <= 3000; d += 25) { m.distance = d; (m as any).generate(); } return m.encounters.map(e => [e.id, e.x, e.y, e.seed]); };
  for (const seed of [1, 7, 99, 2026]) {
    assert.deepEqual(sliced(seed), sliced(seed)); assert.deepEqual(course(seed).encounters.map(e => [e.id, e.x, e.y, e.seed]), course(seed).encounters.map(e => [e.id, e.x, e.y, e.seed]));
  }
  assert.notDeepEqual(course(1).encounters.map(e => e.x), course(2).encounters.map(e => e.x));
  // Known, pre-existing property (not caused by encounters): obstacles and foods share one random stream, so generating the
  // course in different slices interleaves it differently. The first encounter is still in the same 200-300 m band either way.
  for (const seed of [1, 7, 99]) assert.ok(sliced(seed)[0][1] >= 200 && sliced(seed)[0][1] <= 300);
});

test('every encounter stands on a safe surface: clear of hazards, off platform edges, y matches the surface (132 seeds, both generation styles)', () => {
  let onPlatform = 0, onGround = 0;
  const sliced = (seed: number) => { const m = new RunnerModel(seed); for (let d = 0; d <= 3000; d += 25) { m.distance = d; (m as any).generate(); } return m; };
  for (const m of SEEDS.flatMap(seed => [course(seed), sliced(seed)])) {
    const seed = `n=${m.encounters.length}`;
    for (const e of m.encounters) {
      for (const i of m.items) {
        if (isFood(i.kind)) continue;
        const need = (i.w / 2 + RULES.halfHitWidth) / RULES.scale + 6;
        assert.ok(Math.abs(e.x - i.x) > need - 1e-9, `seed ${seed}: encounter ${e.x.toFixed(1)} too close to ${i.kind} ${i.x.toFixed(1)}`);
      }
      const near = m.platforms.find(p => e.x > p.start - 8 && e.x < p.end + 8);
      if (near) { assert.ok(e.x >= near.start + 4 && e.x <= near.end - 4, `seed ${seed}: encounter ${e.x.toFixed(1)} at the edge of ${near.start}-${near.end}`); assert.equal(e.y, near.y); onPlatform++; }
      else { assert.equal(e.y, F); onGround++; }
    }
  }
  assert.ok(onGround > 0); console.log(`encounters on ground ${onGround}, on platforms ${onPlatform}`);
});

test('mini game seed per encounter selects all three characters over the schedule', () => {
  const seen = new Set<string>();
  for (const seed of SEEDS) for (const e of course(seed).encounters) seen.add(characterFor(e.seed));
  assert.deepEqual([...seen].sort(), [...CHARACTERS].sort());
});

// ---------------------------------------------------------------- trigger conditions
test('triggers within 1.6 m on the same surface when grounded and standing; encounter is consumed', () => {
  const m = stage(); let at = 0;
  for (let i = 0; i < 120 * 6 && m.phase === 'running'; i++) { fed(m); m.step(DT); at = m.distance; }
  assert.equal(m.phase, 'minigame'); assert.ok(Math.abs(at - 20) < 1.6 && at > 18.3, `entered at ${at}`);
  assert.equal(m.activeEncounter?.id, 0); assert.equal(m.encounters[0].used, true);
});

test('no encounter while airborne over it, crouching, in hit protection, or on another surface', () => {
  const pass = (setup: (m: RunnerModel) => void, before: (m: RunnerModel) => void) => {
    const m = stage(); setup(m); const e = m.encounters[0]; runUntil(m, 6, before); return { m, e };
  };
  // Two jumps keep the runner in the air for the whole 3.2 m window (a single jump lands inside it and then triggers).
  let t0 = -1;
  const jumper = pass(() => {}, m => {
    if (t0 < 0 && m.distance > 17 && m.y === F) { m.jump(); t0 = m.elapsed; }
    if (t0 >= 0 && m.jumps === 1 && m.elapsed - t0 > .55) { m.releaseJump(); m.jump(); }
  });
  assert.notEqual(jumper.m.phase, 'minigame'); assert.equal(jumper.e.used, false);
  const crouched = pass(() => {}, m => { m.crouch = m.distance > 17 && m.distance < 23; });
  assert.notEqual(crouched.m.phase, 'minigame'); assert.equal(crouched.e.used, false);
  const flashing = pass(() => {}, m => { m.hitFlash = .3; });
  assert.notEqual(flashing.m.phase, 'minigame'); assert.equal(flashing.e.used, false);
  const wrong = pass(m => { m.encounters[0].y = F - 110; }, () => {});
  assert.notEqual(wrong.m.phase, 'minigame'); assert.equal(wrong.e.used, false);
  // Standing on the ground in the same window does trigger: the exclusions above are the cause, not the setup.
  assert.equal(pass(() => {}, () => {}).m.phase, 'minigame');
});

test('an unused encounter survives a miss and is removed only after the runner has left it behind', () => {
  const m = stage(); const e = m.encounters[0];
  for (let i = 0; i < 120 * 6; i++) { fed(m); m.crouch = true; m.step(DT); }
  assert.notEqual(m.phase, 'minigame'); assert.equal(e.used, false); assert.equal(m.encounters.length, 0, 'dropped once 16 m behind');
});

test('an encounter on a platform triggers only for a runner standing on that platform', () => {
  const m = new RunnerModel(5, false, { encounters: false }); m.start();
  m.platforms.push({ id: 0, start: 30, end: 70, y: F - RULES.platformHeight, required: false });
  m.encounters.push({ id: 0, x: 50, y: F - RULES.platformHeight, seed: 3, used: false });
  const under = m.encounters[0]; runUntil(m, 12); assert.notEqual(m.phase, 'minigame', 'running underneath it does not trigger'); assert.equal(under.used, false);
  const up = new RunnerModel(5, false, { encounters: false }); up.start();
  up.platforms.push({ id: 0, start: 30, end: 70, y: F - RULES.platformHeight, required: false });
  up.encounters.push({ id: 0, x: 50, y: F - RULES.platformHeight, seed: 3, used: false });
  up.distance = 32; up.y = F - RULES.platformHeight;
  runUntil(up, 8); assert.equal(up.phase, 'minigame'); assert.equal(up.activeEncounter?.id, 0);
});

test('only one encounter at a time; the next one still triggers after completion', () => {
  const m = stage([{ x: 20 }, { x: 40 }]); enter(m);
  assert.equal(m.activeEncounter?.id, 0); assert.equal(m.encounters[1].used, false);
  assert.ok(m.completeEncounter(0, rewardFor(1))); runUntil(m, 8);
  assert.equal(m.phase, 'minigame'); assert.equal(m.activeEncounter?.id, 1);
});

// ---------------------------------------------------------------- freeze
// The snapshot covers timers and positions. `crouch` is a plain input flag (not a timer) and is deliberately not part of it.
test('minigame freezes every runner timer: step, jump, pause and start change nothing', () => {
  const m = stage(); m.boost = 1; m.hitFlash = 0; m.eventBoost = 2; m.eventMultiplier = 1.25; runUntil(m, 6, mm => { mm.boost = 1; mm.eventBoost = 2; mm.eventMultiplier = 1.25; });
  assert.equal(m.phase, 'minigame');
  const frozen = snapshot(m);
  for (let i = 0; i < 120 * 10; i++) m.step(DT);
  m.step(30); m.jump(); m.releaseJump(); m.crouch = true; m.pause(); m.start(); m.step(DT);
  assert.equal(snapshot(m), frozen); assert.equal(m.phase, 'minigame');
});

test('start() cannot be used to skip a mini game; pause() ignores it too', () => {
  const m = enter(); m.start(); assert.equal(m.phase, 'minigame'); m.pause(); assert.equal(m.phase, 'minigame');
  const over = stage(); over.phase = 'over'; over.start(); assert.equal(over.phase, 'over');
});

test('while the chaser clock is frozen the gap and stamina do not move; afterwards they continue from the same values', () => {
  const m = enter(); const { gap, stamina, distance, elapsed } = m;
  for (let i = 0; i < 120 * 5; i++) m.step(DT);
  assert.deepEqual([m.gap, m.stamina, m.distance, m.elapsed], [gap, stamina, distance, elapsed]);
  assert.ok(m.completeEncounter(0, rewardFor(0)));
  const s0 = m.stamina; m.step(DT);
  assert.ok(Math.abs(m.stamina - (s0 - RULES.staminaDrain * DT)) < 1e-9, 'drain resumes at the normal rate');
});

test('the whole sticker game (selecting, playing, result, 3 s countdown) leaves the runner frozen until done', () => {
  const m = enter(); const frozen = snapshot(m); const g = new StickerGame(m.activeEncounter!.seed);
  const log: string[] = []; let last = '';
  for (let i = 0; i < 120 * 60 && g.phase !== 'done'; i++) {
    g.step(DT); m.step(DT); // a careless host stepping both must still not move the runner
    if (g.phase !== last) { log.push(g.phase); last = g.phase; }
    if (g.phase === 'intro') g.start(); if (g.phase === 'result') g.continue();
    assert.equal(snapshot(m), frozen, `runner moved during ${g.phase}`);
  }
  assert.equal(g.phase, 'done');
  for (const need of ['intro', 'playing', 'feedback', 'result', 'countdown', 'done']) assert.ok(log.includes(need), `${need} reached`);
  assert.equal(g.countdownRemaining, 0);
  assert.ok(m.completeEncounter(m.activeEncounter!.id, g.reward!)); assert.equal(m.phase, 'running');
  assert.equal(m.elapsed, JSON.parse(frozen)[10], 'runner clock resumes from the frozen value');
});

// ---------------------------------------------------------------- reward
test('completeEncounter: wrong id / wrong phase refused; the reward is applied exactly once', () => {
  const idle = stage(); assert.equal(idle.completeEncounter(0, rewardFor(5)), false, 'not in a mini game');
  const m = enter(); m.stamina = 30; const reward = rewardFor(5);
  assert.equal(m.completeEncounter(99, reward), false); assert.equal(m.phase, 'minigame'); assert.equal(m.stamina, 30);
  assert.equal(m.completeEncounter(0, reward), true);
  assert.equal(m.phase, 'running'); assert.equal(m.activeEncounter, null); assert.equal(m.stamina, 70);
  assert.deepEqual([m.eventBoost, m.eventMultiplier], [3, 1.5]);
  assert.equal(m.completeEncounter(0, reward), false, 'a second application is refused'); assert.equal(m.stamina, 70); assert.equal(m.eventBoost, 3);
});

test('reward tiers: stamina is capped at 100, exhaustion is cleared, input state is reset', () => {
  const full = enter(); full.stamina = 90; full.completeEncounter(0, rewardFor(5)); assert.equal(full.stamina, 100);
  const tired = enter(); tired.stamina = 0; tired.exhausted = true; tired.completeEncounter(0, rewardFor(0));
  assert.equal(tired.stamina, 10); assert.equal(tired.exhausted, true, '10 < 12: still exhausted at the lowest tier');
  const lifted = enter(); lifted.stamina = 0; lifted.exhausted = true; lifted.completeEncounter(0, rewardFor(3));
  assert.equal(lifted.stamina, 25); assert.equal(lifted.exhausted, false);
  const after = enter(); after.jump(); after.crouch = true; after.completeEncounter(0, rewardFor(2));
  assert.equal(after.crouch, false); assert.equal(after.phase, 'running');
  after.step(DT); assert.equal(after.vy, 0, 'no stuck jump press after returning');
});

// ---------------------------------------------------------------- event speed
function speedOf(setup: (m: RunnerModel) => void) {
  const m = new RunnerModel(1, false, { platforms: false, encounters: false }); m.start(); setup(m); return m.speed;
}
test('event boost: multiplier times base speed, never stacking with gold or exhaustion', () => {
  const ev = (mult: number, extra: (m: RunnerModel) => void = () => {}) => speedOf(m => { m.eventBoost = 2; m.eventMultiplier = mult; extra(m); });
  assert.equal(ev(1.1), RULES.speed * 1.1); assert.equal(ev(1.25), RULES.speed * 1.25); assert.equal(ev(1.5), RULES.speed * 1.5);
  assert.equal(speedOf(() => {}), RULES.speed);
  assert.equal(ev(1.5, m => { m.boost = 1; }), RULES.boostSpeed, 'gold + event is the maximum, not a product');
  assert.equal(ev(1.1, m => { m.boost = 1; }), RULES.boostSpeed);
  assert.equal(ev(1.25, m => { m.exhausted = true; }), RULES.speed * 1.25, 'event speed applies over exhaustion');
  assert.equal(speedOf(m => { m.exhausted = true; }), RULES.exhaustedSpeed);
  assert.equal(speedOf(m => { m.eventBoost = 0; m.eventMultiplier = 1.5; }), RULES.speed, 'multiplier alone does nothing once the time is over');
});

test('event boost runs for its seconds, then the base speed returns; gold timer and invulnerability are separate', () => {
  const m = stage([]); m.eventBoost = 1; m.eventMultiplier = 1.25;
  let fast = 0;
  for (let i = 0; i < 240; i++) { fed(m); const d0 = m.distance; m.step(DT); const v = (m.distance - d0) / DT; if (Math.abs(v - 7.5) < 1e-6) fast++; else assert.ok(Math.abs(v - RULES.speed) < 1e-6, `speed ${v}`); }
  assert.ok(Math.abs(fast - 120) <= 1, `${fast} fast steps for 1 s`);
  assert.equal(m.eventBoost, 0);
  // not invulnerable: an obstacle still hits during an event boost
  const h = stage([]); h.items.push({ id: 900, x: 12, y: F - 64, w: 60, h: 64, kind: 'block', used: false });
  h.eventBoost = 3; h.eventMultiplier = 1.5; runUntil(h, 3); assert.equal(h.hits, 1, 'event boost gives no protection');
  // the gold boost keeps its own timer through an event and still protects
  const g = stage([]); g.boost = 1; g.eventBoost = 3; g.eventMultiplier = 1.5; g.step(.5);
  assert.ok(Math.abs(g.boost - .5) < 1e-9 && Math.abs(g.eventBoost - 2.5) < 1e-9); assert.equal(g.invulnerable, true);
});

test('completing during an active gold boost keeps that gold boost', () => {
  const m = stage(); runUntil(m, 6); assert.equal(m.phase, 'minigame'); m.boost = .7;
  m.completeEncounter(0, rewardFor(5)); assert.equal(m.boost, .7); assert.equal(m.eventBoost, 3);
});

test('a boosted runner gains distance on the chaser (event 1.5x = 9 m/s versus 6 m/s)', () => {
  const m = stage([]); m.gap = 30; m.eventBoost = 2; m.eventMultiplier = 1.5;
  for (let i = 0; i < 240; i++) { m.stamina = 80; m.step(DT); }
  assert.ok(Math.abs(m.gap - 36) < 1e-6, `gap ${m.gap}`);
});
