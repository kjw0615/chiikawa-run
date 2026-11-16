import test from 'node:test';
import assert from 'node:assert/strict';
import { WeedGame, WEED_RULES, weedRowFor, weedRewardFor, weedSuccessesFor } from '../src/weed-game.ts';

const STEP = WEED_RULES.stepSeconds;
/** start() and wait out the lead-in, so tests begin with the first tile on the centre mark. */
const start = (g: WeedGame) => { g.start(); g.step(WEED_RULES.readySeconds); };
/** Plays a run: pull(i) says whether to press tile i. A press answers at once; a tile left alone waits out its time. */
const play = (g: WeedGame, pull: (i: number) => boolean) => {
  start(g);
  while (g.phase === 'playing') {
    const i = g.centerIndex;
    g.step(WEED_RULES.pressLock + .01);   // a short look, past the double-tap lock
    if (g.phase === 'playing' && g.centerIndex === i) { if (pull(i)) g.press(); else g.step(STEP); }
  }
};

test('a tile lasts 0.7 s', () => assert.equal(STEP, .7));

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

test('first tile is on the centre mark at the start and an untouched row slides every 0.7 s', () => {
  const g = new WeedGame(3);
  assert.equal(g.centerIndex, -1);
  start(g);
  assert.equal(g.centerIndex, 0);
  g.step(STEP - .01); assert.equal(g.centerIndex, 0);
  g.step(.01); assert.equal(g.centerIndex, 1);
  g.step(STEP * 4); assert.equal(g.centerIndex, 5);
});

test('pressing moves on to the next tile immediately, without waiting out the time', () => {
  const g = new WeedGame(5);
  start(g); g.step(.05);
  g.press();
  assert.ok(g.outcomes[0] === 'pulled' || g.outcomes[0] === 'wrong');
  assert.equal(g.centerIndex, 1);
  assert.equal(g.offset, 1);
  assert.equal(g.tileTime, 0);
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

test('answering the 6th tile ends the game at once; leaving it ends it after its time', () => {
  const pressed = new WeedGame(5);
  start(pressed);
  for (let i = 0; i < 6; i++) { pressed.step(.2); pressed.press(); }
  assert.equal(pressed.phase, 'result');
  const left = new WeedGame(5);
  start(left); left.step(STEP * 6 - .01);
  assert.equal(left.phase, 'playing');
  left.step(.01);
  assert.equal(left.phase, 'result');
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

test('an accidental double tap right after a press does not answer the next tile', () => {
  const g = new WeedGame(5);
  start(g); g.step(.05);
  g.press(); g.press(); g.press();
  assert.equal(g.centerIndex, 1);
  assert.equal(g.outcomes[1], undefined);
  g.step(WEED_RULES.pressLock);
  g.press();
  assert.notEqual(g.outcomes[1], undefined);
  assert.equal(g.centerIndex, 2);
});

test('presses outside play are ignored; a long frame settles several tiles at once', () => {
  const g = new WeedGame(5);
  g.press(); // intro
  assert.equal(g.judgedCount, 0);
  start(g); g.step(100);
  assert.equal(g.judgedCount, 6);
  assert.equal(g.phase, 'result');
  g.press();
  assert.equal(g.right, 2);
});

test('a slow tile carries leftover time over to the next one', () => {
  const g = new WeedGame(5);
  start(g); g.step(STEP + .2);
  assert.equal(g.centerIndex, 1);
  assert.ok(Math.abs(g.tileTime - .2) < 1e-9);
});

test('pause freezes the clock and the button', () => {
  const g = new WeedGame(5);
  start(g); g.pause();
  g.step(5); g.press();
  assert.equal(g.judgedCount, 0);
  assert.equal(g.centerIndex, 0);
  g.resume(); g.step(STEP + .1);
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

test('offset follows the tile index and stays on the last tile in the result', () => {
  const g = new WeedGame(5);
  assert.equal(g.offset, 0);
  start(g); g.step(STEP * 2.5);
  assert.equal(g.offset, 2);
  g.step(10);
  assert.equal(g.phase, 'result');
  assert.equal(g.offset, 5);
  g.continue();
  assert.equal(g.offset, 5);
});

test('start shows a ready then go cue; tiles wait, ignore input, then the first tile starts', () => {
  const g = new WeedGame(5);
  assert.equal(g.startCue, '');
  g.start();
  assert.equal(g.startCue, 'ready');
  assert.equal(g.centerIndex, -1);
  g.press();
  assert.equal(g.judgedCount, 0);
  g.step(WEED_RULES.goAt + .01);
  assert.equal(g.startCue, 'go');
  g.step(WEED_RULES.readySeconds - WEED_RULES.goAt - .01 + .1);
  assert.equal(g.startCue, '');
  assert.equal(g.centerIndex, 0);
  assert.ok(Math.abs(g.tileTime - .1) < 1e-9);
});

test('paused during the lead-in keeps it frozen', () => {
  const g = new WeedGame(5);
  g.start(); g.pause(); g.step(5);
  assert.equal(g.startCue, 'ready');
  g.resume(); g.step(WEED_RULES.readySeconds);
  assert.equal(g.centerIndex, 0);
});
