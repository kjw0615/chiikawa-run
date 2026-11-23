// Fourth mini game: 우사기 리듬 댄스 (Usagi rhythm), single-tap notes on two buttons. Pure state machine like the other
// mini games: advanced only by step(dt), no DOM/phaser imports, so node tests can drive it. Usagi dances in the middle;
// 8 notes arrive one after another, each from the left (bubble 우냐) or the right (bubble 우랴). The player answers each
// with the matching side (left/right arrow, A/D or the two touch buttons). There is no failing: all 8 notes always play
// out and the reward depends on the final performance. Nothing is scored out loud: only Perfect/Good/Miss per note,
// the speech bubble and the dance. Judging uses time: error = |press time - note hit time|.
import { rewardForTier, type MiniTier } from './mini-tier.ts';
export type UsagiSide = 'left' | 'right';
export const USAGI_RULES = {
  noteCount: 8,
  firstHit: 1.6,          // seconds after start() at which the first note must be answered
  beat: .8,               // seconds between consecutive hit times
  approach: .9,           // seconds a note is visible (bubble + approaching ring) before its hit time
  perfect: .08,           // |error| in seconds for Perfect
  good: .2,               // |error| in seconds for Good; beyond it a press is too early / no press is too late
  earlyIgnore: .45,       // presses earlier than this before the hit time are stray taps and cost nothing
  feedbackSeconds: .45,   // how long a judgement label stays after the note was judged
  endHold: .8,            // quiet time after the last note before the result
  countdownSeconds: 3,
  bubble: { left: '우냐', right: '우랴' },
} as const;
export type UsagiPhase = 'intro' | 'playing' | 'result' | 'countdown' | 'done';
export type UsagiGrade = 'perfect' | 'good' | 'miss';
export type UsagiMissReason = 'early' | 'late' | 'side';
export type UsagiReward = { stamina: number; speedMultiplier: number; seconds: number; coins: number };
export type UsagiDance = 'idle' | 'left' | 'right' | 'miss';

const tenth = (n: number) => Math.round(n * 10) / 10;
const POINTS: Record<UsagiGrade, number> = { perfect: 1, good: 1, miss: 0 };
export const USAGI_MAX_POINTS = USAGI_RULES.noteCount; // reward counts successful notes only: Perfect and Good are one success each

/** Fixed charts, picked by seed. Each has 8 sides with 4 of each, so both buttons are always used equally. */
export const USAGI_CHARTS: readonly (readonly UsagiSide[])[] = [
  ['left', 'right', 'left', 'right', 'right', 'left', 'left', 'right'],
  ['right', 'left', 'right', 'left', 'left', 'right', 'right', 'left'],
  ['left', 'left', 'right', 'right', 'left', 'right', 'right', 'left'],
  ['right', 'right', 'left', 'left', 'right', 'left', 'left', 'right'],
];
export const usagiChartFor = (seed: number): readonly UsagiSide[] => USAGI_CHARTS[(seed >>> 0) % USAGI_CHARTS.length];
export const usagiHitTime = (index: number) => USAGI_RULES.firstHit + index * USAGI_RULES.beat;

export const usagiGradeFor = (error: number): UsagiGrade =>
  error <= USAGI_RULES.perfect + 1e-9 ? 'perfect' : error <= USAGI_RULES.good + 1e-9 ? 'good' : 'miss';
export const usagiPoints = (grades: readonly (UsagiGrade | undefined)[]) =>
  grades.reduce<number>((sum, g) => sum + (g ? POINTS[g] : 0), 0);
/** Same 0..5 "successes" shape as the other mini games: everything missed pays 0, a flawless dance pays 5. */
export const usagiSuccessesFor = (points: number) =>
  Math.max(0, Math.min(5, Math.round(Math.max(0, points) * 5 / USAGI_MAX_POINTS)));
export const usagiRewardFor = (points: number): UsagiReward => {
  const n = usagiSuccessesFor(points);
  return { stamina: n * 6, speedMultiplier: tenth(1 + n / 10), seconds: tenth(n * .4), coins: n };
};
/** Result tier by notes hit (Perfect or Good) out of 8: 8 perfect, 5-7 great, 2-4 good, 0-1 bad (a slow-down). */
export const usagiTierFor = (hits: number): MiniTier => hits >= USAGI_RULES.noteCount ? 'perfect' : hits >= 5 ? 'great' : hits >= 2 ? 'good' : 'bad';
export function usagiReactionFor(points: number): string {
  const n = usagiSuccessesFor(points);
  return n >= 5 ? '완벽해! 우사기가 신나게 춤췄어!' : n >= 3 ? '좋아! 같이 춤추니까 즐겁다' : n >= 1 ? '조금씩 박자가 맞아 가고 있어' : '괜찮아, 다시 한번 춤춰 보자';
}

export class UsagiGame {
  phase: UsagiPhase = 'intro';
  time = 0;                  // seconds into the playing phase (the one clock every note is judged against)
  elapsed = 0;               // seconds in the current phase (used by the result countdown)
  paused = false;
  readonly seed: number;
  readonly chart: readonly UsagiSide[];
  readonly grades: (UsagiGrade | undefined)[] = [];
  readonly misses: (UsagiMissReason | undefined)[] = [];
  readonly judgedAt: number[] = []; // game time at which each note was judged (drives the label lifetime)
  lastIndex = -1;                   // most recently judged note, for the label and the dance
  constructor(seed: number) {
    this.seed = seed;
    this.chart = usagiChartFor(seed);
  }
  get noteCount() { return this.chart.length; }
  get judgedCount() { return this.grades.filter(g => g !== undefined).length; }
  get points() { return usagiPoints(this.grades); }
  get perfects() { return this.grades.filter(g => g === 'perfect').length; }
  /** The note the player should answer next (first unjudged), or -1 once all are judged. */
  get currentIndex() { return this.grades.length >= this.chart.length && this.judgedCount >= this.chart.length ? -1 : this.nextIndex(); }
  private nextIndex() { for (let i = 0; i < this.chart.length; i++) if (this.grades[i] === undefined) return i; return -1; }
  /** 0 = note just appeared, 1 = exactly at its hit time, above 1 = gone past; null when the note is not shown. */
  noteProgress(index: number): number | null {
    if (this.phase !== 'playing' || this.grades[index] !== undefined) return null;
    const p = 1 - (usagiHitTime(index) - this.time) / USAGI_RULES.approach;
    return p < 0 ? null : p;
  }
  /** Bubble text of the note that is currently shown (the earliest visible unjudged one), else ''. */
  get bubble(): string {
    const i = this.nextIndex();
    return i >= 0 && this.noteProgress(i) !== null ? USAGI_RULES.bubble[this.chart[i]] : '';
  }
  /** The label to show now (grade of the last judged note while it is fresh), else null. */
  get label(): UsagiGrade | null {
    if (this.phase !== 'playing' || this.lastIndex < 0) return null;
    return this.time - this.judgedAt[this.lastIndex] < USAGI_RULES.feedbackSeconds ? this.grades[this.lastIndex] ?? null : null;
  }
  /** How far the reach animation of the last note has run: 0 = just judged, 1 = over; null when no animation runs.
   * Only a successful note (Perfect/Good) reaches out toward its side; a Miss has no reach, so the dancer simply stays. */
  get danceProgress(): number | null {
    if (this.phase !== 'playing' || this.lastIndex < 0 || this.grades[this.lastIndex] === 'miss') return null;
    const p = (this.time - this.judgedAt[this.lastIndex]) / USAGI_RULES.feedbackSeconds;
    return p < 1 ? Math.max(0, p) : null;
  }
  get dance(): UsagiDance {
    if (this.label === null) return 'idle';
    if (this.label === 'miss') return 'miss';
    return this.chart[this.lastIndex];
  }
  get reward(): UsagiReward | null {
    return this.phase === 'result' || this.phase === 'countdown' || this.phase === 'done' ? { ...rewardForTier('usagi', this.tier), coins: 0 } : null;
  }
  get tier(): MiniTier { return usagiTierFor(this.hits); }
  /** Notes hit: points count one per Perfect or Good note. */
  get hits() { return this.points; }
  get reaction() { return this.reward ? usagiReactionFor(this.points) : ''; }
  get coinReward() { return this.reward?.coins ?? 0; }
  get countdownRemaining() { return this.phase === 'countdown' ? Math.max(0, USAGI_RULES.countdownSeconds - this.elapsed) : this.phase === 'done' ? 0 : USAGI_RULES.countdownSeconds; }
  get inPlay() { return this.phase !== 'intro' && this.phase !== 'result' && this.phase !== 'done'; }
  get interactive() { return this.phase === 'playing'; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  start() { if (this.phase === 'intro') { this.phase = 'playing'; this.time = 0; this.elapsed = 0; } }
  /** Result screen -> countdown, then 'done'. */
  continue() { if (this.phase === 'result') { this.phase = 'countdown'; this.elapsed = 0; } }

  private judge(index: number, grade: UsagiGrade, reason?: UsagiMissReason) {
    this.grades[index] = grade; this.misses[index] = reason; this.judgedAt[index] = this.time; this.lastIndex = index;
  }
  /** MiniGame compatibility: a side-less press cannot answer a left/right note, so it is ignored. Use pressLane(). */
  press() { /* two-button game: see pressLane() */ }
  release() { /* tap game: nothing to do */ }
  /** One answer per note. A wrong side is a miss; a press far before the note is a stray tap and is ignored. */
  pressLane(side: UsagiSide) {
    if (this.paused || this.phase !== 'playing') return;
    const i = this.nextIndex();
    if (i < 0) return;
    const diff = this.time - usagiHitTime(i);
    if (diff < -USAGI_RULES.earlyIgnore) return;
    if (diff < -USAGI_RULES.good - 1e-9) { this.judge(i, 'miss', 'early'); return; }
    if (this.chart[i] !== side) { this.judge(i, 'miss', 'side'); return; }
    this.judge(i, usagiGradeFor(Math.abs(diff)));
  }

  step(dt: number) {
    if (this.paused || !(dt > 0)) return;
    this.elapsed += dt;
    if (this.phase === 'countdown') { if (this.elapsed >= USAGI_RULES.countdownSeconds) this.phase = 'done'; return; }
    if (this.phase !== 'playing') return;
    this.time += dt;
    // Notes whose Good window has passed without an answer are late misses (a long frame may pass several at once).
    for (let i = 0; i < this.chart.length; i++) {
      if (this.grades[i] === undefined && this.time > usagiHitTime(i) + USAGI_RULES.good + 1e-9) this.judge(i, 'miss', 'late');
    }
    if (this.judgedCount >= this.chart.length && this.time >= usagiHitTime(this.chart.length - 1) + USAGI_RULES.good + USAGI_RULES.endHold) {
      this.phase = 'result'; this.elapsed = 0;
    }
  }
}
