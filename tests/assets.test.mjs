import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../public/assets/', import.meta.url);
const atlas = JSON.parse(readFileSync(new URL('game-atlas.json', root)));

test('monster animation resolution covers its displayed size without upscaling', () => {
  for (let i = 0; i < 4; i++) {
    const f = atlas.frames[`dekatsuyo-run-${i}`].frame;
    assert.ok(f.w >= 420 && f.h >= 280);
  }
});
test('atlas frames are inside the texture and do not overlap', () => {
  const frames = Object.entries(atlas.frames);
  assert.ok(frames.length === 17);
  for (const [name, {frame:f}] of frames) {
    assert.ok(f.x >= 0 && f.y >= 0 && f.w > 0 && f.h > 0, name);
    assert.ok(f.x + f.w <= atlas.meta.size.w && f.y + f.h <= atlas.meta.size.h, name);
    for (const [other, {frame:g}] of frames) if (other !== name) assert.ok(f.x + f.w <= g.x || g.x + g.w <= f.x || f.y + f.h <= g.y || g.y + g.h <= f.y, `${name}/${other}`);
  }
});
test('packed texture and home images are WebP, and runtime texture is under 1MB', () => {
  for (const name of ['game-atlas', 'momonga', 'dekatsuyo', 'food-pudding', 'food-pancake', 'food-cream-puff']) {
    const bytes = readFileSync(new URL(`${name}.webp`, root));
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF'); assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    if (name === 'game-atlas') assert.ok(bytes.length < 1_000_000);
  }
});
test('mini-game sheet packs three portraits, grounded NPC and lemon into one small WebP', () => {
  const event = JSON.parse(readFileSync(new URL('event-atlas.json', root)));
  const names = ['chiikawa', 'hachiware', 'usagi', 'mob', 'lemon'];
  assert.deepEqual(Object.keys(event.frames), names);
  assert.deepEqual(event.meta.size, { w: 1024, h: 256 });
  names.forEach((name, n) => {
    const f = event.frames[name].frame;
    assert.deepEqual(f, { x: n * 196 + 2, y: 2, w: 192, h: 224 });
    assert.ok(f.x + f.w <= 1024 && f.y + f.h <= 256);
  });
  const bytes = readFileSync(new URL('event-atlas.webp', root));
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  assert.ok(bytes.length < 250_000);
});
