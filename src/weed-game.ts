// Fifth mini game: 하치와레 풀뽑기 (weed pulling), a one-button conveyor. Pure state machine like the other mini games:
// advanced only by step(dt), no DOM/phaser imports, so node tests can drive it. Six tiles (4 weeds, 2 flowers, shuffled
// by seed) sit in a row; the first one starts on the centre mark and the row slides one tile to the left every 0.7 s, or at once when the tile is answered.
// When the 6th tile is answered or has had its time the game ends. While a tile is on the centre mark: a weed must be pulled (press),
// a flower must be left alone. A press answers the tile and the row moves on immediately (no waiting out the rest of
// the time); a brief lock after that keeps an accidental double tap from answering the next tile.
// Success = weed pulled or flower left alone (max 6). Nothing is scored out loud: only the tiles' own reactions.
import { rewardForTier, type MiniTier } from './mini-tier.ts';
import type { MiniGame } from './mini-game';
export const WEED_RULES = {
  tiles: 6,
  flowers: 2,             // the rest are weeds
  stepSeconds: .7,        // a tile that is left alone stays on the centre mark this long, then the row slides one tile
  pressLock: .1,          // after a press moves the row on, the next tile ignores presses this long (an accidental double tap)
  readySeconds: .5,       // lead-in after start(): the tiles are shown but still; no input, the clock has not started
  goAt: .3,               // within the lead-in, the cue reads ready until this many seconds in, then go
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
/** Result tier by right answers out of 6: 6 perfect, 4-5 great, 1-3 good, 0 bad (coin penalty). Pulling no weed at all
 * (no input, flowers merely left alone) is bad whatever the count, like skipping any other game. */
export const weedTierFor = (right: number, pulled = right): MiniTier =>
  pulled < 1 ? 'bad' : right >= WEED_RULES.tiles ? 'perfect' : right >= 4 ? 'great' : right >= 1 ? 'good' : 'bad';
export function weedReactionFor(right: number): string {
  const n = weedSuccessesFor(right);
  return n >= 5 ? '깔끔해! 풀이 하나도 안 남았어' : n >= 3 ? '좋아! 꽃은 지키고 풀만 쏙쏙 뽑았어' : n >= 1 ? '조금씩 감이 잡히고 있어' : '괜찮아, 다시 한번 해 보자';
}

export class WeedGame implements MiniGame {
  phase: WeedPhase = 'intro';
  time = 0;                  // total seconds played (informational; tiles advance by index, not by this clock)
  index = 0;                 // tile on the centre mark
  lead = 0;                  // lead-in seconds left after start() (0 = tiles are running)
  tileClock = 0;             // seconds the current tile has been on the centre mark
  elapsed = 0;               // seconds in the current phase (used by the result countdown)
  paused = false;
  readonly seed: number;
  readonly row: readonly WeedTile[];
  readonly outcomes: (WeedOutcome | undefined)[] = [];
  constructor(seed: number) {
    this.seed = seed;
    this.row = weedRowFor(seed);
  }
  get tileCount() { return this.row.length; }
  /** Tile currently on the centre mark, or -1 outside the playing phase / once the 6th tile has had its second. */
  get centerIndex() { return this.phase === 'playing' && this.lead <= 0 && this.index < this.row.length ? this.index : -1; }
  /** Start cue text during the lead-in (ready, then go) and for a moment after, else ''. */
  get startCue(): '' | 'ready' | 'go' {
    if (this.phase !== 'playing' || this.lead <= 0) return '';
    return WEED_RULES.readySeconds - this.lead < WEED_RULES.goAt ? 'ready' : 'go';
  }
  /** Seconds the current tile has been on the centre mark (0..stepSeconds), for a progress cue. */
  get tileTime() { return this.centerIndex < 0 ? 0 : this.tileClock; }
  /** Row position in tiles: 0 = first tile on the centre mark; the row has slid this many tiles to the left (stepped). */
  get offset() { return this.phase === 'intro' ? 0 : Math.min(this.row.length - 1, this.index); } // stays on the last tile once play is over
  get judgedCount() { return this.outcomes.filter(o => o !== undefined).length; }
  /** Right answers so far: weeds pulled + flowers left alone (max 6). */
  get right() { return this.outcomes.filter(o => o === 'pulled' || o === 'passed').length; }
  get reward(): WeedReward | null {
    return this.phase === 'result' || this.phase === 'countdown' || this.phase === 'done' ? { ...rewardForTier('hachiware', this.tier), coins: rewardForTier('hachiware', this.tier).coins ?? 0 } : null;
  }
  get tier(): MiniTier { return weedTierFor(this.right, this.outcomes.filter(o => o === 'pulled').length); }
  get reaction() { return this.reward ? weedReactionFor(this.right) : ''; }
  get coinReward() { return this.reward?.coins ?? 0; }
  get countdownRemaining() { return this.phase === 'countdown' ? Math.max(0, WEED_RULES.countdownSeconds - this.elapsed) : this.phase === 'done' ? 0 : WEED_RULES.countdownSeconds; }
  get inPlay() { return this.phase !== 'intro' && this.phase !== 'result' && this.phase !== 'done'; }
  get interactive() { return this.phase === 'playing'; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  start() { if (this.phase === 'intro') { this.phase = 'playing'; this.time = 0; this.lead = WEED_RULES.readySeconds; this.index = 0; this.tileClock = 0; this.elapsed = 0; } }
  /** Result screen -> countdown, then 'done'. */
  continue() { if (this.phase === 'result') { this.phase = 'countdown'; this.elapsed = 0; } }

  /** The single button. Answers the tile on the centre mark and moves the row on at once; a flower pulled is a wrong answer. */
  press() {
    if (this.paused || this.phase !== 'playing') return;
    const i = this.centerIndex;
    if (i < 0 || (this.reachedByPress && this.tileClock < WEED_RULES.pressLock)) return; // accidental double tap
    this.outcomes[i] = this.row[i] === 'weed' ? 'pulled' : 'wrong';
    this.advance(true);
  }
  private reachedByPress = false;   // the current tile was reached by a press (so the double-tap lock applies)
  /** Moves to the next tile; the caller has already answered or settled the current one. */
  private advance(byPress: boolean) {
    this.index++; this.tileClock = 0; this.reachedByPress = byPress;
    if (this.index >= this.row.length) { this.phase = 'result'; this.elapsed = 0; }
  }
  release() { /* tap game: nothing to do */ }

  step(dt: number) {
    if (this.paused || !(dt > 0)) return;
    this.elapsed += dt;
    if (this.phase === 'countdown') { if (this.elapsed >= WEED_RULES.countdownSeconds) this.phase = 'done'; return; }
    if (this.phase !== 'playing') return;
    if (this.lead > 0) { // lead-in: the tiles wait; whatever is left of this frame starts the first tile
      if (dt < this.lead) { this.lead -= dt; return; }
      dt -= this.lead; this.lead = 0;
      if (!(dt > 0)) return;
    }
    this.time += dt; this.tileClock += dt;
    // A long frame may pass several tiles: tiles left alone are settled (weed missed, flower passed) and the row moves on.
    while (this.phase === 'playing' && this.tileClock >= WEED_RULES.stepSeconds - 1e-9) {
      const i = this.index, rest = this.tileClock - WEED_RULES.stepSeconds;
      if (this.outcomes[i] === undefined) this.outcomes[i] = this.row[i] === 'weed' ? 'missed' : 'passed';
      this.advance(false); if (this.phase === 'playing') this.tileClock = Math.max(0, rest);
    }
  }
}
