// Presentation distances deliberately compress the chase without changing game rules.
export const MONSTER_HEIGHT = 420;
export const MONSTER_WIDTH = 630;
export const monsterX = (gap: number) => 255 - gap * 14.5;
export const smoothGap = (current: number, target: number, seconds: number) =>
  target + (current - target) * Math.exp(-8 * Math.max(0, seconds));
