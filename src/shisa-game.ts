import type { MiniGame, MiniReward } from './mini-game';

export const SHISA_RULES = {
  orders: 3,
  toppingsPerOrder: 2,
  orderSeconds: 6,
  cycleSeconds: .6,
  pressLockSeconds: .12,
  feedbackSeconds: .55,
  countdownSeconds: 3,
} as const;
export const SHISA_TOPPINGS = ['chashu', 'egg', 'nori'] as const;
export type ShisaTopping = typeof SHISA_TOPPINGS[number];
export type ShisaOrder = readonly [ShisaTopping, ShisaTopping];
export type ShisaOutcome = 'success' | 'wrong' | 'timeout';
export type ShisaPhase = 'intro' | 'playing' | 'result' | 'countdown' | 'done';
export type ShisaStage = 'topping' | 'feedback';

/** Three distinct recipes, reproducible from the encounter seed. Orders remain visible: no hidden memory rules. */
export function shisaOrdersFor(seed: number): readonly ShisaOrder[] {
  const recipes: ShisaOrder[] = [];
  for (const first of SHISA_TOPPINGS) for (const second of SHISA_TOPPINGS) {
    if (first !== second) recipes.push([first, second]);
  }
  let state = (seed >>> 0) ^ 0x6a09e667;
  for (let i = recipes.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = (state >>> 16) % (i + 1);
    [recipes[i], recipes[j]] = [recipes[j], recipes[i]];
  }
  return Object.freeze(recipes.slice(0, SHISA_RULES.orders).map(order => Object.freeze(order)));
}

export function shisaRewardFor(successes: number): MiniReward & { coins: number } {
  const right = Number.isFinite(successes) ? Math.max(0, Math.min(SHISA_RULES.orders, Math.floor(successes))) : 0;
  const n = Math.round(right * 5 / SHISA_RULES.orders);
  return { stamina: n * 6, speedMultiplier: Math.round((1 + n / 10) * 10) / 10, seconds: Math.round(n * 4) / 10, coins: n };
}

/** Pure one-button model. press() takes the highlighted topping; two picks automatically serve the bowl. */
export class ShisaGame implements MiniGame {
  phase: ShisaPhase = 'intro';
  stage: ShisaStage = 'topping';
  paused = false;
  readonly seed: number;
  readonly orders: readonly ShisaOrder[];
  private orderIndex = 0;
  private clock = 0;
  private phaseTime = 0;
  private bowl: ShisaTopping[] = [];
  private results: ShisaOutcome[] = [];
  private unlockAt = 0;

  constructor(seed: number) { this.seed = seed; this.orders = shisaOrdersFor(seed); }
  get round() { return this.orderIndex; }
  get order(): ShisaOrder { return this.orders[this.orderIndex]; }
  get selected(): readonly ShisaTopping[] { return [...this.bowl]; }
  get outcomes(): readonly ShisaOutcome[] { return [...this.results]; }
  get successes() { return this.results.filter(r => r === 'success').length; }
  get remaining() { return this.stage === 'topping' ? Math.max(0, SHISA_RULES.orderSeconds - this.clock) : 0; }
  get lastOutcome(): ShisaOutcome | null { return this.phase === 'playing' && this.stage === 'feedback' ? this.results[this.orderIndex] ?? null : null; }
  get interactive() { return this.phase === 'playing' && this.stage === 'topping'; }
  get highlightedIndex() { return this.interactive ? Math.floor(this.clock / SHISA_RULES.cycleSeconds + 1e-9) % SHISA_TOPPINGS.length : -1; }
  get highlightedTopping(): ShisaTopping | null { return this.highlightedIndex < 0 ? null : SHISA_TOPPINGS[this.highlightedIndex]; }
  get canPress() { return this.interactive && !this.paused && this.clock + 1e-9 >= this.unlockAt; }
  get inPlay() { return this.phase === 'playing' || this.phase === 'countdown'; }
  get reward() { return ['result', 'countdown', 'done'].includes(this.phase) ? shisaRewardFor(this.successes) : null; }
  get coinReward() { return this.reward?.coins ?? 0; }
  get reaction() {
    return !this.reward ? '' : this.successes === 3 ? '주문대로 완성! 라멘 서빙 성공!' : this.successes > 0 ? '수고했어! 다음 주문도 함께 해 보자' : '괜찮아! 주문서를 보며 다시 해 보자';
  }
  get countdownRemaining() {
    return this.phase === 'countdown' ? Math.max(0, SHISA_RULES.countdownSeconds - this.phaseTime) : this.phase === 'done' ? 0 : SHISA_RULES.countdownSeconds;
  }
  start() { if (this.phase === 'intro') { this.phase = 'playing'; this.clock = 0; this.phaseTime = 0; } }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  continue() { if (this.phase === 'result' && !this.paused) { this.phase = 'countdown'; this.phaseTime = 0; } }
  /** Temporary no-op compatibility for the previous shell. Numeric selection is no longer an input. */
  chooseTopping(_topping: ShisaTopping) { /* one button only */ }
  /** Temporary no-op compatibility for the previous shell. */
  undoTopping() { /* one button only */ }
  press() {
    if (!this.canPress || this.highlightedTopping === null) return;
    this.bowl.push(this.highlightedTopping);
    this.unlockAt = this.clock + SHISA_RULES.pressLockSeconds;
    if (this.bowl.length === SHISA_RULES.toppingsPerOrder) {
      this.resolve(this.bowl.every((topping, i) => topping === this.order[i]) ? 'success' : 'wrong');
    }
  }
  release() { /* no hold input */ }
  private resolve(result: ShisaOutcome) {
    this.results.push(result); this.stage = 'feedback'; this.clock = 0;
  }
  step(dt: number) {
    if (this.paused || !Number.isFinite(dt) || dt <= 0) return;
    if (this.phase === 'countdown') {
      this.phaseTime += dt;
      if (this.phaseTime >= SHISA_RULES.countdownSeconds) this.phase = 'done';
      return;
    }
    if (this.phase !== 'playing') return;
    let left = dt;
    while (left > 0 && this.phase === 'playing') {
      const length = this.stage === 'topping' ? SHISA_RULES.orderSeconds : SHISA_RULES.feedbackSeconds;
      const room = Math.max(0, length - this.clock);
      if (left < room - 1e-9) { this.clock += left; break; }
      left = Math.max(0, left - room); this.clock = 0;
      if (this.stage === 'topping') this.resolve('timeout');
      else if (this.orderIndex + 1 === SHISA_RULES.orders) { this.phase = 'result'; this.phaseTime = 0; }
      else { this.orderIndex++; this.bowl = []; this.unlockAt = 0; this.stage = 'topping'; }
    }
  }
}
