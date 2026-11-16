import test from 'node:test';
import assert from 'node:assert/strict';
import { WeedGame, WEED_RULES, weedRowFor, weedRewardFor, weedSuccessesFor } from '../src/weed-game.ts';

/** Plays a run: pull(i) says whether to press while tile i is on the centre mark. */
const play = (g: WeedGame, pull: (i: number) => boolean) => {
  g.start();
  for (let i = 0; i < g.tileCount; i++) {
    g.step(.5);
    if (pull(i)) g.press();
    g.step(.5);
  }
};

test('every seed gives 4 weeds and 2 flowers; seeds vary the order', () => {
  const orders = new Set<string>();
  for (let s = 0; s < 40; s++) {
    const row = weedRowFor(s);
    assert.equal(row.length, 6);
    assert.equal(row.filter(t => t === 'flower').length, 2);
    orders.add(row.join());
  }
  assert.ok(orders.size > 3);
  assert.deepEqual(weedRowFor(7), weedRowFor(7));
});

test('first tile is on the centre mark at the start and the row slides once per second', () => {
  const g = new WeedGame(3);
  assert.equal(g.centerIndex, -1);
  g.start();
  assert.equal(g.centerIndex, 0);
  g.step(.99); assert.equal(g.centerIndex, 0);
  g.step(.01); assert.equal(g.centerIndex, 1);
  g.step(4); assert.equal(g.centerIndex, 5);
});

test('perfect play: pull every weed, leave every flower, get 6 right and 5 successes', () => {
  const g = new WeedGame(5);
  play(g, i => g.row[i] === 'weed');
  assert.equal(g.phase, 'result');
  assert.equal(g.right, 6);
  assert.equal(g.reward?.coins, 5);
  g.continue(); g.step(WEED_RULES.countdownSeconds + .1);
  assert.equal(g.phase, 'done');
});

test('the game ends only after the 6th tile has had its full second', () => {
  const g = new WeedGame(5);
  g.start(); g.step(5.99);
  assert.equal(g.phase, 'playing');
  g.step(.01);
  assert.equal(g.phase, 'result');
});

test('doing nothing: weeds are missed, flowers pass safely (2 right)', () => {
  const g = new WeedGame(5);
  play(g, () => false);
  assert.equal(g.right, 2);
  assert.equal(g.outcomes.filter(o => o === 'missed').length, 4);
  assert.equal(g.outcomes.filter(o => o === 'passed').length, 2);
});

test('pulling everything: weeds pulled, flowers pulled wrongly (4 right)', () => {
  const g = new WeedGame(5);
  play(g, () => true);
  assert.equal(g.right, 4);
  assert.equal(g.outcomes.filter(o => o === 'wrong').length, 2);
});

test('duplicate presses on one tile are ignored and do not leak onto the next tile', () => {
  const g = new WeedGame(5);
  g.start();
  g.press(); g.press(); g.press();
  const first = g.outcomes[0];
  assert.ok(first === 'pulled' || first === 'wrong');
  assert.equal(g.outcomes[1], undefined);
  g.step(1);
  assert.equal(g.outcomes[1], undefined);
  g.press();
  assert.notEqual(g.outcomes[1], undefined);
});

test('a press exactly on the boundary belongs to the next tile', () => {
  const g = new WeedGame(5);
  g.start(); g.step(1);
  g.press();
  assert.equal(g.outcomes[0] === 'pulled' || g.outcomes[0] === 'wrong', false);
  assert.notEqual(g.outcomes[1], undefined);
});

test('a long frame settles several tiles at once; presses outside play are ignored', () => {
  const g = new WeedGame(5);
  g.press(); // intro
  assert.equal(g.judgedCount, 0);
  g.start(); g.step(100);
  assert.equal(g.judgedCount, 6);
  assert.equal(g.phase, 'result');
  g.press();
  assert.equal(g.right, 2);
});

test('pause freezes the clock and the button', () => {
  const g = new WeedGame(5);
  g.start(); g.pause();
  g.step(5); g.press();
  assert.equal(g.time, 0);
  assert.equal(g.judgedCount, 0);
  g.resume(); g.step(1.2);
  assert.equal(g.centerIndex, 1);
});

test('reward scales with right answers out of 6 and stays within 0..5', () => {
  assert.equal(weedSuccessesFor(0), 0);
  assert.equal(weedSuccessesFor(3), 3);
  assert.equal(weedSuccessesFor(6), 5);
  assert.equal(weedSuccessesFor(99), 5);
  assert.deepEqual(weedRewardFor(6), { stamina: 30, speedMultiplier: 1.5, seconds: 2, coins: 5 });
  assert.deepEqual(weedRewardFor(0), { stamina: 0, speedMultiplier: 1, seconds: 0, coins: 0 });
});

test('offset slides once per second and stays on the last tile in the result', () => {
  const g = new WeedGame(5);
  assert.equal(g.offset, 0);
  g.start(); g.step(2.5);
  assert.equal(g.offset, 2);
  g.step(10);
  assert.equal(g.phase, 'result');
  assert.equal(g.offset, 5);
  g.continue();
  assert.equal(g.offset, 5);
});
