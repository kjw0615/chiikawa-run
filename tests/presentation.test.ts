import test from 'node:test';
import assert from 'node:assert/strict';
import { MONSTER_HEIGHT, MONSTER_WIDTH, monsterX, smoothGap, chaseMarkerPercent } from '../src/presentation.ts';

test('smaller monster shows the previous three-hit exposure at the initial gap', () => {
  assert.ok(monsterX(30) - MONSTER_WIDTH / 2 < 0);
  assert.ok(monsterX(30) + MONSTER_WIDTH / 2 > 0);
  assert.equal(MONSTER_HEIGHT, 420 * 2 / 3);
  assert.equal(MONSTER_WIDTH, 630 * 2 / 3);
  assert.ok(Math.abs(monsterX(30) + MONSTER_WIDTH/2 - 265.5) < 1);
  assert.equal(monsterX(0) + MONSTER_WIDTH/2, 560);
});
test('hero marker moves away from the fixed left monster as gap grows', () => {
  assert.equal(chaseMarkerPercent(0), 8);
  assert.equal(chaseMarkerPercent(60), 92);
  assert.ok(chaseMarkerPercent(21) < chaseMarkerPercent(30));
  assert.equal(chaseMarkerPercent(-3), 8);
  assert.equal(chaseMarkerPercent(90), 92);
});
test('hit presentation approaches target smoothly without changing the rule distance', () => {
  const target = 27;
  let shown = smoothGap(30, target, 1 / 60);
  assert.ok(shown < 30 && shown > target);
  for (let i = 0; i < 120; i++) {
    const next = smoothGap(shown, target, 1 / 60);
    assert.ok(next <= shown && next >= target);
    shown = next;
  }
  assert.ok(Math.abs(shown-target) < .001);
  assert.ok(Math.abs(smoothGap(smoothGap(30,27,.1),27,.1)-smoothGap(30,27,.2)) < 1e-12);
});
