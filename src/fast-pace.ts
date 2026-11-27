/** Course tempo only. Jump physics, terrain widths, coin paths and encounter rewards live in their own modules. */
export const FAST_PACE = {
  speed: 7.6, chaserSpeed: 7.7, exhaustedSpeed: 5.2, boostSpeed: 11.4,
  staminaDrain: 4.5, food: 18, goldFood: 22,
  chaseRampStart: 750, chaseRampDistance: 500, chaseRampExtra: .6,
  staminaRampStart: 500, staminaRampDistance: 750, staminaRampExtra: 3.5,
  firstHazardMin: 18, firstHazardMax: 22, hazardExtra: 1,
  foodJitter: 1.5, foodLiftMin: 48, foodLiftMax: 100,
} as const;

export function paceAt(distance: number) {
  // 0~500m는 초반의 친숙하고 쾌적한 난이도 유지 (0~0.25)
  // 약 500m부터 본격적으로 난이도가 상승하여 장애물 간격이 타이트해짐
  const earlyRatio = Math.min(1, Math.max(0, distance) / 500);
  const lateRatio = Math.min(1, Math.max(0, distance - 500) / 700);
  const level = earlyRatio * 0.25 + lateRatio * 0.75;

  // 0~500m: 13.5m ~ 12.8m (적당한 간격)
  // 500m 이후: 12.8m -> 9.0m (빠른 내려가기 및 연속 회피 컨트롤 필요)
  const obstacleSpacing = distance < 500
    ? 13.5 - 0.7 * earlyRatio
    : 12.8 - 3.8 * lateRatio;

  const chaseLevel = Math.min(1, Math.max(0, (distance - FAST_PACE.chaseRampStart) / FAST_PACE.chaseRampDistance));
  const staminaLevel = Math.min(1, Math.max(0, (distance - FAST_PACE.staminaRampStart) / FAST_PACE.staminaRampDistance));
  return { level, obstacleSpacing, foodSpacing: 32 + 10 * level,
    staminaDrain: FAST_PACE.staminaDrain + FAST_PACE.staminaRampExtra * staminaLevel,
    chaserSpeed: FAST_PACE.chaserSpeed + FAST_PACE.chaseRampExtra * chaseLevel };
}

export type PaceHazard = 'block' | 'beam' | 'tower' | 'long' | 'pit' | 'crawl' | 'puddle';
/** 초반(0~500m) 기본 3비트 패턴 */
export const PACE_PATTERNS_EARLY: readonly (readonly PaceHazard[])[] = [
  ['block', 'block', 'beam'],
  ['block', 'tower', 'beam'],
  ['beam', 'block', 'long'],
  ['long', 'block', 'beam'],
  ['block', 'pit', 'beam'],
  ['crawl', 'block', 'tower'],
  ['puddle', 'block', 'beam'],
];

/** 500m 이후 고난도 복합 패턴: 점프 후 즉시 앉기/급강하, 장애물 연속 회피 유도 */
export const PACE_PATTERNS_HARD: readonly (readonly PaceHazard[])[] = [
  ['block', 'crawl', 'block'],    // 점프 넘기 -> 즉시 급강하 슬라이딩 -> 다시 점프
  ['beam', 'block', 'crawl'],    // 앉아서 통과 -> 즉시 점프 -> 즉시 급강하 슬라이딩
  ['tower', 'crawl', 'beam'],    // 높은 점프 -> 급강하 앉기 -> 연속 앉기
  ['pit', 'crawl', 'block'],     // 함정 점프 -> 즉시 기어가기 -> 점프
  ['block', 'beam', 'tower'],    // 점프 -> 급강하 앉기 -> 하이 점프
  ['crawl', 'block', 'beam'],    // 기어가기 -> 점프 -> 급강하 기어가기
  ['puddle', 'tower', 'crawl'],  // 점프 -> 2단 점프 -> 급강하 기어가기
];

export const PACE_PATTERNS = PACE_PATTERNS_EARLY;

/** Position in the successfully placed course, rather than generate() call count, owns the rhythm. */
export function paceHazardAt(seed: number, index: number, distance: number = 0): PaceHazard {
  let hash = (seed ^ Math.imul(Math.floor(index / 3) + 1, 0x9e3779b9)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  hash = (hash ^ (hash >>> 13)) >>> 0;
  const patternList = distance >= 500 ? PACE_PATTERNS_HARD : PACE_PATTERNS_EARLY;
  const phrase = patternList[hash % patternList.length];
  return phrase[index % 3];
}

/** Edge-to-edge recovery space, in metres. A double-jump descent must finish before a low ceiling. */
export function paceClearance(before: PaceHazard, after: PaceHazard, distance: number = 0): number {
  const ceiling = (kind: PaceHazard) => kind === 'beam' || kind === 'crawl';
  // 500m 이후에는 빠른 내려가기(Fast Fall)가 가능하므로 클리어런스를 타이트하게 주어 빠른 착지/연속 조작 유도
  const tightMod = distance >= 500 ? 1.5 : 0;
  if (before === 'tower' || after === 'tower' || !ceiling(before) && ceiling(after)) return Math.max(7.5, 10.5 - tightMod);
  if (ceiling(before) && !ceiling(after)) return Math.max(6.5, 8.5 - tightMod);
  return Math.max(5.8, 7.5 - tightMod);
}
