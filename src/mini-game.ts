// Common shape of every mini game, so main.ts can drive any of them. A mini game owns its own clock
// (advanced only by step(dt)), never touches the runner model, and only reports a reward; the caller
// applies it once when the phase becomes 'done'. Input is two events: press() and release(), so
// tap games (lemon) and hold games (kurimanju) share one path: key down/up, pointer down/up.
import { StickerGame } from './sticker-game';
import { KurimanjuGame } from './kurimanju-game';
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
// Mini games that are playable; the pick is by seed, so a given encounter is always the same game.
export const ENABLED_MINI_GAMES: readonly ('lemon' | 'kuri')[] = ['lemon', 'kuri'];
export function createMiniGame(seed: number, enabled: readonly ('lemon' | 'kuri')[] = ENABLED_MINI_GAMES): MiniGame {
  const kind = enabled[(Math.imul(seed >>> 0, 2654435761) >>> 16) % enabled.length] ?? 'lemon';
  return kind === 'kuri' ? new KurimanjuGame(seed) : new StickerGame(seed);
}
