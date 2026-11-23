/** Course tempo only. Jump physics, terrain widths, coin paths and encounter rewards live in their own modules. */
export const FAST_PACE = {
  speed: 7.6, chaserSpeed: 7.7, exhaustedSpeed: 5.2, boostSpeed: 11.4,
  staminaDrain: 4.5, food: 18, goldFood: 22,
  firstHazardMin: 18, firstHazardMax: 22, hazardExtra: 2,
  foodJitter: 1.5, foodLiftMin: 48, foodLiftMax: 100,
} as const;

export function paceAt(distance: number) {
  const level = Math.min(1, Math.max(0, distance) / 1200);
  return { level, obstacleSpacing: 15 - 3 * level, foodSpacing: 18 - 2 * level };
}

export type PaceHazard = 'block' | 'beam' | 'tower' | 'long' | 'pit' | 'crawl' | 'puddle';
/** Each three-beat phrase has a readable input rhythm, with fewer long stalls than a uniform seven-kind roll. */
export const PACE_PATTERNS: readonly (readonly PaceHazard[])[] = [
  ['block', 'block', 'beam'],
  ['block', 'tower', 'beam'],
  ['beam', 'block', 'long'],
  ['long', 'block', 'beam'],
  ['block', 'pit', 'beam'],
  ['crawl', 'block', 'tower'],
  ['puddle', 'block', 'beam'],
];

/** Position in the successfully placed course, rather than generate() call count, owns the rhythm. */
export function paceHazardAt(seed: number, index: number): PaceHazard {
  let hash = (seed ^ Math.imul(Math.floor(index / 3) + 1, 0x9e3779b9)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  hash = (hash ^ (hash >>> 13)) >>> 0;
  const phrase = PACE_PATTERNS[hash % PACE_PATTERNS.length];
  return phrase[index % 3];
}

/** Edge-to-edge recovery space, in metres. A double-jump descent must finish before a low ceiling. */
export function paceClearance(before: PaceHazard, after: PaceHazard): number {
  const ceiling = (kind: PaceHazard) => kind === 'beam' || kind === 'crawl';
  if (before === 'tower' || after === 'tower' || !ceiling(before) && ceiling(after)) return 10.5;
  if (ceiling(before) && !ceiling(after)) return 8.5;
  return 7.5;
}
