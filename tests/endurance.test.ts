import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerModel, RULES, type Item } from '../src/model.ts';

// Drives the real generated course through public inputs only. No invulnerability,
// stamina refill, teleporting, item deletion or score/gap mutation is allowed.
function drive(seed: number) {
  const m = new RunnerModel(seed); m.start();
  let active: Item | undefined, takeoff = 0, second = false, rescues = 0, lastRescue = false;
  let lowestStamina = 100;
  let overlap: Item | undefined;
  const travel = (seconds: number) => Math.min(seconds, m.boost) * RULES.boostSpeed
    + Math.max(0, seconds-m.boost) * (m.exhausted ? RULES.exhaustedSpeed : RULES.speed);
  for (let frame = 0; frame < 120 * 260 && m.distance < 1000 && m.phase === 'running'; frame++) {
    const upcoming = m.items.filter(i => !i.used && i.x + (i.w/2+RULES.halfHitWidth)/RULES.scale > m.distance)
      .sort((a,b) => a.x-b.x);
    const beam = upcoming.find(i => i.kind === 'beam');
    m.crouch = !!beam && beam.x-m.distance < beam.w/2/RULES.scale + .9;
    if (m.grounded) {
      active = undefined;
      const next = upcoming.find(i => i.kind !== 'beam' && i.x > m.distance
        && (!['food','gold'].includes(i.kind) || RULES.floor-i.y >= RULES.playerHeight+32
          // Skip an optional airborne gold just before a tower: its mid-flight
          // acceleration can consume the tower's takeoff window before landing.
          && !(i.kind === 'gold' && upcoming.some(h => h.kind === 'tower' && h.x > i.x && h.x-i.x < 8))));
      if (next) {
        const food = next.kind === 'food' || next.kind === 'gold';
        const lead = food ? travel(.6) : next.w/2/RULES.scale + RULES.halfHitWidth/RULES.scale
          + travel(next.kind === 'tower' ? .4 : next.kind === 'long' ? .16 : .22);
        // A beam before this target must be fully cleared before taking off.
        const blockedByBeam = beam && beam.x < next.x && beam.x + (beam.w/2+RULES.halfHitWidth)/RULES.scale > m.distance;
        if (!blockedByBeam && next.x-m.distance <= lead) {
          m.crouch = false; m.jump(); active = next; takeoff = m.elapsed; second = false;
        }
      }
    } else if (active && !second) {
      const delay = active.kind === 'tower' ? .3 : active.kind === 'long' ? .6 : active.kind === 'pit' ? .4 : m.exhausted && active.kind === 'block' ? .3 : Infinity;
      if (m.elapsed-takeoff >= delay) { m.jump(); second = true; }
    }
    m.step(1/120);
    // Even natural gold immunity must not hide a mistimed obstacle avoidance.
    overlap = m.items.find(i => !['food','gold','pit'].includes(i.kind)
      && Math.abs((i.x-m.distance)*RULES.scale) < i.w/2+RULES.halfHitWidth
      && m.y > i.y && m.y-m.height < i.y+i.h);
    if (m.rescue && !lastRescue) rescues++;
    lastRescue = !!m.rescue;
    lowestStamina = Math.min(lowestStamina, m.stamina);
    if (m.hits || rescues || overlap || m.exhausted) break;
  }
  return { seed, distance: m.distance, hits: m.hits, rescues, phase: m.phase, foods: m.foods, lowestStamina, exhausted: m.exhausted,
    overlap,
    ...(m.hits || rescues || overlap ? { y:m.y, jumps:m.jumps, active, second, flight:m.elapsed-takeoff,
      nearby:m.items.filter(i => Math.abs(i.x-m.distance)<6) } : {}) };
}

test('input-only courses stay collision-free until 1000m or natural exhaustion', () => {
  const seeds = [...new Set([13579, 99, 2026, 31337, 424242, ...Array.from({length:128}, (_,i) => i+1)])];
  let lowest = 100, minFoods = Infinity, maxFoods = 0, completed = 0, minDistance = Infinity;
  for (const seed of seeds) {
    const result = drive(seed);
    lowest = Math.min(lowest, result.lowestStamina);
    minDistance = Math.min(minDistance, result.distance);
    if (result.distance >= 1000) completed++;
    minFoods = Math.min(minFoods, result.foods); maxFoods = Math.max(maxFoods, result.foods);
    assert.equal(result.hits, 0, JSON.stringify(result));
    assert.equal(result.rescues, 0, JSON.stringify(result));
    assert.equal(result.overlap, undefined, JSON.stringify(result));
    assert.equal(result.phase, 'running', JSON.stringify(result));
    assert.ok(result.distance >= 1000 || result.exhausted, JSON.stringify(result));
    if (result.exhausted) assert.equal(result.lowestStamina, 0);
  }
  console.log(`${seeds.length} seeded input-only runs: ${completed} reached 1000m before exhaustion, ${seeds.length-completed} exhausted first; earliest stop ${minDistance.toFixed(2)}m; zero hits/rescues/overlaps, foods ${minFoods}..${maxFoods}, minimum stamina ${lowest.toFixed(2)}`);
});
