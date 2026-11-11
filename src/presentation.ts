import { RULES } from './model.ts';
// Presentation distances deliberately compress the chase without changing game rules.
export const MONSTER_HEIGHT = 280;
export const MONSTER_WIDTH = 420;
// Keep the initial leading edge at 266px even though the rule gap is now 15m.
// At gap 0 its leading edge still reaches the hero at 560.
export const monsterX = (gap: number) => 350 - gap * (294 / RULES.initialGap);
export const smoothGap = (current: number, target: number, seconds: number) =>
  target + (current - target) * Math.exp(-8 * Math.max(0, seconds));

export const chaseMarkerPercent = (gap: number, maxGap = RULES.maxGap) => {
  const start = Math.min(RULES.initialGap, maxGap / 2);
  const ratio = gap <= start ? gap / (2 * start) : .5 + (gap - start) / (2 * (maxGap - start));
  return 8 + Math.max(0, Math.min(1, ratio)) * 84;
};
