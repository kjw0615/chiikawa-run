import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerModel, RULES } from '../src/model.ts';

const DT = 1 / 120; // same fixed step as src/main.ts
type Kind = 'block' | 'beam' | 'tower' | 'food' | 'gold';
const DIMS = { block: [397, 42, 43], beam: [337, 88, 68], tower: [313, 48, 127] } as const;

// A running model with the authored course switched off, so each test controls what is on the track.
function quiet(): RunnerModel {
  const m = new RunnerModel();
  (m as any).nextChunk = 1e9;
  m.items = [];
  m.start();
  return m;
}
function put(m: RunnerModel, kind: Kind, x: number, y = 0, w = 24, h = 24) {
  const d = kind in DIMS ? DIMS[kind as keyof typeof DIMS] : [y, w, h];
  m.items.push({ id: m.items.length + 100, x, y: d[0], w: d[1], h: d[2], kind, used: false });
}
function run(m: RunnerModel, seconds: number, before?: (m: RunnerModel) => void) {
  for (let i = 0; i < Math.round(seconds / DT) && m.phase === 'running'; i++) { before?.(m); m.step(DT); }
}
// Plays one obstacle 20m ahead and reports whether the player got hit.
function pass(kind: 'block' | 'beam' | 'tower', state: 'normal' | 'exhausted' | 'boost', jumpAhead: number, double = false, crouchHold = false): boolean {
  const m = quiet(); const x = m.distance + 20; put(m, kind, x);
  let jumped = false, second = false;
  for (let i = 0; i < 120 * 12 && m.distance < x + 5; i++) {
    m.gap = 30; m.stamina = 80; m.exhausted = state === 'exhausted'; m.boost = state === 'boost' ? 4 : 0;
    const ahead = x - m.distance;
    if (!jumped && ahead <= jumpAhead) { m.jump(); jumped = true; }
    if (double && jumped && !second && m.vy > 0) { m.jump(); second = true; }
    m.crouch = crouchHold && ahead < 4 && ahead > -4;
    m.step(DT);
  }
  return m.hits === 0;
}
// Width in seconds of the jump-timing window that clears an obstacle.
function timingWindow(kind: 'block' | 'tower', state: 'normal' | 'exhausted' | 'boost', double: boolean): number {
  const speed = state === 'exhausted' ? RULES.exhaustedSpeed : state === 'boost' ? RULES.boostSpeed : RULES.speed;
  let n = 0; for (let a = 0.2; a <= 8; a += 0.02) if (pass(kind, state, a, double)) n++;
  return n * 0.02 / speed;
}

test('initial state and ready phase', () => {
  const m = new RunnerModel();
  assert.deepEqual([m.phase, m.gap, m.stamina, m.exhausted, m.boost, m.hits], ['ready', 30, 100, false, 0, 0]);
  m.step(1); m.jump();
  assert.equal(m.distance, 0); assert.equal(m.phase, 'ready');
});

test('speed states: normal / exhausted / boost, boost wins', () => {
  const m = quiet();
  assert.equal(m.speed, 6);
  m.exhausted = true; assert.equal(m.speed, 3.6);
  m.boost = 2; assert.equal(m.speed, 7.8);
});

test('stamina drains 8/s and reaching 0 latches exhausted at 12.5s', () => {
  const m = quiet();
  run(m, 6); assert.ok(Math.abs(m.stamina - 52) < 0.2); assert.equal(m.exhausted, false);
  run(m, 6.6); assert.equal(m.stamina, 0); assert.equal(m.exhausted, true);
});

test('normal speed keeps the gap, exhausted shrinks 2.4/s and a 30m gap catches you in ~12.5s', () => {
  const m = quiet(); run(m, 5); assert.equal(m.gap, 30);
  const e = quiet(); e.stamina = 0; let t = 0;
  while (e.phase === 'running' && t < 30) { e.step(DT); t += DT; }
  assert.equal(e.phase, 'over'); assert.equal(e.gap, 0);
  assert.ok(t > 12.3 && t < 12.7, `caught at ${t}`);
});

test('food +25 capped at 100, clears exhaustion (25 >= 20), counted once', () => {
  const m = quiet(); m.stamina = 0; m.exhausted = true; put(m, 'food', m.distance + 1, 401);
  run(m, 0.5); // eaten ~0.28s in at exhausted speed, then drains 8/s
  assert.ok(m.stamina >= 20 && m.stamina <= 25); assert.equal(m.exhausted, false); assert.equal(m.foods, 1);
  const f = quiet(); f.stamina = 90; put(f, 'food', f.distance + 1, 401); run(f, 1);
  assert.ok(f.stamina <= 100 && f.stamina > 90);
});

test('exhaustion is latched while stamina is 1-19 (hysteresis)', () => {
  const m = quiet(); m.exhausted = true; m.stamina = 15; run(m, 0.5);
  assert.equal(m.exhausted, true); assert.ok(m.stamina > 0 && m.stamina < 15); assert.equal(m.speed, 3.6);
});

test('gold: boost 4s at 7.8, bonus +30, refresh to 4s without stacking', () => {
  const m = quiet(); put(m, 'gold', m.distance + 0.3, 401); run(m, 0.1);
  assert.equal(m.bonus, 30); assert.ok(m.boost > 3.8 && m.boost <= 4);
  run(m, 1); assert.ok(m.boost > 2.8 && m.boost < 3.1); assert.equal(m.speed, 7.8);
  put(m, 'gold', m.distance + 0.3, 401); run(m, 0.1);
  assert.ok(m.boost > 3.8 && m.boost <= 4, `refreshed to ${m.boost}`); // not 7
  run(m, 4.2); assert.equal(m.boost, 0); assert.equal(m.speed, 6);
});

test('boost at stamina 0: speed 7.8 during boost, exhausted again after it ends', () => {
  const m = quiet(); m.stamina = 0; m.exhausted = true; m.eat('gold');
  assert.equal(m.speed, 7.8); run(m, 3.9); assert.equal(m.speed, 7.8); assert.equal(m.exhausted, true);
  run(m, 0.2); assert.equal(m.boost, 0); assert.equal(m.exhausted, true); assert.equal(m.speed, 3.6);
});

test('boost with stamina 1-19 keeps the exhausted latch after boost ends', () => {
  const m = quiet(); m.exhausted = true; m.stamina = 18; m.eat('gold'); run(m, 4.1);
  assert.equal(m.boost, 0); assert.equal(m.exhausted, true);
});

test('gap grows +1.8/s in boost and is capped at 60; gold at cap gives bonus 100', () => {
  const m = quiet(); m.eat('gold'); m.stamina = 100; const g0 = m.gap; run(m, 1);
  assert.ok(Math.abs(m.gap - (g0 + 1.8)) < 0.05);
  const c = quiet(); c.gap = 59.5; c.eat('gold'); run(c, 3); assert.equal(c.gap, 60);
  const d = quiet(); d.gap = 60; d.eat('gold'); assert.equal(d.bonus, 100);
});

test('one hit costs exactly 5m once per obstacle, with 0.9s of no further hits', () => {
  const m = quiet(); put(m, 'block', m.distance + 0.2); run(m, 0.1);
  assert.equal(m.hits, 1); assert.equal(m.gap, 25);
  run(m, 0.5); assert.equal(m.hits, 1); assert.equal(m.gap, 25);
  // a second obstacle inside the 0.9s flash is consumed without any penalty
  put(m, 'block', m.distance + 0.5); run(m, 0.3); assert.equal(m.hits, 1); assert.equal(m.gap, 25);
  // after the flash it hurts again
  run(m, 1); put(m, 'block', m.distance + 0.2); run(m, 0.2); assert.equal(m.hits, 2); assert.equal(m.gap, 20);
});

test('hits can catch you: gap <= 0 ends the run', () => {
  const m = quiet(); m.gap = 4; put(m, 'block', m.distance + 0.2); run(m, 0.2);
  assert.equal(m.phase, 'over'); assert.equal(m.gap, 0);
});

test('pause freezes time, stamina, gap, boost; resume continues; input ignored while paused', () => {
  const m = quiet(); m.eat('gold'); run(m, 1);
  const snap = [m.distance, m.gap, m.stamina, m.boost, m.elapsed, m.y];
  m.crouch = true; m.pause(); assert.equal(m.phase, 'paused'); assert.equal(m.crouch, false);
  m.jump(); for (let i = 0; i < 600; i++) m.step(DT);
  assert.deepEqual([m.distance, m.gap, m.stamina, m.boost, m.elapsed, m.y], snap);
  m.start(); run(m, 0.5); assert.ok(m.distance > snap[0]); assert.ok(m.elapsed > snap[4]);
  assert.equal(m.events.filter(e => e === '점프').length, 0); // jump pressed during pause was dropped
});

test('pause only works while running', () => {
  const m = new RunnerModel(); m.pause(); assert.equal(m.phase, 'ready');
  const o = quiet(); o.gap = 0.01; o.stamina = 0; run(o, 1); assert.equal(o.phase, 'over'); o.pause(); assert.equal(o.phase, 'over');
});

test('jump physics: ground jump, double jump, third press does not fly', () => {
  const m = quiet(); m.jump(); run(m, 0.05); assert.ok(m.y < RULES.floor); assert.equal(m.jumps, 1);
  run(m, 0.15); m.jump(); run(m, 0.05); assert.equal(m.jumps, 2);
  let top = m.y; for (let i = 0; i < 120; i++) { m.step(DT); top = Math.min(top, m.y); }
  assert.ok(RULES.floor - top > 100);
  const t = quiet(); t.jump(); run(t, 0.1); t.jump(); run(t, 0.1); t.jump(); run(t, 0.1);
  assert.equal(t.events.filter(e => e === '점프' || e === '더블 점프').length, 2);
  run(t, 2); assert.equal(t.y, RULES.floor); assert.equal(t.jumps, 0);
});

test('crouch shrinks height only on the ground', () => {
  const m = quiet(); assert.equal(m.height, 54); m.crouch = true; assert.equal(m.height, 27);
  m.jump(); run(m, 0.1, mm => { mm.crouch = true; }); assert.equal(m.height, 54);
});

test('real collision: walking into a block hurts, a jump clears it, jumping far too early hurts', () => {
  assert.equal(pass('block', 'normal', -99), false);
  assert.equal(pass('block', 'normal', 2), true);
  assert.equal(pass('block', 'normal', 9), false);
});

test('real collision: beam hurts standing, crouching clears it, releasing under the beam is safe', () => {
  assert.equal(pass('beam', 'normal', -99, false, false), false);
  assert.equal(pass('beam', 'normal', -99, false, true), true);
  const m = quiet(); const x = m.distance + 20; put(m, 'beam', x);
  while (m.distance < x - 0.2) { m.crouch = true; m.step(DT); }
  for (let i = 0; i < 120 * 2; i++) { m.crouch = false; m.step(DT); } // key released with beam overhead
  assert.equal(m.hits, 0);
});

test('real collision: tower cannot be single-jumped, double jump clears it', () => {
  for (const state of ['normal', 'exhausted', 'boost'] as const) {
    let single = 0; for (let a = 0.2; a <= 8; a += 0.05) if (pass('tower', state, a, false)) single++;
    assert.equal(single, 0, `${state} single jump cleared the tower`);
    assert.ok(timingWindow('tower', state, true) > 0, `${state} double jump never clears`);
  }
});

test('timing windows: usable at normal/boost speed (>=0.2s)', () => {
  assert.ok(timingWindow('block', 'normal', false) >= 0.2);
  assert.ok(timingWindow('block', 'boost', false) >= 0.2);
  assert.ok(timingWindow('tower', 'normal', true) >= 0.2);
  assert.ok(timingWindow('tower', 'boost', true) >= 0.2);
});

test('regression: exhausted timing windows are >= 0.2s (block single jump, tower double jump)', () => {
  const block = timingWindow('block', 'exhausted', false), tower = timingWindow('tower', 'exhausted', true);
  console.log(`exhausted windows: block single ${block.toFixed(3)}s, block double ${timingWindow('block', 'exhausted', true).toFixed(3)}s, tower double ${tower.toFixed(3)}s`);
  assert.ok(block >= 0.2, `block ${block}`);
  assert.ok(tower >= 0.2, `tower ${tower}`);
});

// y per step of one jump; `mid` may change the state in the air (eat, boost end, ...).
function arc(exhausted: boolean, mid?: (m: RunnerModel, i: number) => void): { ys: number[]; m: RunnerModel } {
  const m = quiet(); m.exhausted = exhausted; m.jump(); const ys: number[] = [];
  for (let i = 0; i < 120 * 3; i++) { m.stamina = 50; m.gap = 30; mid?.(m, i); m.step(DT); ys.push(m.y); if (i > 5 && m.grounded) break; }
  return { ys, m };
}

test('exhausted jump keeps the same height as a normal jump but stays in the air longer', () => {
  const n = arc(false), e = arc(true);
  const top = (ys: number[]) => RULES.floor - Math.min(...ys);
  assert.ok(Math.abs(top(n.ys) - top(e.ys)) < 3, `${top(n.ys)} vs ${top(e.ys)}`);
  assert.ok(e.ys.length > n.ys.length * 1.5);
  // same horizontal clearance: airtime * speed matches
  assert.ok(Math.abs(e.ys.length * RULES.exhaustedSpeed - n.ys.length * RULES.speed) < 0.15 * n.ys.length * RULES.speed);
});

test('gravity is fixed at takeoff: food, boost start or boost end in the air do not change the arc', () => {
  const control = arc(true).ys;
  const ate = arc(true, (m, i) => { if (i === 40) { m.exhausted = true; m.eat('food'); m.exhausted = false; } }).ys;
  const boostStart = arc(true, (m, i) => { if (i === 40) m.eat('gold'); }).ys;
  const boostEnd = arc(true, (m, i) => { if (i === 40) m.boost = 0.1; }).ys;
  assert.deepEqual(ate, control); assert.deepEqual(boostStart, control); assert.deepEqual(boostEnd, control);
});

test('landing after a state change resets gravity: next normal jump is a normal jump', () => {
  const { m } = arc(true, (mm, i) => { if (i === 30) mm.eat('food'); });
  assert.ok(m.grounded); assert.equal(m.jumps, 0);
  m.exhausted = false; m.boost = 0; const n = arc(false);
  m.jump(); let top = m.y; for (let i = 0; i < 120; i++) { m.stamina = 50; m.step(DT); top = Math.min(top, m.y); }
  assert.ok(Math.abs((RULES.floor - top) - (RULES.floor - Math.min(...n.ys))) < 2);
});

test('exhausted double jump: second jump is also scaled and the player lands cleanly', () => {
  const m = quiet(); m.exhausted = true; m.jump(); run(m, 0.4, mm => { mm.stamina = 50; }); m.jump();
  run(m, 3, mm => { mm.stamina = 50; mm.gap = 30; });
  assert.ok(m.grounded); assert.equal(m.jumps, 0); assert.equal(m.vy, 0);
});

test('authored course: first chunk teaches food before the first block; hazards are >=7m apart', () => {
  const m = new RunnerModel(); const first = [...m.items].sort((a, b) => a.x - b.x);
  assert.equal(first[0].kind, 'food'); assert.ok(first[0].x < first.find(i => i.kind === 'block')!.x);
  const c = new RunnerModel(); c.distance = 2000; (c as any).generate();
  const hz = c.items.filter(i => i.kind === 'block' || i.kind === 'beam' || i.kind === 'tower').sort((a, b) => a.x - b.x);
  assert.ok(hz.length > 50);
  for (let i = 1; i < hz.length; i++) assert.ok(hz[i].x - hz[i - 1].x >= 7, `hazards ${hz[i - 1].x}->${hz[i].x}`);
});

test('determinism: same inputs give the same run', () => {
  const play = () => { const m = new RunnerModel(); m.start(); for (let i = 0; i < 2000; i++) { if (i % 90 === 0) m.jump(); m.crouch = i % 300 > 250; m.step(DT); } return [m.distance, m.gap, m.stamina, m.hits, m.foods, m.phase].join('|'); };
  assert.equal(play(), play());
});
