// Common shape of every mini game, so main.ts can drive any of them. A mini game owns its own clock
// (advanced only by step(dt)), never touches the runner model, and only reports a reward; the caller
// applies it once when the phase becomes 'done'. Input is two events: press() and release(), so
// tap games (lemon) and hold games (kurimanju) share one path: key down/up, pointer down/up.
import { StickerGame } from './sticker-game';
export type MiniReward = { stamina: number; speedMultiplier: number; seconds: number; coins?: number };
export interface MiniGame {
  readonly phase: string;
  readonly paused: boolean;
  readonly reward: MiniReward | null;
  readonly coinReward: number;
  readonly countdownRemaining: number;
  /** True while the game is being played (the runner's left/right arrow suppression applies). */
  readonly inPlay: boolean;
  /** True when press()/release() mean something in game, as opposed to the shell's start/continue buttons. */
  readonly interactive: boolean;
  step(dt: number): void;
  pause(): void;
  resume(): void;
  start(): void;
  continue(): void;
  press(): void;
  release(): void;
}
// Only the lemon game has a screen so far; choose by seed here once other games have one.
export function createMiniGame(seed: number): MiniGame { return new StickerGame(seed); }
