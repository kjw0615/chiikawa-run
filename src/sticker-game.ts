import { rewardForTier, type MiniTier } from './mini-tier.ts';

// Lemon-sticker mini game: a self-contained state machine.
// It owns its own clock (advanced only by step(dt)) and never touches the runner model. Whoever
// embeds it freezes it simply by not calling step(), or with pause()/resume(). Rewards are only
// computed here; the caller applies them once when the phase becomes 'done'.
export const MINI_RULES = {
  selectionSeconds: 2, roundSeconds: 2.8, feedbackSeconds: .45, countdownSeconds: 3,
  targetMin: .36, targetMax: .64, rounds: 5,
  // The sticker is this wide (share of the stage). A stamp succeeds only when the whole sticker lies inside the band.
  stickerWidth: .08,
} as const;
// Each round sweeps clearly faster than the one before. Per-round caps run .92 .98 1.04 1.10 1.16 cycles/s; at the
// last cap one pass through the band (width .28, cursor speed 2 x cycles/s) lasts about .12 s.
export const SPEED_RULES = { roundScale: [1, 1.18, 1.36, 1.55, 1.75], cap: 1.16, capStep: .06 } as const;
export type MiniPhase = 'selecting' | 'intro' | 'playing' | 'feedback' | 'result' | 'countdown' | 'done';
export type Character = 'chiikawa' | 'hachiware' | 'usagi';
export const CHARACTERS: readonly Character[] = ['chiikawa', 'hachiware', 'usagi'];
export type Reward = { stamina: number; speedMultiplier: number; seconds: number; coins?: number };

/** Four coin tiers; the runner applies negative coins safely when this game is completed. */
export function stickerTierFor(successes: number): MiniTier {
  const n = Math.max(0, Math.min(MINI_RULES.rounds, Math.floor(Number.isFinite(successes) ? successes : 0)));
  return n === MINI_RULES.rounds ? 'perfect' : n >= 3 ? 'great' : n >= 1 ? 'good' : 'bad';
}
export const rewardFor = (successes: number): Reward => rewardForTier('chiikawa', stickerTierFor(successes));

const EPS = 1e-9;
// Deterministic mixing so each (seed, salt) pair gives an independent value in [0, 1).
function unit(seed: number, salt: number): number {
  let h = (Math.imul(seed >>> 0, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const characterFor = (seed: number): Character => CHARACTERS[Math.min(2, Math.floor(unit(seed, 0) * 3))];
// Cursor position in [0, 1]: a triangle wave (back and forth) of `u` cycles.
const triangle = (u: number) => { const f = u - Math.floor(u); return 1 - Math.abs(2 * f - 1); };

export class StickerGame {
  phase: MiniPhase = 'selecting';
  elapsed = 0; // seconds spent in the current phase (starts again at 0 in each phase)
  readonly selected: Character;
  round = 0; // 0..4
  results: boolean[] = [];
  paused = false;
  readonly baseSpeed: number; // seed speed in cursor cycles per second, before the round scale
  private lastCursor = 0;
  readonly seed: number;
  /** `character` fixes who works with the player; `skipSelection` starts at the guide (the caller already ran the slot). */
  constructor(seed: number, opts: { character?: Character; skipSelection?: boolean } = {}) {
    this.seed = seed; this.selected = opts.character ?? characterFor(seed);
    if (opts.skipSelection) this.phase = 'intro';
    this.baseSpeed = .68 + .2 * unit(seed, 1);
  }
  speedAt(round: number) {
    const scale = SPEED_RULES.roundScale[Math.max(0, Math.min(SPEED_RULES.roundScale.length - 1, round))];
    const last = SPEED_RULES.roundScale.length - 1, r = Math.max(0, Math.min(last, round));
    // Per-round caps (.92 .98 1.04 1.10 1.16) keep every round strictly faster than the one before it.
    return Math.min(SPEED_RULES.cap - (last - r) * SPEED_RULES.capStep, this.baseSpeed * scale);
  }
  /** Cursor cycles per second in the current round; judging and the timeout use this same value. */
  get speed() { return this.speedAt(this.round); }
  get successes() { return this.results.filter(Boolean).length; }
  get cursor() {
    if (this.phase === 'playing') return triangle(unit(this.seed, 10 + this.round) + this.speed * this.elapsed);
    return this.lastCursor;
  }
  get tier(): MiniTier { return stickerTierFor(this.successes); }
  /** Same signed coin value as reward; the shell forwards it once. */
  get coinReward() { return this.reward?.coins ?? 0; }
  get reward(): Reward | null { return this.results.length >= MINI_RULES.rounds ? rewardFor(this.successes) : null; }
  get inPlay() { return this.phase === 'selecting' || this.phase === 'playing' || this.phase === 'feedback' || this.phase === 'countdown'; }
  get interactive() { return this.phase === 'playing'; }
  /** Tap input: stamps during a round, ignored in every other phase. */
  press() { if (this.phase === 'playing') this.stamp(); }
  release() { /* tap game: nothing to do */ }
  get lastHit() { return this.results.length ? this.results[this.results.length - 1] : null; }
  get countdownRemaining() { return this.phase === 'countdown' ? Math.max(0, MINI_RULES.countdownSeconds - this.elapsed) : this.phase === 'done' ? 0 : MINI_RULES.countdownSeconds; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  private limit(): number | null {
    switch (this.phase) {
      case 'selecting': return MINI_RULES.selectionSeconds;
      case 'playing': return MINI_RULES.roundSeconds;
      case 'feedback': return MINI_RULES.feedbackSeconds;
      case 'countdown': return MINI_RULES.countdownSeconds;
      default: return null; // intro, result and done wait for the caller
    }
  }
  step(dt: number) {
    if (this.paused || !(dt > 0)) return;
    let left = dt;
    for (let guard = 0; guard < 64 && left > 0; guard++) {
      const limit = this.limit(); if (limit === null) return;
      const need = Math.max(0, limit - this.elapsed);
      if (left < need - EPS) { this.elapsed += left; return; }
      left -= need; this.advance();
    }
  }
  private advance() {
    this.elapsed = 0;
    if (this.phase === 'selecting') this.phase = 'intro'; // guide stays until start(); it is not timed
    else if (this.phase === 'playing') this.finishRound(false, this.cursorAtEnd());
    else if (this.phase === 'feedback') {
      if (this.results.length >= MINI_RULES.rounds) this.phase = 'result';
      else { this.round = this.results.length; this.phase = 'playing'; }
    } else if (this.phase === 'countdown') this.phase = 'done';
  }
  private cursorAtEnd() { return triangle(unit(this.seed, 10 + this.round) + this.speed * MINI_RULES.roundSeconds); }
  private finishRound(hit: boolean, cursor: number) {
    this.results.push(hit); this.lastCursor = cursor; this.phase = 'feedback'; this.elapsed = 0;
  }
  start() { if (!this.paused && this.phase === 'intro') { this.phase = 'playing'; this.elapsed = 0; this.round = this.results.length; } }
  /** Judges the current cursor once; ignored outside 'playing' or while paused. */
  stamp(): boolean | null {
    if (this.paused || this.phase !== 'playing') return null;
    const c = this.cursor, half = MINI_RULES.stickerWidth / 2;
    const hit = c - half >= MINI_RULES.targetMin - EPS && c + half <= MINI_RULES.targetMax + EPS;
    this.finishRound(hit, c); return hit;
  }
  continue() { if (!this.paused && this.phase === 'result') { this.phase = 'countdown'; this.elapsed = 0; } }
}
