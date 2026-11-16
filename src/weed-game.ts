// Fifth mini game: 하치와레 풀뽑기 (weed pulling), a one-button conveyor. Pure state machine like the other mini games:
// advanced only by step(dt), no DOM/phaser imports, so node tests can drive it. Six tiles (4 weeds, 2 flowers, shuffled
// by seed) sit in a row; the first one starts on the centre mark and every second the row slides one tile to the left.
// When the 6th tile has had its second the game ends. While a tile is on the centre mark: a weed must be pulled (press),
// a flower must be left alone. Each tile is answered at most once (a second press in the same second is ignored).
// Success = weed pulled or flower left alone (max 6). Nothing is scored out loud: only the tiles' own reactions.
import type { MiniGame } from './mini-game';
export const WEED_RULES = {
  tiles: 6,
  flowers: 2,             // the rest are weeds
  stepSeconds: 1,         // every tile stays on the centre mark for this long, then the row slides one tile
  countdownSeconds: 3,
} as const;
export type WeedTile = 'weed' | 'flower';
/** pulled = weed pulled (success), passed = flower left alone (success), missed = weed left, wrong = flower pulled. */
export type WeedOutcome = 'pulled' | 'passed' | 'missed' | 'wrong';
export type WeedPhase = 'intro' | 'playing' | 'result' | 'countdown' | 'done';
export type WeedReward = { stamina: number; speedMultiplier: number; seconds: number; coins: number };

const tenth = (n: number) => Math.round(n * 10) / 10;
function unit(seed: number, salt: number): number {
  let h = (Math.imul(seed >>> 0, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Row for this seed: exactly WEED_RULES.flowers flowers, the rest weeds, in a seeded shuffled order. */
export function weedRowFor(seed: number): WeedTile[] {
  const row: WeedTile[] = Array.from({ length: WEED_RULES.tiles }, (_, i) => (i < WEED_RULES.flowers ? 'flower' : 'weed'));
  for (let i = row.length - 1; i > 0; i--) {
    const j = Math.floor(unit(seed, i) * (i + 1));
    [row[i], row[j]] = [row[j], row[i]];
  }
  return row;
}
/** Same 0..5 "successes" shape as the other mini games: right answers out of 6, scaled (6 right = 5, 0 right = 0). */
export const weedSuccessesFor = (right: number) =>
  Math.max(0, Math.min(5, Math.round(Math.max(0, right) * 5 / WEED_RULES.tiles)));
export const weedRewardFor = (right: number): WeedReward => {
  const n = weedSuccessesFor(right);
  return { stamina: n * 6, speedMultiplier: tenth(1 + n / 10), seconds: tenth(n * .4), coins: n };
};
export function weedReactionFor(right: number): string {
  const n = weedSuccessesFor(right);
  return n >= 5 ? '깔끔해! 풀이 하나도 안 남았어' : n >= 3 ? '좋아! 꽃은 지키고 풀만 쏙쏙 뽑았어' : n >= 1 ? '조금씩 감이 잡히고 있어' : '괜찮아, 다시 한번 해 보자';
}

export class WeedGame implements MiniGame {
  phase: WeedPhase = 'intro';
  time = 0;                  // seconds into the playing phase: the one clock everything is judged against
  elapsed = 0;               // seconds in the current phase (used by the result countdown)
  paused = false;
  readonly seed: number;
  readonly row: readonly WeedTile[];
  readonly outcomes: (WeedOutcome | undefined)[] = [];
  private answered: boolean[] = [];   // a press was already used on this tile
  constructor(seed: number) {
    this.seed = seed;
    this.row = weedRowFor(seed);
  }
  get tileCount() { return this.row.length; }
  /** Tile currently on the centre mark, or -1 outside the playing phase / once the 6th tile has had its second. */
  get centerIndex() {
    if (this.phase !== 'playing') return -1;
    const i = Math.floor(this.time / WEED_RULES.stepSeconds + 1e-9);
    return i < this.row.length ? i : -1;
  }
  /** Seconds the current tile has been on the centre mark (0..stepSeconds), for a progress cue. */
  get tileTime() { const i = this.centerIndex; return i < 0 ? 0 : this.time - i * WEED_RULES.stepSeconds; }
  /** Row position in tiles: 0 = first tile on the centre mark; the row has slid this many tiles to the left (stepped). */
  get offset() { return this.phase === 'intro' ? 0 : Math.min(this.row.length - 1, Math.floor(this.time / WEED_RULES.stepSeconds + 1e-9)); } // stays on the last tile once play is over
  get judgedCount() { return this.outcomes.filter(o => o !== undefined).length; }
  /** Right answers so far: weeds pulled + flowers left alone (max 6). */
  get right() { return this.outcomes.filter(o => o === 'pulled' || o === 'passed').length; }
  get reward(): WeedReward | null {
    return this.phase === 'result' || this.phase === 'countdown' || this.phase === 'done' ? weedRewardFor(this.right) : null;
  }
  get reaction() { return this.reward ? weedReactionFor(this.right) : ''; }
  get coinReward() { return this.reward?.coins ?? 0; }
  get countdownRemaining() { return this.phase === 'countdown' ? Math.max(0, WEED_RULES.countdownSeconds - this.elapsed) : this.phase === 'done' ? 0 : WEED_RULES.countdownSeconds; }
  get inPlay() { return this.phase !== 'intro' && this.phase !== 'result' && this.phase !== 'done'; }
  get interactive() { return this.phase === 'playing'; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  start() { if (this.phase === 'intro') { this.phase = 'playing'; this.time = 0; this.elapsed = 0; } }
  /** Result screen -> countdown, then 'done'. */
  continue() { if (this.phase === 'result') { this.phase = 'countdown'; this.elapsed = 0; } }

  /** The single button. Pulls the tile on the centre mark once; a flower pulled is a wrong answer. */
  press() {
    if (this.paused || this.phase !== 'playing') return;
    const i = this.centerIndex;
    if (i < 0 || this.answered[i]) return;
    this.answered[i] = true;
    this.outcomes[i] = this.row[i] === 'weed' ? 'pulled' : 'wrong';
  }
  release() { /* tap game: nothing to do */ }

  step(dt: number) {
    if (this.paused || !(dt > 0)) return;
    this.elapsed += dt;
    if (this.phase === 'countdown') { if (this.elapsed >= WEED_RULES.countdownSeconds) this.phase = 'done'; return; }
    if (this.phase !== 'playing') return;
    this.time += dt;
    // Tiles whose second is over without an answer are settled (a long frame may settle several at once).
    const over = Math.min(this.row.length, Math.floor(this.time / WEED_RULES.stepSeconds + 1e-9));
    for (let i = 0; i < over; i++) if (this.outcomes[i] === undefined) this.outcomes[i] = this.row[i] === 'weed' ? 'missed' : 'passed';
    if (this.time >= this.row.length * WEED_RULES.stepSeconds - 1e-9) { this.phase = 'result'; this.elapsed = 0; }
  }
}
