// Presentation distances deliberately compress the chase without changing game rules.
export const MONSTER_HEIGHT = 280;
export const MONSTER_WIDTH = 420;
// At gap 30 the leading edge is 266px, matching the previous 21m view
// (three 3m collisions). At gap 0 its leading edge reaches the hero at 560.
export const monsterX = (gap: number) => 350 - gap * 9.8;
export const smoothGap = (current: number, target: number, seconds: number) =>
  target + (current - target) * Math.exp(-8 * Math.max(0, seconds));

export const chaseMarkerPercent = (gap: number, maxGap = 60) => 8 + Math.max(0, Math.min(1, gap / maxGap)) * 84;
