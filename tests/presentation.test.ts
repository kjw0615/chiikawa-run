import test from 'node:test';
import assert from 'node:assert/strict';
import { MONSTER_HEIGHT, MONSTER_WIDTH, monsterX, smoothGap } from '../src/presentation.ts';

test('initial monster intersects left edge and fills two thirds of the stage', () => {
  assert.ok(monsterX(30) < 0);
  assert.ok(monsterX(30) + MONSTER_WIDTH / 2 > 0);
  assert.equal(MONSTER_HEIGHT / 630, 2 / 3);
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
