import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));

test('every element id the game script looks up exists in index.html', () => {
  const used = [...main.matchAll(/\$(?:<[^>]+>)?\('([\w-]+)'\)/g)].map(m => m[1]);
  assert.ok(used.length > 30);
  for (const id of new Set(used)) assert.ok(ids.has(id), `main.ts uses #${id} but index.html has no such id`);
});

test('the mini game card has no top-right buttons; the countdown keeps its own resume button hidden by default', () => {
  const card = html.slice(html.indexOf('id="mini-screen"'), html.indexOf('</section>', html.indexOf('id="mini-screen"')));
  assert.ok(card.length > 100);
  assert.equal(/<button[^>]*id="mini-(pause|home)"/.test(card), false);
  assert.equal(card.includes('mini-top-buttons'), false);
  assert.equal((card.match(/<button/g) ?? []).length, 1, 'only the centered action button remains inside the card');
  for (const gone of ['mini-pause', 'mini-home', 'mini-top-buttons']) assert.equal(main.includes(`'${gone}'`), false, `${gone} left in main.ts`);
  assert.match(html, /id="countdown-resume"[^>]*\shidden/);
});
