import test from 'node:test';
import assert from 'node:assert/strict';
import { UsagiGame, USAGI_CHARTS, USAGI_RULES, usagiGradeFor, usagiHitTime, usagiRewardFor, usagiSuccessesFor } from '../src/usagi-game.ts';

const advanceTo = (g: UsagiGame, t: number) => g.step(t - g.time);
const play = (g: UsagiGame, offset: (i: number) => number | null) => {
  g.start();
  for (let i = 0; i < g.noteCount; i++) {
    const o = offset(i);
    if (o === null) continue;
    advanceTo(g, usagiHitTime(i) + o);
    g.pressLane(g.chart[i]);
  }
  advanceTo(g, 60);
};

test('charts have 8 notes with 4 per side', () => {
  for (const c of USAGI_CHARTS) {
    assert.equal(c.length, USAGI_RULES.noteCount);
    assert.equal(c.filter(s => s === 'left').length, 4);
  }
});

test('grades by timing error', () => {
  assert.equal(usagiGradeFor(0), 'perfect');
  assert.equal(usagiGradeFor(USAGI_RULES.perfect), 'perfect');
  assert.equal(usagiGradeFor(USAGI_RULES.good), 'good');
  assert.equal(usagiGradeFor(USAGI_RULES.good + .01), 'miss');
});

test('flawless run pays the maximum and reaches result then done', () => {
  const g = new UsagiGame(0);
  play(g, () => 0);
  assert.equal(g.phase, 'result');
  assert.equal(g.perfects, 8);
  assert.equal(g.reward?.coins, 5);
  g.continue(); g.step(USAGI_RULES.countdownSeconds + .1);
  assert.equal(g.phase, 'done');
});

test('no input never fails: all notes are late misses, reward is zero', () => {
  const g = new UsagiGame(1);
  play(g, () => null);
  assert.equal(g.phase, 'result');
  assert.ok(g.grades.every(x => x === 'miss'));
  assert.ok(g.misses.every(x => x === 'late'));
  assert.deepEqual(g.reward, { stamina: 0, speedMultiplier: 1, seconds: 0, coins: 0 });
});

test('wrong side is a miss, stray early tap is ignored', () => {
  const g = new UsagiGame(0);
  g.start();
  advanceTo(g, usagiHitTime(0) - USAGI_RULES.earlyIgnore - .05);
  g.pressLane('left'); g.pressLane('right');
  assert.equal(g.judgedCount, 0);
  advanceTo(g, usagiHitTime(0));
  g.pressLane(g.chart[0] === 'left' ? 'right' : 'left');
  assert.equal(g.grades[0], 'miss');
  assert.equal(g.misses[0], 'side');
  assert.equal(g.dance, 'miss');
});

test('early press inside the ignore window but outside Good is an early miss', () => {
  const g = new UsagiGame(0);
  g.start();
  advanceTo(g, usagiHitTime(0) - (USAGI_RULES.good + .05));
  g.pressLane(g.chart[0]);
  assert.equal(g.misses[0], 'early');
});

test('label and dance follow the last judgement, then fade to idle', () => {
  const g = new UsagiGame(0);
  g.start();
  advanceTo(g, usagiHitTime(0));
  g.pressLane(g.chart[0]);
  assert.equal(g.label, 'perfect');
  assert.equal(g.dance, g.chart[0]);
  g.step(USAGI_RULES.feedbackSeconds + .01);
  assert.equal(g.label, null);
  assert.equal(g.dance, 'idle');
});

test('bubble shows only while the note approaches; progress is 1 at hit time', () => {
  const g = new UsagiGame(0);
  g.start();
  assert.equal(g.bubble, '');
  advanceTo(g, usagiHitTime(0) - USAGI_RULES.approach + .01);
  assert.equal(g.bubble, USAGI_RULES.bubble[g.chart[0]]);
  advanceTo(g, usagiHitTime(0));
  assert.ok(Math.abs((g.noteProgress(0) ?? 0) - 1) < 1e-9);
});

test('pause freezes the clock and input; press() without a lane does nothing', () => {
  const g = new UsagiGame(0);
  g.start(); g.pause();
  g.step(5); g.pressLane('left');
  assert.equal(g.time, 0);
  g.resume(); g.press();
  assert.equal(g.judgedCount, 0);
});

test('reward scales with points and stays within 0..5 successes', () => {
  assert.equal(usagiSuccessesFor(0), 0);
  assert.equal(usagiSuccessesFor(8), 5);
  assert.equal(usagiSuccessesFor(99), 5);
  assert.equal(usagiSuccessesFor(4), 3); // 4 of 8 successes
  assert.equal(usagiSuccessesFor(1), 1);
  assert.deepEqual(usagiRewardFor(8), { stamina: 30, speedMultiplier: 1.5, seconds: 2, coins: 5 });
});

test('a long frame passes several late notes at once', () => {
  const g = new UsagiGame(0);
  g.start(); g.step(100);
  assert.equal(g.judgedCount, 8);
  assert.equal(g.phase, 'result');
});

test('Perfect and Good both count as one success; a miss counts as none', () => {
  const g = new UsagiGame(0);
  play(g, i => (i % 3 === 0 ? 0 : i % 3 === 1 ? .15 : null));
  assert.equal(g.points, g.grades.filter(x => x !== 'miss').length);
  assert.equal(g.points, 6);
});
