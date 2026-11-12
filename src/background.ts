// Visual-only background. It reads the distance travelled and nothing else, so it can
// never change collisions, scoring or course generation (model.ts is not touched).
import Phaser from 'phaser';

export interface BackgroundLayer {
  key: string;      // Phaser texture key
  url: string;      // horizontally tileable image
  top: number;      // y of the top edge in world coordinates (may be negative to cover camera lift)
  height: number;   // displayed height; width scales to keep the aspect ratio
  factor: number;   // scroll speed relative to the ground (0 = fixed, 1 = same as ground)
}
export interface BackgroundTheme {
  id: string;
  layers: BackgroundLayer[]; // far -> near
}

export const VIEW_WIDTH = 1120;

// Default background: grass field and the big tree plaza (candidate A).
// The art files are produced separately; until they exist the Graphics fallback is used.
export const DEFAULT_THEME: BackgroundTheme = {
  id: 'meadow',
  layers: [
    { key: 'bg-meadow-far', url: '/assets/bg/meadow-far.webp', top: -240, height: 700, factor: .08 },
    { key: 'bg-meadow-mid', url: '/assets/bg/meadow-mid.webp', top: -60, height: 520, factor: .2 },
    { key: 'bg-meadow-near', url: '/assets/bg/meadow-near.webp', top: 160, height: 300, factor: .38 },
  ],
};

// How far a texture has to scroll (in texture pixels) after the player moved `progress` screen pixels.
export function tileOffset(progress: number, factor: number, tileScale: number): number {
  return tileScale > 0 ? (progress * factor) / tileScale : 0;
}

export class Background {
  private sprites: Phaser.GameObjects.TileSprite[] = [];
  private active = false;
  constructor(private scene: Phaser.Scene, private theme: BackgroundTheme = DEFAULT_THEME) {}

  static preload(scene: Phaser.Scene, theme: BackgroundTheme = DEFAULT_THEME) {
    for (const l of theme.layers) scene.load.image(l.key, l.url);
  }
  // A missing background image must never block the game: callers ignore load errors for these keys.
  static owns(key: string, theme: BackgroundTheme = DEFAULT_THEME) {
    return theme.layers.some(l => l.key === key);
  }

  // Builds the layers behind everything already in `container`. Returns false (and builds nothing)
  // unless every layer texture loaded, so the Graphics fallback keeps drawing.
  build(container: Phaser.GameObjects.Container): boolean {
    const t = this.scene.textures;
    if (!this.theme.layers.every(l => t.exists(l.key) && t.get(l.key).key !== '__MISSING')) return false;
    this.theme.layers.forEach((l, n) => {
      const src = t.get(l.key).getSourceImage() as { width: number; height: number };
      const scale = l.height / src.height;
      const s = this.scene.add.tileSprite(0, l.top, Math.ceil(VIEW_WIDTH / scale), src.height, l.key)
        .setOrigin(0, 0).setScale(scale).setData('scale', scale);
      container.addAt(s, n);
      this.sprites.push(s);
    });
    this.active = true;
    return true;
  }
  get ready() { return this.active; }
  update(progress: number) {
    if (!this.active) return;
    this.theme.layers.forEach((l, n) => {
      const s = this.sprites[n];
      s.tilePositionX = tileOffset(progress, l.factor, s.getData('scale'));
    });
  }
}
