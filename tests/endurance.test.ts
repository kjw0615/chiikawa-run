import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerModel, RULES, type Item } from '../src/model.ts';
import { StickerGame, MINI_RULES } from '../src/sticker-game.ts';

// Drives the real generated course through public inputs only. No invulnerability,
// stamina refill, teleporting, item deletion or score/gap mutation is allowed.
function drive(seed: number, platforms = false, encounters = false, successTarget = 5) {
  const m = new RunnerModel(seed, true, { platforms, encounters }); m.start();
  let active: Item | undefined, takeoff = 0, second = false, rescues = 0, lastRescue = false;
  let lowestStamina = 100;
  let overlap: Item | undefined, upperLandings = 0, lastUpper = false, blockedFrames = 0, miniGames = 0;
  const press = () => { m.releaseJump(); m.jump(); };
  const travel = (seconds: number) => {
    const cuts = [0, seconds, Math.min(seconds, m.boost), Math.min(seconds, m.eventBoost)].sort((a,b) => a-b);
    let distance = 0;
    for (let n = 1; n < cuts.length; n++) {
      const mid = (cuts[n]+cuts[n-1])/2;
      distance += (cuts[n]-cuts[n-1]) * Math.max(m.exhausted ? RULES.exhaustedSpeed : RULES.speed,
        m.boost > mid ? RULES.boostSpeed : 0, m.eventBoost > mid ? RULES.speed*m.eventMultiplier : 0);
    }
    return distance;
  };
  for (let frame = 0; frame < 120 * 260 && m.distance < 1000 && (m.phase === 'running' || m.phase === 'minigame'); frame++) {
    if (m.phase === 'minigame') {
      const npc = m.activeEncounter!;
      const mini = new StickerGame(npc.seed);
      for (let f = 0; f < 120 * 40 && mini.phase !== 'done'; f++) {
        if (mini.phase === 'intro') mini.start();
        if (mini.phase === 'playing') {
          const inside = mini.cursor > MINI_RULES.targetMin + .02 && mini.cursor < MINI_RULES.targetMax - .02;
          if (mini.round < successTarget ? inside : mini.cursor < .2) mini.stamp();
        }
        if (mini.phase === 'result') mini.continue();
        mini.step(1/120); m.step(1/120); // runner step must remain frozen throughout
      }
      assert.equal(mini.phase, 'done');
      assert.ok(m.completeEncounter(npc.id, mini.reward!)); miniGames++;
    }
    const upcoming = m.items.filter(i => !i.used && i.x + (i.w/2+RULES.halfHitWidth)/RULES.scale > m.distance)
      .sort((a,b) => a.x-b.x);
    const beam = upcoming.find(i => i.kind === 'beam');
    m.crouch = !!beam && beam.x-m.distance < beam.w/2/RULES.scale + .9 && m.y <= beam.y+beam.h+RULES.playerHeight;
    if (m.grounded) {
      active = undefined;
      const branch = m.platforms.find(p => p.end > m.distance && p.start >= m.distance && m.y > p.y);
      if (branch && branch.start-m.distance <= travel(.34)) {
        m.crouch = false; press();
      } else {
      const next = upcoming.find(i => i.kind !== 'beam' && i.x > m.distance
        && (!['food','gold'].includes(i.kind) || m.supportY-i.y >= RULES.playerHeight+32
          // Prioritize a tower's two-jump takeoff over optional food immediately
          // before it, including during the longer mini-game speed reward.
          && !((i.kind === 'gold' || encounters) && upcoming.some(h => h.kind === 'tower' && h.x > i.x && h.x-i.x < 8))));
      if (next) {
        const food = next.kind === 'food' || next.kind === 'gold';
        const lead = food ? travel(.6) : next.w/2/RULES.scale + RULES.halfHitWidth/RULES.scale
          + travel(next.kind === 'tower' ? .4 : next.kind === 'long' ? .16 : .22);
        // A beam before this target must be fully cleared before taking off.
        const blockedByBeam = beam && beam.x < next.x && beam.x + (beam.w/2+RULES.halfHitWidth)/RULES.scale > m.distance;
        if (!blockedByBeam && next.x-m.distance <= lead) {
          m.crouch = false; press(); active = next; takeoff = m.elapsed; second = false;
        }
      }
      }
    } else if (active && !second) {
      const delay = active.kind === 'tower' ? .3 : active.kind === 'long' ? .6 : active.kind === 'pit' ? .4 : m.exhausted && active.kind === 'block' ? .3 : Infinity;
      if (m.elapsed-takeoff >= delay) { press(); second = true; }
    }
    m.step(1/120);
    const upper = m.grounded && m.supportY < RULES.floor;
    if (upper && !lastUpper) upperLandings++;
    lastUpper = upper;
    if (m.blocked) blockedFrames++;
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
    overlap, upperLandings, blockedFrames, miniGames,
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

test('two-level input-only courses clear both routes until 1000m or natural exhaustion', () => {
  const seeds = [...new Set([13579, 99, 2026, 31337, 424242, ...Array.from({length:128}, (_,i) => i+1)])];
  let landings = 0, blocked = 0, minimum = Infinity;
  for (const seed of seeds) {
    const result = drive(seed, true);
    assert.equal(result.hits, 0, JSON.stringify(result));
    assert.equal(result.rescues, 0, JSON.stringify(result));
    assert.equal(result.overlap, undefined, JSON.stringify(result));
    assert.equal(result.phase, 'running', JSON.stringify(result));
    assert.ok(result.distance >= 1000 || result.exhausted, JSON.stringify(result));
    assert.ok(result.upperLandings > 0, JSON.stringify(result));
    landings += result.upperLandings; blocked += result.blockedFrames;
    minimum = Math.min(minimum, result.distance);
  }
  console.log(`two-level ${seeds.length} seeds: ${landings} upper landings, ${blocked} blocked frames, earliest stop ${minimum.toFixed(2)}m; no hits/rescues/overlaps`);
});

test('default course can enter, finish and resume mini games using public inputs only', () => {
  let events = 0;
  for (const seed of [13579, 99, 2026, 31337, 424242, ...Array.from({length:32}, (_,i) => i+1)]) {
    const result = drive(seed, true, true, [5,3,0][seed % 3]);
    assert.equal(result.hits, 0, JSON.stringify(result));
    assert.equal(result.rescues, 0, JSON.stringify(result));
    assert.equal(result.overlap, undefined, JSON.stringify(result));
    assert.equal(result.phase, 'running', JSON.stringify(result));
    assert.ok(result.distance >= 1000 || result.exhausted, JSON.stringify(result));
    assert.ok(result.miniGames >= 1, JSON.stringify(result)); events += result.miniGames;
  }
  console.log(`default runner + sticker games: 37 seeds, all three reward grades, ${events} finished encounters; zero hits/rescues/overlaps in measured segments`);
});
