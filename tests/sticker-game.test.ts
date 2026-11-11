import test from 'node:test';
import assert from 'node:assert/strict';
import { StickerGame, MINI_RULES, CHARACTERS, characterFor, rewardFor } from '../src/sticker-game.ts';

const DT = 1 / 120;
const run = (g: StickerGame, seconds: number) => { for (let i = 0; i < Math.round(seconds / DT); i++) g.step(DT); };
// Steps until the cursor is clearly inside / outside the target band, then stamps.
function stampWhen(g: StickerGame, inside: boolean): boolean {
  for (let i = 0; i < 120 * 4 && g.phase === 'playing'; i++) {
    const c = g.cursor;
    const clearlyIn = c > MINI_RULES.targetMin + .02 && c < MINI_RULES.targetMax - .02;
    const clearlyOut = c < MINI_RULES.targetMin - .02 || c > MINI_RULES.targetMax + .02;
    if (inside ? clearlyIn : clearlyOut) return g.stamp() as boolean;
    g.step(DT);
  }
  throw new Error('no stamping moment');
}
const playAll = (g: StickerGame, plan: boolean[]) => {
  run(g, MINI_RULES.selectionSeconds); g.start();
  for (const want of plan) { assert.equal(g.phase, 'playing'); assert.equal(stampWhen(g, want), want); run(g, MINI_RULES.feedbackSeconds); }
};

test('rules contract: agreed numbers', () => {
  assert.deepEqual([MINI_RULES.selectionSeconds, MINI_RULES.roundSeconds, MINI_RULES.feedbackSeconds, MINI_RULES.countdownSeconds, MINI_RULES.targetMin, MINI_RULES.targetMax],
    [2, 2.8, .45, 3, .36, .64]);
  assert.deepEqual([rewardFor(5), rewardFor(4), rewardFor(2), rewardFor(1), rewardFor(0)], [
    { stamina: 40, speedMultiplier: 1.5, seconds: 3 }, { stamina: 25, speedMultiplier: 1.25, seconds: 2 },
    { stamina: 25, speedMultiplier: 1.25, seconds: 2 }, { stamina: 10, speedMultiplier: 1.1, seconds: 1 }, { stamina: 10, speedMultiplier: 1.1, seconds: 1 }]);
});

test('selection: pure function of the seed, three characters equally likely', () => {
  const count: Record<string, number> = { chiikawa: 0, hachiware: 0, usagi: 0 };
  for (let s = 1; s <= 3000; s++) { const c = characterFor(s); assert.equal(new StickerGame(s).selected, c); count[c]++; }
  for (const c of CHARACTERS) assert.ok(Math.abs(count[c] / 3000 - 1 / 3) < .04, `${c} ${count[c]}`);
});

test('flow: selecting 2 s, intro waits untimed, start, playing; elapsed restarts each phase', () => {
  const g = new StickerGame(7); assert.equal(g.phase, 'selecting');
  run(g, 1.9); assert.equal(g.phase, 'selecting'); assert.ok(Math.abs(g.elapsed - 1.9) < 1e-6);
  run(g, .1); assert.equal(g.phase, 'intro'); assert.equal(g.elapsed, 0);
  run(g, 60); assert.equal(g.phase, 'intro'); assert.equal(g.elapsed, 0); assert.equal(g.round, 0);
  assert.equal(g.stamp(), null, 'no stamping in the guide');
  g.start(); assert.equal(g.phase, 'playing'); assert.equal(g.elapsed, 0);
});

test('cursor: bounded, back and forth, seed dependent, deterministic', () => {
  const sample = (seed: number) => { const g = new StickerGame(seed); run(g, 2); g.start(); const v: number[] = []; for (let i = 0; i < 300; i++) { v.push(g.cursor); g.step(DT); } return v; };
  for (const seed of [1, 2, 3, 99, 13579]) {
    const v = sample(seed); assert.deepEqual(v, sample(seed));
    assert.ok(v.every(x => x >= 0 && x <= 1)); assert.ok(Math.max(...v) > .95 && Math.min(...v) < .05, 'sweeps the whole bar');
    assert.ok(v.some((x, i) => i > 0 && x < v[i - 1]) && v.some((x, i) => i > 0 && x > v[i - 1]), 'reverses direction');
  }
  assert.notDeepEqual(sample(1), sample(2));
});

test('a stamp inside the band is a success, outside is a miss; one judgement per round', () => {
  const g = new StickerGame(11); run(g, 2); g.start();
  assert.equal(stampWhen(g, true), true); assert.equal(g.phase, 'feedback'); assert.equal(g.successes, 1);
  assert.equal(g.stamp(), null); assert.equal(g.results.length, 1, 'a second press during feedback is ignored');
  run(g, MINI_RULES.feedbackSeconds); assert.equal(g.phase, 'playing'); assert.equal(g.round, 1); assert.ok(g.elapsed < 1e-6, 'a new phase starts at 0 (float dust only)');
  assert.equal(stampWhen(g, false), false); assert.deepEqual(g.results, [true, false]); assert.equal(g.lastHit, false);
});

test('band edges are inclusive', () => {
  const g = new StickerGame(5); run(g, 2); g.start();
  Object.defineProperty(g, 'cursor', { get: () => MINI_RULES.targetMin });
  assert.equal(g.stamp(), true);
  const h = new StickerGame(5); run(h, 2); h.start();
  Object.defineProperty(h, 'cursor', { get: () => MINI_RULES.targetMax + .001 });
  assert.equal(h.stamp(), false);
});

test('round timeout: 2.8 s without a press is a miss, then feedback .45 s, then the next round', () => {
  const g = new StickerGame(3); run(g, 2); g.start();
  run(g, 2.79); assert.equal(g.phase, 'playing'); assert.equal(g.results.length, 0);
  run(g, .01); assert.equal(g.phase, 'feedback'); assert.deepEqual(g.results, [false]);
  run(g, .44); assert.equal(g.phase, 'feedback'); run(g, .01); assert.equal(g.phase, 'playing'); assert.equal(g.round, 1);
});

test('five rounds then result; rewards by success count; reward only after the last round', () => {
  for (const [wins, want] of [[5, 40], [4, 25], [3, 25], [2, 25], [1, 10], [0, 10]] as const) {
    const g = new StickerGame(wins * 7 + 1);
    run(g, 2); g.start();
    for (let r = 0; r < 5; r++) { assert.equal(g.reward, null); stampWhen(g, r < wins); run(g, MINI_RULES.feedbackSeconds); }
    assert.equal(g.phase, 'result'); assert.equal(g.successes, wins); assert.equal(g.reward!.stamina, want);
  }
  const all = new StickerGame(2); playAll(all, [true, true, true, true, true]);
  assert.deepEqual(all.reward, { stamina: 40, speedMultiplier: 1.5, seconds: 3 });
});

test('all five timeouts end in the lowest reward', () => {
  const g = new StickerGame(9); run(g, 2); g.start();
  run(g, 5 * (MINI_RULES.roundSeconds + MINI_RULES.feedbackSeconds));
  assert.equal(g.phase, 'result'); assert.equal(g.successes, 0); assert.deepEqual(g.reward, { stamina: 10, speedMultiplier: 1.1, seconds: 1 });
});

test('result waits for continue(); countdown 3 s then done; done is final', () => {
  const g = new StickerGame(4); playAll(g, [true, false, true, false, true]);
  assert.equal(g.phase, 'result'); run(g, 30); assert.equal(g.phase, 'result'); assert.equal(g.reward!.stamina, 25);
  g.continue(); assert.equal(g.phase, 'countdown'); assert.equal(g.elapsed, 0);
  run(g, 1); assert.ok(Math.abs(g.countdownRemaining - 2) < 1e-6);
  run(g, 1.98); assert.equal(g.phase, 'countdown'); run(g, .02); assert.equal(g.phase, 'done');
  run(g, 10); assert.equal(g.phase, 'done'); g.continue(); g.start(); assert.equal(g.stamp(), null); assert.equal(g.phase, 'done');
  assert.deepEqual(g.reward, { stamina: 25, speedMultiplier: 1.25, seconds: 2 });
});

test('pause freezes the whole mini clock and every input; resume continues exactly', () => {
  const g = new StickerGame(6); run(g, 1); g.pause();
  const snap = JSON.stringify([g.phase, g.elapsed, g.cursor]); run(g, 60);
  assert.equal(JSON.stringify([g.phase, g.elapsed, g.cursor]), snap);
  g.resume(); run(g, 1); assert.equal(g.phase, 'intro');
  g.start(); run(g, 1); const before = [g.elapsed, g.cursor]; g.pause(); run(g, 100); g.stamp(); g.start(); g.continue();
  assert.deepEqual([g.elapsed, g.cursor], before); assert.equal(g.results.length, 0);
  g.resume(); run(g, 1.8); assert.equal(g.phase, 'feedback'); assert.deepEqual(g.results, [false]);
});

test('time is independent of how it is sliced', () => {
  const trace = (dt: number) => { const g = new StickerGame(21); const n = Math.round(30 / dt); for (let i = 0; i < n; i++) g.step(dt); return [g.phase, g.results.length, g.round]; };
  const ref = trace(1 / 120);
  for (const dt of [1 / 60, .1, 30]) assert.deepEqual(trace(dt), ref, `dt ${dt}`);
  assert.deepEqual(ref, ['intro', 0, 0]);
  const g = new StickerGame(21); g.step(2); g.start(); g.step(100);
  assert.equal(g.phase, 'result', 'a huge step runs through all rounds as misses'); assert.equal(g.successes, 0);
});

test('invalid steps do nothing', () => {
  const g = new StickerGame(1); g.step(0); g.step(-1); g.step(NaN); assert.equal(g.elapsed, 0); assert.equal(g.phase, 'selecting');
});

test('determinism: same seed and same inputs give the same game', () => {
  const play = (seed: number) => { const g = new StickerGame(seed); run(g, 2); g.start(); for (let i = 0; i < 5; i++) { run(g, .9 + i * .13); g.stamp(); run(g, MINI_RULES.feedbackSeconds + 3); } return [g.selected, g.results.join(), g.phase]; };
  assert.deepEqual(play(8), play(8));
});

test('every round of every seed is winnable: the cursor spends enough time inside the band', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const g = new StickerGame(seed); run(g, 2); g.start();
    for (let r = 0; r < 5; r++) {
      let inside = 0, longest = 0, streak = 0;
      for (let i = 0; i < 336 && g.phase === 'playing'; i++) {
        const c = g.cursor; if (c >= MINI_RULES.targetMin && c <= MINI_RULES.targetMax) { inside++; streak++; longest = Math.max(longest, streak); } else streak = 0;
        g.step(DT);
      }
      assert.ok(inside * DT >= .5, `seed ${seed} round ${r}: ${(inside * DT).toFixed(2)} s inside`);
      assert.ok(longest * DT >= .15, `seed ${seed} round ${r}: longest pass ${(longest * DT).toFixed(2)} s`);
      run(g, MINI_RULES.feedbackSeconds);
    }
  }
});
