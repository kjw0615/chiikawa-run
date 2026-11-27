// Which character brings which mini game. To add a character: add one entry to ROSTER (its portrait and the
// game it starts) and, for a new game, implement MiniGame. The slot reel, the pick by seed and the hand-over to
// the game all follow from this list, so nothing else needs to change.
import { MINI_RULES, StickerGame } from './sticker-game';
import { KurimanjuGame } from './kurimanju-game';
import { RakkoGame } from './rakko-game';
import { UsagiGame } from './usagi-game';
import { WeedGame } from './weed-game';
import { KaniGame } from './kani-game';
import { ShisaGame, type ShisaTopping } from './shisa-game';
import type { MiniGame, MiniReward } from './mini-game';

export type Portrait = { atlas: string } | { url: string }; // frame in the event atlas, or a separate 192x224 image
export interface RosterEntry { id: string; name: string; portrait: Portrait; create(seed: number): MiniGame }

export const ROSTER: readonly RosterEntry[] = [
  { id: 'chiikawa', name: '치이카와', portrait: { atlas: 'chiikawa' }, create: seed => new StickerGame(seed, { character: 'chiikawa', skipSelection: true }) },
  { id: 'kurimanju', name: '쿠리만쥬', portrait: { url: '/assets/event-kurimanju.webp' }, create: seed => new KurimanjuGame(seed) },
  { id: 'rakko', name: '랏코', portrait: { url: '/assets/event-rakko.webp' }, create: seed => new RakkoGame(seed) },
  { id: 'hachiware', name: '하치와레', portrait: { atlas: 'hachiware' }, create: seed => new WeedGame(seed) },
  { id: 'usagi', name: '우사기', portrait: { url: '/assets/event-usagi.webp' }, create: seed => new UsagiGame(seed) },
  { id: 'kani', name: '카니(헌책방)', portrait: { url: '/assets/event-kani.webp' }, create: seed => new KaniGame(seed) },
  { id: 'shisa', name: '시사(라멘낭랑)', portrait: { url: '/assets/event-shisa.webp' }, create: seed => new ShisaGame(seed) },
];

/** The developer test menu lists the same seven characters. */
export const DEV_ROSTER: readonly RosterEntry[] = [...ROSTER];

/** The character that wins the slot for this encounter seed (stable for a given seed).
 * If lastIndex is provided, the previous character has 0% chance and the remaining characters share equal probability.
 */
export function rosterIndexFor(seed: number, size: number, lastIndex: number | null = null): number {
  if (size <= 0) return 0;
  if (size === 1) return 0;

  // High quality avalanche hash (Murmur3 fmix32) to prevent clustering or repetitive LCG patterns
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;

  if (lastIndex !== null && lastIndex >= 0 && lastIndex < size) {
    // Pick uniformly from the remaining (size - 1) candidates
    let pick = h % (size - 1);
    if (pick >= lastIndex) {
      pick++;
    }
    return pick;
  }

  return h % size;
}

/**
 * Slot first, then the winner's game. While the reel spins the phase is 'selecting'; afterwards every call
 * goes to the winner's game and its phases are reported as they are.
 */
export class SlottedMiniGame implements MiniGame {
  readonly index: number;
  readonly entry: RosterEntry;
  readonly inner: MiniGame;
  elapsed = 0; // seconds the reel has been spinning
  private spinning = true;
  private halted = false;
  constructor(readonly seed: number, readonly roster: readonly RosterEntry[] = ROSTER, lastIndex: number | null = null) {
    this.index = rosterIndexFor(seed, roster.length, lastIndex); this.entry = roster[this.index]; this.inner = this.entry.create(seed);
  }
  get phase(): string { return this.spinning ? 'selecting' : this.inner.phase; }
  get paused() { return this.halted; }
  get reward(): MiniReward | null { return this.spinning ? null : this.inner.reward; }
  get coinReward() { return this.spinning ? 0 : this.inner.coinReward; }
  get countdownRemaining() { return this.inner.countdownRemaining; }
  get inPlay() { return this.spinning || this.inner.inPlay; }
  get interactive() { return !this.spinning && this.inner.interactive; }
  step(dt: number) {
    if (this.halted || !(dt > 0)) return;
    if (!this.spinning) { this.inner.step(dt); return; }
    this.elapsed += dt;
    if (this.elapsed >= MINI_RULES.selectionSeconds) {
      const rest = this.elapsed - MINI_RULES.selectionSeconds;
      this.elapsed = MINI_RULES.selectionSeconds; this.spinning = false;
      if (rest > 0) this.inner.step(rest);
    }
  }
  pause() { this.halted = true; this.inner.pause(); }
  resume() { this.halted = false; this.inner.resume(); }
  start() { if (!this.spinning) this.inner.start(); }
  continue() { if (!this.spinning) this.inner.continue(); }
  press() { if (!this.spinning) this.inner.press(); }
  pressLane(lane: 'left' | 'right') { if (!this.spinning) this.inner.pressLane?.(lane); }
  moveCursor(dir: -1 | 1) { if (!this.spinning) this.inner.moveCursor?.(dir); }
  pressShelf(index: number) { if (!this.spinning) this.inner.pressShelf?.(index); }
  chooseTopping(topping: string) { if (!this.spinning) (this.inner as ShisaGame).chooseTopping?.(topping as ShisaTopping); }
  undoTopping() { if (!this.spinning) (this.inner as ShisaGame).undoTopping?.(); }
  release() { this.inner.release(); }
}
