import type { Reward } from './sticker-game';
import { FOOD_ART } from './food-art.ts';
export const RULES = {
  speed: 6, chaserSpeed: 6.1, exhaustedSpeed: 4.2, boostSpeed: 9,
  staminaDrain: 4, food: 20, goldFood: 25, recover: 12, goldChance: .1,
  boostSeconds: 1, initialGap: 15, maxGap: 60, hitCost: 3, hitInvulnerability: .5,
  gravity: 1900, jumpVelocity: -760, floor: 460, scale: 44,
  playerHeight: 82, playerWidth: 64, halfHitWidth: 24, crouchHeight: 36,
  rescueSeconds: .9, fallDepth: 100,
  foodHazardMargin: 4, minFoodSpacing: 8, foodLiftMin: 48, foodLiftMax: 205,
  jumpReleaseVelocity: -500, platformHeight: 110, platformApproach: 8,
  platformExit: 8, platformFirstHazard: 10,
  glideSeconds: 1, glideVelocity: 125, dropVelocity: 100, gateWidth: 64, gateTop: -600, gateUnderhang: 10,
};
// Bounded progression keeps the course readable while increasing pressure.
export const difficultyAt = (distance: number) => {
  const level = Math.min(1, Math.max(0, distance) / 1200);
  return { level, obstacleSpacing: 22 - 4 * level, foodSpacing: 24 + 6 * level };
};
// Each object has one readable silhouette; difficulty changes spacing, never its width.
export const OBSTACLE_WIDTHS = { block: 56, tower: 48, long: 145, pit: 160, beam: 160, crawl: 320 } as const;
export const COURSE_RANDOM = { firstHazardMin: 19, firstHazardMax: 25, hazardExtra: 5, foodJitter: 2, foodPositionJitter: 8 } as const;
export type Item = { id: number; x: number; y: number; w: number; h: number; kind: 'block' | 'beam' | 'tower' | 'long' | 'crawl' | 'pit' | 'food' | 'gold' | 'coin'; used: boolean; variant?: number; coinValue?: 1 | 3; coinGroup?: number };
export const COIN_RULES = { size: 28, spacing: 1.8, arcSpacing: 1.2, minGroup: 1, maxGroup: 5, gapMin: 14, gapExtra: 12, goldChance: .05, goldValue: 3, firstCoinX: 10 } as const;
export const GLIDE_TRAIL = { pick: .68, minHeight: 150, maxHeight: 195, lowest: 60, landingClear: 5 } as const;
export const SPAWN_CLEARANCE = { encounter: 8, encounterHazard: 6, foodCoin: 5, coinHazard: 4 } as const;
const collectible = (kind: Item['kind']) => kind === 'food' || kind === 'gold' || kind === 'coin';
export type Phase = 'ready' | 'running' | 'paused' | 'minigame' | 'over';
export type Platform = { id: number; start: number; end: number; y: number; required: boolean; gateX?: number };
export type Encounter = { id: number; x: number; y: number; seed: number; used: boolean };
type Rescue = { time: number; fromX: number; toX: number; fromY: number };
export class RunnerModel {
  glideLeft: number = RULES.glideSeconds; // shared by every glide of one airtime; refilled on landing
  coins = 0; // this run only: no stamina, speed or distance effect, never saved
  phase: Phase = 'ready'; distance = 0; gap = RULES.initialGap; stamina = 100; exhausted = false; boost = 0; elapsed = 0;
  y = RULES.floor; vy = 0; jumps = 0; crouch = false; hitFlash = 0; foods = 0; bonus = 0; hits = 0;
  items: Item[] = []; events: string[] = []; rescue: Rescue | null = null;
  platforms: Platform[] = []; blocked = false;
  droppingPlatformId: number | null = null;
  encounters: Encounter[] = []; activeEncounter: Encounter | null = null;
  eventBoost = 0; eventMultiplier = 1;
  private encounterCourse: boolean; private encounterState: number; private encounterIndex = 0; private lastEncounterX = 0;
  private jumpHeld = false; private nextPlatformX = 80; private platformIndex = 0;
  private platformRandomState: number; private platformCourse: boolean;
  private nextHazardX = 19; private nextFoodX = 7; private id = 0; private jumpBuffer = 0;
  private lastGroundHazard: { x: number; w: number } | null = null;
  private hazardState: number; private foodState: number; private artSeed: number;
  private generateCourse: boolean; private lastFoodX = -Infinity;
  private coinCourse: boolean; private coinState: number; private nextCoinX: number = COIN_RULES.firstCoinX; private coinId = 1000000; private coinGroupIndex = 0; private foodFreeDistance: number;
  private separateSpawns: boolean;
  constructor(seed = 13579, generateCourse = true, options: { platforms?: boolean; encounters?: boolean; coins?: boolean; foodFreeDistance?: number; separateSpawns?: boolean } = {}) {
    this.separateSpawns = options.separateSpawns === true;
    this.coinCourse = options.coins === true; this.coinState = (seed ^ 0xc2b2ae35) >>> 0;
    this.foodFreeDistance = Math.max(0, options.foodFreeDistance ?? 0); this.nextFoodX = Math.max(this.nextFoodX, this.foodFreeDistance);
    this.hazardState = (seed ^ 0x243f6a88) >>> 0; this.foodState = (seed ^ 0xb7e15162) >>> 0;
    this.artSeed = (seed ^ 0xdeadbeef) >>> 0; this.platformRandomState = (seed ^ 0x9e3779b9) >>> 0;
    this.nextHazardX = COURSE_RANDOM.firstHazardMin + this.random('hazard') * (COURSE_RANDOM.firstHazardMax-COURSE_RANDOM.firstHazardMin);
    this.encounterState = (seed ^ 0x85ebca6b) >>> 0; this.encounterCourse = options.encounters !== false;
    this.generateCourse = generateCourse; this.platformCourse = options.platforms !== false; this.generate();
  }
  get speed() {
    const base = this.exhausted ? RULES.exhaustedSpeed : RULES.speed;
    return Math.max(base, this.boost > 0 ? RULES.boostSpeed : 0, this.eventBoost > 0 ? RULES.speed * this.eventMultiplier : 0);
  }
  get supportY() {
    return this.platforms.find(p => p.id !== this.droppingPlatformId && this.distance >= p.start && this.distance <= p.end && Math.abs(this.y - p.y) < .01)?.y ?? RULES.floor;
  }
  get grounded() { return !this.rescue && this.vy === 0 && Math.abs(this.y - this.supportY) < .01 && (this.supportY < RULES.floor || !this.pitAt(this.distance)); }
  /** Glide: holding jump in the air after the first jump, on the way down, within the shared glideLeft budget. */
  get gliding() { return this.glideActive(this.vy); }
  private glideActive(vy: number) {
    return this.phase === 'running' && this.jumpHeld && !this.crouch && !this.rescue && this.droppingPlatformId === null
      && this.jumps >= 1 && this.glideLeft > 0 && vy >= 0;
  }
  get height() { return this.crouch && this.grounded ? RULES.crouchHeight : RULES.playerHeight; }
  get invulnerable() { return this.boost > 0 || this.hitFlash > 0 || this.rescue !== null; }
  start() { if (this.phase === 'ready' || this.phase === 'paused') this.phase = 'running'; }
  completeEncounter(id: number, reward: Reward): boolean {
    if (this.phase !== 'minigame' || this.activeEncounter?.id !== id) return false;
    this.stamina = Math.min(100, this.stamina + reward.stamina);
    if (this.stamina >= RULES.recover) this.exhausted = false;
    this.eventBoost = reward.seconds; this.eventMultiplier = reward.speedMultiplier;
    // Settled here, once: the phase check above rejects a second call for the same encounter.
    const coins = Number.isFinite(reward.coins) ? Math.max(0, Math.floor(reward.coins!)) : 0; this.coins += coins;
    this.activeEncounter = null; this.crouch = false; this.jumpBuffer = 0; this.jumpHeld = false; this.phase = 'running';
    return true;
  }
  pause() { if (this.phase === 'running') { this.releaseJump(); this.phase = 'paused'; this.crouch = false; this.jumpBuffer = 0; } }
  jump() {
    if (this.phase !== 'running' || this.rescue) return;
    if (this.crouch && this.grounded && this.supportY < RULES.floor) {
      const platform = this.platforms.find(p => p.id !== this.droppingPlatformId && this.distance >= p.start && this.distance <= p.end && Math.abs(this.y-p.y) < .01)!;
      this.droppingPlatformId = platform.id; this.y += 1; this.vy = RULES.dropVelocity;
      this.jumps = 2; this.jumpBuffer = 0; this.jumpHeld = false; this.crouch = false;
      this.events.push('발판 아래로 내려가기'); return;
    }
    if (this.droppingPlatformId !== null) return;
    this.jumpHeld = true; this.jumpBuffer = .1;
  }
  releaseJump() {
    this.jumpHeld = false;
    if (this.phase === 'running' && this.jumps === 1 && this.vy < RULES.jumpReleaseVelocity) this.vy = RULES.jumpReleaseVelocity;
  }
  eat(kind: 'food' | 'gold') {
    const amount = kind === 'gold' ? RULES.goldFood : RULES.food;
    this.stamina = Math.min(100, this.stamina + amount); this.foods++;
    if (this.stamina >= RULES.recover) this.exhausted = false;
    if (kind === 'gold') { this.boost = RULES.boostSeconds; this.bonus += this.gap >= RULES.maxGap - .1 ? 100 : 30; this.events.push(`황금! +${amount} 체력 · 1초 무적 가속`); }
    else this.events.push(`+${amount} 체력`);
  }
  hit(): boolean {
    if (this.invulnerable) return false;
    this.gap = Math.max(0, this.gap - RULES.hitCost); this.hitFlash = RULES.hitInvulnerability; this.hits++;
    this.events.push(`충돌! 뒤로 밀림 −${RULES.hitCost}m`); return true;
  }
  private pitAt(distance: number) { return this.items.find(i => i.kind === 'pit' && Math.abs((i.x - distance) * RULES.scale) < i.w / 2); }
  step(dt: number) {
    if (this.phase !== 'running') return;
    const boostingThisStep = this.boost > 0;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.jumpBuffer > 0 && this.jumps < 2 && !this.rescue && this.y < RULES.floor + RULES.fallDepth) {
      this.vy = RULES.jumpVelocity; // jump arc is independent of the current run speed
      this.jumps++; this.crouch = false; this.jumpBuffer = 0;
      if (this.jumps === 1 && !this.jumpHeld) this.vy = RULES.jumpReleaseVelocity;
      this.events.push(this.jumps === 2 ? '더블 점프' : '점프');
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.elapsed += dt;
    const speed = this.speed;
    const previousX = this.distance, previousY = this.y;
    let nextX = this.distance + speed * dt;
    const nextVy = this.vy + RULES.gravity * dt;
    const predictedY = this.y + (this.glideActive(nextVy) ? Math.min(nextVy, RULES.glideVelocity) : nextVy) * dt;
    const wall = this.platforms.find(p => p.required && previousX <= p.start && nextX + RULES.halfHitWidth / RULES.scale > p.start && predictedY > p.y + .01);
    this.blocked = !!wall && !this.rescue;
    if (this.blocked) nextX = Math.max(previousX, wall!.start - RULES.halfHitWidth / RULES.scale);
    const gate = this.platforms.find(p => p.gateX !== undefined
      && nextX + RULES.halfHitWidth / RULES.scale > p.gateX - RULES.gateWidth / 2 / RULES.scale
      && previousX - RULES.halfHitWidth / RULES.scale < p.gateX + RULES.gateWidth / 2 / RULES.scale
      && predictedY > RULES.gateTop && predictedY - this.height < p.y + RULES.gateUnderhang);
    if (gate && !this.rescue) {
      this.blocked = true;
      nextX = Math.max(previousX, gate.gateX! - (RULES.gateWidth/2+RULES.halfHitWidth)/RULES.scale);
    }
    this.distance = nextX;
    const effectiveSpeed = this.blocked ? (nextX - previousX) / dt : speed;
    this.gap = Math.min(RULES.maxGap, this.gap + (effectiveSpeed - RULES.chaserSpeed) * dt);
    this.stamina = Math.max(0, this.stamina - RULES.staminaDrain * dt);
    if (this.stamina <= 0) this.exhausted = true;
    this.generate();
    if (this.rescue) {
      const r = this.rescue; r.time = Math.min(RULES.rescueSeconds, r.time + dt);
      const t = r.time / RULES.rescueSeconds;
      this.distance = r.fromX + (r.toX - r.fromX) * t;
      this.y = r.fromY + (RULES.floor - r.fromY) * t - Math.sin(t * Math.PI) * 205;
      if (t >= 1) { this.rescue = null; this.y = RULES.floor; this.vy = 0; this.jumps = 0; this.droppingPlatformId = null; this.glideLeft = RULES.glideSeconds; }
    } else {
      this.vy += RULES.gravity * dt;
      if (this.glideActive(this.vy)) { this.vy = Math.min(this.vy, RULES.glideVelocity); this.glideLeft = Math.max(0, this.glideLeft - dt); }
      this.y += this.vy * dt;
      const pit = this.pitAt(this.distance);
      const landing = this.platforms.filter(p => p.id !== this.droppingPlatformId && this.distance >= p.start && this.distance <= p.end && previousY <= p.y + .01 && this.y >= p.y && this.vy >= 0).sort((a,b) => a.y-b.y)[0];
      if (landing) { this.y = landing.y; this.vy = 0; this.jumps = 0; this.glideLeft = RULES.glideSeconds; }
      else if (this.y >= RULES.floor && this.vy >= 0 && !pit && this.y < RULES.floor + 25) {
        this.y = RULES.floor; this.vy = 0; this.jumps = 0; this.droppingPlatformId = null; this.glideLeft = RULES.glideSeconds;
      }
      if (this.y >= RULES.floor + RULES.fallDepth) {
        const lastPit = pit ?? this.items.filter(i => i.kind === 'pit' && i.x < this.distance + 5).at(-1);
        if (!boostingThisStep) this.hit();
        if (lastPit) lastPit.used = true;
        const desired = Math.max(this.distance + speed * RULES.rescueSeconds, (lastPit?.x ?? this.distance) + (lastPit?.w ?? 0) / 2 / RULES.scale + 1.2);
        this.rescue = { time: 0, fromX: this.distance, toX: this.safeLanding(desired), fromY: this.y };
        this.vy = 0; this.jumpBuffer = 0; this.events.push('자동 점프로 길 위에 복귀!');
      }
    }
    if (this.gap <= 0) { this.gap = 0; this.phase = 'over'; return; }
    const px = this.distance * RULES.scale;
    if (!this.rescue) {
      const touching = this.items.filter(i => !i.used && i.kind !== 'pit' && px + RULES.halfHitWidth > i.x * RULES.scale - i.w / 2 && px - RULES.halfHitWidth < i.x * RULES.scale + i.w / 2 && this.y > i.y && this.y - this.height < i.y + i.h);
      // Golden food wins ties with hazards independent of array ordering.
      for (const i of touching) if (i.kind === 'coin') { i.used = true; this.coins += i.coinValue ?? 1; }
      for (const i of touching) if (i.kind === 'food' || i.kind === 'gold') { i.used = true; this.eat(i.kind); }
      for (const i of touching) if (!collectible(i.kind)) {
        if (!boostingThisStep && this.hit()) i.used = true;
      }
    }
    this.boost = Math.max(0, this.boost - dt);
    this.eventBoost = Math.max(0, this.eventBoost - dt);
    if (this.gap <= 0) { this.gap = 0; this.phase = 'over'; }
    if (this.phase === 'running' && this.grounded && !this.blocked && this.hitFlash === 0 && !this.crouch) {
      const encounter = this.encounters.find(e => !e.used && Math.abs(this.distance - e.x) < 1.6 && Math.abs(this.y - e.y) < .01);
      if (encounter) {
        encounter.used = true; this.activeEncounter = encounter; this.phase = 'minigame';
        this.jumpHeld = false; this.jumpBuffer = 0; this.crouch = false;
      }
    }
    this.items = this.items.filter(i => i.x + i.w / RULES.scale / 2 > this.distance - 16);
    this.platforms = this.platforms.filter(p => p.end > this.distance - 16);
    this.encounters = this.encounters.filter(e => e.x > this.distance - 16);
  }
  private coinRandom() { this.coinState = (Math.imul(1664525, this.coinState) + 1013904223) >>> 0; return this.coinState / 4294967296; }
  private generateCoins() {
    if (!this.coinCourse) return;
    // A pending NPC reservation can delay planning. Skip missed slots instead
    // of revealing a new trail inside the visible course or behind the runner.
    if (this.separateSpawns) this.nextCoinX = Math.max(this.nextCoinX, this.distance + 20);
    const S = RULES.scale, C = COIN_RULES.size, floor = RULES.floor, g = RULES.gravity / 2, v = -RULES.jumpVelocity;
    const hazards = () => this.items.filter(i => !collectible(i.kind));
    const clearOfPlatforms = (a: number, b: number) => this.platforms.every(p => b < p.start - RULES.platformApproach - 3 || a > p.end + RULES.platformExit + 3);
    // Margin keeps decorative pickups away from every hazard except the one the lane deliberately uses.
    const clearOfHazards = (a: number, b: number, ignore?: Item) => hazards().every(i => i === ignore || b < i.x - i.w / 2 / S - (RULES.halfHitWidth + C) / S - 1.5 || a > i.x + i.w / 2 / S + (RULES.halfHitWidth + C) / S + 1.5);
    // Keep trails behind future food's jitter window and the earliest unplanned
    // NPC. Once that NPC is reserved, the next generation can fill beyond it.
    const horizon = this.separateSpawns
      ? Math.min(this.distance + 64, this.encounterCourse
        ? this.lastEncounterX + 200 - SPAWN_CLEARANCE.encounter - C / 2 / S : Infinity)
      : this.distance + 96;
    while (this.nextCoinX < horizon) {
      const start = this.nextCoinX, count = COIN_RULES.minGroup + Math.floor(this.coinRandom() * (COIN_RULES.maxGroup - COIN_RULES.minGroup + 1));
      const lanePick = this.coinRandom();
      type Spot = { x: number; top: number };
      let spots: Spot[] | undefined;
      const airTime = (v / RULES.gravity), airHalf = airTime * RULES.speed; // apex is airHalf metres after take-off
      const targets = hazards().filter(i => (i.kind === 'block' && i.y === floor - 64 || i.kind === 'beam' && i.y === 84) && i.x >= start && i.x <= start + 30).sort((a, b) => a.x - b.x);
      if (!this.separateSpawns && lanePick < .6) for (const t of targets) {
        if (t.kind === 'beam') {
          const n = Math.max(1, Math.min(count, Math.floor((t.w / S - .6) / COIN_RULES.spacing) + 1));
          const xs = Array.from({ length: n }, (_, k) => t.x + (k - (n - 1) / 2) * COIN_RULES.spacing);
          if (xs[0] >= start && clearOfPlatforms(xs[0], xs[n - 1]) && clearOfHazards(xs[0] - 4, xs[n - 1] + 4, t)) { spots = xs.map(x => ({ x, top: floor - 34 })); break; }
        } else {
          const n = count, xs = Array.from({ length: n }, (_, k) => t.x + (k - (n - 1) / 2) * COIN_RULES.arcSpacing);
          const first = t.x - airHalf;
          if (first >= start && clearOfPlatforms(first - 1, t.x + airHalf + 1) && clearOfHazards(first - 1, t.x + airHalf + 1, t)) {
            spots = xs.map(x => { const tm = (x - t.x + airHalf) / RULES.speed, h = Math.max(0, v * tm - g * tm * tm); return { x, top: floor - h - 41 - C / 2 }; });
            break;
          }
        }
      }
      if (this.separateSpawns && lanePick < GLIDE_TRAIL.pick) {
        // Air trail on the glide descent line: 4-5 coins sloping down at glideVelocity / speed, 150-195 px above the floor.
        const dx = COIN_RULES.arcSpacing, drop = RULES.glideVelocity / (RULES.speed * S) * dx * S;
        const high = GLIDE_TRAIL.minHeight + this.coinRandom() * (GLIDE_TRAIL.maxHeight - GLIDE_TRAIL.minHeight);
        const n = this.coinRandom() < .5 ? 4 : 5, m = high - drop * (n - 1) >= GLIDE_TRAIL.lowest ? n : 4;
        const last = start + (m - 1) * dx;
        if (clearOfPlatforms(start - 1, last + GLIDE_TRAIL.landingClear) && clearOfHazards(start - 1, last + GLIDE_TRAIL.landingClear))
          spots = Array.from({ length: m }, (_, k) => ({ x: start + k * dx, top: floor - (high - drop * k) - C / 2 }));
        if (!spots) { this.nextCoinX += 2; continue; }
      }
      if (!spots) {
        const xs = Array.from({ length: count }, (_, k) => start + k * COIN_RULES.spacing);
        if (clearOfPlatforms(xs[0], xs[count - 1]) && clearOfHazards(xs[0], xs[count - 1])) spots = xs.map(x => ({ x, top: floor - 41 - C / 2 }));
      }
      if (!spots) { this.nextCoinX += 2; continue; }
      if (this.separateSpawns && spots[spots.length - 1].x >= horizon) break;
      if (this.separateSpawns && spots.some(s =>
        this.encounters.some(e => Math.abs(s.x - e.x) < SPAWN_CLEARANCE.encounter + C / 2 / S)
        || this.items.some(i => (i.kind === 'food' || i.kind === 'gold')
          ? Math.abs(s.x - i.x) < SPAWN_CLEARANCE.foodCoin + (i.w + C) / 2 / S
          : !collectible(i.kind) && Math.abs(s.x - i.x) < SPAWN_CLEARANCE.coinHazard + (i.w + C) / 2 / S))) {
        this.nextCoinX += 2; continue;
      }
      const group = this.coinGroupIndex++;
      for (const s of spots) {
        const value = this.coinRandom() < COIN_RULES.goldChance ? COIN_RULES.goldValue : 1;
        this.items.push({ id: this.coinId++, x: s.x, y: s.top, w: C, h: C, kind: 'coin', used: false, coinValue: value, coinGroup: group });
      }
      this.nextCoinX = spots[spots.length - 1].x + COIN_RULES.gapMin + this.coinRandom() * COIN_RULES.gapExtra;
    }
  }
  private safeLanding(distance: number) {
    // Move past the entire union of nearby hazards, including adjoining pits.
    for (let pass = 0; pass <= this.items.length; pass++) {
      const platform = this.platforms.find(p => distance > p.start - RULES.platformApproach && distance < p.end + RULES.platformExit);
      if (platform) { distance = platform.end + RULES.platformExit; continue; }
      const i = this.items.find(i => !collectible(i.kind) && distance * RULES.scale + RULES.halfHitWidth > i.x * RULES.scale - i.w / 2 && distance * RULES.scale - RULES.halfHitWidth < i.x * RULES.scale + i.w / 2);
      if (!i) break;
      distance = i.x + (i.w / 2 + RULES.halfHitWidth) / RULES.scale + 1;
    }
    return distance;
  }
  private random(stream: 'hazard' | 'food' | 'platform') {
    const key = stream === 'hazard' ? 'hazardState' : stream === 'food' ? 'foodState' : 'platformRandomState';
    this[key] = (Math.imul(1664525, this[key]) + 1013904223) >>> 0; return this[key] / 4294967296;
  }
  private add(x: number, y: number, w: number, h: number, kind: Item['kind']) {
    // Visual choice is position-seeded, so generating a distant branch first
    // cannot change an already scheduled food's appearance.
    let hash = Math.imul(this.artSeed ^ Math.round(x * 1024), 0x45d9f3b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    const variant = ((hash ^ (hash >>> 16)) >>> 0) % FOOD_ART.length;
    this.items.push({ id: this.id++, x, y, w, h, kind, used: false,
      // Food picks one of 9 sprites; a block is a stump (0) or a rock (1). Both are the same 1-jump obstacle, so the
      // choice only changes how it is drawn (position-seeded: no random numbers are drawn, courses do not change).
      ...(['food','gold'].includes(kind) ? {variant} : kind === 'block' ? {variant: (hash >>> 20) & 1} : {}) });
  }
  private generate() {
    if (!this.generateCourse) return;
    // Terrain is planned beyond both item horizons before either can be placed.
    if (this.platformCourse) while (this.nextPlatformX < this.distance + 220) {
      const lengthRoll = this.random('platform');
      const n = this.platformIndex++, start = this.nextPlatformX;
      const switching = n % 6 === 1;
      const length = switching ? 36 : [12, 20, 36][Math.floor(lengthRoll * 3)];
      const p: Platform = { id: n, start, end: start + length, y: RULES.floor - RULES.platformHeight, required: n % 2 === 1,
        ...(switching ? {gateX: start + 20 + this.random('platform') * 4} : {}) };
      this.platforms.push(p); this.nextPlatformX += 180;
      const foodX = start + 3 + this.random('platform') * .5, lift = 48 + this.random('platform') * 52;
      this.add(foodX, p.y - lift, 32, 32, this.random('platform') < RULES.goldChance ? 'gold' : 'food');
      // Short branches are bonus paths; long ones have one well-spaced upper hazard.
      if (length >= 20 && !switching) {
        const x = start + RULES.platformFirstHazard + this.random('platform') * (length === 20 ? .5 : 4);
        const type = Math.floor(this.random('platform') * 3);
        // A fixed 160px beam needs half a metre more food clearance at the
        // earliest upper slot; keep every other upper obstacle's timing intact.
        if (type === 0) this.add(Math.max(x, start + RULES.platformFirstHazard + .5), 0, OBSTACLE_WIDTHS.beam, p.y - 44, 'beam');
        else if (type === 1) this.add(x, p.y - 64, OBSTACLE_WIDTHS.block, 64, 'block');
        else this.add(x, p.y - 46, OBSTACLE_WIDTHS.long, 46, 'long');
      }
    }
    // Generate hazards beyond the food horizon first, so future obstacles cannot
    // invalidate an already placed food's approach/landing clearance.
    while (this.nextHazardX < this.distance + 140) {
      let x = this.nextHazardX;
      const spacing = difficultyAt(x).obstacleSpacing + this.random('hazard') * COURSE_RANDOM.hazardExtra;
      this.nextHazardX = x + spacing;
      // Clear both the lower lane and the approach/descent of every branch.
      if (this.platforms.some(p => x > p.start - RULES.platformApproach - 3 && x < p.end + RULES.platformExit + 3)) continue;
      const type = Math.floor(this.random('hazard') * 6);
      const kind = (['block', 'beam', 'tower', 'long', 'pit', 'crawl'] as const)[type];
      // The long crawl object gets enough approach/exit space without changing
      // its width. Persist the last placement so pruning cannot change a seed.
      if (this.lastGroundHazard) x = Math.max(x, this.lastGroundHazard.x
        + (this.lastGroundHazard.w + OBSTACLE_WIDTHS[kind]) / 2 / RULES.scale + 13);
      this.nextHazardX = x + spacing;
      if (this.platforms.some(p => x > p.start - RULES.platformApproach - 3 && x < p.end + RULES.platformExit + 3)) continue;
      this.lastGroundHazard = { x, w: OBSTACLE_WIDTHS[kind] };
      if (type === 1) this.add(x, 84, OBSTACLE_WIDTHS.beam, RULES.floor - 44 - 84, 'beam');
      else if (type === 2) this.add(x, RULES.floor - 190, OBSTACLE_WIDTHS.tower, 190, 'tower');
      else if (type === 3) this.add(x, RULES.floor - 46, OBSTACLE_WIDTHS.long, 46, 'long');
      else if (type === 4) this.add(x, RULES.floor, OBSTACLE_WIDTHS.pit, 170, 'pit');
      else if (type === 5) this.add(x, RULES.floor - 156, OBSTACLE_WIDTHS.crawl, 112, 'crawl');
      else this.add(x, RULES.floor - 64, OBSTACLE_WIDTHS.block, 64, 'block');
    }
    while (this.nextFoodX < this.distance + 96) {
      const desired = this.nextFoodX;
      this.nextFoodX += difficultyAt(desired).foodSpacing + (this.random('food') * 2 - 1) * COURSE_RANDOM.foodJitter;
      const safe = (x: number) => x >= this.foodFreeDistance && x - this.lastFoodX >= RULES.minFoodSpacing
        && (!this.separateSpawns || this.encounters.every(e => Math.abs(x - e.x) >= SPAWN_CLEARANCE.encounter + 16 / RULES.scale))
        && this.items.every(i => i.kind !== 'food' && i.kind !== 'gold' || Math.abs(x - i.x) >= RULES.minFoodSpacing)
        && this.platforms.every(p => x < p.start - 4 || x > p.end + 4 || x >= p.start + 3 && x <= p.end - 3)
        && this.platforms.every(p => p.gateX === undefined || x < p.gateX - 6 || x > p.end + 4)
        && this.items.every(i => collectible(i.kind) || Math.abs(x - i.x) > i.w / 2 / RULES.scale + (RULES.halfHitWidth + 16) / RULES.scale + RULES.foodHazardMargin);
      // Bounded search near each scheduled food, never relaxing hazard clearance.
      // Unsafe slots are skipped rather than placing food against an obstacle.
      let foodX: number | undefined;
      for (let attempt = 0; attempt < 24; attempt++) {
        const candidate = desired + (this.random('food') * 2 - 1) * COURSE_RANDOM.foodPositionJitter;
        if (safe(candidate)) { foodX = candidate; break; }
      }
      if (foodX === undefined) continue;
      this.lastFoodX = foodX;
      const lift = RULES.foodLiftMin + this.random('food') * (RULES.foodLiftMax - RULES.foodLiftMin);
      const platform = this.platforms.find(p => foodX! >= p.start && foodX! <= p.end);
      this.add(foodX, (platform?.y ?? RULES.floor) - lift, 32, 32, this.random('food') < RULES.goldChance ? 'gold' : 'food');
    }
    if (!this.separateSpawns) this.generateCoins();
    // A separate seeded schedule never changes the obstacle/food random stream.
    while (this.encounterCourse && this.lastEncounterX + 300 <= this.distance + 120) {
      if (this.separateSpawns && this.lastEncounterX + 300 < this.distance + 16) {
        // Recover a missed planning band without spawning an NPC behind the runner.
        this.lastEncounterX = this.distance - 184;
      }
      const nextState = (Math.imul(1664525, this.encounterState) + 1013904223) >>> 0;
      const desired = this.lastEncounterX + 200 + nextState / 4294967296 * 100;
      const candidates = Array.from({ length: 201 }, (_, n) => this.lastEncounterX + 200 + n * .5)
        .sort((a,b) => Math.abs(a-desired)-Math.abs(b-desired));
      const safeEncounter = (x: number) => {
        if (this.separateSpawns && x < this.distance + 16) return false;
        // Do not select beyond the known hazard horizon.
        // In spaced mode food is known through +96m; leave its future 8m
        // search jitter and the clearing outside the reservation horizon.
        if (x > this.distance + (this.separateSpawns ? 78 : 120)) return false;
        if (this.platforms.some(p => x > p.start - 8 && x < p.end + 8 && !(x >= p.start + 4 && x <= p.end - 4))) return false;
        if (this.platforms.some(p => p.gateX !== undefined && x >= p.gateX - 8 && x <= p.end + 8)) return false;
        return this.items.every(i => collectible(i.kind)
          ? !this.separateSpawns || Math.abs(i.x - x) >= SPAWN_CLEARANCE.encounter + i.w / 2 / RULES.scale
          : Math.abs(x-i.x) > (i.w/2+RULES.halfHitWidth)/RULES.scale + (this.separateSpawns ? SPAWN_CLEARANCE.encounterHazard : 6));
      };
      const x = candidates.find(safeEncounter);
      if (x === undefined) break; // wait for more known course instead of weakening safety
      this.encounterState = nextState;
      const surface = this.platforms.find(p => x >= p.start && x <= p.end);
      this.encounters.push({ id: this.encounterIndex++, x, y: surface?.y ?? RULES.floor, seed: this.encounterState, used: false });
      this.lastEncounterX = x;
    }
    if (this.separateSpawns) this.generateCoins();
  }
}
