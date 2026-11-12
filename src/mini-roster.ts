// Which character brings which mini game. To add a character: add one entry to ROSTER (its portrait and the
// game it starts) and, for a new game, implement MiniGame. The slot reel, the pick by seed and the hand-over to
// the game all follow from this list, so nothing else needs to change.
import { MINI_RULES, StickerGame } from './sticker-game';
import { KurimanjuGame } from './kurimanju-game';
import type { MiniGame, MiniReward } from './mini-game';

export type Portrait = { atlas: string } | { url: string }; // frame in the event atlas, or a separate 192x224 image
export interface RosterEntry { id: string; name: string; portrait: Portrait; create(seed: number): MiniGame }

export const ROSTER: readonly RosterEntry[] = [
  { id: 'chiikawa', name: '치이카와', portrait: { atlas: 'chiikawa' }, create: seed => new StickerGame(seed, { character: 'chiikawa', skipSelection: true }) },
  { id: 'kurimanju', name: '쿠리만쥬', portrait: { url: '/assets/event-kurimanju.webp' }, create: seed => new KurimanjuGame(seed) },
];

/** The character that wins the slot for this encounter seed (stable for a given seed). */
export function rosterIndexFor(seed: number, size: number): number {
  let h = Math.imul(seed >>> 0, 2654435761) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h ^= h >>> 13;
  return size > 0 ? ((h >>> 0) % size) : 0;
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
  constructor(readonly seed: number, readonly roster: readonly RosterEntry[] = ROSTER) {
    this.index = rosterIndexFor(seed, roster.length); this.entry = roster[this.index]; this.inner = this.entry.create(seed);
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
  release() { this.inner.release(); }
}
