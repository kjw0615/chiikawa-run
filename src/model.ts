export const RULES = { speed: 6, chaserSpeed: 6, exhaustedSpeed: 3.6, boostSpeed: 7.8, staminaDrain: 8, food: 25, recover: 20, boostSeconds: 4, maxGap: 60, hitCost: 5, gravity: 1800, jumpVelocity: -610, floor: 440, scale: 44 };
export type Item = { id: number; x: number; y: number; w: number; h: number; kind: 'block' | 'beam' | 'tower' | 'food' | 'gold'; used: boolean };
export type Phase = 'ready' | 'running' | 'paused' | 'over';
export class RunnerModel {
  phase: Phase = 'ready'; distance = 0; gap = 30; stamina = 100; exhausted = false; boost = 0; elapsed = 0;
  y = RULES.floor; vy = 0; jumps = 0; crouch = false; hitFlash = 0; foods = 0; bonus = 0; hits = 0;
  items: Item[] = []; events: string[] = []; private nextChunk = 0; private id = 0; private jumpBuffer = 0; private wasCrouching = false; private jumpMotionScale = 1;
  constructor() { this.generate(); }
  get speed() { return this.boost > 0 ? RULES.boostSpeed : this.exhausted ? RULES.exhaustedSpeed : RULES.speed; }
  get grounded() { return this.y >= RULES.floor - .01; }
  get height() { return this.crouch && this.grounded ? 27 : 54; }
  start() { this.phase = 'running'; }
  pause() { if (this.phase === 'running') { this.phase = 'paused'; this.crouch = false; this.jumpBuffer = 0; } }
  jump() { if (this.phase === 'running') this.jumpBuffer = .1; }
  eat(kind: 'food' | 'gold') {
    if (kind === 'food') { this.stamina = Math.min(100, this.stamina + RULES.food); this.foods++; if (this.stamina >= RULES.recover) this.exhausted = false; this.events.push('+25 체력'); }
    else { this.boost = RULES.boostSeconds; this.bonus += this.gap >= RULES.maxGap - .1 ? 100 : 30; this.events.push('황금 가속 ×1.3'); }
  }
  hit() { if (this.hitFlash > 0) return; this.gap -= RULES.hitCost; this.hitFlash = .9; this.hits++; this.events.push('충돌! 거리 −5m'); }
  step(dt: number) {
    if (this.phase !== 'running') return;
    if (this.jumpBuffer > 0 && this.jumps < 2) {
      // Preserve jump height and horizontal clearance when exhausted. A slower
      // takeoff gets a longer arc; recovery/boost never changes gravity mid-arc.
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
    this.boost = Math.max(0, this.boost - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.vy += RULES.gravity * this.jumpMotionScale ** 2 * dt; this.y += this.vy * dt;
    if (this.y >= RULES.floor) { this.y = RULES.floor; this.vy = 0; this.jumps = 0; this.jumpMotionScale = 1; }
    if (this.gap <= 0) { this.gap = 0; this.phase = 'over'; return; }
    this.generate();
    const px = this.distance * RULES.scale;
    // Keep crouching until there is room to stand, before testing collisions.
    if (this.grounded && !this.crouch && this.wasCrouching) {
      for (const i of this.items) if (!i.used && i.kind === 'beam' && Math.abs((i.x - this.distance) * RULES.scale) < i.w / 2 + 17) this.crouch = true;
    }
    const halfWidth = 17, top = this.y - this.height;
    for (const item of this.items) {
      if (item.used || Math.abs(item.x * RULES.scale - px) > 100) continue;
      const ix = item.x * RULES.scale;
      if (px + halfWidth > ix - item.w / 2 && px - halfWidth < ix + item.w / 2 && this.y > item.y && top < item.y + item.h) {
        item.used = true;
        if (item.kind === 'food' || item.kind === 'gold') this.eat(item.kind); else this.hit();
      }
    }
    if (this.gap <= 0) { this.gap = 0; this.phase = 'over'; }
    this.wasCrouching = this.crouch && this.grounded;
    this.items = this.items.filter(i => i.x > this.distance - 10);
  }
  private add(x: number, y: number, w: number, h: number, kind: Item['kind']) { this.items.push({ id: this.id++, x, y, w, h, kind, used: false }); }
  private generate() {
    while (this.nextChunk * 24 < this.distance + 44) {
      const base = this.nextChunk * 24, n = this.nextChunk++;
      if (n === 0) {
        this.add(7, 401, 24, 24, 'food'); this.add(12, 401, 24, 24, 'food');
        this.add(19, 397, 42, 43, 'block'); this.add(19, 309, 24, 24, 'food');
        continue;
      }
      // Hand-authored alternating patterns, spaced for all three speed states.
      const type = n % 3;
      this.add(base + 1.5, 401, 24, 24, 'food');
      if (type === 1) {
        this.add(base + 6, 337, 88, 68, 'beam');
        this.add(base + 13, 397, 42, 43, 'block');
        this.add(base + 13, 308, 24, 24, 'food');
      } else if (type === 2) {
        this.add(base + 7, 313, 48, 127, 'tower');
        this.add(base + 7, 240, 24, 24, 'food');
        this.add(base + 16, 401, 24, 24, 'food');
      } else {
        this.add(base + 6, 397, 42, 43, 'block');
        this.add(base + 6, 308, 24, 24, 'food');
        this.add(base + 14, 337, 88, 68, 'beam');
      }
      this.add(base + 20, 401, 24, 24, n % 2 === 1 ? 'gold' : 'food');
    }
  }
}
