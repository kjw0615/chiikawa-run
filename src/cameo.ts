// Background live cameos: small animated characters that stand in the scenery now and then. Visual only: the schedule
// reads the distance travelled and nothing else, cameos have no collision and never touch model.ts, scoring or the course.
// The schedule is pure (no Phaser) so it can be tested; CameoLayer draws it into the scenery container.
import type Phaser from 'phaser';

export interface CameoKind { id: string; frame: string; frames: number; fps: number }
// Frame names in cameo-atlas.json are `${frame}-${n}`; fps is per character.
export const CAMEOS: readonly CameoKind[] = [
  { id: 'study-duo', frame: 'study-duo', frames: 4, fps: 4 },
  { id: 'usagi', frame: 'usagi-dance', frames: 6, fps: 7 },
  { id: 'kurimanju', frame: 'kurimanju-stump', frames: 4, fps: 4 },
  { id: 'pochette', frame: 'pochette-stall', frames: 4, fps: 4 },
  { id: 'pajama', frame: 'pajama-dance', frames: 4, fps: 6 },
];
export const CAMEO_RULES = {
  minGap: 150, maxGap: 250, // metres between two cameos (one cameo per gap)
  designWidth: 320, designHeight: 240, groundY: 230, // frames are authored on a 320x240 canvas standing on y=230
  leadMeters: 20,           // a cameo is placed this far beyond the right edge of the screen so it scrolls in
} as const;
export const CAMEO_ATLAS = 'cameo-art';

export interface CameoSpawn { kind: CameoKind; at: number } // `at`: distance in metres where it stands

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Decides where cameos stand: one every 150-250 m, never the same character twice in a row. Deterministic per seed. */
export class CameoSchedule {
  private rand: () => number;
  private last = -1;       // index of the previous cameo character
  private nextAt: number;
  private kinds: readonly CameoKind[];
  constructor(seed: number, kinds: readonly CameoKind[] = CAMEOS) {
    this.kinds = kinds; this.rand = mulberry(seed);
    this.nextAt = this.gap();
  }
  private gap() { return CAMEO_RULES.minGap + this.rand() * (CAMEO_RULES.maxGap - CAMEO_RULES.minGap); }
  /** Returns the cameos whose spot lies within `horizon` metres ahead of `distance` (usually zero or one), in order. */
  advance(distance: number, horizon: number): CameoSpawn[] {
    const out: CameoSpawn[] = [];
    while (this.nextAt <= distance + horizon) {
      const pool = this.kinds.map((_, n) => n).filter(n => n !== this.last);
      const pick = pool[Math.min(pool.length - 1, Math.floor(this.rand() * pool.length))];
      this.last = pick;
      out.push({ kind: this.kinds[pick], at: this.nextAt });
      this.nextAt += this.gap();
    }
    return out;
  }
}
/** Which frame to show: runs on game time (so it pauses with the game) at the character's own fps. */
export const cameoFrameIndex = (kind: CameoKind, seconds: number) => Math.floor(Math.max(0, seconds) * kind.fps) % kind.frames;

export class CameoLayer {
  private schedule = new CameoSchedule(Date.now());
  private active: { spawn: CameoSpawn; sprite: Phaser.GameObjects.Image }[] = [];
  private lastDistance = 0;
  private scene: Phaser.Scene; private container: Phaser.GameObjects.Container;
  constructor(scene: Phaser.Scene, container: Phaser.GameObjects.Container) { this.scene = scene; this.container = container; }
  /** True only when the atlas loaded and holds every frame; otherwise cameos are simply not drawn. */
  get ready() {
    const t = this.scene.textures;
    return t.exists(CAMEO_ATLAS) && t.get(CAMEO_ATLAS).key !== '__MISSING' && CAMEOS.every(k => { const tex = t.get(CAMEO_ATLAS); for (let n = 0; n < k.frames; n++) if (!tex.has(`${k.frame}-${n}`)) return false; return true; });
  }
  /** Call every frame with the metres travelled, the pixels per metre, the player's screen x, the floor y and the game clock. */
  update(distance: number, scale: number, center: number, floor: number, seconds: number, viewWidth: number) {
    if (!this.ready) return;
    if (distance < this.lastDistance - 1) this.reset(Date.now()); // a new run starts from 0 again
    this.lastDistance = distance;
    const horizon = (viewWidth - center) / scale + CAMEO_RULES.leadMeters;
    for (const spawn of this.schedule.advance(distance, horizon)) {
      const sprite = this.scene.add.image(0, 0, CAMEO_ATLAS, `${spawn.kind.frame}-0`).setOrigin(.5, CAMEO_RULES.groundY / CAMEO_RULES.designHeight);
      const k = CAMEO_RULES.designWidth / sprite.frame.realWidth; // frames of any pixel size are shown on the 320-wide design canvas
      sprite.setScale(k);
      this.container.add(sprite);
      this.active.push({ spawn, sprite });
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const { spawn, sprite } = this.active[i];
      const x = center + (spawn.at - distance) * scale;
      if (x < -CAMEO_RULES.designWidth) { sprite.destroy(); this.active.splice(i, 1); continue; }
      sprite.setPosition(x, floor).setFrame(`${spawn.kind.frame}-${cameoFrameIndex(spawn.kind, seconds)}`);
    }
  }
  reset(seed: number) { for (const a of this.active) a.sprite.destroy(); this.active = []; this.schedule = new CameoSchedule(seed); this.lastDistance = 0; }
}
