import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../public/assets/', import.meta.url);
const atlas = JSON.parse(readFileSync(new URL('game-atlas.json', root)));
test('atlas frames are inside the texture and do not overlap', () => {
  const frames = Object.entries(atlas.frames);
  assert.ok(frames.length >= 9);
  for (const [name, {frame:f}] of frames) {
    assert.ok(f.x >= 0 && f.y >= 0 && f.w > 0 && f.h > 0, name);
    assert.ok(f.x + f.w <= atlas.meta.size.w && f.y + f.h <= atlas.meta.size.h, name);
    for (const [other, {frame:g}] of frames) if (other !== name) assert.ok(f.x + f.w <= g.x || g.x + g.w <= f.x || f.y + f.h <= g.y || g.y + g.h <= f.y, `${name}/${other}`);
  }
});
test('packed texture and home images are WebP, and runtime texture is under 500KB', () => {
  for (const name of ['game-atlas', 'momonga', 'dekatsuyo', 'food-pudding', 'food-pancake', 'food-cream-puff']) {
    const bytes = readFileSync(new URL(`${name}.webp`, root));
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF'); assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    if (name === 'game-atlas') assert.ok(bytes.length < 500_000);
  }
});
