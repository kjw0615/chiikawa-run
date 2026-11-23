// Four result tiers shared by every mini game, with the reward / penalty each game gives per tier.
// A game only decides WHICH tier it reached (from its own measure: successes, kills, points...);
// the numbers live here so balance changes happen in one place. Rewards are plain `Reward` values:
// negative coins / stamina are penalties and `speedMultiplier` below 1 is a slow-down. The model
// (RunnerModel.completeEncounter) keeps coins >= 0 and stamina >= 1 so a penalty can never end the run.
import type { Reward } from './sticker-game';

export type MiniTier = 'perfect' | 'great' | 'good' | 'bad';
export const MINI_TIERS: readonly MiniTier[] = ['perfect', 'great', 'good', 'bad'];
export const TIER_LABEL: Record<MiniTier, string> = { perfect: '만점', great: '우수', good: '그럭저럭', bad: '나쁨' };

export type TierGame = 'chiikawa' | 'hachiware' | 'rakko' | 'kurimanju' | 'shisa' | 'usagi' | 'kani';
const coins = (n: number): Reward => ({ stamina: 0, speedMultiplier: 1, seconds: 0, coins: n });
const hp = (n: number): Reward => ({ stamina: n, speedMultiplier: 1, seconds: 0, coins: 0 });
const speed = (multiplier: number, seconds: number): Reward => ({ stamina: 0, speedMultiplier: multiplier, seconds, coins: 0 });

export const TIER_REWARDS: Record<TierGame, Record<MiniTier, Reward>> = {
  chiikawa: { perfect: coins(5), great: coins(3), good: coins(1), bad: coins(-3) },
  hachiware: { perfect: coins(6), great: coins(4), good: coins(2), bad: coins(-3) },
  rakko: { perfect: coins(10), great: coins(5), good: coins(2), bad: { stamina: -10, speedMultiplier: 1, seconds: 0, coins: -5 } },
  kurimanju: { perfect: hp(30), great: hp(20), good: hp(10), bad: hp(-20) },
  shisa: { perfect: hp(30), great: hp(20), good: hp(10), bad: hp(-20) },
  usagi: { perfect: speed(1.3, 2), great: speed(1.3, 1.4), good: speed(1.3, .8), bad: speed(.8, 1.5) },
  kani: { perfect: speed(1.3, 2), great: speed(1.3, 1.4), good: speed(1.3, .8), bad: speed(.8, 1.5) },
};

export const rewardForTier = (game: TierGame, tier: MiniTier): Reward => ({ ...TIER_REWARDS[game][tier] });

/** Reward lines for the result screen: only what changes (no scores). */
export function describeReward(reward: Reward): string {
  const parts: string[] = [];
  const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;
  const c = reward.coins ?? 0;
  if (c) parts.push(`동전 ${signed(c)}`);
  if (reward.stamina) parts.push(`체력 ${signed(reward.stamina)}`);
  if (reward.speedMultiplier !== 1 && reward.seconds > 0) {
    parts.push(`${reward.speedMultiplier}배 ${reward.speedMultiplier > 1 ? '가속' : '감속'} ${reward.seconds}초`);
  }
  return parts.length ? parts.join(' · ') : '변화 없음';
}
