// Third mini game: 랏코 맹수 토벌 (small-monster hunting training with Master Rakko).
// A warning (예고) shows where a small monster will come from, then it runs toward the judge zone in front of
// Rakko. Press once when it reaches the zone. Three monsters, about 7 seconds. The whole game is a pure state
// machine advanced by step(dt); press()/release() are the only inputs, like the other mini games.
// Judging uses time, not pixels: error = |press time - moment the monster is on the zone's centre|.
// Perfect 2 / good 1 / miss 0 per monster (0..6); the sum is never shown, only the reaction and reward.
export const RAKKO_RULES = {
  rounds: 3,
  gapSeconds: .35,        // quiet time before each warning; presses here are ignored (nothing to answer yet)
  telegraphSeconds: .6,   // the warning: the monster has not started running
  travelMin: .85, travelMax: 1.15, // seconds for the monster to cross the whole stage (varies per monster)
  zoneX: .28,             // judge zone centre as a fraction of the stage width (monster runs from 1 down to 0)
  perfect: .08,           // |error| in seconds for a perfect
  good: .18,              // |error| in seconds for a good; beyond it a press is too early and no press is too late
  feedbackSeconds: .5,    // judgement is shown; presses here are ignored (duplicate taps)
  points: { perfect: 2, good: 1, miss: 0 },
  maxScore: 6,
  countdownSeconds: 3,
} as const;
export type RakkoPhase = 'intro' | 'playing' | 'result' | 'countdown' | 'done';
export type RakkoStage = 'gap' | 'telegraph' | 'incoming' | 'feedback';
export type RakkoGrade = 'perfect' | 'good' | 'miss';
export type MissReason = 'early' | 'late';
export type RakkoReward = { stamina: number; speedMultiplier: number; seconds: number; coins: number };

const tenth = (n: number) => Math.round(n * 10) / 10;
function unit(seed: number, salt: number): number {
  let h = (Math.imul(seed >>> 0, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Same reward curve as the other mini games: score scaled from 0..6 to 0..5 successes. */
export const rakkoSuccessesFor = (score: number) =>
  Math.round(Math.max(0, Math.min(RAKKO_RULES.maxScore, Math.floor(Number.isFinite(score) ? score : 0))) * 5 / RAKKO_RULES.maxScore);
export const rakkoRewardFor = (score: number): RakkoReward => {
  const n = rakkoSuccessesFor(score);
  return { stamina: n * 6, speedMultiplier: tenth(1 + n / 10), seconds: tenth(n * .4), coins: n };
};
export const rakkoGradeFor = (error: number): RakkoGrade =>
  error <= RAKKO_RULES.perfect + 1e-9 ? 'perfect' : error <= RAKKO_RULES.good + 1e-9 ? 'good' : 'miss';
export function rakkoReactionFor(score: number): string {
  if (score >= 6) return '좋아, 완벽한 타이밍이야!';
  if (score >= 4) return '잘했어! 감이 잡히고 있구나';
  if (score >= 2) return '괜찮아, 조금만 더 연습하자';
  return '긴장하지 말고 다시 해 보자';
}

export class RakkoGame {
  phase: RakkoPhase = 'intro';
  stage: RakkoStage = 'gap';
  round = 0;                 // 0-based index of the current monster
  roundTime = 0;             // seconds into the current stage
  elapsed = 0;               // seconds in the current phase (used by the result countdown)
  paused = false;
  readonly seed: number;
  readonly travel: readonly number[]; // seconds the monster needs to cross the stage, per round
  readonly grades: (RakkoGrade | undefined)[] = [];
  readonly misses: (MissReason | undefined)[] = [];
  lastGrade: RakkoGrade | null = null; // what the feedback currently shows
  constructor(seed: number) {
    this.seed = seed;
    this.travel = Array.from({ length: RAKKO_RULES.rounds }, (_, n) => RAKKO_RULES.travelMin + (RAKKO_RULES.travelMax - RAKKO_RULES.travelMin) * unit(seed, n + 1));
  }
  /** Seconds after the run starts at which the current monster is exactly on the zone centre. */
  get arriveSeconds() { return this.travel[Math.min(this.round, RAKKO_RULES.rounds - 1)] * (1 - RAKKO_RULES.zoneX); }
  /** Monster position along the stage: 1 = right edge (not started), 0 = left edge. Null when no monster is shown. */
  get monsterX(): number | null {
    if (this.phase !== 'playing') return null;
    if (this.stage === 'telegraph') return 1;
    if (this.stage === 'incoming') return 1 - this.roundTime / this.travel[this.round];
    if (this.stage === 'feedback' && this.lastGrade === 'miss' && this.misses[this.round] === 'late')
      return 1 - (this.arriveSeconds + RAKKO_RULES.good + this.roundTime) / this.travel[this.round]; // keeps running past Rakko
    return null;
  }
  get score() {
    const p = RAKKO_RULES.points;
    return this.grades.reduce<number>((sum, g) => sum + (g ? p[g] : 0), 0);
  }
  get reward(): RakkoReward | null { return this.phase === 'result' || this.phase === 'countdown' || this.phase === 'done' ? rakkoRewardFor(this.score) : null; }
  get reaction() { return this.reward ? rakkoReactionFor(this.score) : ''; }
  get coinReward() { return rakkoSuccessesFor(this.score); }
  get countdownRemaining() { return this.phase === 'countdown' ? Math.max(0, RAKKO_RULES.countdownSeconds - this.elapsed) : this.phase === 'done' ? 0 : RAKKO_RULES.countdownSeconds; }
  get inPlay() { return this.phase !== 'intro' && this.phase !== 'result' && this.phase !== 'done'; }
  get interactive() { return this.phase === 'playing'; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  start() { if (this.phase === 'intro') { this.phase = 'playing'; this.stage = 'gap'; this.round = 0; this.roundTime = 0; this.elapsed = 0; } }
  /** Result screen -> countdown, then 'done'. */
  continue() { if (this.phase === 'result') { this.phase = 'countdown'; this.elapsed = 0; } }

  private to(stage: RakkoStage) { this.stage = stage; this.roundTime = 0; }
  private resolve(grade: RakkoGrade, reason?: MissReason) {
    this.grades[this.round] = grade; this.misses[this.round] = reason; this.lastGrade = grade; this.to('feedback');
  }
  /** One answer per monster. Too early (during the warning, or before the good window) is a miss; so is a late or missing press. */
  press() {
    if (this.paused || this.phase !== 'playing') return;
    if (this.stage === 'telegraph') { this.resolve('miss', 'early'); return; }
    if (this.stage !== 'incoming') return; // gap and feedback: ignored, so a stray or duplicate tap costs nothing
    const error = this.roundTime - this.arriveSeconds;
    if (error < -RAKKO_RULES.good - 1e-9) this.resolve('miss', 'early');
    else this.resolve(rakkoGradeFor(Math.abs(error)));
  }
  release() { /* tap game: nothing to do */ }

  step(dt: number) {
    if (this.paused || !(dt > 0)) return;
    this.elapsed += dt;
    if (this.phase === 'countdown') { if (this.elapsed >= RAKKO_RULES.countdownSeconds) { this.phase = 'done'; } return; }
    if (this.phase !== 'playing') return;
    // A long frame may cross several stage boundaries: carry the remainder over instead of dropping it.
    let left = dt;
    while (left > 0 && this.phase === 'playing') {
      const length = this.stageLength();
      const room = length - this.roundTime;
      if (left < room) { this.roundTime += left; break; }
      left -= room; this.roundTime = length;
      if (!this.advance()) break;
      this.roundTime = 0;
    }
  }
  private stageLength() {
    switch (this.stage) {
      case 'gap': return RAKKO_RULES.gapSeconds;
      case 'telegraph': return RAKKO_RULES.telegraphSeconds;
      case 'incoming': return this.arriveSeconds + RAKKO_RULES.good; // past this the monster has gone by: too late
      default: return RAKKO_RULES.feedbackSeconds;
    }
  }
  /** Moves to the next stage; returns false when the game stops stepping (result reached). */
  private advance(): boolean {
    switch (this.stage) {
      case 'gap': this.stage = 'telegraph'; return true;
      case 'telegraph': this.stage = 'incoming'; return true;
      case 'incoming': this.grades[this.round] = 'miss'; this.misses[this.round] = 'late'; this.lastGrade = 'miss'; this.stage = 'feedback'; return true;
      default:
        if (this.round + 1 >= RAKKO_RULES.rounds) { this.phase = 'result'; this.elapsed = 0; this.lastGrade = null; return false; }
        this.round++; this.stage = 'gap'; this.lastGrade = null; return true;
    }
  }
}
