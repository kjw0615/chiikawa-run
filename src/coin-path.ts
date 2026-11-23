// Coin guideline planner (pure, no model import): lays coins along the paths a runner really flies, so a trail teaches
// the player where to jump and where to land. The model feeds in physics and course facts and gets coin spots back.
export type CoinSpot = { x: number; top: number; gold?: boolean };
export type CoinPhysics = { speed: number; gravity: number; jumpVelocity: number; floor: number; coin: number };
export const COIN_PATH = {
  archCoins: 7,          // coins on one jump arch (odd, so the apex coin is the middle one)
  archSpacing: 1.1,      // metres between arch coins
  landingCoins: 3,       // ground coins right after the landing point: "land here" line
  landingSpacing: 1.8,
  edgeSpacing: 1.2,      // platform-edge coins (last stretch before the drop)
  edgeCoins: 3,
  bodyLift: 41,          // coin centre sits this far above its floor line, same as the flat line
} as const;

/** Height (px above the floor) of the player's feet t seconds after a full jump take-off. */
export const jumpHeight = (p: CoinPhysics, t: number) => Math.max(0, -p.jumpVelocity * t - p.gravity / 2 * t * t);
/** Metres travelled between take-off and apex. */
export const jumpApexMetres = (p: CoinPhysics) => (-p.jumpVelocity / p.gravity) * p.speed;

/** Arch over a low obstacle at `hazardX`: coins follow the jump parabola centred on the obstacle; the apex coin
 * (right above the obstacle, the hardest spot) is gold. `launch` is the optional ground coin marking take-off. */
export function archOver(p: CoinPhysics, hazardX: number, count: number = COIN_PATH.archCoins): CoinSpot[] {
  const half = jumpApexMetres(p), spots: CoinSpot[] = [];
  const mid = Math.floor(count / 2);
  for (let k = 0; k < count; k++) {
    const x = hazardX + (k - (count - 1) / 2) * COIN_PATH.archSpacing;
    const h = jumpHeight(p, (x - hazardX + half) / p.speed);
    spots.push({ x, top: p.floor - h - COIN_PATH.bodyLift - p.coin / 2, gold: k === mid });
  }
  return spots;
}
/** Ground line where the arch lands: tells the player where the feet come down. */
export function landingLine(p: CoinPhysics, fromX: number, count: number = COIN_PATH.landingCoins): CoinSpot[] {
  return Array.from({ length: count }, (_, k) => ({ x: fromX + k * COIN_PATH.landingSpacing, top: p.floor - COIN_PATH.bodyLift - p.coin / 2 }));
}
/** Coins along a platform top, ending right at the edge (hard spot): the last one is gold. */
export function platformEdge(surfaceY: number, endX: number, p: CoinPhysics, count: number = COIN_PATH.edgeCoins): CoinSpot[] {
  return Array.from({ length: count }, (_, k) => ({ x: endX - 0.6 - (count - 1 - k) * COIN_PATH.edgeSpacing, top: surfaceY - COIN_PATH.bodyLift - p.coin / 2, gold: k === count - 1 }));
}
