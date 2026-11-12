// Kurimanju mini game ("pour the beer"): a self-contained state machine, like sticker-game.ts.
// It owns its own clock (advanced only by step(dt)) and never touches the runner model. The caller
// forwards one hold button: press() / release(). Rewards are computed here and applied by the caller once.
//
// Nothing is judged out loud until the result screen. Rules: stage 1, hold to pour the beer, release at the beer line. Stage 2, hold again to pour the foam on
// top, release at the foam line. Each stage scores perfect 4 / good 2 / bad 0, so the total is 0..8.
export const KURI_RULES = {
  beerRate: .4,          // glass fill per second while the beer button is held
  foamRate: .3,          // glass fill per second while the foam button is held
  perfect: .03,          // |error| of the glass fill (0..1) that earns a perfect
  good: .09,             // |error| that earns a good
  points: { perfect: 4, good: 2, bad: 0 },
  maxScore: 8,
  readySeconds: 3,       // time to press before the stage is lost (counts as bad)
  beerLineMin: .42, beerLineMax: .62,
  foamThickMin: .12, foamThickMax: .2, // foam line = beer line + thickness, always below the rim (1)
  countdownSeconds: 3,
} as const;
export type KuriPhase = 'intro' | 'beer-ready' | 'beer-pour' | 'foam-ready' | 'foam-pour' | 'result' | 'countdown' | 'done';
export type Grade = 'perfect' | 'good' | 'bad';
export type KuriReward = { stamina: number; speedMultiplier: number; seconds: number; coins: number };

const tenth = (n: number) => Math.round(n * 10) / 10;
// Same reward curve as the lemon mini game, using "successes" = score scaled from 0..8 to 0..5.
export const successesFor = (score: number) => Math.round(Math.max(0, Math.min(KURI_RULES.maxScore, Math.floor(Number.isFinite(score) ? score : 0))) * 5 / KURI_RULES.maxScore);
export const kuriRewardFor = (score: number): KuriReward => {
  const n = successesFor(score);
  return { stamina: n * 6, speedMultiplier: tenth(1 + n / 10), seconds: tenth(n * .4), coins: n };
};
export const gradeFor = (error: number): Grade => error <= KURI_RULES.perfect + 1e-9 ? 'perfect' : error <= KURI_RULES.good + 1e-9 ? 'good' : 'bad';

function unit(seed: number, salt: number): number {
  let h = (Math.imul(seed >>> 0, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Spoken reaction for a finished score. */
export function reactionFor(score: number): string {
  if (score >= 8) return '쿠리만쥬 하-!! 최고의 한 잔!';
  if (score >= 6) return '하-! 맛있다!';
  if (score >= 4) return '하-… 괜찮네';
  if (score >= 2) return '음… 조금 아쉽다';
  return '하…';
}

export class KurimanjuGame {
  phase: KuriPhase = 'intro';
  elapsed = 0;           // seconds in the current phase
  paused = false;
  holding = false;
  readonly seed: number;
  readonly beerLine: number; // target for the beer surface (0..1 of the glass)
  readonly foamLine: number; // target for the foam surface
  beer = 0;              // current beer surface
  foam = 0;              // current foam thickness (foam surface = beer + foam)
  beerGrade: Grade | null = null;
  foamGrade: Grade | null = null;
  constructor(seed: number) {
    this.seed = seed;
    this.beerLine = lerp(KURI_RULES.beerLineMin, KURI_RULES.beerLineMax, unit(seed, 1));
    this.foamLine = this.beerLine + lerp(KURI_RULES.foamThickMin, KURI_RULES.foamThickMax, unit(seed, 2));
  }
  /** Overall verdict, shown only on the result screen: 8 perfect, 4-6 good, 0-2 bad. */
  get finalGrade(): Grade { return this.score >= KURI_RULES.maxScore ? 'perfect' : this.score >= 4 ? 'good' : 'bad'; }
  get foamTop() { return this.beer + this.foam; }
  get score() {
    const p = KURI_RULES.points;
    return (this.beerGrade ? p[this.beerGrade] : 0) + (this.foamGrade ? p[this.foamGrade] : 0);
  }
  get reward(): KuriReward | null { return this.phase === 'result' || this.phase === 'countdown' || this.phase === 'done' ? kuriRewardFor(this.score) : null; }
  get reaction() { return this.reward ? reactionFor(this.score) : ''; }
  get coinReward() { return successesFor(this.score); }
  get countdownRemaining() { return this.phase === 'countdown' ? Math.max(0, KURI_RULES.countdownSeconds - this.elapsed) : this.phase === 'done' ? 0 : KURI_RULES.countdownSeconds; }
  get inPlay() { return this.phase !== 'intro' && this.phase !== 'result' && this.phase !== 'done'; }
  get interactive() { return this.phase === 'beer-ready' || this.phase === 'beer-pour' || this.phase === 'foam-ready' || this.phase === 'foam-pour'; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }

  private to(phase: KuriPhase) { this.phase = phase; this.elapsed = 0; }
  start() { if (this.phase === 'intro') this.to('beer-ready'); }
  /** Result screen -> countdown, then 'done'. */
  continue() { if (this.phase === 'result') this.to('countdown'); }

  press() {
    if (this.paused) return;
    this.holding = true;
    if (this.phase === 'beer-ready') this.to('beer-pour');
    else if (this.phase === 'foam-ready') this.to('foam-pour');
  }
  release() {
    this.holding = false;
    if (this.paused) return;
    if (this.phase === 'beer-pour') this.finishBeer();
    else if (this.phase === 'foam-pour') this.finishFoam();
  }
  private finishBeer() {
    this.beerGrade = this.beer > 1 - 1e-9 ? 'bad' : gradeFor(Math.abs(this.beer - this.beerLine));
    this.to('foam-ready'); // straight on to the foam: no pause and no mid-game verdict
  }
  private finishFoam() {
    this.foamGrade = this.foamTop > 1 - 1e-9 ? 'bad' : gradeFor(Math.abs(this.foamTop - this.foamLine));
    this.to('result');
  }

  step(dt: number) {
    if (this.paused || !(dt > 0)) return;
    this.elapsed += dt;
    switch (this.phase) {
      case 'beer-ready': if (this.elapsed >= KURI_RULES.readySeconds) { this.beerGrade = 'bad'; this.to('foam-ready'); } break;
      case 'foam-ready': if (this.elapsed >= KURI_RULES.readySeconds) { this.foamGrade = 'bad'; this.to('result'); } break;
      case 'beer-pour':
        this.beer = Math.min(1, this.beer + KURI_RULES.beerRate * dt);
        if (this.beer >= 1) { this.holding = false; this.finishBeer(); } // overflow: the pour stops by itself
        break;
      case 'foam-pour':
        this.foam = Math.min(1 - this.beer, this.foam + KURI_RULES.foamRate * dt);
        if (this.foamTop >= 1 - 1e-9) { this.holding = false; this.finishFoam(); }
        break;
      case 'countdown': if (this.elapsed >= KURI_RULES.countdownSeconds) this.to('done'); break;
      default: break; // intro, result and done wait for the caller
    }
  }
}
