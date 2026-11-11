export const RULES = {
  speed: 6, chaserSpeed: 6, exhaustedSpeed: 3.6, boostSpeed: 9,
  staminaDrain: 3, food: 16, goldFood: 20, recover: 12, goldChance: 1 / 15,
  boostSeconds: 1, maxGap: 60, hitCost: 3, hitInvulnerability: .5,
  gravity: 1900, jumpVelocity: -760, floor: 460, scale: 44,
  playerHeight: 82, playerWidth: 64, halfHitWidth: 24, crouchHeight: 36,
  rescueSeconds: .9, fallDepth: 100,
  foodHazardMargin: 4, minFoodSpacing: 8, foodLiftMin: 48, foodLiftMax: 205,
};
// Upper bounds leave a tested timing window for the required jump(s).
export const OBSTACLE_WIDTHS = { block: [48, 64], tower: [48, 64], long: [140, 210], pit: [120, 220], beam: [100, 220] } as const;
export type Item = { id: number; x: number; y: number; w: number; h: number; kind: 'block' | 'beam' | 'tower' | 'long' | 'pit' | 'food' | 'gold'; used: boolean };
export type Phase = 'ready' | 'running' | 'paused' | 'over';
type Rescue = { time: number; fromX: number; toX: number; fromY: number };
export class RunnerModel {
  phase: Phase = 'ready'; distance = 0; gap = 30; stamina = 100; exhausted = false; boost = 0; elapsed = 0;
  y = RULES.floor; vy = 0; jumps = 0; crouch = false; hitFlash = 0; foods = 0; bonus = 0; hits = 0;
  items: Item[] = []; events: string[] = []; rescue: Rescue | null = null;
  private nextChunk = 0; private id = 0; private jumpBuffer = 0; private jumpMotionScale = 1; private randomState: number; private generateCourse: boolean; private lastFoodX = -Infinity;
  constructor(seed = 13579, generateCourse = true) { this.randomState = seed >>> 0; this.generateCourse = generateCourse; this.generate(); }
  get speed() { return this.boost > 0 ? RULES.boostSpeed : this.exhausted ? RULES.exhaustedSpeed : RULES.speed; }
  get grounded() { return !this.rescue && Math.abs(this.y - RULES.floor) < .01 && !this.pitAt(this.distance); }
  get height() { return this.crouch && this.grounded ? RULES.crouchHeight : RULES.playerHeight; }
  get invulnerable() { return this.boost > 0 || this.hitFlash > 0 || this.rescue !== null; }
  start() { if (this.phase !== 'over') this.phase = 'running'; }
  pause() { if (this.phase === 'running') { this.phase = 'paused'; this.crouch = false; this.jumpBuffer = 0; } }
  jump() { if (this.phase === 'running' && !this.rescue) this.jumpBuffer = .1; }
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
      this.jumpMotionScale = Math.min(1, this.speed / RULES.speed);
      this.vy = RULES.jumpVelocity * this.jumpMotionScale;
      this.jumps++; this.crouch = false; this.jumpBuffer = 0;
      this.events.push(this.jumps === 2 ? '더블 점프' : '점프');
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.elapsed += dt;
    const speed = this.speed;
    this.distance += speed * dt;
    this.gap = Math.min(RULES.maxGap, this.gap + (speed - RULES.chaserSpeed) * dt);
    this.stamina = Math.max(0, this.stamina - RULES.staminaDrain * dt);
    if (this.stamina <= 0) this.exhausted = true;
    this.generate();
    if (this.rescue) {
      const r = this.rescue; r.time = Math.min(RULES.rescueSeconds, r.time + dt);
      const t = r.time / RULES.rescueSeconds;
      this.distance = r.fromX + (r.toX - r.fromX) * t;
      this.y = r.fromY + (RULES.floor - r.fromY) * t - Math.sin(t * Math.PI) * 205;
      if (t >= 1) { this.rescue = null; this.y = RULES.floor; this.vy = 0; this.jumps = 0; this.jumpMotionScale = 1; }
    } else {
      this.vy += RULES.gravity * this.jumpMotionScale ** 2 * dt; this.y += this.vy * dt;
      const pit = this.pitAt(this.distance);
      if (this.y >= RULES.floor && this.vy >= 0 && !pit && this.y < RULES.floor + 25) {
        this.y = RULES.floor; this.vy = 0; this.jumps = 0; this.jumpMotionScale = 1;
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
      for (const i of touching) if (i.kind === 'food' || i.kind === 'gold') { i.used = true; this.eat(i.kind); }
      for (const i of touching) if (i.kind !== 'food' && i.kind !== 'gold') {
        if (!boostingThisStep && this.hit()) i.used = true;
      }
    }
    this.boost = Math.max(0, this.boost - dt);
    if (this.gap <= 0) { this.gap = 0; this.phase = 'over'; }
    this.items = this.items.filter(i => i.x + i.w / RULES.scale / 2 > this.distance - 16);
  }
  private safeLanding(distance: number) {
    // Move past the entire union of nearby hazards, including adjoining pits.
    for (let pass = 0; pass <= this.items.length; pass++) {
      const i = this.items.find(i => i.kind !== 'food' && i.kind !== 'gold' && distance * RULES.scale + RULES.halfHitWidth > i.x * RULES.scale - i.w / 2 && distance * RULES.scale - RULES.halfHitWidth < i.x * RULES.scale + i.w / 2);
      if (!i) break;
      distance = i.x + (i.w / 2 + RULES.halfHitWidth) / RULES.scale + 1;
    }
    return distance;
  }
  private random() { this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0; return this.randomState / 4294967296; }
  private add(x: number, y: number, w: number, h: number, kind: Item['kind']) { this.items.push({ id: this.id++, x, y, w, h, kind, used: false }); }
  private generate() {
    if (!this.generateCourse) return;
    while (this.nextChunk * 24 < this.distance + 48) {
      const n = this.nextChunk++, base = n * 24, type = n % 6;
      const width = (kind: keyof typeof OBSTACLE_WIDTHS) => { const [lo, hi] = OBSTACLE_WIDTHS[kind]; return Math.round(lo + this.random() * (hi - lo)); };
      if (n === 0) this.add(19, RULES.floor - 64, width('block'), 64, 'block');
      else if (type === 1) this.add(base + 7, 84, width('beam'), RULES.floor - 44 - 84, 'beam');
      else if (type === 2) this.add(base + 7, RULES.floor - 190, width('tower'), 190, 'tower');
      else if (type === 3) this.add(base + 7, RULES.floor - 46, width('long'), 46, 'long');
      else if (type === 4) this.add(base + 7, RULES.floor, width('pit'), 170, 'pit');
      else this.add(base + 7, RULES.floor - 64, width('block'), 64, 'block');
      // Separate horizontal safety from vertical reach. Food never forces an
      // immediate jump after a hazard, and can also appear before it.
      const safe = (x: number) => x - this.lastFoodX >= RULES.minFoodSpacing && this.items.every(i => i.kind === 'food' || i.kind === 'gold' || Math.abs(x - i.x) > i.w / 2 / RULES.scale + (RULES.halfHitWidth + 16) / RULES.scale + RULES.foodHazardMargin);
      let foodX = n === 0 ? 7 : base + 21;
      for (let attempt = 0; attempt < 24; attempt++) {
        const candidate = n === 0 ? 3 + this.random() * 7 : base - 3 + this.random() * 24;
        if (safe(candidate)) { foodX = candidate; break; }
      }
      this.lastFoodX = foodX;
      const lift = RULES.foodLiftMin + this.random() * (RULES.foodLiftMax - RULES.foodLiftMin);
      this.add(foodX, RULES.floor - lift, 32, 32, this.random() < RULES.goldChance ? 'gold' : 'food');
    }
  }
}
