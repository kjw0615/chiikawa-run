// Third mini game: 랏코 맹수 토벌 (small-monster hunting training with Master Rakko), converge timing.
// Rakko (left) faces a small monster (right). Along a horizontal rail, two red notes start at both ends and slide
// toward the green target box in the middle. Press once at the moment they exactly overlap in the box: Rakko
// attacks. Three rounds, about 7 seconds. A pure state machine advanced by step(dt); press()/release() are the
// only inputs, like the other mini games. Judging uses time: error = |press time - moment the notes overlap|.
// Perfect 2 / good 1 / miss 0 per round (0..6); the sum is never shown, only the reaction and the reward.
export const RAKKO_RULES = {
  rounds: 3,
  gapSeconds: .3,         // quiet time before each round; presses here are ignored (nothing to answer yet)
  telegraphSeconds: .4,   // the notes sit at both ends and pulse: the warning, they have not started moving
  travelMin: .9, travelMax: 1.2, // seconds for each note to reach the box in the middle (varies per round)
  perfect: .08,           // |error| in seconds for a perfect
  good: .18,              // |error| in seconds for a good; beyond it a press is too early and no press is too late
  feedbackSeconds: .5,    // the attack or the miss is shown; presses here are ignored (duplicate taps)
  points: { perfect: 2, good: 1, miss: 0 },
  maxScore: 6,
  countdownSeconds: 3,
} as const;
export type RakkoPhase = 'intro' | 'playing' | 'result' | 'countdown' | 'done';
export type RakkoStage = 'gap' | 'telegraph' | 'converge' | 'feedback';
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
  round = 0;                 // 0-based index of the current round
  roundTime = 0;             // seconds into the current stage
  elapsed = 0;               // seconds in the current phase (used by the result countdown)
  paused = false;
  readonly seed: number;
  readonly travel: readonly number[]; // seconds the notes need to reach the box, per round
  readonly grades: (RakkoGrade | undefined)[] = [];
  readonly misses: (MissReason | undefined)[] = [];
  lastGrade: RakkoGrade | null = null; // what the feedback currently shows
  constructor(seed: number) {
    this.seed = seed;
    this.travel = Array.from({ length: RAKKO_RULES.rounds }, (_, n) => RAKKO_RULES.travelMin + (RAKKO_RULES.travelMax - RAKKO_RULES.travelMin) * unit(seed, n + 1));
  }
  /** Seconds into the converge stage at which the two notes exactly overlap in the box. */
  get arriveSeconds() { return this.travel[Math.min(this.round, RAKKO_RULES.rounds - 1)]; }
  /** How far each note has travelled toward the box: 0 = at its end of the rail, 1 = in the box. Null when no notes are shown.
   * After a late miss the notes keep going past the box (above 1), so the player sees them cross. */
  get noteProgress(): number | null {
    if (this.phase !== 'playing') return null;
    if (this.stage === 'telegraph') return 0;
    if (this.stage === 'converge') return this.roundTime / this.arriveSeconds;
    if (this.stage === 'feedback' && this.misses[this.round] === 'late') return (this.arriveSeconds + RAKKO_RULES.good + this.roundTime) / this.arriveSeconds;
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
  /** One answer per round. Too early (during the warning, or before the good window) is a miss; so is a late or missing press. */
  press() {
    if (this.paused || this.phase !== 'playing') return;
    if (this.stage === 'telegraph') { this.resolve('miss', 'early'); return; }
    if (this.stage !== 'converge') return; // gap and feedback: ignored, so a stray or duplicate tap costs nothing
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
      case 'converge': return this.arriveSeconds + RAKKO_RULES.good; // past this the notes have gone by: too late
      default: return RAKKO_RULES.feedbackSeconds;
    }
  }
  /** Moves to the next stage; returns false when the game stops stepping (result reached). */
  private advance(): boolean {
    switch (this.stage) {
      case 'gap': this.stage = 'telegraph'; return true;
      case 'telegraph': this.stage = 'converge'; return true;
      case 'converge': this.grades[this.round] = 'miss'; this.misses[this.round] = 'late'; this.lastGrade = 'miss'; this.stage = 'feedback'; return true;
      default:
        if (this.round + 1 >= RAKKO_RULES.rounds) { this.phase = 'result'; this.elapsed = 0; this.lastGrade = null; return false; }
        this.round++; this.stage = 'gap'; this.lastGrade = null; return true;
    }
  }
}
