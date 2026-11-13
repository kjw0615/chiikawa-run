// Third mini game: 랏코 맹수 토벌 (small-monster hunting training with Master Rakko), converge-timing battle.
// The small monster stands in the middle with 10 HP. A faint horizontal line runs across the stage; from both of its
// ends a small round object slides toward the middle at the same speed. Press once at the moment the two overlap:
// Rakko attacks. Timing decides the hit: critical (double damage 6), normal (damage 3) or miss (0). There are 5
// chances; the fight ends as soon as the monster's HP reaches 0. Two criticals win in 2 chances; normal hits alone
// need 4, so one miss still wins within 5. A pure state machine advanced by step(dt); press()/release() are the
// only inputs, like the other mini games. Judging uses time: error = |press time - moment the two objects overlap|.
// Nothing is scored out loud: only the monster's HP bar, the remaining chances and a reaction are shown.
export const RAKKO_RULES = {
  chances: 5,
  monsterHp: 10,
  damage: { critical: 6, normal: 3, miss: 0 },
  gapSeconds: .25,        // quiet time before each chance; presses here are ignored (nothing to answer yet)
  telegraphSeconds: .3,   // the two objects sit at both ends and pulse: the warning, they have not started moving
  travelMin: .8, travelMax: 1.1, // seconds for each object to reach the middle (varies per chance)
  critical: .08,          // |error| in seconds for a critical hit
  normal: .18,            // |error| in seconds for a normal hit; beyond it a press is too early and no press is too late
  feedbackSeconds: .5,    // the attack or the miss is shown; presses here are ignored (duplicate taps)
  fastWin: 3,             // a win in at most this many chances is a fast win
  countdownSeconds: 3,
} as const;
export type RakkoPhase = 'intro' | 'playing' | 'result' | 'countdown' | 'done';
export type RakkoStage = 'gap' | 'telegraph' | 'converge' | 'feedback';
export type RakkoGrade = 'critical' | 'normal' | 'miss';
export type MissReason = 'early' | 'late';
export type RakkoReward = { stamina: number; speedMultiplier: number; seconds: number; coins: number };

const tenth = (n: number) => Math.round(n * 10) / 10;
function unit(seed: number, salt: number): number {
  let h = (Math.imul(seed >>> 0, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Same reward shape as the other mini games (0..5 "successes"). A win pays 3, +1 for each chance left unused (max 5);
 * a loss pays by the damage dealt (0..2). Every critical hit adds a bonus coin. */
export const rakkoSuccessesFor = (won: boolean, chancesUsed: number, damage: number) => {
  if (won) return Math.max(3, Math.min(5, 3 + RAKKO_RULES.chances - Math.max(1, Math.floor(chancesUsed))));
  return Math.max(0, Math.min(2, Math.floor(Math.max(0, damage) * 2 / RAKKO_RULES.monsterHp)));
};
export const rakkoRewardFor = (won: boolean, chancesUsed: number, damage: number, criticals = 0): RakkoReward => {
  const n = rakkoSuccessesFor(won, chancesUsed, damage);
  return { stamina: n * 6, speedMultiplier: tenth(1 + n / 10), seconds: tenth(n * .4), coins: n + Math.max(0, Math.floor(criticals)) };
};
export const rakkoGradeFor = (error: number): RakkoGrade =>
  error <= RAKKO_RULES.critical + 1e-9 ? 'critical' : error <= RAKKO_RULES.normal + 1e-9 ? 'normal' : 'miss';
export function rakkoReactionFor(won: boolean, chancesUsed: number, damage: number): string {
  if (won) return chancesUsed <= RAKKO_RULES.fastWin ? '대단해! 일격필살이었어!' : '잘했어! 토벌 성공이야';
  return damage >= RAKKO_RULES.monsterHp / 2 ? '아쉽다! 조금만 더 하면 쓰러뜨렸을 텐데' : '괜찮아, 다시 한번 해 보자';
}

export class RakkoGame {
  phase: RakkoPhase = 'intro';
  stage: RakkoStage = 'gap';
  round = 0;                 // 0-based index of the current chance
  roundTime = 0;             // seconds into the current stage
  elapsed = 0;               // seconds in the current phase (used by the result countdown)
  paused = false;
  readonly seed: number;
  readonly travel: readonly number[]; // seconds the objects need to reach the middle, per chance
  readonly grades: (RakkoGrade | undefined)[] = [];
  readonly misses: (MissReason | undefined)[] = [];
  lastGrade: RakkoGrade | null = null; // what the feedback currently shows
  constructor(seed: number) {
    this.seed = seed;
    this.travel = Array.from({ length: RAKKO_RULES.chances }, (_, n) => RAKKO_RULES.travelMin + (RAKKO_RULES.travelMax - RAKKO_RULES.travelMin) * unit(seed, n + 1));
  }
  /** Seconds into the converge stage at which the two objects exactly overlap in the middle. */
  get arriveSeconds() { return this.travel[Math.min(this.round, RAKKO_RULES.chances - 1)]; }
  /** How far each object has travelled toward the middle: 0 = at its end of the line, 1 = overlapping in the middle.
   * Null when none are shown. After a late miss they keep going past the middle (above 1), so the player sees them cross. */
  get noteProgress(): number | null {
    if (this.phase !== 'playing') return null;
    if (this.stage === 'telegraph') return 0;
    if (this.stage === 'converge') return this.roundTime / this.arriveSeconds;
    if (this.stage === 'feedback' && this.misses[this.round] === 'late') return (this.arriveSeconds + RAKKO_RULES.normal + this.roundTime) / this.arriveSeconds;
    return null;
  }
  /** Total damage dealt so far. */
  get damage() { return this.grades.reduce<number>((sum, g) => sum + (g ? RAKKO_RULES.damage[g] : 0), 0); }
  get monsterHp() { return Math.max(0, RAKKO_RULES.monsterHp - this.damage); }
  get won() { return this.monsterHp <= 0; }
  /** Chances already spent (judged). */
  get chancesUsed() { return this.grades.filter(g => g !== undefined).length; }
  get criticals() { return this.grades.filter(g => g === 'critical').length; }
  get reward(): RakkoReward | null {
    return this.phase === 'result' || this.phase === 'countdown' || this.phase === 'done'
      ? rakkoRewardFor(this.won, this.chancesUsed, this.damage, this.criticals) : null;
  }
  get reaction() { return this.reward ? rakkoReactionFor(this.won, this.chancesUsed, this.damage) : ''; }
  get coinReward() { return this.reward?.coins ?? 0; }
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
  /** One answer per chance. Too early (during the warning, or before the normal window) is a miss; so is a late or missing press. */
  press() {
    if (this.paused || this.phase !== 'playing') return;
    if (this.stage === 'telegraph') { this.resolve('miss', 'early'); return; }
    if (this.stage !== 'converge') return; // gap and feedback: ignored, so a stray or duplicate tap costs nothing
    const error = this.roundTime - this.arriveSeconds;
    if (error < -RAKKO_RULES.normal - 1e-9) this.resolve('miss', 'early');
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
      case 'converge': return this.arriveSeconds + RAKKO_RULES.normal; // past this the objects have gone by: too late
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
        // The fight ends when the monster is down or the chances are used up.
        if (this.won || this.round + 1 >= RAKKO_RULES.chances) { this.phase = 'result'; this.elapsed = 0; this.lastGrade = null; return false; }
        this.round++; this.stage = 'gap'; this.lastGrade = null; return true;
    }
  }
}
