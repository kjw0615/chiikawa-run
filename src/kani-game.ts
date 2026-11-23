// Sixth mini game: 카니의 헌책방 정리 (Kani's used bookshop sorting), a sorting game. Pure state machine like
// the other mini games: advanced only by step(dt), no DOM/phaser imports, so node tests can drive it. Six old books
// (2 of each kind, shuffled by seed) arrive one at a time on the counter, each showing only its title. The player reads the title, moves the
// selection over the three shelves (동화 / 요리 / 식물) with the arrow keys and presses Space, or clicks / taps a shelf directly. A press answers the book and the
// next one comes at once; a book left alone waits out its time and is missed. There is no failing: all 6 books are always
// played, and the reward follows the number sorted correctly. Prototype art: symbols, text and basic shapes only.
// Nothing is scored out loud.
import type { MiniGame } from './mini-game';

export type KaniShelf = 'story' | 'cook' | 'plant';
export const KANI_SHELVES: readonly KaniShelf[] = ['story', 'cook', 'plant'];
/** Shelf labels and symbols, in button order (index = shelf index passed to pressShelf). */
export const KANI_SHELF_INFO: Record<KaniShelf, { name: string; symbol: string }> = {
  story: { name: '동화', symbol: '★' },
  cook: { name: '요리', symbol: '●' },
  plant: { name: '식물', symbol: '▲' },
};
/** Titles per kind: each kind has several, so the same book is not always the same answer. */
export const KANI_TITLES: Record<KaniShelf, readonly string[]> = {
  story: ['토끼와 거북이', '달빛 공주 이야기', '용감한 작은 별', '숲속 친구들의 모험'],
  cook: ['감자 수프 만들기', '따끈한 라멘 레시피', '맛있는 팬케이크', '오늘의 도시락'],
  plant: ['꽃 기르기 첫걸음', '튼튼한 풀과 잡초', '작은 화분 가꾸기', '들꽃 도감'],
};
export const KANI_RULES = {
  books: 6,
  perKind: 2,
  bookSeconds: 2,         // a book left alone waits this long on the counter, then is missed (8 s -> 2.7 s -> 1.35 s -> 2 s)
  pressLock: .1,          // after a press brings the next book, it ignores presses this long (an accidental double tap)
  readySeconds: .5,       // lead-in after start(): books are shown but not yet on the counter; no input, no clock
  goAt: .3,               // within the lead-in the cue reads ready until this many seconds in, then go
  countdownSeconds: 3,
} as const;
export type KaniBook = { shelf: KaniShelf; title: string };
/** pressed right = sorted (success), wrong = put on the wrong shelf, missed = left alone. */
export type KaniOutcome = 'sorted' | 'wrong' | 'missed';
export type KaniPhase = 'intro' | 'playing' | 'result' | 'countdown' | 'done';
export type KaniReward = { stamina: number; speedMultiplier: number; seconds: number; coins: number };

const tenth = (n: number) => Math.round(n * 10) / 10;
function unit(seed: number, salt: number): number {
  let h = (Math.imul(seed >>> 0, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Books for this seed: exactly perKind of each kind, a seeded shuffled order, titles picked by seed (no repeats per kind). */
export function kaniBooksFor(seed: number): KaniBook[] {
  const books: KaniBook[] = [];
  KANI_SHELVES.forEach((shelf, k) => {
    const titles = [...KANI_TITLES[shelf]];
    for (let n = 0; n < KANI_RULES.perKind; n++) {
      const pick = Math.floor(unit(seed, 100 + k * 10 + n) * titles.length);
      books.push({ shelf, title: titles.splice(pick, 1)[0] });
    }
  });
  for (let i = books.length - 1; i > 0; i--) {
    const j = Math.floor(unit(seed, i) * (i + 1));
    [books[i], books[j]] = [books[j], books[i]];
  }
  return books;
}
/** Same 0..5 "successes" shape as the other mini games: books sorted right out of 6, scaled (6 right = 5, 0 right = 0). */
export const kaniSuccessesFor = (right: number) =>
  Math.max(0, Math.min(5, Math.round(Math.max(0, right) * 5 / KANI_RULES.books)));
export const kaniRewardFor = (right: number): KaniReward => {
  const n = kaniSuccessesFor(right);
  return { stamina: n * 6, speedMultiplier: tenth(1 + n / 10), seconds: tenth(n * .4), coins: n };
};
export function kaniReactionFor(right: number): string {
  const n = kaniSuccessesFor(right);
  return n >= 5 ? '깔끔해! 책장이 반짝반짝해졌어' : n >= 3 ? '좋아! 책들이 제자리를 찾았어' : n >= 1 ? '조금씩 정리가 되고 있어' : '괜찮아, 다시 한번 정리해 보자';
}

export class KaniGame implements MiniGame {
  phase: KaniPhase = 'intro';
  time = 0;                  // total seconds played (informational; books advance by index, not by this clock)
  elapsed = 0;               // seconds in the current phase (used by the result countdown)
  paused = false;
  lead = 0;                  // lead-in seconds left after start() (0 = books are running)
  index = 0;                 // the book on the counter
  selected = 1;              // shelf the player has selected (starts in the middle)
  bookClock = 0;             // seconds the current book has been on the counter
  readonly seed: number;
  readonly books: readonly KaniBook[];
  readonly outcomes: (KaniOutcome | undefined)[] = [];
  /** Shelf the player chose for each answered book (so the panel can show where it went). */
  readonly chosen: (KaniShelf | undefined)[] = [];
  private reachedByPress = false;   // the current book arrived through a press (so the double-tap lock applies)
  constructor(seed: number) {
    this.seed = seed;
    this.books = kaniBooksFor(seed);
  }
  get bookCount() { return this.books.length; }
  /** Book on the counter, or -1 outside play, during the lead-in and once the 6th book is done. */
  get currentIndex() { return this.phase === 'playing' && this.lead <= 0 && this.index < this.books.length ? this.index : -1; }
  get current(): KaniBook | null { return this.currentIndex < 0 ? null : this.books[this.currentIndex]; }
  /** Seconds the current book has been waiting (0..bookSeconds), for a progress cue. */
  get bookTime() { return this.currentIndex < 0 ? 0 : this.bookClock; }
  /** Shelf index (0..2) the player has selected with the arrow keys; Space puts the book there. */
  get cursorShelf() { return this.selected; }
  /** Start cue during the lead-in (ready, then go), else ''. */
  get startCue(): '' | 'ready' | 'go' {
    if (this.phase !== 'playing' || this.lead <= 0) return '';
    return KANI_RULES.readySeconds - this.lead < KANI_RULES.goAt ? 'ready' : 'go';
  }
  get judgedCount() { return this.outcomes.filter(o => o !== undefined).length; }
  /** Books sorted onto the right shelf so far (max 6). */
  get right() { return this.outcomes.filter(o => o === 'sorted').length; }
  get reward(): KaniReward | null {
    return this.phase === 'result' || this.phase === 'countdown' || this.phase === 'done' ? kaniRewardFor(this.right) : null;
  }
  get reaction() { return this.reward ? kaniReactionFor(this.right) : ''; }
  get coinReward() { return this.reward?.coins ?? 0; }
  get countdownRemaining() { return this.phase === 'countdown' ? Math.max(0, KANI_RULES.countdownSeconds - this.elapsed) : this.phase === 'done' ? 0 : KANI_RULES.countdownSeconds; }
  get inPlay() { return this.phase !== 'intro' && this.phase !== 'result' && this.phase !== 'done'; }
  get interactive() { return this.phase === 'playing'; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  start() { if (this.phase === 'intro') { this.phase = 'playing'; this.time = 0; this.lead = KANI_RULES.readySeconds; this.index = 0; this.bookClock = 0; this.selected = 1; this.elapsed = 0; } }
  /** Result screen -> countdown, then 'done'. */
  continue() { if (this.phase === 'result') { this.phase = 'countdown'; this.elapsed = 0; } }

  release() { /* tap game: nothing to do */ }
  /** Moves the selection one shelf left (-1) or right (+1); it stops at the ends. Ignored outside play. */
  moveCursor(dir: -1 | 1) {
    if (this.paused || this.phase !== 'playing' || this.lead > 0) return;
    this.selected = Math.max(0, Math.min(KANI_SHELVES.length - 1, this.selected + dir));
  }
  /** Puts the book on the selected shelf (Space / the put button). */
  press() { this.pressShelf(this.selected); }
  /** Puts the book on a shelf directly (a click or tap on that shelf), and moves the selection there. */
  pressShelf(shelfIndex: number) {
    if (this.paused || this.phase !== 'playing' || !(shelfIndex >= 0 && shelfIndex < KANI_SHELVES.length)) return;
    const i = this.currentIndex;
    if (i < 0 || (this.reachedByPress && this.bookClock < KANI_RULES.pressLock)) return; // accidental double tap
    this.selected = shelfIndex;
    const shelf = KANI_SHELVES[shelfIndex];
    this.chosen[i] = shelf;
    this.outcomes[i] = this.books[i].shelf === shelf ? 'sorted' : 'wrong';
    this.advance(true);
  }
  /** Moves to the next book; the caller has already answered or settled the current one. */
  private advance(byPress: boolean) {
    this.index++; this.bookClock = 0; this.reachedByPress = byPress;
    if (this.index >= this.books.length) { this.phase = 'result'; this.elapsed = 0; }
  }

  step(dt: number) {
    if (this.paused || !(dt > 0)) return;
    this.elapsed += dt;
    if (this.phase === 'countdown') { if (this.elapsed >= KANI_RULES.countdownSeconds) this.phase = 'done'; return; }
    if (this.phase !== 'playing') return;
    if (this.lead > 0) { // lead-in: the first book waits; whatever is left of this frame starts it
      if (dt < this.lead) { this.lead -= dt; return; }
      dt -= this.lead; this.lead = 0;
      if (!(dt > 0)) return;
    }
    this.time += dt; this.bookClock += dt;
    // A long frame may pass several books: books left alone are missed and the next one comes.
    while (this.phase === 'playing' && this.bookClock >= KANI_RULES.bookSeconds - 1e-9) {
      const i = this.index, rest = this.bookClock - KANI_RULES.bookSeconds;
      if (this.outcomes[i] === undefined) this.outcomes[i] = 'missed';
      this.advance(false); if (this.phase === 'playing') this.bookClock = Math.max(0, rest);
    }
  }
}
